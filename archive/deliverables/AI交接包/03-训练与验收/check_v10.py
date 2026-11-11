# -*- coding: utf-8 -*-
"""
V10 提取 LoRA 验收脚本 —— 看 JSON 可解析率 + type 准确率 + ★地点合法性
（不是看 loss —— 提取任务的 eval_loss 是模板化 JSON 的产物，不反映质量）

用法（AutoDL 服务器上）：
    python check_v10.py

★ V10 相比 V9 新增第 5 条判据：
    **地点必须落在「校园地点权威表」里**，且 building_id 与权威表一致。
    这是 V10 的核心目标 —— 旧校区那套建筑名要彻底消失。

若报 load_in_4bit 之类错误，说明 transformers 版本较新 —— 本脚本已用
BitsAndBytesConfig，兼容新旧版本。
"""

import json
import os
import sys

import torch

try:
    from transformers import AutoModelForCausalLM, AutoTokenizer
except ImportError:
    sys.exit("缺 transformers，先跑：pip install -U transformers")

try:
    from peft import PeftModel
except ImportError:
    sys.exit("缺 peft，先跑：pip install -U peft")

try:
    from transformers import BitsAndBytesConfig
except ImportError:
    BitsAndBytesConfig = None

# ============================================================
BASE = "/root/autodl-tmp/models/models/qwen--Qwen2.5-14B-Instruct/snapshots/master"
LORA = "/root/autodl-tmp/output/qwen25-14b-auv-v10-extract"
TRAIN_JSON = "/root/autodl-tmp/data/v10_extract_train.json"
LOCATIONS = "/root/autodl-tmp/campus_locations.json"

# ============================================================
# ★★ V10 测试用例
#
# 分三组：
#   A 组（6 条）：用**权威表里的地点**报事，验证地点识别 + 换名是否生效
#   B 组（2 条）：没提地点 → 必须 null
#   C 组（2 条）：不属提取任务（互助 / 情绪）
# ============================================================
TESTS = [
    # —— A 组：权威表地点（该识别 + type 正确）——
    ("谷园餐厅现在人多到爆，队都排到门口了",       "congestion", "谷园餐厅"),
    ("图书馆三楼空调外机看着要掉",                "safety",     "图书馆"),
    ("3号公寓楼楼下洗衣机全是坏的，一个能用的都没有", "service",   "3号公寓楼"),
    ("崇文楼下周有创业分享会，感兴趣的可以报名",    "notice",     "崇文楼"),
    ("睿智文体馆羽毛球场地今晚约满了",             "congestion", "睿智文体馆"),
    ("实验大楼门口自行车乱停，都堵住路了",         "congestion", "实验大楼"),
    # —— B 组：没提地点 → null ——
    ("英语角开始报名了，截止到本周日，要报的抓紧",  "notice", "NULL"),
    ("有人晕倒了，快来人",                       "safety",  "NULL"),
    # —— C 组：故意不该成功的（不属提取任务）——
    ("有没有人今晚一起去操场跑步的",              "非提取任务(互助)", None),
    ("感觉这学期什么活动都没赶上，有点失落",       "非提取任务(情绪)", None),
]

MAX_NEW = 256
N_A = 6   # A 组条数
N_B = 2   # B 组条数


def load_locations():
    """载入权威表，用于判据 5（地点合法性）"""
    if not os.path.exists(LOCATIONS):
        print(f"⚠️ 找不到权威表 {LOCATIONS}")
        print("   ⇒ 判据5（地点合法率）将**跳过**，不会被算成幻觉。")
        print("   修法：把 campus_locations.json 传到 /root/autodl-tmp/ 后重跑。")
        return None
    d = json.load(open(LOCATIONS, encoding="utf-8"))
    by_name, by_id = {}, {}
    for l in d["locations"]:
        by_name[l["name"]] = l
        by_id[l["id"]] = l
        for a in l.get("aliases", []):
            by_name.setdefault(a, l)
    print(f"权威表载入: {len(d['locations'])} 个地点")
    return {"by_name": by_name, "by_id": by_id, "all_names": set(l["name"] for l in d["locations"])}


def load_model():
    print("加载 tokenizer ...")
    tok = AutoTokenizer.from_pretrained(BASE, trust_remote_code=True)

    print("加载基础模型（4bit）... 首次约 1~3 分钟")
    kwargs = dict(device_map="auto", trust_remote_code=True)
    if BitsAndBytesConfig is not None:
        kwargs["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.float16,
            bnb_4bit_use_double_quant=True,
        )
    else:
        kwargs["load_in_4bit"] = True  # 老版本兜底

    model = AutoModelForCausalLM.from_pretrained(BASE, **kwargs)

    print(f"挂载 LoRA: {LORA}")
    model = PeftModel.from_pretrained(model, LORA)
    model.eval()
    return model, tok


def main():
    locs = load_locations()

    try:
        instr = json.load(open(TRAIN_JSON, encoding="utf-8"))[0]["instruction"]
    except Exception as e:
        print(f"⚠️ 读不到 {TRAIN_JSON}（{e}）—— instruction 将留空")
        instr = ""

    model, tok = load_model()

    n_json_ok = 0
    n_type_ok = 0
    n_null_ok = 0
    n_loc_valid = 0
    n_loc_checked = 0
    n_loc_wrong = 0
    results = []

    for i, (text, expect, exp_bld) in enumerate(TESTS, 1):
        msgs = []
        if instr:
            msgs.append({"role": "system", "content": instr})
        msgs.append({"role": "user", "content": text})
        prompt = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)

        ids = tok(prompt, return_tensors="pt").to(model.device)
        with torch.no_grad():
            out = model.generate(
                **ids,
                max_new_tokens=MAX_NEW,
                do_sample=False,
                pad_token_id=tok.eos_token_id,
            )
        gen_text = tok.decode(out[0][ids["input_ids"].shape[1]:],
                              skip_special_tokens=True).strip()

        print("\n" + "=" * 64)
        print(f"[{i}/{len(TESTS)}] 输入: {text}")
        print(f"      期望 type={expect}  building={exp_bld}")
        print("-" * 64)
        print(gen_text)
        print("-" * 64)

        rec = {"input": text, "expect": expect, "exp_building": exp_bld,
               "output": gen_text}

        parsed = None
        try:
            parsed = json.loads(gen_text)
            n_json_ok += 1
            print("  ✅ JSON 可解析")
        except Exception as e:
            print(f"  ❌ JSON 解析失败: {e}")
            s, e2 = gen_text.find("{"), gen_text.rfind("}")
            if s != -1 and e2 > s:
                try:
                    parsed = json.loads(gen_text[s:e2 + 1])
                    print("     （截取首尾花括号后可解析 ⇒ 加了多余前后缀，需约束）")
                except Exception:
                    pass

        if parsed:
            got_type = parsed.get("type")
            got_bld = parsed.get("building_name")
            got_id = parsed.get("building_id")
            rec.update(got_type=got_type, got_building=got_bld, got_id=got_id)
            print(f"     type={got_type}  severity={parsed.get('severity')}  "
                  f"building={got_bld}  id={got_id}")

            # ---- 判据 2：type 准确（A 组）----
            if i <= N_A:
                if got_type == expect:
                    n_type_ok += 1
                    print("  ✅ type 正确")
                else:
                    print(f"  ❌ type 应为 {expect}，实为 {got_type}")

            # ---- 判据 3：没提地点要 null（B 组）----
            if N_A < i <= N_A + N_B:
                if got_bld is None:
                    n_null_ok += 1
                    print("  ✅ 正确输出 null（没提地点，不编造）")
                else:
                    print(f"  ❌ 应为 null，却编造了 {got_bld!r}")

            # ---- ★★ 判据 5：地点必须落在权威表里（V10 新增）----
            # ★★ 权威表缺失时必须**跳过**，不能当成幻觉 ——
            #    否则「找不到表」会被误报成「地点全是幻觉」（曾实际踩到，6 条全中招）
            if i <= N_A and got_bld:
                if not locs:
                    print(f"  ⚠️ 权威表未载入 ⇒ 跳过地点合法性判定: {got_bld!r}")
                else:
                    n_loc_checked += 1
                    hit = locs["by_name"].get(got_bld)
                    if hit:
                        n_loc_valid += 1
                        print(f"  ✅ 地点在权威表内: {hit['name']} (id={hit['id']})")
                        if got_id and got_id != hit["id"]:
                            print(f"  ⚠️ building_id 与权威表不符: 输出 {got_id}，应为 {hit['id']}")
                            rec["id_mismatch"] = True
                    else:
                        n_loc_wrong += 1
                        print(f"  ❌ 地点不在权威表内（幻觉）: {got_bld!r}")
                        rec["loc_hallucinated"] = True

            # ---- 判据 4：description 套话回潮 ----
            desc = parsed.get("description", "")
            GENERIC = ("存在安全隐患", "服务调整", "请注意时间安排", "互助信息发布")
            if any(g in desc for g in GENERIC):
                print(f"  ⚠️ description 套话回潮: {desc}")
                rec["generic_back"] = True

        results.append(rec)

    print("\n" + "#" * 64)
    print("# 汇总")
    print("#" * 64)
    print(f"JSON 可解析率    : {n_json_ok}/{len(TESTS)} = "
          f"{n_json_ok / len(TESTS) * 100:.0f}%   (判据 ≥ 90%)")
    print(f"type 准确率      : {n_type_ok}/{N_A} = "
          f"{n_type_ok / N_A * 100:.0f}%   （A 组 {N_A} 条）")
    print(f"null 正确率      : {n_null_ok}/{N_B} = "
          f"{n_null_ok / N_B * 100:.0f}%   （没提地点不编造）")
    if locs:
        print(f"★ 地点合法率    : {n_loc_valid}/{n_loc_checked} = "
              f"{(n_loc_valid / n_loc_checked * 100) if n_loc_checked else 0:.0f}%   "
              f"（V10 核心目标：旧校区建筑名必须消失）")
    print()
    print("★ 判据说明：")
    print("  ① JSON 可解析率 ≥ 90% —— 否则模板没学牢")
    print("  ② type 准确 —— 提取 LoRA 的核心能力")
    print("  ③ null 正确率 —— 文本没提地点时要输出 null")
    print("  ④ ★ 地点合法率 —— V10 专门修的：地点必须出自权威表，不能编造")
    print("  ⑤ C 组 2 条（跑步搭子/情绪低落）不属提取任务，不算进指标")

    json.dump(results, open("check_v10_result.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    print("\n结果已存: check_v10_result.json")


if __name__ == "__main__":
    main()
