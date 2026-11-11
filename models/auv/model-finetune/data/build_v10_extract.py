# -*- coding: utf-8 -*-
"""
V10 提取数据集 —— 把地点体系换成「校园地点权威表」（去标识）

★★ 本轮依据（2026-10-04 用户定）：
   ① 用户要求：对外材料**不得出现校名**，地点只用中性楼名
   ② 权威表：`data/campus_locations.json`（66 地点 / 98 别名，零校名）
   ③ 用户选择「方案 A」：先按映射表改造，把链路跑通

V9 → V10 的三类改动：
  【改】A/B 组共 11 个名字 —— 换 building_name + building_id
  【拍】C 组 5 个名字 —— 已按建议落定（见 C_GROUP）
  【删】D 组 20 个名字 —— 这些建筑权威表里没有：
        · 处理方式：**整句丢弃**（不改成 null）
          理由：句子讲的就是那栋不存在的楼，改 null 后句子仍然指涉假楼，
                模型会学成"有地点但填 null"，污染 null 语义。
        · 例外：句子另有真地点可挂靠的，改挂靠（见 RESCUE）
  【补】instruction 里 building_id 说明加"无则为null"，与 building_name 对齐

输出：v10_extract_train.json + v10_extract_eval.json
"""

import json
import os
import random
import sys
import collections

sys.stdout.reconfigure(encoding="utf-8")
random.seed(20261004)

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)

SRC_TRAIN = "v9_extract_train.json"
SRC_EVAL = "v9_extract_eval.json"
LOCATIONS = "campus_locations.json"

# ============================================================
# instruction：把 building_id 的说明与 building_name 对齐
# ============================================================
OLD_INSTRUCTION = (
    "你是校园事件分析助手。请从用户描述中提取事件的结构化信息，输出JSON格式，"
    "包含以下字段："
    "type(事件类型，取值safety/congestion/service/notice)、"
    "building_id(建筑ID)、"
    "building_name(建筑名称，描述中未提及地点时填null)、"
    "floor(楼层，没有则为null)、"
    "severity(严重程度，取值low/medium/high)、"
    "description(事件摘要)、"
    "estimated_wait_min(预计等待或持续时间，单位分钟，没有则为null)、"
    "time_window(时间段，取值morning/noon/afternoon/evening/night/unknown)、"
    "advice(行动建议)。"
    "注意：描述中没有明确提到的地点、楼层等信息一律填null，不要推测或编造。"
)

NEW_INSTRUCTION = (
    "你是校园事件分析助手。请从用户描述中提取事件的结构化信息，输出JSON格式，"
    "包含以下字段："
    "type(事件类型，取值safety/congestion/service/notice)、"
    "building_id(建筑ID，与building_name同步，没有则为null)、"
    "building_name(建筑名称，描述中未提及地点时填null)、"
    "floor(楼层，没有则为null)、"
    "severity(严重程度，取值low/medium/high)、"
    "description(事件摘要)、"
    "estimated_wait_min(预计等待或持续时间，单位分钟，没有则为null)、"
    "time_window(时间段，取值morning/noon/afternoon/evening/night/unknown)、"
    "advice(行动建议)。"
    "注意：描述中没有明确提到的地点、楼层等信息一律填null，不要推测或编造。"
)

# ============================================================
# A 组 + B 组：直接换（旧名 → (新名, 新 id)）
# ============================================================
RENAME = {
    # A 组（名字不变，只换 id）
    "图书馆": ("图书馆", "library"),
    "西校门": ("西校门", "east-gate"),
    "校医院": ("校医院", "hospital"),
    "北校门": ("新北门", "new-north-gate"),
    # B 组（改名 + 换 id）
    "第一食堂": ("谷园餐厅", "canteen"),
    "第二食堂": ("碧桃园餐厅", "bitaoyuan-canteen"),
    "体育馆": ("睿智文体馆", "ruizhi-sports-center"),
    "3号宿舍楼": ("3号公寓楼", "apartment-3"),
    "5号宿舍楼": ("5号公寓楼", "apartment-5"),
    "北区宿舍": ("研究生宿舍", "graduate-dormitory"),
    "校园超市": ("康馨苑", "kangxinyuan"),
}

# ============================================================
# C 组：用户拍板项 —— 已按建议落定
# ============================================================
C_GROUP = {
    "A教学楼": ("崇学楼", "teaching-a"),
    "B教学楼": ("教学主楼", "main-teaching-building"),
    "C实验楼": ("实验大楼", "lab-building"),
    "学术报告厅": ("崇文楼", "chongwen-building"),
    "行政楼": ("教学管理楼", "teaching-management-building"),
}

RENAME.update(C_GROUP)

# ============================================================
# D 组：删除（权威表里没有这些建筑）
# ============================================================
DROP = {
    "知谷", "工程训练中心", "美术馆", "垂直书院", "中轴路南段", "校史馆",
    "听澜图书馆", "学生活动中心", "公共浴室", "中轴路北段", "快递服务中心",
    "南校门", "创新创业中心", "南区宿舍", "音乐厅", "主校门", "知行楼",
    "校园打印店", "大学生活动中心", "暖廊",
}

# ★ 抢救表：这些句子里若**另有真地点**，改挂靠而不是丢弃
#    键 = 被删的建筑名；值 = 按 input 关键词判断改挂靠到哪个真地点
#    例：「主校门人很多」→ 无真地点 → 丢；「主校门西校门都堵」→ 挂 west-gate
RESCUE = {
    "工程训练中心": [("车间", "车间", "workshop-west-1")],
    "公共浴室": [],          # 权威表无浴室 → 丢弃
    "快递服务中心": [("西校门", "西校门", "east-gate")],
    "校园打印店": [],        # 无 → 丢弃
    "大学生活动中心": [],    # 无 → 丢弃
    "学生活动中心": [],
    "南区宿舍": [("公寓楼", None, None)],   # 泛指 → 丢弃更安全
}

# 权威表里所有正式地点名（用于抢救判断）
LOC_NAMES = set()
LOC_BY_NAME = {}


def load_locations():
    d = json.load(open(LOCATIONS, encoding="utf-8"))
    for l in d["locations"]:
        LOC_NAMES.add(l["name"])
        LOC_BY_NAME[l["name"]] = l
        for a in l["aliases"]:
            LOC_BY_NAME.setdefault(a, l)
    return d


# ============================================================
# 别名表：判断 input 里是否真的提到了某地点（旧体系用）
# ============================================================
ALIAS = {
    "公共浴室": ["澡堂", "浴室", "洗澡"],
    "快递服务中心": ["快递", "菜鸟", "驿站"],
    "听澜图书馆": ["图书馆", "图书"],
    "第一食堂": ["一食堂", "第一食堂", "食堂"],
    "第二食堂": ["二食堂", "第二食堂", "食堂"],
    "校医院": ["医院", "医务室", "校医"],
    "大学生活动中心": ["活动中心", "大活"],
    "学生活动中心": ["活动中心", "学活"],
    "校园超市": ["超市", "便利店"],
    "南区宿舍": ["南区宿舍", "南区", "宿舍"],
    "北区宿舍": ["北区宿舍", "北区", "宿舍"],
    "学术报告厅": ["报告厅", "学术报告"],
    "北校门": ["北门", "北校门"],
    "南校门": ["南门", "南校门"],
    "西校门": ["西门", "西校门"],
    "主校门": ["正门", "主门", "主校门"],
    "校园打印店": ["打印店", "打印"],
}


def input_mentions(inp, bname):
    """input 里是否真的提到了这个（旧体系）建筑"""
    if not bname:
        return True
    if bname in inp:
        return True
    for k in ALIAS.get(bname, []):
        if k in inp:
            return True
    core = bname.replace("楼", "").replace("号", "").replace("馆", "")
    if core and len(core) >= 2 and core in inp:
        return True
    if "宿舍" in bname and "宿舍" in inp:
        return True
    if "教学楼" in bname and "教学楼" in inp:
        return True
    if "校门" in bname and "校门" in inp:
        return True
    return False


def swap_name_in_text(text, old, new):
    """把句子里的旧建筑名换成新名（长名优先，避免部分替换）"""
    if not old or not new or old == new:
        return text
    return text.replace(old, new)


def swap_in_all_text_fields(o, old, new):
    """★★ 把 output 里所有文本字段的旧建筑名一起换掉。

    坑：只换 building_name 是不够的 —— description / advice 里也常写着旧楼名，
    改了名却没改描述 ⇒ 训练数据自相矛盾（building_name=教学管理楼，
    但 description 写"行政楼有坑"），模型会学到混乱的对应关系。
    """
    if not old or not new or old == new:
        return 0
    n = 0
    for k in ("description", "advice"):
        v = o.get(k)
        if isinstance(v, str) and old in v:
            o[k] = v.replace(old, new)
            n += 1
    return n


def main():
    load_locations()
    print(f"权威表载入 {len(LOC_NAMES)} 个地点")

    tr = json.load(open(SRC_TRAIN, encoding="utf-8"))
    ev = json.load(open(SRC_EVAL, encoding="utf-8"))
    src = tr + ev
    print(f"读入 V9: 训练 {len(tr)} + 评估 {len(ev)} = {len(src)} 条")

    stat = collections.Counter()
    out_rows = []

    for x in src:
        try:
            o = json.loads(x["output"])
        except Exception:
            stat["json_error"] += 1
            continue
        inp = x["input"]
        bname = o.get("building_name") or ""

        # ---- 无地点：直接保留 ----
        if not bname:
            out_rows.append({**x, "instruction": NEW_INSTRUCTION})
            stat["keep_null"] += 1
            continue

        # ---- D 组：删除 ----
        if bname in DROP:
            rescued = False
            for kw, newname, newid in RESCUE.get(bname, []):
                if newname and kw in inp and newname in LOC_NAMES:
                    o["building_name"] = newname
                    o["building_id"] = newid
                    inp = swap_name_in_text(inp, bname, newname)
                    rescued = True
                    stat["rescue"] += 1
                    break
            if not rescued:
                stat["drop"] += 1
                continue

        # ---- A/B/C 组：改名 + 换 id ----
        elif bname in RENAME:
            newname, newid = RENAME[bname]
            o["building_name"] = newname
            o["building_id"] = newid
            inp = swap_name_in_text(inp, bname, newname)
            stat["desc_swapped"] += swap_in_all_text_fields(o, bname, newname)
            stat["rename"] += 1

        # ---- 不在任何表里：可疑，报出来（不擅自改） ----
        else:
            stat["unknown"] += 1
            print(f"  !! 未收录的旧建筑名: {bname}  |  {inp[:50]}")
            # 仍保留原样，人工复查
            out_rows.append({"instruction": NEW_INSTRUCTION, "input": inp,
                             "output": json.dumps(o, ensure_ascii=False)})
            continue

        # ---- 一致性校验：新名必须真的在权威表里 ----
        if o["building_name"] not in LOC_NAMES:
            stat["name_not_in_table"] += 1
            print(f"  !! 映射结果不在权威表: {o['building_name']}")
        if LOC_BY_NAME.get(o["building_name"], {}).get("id") != o["building_id"]:
            stat["id_mismatch"] += 1
            print(f"  !! id 与权威表不符: {o['building_name']} "
                  f"→ {o['building_id']} (应为 {LOC_BY_NAME.get(o['building_name'],{}).get('id')})")

        out_rows.append({
            "instruction": NEW_INSTRUCTION,
            "input": inp,
            "output": json.dumps(o, ensure_ascii=False),
        })

    print("\n--- 处理统计 ---")
    for k, v in stat.most_common():
        print(f"  {k:22s} {v}")

    # ---- ★ 残留清理：把所有 RENAME 旧名（含 DROP 名）在文本字段里彻底换掉 ----
    #     DROP 名没有新名可用 ⇒ 用泛称替换，避免句子指涉不存在的楼
    DROP_GENERIC = {
        "听澜图书馆": "图书馆",
        "学生活动中心": "活动中心",
        "大学生活动中心": "活动中心",
        "南校门": "校门",
        "主校门": "校门",
        "知谷": "园区",
        "音乐厅": "礼堂",
        "A教学楼": "教学楼",
        "B教学楼": "教学楼",
        "C实验楼": "实验楼",
        "第一食堂": "食堂",
        "第二食堂": "食堂",
        "中轴路南段": "校园道路",
        "中轴路北段": "校园道路",
        "3号宿舍楼": "公寓楼",
        "5号宿舍楼": "公寓楼",
        "北区宿舍": "宿舍区",
        "南区宿舍": "宿舍区",
        "校园超市": "生活服务点",
        "快递服务中心": "快递点",
        "校园打印店": "打印点",
        "公共浴室": "浴室",
        "工程训练中心": "实训场所",
        "暖廊": "连廊",
        "美术馆": "展馆",
        "校史馆": "展馆",
        "创新创业中心": "服务点",
        "垂直书院": "教学楼",
        "知行楼": "教学楼",
        "体育馆": "场馆",
        "学术报告厅": "报告厅",
        "行政楼": "办公楼",
        "校园打印店": "打印点",
    }

    def scrub(text):
        """把文本里所有旧建筑名换成新名/泛称"""
        if not isinstance(text, str) or not text:
            return text
        for old, (new, _) in RENAME.items():
            if old != new and old in text:
                text = text.replace(old, new)
        for old, gen in DROP_GENERIC.items():
            if old in text:
                text = text.replace(old, gen)
        return text

    scrub_n = 0
    for r in out_rows:
        o = json.loads(r["output"])
        new_inp = scrub(r["input"])
        new_desc = scrub(o.get("description"))
        new_adv = scrub(o.get("advice"))
        if new_inp != r["input"] or new_desc != o.get("description") or new_adv != o.get("advice"):
            scrub_n += 1
        r["input"] = new_inp
        o["description"] = new_desc
        o["advice"] = new_adv
        r["output"] = json.dumps(o, ensure_ascii=False)
    print(f"\n残留清理：{scrub_n} 条被二次清洗")

    # ---- ★ 全局残留扫描：input / description / advice 里还有没有旧建筑名 ----
    #     必须查！旧名可能出现在句子描述里而 building_name 是 null（漏网）
    #
    #     ★ 坑：旧名与新名同字的情形（"图书馆" 权威表里也有）会误报，
    #       所以只查【新旧名不同】的那些旧名。
    ALL_OLD = {k for k, v in RENAME.items() if v[0] != k} | DROP

    leftover = collections.Counter()
    for r in out_rows:
        o = json.loads(r["output"])
        for field in (r["input"], o.get("description") or "", o.get("advice") or ""):
            for old in ALL_OLD:
                if old in field:
                    leftover[old] += 1
    if leftover:
        print("\n★★ 旧建筑名残留（应清零）：")
        for k, v in leftover.most_common():
            print(f"    {k:16s} {v} 处")
    else:
        print("\n★ 旧建筑名残留: ✅ 无")

    # ---- 划分 ----
    random.shuffle(out_rows)
    n_eval = max(120, len(out_rows) // 10)
    ev_out = out_rows[:n_eval]
    tr_out = out_rows[n_eval:]

    json.dump(tr_out, open("v10_extract_train.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    json.dump(ev_out, open("v10_extract_eval.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    print(f"\n训练集 {len(tr_out)} 条 → v10_extract_train.json")
    print(f"评估集 {len(ev_out)} 条 → v10_extract_eval.json")

    # ---- 最终统计 ----
    tc = collections.Counter()
    bc = collections.Counter()
    for r in out_rows:
        o = json.loads(r["output"])
        tc[o.get("type")] += 1
        if o.get("building_name"):
            bc[o["building_name"]] += 1
    print(f"\ntype 分布: {dict(tc)}")
    print(f"出现地点数: {len(bc)}（覆盖权威表 {len(bc)}/{len(LOC_NAMES)}）")
    print("Top 15 地点:")
    for n, c in bc.most_common(15):
        print(f"  {n:16s} {c}")

    # ---- 合规自检 ----
    bl_file = os.path.join(HERE, ".identifier_blacklist.txt")
    if os.path.exists(bl_file):
        bad = [l.strip() for l in open(bl_file, encoding="utf-8")
               if l.strip() and not l.startswith("#")]
        blob = json.dumps(out_rows, ensure_ascii=False)
        hits = [b for b in bad if b.lower() in blob.lower()]
        print(f"\n★ 校名残留自检: {'✅ 无' if not hits else '❌ ' + str(hits)}")


if __name__ == "__main__":
    main()
