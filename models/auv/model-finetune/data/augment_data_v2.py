"""
数据扩增脚本 V2 — 第二轮训练用
改进：
1. 扩增到 1500 条
2. 加强类型边界数据（避免把事件主题当事件类型）
3. 强化枚举值格式约束
4. 增加"无明确楼层/时间"的样本
"""

import json
import random
import argparse
import os

INSTRUCTION = (
    "你是校园事件分析助手。请从用户描述中提取事件的结构化信息，严格输出JSON格式，"
    "不要任何其他文字，不要解释，不要聊天。字段说明："
    "type(事件类型，只能取以下5个值：safety/congestion/service/notice/mutual)、"
    "building_id(建筑ID)、building_name(建筑名称)、"
    "floor(楼层，如1F/2F，没有则为null)、"
    "severity(严重程度，只能取以下3个值：low/medium/high)、"
    "description(事件摘要)、"
    "estimated_wait_min(预计等待或持续时间，单位分钟，没有则为null)、"
    "time_window(时间段，只能取以下值：morning/noon/afternoon/evening/night/unknown)、"
    "advice(行动建议)"
)

# ========== 建筑列表 ==========
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
    ("垂直书院", "BLD_Vertical_Academy", [""]),
    ("听澜图书馆", "BLD_Tinglan_Library", ["1F", "2F", "3F", ""]),
    ("知谷", "BLD_Zhigu", [""]),
    ("大学生活动中心", "BLD_Activity_Center", [""]),
    ("工程训练中心", "BLD_Engineering_Center", ["1F", "2F", ""]),
    ("校史馆", "BLD_History_Museum", [""]),
    ("美术馆", "BLD_Art_Museum", [""]),
    ("音乐厅", "BLD_Music_Hall", [""]),
]

TIME_WINDOWS = ["morning", "noon", "afternoon", "evening", "night"]
TIME_WINDOW_NAMES = {
    "morning": "早上",
    "noon": "中午",
    "afternoon": "下午",
    "evening": "晚上",
    "night": "夜里"
}


def pick_building():
    building_name, building_id, floors = random.choice(BUILDINGS)
    floor = random.choice(floors)
    return building_name, building_id, floor


def make_output(event_type, building_id, building_name, floor, severity,
                description, wait_time, time_window, advice):
    """生成标准 JSON 输出"""
    return {
        "type": event_type,
        "building_id": building_id,
        "building_name": building_name,
        "floor": floor if floor else None,
        "severity": severity,
        "description": description,
        "estimated_wait_min": wait_time,
        "time_window": time_window,
        "advice": advice
    }


# ========== 拥堵类 (congestion) ==========
CONGESTION_SCENARIOS = [
    # (模板, 严重度, 等待时间范围, 时间段)
    ("{building}{floor}今天人特别多，排队排到门外了，{time}别去了", "high", (20, 50), "random"),
    ("{building}{floor}队伍一眼望不到头，要等{wait}分钟，{time}还是别去凑热闹了", "high", (25, 45), "random"),
    ("{building}{floor}爆满，{time}去了也白去，建议错峰", "high", (30, 60), "random"),
    ("刚从{building}{floor}出来，人巨多，{time}要等至少{wait}分钟", "high", (20, 40), "random"),
    ("{building}{floor}{time}人挺多的，要等一会儿，但还好", "medium", (10, 25), "random"),
    ("{building}{floor}今天比平时人多，大概等{wait}分钟吧", "medium", (10, 20), "random"),
    ("{building}{floor}有点挤，但还能接受，{time}高峰可能更严重", "medium", (5, 15), "random"),
    ("{building}{floor}今天{time}人不多，基本不用等", "low", (0, 5), "random"),
    # 类型边界强化：疫苗接种排队 = congestion（不是 vaccination）
    ("{building}{floor}疫苗接种排队老长了，{time}人特别多，要等{wait}分钟", "high", (30, 60), "random"),
    ("{building}{floor}今天打疫苗，队伍排到了街上，{time}别去了", "high", (40, 80), "random"),
    # 类型边界强化：讲座/活动占座 = congestion（不是 notice）
    ("{building}{floor}今天有讲座，座位全被占了，{time}去了没位置", "medium", (0, 0), "random"),
    ("{building}{floor}今晚有活动，人爆满，{time}别去了没座", "high", (0, 0), "random"),
    # 类型边界强化：招聘会排队 = congestion
    ("{building}{floor}今天招聘会，排队的人巨多，{time}要等好久", "high", (30, 50), "random"),
    # 更多场景
    ("{building}{floor}电梯排队排到楼梯口了，{time}还是爬楼梯吧", "medium", (5, 15), "random"),
    ("{building}{floor}自助机全坏了，人工窗口排大队，{time}要等很久", "high", (20, 40), "random"),
    ("{building}{floor}结账速度特别慢，{time}队伍越来越长", "medium", (15, 30), "random"),
]

CONGESTION_ADVICE = [
    "建议错峰前往，或选择其他替代地点",
    "目前人多，建议稍后再去",
    "如果不着急，建议避开高峰时段",
    "可考虑提前或延后前往，避开人流",
    "建议选择其他同类场所，减少等待",
    "人较多，请预留充足的等待时间",
]


def gen_congestion():
    template, severity, wait_range, tw = random.choice(CONGESTION_SCENARIOS)
    building_name, building_id, floor = pick_building()
    floor_display = f"{floor}" if floor else ""
    wait_time = random.randint(*wait_range) if wait_range != (0, 0) else None

    if tw == "random":
        time_window = random.choice(TIME_WINDOWS)
    else:
        time_window = tw
    time_name = TIME_WINDOW_NAMES[time_window]

    input_text = template.format(
        building=building_name,
        floor=floor_display,
        wait=wait_time if wait_time else "一会儿",
        time=time_name,
    )

    desc_building = f"{building_name}{floor}楼" if floor else building_name
    description = f"{desc_building}{time_name}时段人流量大，等待时间较长"

    advice = random.choice(CONGESTION_ADVICE)

    return input_text, make_output(
        "congestion", building_id, building_name, floor, severity,
        description, wait_time, time_window, advice
    )


# ========== 安全类 (safety) ==========
SAFETY_SCENARIOS = [
    ("{building}{floor}在施工，被围挡围起来了，过不去要绕路", "high", None, "unknown"),
    ("{building}{floor}地面特别滑，刚才有人差点摔了，大家小心", "medium", None, "random"),
    ("{building}{floor}今天有安全检查，暂时不让进", "medium", None, "unknown"),
    ("{building}{floor}门口积水很深，下雨天下不去脚", "high", None, "random"),
    ("{building}{floor}发生了点小事故，正在处理，大家先别过去", "high", None, "random"),
    ("{building}{floor}围栏倒了一块，路过的注意安全", "medium", None, "unknown"),
    ("{building}{floor}停电了，楼道特别黑，走路小心点", "medium", None, "random"),
    ("{building}{floor}今天消防演练，警报响了大家别慌", "low", None, "random"),
    ("{building}{floor}玻璃门碎了一地，别靠近，小心扎脚", "high", None, "unknown"),
    ("{building}{floor}门口有个大坑，晚上走路注意点", "medium", None, "night"),
    # 类型边界：自行车被盗风险 = safety（不是 mutual）
    ("{building}{floor}有辆车没锁，小心被偷，大家注意保管好东西", "medium", None, "random"),
    # 类型边界：实验事故 = safety（不是 service）
    ("{building}{floor}实验室出了点状况，正在处理，暂时别进", "high", None, "random"),
    # 更多场景
    ("{building}{floor}楼梯灯坏了，黑漆漆的，下楼小心", "medium", None, "evening"),
    ("{building}{floor}外面挂着的广告牌快掉了，走路离远点", "high", None, "unknown"),
    ("下雪了，{building}{floor}门口结冰了，特别滑，大家注意", "high", None, "morning"),
]

SAFETY_ADVICE = [
    "请远离相关区域，注意安全",
    "途经时请小心，听从现场指挥",
    "建议绕行，避免经过附近",
    "注意安全，等待官方通知后再前往",
    "请提高警惕，保护好个人财物",
    "雨雪天气路滑，请减速慢行",
]


def gen_safety():
    template, severity, wait_time, tw = random.choice(SAFETY_SCENARIOS)
    building_name, building_id, floor = pick_building()
    floor_display = f"{floor}" if floor else ""

    if tw == "random":
        time_window = random.choice(TIME_WINDOWS)
    else:
        time_window = tw
    time_name = TIME_WINDOW_NAMES.get(time_window, "")

    input_text = template.format(
        building=building_name,
        floor=floor_display,
        time=time_name,
    )

    desc_building = f"{building_name}{floor}楼" if floor else building_name
    description = f"{desc_building}存在安全隐患，请注意"

    advice = random.choice(SAFETY_ADVICE)

    return input_text, make_output(
        "safety", building_id, building_name, floor, severity,
        description, wait_time, time_window, advice
    )


# ========== 服务类 (service) ==========
SERVICE_SCENARIOS = [
    ("{building}{floor}今天维修，{time}不能用了，要去的改时间", "medium", None, "random"),
    ("{building}{floor}机器坏了，今天用不了，等明天吧", "medium", None, "unknown"),
    ("{building}{floor}系统升级，今天暂停服务", "medium", None, "unknown"),
    ("{building}{floor}货架都空了，说下午补货，要囤货的等补完再去", "low", None, "morning"),
    ("{building}{floor}今天放假不开放，别白跑一趟", "low", None, "unknown"),
    ("{building}{floor}{time}停水停电，记得提前做好准备", "high", 120, "random"),
    ("{building}{floor}今天提前关门，要办事的赶紧去", "medium", None, "afternoon"),
    ("{building}{floor}窗口减少了一半，办事速度慢了很多", "medium", None, "random"),
    # 类型边界：食堂菜不好吃 = service（不是 congestion）
    ("{building}{floor}今天的菜特别咸，打饭时跟阿姨说少放盐", "low", None, "noon"),
    # 类型边界：浴室维修 = service（不是 safety）
    ("{building}{floor}今天维修，{time}之后就不能用了，要去的早点", "medium", None, "random"),
    # 更多场景
    ("{building}{floor}充值系统坏了，充不了值，只能用现金", "medium", None, "unknown"),
    ("{building}{floor}今天只有一个窗口营业，办业务的速度很慢", "medium", None, "random"),
    ("{building}{floor}空调坏了，{time}特别热，尽量别待太久", "low", None, "afternoon"),
    ("{building}{floor}换了新系统，操作变慢了，办事多等会儿", "low", None, "morning"),
]

SERVICE_ADVICE = [
    "请调整时间安排，改日再前往",
    "建议选择其他替代方案",
    "请提前规划，避免影响行程",
    "如有紧急需求，请联系相关部门",
    "请关注后续通知，恢复后第一时间告知",
    "建议提前做好准备，合理安排时间",
]


def gen_service():
    template, severity, wait_time, tw = random.choice(SERVICE_SCENARIOS)
    building_name, building_id, floor = pick_building()
    floor_display = f"{floor}" if floor else ""

    if tw == "random":
        time_window = random.choice(TIME_WINDOWS)
    else:
        time_window = tw
    time_name = TIME_WINDOW_NAMES.get(time_window, "")

    input_text = template.format(
        building=building_name,
        floor=floor_display,
        time=time_name,
    )

    desc_building = f"{building_name}{floor}楼" if floor else building_name
    description = f"{desc_building}服务调整，请注意时间安排"

    advice = random.choice(SERVICE_ADVICE)

    return input_text, make_output(
        "service", building_id, building_name, floor, severity,
        description, wait_time, time_window, advice
    )


# ========== 通知类 (notice) ==========
NOTICE_SCENARIOS = [
    ("{building}{floor}今天{time}有个{event_name}，想去的早点去占座", "low", None, "random"),
    ("{building}{floor}{time}举办{event_name}，有兴趣的可以去看看", "low", None, "random"),
    ("通知：{building}{floor}{time}有{event_name}，免费开放", "low", None, "random"),
    ("{event_name}开始报名了，截止到{deadline}，要报的抓紧", "medium", None, "unknown"),
    ("{building}{floor}今天{time}放电影，免费的，片名{movie_name}", "low", None, "evening"),
    ("{building}{floor}新开了个{new_shop}，今天开业活动，人还挺多", "low", None, "random"),
    ("{building}{floor}下周有{event_name}，感兴趣的可以报名", "low", None, "unknown"),
    ("{event_name}结果出来了，名单在{building}{floor}门口贴着呢", "low", None, "afternoon"),
    # 类型边界：奖学金通知 = notice（不是 service）
    ("奖学金申请通知出来了，{building}{floor}可以领表，截止到{deadline}", "medium", None, "unknown"),
    # 类型边界：校运会 = notice（不是 congestion）
    ("{building}{floor}{time}举办校运会开幕式，大家可以去看", "low", None, "afternoon"),
    # 类型边界：讲座 = notice（如果只是通知信息，没有拥堵描述）
    ("{building}{floor}{time}有一场{event_name}，欢迎参加", "low", None, "random"),
    # 更多场景
    ("{building}{floor}明天{time}有招聘会，记得带简历", "low", None, "morning"),
    ("{event_name}延期了，新时间另行通知，关注{building}{floor}公告", "low", None, "unknown"),
    ("{building}{floor}本周六{time}有开放日，欢迎参观", "low", None, "afternoon"),
]

EVENT_NAMES = [
    "人工智能讲座", "创业分享会", "考研经验交流会", "英语角",
    "编程比赛", "设计展览", "音乐节", "社团招新",
    "辩论赛", "招聘会", "学术报告", "读书分享会",
    "摄影展", "书法比赛", "演讲比赛", "科技节",
    "文化节", "运动会开幕式", "毕业典礼", "开学典礼",
    "心理健康讲座", "职业规划分享会", "创新创业大赛", "学科竞赛培训",
]
MOVIE_NAMES = ["流浪地球2", "奥本海默", "盗梦空间", "星际穿越", "肖申克的救赎", "千与千寻", "阿甘正传", "霸王别姬"]
NEW_SHOPS = ["奶茶店", "咖啡店", "打印店", "文具店", "面包店", "书店", "眼镜店"]
DEADLINES = ["本周五", "下周一", "月底", "下周末", "本周日", "下周三"]

NOTICE_ADVICE = [
    "感兴趣的同学可前往参加",
    "有兴趣的请留意时间，提前到场",
    "更多信息请关注官方通知",
    "请提前报名，名额有限先到先得",
    "欢迎踊跃参与",
    "请携带相关材料准时参加",
]


def gen_notice():
    template, severity, wait_time, tw = random.choice(NOTICE_SCENARIOS)
    building_name, building_id, floors = random.choice(BUILDINGS)
    floor = random.choice(floors)
    floor_display = f"{floor}" if floor else ""

    if tw == "random":
        time_window = random.choice(TIME_WINDOWS)
    else:
        time_window = tw
    time_name = TIME_WINDOW_NAMES.get(time_window, "")

    input_text = template.format(
        building=building_name,
        floor=floor_display,
        time=time_name,
        event_name=random.choice(EVENT_NAMES),
        deadline=random.choice(DEADLINES),
        movie_name=random.choice(MOVIE_NAMES),
        new_shop=random.choice(NEW_SHOPS),
    )

    desc_building = f"{building_name}{floor}楼" if floor else building_name
    description = f"{desc_building}{time_name}将举办活动"

    advice = random.choice(NOTICE_ADVICE)

    return input_text, make_output(
        "notice", building_id, building_name, floor, severity,
        description, wait_time, time_window, advice
    )


# ========== 互助类 (mutual) ==========
MUTUAL_SCENARIOS = [
    ("求一个{time}一起去{building}的{partner_type}，有人一起吗", "low", None, "random"),
    ("有人在{building}丢了{item_name}，捡到的请联系我，谢谢", "medium", None, "unknown"),
    ("捡到{item_name}一个，失主请来{building}认领", "low", None, "unknown"),
    ("有没有人{time}一起拼车去{destination}，我{depart_time}出发", "low", None, "random"),
    ("求代取{item_name}，送到{building}给{reward}小费", "low", None, "random"),
    ("转让两张{ticket_name}的票，临时有事去不了，便宜出", "low", None, "unknown"),
    ("{building}{floor}有谁看到一个{item_name}吗？我昨天落那了", "medium", None, "random"),
    ("求帮忙{task}，{reward}感谢，有空的联系我", "low", None, "unknown"),
    # 类型边界：寻物启事 = mutual（不是 safety）
    ("谁捡到了我的{item_name}，在{building}附近丢的，挺急的，找到重谢", "medium", None, "unknown"),
    # 类型边界：拼车 = mutual（不是 notice）
    ("{time}有没有一起打车去{destination}的，AA，我在{building}出发", "low", None, "random"),
    # 更多场景
    ("求组队参加{event_name}，还差一个人，有意的联系", "low", None, "unknown"),
    ("有{building}附近的室友吗，想找人一起合租", "low", None, "unknown"),
    ("{building}{floor}有个{item_name}没人要吗？放了好几天了", "low", None, "afternoon"),
    ("求借{item_name}用一下，{reward}还你，急急急", "low", None, "morning"),
]

ITEM_NAMES = [
    "校园卡", "钥匙", "手机", "钱包", "书包",
    "雨伞", "水杯", "耳机", "笔记本电脑", "教科书",
    "身份证", "手表", "眼镜", "帽子", "手套",
    "充电宝", "充电器", "校园卡套", "自行车", "滑板",
]
DESTINATIONS = ["高铁站", "火车站", "机场", "市中心", "隔壁大学", "医院", "汽车站"]
PARTNER_TYPES = ["学习搭子", "饭搭子", "健身搭子", "跑步搭子", "自习搭子", "一起拼车的", "一起打球的"]
REWARDS = ["3元", "5元", "10元", "奶茶", "咖啡", "一顿饭", "请你喝奶茶"]
TICKET_NAMES = ["音乐节", "演唱会", "话剧", "电影票", "比赛门票", "展览", "游乐园"]
TASKS = ["取快递", "占座", "带饭", "打印资料", "搬东西", "代签"]
EVENT_NAMES_MUTUAL = ["编程比赛", "创业大赛", "篮球比赛", "辩论赛", "运动会", "知识竞赛"]


def gen_mutual():
    template, severity, wait_time, tw = random.choice(MUTUAL_SCENARIOS)
    building_name, building_id, floors = random.choice(BUILDINGS)
    floor = random.choice(floors)
    floor_display = f"{floor}" if floor else ""

    if tw == "random":
        time_window = random.choice(TIME_WINDOWS)
    else:
        time_window = tw
    time_name = TIME_WINDOW_NAMES.get(time_window, "")

    input_text = template.format(
        building=building_name,
        floor=floor_display,
        time=time_name,
        partner_type=random.choice(PARTNER_TYPES),
        item_name=random.choice(ITEM_NAMES),
        destination=random.choice(DESTINATIONS),
        depart_time=time_name,
        reward=random.choice(REWARDS),
        ticket_name=random.choice(TICKET_NAMES),
        task=random.choice(TASKS),
        event_name=random.choice(EVENT_NAMES_MUTUAL),
    )

    description = f"{building_name}附近有互助信息发布"

    advice = "有需要的同学可联系发布者，注意个人信息安全"

    return input_text, make_output(
        "mutual", building_id, building_name, floor, severity,
        description, wait_time, time_window, advice
    )


# ========== 生成主逻辑 ==========
GENERATORS = {
    "congestion": gen_congestion,
    "safety": gen_safety,
    "service": gen_service,
    "notice": gen_notice,
    "mutual": gen_mutual,
}


def main():
    parser = argparse.ArgumentParser(description="V2 数据扩增脚本")
    parser.add_argument("--num", type=int, default=1500, help="生成数量（不含已有手工数据）")
    parser.add_argument("--output", type=str, default="v2_train.json", help="输出文件名")
    parser.add_argument("--seed", type=int, default=42, help="随机种子")
    args = parser.parse_args()

    random.seed(args.seed)

    # 加载已有手工数据
    existing_path = os.path.join(os.path.dirname(__file__), "train.json")
    data = []
    if os.path.exists(existing_path):
        with open(existing_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        print(f"已加载 {len(data)} 条手工数据")

    # 平衡生成：每类数量差不多
    per_type = args.num // 5
    augmented = []

    for event_type, gen_func in GENERATORS.items():
        count = 0
        attempts = 0
        while count < per_type and attempts < per_type * 3:
            try:
                input_text, output_dict = gen_func()
                augmented.append({
                    "instruction": INSTRUCTION,
                    "input": input_text,
                    "output": json.dumps(output_dict, ensure_ascii=False)
                })
                count += 1
            except Exception:
                pass
            attempts += 1
        print(f"  {event_type}: 生成 {count} 条")

    data.extend(augmented)

    # 打乱顺序
    random.shuffle(data)

    # 保存
    output_path = os.path.join(os.path.dirname(__file__), args.output)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n扩增生成 {len(augmented)} 条，总计 {len(data)} 条")
    print(f"保存到: {output_path}")


if __name__ == "__main__":
    main()
