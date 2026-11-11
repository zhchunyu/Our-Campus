# -*- coding: utf-8 -*-
"""
「AI 到底该训什么」验证 —— 模型这半（需 GPU，在 AutoDL 上跑）

配套 `check_db_match.py`（本地跑，不用 GPU）。
本地那半已证明：**地点匹配靠数据库就够（81%），不需要 AI 学地名。**
本脚本验证：**AI 在非地点字段上到底比规则强多少。**

★ 设计要点：**三路对比**，不是只看模型输出
   路线 A：纯正则 —— 抽 时长/时段/严重度 试试
   路线 B：现成 Qwen2.5-14B + 提示词（不训练）
   路线 C：V9/V10 LoRA（训练过）
   把三路的输出摆在一起，**用事实决定要不要继续训**。

用法（AutoDL）：
    python check_ai_value.py                 # 默认对比 V9
    python check_ai_value.py --lora v10      # 指定 V10
"""

import json
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
    PeftModel = None
try:
    from transformers import BitsAndBytesConfig
except ImportError:
    BitsAndBytesConfig = None

BASE = "/root/autodl-tmp/models/models/qwen--Qwen2.5-14B-Instruct/snapshots/master"
LORA_V9 = "/root/autodl-tmp/output/qwen25-14b-auv-v9-extract"
LORA_V10 = "/root/autodl-tmp/output/qwen25-14b-auv-v10-extract"
TRAIN_JSON = "/root/autodl-tmp/data/v10_extract_train.json"

# ============================================================
# 测试帖：与 check_db_match.py 同一批（保证可比）
# 每条带"人工标注的标准答案"（expected）
# ============================================================
TESTS = [
    ("谷园餐厅排队太长了，等好久",
     {"type": "congestion", "wait": None, "window": "unknown", "severity": None}),
    ("图书馆三楼空调外机看着要掉",
     {"type": "safety", "wait": None, "window": "unknown", "severity": "high"}),
    ("一食堂今天人爆满，队排到门外了",
     {"type": "congestion", "wait": None, "window": "unknown", "severity": "high"}),
    ("教学楼门口有人在发传单，有点堵路",
     {"type": "congestion", "wait": None, "window": "unknown", "severity": "low"}),
    ("有人晕倒了，快来人",
     {"type": "safety", "wait": None, "window": "unknown", "severity": "high"}),
    ("英语角开始报名了，截止到周日",
     {"type": "notice", "wait": None, "window": "unknown", "severity": "low"}),
    ("谷园2楼新开的窗口超好吃但排队40分钟",
     {"type": "congestion", "wait": 40, "window": "noon", "severity": "medium"}),
    ("宿舍楼下有人乱停车，把路都堵了",
     {"type": "congestion", "wait": None, "window": "unknown", "severity": "medium"}),
    ("校医院开的药好贵啊",
     {"type": "service", "wait": None, "window": "unknown", "severity": "low"}),
    ("西校门这边晚上堵车堵了20分钟",
     {"type": "congestion", "wait": 20, "window": "evening", "severity": "medium"}),
]

MAX_NEW = 256


# ============================================================
# 路线 A：纯正则（不训练、不模型）—— 看"零成本"能做到什么程度
# ============================================================
RE_WAIT = re.compile(r"(\d+)\s*(?:分钟|min|分)")
RE_HIGH = ["爆满", "爆", "排到门外", "要掉", "危险", "晕倒", "全是坏的", "堵住"]
RE_LOW = ["有点", "稍微", "略微", "还行", "一般"]
RE_WINDOW = {
    "morning": ["早上", "早晨", "早", "上午"],
    "noon": ["中午", "午饭"],
    "afternoon": ["下午"],
    "evening": ["晚上", "傍晚", "夜里"],
    "night": ["深夜", "半夜", "凌晨"],
}
RE_TYPE = {
    "safety": ["坏", "掉", "危险", "漏水", "晕倒", "事故", "坑", "漏电", "安全"],
    "congestion": ["排队", "人多", "堵", "拥挤", "人爆满", "排到"],
    "notice": ["通知", "报名", "活动", "讲座", "截止", "开始", "举办"],
    "service": ["维修", "关闭", "暂停", "故障", "涨价", "服务", "不能用"],
}


def rule_extract(text):
    out = {}

    # wait
    m = RE_WAIT.search(text)
    out["wait"] = int(m.group(1)) if m else None

    # window
    w = "unknown"
    for k, kws in RE_WINDOW.items():
        if any(x in text for x in kws):
            w = k
            break
    out["window"] = w

    # severity
    if any(x in text for x in RE_HIGH):
        s = "high"
    elif any(x in text for x in RE_LOW):
        s = "low"
    else:
        s = None
    out["severity"] = s

    # type（按关键词命中数打分）
    best, bestn = None, 0
    for t, kws in RE_TYPE.items():
        n = sum(1 for k in kws if k in text)
        if n > bestn:
            best, bestn = t, n
    out["type"] = best
    return out


# ============================================================
# 路线 B / C：模型推理
# ============================================================
def load_model(lora_path=None):
    tok = AutoTokenizer.from_pretrained(BASE, trust_remote_code=True)
    print("加载基础模型（4bit）...")
    kwargs = dict(device_map="auto", trust_remote_code=True)
    if BitsAndBytesConfig is not None:
        kwargs["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True, bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.float16, bnb_4bit_use_double_quant=True)
    else:
        kwargs["load_in_4bit"] = True
    model = AutoModelForCausalLM.from_pretrained(BASE, **kwargs)
    if lora_path and PeftModel is not None and os.path.exists(lora_path):
        print(f"挂载 LoRA: {lora_path}")
        model = PeftModel.from_pretrained(model, lora_path)
    elif lora_path:
        print(f"!! LoRA 不存在，走纯基础模型: {lora_path}")
    model.eval()
    return model, tok


PROMPT_PLAIN = (
    "你是校园事件分析助手。请从用户描述中提取事件的结构化信息，输出JSON格式，包含以下字段："
    "type(事件类型，取值safety/congestion/service/notice)、"
    "building_name(建筑名称，描述中未提及地点时填null)、"
    "floor(楼层，没有则为null)、severity(严重程度，取值low/medium/high)、"
    "estimated_wait_min(预计等待或持续时间，单位分钟，没有则为null)、"
    "time_window(时间段，取值morning/noon/afternoon/evening/night/unknown)。"
    "只输出JSON，不要解释。"
)


def gen(model, tok, system, text):
    msgs = [{"role": "system", "content": system}, {"role": "user", "content": text}]
    prompt = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
    ids = tok(prompt, return_tensors="pt").to(model.device)
    with torch.no_grad():
        out = model.generate(**ids, max_new_tokens=MAX_NEW, do_sample=False,
                             pad_token_id=tok.eos_token_id)
    return tok.decode(out[0][ids["input_ids"].shape[1]:],
                      skip_special_tokens=True).strip()


def parse_json(s):
    try:
        return json.loads(s)
    except Exception:
        a, b = s.find("{"), s.rfind("}")
        if a != -1 and b > a:
            try:
                return json.loads(s[a:b + 1])
            except Exception:
                return None
    return None


# ============================================================
def main():
    lora_key = "v10" if "--lora" in sys.argv and "v10" in sys.argv else "v9"
    lora = LORA_V10 if lora_key == "v10" else LORA_V9

    try:
        instr = json.load(open(TRAIN_JSON, encoding="utf-8"))[0]["instruction"]
    except Exception:
        instr = PROMPT_PLAIN

    model, tok = load_model(lora)

    stat = {"rule": {"type": 0, "wait": 0, "window": 0, "severity": 0},
            "plain": {"type": 0, "wait": 0, "window": 0, "severity": 0},
            "lora": {"type": 0, "wait": 0, "window": 0, "severity": 0}}
    results = []

    print("\n" + "=" * 78)
    print("三路对比：正则 vs 基础模型 vs LoRA")
    print("=" * 78)

    for i, (text, exp) in enumerate(TESTS, 1):
        r = rule_extract(text)
        j_plain = parse_json(gen(model, tok, PROMPT_PLAIN, text))
        j_lora = parse_json(gen(model, tok, instr, text))

        # ★★ 三路字段名不同：正则用 wait/window，模型 JSON 用 estimated_wait_min/time_window
        #    不区分 ⇒ window 永远取不到 ⇒ 被恒判为错（曾实际踩到）
        FIELD_KEY = {
            "正则": {"type": "type", "wait": "wait", "window": "window", "severity": "severity"},
            "基础": {"type": "type", "wait": "estimated_wait_min", "window": "time_window", "severity": "severity"},
            "LoRA": {"type": "type", "wait": "estimated_wait_min", "window": "time_window", "severity": "severity"},
        }

        print(f"\n[{i}/{len(TESTS)}] {text}")
        print(f"   标准答案  type={exp['type']:11s} wait={str(exp['wait']):5s} "
              f"window={exp['window']:9s} sev={exp['severity']}")

        for name, src in (("正则  ", r), ("基础  ", j_plain), ("LoRA ", j_lora)):
            key = name.strip()
            if key == "正则":
                vals = r
            else:
                fm = FIELD_KEY[key]
                vals = {k: (src.get(fm[k]) if src else None)
                        for k in ("type", "wait", "window", "severity")}
            ok = {k: (vals.get(k) == exp[k]) for k in exp}
            for k, v in ok.items():
                if v and name.strip() in ("正则", "基础", "LoRA"):
                    stat[{"正则": "rule", "基础": "plain", "LoRA": "lora"}[name.strip()]][k] += 1
            marks = "".join("✓" if ok[k] else "✗" for k in ("type", "wait", "window", "severity"))
            print(f"   {name}  type={str(vals.get('type')):11s} "
                  f"wait={str(vals.get('wait')):5s} window={str(vals.get('window')):9s} "
                  f"sev={str(vals.get('severity')):6s}  [{marks}]")

        results.append({"text": text, "expect": exp,
                        "rule": r, "plain": j_plain, "lora": j_lora})

    # ---- 汇总 ----
    print("\n" + "#" * 78)
    print("# 汇总（各字段命中率）")
    print("#" * 78)
    n = len(TESTS)
    print(f"{'路线':10s} {'type':>8s} {'wait':>8s} {'window':>8s} {'severity':>8s} {'平均':>8s}")
    for key, label in (("rule", "正则"), ("plain", "基础模型"), ("lora", "LoRA")):
        s = stat[key]
        avg = sum(s.values()) / (4 * n) * 100
        print(f"{label:10s} {s['type']:>4d}/{n:<3d} {s['wait']:>4d}/{n:<3d} "
              f"{s['window']:>4d}/{n:<3d} {s['severity']:>4d}/{n:<3d} {avg:>7.0f}%")

    print("""
★ 怎么读这张表
  · 某字段【正则】就很高  → 说明不需要 AI，删掉这个字段，省算力
  · 某字段【基础模型】高、LoRA 也高 → 说明现成模型够用，**不用训练**
  · 某字段【LoRA】明显高于【基础模型】 → 这才是训练的价值所在
  · 全字段都差不多 → 结论是**不用训**，直接用现成模型 + 提示词
""")

    json.dump(results, open("check_ai_value_result.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    print("结果已存: check_ai_value_result.json")


if __name__ == "__main__":
    main()
