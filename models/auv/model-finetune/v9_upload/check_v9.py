# -*- coding: utf-8 -*-
"""
V9 提取 LoRA 验收脚本 —— 看 JSON 可解析率 + type 准确率（不是看 loss）

用法（AutoDL 服务器上）：
    python check_v9.py

若报 load_in_4bit 之类错误，说明 transformers 版本较新 —— 本脚本已用
BitsAndBytesConfig，兼容新旧版本。
"""

import json
import sys

import torch

# ---------- 依赖导入（给清晰报错，别让它甩一堆 traceback）----------
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
LORA = "/root/autodl-tmp/output/qwen25-14b-auv-v9-extract"
TRAIN_JSON = "/root/autodl-tmp/data/v9_extract_train.json"

# ============================================================
# ★★ V9 测试用例（4 类 + 重点验证"没提地点要 null"）
#
# 前 4 条：4 类各自的正常提取
# 中 2 条：★ V9 核心修复目标 —— 输入没提地点，building_name 必须是 null
# 后 2 条：故意不该成功的（属 V7 / 论坛，不是提取任务）
# ============================================================
TESTS = [
    # —— 4 类各一条（该成功）——
    ("第一食堂现在人多到爆，队都排到门口了", "congestion", "第一食堂"),
    ("图书馆三楼空调外机看着要掉",           "safety",     "图书馆"),
    ("宿舍楼下洗衣机全是坏的，一个能用的都没有", "service",  None),
    ("大学生活动中心下周有创业分享会，感兴趣的可以报名", "notice", "大学生活动中心"),
    # —— ★★ V9 核心目标：没提地点 → null ——
    ("英语角开始报名了，截止到本周日，要报的抓紧", "notice", "NULL"),
    ("有人晕倒了，快来人",                     "safety",  "NULL"),
    # —— 故意不该成功的（不属提取任务）——
    ("有没有人今晚一起去操场跑步的",           "非提取任务(互助)", None),
    ("感觉这学期什么活动都没赶上，有点失落",    "非提取任务(情绪)", None),
]

MAX_NEW = 256


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
    # instruction 从训练集取，保证与训练时完全一致
    try:
        instr = json.load(open(TRAIN_JSON, encoding="utf-8"))[0]["instruction"]
    except Exception as e:
        print(f"⚠️ 读不到 {TRAIN_JSON}（{e}）—— instruction 将留空")
        instr = ""

    model, tok = load_model()

    n_json_ok = 0
    n_type_ok = 0
    n_extract_cases = 4          # 前 4 条是 4 类各一条的正常提取
    n_null_cases = 2             # 第 5~6 条：验证"没提地点→null"
    n_null_ok = 0
    n_gen_back = 0
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
                do_sample=False,          # 验收用贪心，保证可复现
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

        # ---- 判据 1：JSON 可解析 ----
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
            rec["got_type"] = got_type
            rec["got_building"] = got_bld
            print(f"     type={got_type}  severity={parsed.get('severity')}  "
                  f"building={got_bld}")

            # ---- 判据 2：type 准确（前 4 条）----
            if i <= n_extract_cases:
                if got_type == expect:
                    n_type_ok += 1
                    print("  ✅ type 正确")
                else:
                    print(f"  ❌ type 应为 {expect}，实为 {got_type}")

            # ---- ★★ 判据 3：没提地点时要 null（第 5~6 条）----
            if n_extract_cases < i <= n_extract_cases + n_null_cases:
                if got_bld is None:
                    n_null_ok += 1
                    print("  ✅ 正确输出 null（没提地点，不编造）")
                else:
                    print(f"  ❌ 应为 null，却编造了 {got_bld!r}")

            # ---- 判据 4：description 套话回潮 ----
            desc = parsed.get("description", "")
            GENERIC = ("存在安全隐患", "服务调整", "请注意时间安排", "互助信息发布")
            if any(g in desc for g in GENERIC):
                n_gen_back += 1
                print(f"  ⚠️ description 套话回潮: {desc}")
                rec["generic_back"] = True

        results.append(rec)

    # ==================== 汇总 ====================
    print("\n" + "#" * 64)
    print("# 汇总")
    print("#" * 64)
    print(f"JSON 可解析率    : {n_json_ok}/{len(TESTS)} = "
          f"{n_json_ok / len(TESTS) * 100:.0f}%   (判据 ≥ 90%)")
    print(f"type 准确率      : {n_type_ok}/{n_extract_cases} = "
          f"{n_type_ok / n_extract_cases * 100:.0f}%   （4 类各一条）")
    print(f"★ null 正确率    : {n_null_ok}/{n_null_cases} = "
          f"{n_null_ok / n_null_cases * 100:.0f}%   （V9 核心目标：没提地点不编造）")
    print(f"description 套话 : {n_gen_back} 条回潮")
    print()
    print("★ 判据说明：")
    print("  ① JSON 可解析率 ≥ 90% —— 否则模板没学牢")
    print("  ② type 准确 —— 提取 LoRA 的核心能力")
    print("  ③ ★ null 正确率 —— V9 专门修的：V8 会凭空编建筑名")
    print("  ④ 后 2 条（跑步搭子/情绪低落）不属提取任务（应走论坛/V7），别算进来")

    json.dump(results, open("check_v9_result.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    print("\n结果已存: check_v9_result.json")


if __name__ == "__main__":
    main()
