# -*- coding: utf-8 -*-
"""
已部署接口的验收脚本 —— 直接打 HTTP 接口，不加载模型（秒级出结果）

为什么要有这个：
  训练环境的验收（check_v10.py）是在本地加载模型跑的。
  但**服务环境和训练环境可能不同**（换了加载方式 / 换了量化基座 / 换了 prompt 拼法），
  不能假设效果一样 ⇒ 上线必须复测。

用法（服务器上，服务已起在 6006）：
    python check_served_api.py                # 两种 prompt 拼法都跑（推荐）
    python check_served_api.py user           # 只跑「instruction 放 user」
    python check_served_api.py system         # 只跑「instruction 放 system」

环境变量（都可选）：
    AUV_BASE_URL   默认 http://127.0.0.1:6006
    AUV_API_KEY    默认 auv-CHANGE-ME-2026
    AUV_MODEL      默认 extract
    AUV_LOCATIONS  权威表路径，默认 /root/autodl-tmp/campus_locations.json
"""

import json
import os
import sys
import time

BASE_URL = os.environ.get("AUV_BASE_URL", "http://127.0.0.1:6006").rstrip("/")
API_KEY = os.environ.get("AUV_API_KEY", "auv-CHANGE-ME-2026")
MODEL = os.environ.get("AUV_MODEL", "extract")
LOCATIONS = os.environ.get("AUV_LOCATIONS", "/root/autodl-tmp/campus_locations.json")

# ============================================================
# ★ 与训练一致的 instruction（从 v10_extract_train.json[0] 抄的）
# ============================================================
INSTRUCTION = (
    "你是校园事件分析助手。请从用户描述中提取事件的结构化信息，输出JSON格式，包含以下字段："
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

# ★ 训练时的默认 system（alpaca + qwen 模板会补上这一句）
DEFAULT_SYSTEM = "You are a helpful assistant."

# ============================================================
# ★★ 与 check_v10.py 完全相同的 10 条用例（口径必须一致才能对比）
# ============================================================
TESTS = [
    # —— A 组：权威表地点（该识别 + type 正确）——
    ("谷园餐厅现在人多到爆，队都排到门口了",       "congestion", "谷园餐厅"),
    ("图书馆三楼空调外机看着要掉",                "safety",     "图书馆"),
    ("3号公寓楼楼下洗衣机全是坏的，一个能用的都没有", "service",   "3号公寓楼"),
    ("崇文楼下周有创业分享会，感兴趣的可以报名",    "notice",     "崇文楼"),
    ("睿智文体馆羽毛球场地今晚约满了",             "congestion", "睿智文体馆"),
    ("实验大楼门口自行车乱停，都堵住路了",         "congestion", "实验大楼"),
    # —— B 组：没提地点 → null ——
    ("英语角开始报名了，截止到本周日，要报的抓紧",  "notice", "NULL"),
    ("有人晕倒了，快来人",                       "safety",  "NULL"),
    # —— C 组：故意不该成功的（不属提取任务）——
    ("有没有人今晚一起去操场跑步的",              "非提取任务(互助)", None),
    ("感觉这学期什么活动都没赶上，有点失落",       "非提取任务(情绪)", None),
]

N_A = 6
N_B = 2
MAX_NEW = 256
TIMEOUT = 180


def post_chat(messages, model=MODEL):
    """打 OpenAI 兼容接口，返回 (content, 耗时秒)"""
    import urllib.request

    payload = json.dumps({
        "model": model,
        "temperature": 0,
        "max_tokens": MAX_NEW,
        "messages": messages,
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{BASE_URL}/v1/chat/completions",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_KEY}",
        },
        method="POST",
    )
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        body = json.loads(r.read().decode("utf-8"))
    dt = time.time() - t0
    return body["choices"][0]["message"]["content"], dt


def parse_json_safe(raw):
    """剥壳后解析（模型可能带 ```json 围栏或前后说明）"""
    s = raw.strip()
    if s.startswith("```"):
        parts = s.split("```")
        if len(parts) >= 2:
            s = parts[1]
            if s.lower().startswith("json"):
                s = s[4:]
    try:
        return json.loads(s.strip())
    except Exception:
        i, j = raw.find("{"), raw.rfind("}")
        if i != -1 and j > i:
            try:
                return json.loads(raw[i:j + 1])
            except Exception:
                return None
    return None


def load_locations():
    if not os.path.exists(LOCATIONS):
        print(f"⚠️  找不到权威表 {LOCATIONS} ⇒ 判据⑤（地点合法率）**跳过**，不算幻觉。")
        return None
    d = json.load(open(LOCATIONS, encoding="utf-8"))
    by_name, by_id = {}, {}
    for l in d["locations"]:
        by_name[l["name"]] = l
        by_id[l["id"]] = l
        for a in l.get("aliases", []):
            by_name.setdefault(a, l)
    print(f"权威表载入: {len(d['locations'])} 个地点")
    return {"by_name": by_name, "by_id": by_id}


def run_mode(mode, locs):
    """mode: 'user' = instruction 拼进 user；'system' = instruction 放 system"""
    print("\n" + "#" * 66)
    print(f"# 拼法：{mode}  —— "
          + ("instruction + '\\n' + text 都放 user（与训练一致）"
             if mode == "user" else
             "instruction 放 system，text 放 user（与 check_v10.py 一致）"))
    print("#" * 66)

    stat = dict(json_ok=0, type_ok=0, null_ok=0, loc_ok=0, loc_checked=0,
                loc_wrong=0, id_mismatch=0, generic=0)
    results = []
    t_all = 0.0

    for i, (text, expect, exp_bld) in enumerate(TESTS, 1):
        if mode == "user":
            msgs = [
                {"role": "system", "content": DEFAULT_SYSTEM},
                {"role": "user", "content": INSTRUCTION + "\n" + text},
            ]
        else:
            msgs = [
                {"role": "system", "content": INSTRUCTION},
                {"role": "user", "content": text},
            ]

        try:
            raw, dt = post_chat(msgs)
        except Exception as e:
            print(f"\n[{i}/{len(TESTS)}] ❌ 请求失败: {e}")
            results.append({"input": text, "error": str(e)})
            continue
        t_all += dt

        print("\n" + "=" * 66)
        print(f"[{i}/{len(TESTS)}] 输入: {text}")
        print(f"      期望 type={expect}  building={exp_bld}   ({dt:.1f}s)")
        print("-" * 66)
        print(raw.strip())
        print("-" * 66)

        rec = {"input": text, "expect": expect, "exp_building": exp_bld, "output": raw}

        parsed = parse_json_safe(raw)
        if parsed is None:
            print("  ❌ JSON 解析失败")
        else:
            stat["json_ok"] += 1
            print("  ✅ JSON 可解析")

            got_type = parsed.get("type")
            got_bld = parsed.get("building_name")
            got_id = parsed.get("building_id")
            rec.update(got_type=got_type, got_building=got_bld, got_id=got_id)
            print(f"     type={got_type}  severity={parsed.get('severity')}  "
                  f"building={got_bld}  id={got_id}")

            if i <= N_A:
                if got_type == expect:
                    stat["type_ok"] += 1
                    print("  ✅ type 正确")
                else:
                    print(f"  ❌ type 应为 {expect}，实为 {got_type}")

            if N_A < i <= N_A + N_B:
                if got_bld is None:
                    stat["null_ok"] += 1
                    print("  ✅ 正确输出 null（没提地点，不编造）")
                else:
                    print(f"  ❌ 应为 null，却编造了 {got_bld!r}")

            # ★★ 判据⑤：地点必须落在权威表里
            # ★ 权威表缺失时**跳过**，不能判负（曾实际踩到：6 条全被误报成幻觉）
            if i <= N_A and got_bld:
                if not locs:
                    print(f"  ⚠️ 权威表未载入 ⇒ 跳过地点合法性判定: {got_bld!r}")
                else:
                    stat["loc_checked"] += 1
                    hit = locs["by_name"].get(got_bld)
                    if hit:
                        stat["loc_ok"] += 1
                        print(f"  ✅ 地点在权威表内: {hit['name']} (id={hit['id']})")
                        if got_id and got_id != hit["id"]:
                            stat["id_mismatch"] += 1
                            print(f"  ⚠️ building_id 不符: 输出 {got_id}，应为 {hit['id']}")
                            rec["id_mismatch"] = True
                    else:
                        stat["loc_wrong"] += 1
                        print(f"  ❌ 地点不在权威表内（幻觉）: {got_bld!r}")
                        rec["loc_hallucinated"] = True

            desc = parsed.get("description", "")
            if any(g in desc for g in ("存在安全隐患", "服务调整", "请注意时间安排", "互助信息发布")):
                stat["generic"] += 1
                print(f"  ⚠️ description 套话回潮: {desc}")
                rec["generic_back"] = True

        results.append(rec)

    n = len(TESTS)
    print("\n" + "-" * 66)
    print(f"【{mode} 拼法 · 汇总】")
    print(f"  JSON 可解析率 : {stat['json_ok']}/{n} = {stat['json_ok']/n*100:.0f}%   (判据 ≥90%)")
    print(f"  type 准确率   : {stat['type_ok']}/{N_A} = {stat['type_ok']/N_A*100:.0f}%")
    print(f"  null 正确率   : {stat['null_ok']}/{N_B} = {stat['null_ok']/N_B*100:.0f}%")
    if locs and stat["loc_checked"]:
        print(f"  ★ 地点合法率 : {stat['loc_ok']}/{stat['loc_checked']} = "
              f"{stat['loc_ok']/stat['loc_checked']*100:.0f}%   （V10 核心目标）")
    else:
        print("  ★ 地点合法率 : 跳过（权威表未载入）")
    print(f"  building_id 不符: {stat['id_mismatch']} 条")
    print(f"  套话回潮      : {stat['generic']} 条")
    print(f"  平均耗时      : {t_all/max(1,len(TESTS)):.1f} s/条")
    return stat, results


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "both"

    print("=" * 66)
    print(" 已部署接口验收 —— 打 HTTP 接口，不加载模型")
    print("=" * 66)
    print(f"  地址  : {BASE_URL}")
    print(f"  模型名: {MODEL}")
    print(f"  Key   : {API_KEY[:8]}****")

    # 先探活
    try:
        import urllib.request
        req = urllib.request.Request(
            f"{BASE_URL}/v1/models",
            headers={"Authorization": f"Bearer {API_KEY}"})
        with urllib.request.urlopen(req, timeout=20) as r:
            print(f"  ✅ 服务在线，/v1/models 返回 {r.status}")
    except Exception as e:
        print(f"\n❌ 连不上 {BASE_URL}：{e}")
        print("   ① 服务起了吗  ② 地址/端口对吗  ③ Key 对吗")
        sys.exit(1)

    locs = load_locations()

    modes = ["user", "system"] if mode == "both" else [mode]
    all_stat = {}
    for m in modes:
        s, res = run_mode(m, locs)
        all_stat[m] = s
        json.dump(res, open(f"check_served_{m}.json", "w", encoding="utf-8"),
                  ensure_ascii=False, indent=2)
        print(f"  → 明细已存 check_served_{m}.json")

    if len(all_stat) == 2:
        print("\n" + "#" * 66)
        print("# ★ 两种拼法对比（决定告诉队友用哪种）")
        print("#" * 66)
        print(f"{'拼法':<10}{'JSON':>8}{'type':>8}{'null':>8}{'地点合法':>10}")
        for m in ["user", "system"]:
            s = all_stat[m]
            loc = (f"{s['loc_ok']}/{s['loc_checked']}" if s["loc_checked"] else "跳过")
            print(f"{m:<10}{s['json_ok']:>6}/{len(TESTS)}"
                  f"{s['type_ok']:>6}/{N_A}{s['null_ok']:>6}/{N_B}{loc:>10}")
        print()
        print("★ 判读：")
        print("  · 两者都 6/6 ⇒ 模型对拼法不敏感，用「与训练一致」的 user 拼法（默认）")
        print("  · user 更好 ⇒ 队友按 instruction + '\\n' + text 拼（推荐口径）")
        print("  · system 更好 ⇒ 队友按 instruction 放 system 拼")

    print("\n★ 门槛：地点合法率必须 **6/6 = 100%**、JSON 可解析率 100%。")
    print("  达不到 ⇒ 说明部署环境与训练环境不一致（换了量化基座 / 加载方式），要排查。")


if __name__ == "__main__":
    main()
