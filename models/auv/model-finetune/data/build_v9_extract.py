# -*- coding: utf-8 -*-
"""
V9 提取数据集 —— 在 V8 基础上按「产品链路修正」重构

★★ 本轮修正的根据（2026-10-04 产品架构讨论结论）：
   用户拍板：① **急救走快速通道** ② **删掉 mutual，只留 4 类**

   产品链路：
     用户输入 → ① 意图分类（毫秒级）
                  ├── 急救类 → 快速通道（120/校医院），**不进提取**
                  └── 一般事件 → ② V8/V9 提取 → JSON → ③ 系统补全 → ④ 推送/落图
     而「互助类」（拼车/求借/求组队/转让票/求帮忙）本质是**找人不是报事**，
     走论坛板块，**不进提取管线** ⇒ mutual 整体删除。

★★ 另一个核心原则（V8 验收暴露的真问题）：
   **模型不该越权去猜系统已知的信息。**
   - 文本没写地点 ⇒ `building_name: null`（系统用发帖人定位补）
   - 模型若擅自编地点，而帖子其实带定位标签 ⇒ 冲突

修补内容（在 V8 基础上）：
  1. **删除全部 mutual 类**（含 type=mutual 与 description 为"互助信息发布"的）
  2. **instruction 去掉 mutual**（type 取值改为 4 类）
  3. **修正"建筑名无中生有"** —— input 未提及但 output 填了建筑的，改 null
     ★ 但保留「简称能对上」的（"澡堂"↔"公共浴室" 这类不算错）
  4. 重新划分训练/评估集

输出：v9_extract_train.json + v9_extract_eval.json
"""

import json
import random
import collections
import re

random.seed(20261004)

SRC_TRAIN = "v8_extract_train.json"
SRC_EVAL = "v8_extract_eval.json"

# ============================================================
# instruction 改写：type 从 5 类 → 4 类
# ============================================================
OLD_INSTRUCTION = (
    "你是校园事件分析助手。请从用户描述中提取事件的结构化信息，输出JSON格式，"
    "包含以下字段：type(事件类型，取值safety/congestion/service/notice/mutual)、"
    "building_id(建筑ID)、building_name(建筑名称)、floor(楼层，没有则为null)、"
    "severity(严重程度，取值low/medium/high)、description(事件摘要)、"
    "estimated_wait_min(预计等待或持续时间，单位分钟，没有则为null)、"
    "time_window(时间段，取值morning/noon/afternoon/evening/night/unknown)、"
    "advice(行动建议)"
)

NEW_INSTRUCTION = (
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


# ============================================================
# 「input 是否真的提到了这个建筑」判定
#
# ★ 关键：必须容忍简称/别称，否则"澡堂"↔"公共浴室"会被误判成编造。
# ============================================================
ALIAS = {
    "公共浴室": ["澡堂", "浴室", "洗澡"],
    "校园打印店": ["打印店", "打印"],
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
    # ★ 补：V9 第一轮跑完发现的漏判
    "学术报告厅": ["报告厅", "学术报告"],
    "北校门": ["北门", "北校门"],
    "南校门": ["南门", "南校门"],
    "西校门": ["西门", "西校门"],
    "主校门": ["正门", "主门", "主校门"],
}

# ★★ 建筑名统一化：同一地方的不同写法要归一
#    依据：建筑名全表里 "打印店"(26) 与 "校园打印店"(1) 并存 ⇒ 同一地方两个名字
CANONICAL = {
    "打印店": "校园打印店",
}


def input_mentions(inp, bname):
    """判断 input 里是否**真的**提到了这个建筑（含简称）"""
    if not bname:
        return True  # 本来就是 null，不用判
    if bname in inp:
        return True
    # 别名
    for k in ALIAS.get(bname, []):
        if k in inp:
            return True
    # 建筑名核心词（去掉"楼/号"等）
    core = bname.replace("楼", "").replace("号", "").replace("馆", "")
    if core and len(core) >= 2 and core in inp:
        return True
    # "N号宿舍楼" 这类：input 里只要有 "宿舍" 就算提到（泛指也算）
    if "宿舍" in bname and "宿舍" in inp:
        return True
    if "教学楼" in bname and "教学楼" in inp:
        return True
    if "实验楼" in bname and "实验楼" in inp:
        return True
    if "校门" in bname and "校门" in inp:
        return True
    return False


def main():
    tr = json.load(open(SRC_TRAIN, encoding="utf-8"))
    ev = json.load(open(SRC_EVAL, encoding="utf-8"))
    src = tr + ev
    print(f"读入 V8: 训练 {len(tr)} + 评估 {len(ev)} = {len(src)} 条")

    # ---- 1. 删除 mutual ----
    keep = []
    dropped_mutual = 0
    for x in src:
        try:
            o = json.loads(x["output"])
        except Exception:
            continue
        if o.get("type") == "mutual":
            dropped_mutual += 1
            continue
        keep.append((x, o))
    print(f"删除 mutual: {dropped_mutual} 条")

    # ---- 2. 修 building_name 无中生有 + 建筑名归一 ----
    fixed_bld = 0
    fixed_norm = 0
    n_null = 0
    out_rows = []

    for x, o in keep:
        inp = x["input"]
        bname = o.get("building_name") or ""

        # 2a. 建筑名归一（打印店 → 校园打印店）
        if bname in CANONICAL:
            o["building_name"] = CANONICAL[bname]
            bname = CANONICAL[bname]
            fixed_norm += 1

        # 2b. 无中生有 → null
        if bname and not input_mentions(inp, bname):
            o["building_name"] = None
            o["building_id"] = None
            if o.get("floor"):
                o["floor"] = None
            fixed_bld += 1

        if not o.get("building_name"):
            n_null += 1

        out_rows.append({
            "instruction": NEW_INSTRUCTION,
            "input": inp,
            "output": json.dumps(o, ensure_ascii=False),
        })

    print(f"建筑名归一（打印店→校园打印店）: {fixed_norm} 条")
    print(f"修正 building_name（改 null）: {fixed_bld} 条")
    print(f"最终 building_name 为 null 的: {n_null} 条 "
          f"({n_null / len(out_rows) * 100:.1f}%)")

    # ---- 3. 划分训练/评估 ----
    random.shuffle(out_rows)
    n_eval = min(max(120, len(out_rows) // 10), int(len(out_rows) * 0.12))
    ev_out = out_rows[:n_eval]
    tr_out = out_rows[n_eval:]

    json.dump(tr_out, open("v9_extract_train.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    json.dump(ev_out, open("v9_extract_eval.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)

    print(f"\n训练集 {len(tr_out)} 条 → v9_extract_train.json")
    print(f"评估集 {len(ev_out)} 条 → v9_extract_eval.json")

    # ---- 4. 统计 ----
    print("\n=== 类型分布 ===")
    types = collections.Counter(json.loads(r["output"])["type"] for r in out_rows)
    for k, v in types.most_common():
        print(f"  {k}: {v} ({v / len(out_rows) * 100:.1f}%)")

    print("\n=== instruction 检查 ===")
    bad_instr = sum(1 for r in out_rows if "mutual" in r["instruction"])
    print(f"仍含 mutual 的 instruction: {bad_instr} 条")

    bad = sum(1 for r in out_rows
              if any(t in json.loads(r["output"])["type"]
                     for t in ("mutual",)))
    print(f"仍是 mutual 的数据: {bad} 条")


if __name__ == "__main__":
    main()
