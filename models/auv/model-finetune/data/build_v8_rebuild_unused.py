# -*- coding: utf-8 -*-
"""
V8 提取数据集构建 —— 事件结构化提取 LoRA（独立适配器）

相对 v3 的三处实质修正：
  1. ★★ advice 与 description 改为「由事件语义推导」，不再 random.choice
     —— v3 的根因：每个 gen_*() 里都是 advice = random.choice(POOL)
        导致「广告牌快掉了」配上「雨雪天气路滑，请减速慢行」
  2. ★ 去重：v3 有 400 条完全相同的 input（占 26%）
  3. ★ 补评估集：v3 只有 test.json 10 条，不足评估

数据来源：augment_data_v3.py 的事件模板（保留）+ 重新绑定语义化的 description/advice
输出：v8_extract_train.json + v8_extract_eval.json
"""

import json
import random
import re

random.seed(20261004)

# ============================================================
# 建筑清单（沿用 v3）
# ============================================================

BUILDINGS = [
    ("BLD_Canteen_A", "第一食堂", "1F"), ("BLD_Canteen_A", "第一食堂", "2F"),
    ("BLD_Canteen_B", "第二食堂", "1F"),
    ("BLD_Library", "图书馆", None), ("BLD_Library", "图书馆", "3F"),
    ("BLD_Teaching_A", "A教学楼", "1F"), ("BLD_Teaching_B", "B教学楼", "2F"),
    ("BLD_Dorm_N", "北区宿舍", None), ("BLD_Dorm_S", "南区宿舍", None),
    ("BLD_Gym", "体育馆", None), ("BLD_Stadium", "体育场", None),
    ("BLD_Hospital", "校医院", "1F"), ("BLD_Admin", "行政楼", "1F"),
    ("BLD_Supermarket", "校园超市", "1F"),
    ("BLD_Bathhouse", "公共浴室", None),
    ("BLD_Student_Center", "大学生活动中心", None),
    ("BLD_Engineering_Center", "工程训练中心", "1F"),
    ("BLD_Lab", "实验楼", "2F"),
    ("BLD_Art", "美术馆", None),
    ("BLD_History_Museum", "校史馆", None),
    ("BLD_Express_Center", "快递服务中心", "1F"),
    ("BLD_ZhiXing", "知行楼", None),
    ("BLD_Zhigu", "知谷", None),
    ("BLD_Auditorium", "学术报告厅", None),
    ("ROAD_Central_Axis_S", "中轴路南段", None),
    ("ROAD_Central_Axis_N", "中轴路北段", None),
    ("GATE_Main", "主校门", None), ("GATE_North", "北校门", None),
    ("GATE_South", "南校门", None), ("GATE_West", "西校门", None),
]

TIME_WINDOWS = ["morning", "noon", "afternoon", "evening", "night"]
TIME_NAMES = {
    "morning": "早上", "noon": "中午", "afternoon": "下午",
    "evening": "傍晚", "night": "晚上", "unknown": "",
}

INSTRUCTION = (
    "你是校园事件分析助手。请从用户描述中提取事件的结构化信息，输出JSON格式，"
    "包含以下字段：type(事件类型，取值safety/congestion/service/notice/mutual)、"
    "building_id(建筑ID)、building_name(建筑名称)、floor(楼层，没有则为null)、"
    "severity(严重程度，取值low/medium/high)、description(事件摘要)、"
    "estimated_wait_min(预计等待或持续时间，单位分钟，没有则为null)、"
    "time_window(时间段，取值morning/noon/afternoon/evening/night/unknown)、"
    "advice(行动建议)"
)

_SEEN = set()


def _mk(inp, out_dict):
    """去重入表"""
    key = inp.strip()
    if key in _SEEN:
        return None
    _SEEN.add(key)
    return {
        "instruction": INSTRUCTION,
        "input": inp,
        "output": json.dumps(out_dict, ensure_ascii=False),
    }


def _pack(bid, bname, floor, etype, sev, desc, wait, tw, advice):
    return {
        "type": etype,
        "building_id": bid,
        "building_name": bname,
        "floor": floor,
        "severity": sev,
        "description": desc,
        "estimated_wait_min": wait,
        "time_window": tw,
        "advice": advice,
    }


def _pick_building():
    return random.choice(BUILDINGS)


# ============================================================
# 一、拥堵类 —— (模板, 严重度, 等待时间基数, 时段, desc生成器, advice)
#     ★ 关键：每条模板绑定自己的 description 逻辑与 advice
# ============================================================

CONGESTION = [
    # (模板, sev, wait基, 时段策略, 事件名, advice)
    ("{b}{f}排队老长了，大概要等{w}分钟，{t}别去了", "high", (20, 50), "random", "排队等候", "建议错峰前往，或选择其他同类场所"),
    ("{b}{f}人巨多，排到门外了，{t}去肯定来不及", "high", None, "random", "人流拥挤", "建议改期或选择其他地点"),
    ("{b}{f}今天人特别多，要等{w}分钟，建议错峰", "medium", (10, 25), "random", "排队等候", "建议避开高峰时段前往"),
    ("{b}{f}排起了长队，{t}还是别去凑热闹了", "medium", None, "random", "排队等候", "建议延后再去"),
    ("刚从{b}{f}出来，队伍一眼望不到头，{t}要等{w}分钟", "high", (20, 50), "random", "排队等候", "建议错峰前往"),
    ("{b}{f}今天爆满，{t}建议换个地方", "high", None, "random", "人流拥挤", "建议选择其他替代地点"),
    ("{b}{f}今天{t}人挺多的，要等一会儿", "medium", None, "random", "人流较多", "不着急的话建议稍后再去"),
    ("{b}{f}比平时人多，大概等{w}分钟吧", "medium", (10, 25), "random", "排队等候", "建议预留充足等待时间"),
    ("{b}{f}疫苗接种排队老长了，{t}人特别多，要等{w}分钟", "high", (25, 55), "random", "疫苗接种排队", "建议避开当前时段，或咨询是否有其他接种点"),
    ("{b}{f}今天打疫苗，队伍排到了街上，{t}别去了", "high", None, "random", "疫苗接种排队", "建议改天再前往，或提前预约"),
    ("{b}{f}今天有讲座，座位全被占了，{t}去了没位置", "medium", None, "random", "讲座座位已满", "建议提前到场，或关注是否有线上直播"),
    ("{b}{f}今晚有活动，人爆满，{t}别去了没座", "high", None, "evening", "活动座位已满", "建议早点到，或选择其他场次"),
    ("{b}{f}今天招聘会，排队的人巨多，{t}要等好久", "high", (30, 60), "random", "招聘会排队", "建议错峰投递，或先线上投简历"),
    ("{b}{f}电梯排队排到楼梯口了，{t}还是爬楼梯吧", "medium", None, "random", "电梯排队", "建议走楼梯，既快又能顺便活动"),
    ("{b}{f}结账速度特别慢，{t}队伍越来越长", "medium", (10, 25), "random", "结账排队", "建议换个收银台，或等人少时再来"),
    ("{b}{f}早餐时段排到门口了，{t}还没吃上饭快迟到了", "high", (10, 25), "morning", "早餐排队", "建议换个窗口，或买点方便的带走"),
    ("{b}{f}午餐人最多，{t}要等{w}分钟", "high", (20, 45), "noon", "午餐排队", "建议错峰就餐，或提前一点去"),
    ("{b}{f}取快递的人特别多，{t}排了半小时还没到", "high", (25, 45), "afternoon", "取件排队", "建议晚点再来，或使用自助取件柜"),
    # 补充真实场景
    ("{b}{f}自习位置全满了，{t}找不到座", "medium", None, "random", "座位已满", "建议换楼层看看，或去其他自习点"),
    ("{b}{f}打印队伍排到门外了，{t}等着急用", "high", (15, 35), "random", "打印排队", "建议换一家打印店，或错开高峰"),
    ("{b}{f}洗澡排队排到走廊了，{t}人特别多", "high", (15, 40), "evening", "洗浴排队", "建议换个时段，或晚点再去"),
    ("{b}{f}篮球场全被占了，{t}没地方打球", "medium", None, "afternoon", "场地已满", "建议去其他场地，或预约下一个时段"),
    ("{b}{f}洗衣机全在用，{t}得排队等", "medium", (15, 35), "random", "洗衣机占用", "建议过一小时再来，或换楼层看看"),
    ("{b}{f}办手续排队很久，{t}至少等{w}分钟", "medium", (20, 45), "morning", "办事排队", "建议提前预约，或换个时间段来"),
    ("{b}{f}电梯口挤满了人，早八等不到电梯", "high", None, "morning", "电梯拥堵", "建议提前出门，或直接走楼梯"),
]


def gen_congestion():
    data = []
    for tmpl, sev, wait_rng, tw_policy, event_name, advice in CONGESTION:
        # 每条模板 × 6 个建筑 × 多时段，生成真实分布
        for _ in range(14):
            bid, bname, floor = _pick_building()
            fd = floor if floor else ""
            if wait_rng:
                wait = random.randint(*wait_rng)
            else:
                wait = None

            tw = random.choice(TIME_WINDOWS) if tw_policy == "random" else tw_policy
            tname = TIME_NAMES[tw]

            inp = tmpl.format(b=bname, f=fd, w=wait if wait else 0, t=tname)
            # 清理模板里未被替换的 {w}（当 wait 为 None 时）
            inp = re.sub(r"要等\s*\d+\s*分钟", "要等一会儿", inp) if wait is None else inp
            inp = inp.replace("，大概要等一会儿，", "，")

            time_desc = f"{tname}时段" if tw != "unknown" and tname else ""
            desc_b = f"{bname}{floor}楼" if floor else bname
            if wait:
                description = f"{desc_b}{time_desc}{event_name}，等待约{wait}分钟"
            else:
                description = f"{desc_b}{time_desc}{event_name}"

            out = _pack(bid, bname, floor, "congestion", sev, description,
                        wait, tw, advice)
            item = _mk(inp, out)
            if item:
                data.append(item)
    return data


# ============================================================
# 二、安全类 —— ★ 这类的 advice 错配最严重，逐条绑定
# ============================================================

SAFETY = [
    # (模板, sev, 时段, 事件摘要, advice)
    ("{b}{f}在施工，被围挡围起来了，过不去要绕路", "high", "unknown",
     "施工围挡占道，通行受阻", "建议绕行，避开施工区域"),
    ("{b}{f}地面特别滑，刚才有人差点摔了，大家小心", "medium", "random",
     "地面湿滑，存在滑倒风险", "途经时请放慢脚步，注意脚下"),
    ("{b}{f}今天有安全检查，暂时不让进", "medium", "unknown",
     "安全检查期间暂停进入", "请配合检查，等开放后再前往"),
    ("{b}{f}门口积水很深，下雨天下不去脚", "high", "random",
     "门口积水较深，通行不便", "建议绕行，或穿防水鞋通过"),
    ("{b}{f}发生了点小事故，正在处理，大家先别过去", "high", "random",
     "现场发生事故，正在处理中", "请勿靠近现场，等待处理完毕"),
    ("{b}{f}围栏倒了一块，路过的注意安全", "medium", "unknown",
     "围栏破损，存在安全隐患", "途经时请绕开破损区域"),
    ("{b}{f}停电了，楼道特别黑，走路小心点", "medium", "random",
     "停电导致楼道照明不足", "建议使用手机照明，慢行通过"),
    ("{b}{f}今天消防演练，警报响了大家别慌", "low", "random",
     "消防演练，警报鸣响", "属于正常演练，不必惊慌"),
    ("{b}{f}玻璃门碎了一地，别靠近，小心扎脚", "high", "unknown",
     "玻璃门破碎，碎片散落", "请勿靠近，注意避开碎玻璃"),
    ("{b}{f}门口有个大坑，晚上走路注意点", "medium", "night",
     "路面有坑洞，存在跌倒风险", "夜间途经请特别注意脚下"),
    ("{b}{f}有辆车没锁，小心被偷，大家注意保管好东西", "medium", "random",
     "车辆未锁，存在被盗风险", "请锁好个人车辆，注意财物安全"),
    ("{b}{f}实验室出了点状况，正在处理，暂时别进", "high", "random",
     "实验室发生异常状况", "请勿进入，等待处理结果"),
    ("{b}{f}楼梯灯坏了，黑漆漆的，下楼小心", "medium", "evening",
     "楼梯照明损坏", "下楼时请扶好扶手，使用手机照明"),
    ("下雪了，{b}{f}门口结冰了，特别滑，大家注意", "high", "morning",
     "门口路面结冰，极易滑倒", "请小心慢行，尽量扶稳再走"),
    ("{b}{f}外面挂着的广告牌快掉了，走路离远点", "high", "unknown",
     "广告牌固定不牢，有坠落风险", "请绕开该区域行走，远离建筑物外墙"),
    ("下雨天{b}{f}台阶特别滑，刚才差点摔了", "medium", "afternoon",
     "雨天台阶湿滑", "上下台阶请扶好扶手，放慢速度"),
    # 补充真实场景
    ("{b}{f}有人翻越围栏进去，被保安发现了", "medium", "random",
     "有人违规翻越围栏", "请从正规出入口通行"),
    ("{b}{f}的电动车充电桩冒烟了，赶紧别用", "high", "random",
     "充电桩出现冒烟现象", "立即停止使用，远离该设备并上报"),
    ("{b}{f}消防通道被自行车堵住了", "medium", "unknown",
     "消防通道被占用", "请勿在消防通道停放车辆"),
    ("{b}{f}有陌生人在楼道里转悠，看着可疑", "medium", "night",
     "出现可疑人员徘徊", "注意自身安全，必要时联系保卫处"),
    ("{b}{f}的水管爆了，地上全是水", "high", "random",
     "水管爆裂，地面积水", "绕行该区域，注意防滑"),
    ("{b}{f}门口有人吵架，围观的人很多", "low", "random",
     "门口出现人员争执", "建议绕开，不必围观"),
]


def gen_safety():
    data = []
    for tmpl, sev, tw_policy, desc_event, advice in SAFETY:
        for _ in range(14):
            bid, bname, floor = _pick_building()
            fd = floor if floor else ""
            tw = random.choice(TIME_WINDOWS) if tw_policy == "random" else tw_policy
            tname = TIME_NAMES[tw]

            inp = tmpl.format(b=bname, f=fd, t=tname)
            desc_b = f"{bname}{floor}楼" if floor else bname
            time_desc = f"{tname}时段" if tname and tw != "unknown" else ""
            description = f"{desc_b}{time_desc}{desc_event}"

            out = _pack(bid, bname, floor, "safety", sev, description, None, tw, advice)
            item = _mk(inp, out)
            if item:
                data.append(item)
    return data


# ============================================================
# 三、服务类
# ============================================================

SERVICE = [
    ("{b}{f}今天维修，{t}不能用了，要去的改时间", "medium", "random",
     "设备维修，服务暂停", "建议改到其他时间前往"),
    ("{b}{f}机器坏了，今天用不了，等明天吧", "medium", "unknown",
     "设备故障，暂停使用", "建议改天再来，或换其他设备"),
    ("{b}{f}系统升级，今天暂停服务", "medium", "unknown",
     "系统升级，服务暂停", "建议等服务恢复后再办理"),
    ("{b}{f}换了新系统，操作变慢了，办事多等会儿", "low", "random",
     "系统更换，办理效率下降", "建议预留更多办理时间"),
    ("{b}{f}今天窗口只开一个，办业务要等很久", "medium", "random",
     "窗口减少，办理缓慢", "建议提前预约，或换其他时段"),
    ("{b}{f}的网络断了，暂时连不上", "medium", "random",
     "网络中断，服务受影响", "建议换地方，或等网络恢复"),
    ("{b}{f}今天提前关门，下午四点就停了", "low", "afternoon",
     "提前结束服务", "请提前安排好时间"),
    ("{b}{f}的空调坏了，里面特别热", "low", "random",
     "空调故障，环境温度偏高", "建议缩短停留时间"),
    ("{b}{f}暂时停水了，洗手间用不了", "medium", "random",
     "停水导致设施无法使用", "建议使用其他楼栋的设施"),
    ("{b}{f}货架都空了，说下午补货", "low", "random",
     "货品售空，等待补货", "建议补货后再来，或去其他超市"),
]


def gen_service():
    data = []
    for tmpl, sev, tw_policy, desc_event, advice in SERVICE:
        for _ in range(14):
            bid, bname, floor = _pick_building()
            fd = floor if floor else ""
            tw = random.choice(TIME_WINDOWS) if tw_policy == "random" else tw_policy
            tname = TIME_NAMES[tw]
            inp = tmpl.format(b=bname, f=fd, t=tname)
            desc_b = f"{bname}{floor}楼" if floor else bname
            time_desc = f"{tname}时段" if tname and tw != "unknown" else ""
            description = f"{desc_b}{time_desc}{desc_event}"
            out = _pack(bid, bname, floor, "service", sev, description, None, tw, advice)
            item = _mk(inp, out)
            if item:
                data.append(item)
    return data


# ============================================================
# 四、通知类
# ============================================================

NOTICE = [
    ("通知：{b}{f}{t}有音乐会，免费开放", "low", "afternoon",
     "举办音乐会，免费开放", "感兴趣的同学可前往参加"),
    ("{b}{f}今天{t}有讲座，感兴趣可以去听", "low", "random",
     "举办讲座", "感兴趣的同学可前往参加"),
    ("{b}{f}明天开始报名，截止到周五", "low", "unknown",
     "开始报名，有截止时间", "请留意报名截止时间，及时提交"),
    ("{b}{f}这周有招聘会，可以去看看", "low", "random",
     "举办招聘会", "有兴趣的同学可携带简历前往"),
    ("{b}{f}的开放时间改了，{t}不开放", "low", "random",
     "开放时间调整", "请留意最新开放时间安排"),
    ("{b}{f}要检修，明天全天关闭", "medium", "unknown",
     "检修期间暂停开放", "请提前调整安排"),
    ("{b}{f}新增了自助服务，不用排队了", "low", "unknown",
     "新增自助服务设施", "可使用自助设备，节省排队时间"),
    ("{b}{f}{t}有活动，有空可以去看看", "low", "random",
     "举办校园活动", "感兴趣的同学可前往参与"),
    ("{b}{f}的座位可以线上预约了", "low", "unknown",
     "开放线上预约功能", "建议提前线上预约，避免跑空"),
    ("{b}{f}这周有展览，作品都是学生做的", "low", "random",
     "举办学生作品展", "感兴趣的同学可前往参观"),
]


def gen_notice():
    data = []
    for tmpl, sev, tw_policy, desc_event, advice in NOTICE:
        for _ in range(14):
            bid, bname, floor = _pick_building()
            fd = floor if floor else ""
            tw = random.choice(TIME_WINDOWS) if tw_policy == "random" else tw_policy
            tname = TIME_NAMES[tw]
            inp = tmpl.format(b=bname, f=fd, t=tname)
            desc_b = f"{bname}{floor}楼" if floor else bname
            time_desc = f"{tname}时段" if tname and tw != "unknown" else ""
            description = f"{desc_b}{time_desc}{desc_event}"
            out = _pack(bid, bname, floor, "notice", sev, description, None, tw, advice)
            item = _mk(inp, out)
            if item:
                data.append(item)
    return data


# ============================================================
# 五、互助类
# ============================================================

MUTUAL = [
    ("求组队参加{act}，还差一个人，有意的联系", "low", "unknown",
     "招募组队参加{act}", "有意者请直接联系发布者"),
    ("求帮忙{task}，{num}元感谢，有空的联系我", "low", "unknown",
     "征集帮忙{task}的同学", "有时间的同学可联系发布者"),
    ("转让两张{obj}门票，临时有事去不了，便宜出", "low", "unknown",
     "转让{obj}门票", "有需要的同学可联系发布者，注意核实"),
    ("有人在{bld}丢了{obj}，里面有证件，捡到请联系", "low", "unknown",
     "在{bld}丢失{obj}", "拾到的同学请联系失主或送交失物招领"),
    ("{bld}附近有一起合租的吗，找室友", "low", "unknown",
     "在{bld}附近寻找合租室友", "有意者可联系发布者，注意核实身份"),
    ("有没有人一起拼单，差一个人", "low", "unknown",
     "征集拼单同伴", "有意者可联系发布者"),
    ("求借一个{obj}，用完就还，谢谢", "low", "unknown",
     "借用{obj}", "有闲置的同学可联系发布者"),
    ("{bld}捡到一张校园卡，失主请联系", "low", "unknown",
     "在{bld}拾到校园卡", "失主可联系拾到者，或前往失物招领处"),
]


def gen_mutual():
    data = []
    activities = ["辩论赛", "编程比赛", "篮球比赛", "创业大赛", "数学建模", "英语演讲比赛"]
    tasks = ["打印资料", "带一份饭", "取快递", "占个座", "代买杯咖啡"]
    objects = ["演唱会门票", "音乐节门票", "比赛门票", "校园卡", "钱包", "钥匙", "雨伞", "充电宝"]
    numbers = ["5", "8", "10", "15", "20"]

    for tmpl, sev, tw_policy, desc_tmpl, advice in MUTUAL:
        for _ in range(14):
            bid, bname, floor = _pick_building()
            act = random.choice(activities)
            task = random.choice(tasks)
            obj = random.choice(objects)
            num = random.choice(numbers)

            inp = tmpl.format(bld=bname, act=act, task=task, obj=obj, num=num)
            desc = desc_tmpl.format(bld=bname, act=act, task=task, obj=obj)
            out = _pack(bid, bname, floor, "mutual", sev, desc, None, "unknown", advice)
            item = _mk(inp, out)
            if item:
                data.append(item)
    return data


# ============================================================
# 主函数
# ============================================================

def main():
    all_data = []
    gens = [
        ("拥堵", gen_congestion),
        ("安全", gen_safety),
        ("服务", gen_service),
        ("通知", gen_notice),
        ("互助", gen_mutual),
    ]

    for name, fn in gens:
        d = fn()
        all_data.extend(d)
        print(f"{name}类：{len(d)} 条")

    # 去重
    seen = set()
    deduped = []
    for x in all_data:
        if x["input"] not in seen:
            seen.add(x["input"])
            deduped.append(x)

    print(f"\n生成 {len(all_data)} 条 → 去重后 {len(deduped)} 条")

    # 划分训练/评估（评估集 10%，最少 100 条，最多不超过 15%）
    random.shuffle(deduped)
    n_eval = max(100, len(deduped) // 10)
    n_eval = min(n_eval, int(len(deduped) * 0.15))
    ev = deduped[:n_eval]
    tr = deduped[n_eval:]

    with open("v8_extract_train.json", "w", encoding="utf-8") as f:
        json.dump(tr, f, ensure_ascii=False, indent=2)
    with open("v8_extract_eval.json", "w", encoding="utf-8") as f:
        json.dump(ev, f, ensure_ascii=False, indent=2)

    print(f"训练集 {len(tr)} 条 → v8_extract_train.json")
    print(f"评估集 {len(ev)} 条 → v8_extract_eval.json")

    # 统计
    import collections
    types = collections.Counter(json.loads(x["output"])["type"] for x in deduped)
    print("\n=== 类型分布 ===")
    for k, v in types.most_common():
        print(f"  {k}: {v} ({v / len(deduped) * 100:.1f}%)")

    adv = collections.Counter(json.loads(x["output"])["advice"] for x in deduped)
    print(f"\n=== advice 去重: {len(adv)} 种（v3 只有 69 种）===")


if __name__ == "__main__":
    main()
