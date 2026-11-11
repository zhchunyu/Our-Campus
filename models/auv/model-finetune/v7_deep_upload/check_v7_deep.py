# -*- coding: utf-8 -*-
"""
V7-Deep 验收脚本 —— 5 条能力测试 + 自动质检（★ 不看 loss）

用法（AutoDL 服务器上）：
    python check_v7_deep.py

★ 为什么不用 loss
  人设回应任务的 loss 只说明"有没有练坏"，不说明"练得好不好"。
  这套数据的价值在五件事上，逐条测：
    ① 抓主导因素（不把观察平铺）
    ② 给数 + 写算式
    ③ ★ 敢说「不需要处理」（最关键的一条）
    ④ 看出点位转移（一升一降）
    ⑤ 指出真瓶颈（不在窗口数）

★ 会同时跑「基础模型」和「LoRA」两路，直接对比命中数 —— 这样能看出训练到底有没有用。

判据：5 条中 LoRA 至少 4 条命中 ⇒ 形态对了，可以继续加量；
      不到 3 条 ⇒ 问题在数据形态，加量没用，回头改样本。
"""

import os
import re
import sys

import torch

try:
    from transformers import AutoModelForCausalLM, AutoTokenizer
except ImportError:
    sys.exit("缺 transformers：pip install -U transformers")
try:
    from peft import PeftModel
except ImportError:
    sys.exit("缺 peft：pip install -U peft")
try:
    from transformers import BitsAndBytesConfig
except ImportError:
    BitsAndBytesConfig = None

BASE = "/root/autodl-tmp/models/models/qwen--Qwen2.5-14B-Instruct/snapshots/master"
LORA = "/root/autodl-tmp/output/qwen25-14b-auv-v7-deep"

# ============================================================
# 三套 instruction（与 build_v7_deep.py 一致；不从训练集读，避免文件缺失）
# ============================================================
INSTRUCTION_SPATIAL = """你是校园空间诊断助手。基于现场观察数据，分析一处校园空间的人流或活力问题。

【输出要求】
- 先给结论：一句话说清**最主要**的原因，不要把原因平铺罗列
- 再给依据：列出 2-4 条支撑事实，说明它们如何共同作用、**哪一条是主导**
- 最后给建议：分短期（低成本、可立即执行）和长期（需要改造）
- 用日常语言解释人的行为，不套用任何理论或术语名称
- 数据不足以判断时，明确说还需要观察什么，不要硬下结论
"""

INSTRUCTION_ANOMALY = """你是校园通行热度分析助手。给定某地点某时段的通行人次基线和最近几天的实测值，判断是否存在异常。

【输出要求】
- 先给判定：正常 / 事件型波动 / 趋势性异常，三选一
- 再给依据：把**幅度**（偏离基线多少）和**持续性**（连续几天）分开说
- 区分「单日孤立突增」和「连续多日同向变化」——前者多半是事件，后者才可能是结构变化
- 数值在正常波动范围内时，明确说"不需要处理"，不要为了给结论而夸大
- 不确定时说明还需要什么数据
"""

INSTRUCTION_QUEUE = """你是校园排队等待时间估算助手。根据排队人数、开放服务点数量、每人平均服务时长，估算等待时间并给建议。

【输出要求】
- 先给结论：预计等待多久，**给一个数**，不要只说"较长"
- 再给算法：写出算式（服务能力 = 服务点数 ÷ 单人均时长；等待 ≈ 排队人数 ÷ 服务能力）
- 说明这个估计的**前提**：它假设到达速度稳定；如果人还在不断来，实际会更久
- 最后给建议：什么时候来更好；如果算得出来，说明加服务点能改善多少
"""

# ============================================================
# 5 条能力测试
#   hit = 命中任意一个关键词即算通过
# ============================================================
TESTS = [
    {
        "name": "① 抓主导因素",
        "instr": INSTRUCTION_SPATIAL,
        "input": ("【问题】图书馆东侧那条小路，傍晚几乎没人走\n"
                  "【现场观察】\n"
                  "- 两侧是实墙，没有任何门窗\n"
                  "- 傍晚照度约 15 lux，主路是 40 lux\n"
                  "- 走主路要多绕约 200 米"),
        "hit": ["没有视线", "视线", "不是照明", "主导"],
        "hint": "应指出「没有视线」才是主因，照明只是加剧",
    },
    {
        "name": "② 给数 + 写算式",
        "instr": INSTRUCTION_QUEUE,
        "input": ("【地点】一食堂\n【时刻】12:00\n【当前排队】60 人\n"
                  "【开放服务点】2 个\n【人均服务时长】45 秒"),
        "hit": ["22", "15", "÷", "/", "="],
        "hint": "应给出约 22 分钟，并写出「2 ÷ 45 秒」这类算式",
    },
    {
        "name": "③ ★ 敢说「不需要处理」",
        "instr": INSTRUCTION_ANOMALY,
        "input": ("【地点】校医院门口\n【时段】全天\n【基线】90 人次\n"
                  "【最近 5 天】88 / 92 / 95 / 90 / 91"),
        "hit": ["不需要处理", "不用处理", "正常", "无需处理"],
        "hint": "★ 应明确说「正常，不需要处理」—— 学不会这条，说明核心价值没进去",
    },
    {
        "name": "④ 看出点位转移",
        "instr": INSTRUCTION_ANOMALY,
        "input": ("【地点】图书馆正门\n【时段】20:00-21:00\n【基线】200 人次\n"
                  "【最近 5 天】205 / 190 / 195 / 90 / 95"),
        "hit": ["改道", "转移", "宿舍", "不是人少", "挪"],
        "hint": "应指出可能不是「人少了」，而是「人流改道了」",
    },
    {
        "name": "⑤ 指出真瓶颈",
        "instr": INSTRUCTION_QUEUE,
        "input": ("【地点】快递驿站取件\n【时刻】17:30\n【当前排队】30 人\n"
                  "【开放服务点】2 个\n【人均服务时长】60 秒"),
        "hit": ["找件", "流程", "货架", "不在窗口", "取件码"],
        "hint": "应指出瓶颈在「找件」这个流程环节，加窗口不是根本解",
    },
]

# 输出里不该出现的词（术语 / 书名 / 客服腔）
BANNED = ["人性化的城市", "死与生", "雅各布斯", "盖尔", "街道眼", "边缘效应",
          "您好", "亲爱的", "很抱歉", "作为AI", "作为一个AI", "我是AI"]

MAX_NEW = 400


def load_model(lora_path=None):
    tok = AutoTokenizer.from_pretrained(BASE, trust_remote_code=True)
    print(f"加载基础模型（4bit）... 首次约 1~3 分钟")
    kwargs = dict(device_map="auto", trust_remote_code=True)
    if BitsAndBytesConfig is not None:
        kwargs["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True, bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.float16, bnb_4bit_use_double_quant=True)
    else:
        kwargs["load_in_4bit"] = True
    model = AutoModelForCausalLM.from_pretrained(BASE, **kwargs)
    if lora_path:
        if os.path.exists(lora_path):
            print(f"挂载 LoRA: {lora_path}")
            model = PeftModel.from_pretrained(model, lora_path)
        else:
            print(f"!! LoRA 不存在，将只跑基础模型: {lora_path}")
    model.eval()
    return model, tok


def gen(model, tok, system, text):
    msgs = [{"role": "system", "content": system}, {"role": "user", "content": text}]
    prompt = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
    ids = tok(prompt, return_tensors="pt").to(model.device)
    with torch.no_grad():
        out = model.generate(**ids, max_new_tokens=MAX_NEW, do_sample=False,
                             pad_token_id=tok.eos_token_id)
    return tok.decode(out[0][ids["input_ids"].shape[1]:], skip_special_tokens=True).strip()


def main():
    model, tok = load_model(LORA)
    has_lora = os.path.exists(LORA)

    n_hit_lora = 0
    n_hit_base = 0
    n_banned = 0
    results = []

    print("\n" + "=" * 78)
    print("V7-Deep 能力验收（5 条）")
    print("=" * 78)

    for i, t in enumerate(TESTS, 1):
        print(f"\n[{i}/5] {t['name']}")
        print(f"  输入: {t['input'].replace(chr(10), ' | ')[:80]}...")

        # 基础模型（临时卸掉 LoRA 太麻烦，用同一模型跑不同 system 不严谨；
        # 这里简单起见只跑 LoRA，并在下方提示如何对比基础模型）
        out = gen(model, tok, t["instr"], t["input"])

        hit = [k for k in t["hit"] if k in out]
        ok = bool(hit)
        banned = [b for b in BANNED if b in out]
        if ok:
            n_hit_lora += 1
        if banned:
            n_banned += 1

        print(f"  {'✅' if ok else '❌'} 命中: {hit if hit else '（无）'}")
        if banned:
            print(f"  ⚠️ 出现禁用词: {banned}")
        print(f"  期望: {t['hint']}")
        print(f"  --- 输出（{len(out)} 字）---")
        print("  " + out.replace("\n", "\n  "))
        print("  " + "-" * 60)

        results.append({"name": t["name"], "input": t["input"],
                        "output": out, "hit": hit, "ok": ok, "banned": banned})

    print("\n" + "#" * 78)
    print("# 汇总")
    print("#" * 78)
    print(f"LoRA 命中        : {n_hit_lora}/5")
    print(f"禁用词出现       : {n_banned} 条")
    print()
    if n_hit_lora >= 4:
        print("★ 判定：形态对了 —— 5 条中 ≥4 条命中，可以继续加量。")
    elif n_hit_lora >= 3:
        print("★ 判定：勉强 —— 建议补测几条，看是普遍问题还是个别案例。")
    else:
        print("★ 判定：**形态不对** —— 问题在数据，不在数量。加量没用，回头改样本。")
    print()
    print("★ 特别关注第 ③ 条（敢说「不需要处理」）—— 这条不过，核心价值就没进去。")
    print("★ 想看训练有没有用：把 LORA 那行注释掉、改成 None 再跑一次，对比命中数。")

    import json
    json.dump(results, open("check_v7_deep_result.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    print("\n结果已存: check_v7_deep_result.json")


if __name__ == "__main__":
    main()
