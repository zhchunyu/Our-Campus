"""
数据扩增脚本 —— 基于模板批量生成训练数据
用法：python augment_data.py --num 500
"""

import json
import random
import argparse
import os

# ========== 模板库 ==========

EVENT_TEMPLATES = {
    "congestion": [
        # (模板, 建筑名, 建筑ID, 楼层, 严重度, 等待时间, 时间段, 建议模板)
        ("{building}{floor}排队老长了，大概要等{wait}分钟，{time}别去了", "high"),
        ("{building}{floor}人巨多，排到门外了，{time}去肯定来不及", "high"),
        ("{building}{floor}今天人特别多，要等{wait}分钟，建议错峰", "medium"),
        ("{building}{floor}排起了长队，{time}还是别去凑热闹了", "medium"),
        ("刚从{building}{floor}出来，队伍一眼望不到头，{time}要等{wait}分钟", "high"),
        ("{building}{floor}今天爆满，{time}建议换个地方", "high"),
    ],
    "safety": [
        ("{building}{floor}在施工，被围挡围起来了，过不去要绕路", "high"),
        ("{building}{floor}地面特别滑，刚才有人差点摔了，大家小心", "medium"),
        ("{building}{floor}今天有安全检查，暂时不让进", "medium"),
        ("{building}{floor}门口积水很深，下雨天下不去脚", "high"),
        ("{building}{floor}发生了点小事故，正在处理，大家先别过去", "high"),
        ("{building}{floor}围栏倒了一块，路过的注意安全", "medium"),
    ],
    "service": [
        ("{building}{floor}今天维修，{time}不能用了，要去的改时间", "medium"),
        ("{building}{floor}机器坏了，今天用不了，等明天吧", "medium"),
        ("{building}{floor}系统升级，今天暂停服务", "medium"),
        ("{building}{floor}货架都空了，说下午补货，要囤货的等补完再去", "low"),
        ("{building}{floor}今天放假不开放，别白跑一趟", "low"),
        ("{building}{floor}{time}停水停电，记得提前做好准备", "high"),
    ],
    "notice": [
        ("{building}{floor}今天{time}有个{event_name}，想去的早点去占座", "low"),
        ("{building}{floor}{time}举办{event_name}，有兴趣的可以去看看", "low"),
        ("通知：{building}{floor}{time}有{event_name}，免费开放", "low"),
        ("{event_name}开始报名了，截止到{deadline}，要报的抓紧", "medium"),
        ("{building}{floor}今天{time}放电影，免费的，片名{movie_name}", "low"),
        ("{building}{floor}新开了个{new_shop}，今天开业活动，人还挺多", "medium"),
    ],
    "mutual": [
        ("求一个{time}一起去{building}的{partner_type}，有人一起吗", "low"),
        ("有人在{building}丢了{item_name}，捡到的请联系我，谢谢", "medium"),
        ("捡到{item_name}一个，失主请来{building}认领", "low"),
        ("有没有人{time}一起拼车去{destination}，我{depart_time}出发", "low"),
        ("求代取{item_name}，送到{building}给{reward}小费", "low"),
        ("转让两张{ticket_name}的票，临时有事去不了，便宜出", "low"),
    ],
}

# 建筑列表
BUILDINGS = [
    ("第一食堂", "BLD_Canteen_A", ["1F", "2F", "3F", ""]),
    ("第二食堂", "BLD_Canteen_B", ["1F", "2F", ""]),
    ("图书馆", "BLD_Library", ["1F", "2F", "3F", "4F", ""]),
    ("A教学楼", "BLD_Teaching_A", ["1F", "2F", "3F", "4F", "5F", ""]),
    ("B教学楼", "BLD_Teaching_B", ["1F", "2F", "3F", ""]),
    ("体育馆", "BLD_Gym", ["1F", "2F", ""]),
    ("学生活动中心", "BLD_Student_Center", [""]),
    ("行政楼", "BLD_Admin", ["1F", "2F", "3F", ""]),
    ("快递服务中心", "BLD_Express_Center", ["1F", ""]),
    ("校医院", "BLD_Hospital", ["1F", "2F", ""]),
    ("公共浴室", "BLD_Bathhouse", [""]),
    ("校园超市", "BLD_Supermarket", ["1F", ""]),
    ("打印店", "BLD_Print_Shop", ["1F", ""]),
    ("知行楼", "BLD_ZhiXing", [""]),
    ("C实验楼", "BLD_Lab_C", ["1F", "2F", "3F", ""]),
    ("学术报告厅", "BLD_Lecture_Hall", [""]),
    ("创新创业中心", "BLD_Innovation", [""]),
    ("北区宿舍", "BLD_Dorm_N", [""]),
    ("南区宿舍", "BLD_Dorm_S", [""]),
    ("3号宿舍楼", "BLD_Dorm_3", ["1F", "2F", "3F", "4F", ""]),
    ("5号宿舍楼", "BLD_Dorm_5", ["1F", "2F", "3F", ""]),
    ("暖廊", "BLD_Warm_Corridor", [""]),
    ("中轴路北段", "ROAD_Central_Axis_N", [""]),
    ("中轴路南段", "ROAD_Central_Axis_S", [""]),
    ("主校门", "GATE_Main", [""]),
    ("北校门", "GATE_North", [""]),
    ("南校门", "GATE_South", [""]),
    ("西校门", "GATE_West", [""]),
]

# 时间段
TIME_WINDOWS = ["morning", "noon", "afternoon", "evening", "night"]
TIME_WINDOW_NAMES = {
    "morning": "早上",
    "noon": "中午",
    "afternoon": "下午",
    "evening": "晚上",
    "night": "夜里"
}

# 事件名称
EVENT_NAMES = [
    "人工智能讲座", "创业分享会", "考研经验交流会", "英语角",
    "编程比赛", "设计展览", "音乐节", "社团招新晚会",
    "电影放映", "辩论赛", "招聘会", "学术报告",
    "摄影展", "书法比赛", "演讲比赛", "读书分享会",
]

# 物品
ITEM_NAMES = [
    "校园卡", "钥匙", "手机", "钱包", "书包",
    "雨伞", "水杯", "耳机", "笔记本电脑", "教科书",
    "身份证", "手表", "眼镜", "帽子", "手套",
]

# 其他
DESTINATIONS = ["高铁站", "火车站", "机场", "市中心", "隔壁大学", "医院"]
PARTNER_TYPES = ["学习搭子", "饭搭子", "健身搭子", "跑步搭子", "自习搭子", "一起拼车的"]
REWARDS = ["3元", "5元", "10元", "奶茶", "咖啡", "一顿饭"]
MOVIE_NAMES = ["流浪地球2", "奥本海默", "盗梦空间", "星际穿越", "肖申克的救赎", "千与千寻"]
NEW_SHOPS = ["奶茶店", "咖啡店", "打印店", "文具店", "面包店"]
DEADLINES = ["本周五", "下周一", "月底", "下周末", "本周日"]
TICKET_NAMES = ["音乐节", "演唱会", "话剧", "电影", "比赛门票", "展览"]

INSTRUCTION = "你是校园事件分析助手。请从用户描述中提取事件的结构化信息，输出JSON格式，包含以下字段：type(事件类型，取值safety/congestion/service/notice/mutual)、building_id(建筑ID)、building_name(建筑名称)、floor(楼层，没有则为null)、severity(严重程度，取值low/medium/high)、description(事件摘要)、estimated_wait_min(预计等待或持续时间，单位分钟，没有则为null)、time_window(时间段，取值morning/noon/afternoon/evening/night/unknown)、advice(行动建议)"


def random_wait_time(severity):
    if severity == "high":
        return random.randint(20, 50)
    elif severity == "medium":
        return random.randint(10, 25)
    else:
        return random.choice([None, random.randint(5, 15)])


def generate_description(event_type, building_name, floor, time_window, extra=None):
    """生成事件摘要"""
    time_name = TIME_WINDOW_NAMES.get(time_window, "")
    floor_str = f"{floor}楼" if floor else ""
    
    descs = {
        "congestion": [
            f"{building_name}{floor_str}{time_name}时段排队人数较多",
            f"{building_name}{floor_str}人流量大，等待时间较长",
            f"{building_name}{floor_str}{time_name}时段拥挤",
        ],
        "safety": [
            f"{building_name}{floor_str}存在安全隐患，请注意",
            f"{building_name}{floor_str}发生安全相关事件，正在处理",
            f"{building_name}{floor_str}有安全风险，请绕行",
        ],
        "service": [
            f"{building_name}{floor_str}服务调整，请注意时间",
            f"{building_name}{floor_str}临时调整运营安排",
            f"{building_name}{floor_str}设备维护中",
        ],
        "notice": [
            f"{building_name}{floor_str}{time_name}将举办活动",
            f"{building_name}{floor_str}发布新通知",
            f"{building_name}{floor_str}{time_name}有活动安排",
        ],
        "mutual": [
            f"{building_name}附近有互助信息",
            f"校园互助信息：与{building_name}相关",
            f"{building_name}附近有同学发布求助信息",
        ],
    }
    return random.choice(descs.get(event_type, ["校园事件"]))


def generate_advice(event_type, building_name, severity, time_window):
    """生成行动建议"""
    advice_map = {
        "congestion": [
            f"建议错峰前往{building_name}，或选择其他替代地点",
            f"{building_name}目前人多，建议稍后再去",
            f"如果不着急，建议避开{time_window}高峰时段",
            f"可考虑提前或延后前往，避开人流高峰",
        ],
        "safety": [
            f"请远离{building_name}相关区域，注意安全",
            f"途经{building_name}时请小心，听从现场指挥",
            f"建议绕行，避免经过{building_name}附近",
            f"注意安全，等待官方通知后再前往",
        ],
        "service": [
            f"如需使用{building_name}服务，请调整时间安排",
            f"建议改日前往{building_name}，或选择其他替代方案",
            f"请提前规划，避免因服务调整影响行程",
        ],
        "notice": [
            f"感兴趣的同学可前往{building_name}参加",
            f"有兴趣的请留意时间，提前到场",
            f"更多信息请关注官方通知",
        ],
        "mutual": [
            f"有需要的同学可联系发布者，注意个人信息安全",
            f"可在评论区或互助群进一步沟通",
            f"请注意核实对方身份，保障自身权益",
        ],
    }
    return random.choice(advice_map.get(event_type, ["请留意相关信息"]))


def generate_one():
    """生成一条训练数据"""
    event_type = random.choice(list(EVENT_TEMPLATES.keys()))
    templates = EVENT_TEMPLATES[event_type]
    template, severity = random.choice(templates)
    
    building_name, building_id, floors = random.choice(BUILDINGS)
    floor = random.choice(floors)
    floor_display = f"{floor}" if floor else ""
    
    time_window = random.choice(TIME_WINDOWS)
    time_name = TIME_WINDOW_NAMES[time_window]
    
    wait_time = random_wait_time(severity) if event_type in ("congestion", "safety", "service") else None
    
    # 填充模板变量
    extra_vars = {}
    if event_type == "notice":
        extra_vars["event_name"] = random.choice(EVENT_NAMES)
        extra_vars["deadline"] = random.choice(DEADLINES)
        extra_vars["movie_name"] = random.choice(MOVIE_NAMES)
        extra_vars["new_shop"] = random.choice(NEW_SHOPS)
    elif event_type == "mutual":
        extra_vars["partner_type"] = random.choice(PARTNER_TYPES)
        extra_vars["item_name"] = random.choice(ITEM_NAMES)
        extra_vars["destination"] = random.choice(DESTINATIONS)
        extra_vars["depart_time"] = time_name
        extra_vars["reward"] = random.choice(REWARDS)
        extra_vars["ticket_name"] = random.choice(TICKET_NAMES)
    
    try:
        input_text = template.format(
            building=building_name,
            floor=floor_display,
            wait=wait_time if wait_time else "一会儿",
            time=time_name,
            event_name=extra_vars.get("event_name", "活动"),
            deadline=extra_vars.get("deadline", "本周五"),
            movie_name=extra_vars.get("movie_name", "电影"),
            new_shop=extra_vars.get("new_shop", "新店"),
            partner_type=extra_vars.get("partner_type", "搭子"),
            item_name=extra_vars.get("item_name", "物品"),
            destination=extra_vars.get("destination", "市区"),
            depart_time=extra_vars.get("depart_time", "早上"),
            reward=extra_vars.get("reward", "5元"),
            ticket_name=extra_vars.get("ticket_name", "门票"),
        )
    except KeyError:
        # 模板变量不匹配就跳过
        return None
    
    description = generate_description(event_type, building_name, floor, time_window)
    advice = generate_advice(event_type, building_name, severity, time_window)
    
    output = {
        "type": event_type,
        "building_id": building_id,
        "building_name": building_name,
        "floor": floor if floor else None,
        "severity": severity,
        "description": description,
        "estimated_wait_min": wait_time,
        "time_window": time_window,
        "advice": advice,
    }
    
    return {
        "instruction": INSTRUCTION,
        "input": input_text,
        "output": json.dumps(output, ensure_ascii=False)
    }


def main():
    parser = argparse.ArgumentParser(description="校园事件训练数据扩增脚本")
    parser.add_argument("--num", type=int, default=500, help="生成数量")
    parser.add_argument("--output", type=str, default="augmented_train.json", help="输出文件名")
    parser.add_argument("--seed", type=int, default=42, help="随机种子")
    args = parser.parse_args()
    
    random.seed(args.seed)
    
    # 先加载已有的手工数据
    existing_path = os.path.join(os.path.dirname(__file__), "train.json")
    data = []
    if os.path.exists(existing_path):
        with open(existing_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        print(f"已加载 {len(data)} 条手工数据")
    
    # 生成扩增数据
    augmented = []
    attempts = 0
    max_attempts = args.num * 3  # 防止死循环
    
    while len(augmented) < args.num and attempts < max_attempts:
        item = generate_one()
        if item:
            augmented.append(item)
        attempts += 1
    
    data.extend(augmented)
    
    # 保存
    output_path = os.path.join(os.path.dirname(__file__), args.output)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"扩增生成 {len(augmented)} 条，总计 {len(data)} 条")
    print(f"保存到: {output_path}")


if __name__ == "__main__":
    main()
