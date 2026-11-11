# -*- coding: utf-8 -*-
"""
LoRA 效果对比脚本 —— 不看 loss，直接看输出质量

用法（在 AutoDL 上跑）：
    # 1. 先装依赖（一般已装）
    pip install peft transformers accelerate

    # 2. 基础模型 vs 训练后 LoRA 的对比
    python eval_output.py \
        --base /root/autodl-tmp/models/models/qwen--Qwen2.5-14B-Instruct/snapshots/master \
        --lora /root/autodl-tmp/output/qwen25-14b-auv-v7

    # 3. 只测 LoRA（不跑 base，快一倍）
    python eval_output.py --base ... --lora ... --skip-base

    # 4. 只测前 5 条
    python eval_output.py --base ... --lora ... --limit 5

判据（人设回应 LoRA）：
    ✅ 输出是自然中文，不是 【思考】/JSON/术语堆砌
    ✅ 没有书名（"金字塔原理""系统1"）
    ✅ 回应里有具体动作（不是"建议错峰"这种空话）
    ✅ 语气贴合"校园同伴"而非"客服/教科书"
"""

import argparse
import json
import os
import sys

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

# ★ 新版本 transformers 不再接受 load_in_4bit 直接参数，必须走 BitsAndBytesConfig
try:
    from transformers import BitsAndBytesConfig
except ImportError:
    BitsAndBytesConfig = None

# ============================================================
# ★ 测试用例 —— 改这里
# 挑的是「训练集里没有、风格相似」的输入，才检验得出泛化
# ============================================================
CASES = [
    # 拥堵类
    "第一食堂现在人多到爆，队都排到门口了",
    # 安全类
    "图书馆三楼那个窗户外面的空调外机看着要掉，挺吓人的",
    # 通知类
    "听说下周三下午有消防演练，会拉警报",
    # 服务类
    "宿舍楼下洗衣机全是坏的，一个能用的都没有",
    # 互助类
    "有没有人今晚一起去操场跑步的，我一个人有点无聊",
    # 情绪类（人设最能体现的地方）
    "烦死了，每次早八都抢不到座",
    # 情绪类（低落）
    "感觉这学期什么活动都没赶上，有点失落",
    # 空间诊断类（这是 V7 新增的能力）
    "报告厅那个位置坐最后排根本看不清屏幕，而且出口就一个，散场好挤",
    # 反问/追问类
    "为什么每次下雨天食堂就更挤了？",
    # 边界：信息不足
    "图书馆那边好像有点情况",
]

SYSTEM_PROMPT = None  # 若数据集里 instruction 是系统提示，这里保持一致


def load(base, lora=None, merge=False):
    print(f"加载 tokenizer ...")
    tok = AutoTokenizer.from_pretrained(base, trust_remote_code=True)

    print(f"加载基础模型（4bit）...")
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
    model = AutoModelForCausalLM.from_pretrained(base, **kwargs)

    if lora:
        print(f"挂载 LoRA: {lora}")
        model = PeftModel.from_pretrained(model, lora)
        if merge:
            model = model.merge_and_unload()

    model.eval()
    return model, tok


def build_prompt(tok, user_input, instruction=None):
    """和训练时的模板保持一致：instruction 作为 system，input 作为 user"""
    messages = []
    if instruction:
        messages.append({"role": "system", "content": instruction})
    messages.append({"role": "user", "content": user_input})
    return tok.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True
    )


def gen(model, tok, user_input, instruction=None, max_new=512):
    prompt = build_prompt(tok, user_input, instruction)
    ids = tok(prompt, return_tensors="pt").to(model.device)
    with torch.no_grad():
        out = model.generate(
            **ids,
            max_new_tokens=max_new,
            do_sample=True,
            temperature=0.7,
            top_p=0.9,
            repetition_penalty=1.05,
            pad_token_id=tok.pad_token_id or tok.eos_token_id,
        )
    text = tok.decode(out[0][ids["input_ids"].shape[1]:], skip_special_tokens=True)
    return text.strip()


def quality_flags(text):
    """自动质检 —— 只做机械判据，语义还得人看"""
    flags = []
    if "【思考】" in text or "【回应】" in text:
        flags.append("❌ 含思考链标记")
    if "金字塔原理" in text or "系统1" in text or "《" in text:
        flags.append("❌ 含书名")
    if text.strip().startswith("{") or text.strip().startswith("["):
        flags.append("⚠️ 输出像 JSON（提取 LoRA 串味了）")
    if len(text) < 20:
        flags.append("⚠️ 输出过短")
    if "作为一个AI" in text or "作为AI" in text:
        flags.append("❌ 破功（说自己是 AI）")
    return flags


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--lora", default=None)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--skip-base", action="store_true", help="跳过基础模型对比")
    ap.add_argument("--out", default="eval_output_result.json")
    args = ap.parse_args()

    # instruction 从测试集里取，保证和训练完全一致
    instruction = None
    for cand in ("v7_eval.json", "v7_train.json",
                 "/root/autodl-tmp/data/v7_eval.json"):
        if os.path.exists(cand):
            data = json.load(open(cand, encoding="utf-8"))
            instruction = data[0]["instruction"]
            print(f"instruction 取自 {cand}")
            break
    if not instruction:
        print("⚠️ 没找到 v7_eval.json，将不带 instruction 测试")

    cases = CASES[: args.limit] if args.limit else CASES

    results = []
    base_model = base_tok = None
    if not args.skip_base:
        base_model, base_tok = load(args.base)

    lora_model = lora_tok = None
    if args.lora:
        lora_model, lora_tok = load(args.base, args.lora)

    for i, case in enumerate(cases, 1):
        print("\n" + "=" * 70)
        print(f"[{i}/{len(cases)}] 输入: {case}")
        print("=" * 70)

        rec = {"input": case}

        if base_model:
            b = gen(base_model, base_tok, case, instruction)
            rec["base"] = b
            print(f"\n--- 基础模型 ---\n{b}")

        if lora_model:
            l = gen(lora_model, lora_tok, case, instruction)
            rec["lora"] = l
            print(f"\n--- LoRA 微调后 ---\n{l}")
            fl = quality_flags(l)
            rec["flags"] = fl
            if fl:
                print(f"\n质检: {' / '.join(fl)}")
            else:
                print("\n质检: ✅ 机械判据通过")

        results.append(rec)

    json.dump(results, open(args.out, "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    print(f"\n\n结果已存: {args.out}")
    print("\n★ 机械判据只挡明显的坏，真正好不好还得你逐条读 —— 重点看：")
    print("  1. 有没有具体动作（vs '建议错峰' 这类空话）")
    print("  2. 语气像不像校园同伴（vs 客服腔）")
    print("  3. LoRA 相比 base 有没有明显变好，还是变啰嗦了")


if __name__ == "__main__":
    main()
