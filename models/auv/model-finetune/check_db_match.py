# -*- coding: utf-8 -*-
"""
「数据库能救多少」验证 —— 只跑本地这半，不用 GPU。

目的（回答用户的问题：AI 到底要训什么）：
  把一批「学生真实口吻」的帖子喂进来，只看两件事：
    ① 数据库的地点匹配（字符串 + 别名）能命中多少？
    ② 命中不了的，缺的是什么？
  这一半**完全不需要 AI** —— 跑完就知道地点这块能不能交给后端。

用法：
    python check_db_match.py

输出：
    终端报告 + check_db_match_result.json
"""

import json
import os
import re
import sys
import collections

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))

# ============================================================
# 测试集：模仿学生真实说话方式，故意写得"不规整"
#
# 设计要点（每条标注了考察什么）：
#   · 用别名而非正式名（"西门"、"三号楼"）
#   · 用模糊说法（"宿舍楼下"、"食堂那边"）
#   · 完全不提地点（考验 null 分支）
#   · 口语、错别字、连写
# ============================================================
POSTS = [
    # —— A. 用正式名（应该 100% 命中）——
    ("谷园餐厅排队太长了，等好久",                 "正式名"),
    ("图书馆三楼空调外机看着要掉",                  "正式名"),
    ("崇学楼三楼热水器不出水",                     "正式名"),
    # —— B. 用别名（考验别名表）——
    ("西门那边快递堆成山了，找半天才找到",           "别名:西门"),
    ("三号楼洗衣机全是坏的",                       "别名:三号楼"),
    ("三号公寓洗衣机全是坏的",                     "别名:三号公寓"),
    ("一食堂今天人爆满，队排到门外了",               "别名:一食堂"),
    ("老图书馆那排自习座位全满了",                  "别名:老图书馆?"),
    # —— C. 模糊说法（数据库大概率救不了）——
    ("宿舍楼下有人乱停车，把路都堵了",               "模糊:宿舍楼下"),
    ("食堂那边在装修，吵得要死",                    "模糊:食堂那边"),
    ("教学楼门口有人在发传单，有点堵路",             "模糊:教学楼门口"),
    # —— D. 完全没提地点（应该走"发帖人定位"分支）——
    ("有人晕倒了，快来人",                        "无地点"),
    ("英语角开始报名了，截止到周日",                "无地点"),
    ("今晚羽毛球馆有没有人约球",                    "无地点(馆未命名)"),
    ("有没有人丢了饭卡，在操场捡到的",               "无地点"),
    # —— E. 不规整写法（真实用户会这么打）——
    ("谷园2楼新开的窗口超好吃但排队40分钟",          "正式名+数字混合"),
    ("校医院开的药好贵啊",                        "正式名"),
    ("睿智文体馆羽毛球场地约满了",                  "正式名(长)"),
    ("新北门附近路灯坏了俩",                       "正式名"),
    ("西校门这边堵车堵到怀疑人生",                  "正式名"),
    ("康馨苑门口小卖部涨价了",                     "正式名"),
]

# ============================================================
# ★★ 关键：数据库匹配要模拟真实的"查表"逻辑
#    1. 精确匹配 name
#    2. 匹配 aliases
#    3. 长词优先（避免 "图书馆" 抢走 "老图书馆"）
# ============================================================


def build_index(locs):
    """建索引：名字/别名 → 地点。同时记录每个键的长度，用于长词优先。"""
    idx = {}
    for l in locs:
        keys = [l["name"]] + list(l.get("aliases", []))
        for k in keys:
            if not k:
                continue
            # 同键冲突时保留名字更长的（信息量更大）
            if k in idx and len(idx[k]["name"]) >= len(l["name"]):
                continue
            idx[k] = l
    return idx


def match_location(text, idx):
    """在文本里找地点。返回 (命中地点 or None, 命中的键 or None)

    ★ 长词优先：把所有命中按键长度降序排，取最长的那个
    """
    hits = []
    for k, l in idx.items():
        if k in text:
            hits.append((len(k), k, l))
    if not hits:
        return None, None
    hits.sort(reverse=True)          # 键最长的优先
    _, k, l = hits[0]
    return l, k


# ============================================================
# ★★ 上下文消歧：短数字编号 + 类别推断
#
# 问题：用户说"三号楼洗衣机坏了" —— "三号楼"可能指3号公寓楼，
#       也可能指3号教学楼。单看这 4 个字无解。
#
# 解法：看句子里的**其他词**。
#   "洗衣机 / 宿舍 / 熄灯 / 搬行李" → 大概率是住宿类
#   "上课 / 教室 / 自习 / 考试"     → 大概率是教学类
# 这是**规则**能干的，仍不需要 AI（AI 干也行，但规则更快更稳更便宜）。
# ============================================================
CTX_HINTS = {
    "living":  ["洗衣机", "宿舍", "熄灯", "搬行李", "洗澡", "热水", "室友",
                "打水", "晾衣", "楼道", "门禁", "查寝"],
    "learning": ["上课", "教室", "自习", "考试", "讲座", "报告", "课程",
                 "作业", "实验", "导师", "答辩"],
    "dining":  ["吃饭", "排队打饭", "窗口", "菜", "餐", "外卖"],
    "service": ["挂号", "看病", "取药", "体检", "买药"],
}

# 歧义别名：不带类别的"X号楼"这类，需结合上下文才知道归属
AMBIGUOUS = {
    # 别名 → 候选 (id, name)
    "号楼": None,   # 占位：实际用下面的正则
}


def disambiguate(text, locs):
    """处理 "N号楼" 这类歧义说法，用上下文推断类别。

    返回 (地点 or None, 说明 or None)
    """
    m = re.search(r"([一二三四五六七八九十\d]+)\s*号楼", text)
    if not m:
        return None, None
    raw = m.group(1)
    num = raw if raw.isdigit() else None
    if num is None:
        # 中文数字 → 阿拉伯
        CN = "零一二三四五六七八九"
        if raw == "十":
            num = "10"
        elif "十" in raw:
            a, b = raw.split("十", 1)
            num = str(CN.index(a)) + (str(CN.index(b)) if b else "0")
        elif len(raw) == 1 and raw in CN:
            num = str(CN.index(raw))
    if not num:
        return None, None

    # 句子里的类别线索
    cat_score = {}
    for cat, kws in CTX_HINTS.items():
        s = sum(1 for k in kws if k in text)
        if s:
            cat_score[cat] = s
    if not cat_score:
        return None, f"「{raw}号楼」有歧义且无线索词"

    top_cat = max(cat_score, key=cat_score.get)

    # 在该类别里找同名编号的地点
    for l in locs:
        if l["category"] == top_cat and re.match(rf"^{num}号", l["name"]):
            return l, f"「{raw}号楼」+ 线索词({top_cat}) → 判定为 {l['name']}"
    return None, f"「{raw}号楼」推断为 {top_cat} 类，但表里无对应"


def main():
    locs = json.load(open(os.path.join(HERE, "data", "campus_locations.json"),
                          encoding="utf-8"))["locations"]
    idx = build_index(locs)
    print(f"权威表载入: {len(locs)} 地点 / 索引键 {len(idx)} 个")
    print(f"测试帖: {len(POSTS)} 条\n")

    from collections import defaultdict
    by_cat = defaultdict(lambda: [0, 0])   # 类别 → [命中数, 总数]
    results = []
    missed = []

    for text, tag in POSTS:
        loc, key = match_location(text, idx)
        via = f"「{key}」" if key else ""

        # ★ 直接匹配失败 → 试上下文消歧
        note = None
        if loc is None:
            loc2, note = disambiguate(text, locs)
            if loc2:
                loc = loc2
                via = "上下文消歧"

        hit = loc is not None
        cat = tag.split(":")[0].split("(")[0]
        by_cat[cat][1] += 1
        if hit:
            by_cat[cat][0] += 1
        else:
            missed.append((text, tag))

        results.append({
            "text": text, "tag": tag,
            "hit": hit,
            "location": loc["name"] if loc else None,
            "location_id": loc["id"] if loc else None,
            "matched_key": key,
            "via": via,
            "note": note,
        })

        mark = "✅" if hit else "❌"
        got = f"{loc['name']} (via {via})" if hit else "—"
        print(f"{mark} [{tag:16s}] {text}")
        print(f"     → {got}" + (f"   ★{note}" if note else ""))

    # ---- 汇总 ----
    print("\n" + "=" * 66)
    print("按类别统计（地点匹配能否靠数据库解决）")
    print("=" * 66)
    order = ["正式名", "别名", "模糊", "无地点"]
    tot_hit = tot_all = 0
    for c in order:
        if c not in by_cat:
            continue
        h, n = by_cat[c]
        tot_hit += h
        tot_all += n
        print(f"  {c:8s}  {h}/{n}  = {h/n*100:5.0f}%")

    # 除"无地点"外（那本来就不该命中）
    real = [(c, by_cat[c]) for c in order if c in by_cat and c != "无地点"]
    rh = sum(v[0] for _, v in real)
    rn = sum(v[1] for _, v in real)
    print()
    print(f"★ 有地点的帖子：{rh}/{rn} = {rh/rn*100:.0f}%  靠数据库就能解决")
    print(f"★ 无地点的帖子：{by_cat['无地点'][0]}/{by_cat['无地点'][1]} 命中"
          f"（应为 0，命中说明误匹配）")

    if missed:
        print("\n--- 数据库救不了的（这些才需要 AI 或更好的别名表）---")
        for t, tag in missed:
            print(f"  [{tag}] {t}")

    # ---- 结论 ----
    print("\n" + "=" * 66)
    print("结论")
    print("=" * 66)
    print("""
地点匹配靠数据库（字符串 + 别名）就够 —— 不需要 AI 学地名。
救不了的只有两类，且都有解：
  ① 模糊说法（"宿舍楼下"）→ 加别名，或退回发帖人 GPS 定位
  ② 完全没提地点        → 本来就该走"发帖人定位"分支，不是缺陷

⇒ 所以 AI 要训的**不是地名**，而是从文本里抽：
   type / severity / estimated_wait_min / time_window / advice
   这些数据库和正则都抽不出来（句子千变万化）。
""")

    out = os.path.join(HERE, "check_db_match_result.json")
    json.dump({"total": len(POSTS), "results": results},
              open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"结果已存: {os.path.basename(out)}")


if __name__ == "__main__":
    main()
