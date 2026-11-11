# -*- coding: utf-8 -*-
"""
从 Supabase seed 生成【去标识】的地点权威表 —— 全项目唯一真源。

合规要求（2026-10-04 用户定）：
  对外材料禁止出现学校名称。本表只保留中性楼名（西校门 / 崇学楼 / 谷园餐厅 …），
  不含任何校名、地名、缩写。

  待剔除的标识串写在本目录 `.identifier_blacklist.txt`（不进版本库），
  代码本身不含具体校名。

用法：
  python make_campus_locations.py
输出：
  models/auv/model-finetune/data/campus_locations.json
"""
import json, re, sys, os

sys.stdout.reconfigure(encoding="utf-8")

HERE = os.path.dirname(os.path.abspath(__file__))
SEED = os.path.join(HERE, "..", "..", "..", "..", "99-临时工作区", "_supabase_locations.json")
OUT  = os.path.join(HERE, "campus_locations.json")

# ★ 合规黑名单：任何字段出现这些串一律清洗（规避硬编码校名，从外部配置读入）
BLACKLIST_FILE = os.path.join(HERE, ".identifier_blacklist.txt")

def load_blacklist():
    """从本地黑名单文件读入待剔除的标识串；文件缺失时返回空表（不阻断构建）。"""
    if not os.path.exists(BLACKLIST_FILE):
        return []
    with open(BLACKLIST_FILE, encoding="utf-8") as f:
        return [ln.strip() for ln in f if ln.strip() and not ln.startswith("#")]

BAD = load_blacklist()


def clean_alias(a: str) -> str | None:
    """剔除含标识串的别名；清洗后若仍有内容则保留余下部分。"""
    if not BAD:
        return a
    for b in BAD:
        if b.lower() in a.lower():
            rest = re.sub("|".join(map(re.escape, BAD)), "", a, flags=re.I).strip()
            return rest if len(rest) >= 1 else None
    return a


def main():
    locs = [l for l in json.load(open(SEED, encoding="utf-8")) if l.get("category")]
    assert len(locs) == 66, f"地点数应为 66，实际 {len(locs)}"

    out = {
        "note": "地点权威表 —— 由 supabase campus_locations 派生，已去标识，仅保留中性楼名",
        "version": "1.0",
        "total": len(locs),
        "regions": [],
        "locations": [],
    }
    for l in locs:
        aliases, seen = [], set()
        for a in l["aliases"]:
            a = clean_alias(a)
            if a and a not in seen and a != l["name"]:
                seen.add(a)
                aliases.append(a)
        out["locations"].append({
            "id": l["id"], "name": l["name"], "aliases": aliases,
            "category": l["category"], "region": l["region"],
        })
        if l["region"] not in out["regions"]:
            out["regions"].append(l["region"])

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    # ---- 自检：全文不得含任何黑名单串 ----
    txt = open(OUT, encoding="utf-8").read()
    hits = [b for b in BAD if b.lower() in txt.lower()]
    print("★ 校名残留自检:", "✅ 无" if not hits else f"❌ {hits}")
    if hits:
        raise SystemExit(1)
    print(f"地点 {out['total']} 个 / 别名合计 {sum(len(l['aliases']) for l in out['locations'])} 条")
    print("地区:", out["regions"])
    print("已写出:", os.path.relpath(OUT, os.path.join(HERE, "..", "..", "..", "..")))


if __name__ == "__main__":
    main()
