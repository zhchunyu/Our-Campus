# -*- coding: utf-8 -*-
"""
V8 提取 LoRA 验收脚本 —— 看 JSON 可解析率 + type 准确率（不是看 loss）

用法（AutoDL 服务器上）：
    python check_v8.py

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
LORA = "/root/autodl-tmp/output/qwen25-14b-auv-v8-extract"
TRAIN_JSON = "/root/autodl-tmp/data/v8_extract_train.json"

# ★ 6 条测试，前 4 条是「提取任务的分内事」，后 2 条是「故意不该成功」的
TESTS = [
    # —— 该成功的 4 条 ——
    ("第一食堂现在人多到爆，队都排到门口了", "congestion"),
    ("图书馆三楼空调外机看着要掉",           "safety"),
    ("宿舍楼下洗衣机全是坏的，一个能用的都没有", "service"),
    ("下周三下午有消防演练，会拉警报",        "notice"),
    # —— 故意不该成功的 2 条（属 V7 人设回应的活，不是提取任务）——
    ("有没有人今晚一起去操场跑步的",          "mutual(可接受)"),
    ("感觉这学期什么活动都没赶上，有点失落",   "非事件(应失败/怪)"),
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
    n_extract_cases = 4          # 前 4 条才算提取任务的分
    results = []

    for i, (text, expect) in enumerate(TESTS, 1):
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
        print(f"      期望 type: {expect}")
        print("-" * 64)
        print(gen_text)
        print("-" * 64)

        rec = {"input": text, "expect": expect, "output": gen_text}

        # ---- 判据 1：JSON 可解析 ----
        parsed = None
        try:
            parsed = json.loads(gen_text)
            n_json_ok += 1
            print("  ✅ JSON 可解析")
        except Exception as e:
            print(f"  ❌ JSON 解析失败: {e}")
            # 常见原因：模型在 JSON 前后加了话
            s, e2 = gen_text.find("{"), gen_text.rfind("}")
            if s != -1 and e2 > s:
                try:
                    parsed = json.loads(gen_text[s:e2 + 1])
                    print("     （但截取首尾花括号后可解析 ⇒ 加了多余前后缀，需约束）")
                except Exception:
                    pass

        if parsed:
            got_type = parsed.get("type")
            rec["got_type"] = got_type
            print(f"     type={got_type}  severity={parsed.get('severity')}  "
                  f"building={parsed.get('building_name')}")
            # ---- 判据 2：type 准确（只算前 4 条）----
            if i <= n_extract_cases:
                if got_type == expect:
                    n_type_ok += 1
                    print("  ✅ type 正确")
                else:
                    print(f"  ❌ type 应为 {expect}，实为 {got_type}")

            # ---- 判据 3：description 套话回潮 ----
            desc = parsed.get("description", "")
            GENERIC = ("存在安全隐患", "服务调整", "请注意时间安排", "互助信息发布")
            if any(g in desc for g in GENERIC):
                print(f"  ⚠️ description 套话回潮: {desc}")
                rec["generic_back"] = True

        results.append(rec)

    # ==================== 汇总 ====================
    print("\n" + "#" * 64)
    print("# 汇总")
    print("#" * 64)
    print(f"JSON 可解析率 : {n_json_ok}/{len(TESTS)} "
          f"= {n_json_ok / len(TESTS) * 100:.0f}%   (判据 ≥ 90%)")
    print(f"type 准确率   : {n_type_ok}/{n_extract_cases} "
          f"= {n_type_ok / n_extract_cases * 100:.0f}%   （仅算前 {n_extract_cases} 条提取任务）")
    print()
    print("★ 提醒：后 2 条（跑步搭子 / 情绪低落）本来就该失败或输出奇怪——")
    print("  那是 V7 人设回应 LoRA 的活，不要算进提取 LoRA 的成绩。")

    json.dump(results, open("check_v8_result.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    print("\n结果已存: check_v8_result.json")


if __name__ == "__main__":
    main()
