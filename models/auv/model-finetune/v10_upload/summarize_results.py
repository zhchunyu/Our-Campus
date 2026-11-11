# -*- coding: utf-8 -*-
"""
本地汇总 AutoDL 拉回来的两个结果文件，重算全部指标。

用法（本地 Windows）：
    python summarize_results.py

读这两个文件（放同目录，或上级 model-finetune/ 目录）：
    check_v10_result.json        ← check_v10.py 产出
    check_ai_value_result.json   ← check_ai_value.py 产出

★ 为什么不直接看服务器终端输出：终端只显示一次、易抄错；
  两个 json 里有**每条记录的原始数据**，本地重算不会漏。
"""
import json
import os
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
PARENT = os.path.dirname(HERE)
KEYS = ("type", "wait", "window", "severity")


def find(name):
    for d in (HERE, PARENT):
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
    return None


def load(name):
    p = find(name)
    if not p:
        print(f"  !! 找不到 {name}（放 {HERE} 或 {PARENT}）")
        return None
    print(f"  读入 {name}  ← {p}")
    return json.load(open(p, encoding="utf-8"))


# ============================================================
# 一、check_v10_result.json —— 验收指标
# ============================================================
def load_locations():
    p = find("campus_locations.json")
    if not p:
        return None
    d = json.load(open(p, encoding="utf-8"))
    by_name = {}
    for l in d["locations"]:
        by_name[l["name"]] = l
        for a in l.get("aliases", []):
            by_name.setdefault(a, l)
    return by_name


def summarize_v10(recs, by_name):
    n = len(recs)
    n_json = n_type = n_null = 0
    n_loc_ok = n_loc_checked = 0
    n_id_bad = n_generic = 0
    rows = []

    for i, r in enumerate(recs, 1):
        # JSON 严格可解析（与 check_v10.py 主判据一致）
        ok_json = False
        try:
            json.loads(r["output"])
            ok_json = True
        except Exception:
            pass
        if ok_json:
            n_json += 1

        got_type = r.get("got_type")
        got_bld = r.get("got_building")

        # A 组（1~6）：type 准确 + 地点合法
        if i <= 6:
            if got_type == r["expect"]:
                n_type += 1
            if got_bld:
                n_loc_checked += 1
                if by_name and got_bld in by_name:
                    n_loc_ok += 1
                else:
                    n_loc_checked -= 1  # 权威表缺失时不计入
                    rows.append(("★ 幻觉地点", i, r["input"], got_bld))
        # B 组（7~8）：没提地点 → null
        if 6 < i <= 8 and got_bld is None:
            n_null += 1

        if r.get("id_mismatch"):
            n_id_bad += 1
        if r.get("generic_back"):
            n_generic += 1

    print("\n" + "#" * 70)
    print("# 一、V10 验收（check_v10_result.json）")
    print("#" * 70)
    print(f"JSON 可解析率   : {n_json}/{n} = {n_json/n*100:.0f}%      (判据 ≥ 90%)")
    print(f"type 准确率     : {n_type}/6 = {n_type/6*100:.0f}%      (A 组)")
    print(f"null 正确率     : {n_null}/2 = {n_null/2*100:.0f}%      (B 组，没提地点不编造)")
    if n_loc_checked:
        print(f"★ 地点合法率   : {n_loc_ok}/{n_loc_checked} = {n_loc_ok/n_loc_checked*100:.0f}%"
              f"      (★ V10 核心目标，应 100%)")
    else:
        print("★ 地点合法率   : 无有效样本（权威表缺失或 A 组全没输出地点）")
    print(f"building_id 不符: {n_id_bad} 条")
    print(f"description 套话: {n_generic} 条")
    for tag, i, txt, got in rows:
        print(f"  {tag} [{i}] {txt} → {got!r}")
    return {"json": n_json, "n": n, "type": n_type, "null": n_null,
            "loc_ok": n_loc_ok, "loc_checked": n_loc_checked}


# ============================================================
# 二、check_ai_value_result.json —— 三路对比
# ============================================================
# ★★ 关键：三路的字段名不一样！
#   正则（rule_extract 自造）  : wait / window / severity / type
#   模型（plain + lora，JSON）: estimated_wait_min / time_window / severity / type
#   ⇒ 不区分就会「永远取不到 window」，把它恒判为错。
FIELD_MAP = {
    "rule":  {"type": "type", "wait": "wait",             "window": "window",      "severity": "severity"},
    "plain": {"type": "type", "wait": "estimated_wait_min", "window": "time_window", "severity": "severity"},
    "lora":  {"type": "type", "wait": "estimated_wait_min", "window": "time_window", "severity": "severity"},
}


def _val(src, k, route):
    if not src:
        return None
    return src.get(FIELD_MAP[route][k])


def summarize_ai_value(results):
    n = len(results)
    stat = {r: {k: 0 for k in KEYS} for r in ("rule", "plain", "lora")}
    per_field_miss = {r: {k: [] for k in KEYS} for r in ("rule", "plain", "lora")}

    for i, rec in enumerate(results, 1):
        exp = rec["expect"]
        for route in ("rule", "plain", "lora"):
            src = rec.get(route)
            for k in KEYS:
                if _val(src, k, route) == exp[k]:
                    stat[route][k] += 1
                else:
                    per_field_miss[route][k].append(i)

    print("\n" + "#" * 70)
    print("# 二、三路对比（check_ai_value_result.json）")
    print("#" * 70)
    print(f"{'路线':12s} {'type':>10s} {'wait':>10s} {'window':>10s} {'severity':>10s} {'平均':>8s}")
    summary = {}
    for route, label in (("rule", "正则"), ("plain", "基础模型"), ("lora", "LoRA")):
        s = stat[route]
        avg = sum(s.values()) / (4 * n) * 100 if n else 0
        summary[route] = avg
        print(f"{label:12s} {s['type']:>4d}/{n:<5d} {s['wait']:>4d}/{n:<5d} "
              f"{s['window']:>4d}/{n:<5d} {s['severity']:>4d}/{n:<5d} {avg:>7.0f}%")

    print("\n★ 逐字段结论：")
    for k in KEYS:
        r, p, l = stat["rule"][k], stat["plain"][k], stat["lora"][k]
        if n and r / n >= 0.9:
            verdict = "正则就够 → 该字段可删，省算力"
        elif l - p >= 2:
            verdict = f"★ LoRA 领先基础模型 {l-p} 条 → 训练有价值"
        elif abs(l - p) <= 1:
            verdict = "LoRA ≈ 基础模型 → 不用为它训练"
        else:
            verdict = "基础模型更强 → 检查提示词"
        print(f"  {k:9s} 正则 {r:>2d}/{n} · 基础 {p:>2d}/{n} · LoRA {l:>2d}/{n}   ⇒ {verdict}")

    print("\n★ 总判定：")
    if summary["lora"] - summary["plain"] >= 10:
        print("  LoRA 明显优于基础模型 ⇒ **值得训**")
    elif abs(summary["lora"] - summary["plain"]) < 10:
        print("  三路接近 ⇒ **不用训**，现成模型 + 提示词即可（正则兜底）")
    else:
        print("  基础模型更强 ⇒ 先别训，检查提示词/数据")
    return stat, summary


def main():
    print("=" * 70)
    print("汇总本地结果")
    print("=" * 70)

    v10 = load("check_v10_result.json")
    ai = load("check_ai_value_result.json")

    if v10 is None and ai is None:
        print("\n两个结果文件都没找到。先把它们从服务器拉下来：")
        print("  scp -P <端口> root@<地址>:/root/autodl-tmp/check_v10_result.json .")
        print("  scp -P <端口> root@<地址>:/root/autodl-tmp/check_ai_value_result.json .")
        return

    if v10 is not None:
        by_name = load_locations()
        if not by_name:
            print("  ⚠️ 缺 campus_locations.json，地点合法率无法判定")
        summarize_v10(v10, by_name)

    if ai is not None:
        if isinstance(ai, dict) and "results" in ai:
            ai = ai["results"]
        summarize_ai_value(ai)

    print("\n" + "=" * 70)
    print("把上面两段贴给我，或直接告诉我结论，我来定下一步。")


if __name__ == "__main__":
    main()
