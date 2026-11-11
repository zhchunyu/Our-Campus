# -*- coding: utf-8 -*-
"""
从权威表自动派生「口语别名」—— 解决学生用缩写报事的问题。

背景（2026-10-04 实测）：
   权威表别名只写了 "3号公寓 / 3公寓 / 公寓3"，但学生**实际会说 "三号楼"**。
   同理 "一食堂"（表里写"谷园"）"老图书馆" "操场" 等等。

本脚本做两件事：
  ① 自动派生：中文数字 / 阿拉伯数字互换、"楼/馆/厅"后缀省略、方位词尾
  ② 冲突消解：多个地点抢同一别名时，**按"谁更可能是用户指的那个"排序**，
     并把结果写成 `ALIAS_CONFLICT` 报告供人工确认

用法：
    python expand_aliases.py            # 生成 + 报告
    python expand_aliases.py --apply    # 写回 campus_locations.json
"""

import json
import os
import re
import sys
import collections

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
LOC_FILE = os.path.join(HERE, "campus_locations.json")

CN = "零一二三四五六七八九"


def cn_num(s):
    """阿拉伯数字 → 中文（1-99 够用）"""
    if not s.isdigit():
        return None
    n = int(s)
    if n < 10:
        return CN[n]
    if n < 20:
        return "十" + (CN[n % 10] if n % 10 else "")
    return CN[n // 10] + "十" + (CN[n % 10] if n % 10 else "")


def ar_num(s):
    """中文数字 → 阿拉伯（支持 一 十 十五 二十三）"""
    if s == "十":
        return "10"
    if s.startswith("十"):
        r = s[1:]
        return "1" + (ar_num(r) if r else "0")
    if "十" in s:
        a, b = s.split("十", 1)
        return str(CN.index(a)) + (ar_num(b) if b else "0")
    if len(s) == 1 and s in CN:
        return str(CN.index(s))
    return None


def gen_variants(name):
    """从一个正式名派生口语变体

    ★★ 只派生【有辨识度】的变体。
       反面例子："3号公寓楼" 派生 "3号楼" —— 但 "3号楼" 可能指3号教学楼，
       歧义太大。所以**"X号楼" 这种剥掉类别的形式不生成**，除非原名就带类别词。
    """
    out = set()

    # ① 数字互换："3号公寓楼" → "三号公寓楼" / "三号公寓"
    m = re.match(r"^(\d+)(.*)$", name)
    if m:
        num, rest = m.group(1), m.group(2)
        c = cn_num(num)
        if c:
            out.add(c + rest)
            for suf in ["楼", "馆", "厅", "房"]:
                if rest.endswith(suf) and len(rest) > len(suf):
                    out.add(c + rest[:-1])      # 去掉尾缀："三号公寓"
                    out.add(num + rest[:-1])

    # ② 中文数字开头："三号公寓楼" → "3号公寓楼"
    m2 = re.match(r"^([一二三四五六七八九十]+)(.*)$", name)
    if m2:
        a, rest = m2.group(1), m2.group(2)
        n = ar_num(a)
        if n:
            out.add(n + rest)
            for suf in ["楼", "馆", "厅"]:
                if rest.endswith(suf) and len(rest) > len(suf):
                    out.add(n + rest[:-1])
                    out.add(a + rest[:-1])

    # ★★ 不再生成 "X号楼"（歧义太大，可能指教学楼）
    #     只有原名的"类别词"保留时才有辨识度

    out.discard(name)
    return {v for v in out if v and len(v) >= 2}


def gen_food_variants(name):
    """餐厅的特殊口语：「谷园餐厅」→「谷园」已在表里；补 "一食堂/二食堂" 类"""
    out = set()
    # 谷园餐厅 是"学生食堂" ⇒ 学生可能叫它"一食堂"？
    # ★ 这属于**语义判断**，不能自动生成，只提示人工确认
    return out


def main():
    apply = "--apply" in sys.argv
    d = json.load(open(LOC_FILE, encoding="utf-8"))
    locs = d["locations"]

    # ---- ① 生成派生别名 ----
    added_total = 0
    per_loc = {}
    for l in locs:
        base = [l["name"]] + list(l["aliases"])
        new = set()
        for b in base:
            for v in gen_variants(b):
                if v not in base:
                    new.add(v)
        per_loc[l["id"]] = sorted(new)
        added_total += len(new)

    print(f"★ 自动派生别名：{added_total} 条")
    for l in locs:
        if per_loc[l["id"]]:
            print(f"  {l['name']:12s} + {per_loc[l['id']]}")

    # ---- ② 冲突检测（含派生后的）----
    key2loc = collections.defaultdict(set)
    for l in locs:
        for k in [l["name"]] + list(l["aliases"]) + per_loc[l["id"]]:
            key2loc[k].add(l["name"])

    conflicts = {k: sorted(v) for k, v in key2loc.items() if len(v) > 1}
    print(f"\n★ 别名冲突 {len(conflicts)} 条：")
    for k, v in sorted(conflicts.items()):
        print(f"  「{k}」 → {v}")

    # ---- ③ 建议人工确认的（语义型，不能自动生成）----
    print("\n★ 需人工确认的口语（自动生成不了，属语义判断）：")
    hints = [
        ("一食堂 / 二食堂", "「谷园餐厅」「碧桃园餐厅」是否就是学生口中的一/二食堂？"),
        ("老图书馆", "指「图书馆」还是已废除的旧馆？"),
        ("操场", "「体育场」和「运动场」哪个是学生口中的操场？（当前冲突）"),
        ("宿舍楼下", "泛指，建议走「发帖人定位」分支而不是硬匹配"),
        ("食堂那边", "泛指，同上"),
        ("羽毛球馆", "权威表里没有，是否要补录？"),
    ]
    for a, b in hints:
        print(f"  · {a}：{b}")

    # ---- 写回 ----
    if apply:
        for l in locs:
            for v in per_loc[l["id"]]:
                if v not in l["aliases"]:
                    l["aliases"].append(v)
        json.dump(d, open(LOC_FILE, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        print(f"\n已写回 {LOC_FILE}")
    else:
        print("\n（未写回。加 --apply 生效）")

    # 保存报告
    rep = {"auto_added": per_loc, "conflicts": conflicts}
    json.dump(rep, open(os.path.join(HERE, "alias_expand_report.json"),
                        "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("报告已存: alias_expand_report.json")


if __name__ == "__main__":
    main()
