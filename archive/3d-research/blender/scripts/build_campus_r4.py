# -*- coding: utf-8 -*-
"""
build_campus_r4.py —— 山河大学 R4：智慧环廊（V2 锚点 2）
================================================================
由 run_campus.py 的 build_extra 串联在 stage1/2/3 与 R0~R3 之后执行，
**共享同一个 globals**，可直接复用：
  - 场地：box / ribbon / cap / band / band_open / round_rect / resample /
          scale_poly / signed_area / offset_poly / GZ / Z_TOP / C_BLD / C_PAVE /
          C_ROAD / C_GREEN / C_ANCHOR / W()
  - R0：bar3d / side_frames / fin_box / corners / frustum / mini_tree
  - R2：truss_band / fin_facade / para_ring / hand_rail / rim_edge
  - R3：**_vz（筒壳剖面）** / colonnade / strip_windows / rim_band / pilasters /
        eave_rafters / _resample_loop / shell_ridges
**不要再写 make_mat 定义新材质**：同名材质第二次调用会被静默忽略（R1 踩过 3 轮）。

────────────────────────────────────────────────────────────────
V2 锚点 2 原文（§三）
────────────────────────────────────────────────────────────────
| 形态 | 全长约 1.2 km 的高架连续连廊，串联七区，宽 9~15 m，标高 +6 m |
| 构造 | 胶合木拱 + 钢索；顶棚 BIPV 光伏；侧面竹木格栅 + 可开启天窗 |
| 未来功能 | 环境传感节点（温/湿/风/气/声）· 人流导航 · 夜间媒体界面 · 应急避难通道 |
| 与产品耦合 | **这就是队友那套 AI 系统的物理载体**：连廊节点即数据采集点 |
| 借鉴 | 纽约 High Line · 首尔路 7017 · 腾讯滨海大厦连桥 |

────────────────────────────────────────────────────────────────
实施中的四处修正（汇报时逐条说明）
────────────────────────────────────────────────────────────────
■ 修正 1：长度 1.2 km → **1.56 km**（V3 重排后 1556 m）
  1.2 km 是"内环次路"（`INNER = scale_poly(RING_ROAD, 0.52, 0, 430)`）的周长。
  内环的南缘在 Y 196~236，**够不到生活区**（生活区在 Y 24~134），
  "串联七区"只做到五区。南延段净增约 350 m → 全长 1556 m。

■ 修正 2：**环廊不跨越案山土丘，而是绕过去**
  内环南边是一条直线 Y=256.32，距案山土丘（圆心 (0,244.8)、R 48、顶 Z 12）
  只有 11.5 m —— 桥面在 Z 9.0 会被土丘埋掉。两个选项：(a) 局部起拱跨过；
  (b) 南段外扩绕开。选 (b)：1.6 km 的连续体上一个 6 m 驼峰会毁掉整条廊的节奏，
  而且"绕山"比"跨山"更符合风水上的"环抱"（环廊把案山抱在怀里）。
  绕行后土丘处净距 **82 m**。

■ 修正 3：**北端下移，让开垂直书院的台基**
  内环北点 (0, 628.64) 而 R0 垂直书院台基 42×42 @ (0, 648)（Y 627~669）
  —— 环廊会直接穿进台基。北端改到 **(0, 596)**，落在图书馆（Y 473~559）
  与垂直书院（Y 622~708）之间的空档里，**中轴上的第二个节点**
  （第一个是南端 **(0, 146)**，跨在下沉智谷上）。

■ 修正 4：**桥面标高取 +6.0 m（Z 9.00）不变，但净空按"最矮处"校核**
  最紧张的两处：案山南坡（已绕开，无净空问题）、下沉智谷谷底 Z −5.0（净空 14 m）。
  两处都够，标高不动。

────────────────────────────────────────────────────────────────
设计（v2 —— 断面从"扁板"改成"连续筒壳廊"）
────────────────────────────────────────────────────────────────
■ v1 的问题：断面 12 m 宽 × 2.95 m 净高 = 4:1，从外面读成"桥面 + 一块挡板"，
  完全不像"廊"。**R3 的铁律在这里同样成立：扁不是因为不够高，是因为没有檐。**
  R3 的结论是"盒子扣壳一定读成机库 —— 缺的不是曲面，是檐"；
  对一条 1.6 km 的连廊，缺的是**同一件事：明确的脊—坡—檐三段 + 檐下的阴影**。

■ 断面（自下而上）：
  · 桥面 Z 8.45~9.00（12 m 宽、0.55 厚）—— V2 定死的 +6.0 m
  · 纵梁 2 道 ±5.40（1.0 × 1.05），Z 7.40~8.45 —— v7 由 1.55 压到 1.05（见常量处注释）
  · 桥面板底横肋 @6 m（0.24 × 0.35）—— R0 的教训：大面积单一平面必须给它结构
  · **连续筒壳**：跨 **14.6 m**（= 桥面 12 m + 两侧各出檐 1.30 m），
    矢高 **3.20 m**，厚 0.22，剖面用 R3 的 `_vz(p=1.8)` → **脊平檐陡 = 中式"举折"**
    檐口 Z 13.20 / 正脊 Z 16.40 → 净高 檐下 **4.20 m**、脊下 **7.40 m**（v1 只有 2.95）
  · **主肋（胶合木）** @12 m，截面 0.55 方，沿壳下皮 —— 读作"梁架"
  · **次肋（胶合木）** @4 m（= 主肋的 1/3），截面 0.20 方 —— 读作"椽"
  · **壳外脊条** @主肋位置，0.24 方、贴壳上皮 —— 对应 R3 大礼堂"外铜垄 10 道 / 92 m"
  · 斜拉索：每道主肋 2 根，从 1/4 跨点斜拉到桥面 —— 读作"编织"（R0/R2 语言）
  · **天窗带**：v = ±(3.30~4.70) 处凸出壳面 0.06 的玻璃条（"可开启天窗"）
  · **BIPV 带**：v = ±2.25 处凸出壳面 0.05 的深色光伏板（V2 的"顶棚 BIPV"）。
    壳本身仍用 R3 定案的钛锌 —— **"壳 = 钛锌"是 R3 定死的语言，不能破**；
    光伏板作为脊上的深色带叠上去，屋面于是读成七段：
    钛锌 2.60 | 天窗 1.40 | 钛锌 1.05 | **BIPV 4.50** | 钛锌 1.05 | 天窗 1.40 | 钛锌 2.60
  · **檐口带**：v = ±(6.30~7.30) 处壳下加厚到 0.45（= 檐有厚度，不是一片纸）
  · **铜檐口线**：壳外缘一条细线（0.25 × 0.16）；**正脊铜条** 0.60 宽 × 0.28 高
  · 侧面：外侧 **栏板 1.05（清水混凝土）+ 竹木格栅 1.60（@1.00）+ 上部开敞 1.55**
    → 从外面能看到壳下的木肋节奏；内侧栏板 1.05 + 竹木扶手，全开敞

■ 与 R3 语言的一致性：**线性建筑 → 筒壳**（R3 定案：集中式 → 四坡壳；线性 → 筒壳）。
  环廊是一条 1.63 km 的线性建筑，所以它就是一条**连续的筒壳**；
  壳下必有肋（"壳必有垄"的等价表述）；檐口必有铜收边。

■ 传感节点：每 60 m 一个（挂在桥面板底），共 27 个
  小盒 + 细杆，重复、密集、可数 —— 这就是"AI 系统的物理载体"的可视化。

■ **15 处站点**（V3 §2.1 目标"7 → 13、最大间距 ≤ 150 m"；实测**最少 15 处**才满足）：
  **S1~S7 对应七区**（位置 = 环廊上离各分区形心最近的点，脚本自己反查弧长），
  再按"最大间距 ≤ 150 m"补纯楼梯节点，补到**处处 ≤ 150 m**（实际最大 121 m）。
  ★ 站点表**不在本文件算** —— 唯一真源是 `build_campus_site.py` 的 `RING_STATIONS`
  （树在场地阶段就合并了，R4 删不动，所以站点位置必须提前到场地阶段定）。
  每个站点 = 桥面加宽到 18 m 的站台 + **栏板与格栅一起断开成门洞（±6.0 m）** +
  **门洞两侧一对铜柱（直上到檐口）** + 铜顶传感立柱。
  —— 站点在 1.56 km 的环廊上要能被"数出来"，靠的是**竖向的铜柱**和**格栅的缺口**，
  不是靠一块加宽的板（v2 首版只加宽 3.6 m，图上完全读不出来）。

■ **垂直交通**（V3 §2.2~2.4，改掉 V3 §0.4 诊断出的老毛病）：
  旧版每站一根 **4.6 × 4.6 m 实心方柱**（无踏步、无平台），而且挑在**内侧**
  被桥面遮住 ⇒ 任何视角都读不成"楼梯"；且只有 7 处、最大间距 424 m、无坡道无电梯。
  现在 **11 处开敞双跑楼梯（外侧）+ 2 处 1:12 无障碍坡道 + 2 处电梯塔 = 15 处**：
  · 楼梯：**顺桥向**布置（两跑沿路径前后排），v 向只占 3.0 m 进深
    —— 横桥向要占 6.32 m，**南弧那 8 m 宽的缝里放不下**（实测会插进研究生公寓）。
    梯段宽 3.0 m、踏步 300×184 mm、2 跑 × 16 级、中间休息平台、
    清水梯段板 + 竹木压顶 + 梯段外缘铜收边，高差 5.90 m
  · 坡道：1:12 ⇒ 坡长 70.8 m，两段折返、净宽 2.4 m、坡下每 6 m 一对支柱
  · 电梯：井道 3.0 × 3.0 m，玻璃幕 + 铜顶，地面/桥面两层站

■ 自动清障：把与环廊冲突的**五个分区占位体块**删掉（只匹配 `_ZONE_PREFIX`，
  **绝不碰 R0~R3 成果**），并打印"R5 需按环廊重新排布这几栋"。
"""

import math

import bpy

print('### [R4] 智慧环廊 ###')

GZ = Z_TOP

# ---- 桥面 ----
_DECK_Z = 9.00          # 桥面顶 = Z_TOP + 6.00（V2 定死）
_DECK_W = 12.00         # 桥面宽（V2：9~15 m）
_DECK_T = 0.55          # 桥面板厚
_BEAM_W = 1.00          # 纵梁宽
_BEAM_D = 1.05          # 纵梁高
# ★ v7：1.55 → 1.05。原截面下"桥面板底 0.55 + 纵梁 1.55"在侧视角合成一条
#   **2.10 m 高的实心近黑带**（纵梁 M_墨灰钢构 反照率 0.082，全园最深一档），
#   读作"一块黑板"而不是结构 —— R4 日志登记的「R5 复核」项，R5 定稿时漏做。
#   A/B 实测（5 变体 × 3 机位，见 99-临时工作区/AB_桥下深色带/对照.html）：
#   改材质（清水混凝土 / 浅钢）只是把"黑块"换"白块"，带高不变、仍是一整块；
#   **压截面到 1.05（带高 1.60）后梁与板的关系才读得出来**，且保留 V2 的材料分工
#   （钢构 = 结构，清水混凝土 = 围护）。故取"压截面"而非"改色"。
#   注意：桥墩高度 = _DECK_Z − _DECK_T − _BEAM_D − 墩底，引用本常量，会自动跟着变。
_BEAM_OFF = 5.40        # 纵梁中心到路径中心的距离
_SLAB_RIB = 6.00        # 桥面板底横肋间距

# ---- 筒壳 ----
_SHELL_EAVE = 1.30      # 出檐（从桥面边缘往外）
_SHELL_B = _DECK_W * 0.5 + _SHELL_EAVE     # 7.30 半跨
_SHELL_Z0 = 13.20       # 檐口标高
_SHELL_H = 3.20         # 矢高 → 正脊 Z 16.40
_SHELL_P = 1.80         # 剖面指数（1.8 = 脊平檐陡）
_SHELL_TH = 0.22        # 壳厚
_SHELL_NV = 16          # 横向分段

# ---- 肋 ----
_ARCH_SPAN = 12.00      # 主肋间距
_ARCH_R = 0.55          # 主肋截面（方）
_RIB_SPAN = 4.00        # 次肋间距（= 主肋的 1/3）
_RIB_R = 0.20           # 次肋截面（方）
_ARCH_SEG = 9           # 主肋分段
_RIB_SEG = 5            # 次肋分段
_CABLE_R = 0.09

# ---- 侧面 ----
_RAIL_H = 1.05          # 栏板高
_GRL_Z0 = _DECK_Z + _RAIL_H            # 格栅起 10.05
_GRL_H = 1.60           # 格栅高 → 顶 11.65（其上是开敞段，露出壳下木肋）
_GRL_PITCH = 1.00       # ★ v2 由 1.40 收紧到 1.00：1.40 在 60 m 外读成"一排粗牙"

# ---- 路径 ----
_STEP = 3.00            # 路径重采样步长
_PIER_STEP = 48.00      # 桥墩间距
_VALLEY = (-36.0, 36.0, 92.0, 190.0)   # R1 下沉智谷 + 智谷台地：X ±36、Y 92~190
# ★ 范围要按**智谷台地**（BLD_智谷_台地与坐凳 X ±33.2 / Y 94.5~188.5 / Z −5~4.2）取，
#   不能只按谷口 X ±21 —— 否则落在 21~33 之间的桥墩会从台地的踏步里长出来。

# ==================================================================
# 1. 环廊路径
# ==================================================================
# ★★ V3：折线**不再在本文件里重复一遍** —— 直接引用场地阶段的 `INNER`
#   （"内环次路"，唯一真源在 `build_campus_site.py`）。理由：环廊的净距必须逐栋
#   校核（`_check_road.py`），而内环次路修在廊下，两条线**必须一模一样**；
#   各写一份的下场就是改了一处、另一处悄悄走散（本文件历史上正是这样）。
#
#   旧折线**穿楼 4 栋**（实测 1.5 m 网格相交面积）：
#     Academy#3 1510 / 实验楼A 711 / 研究生公寓 556 / 宿舍E 196 m²；
#     另有 6 栋净距 < 12 m（公共教学楼只有 0.2 m）。
#   根因：旧折线的东西弧在 X ±235，而教学 C/D 西缘 237.8、实验楼 A 西缘 225.6、
#   创客工坊东缘 −248.1 —— **弧线正好压在建筑带上**。
#   新折线（在 `build_campus_site.py` 的 `RING_LOOP` 处）按四条量出来的约束排：
#     ① 东弧 X ≤ 206（实验楼 A 西缘 225.6 ⇒ 净距 12.3 m）
#     ② 西弧 X ≥ −206（创客工坊东缘 −248.1 ⇒ 净距 34.8 m）
#     ③ 北弧 Y 568~596（图书馆北 558.8 / Academy#3 南 599.3 / 垂直书院南 622.3）
#     ④ 南弧 Y ≈ 147.5（**生活区↔人文区那道缝只有 30 m**：
#        宿舍/研究生公寓北缘 132.5、人文书院南缘 162.5
#        ⇒ 14.6 m 断面的理论最大净距 = (30 − 14.6)/2 = **7.7 m**，
#        所以这一段按 7.5 m 校核，其余段按 12 m。
#        这一段是**几何上做不出 12 m** 的，不是没算 —— 汇报时必须说明。）
# ★★ 弧长工具（`_seg_table` / `RING_LEN` / `RING_CX` / `RING_CY` / `ring_at`）
#   和站点表（`RING_STATIONS`）**都不在本文件定义** —— 唯一真源在
#   `build_campus_site.py`（多阶段共享同一个 globals，直接复用同名定义）。
#
#   为什么必须提升到**场地阶段**：树在场地阶段一次性合并成 `SITE_树干` /
#   `SITE_树冠` 两个对象，到 R4 已经**删不动**了。垂直交通（楼梯 / 坡道 / 电梯）
#   要清掉占位的树，就必须在"种树之前"就知道站点落在哪 ⇒ 站点表只能在
#   场地阶段算。本文件里曾经的本地副本（`_seg_table` / `ring_at` /
#   `_nearest_s` / `_fill_stations` / `_STATION_TGT` / `_ST_BASE`）已全部删除。
#
#   ★ 踩过的坑：两处各算一份 ⇒ `[site] 站点 15 处` 与 `[R4] 站点 15 处`
#     看起来一致，但**树的排除区是按 site 那份算的**；只要哪天两边口径漂开，
#     就会重新出现"树长在楼梯里"这种**不报错**的失效（2026-09-25 实拍发现）。


def _even(step):
    """把 step 间距**均匀铺满**整圈（不留下最后一段长短不一的缺口）。"""
    n = max(1, int(round(RING_LEN / step)))
    return [i * RING_LEN / n for i in range(n)], n


_LOOP = [ring_at(i * _STEP)[:2] for i in range(int(RING_LEN / _STEP))]
print(f'[R4] 环廊中心线：{len(_LOOP)} 个采样点，全长 **{RING_LEN:.0f} m**'
      f'（V2 原估 1200 m → 修正 1）')

# ---- 站点表：**引用场地阶段唯一真源**（`build_campus_site.py` 的 `RING_STATIONS`）----
#   必须**放在格栅循环之前** —— 格栅要在每个站点断开成"门洞"，
#   否则站点在图上完全读不出来（v2 首版站台只比桥面宽 3.6 m，看不见）。
#   ★ 站点位置**不能写死弧长**。踩过的坑：折线一改（V3 环廊整体重排），写死的
#     弧长全部失效，站台会静默跑到别的区去，而且**不报任何错**。场地阶段那份
#     是"给一个分区形心目标点，脚本自己反查环廊上最近的弧长"，再按
#     ≤150 m 补纯楼梯节点 —— 详见 `build_campus_site.py` 的 `ring_fill_stations()`。
_ST_HALF = 6.00          # 门洞半宽（沿路径）→ 门洞 12 m，与站台同长
#   ★ 由 3.60 加到 6.00（2026-09-25）：楼梯改成**顺桥向**布置后，沿 u 要占
#     4.80（下跑）+ 1.50（休息平台）+ 4.80（上跑）= **11.10 m**，
#     7.2 m 的门洞 / 站台兜不住它。
_STATIONS = tuple((_n, _s, _t) for _n, _s, _t in RING_STATIONS)


def near_station(s):
    for _n, _sv, _t in _STATIONS:
        d = abs((s - _sv + RING_LEN * 0.5) % RING_LEN - RING_LEN * 0.5)
        if d <= _ST_HALF:
            return True
    return False


# ==================================================================
# 2. 工具
# ==================================================================
def slab_band(pts, width, z0, z1):
    """**带厚度的闭合带状板**（桥面 / 栏板 / 扶手都用它）。

    `ribbon()` 只做单层面；`ring_wall()` 只支持"同一轮廓 + 缩放"。
    这个是把"折线 + 宽 + 上下两个标高"直接做成闭合流形。
    """
    n = len(pts)
    hw = width * 0.5
    L, R = [], []
    for i in range(n):
        p0, p1 = pts[(i - 1) % n], pts[(i + 1) % n]
        tx, ty = p1[0] - p0[0], p1[1] - p0[1]
        d = math.hypot(tx, ty) or 1.0
        nx, ny = -ty / d, tx / d
        L.append((pts[i][0] + nx * hw, pts[i][1] + ny * hw))
        R.append((pts[i][0] - nx * hw, pts[i][1] - ny * hw))
    vs = ([(x, y, z1) for x, y in L] + [(x, y, z1) for x, y in R]
          + [(x, y, z0) for x, y in L] + [(x, y, z0) for x, y in R])
    nL1, nR1, nL0, nR0 = 0, n, 2 * n, 3 * n
    fs = []
    for i in range(n):
        j = (i + 1) % n
        fs.append([nL1 + i, nL1 + j, nR1 + j, nR1 + i])      # 顶
        fs.append([nR0 + i, nR0 + j, nL0 + j, nL0 + i])      # 底
        fs.append([nL1 + j, nL1 + i, nL0 + i, nL0 + j])      # 左缘
        fs.append([nR1 + i, nR1 + j, nR0 + j, nR0 + i])      # 右缘
    return vs, fs


def offset_loop(pts, off):
    """把闭合折线沿**向外法向**偏移 off（格栅 / 栏板要落在桥面外缘）。"""
    out = []
    n = len(pts)
    for i in range(n):
        p0, p1 = pts[(i - 1) % n], pts[(i + 1) % n]
        tx, ty = p1[0] - p0[0], p1[1] - p0[1]
        d = math.hypot(tx, ty) or 1.0
        nx, ny = -ty / d, tx / d
        if (pts[i][0] + nx - RING_CX) ** 2 + (pts[i][1] + ny - RING_CY) ** 2 < \
           (pts[i][0] - nx - RING_CX) ** 2 + (pts[i][1] - ny - RING_CY) ** 2:
            nx, ny = -nx, -ny
        out.append((pts[i][0] + nx * off, pts[i][1] + ny * off))
    return out


def shell_ring(pts, vs, b, z0, H, p, th, z_off=0.0):
    """**沿闭合路径生成一圈筒壳**（或壳面上的一条带）—— 带厚度的闭合流形。

    `slab_band` 是"平带"，`barrel_solid`（R3）只支持直线段。
    这个把"筒壳剖面 × 闭合路径"直接做成实体：
        z(v) = _vz(b, z0, H, p, v) + z_off        （R3 的剖面函数，p=1.8 脊平檐陡）
    `vs` 给横向参数列表（从负到正）。要"壳面上的一条带"就给一小段 vs + 小的 th。
    """
    n, m = len(pts), len(vs)
    up, dn = [], []
    for i in range(n):
        p0, p1 = pts[(i - 1) % n], pts[(i + 1) % n]
        tx, ty = p1[0] - p0[0], p1[1] - p0[1]
        d = math.hypot(tx, ty) or 1.0
        nx, ny = -ty / d, tx / d
        if (pts[i][0] + nx - RING_CX) ** 2 + (pts[i][1] + ny - RING_CY) ** 2 < \
           (pts[i][0] - nx - RING_CX) ** 2 + (pts[i][1] - ny - RING_CY) ** 2:
            nx, ny = -nx, -ny
        for v in vs:
            z = _vz(b, z0, H, p, v) + z_off
            up.append((pts[i][0] + nx * v, pts[i][1] + ny * v, z))
            dn.append((pts[i][0] + nx * v, pts[i][1] + ny * v, z - th))
    N = n * m
    V = up + dn
    fs = []
    for i in range(n):
        i2 = (i + 1) % n
        for j in range(m - 1):
            a, bb = i * m + j, i * m + j + 1
            c, dd = i2 * m + j + 1, i2 * m + j
            fs.append([a, bb, c, dd])                       # 上皮
            fs.append([N + dd, N + c, N + bb, N + a])       # 下皮
        # 两条纵向封边（v 的两端）
        a0, b0 = i * m, i2 * m
        fs.append([a0, b0, N + b0, N + a0])
        a1, b1 = i * m + m - 1, i2 * m + m - 1
        fs.append([b1, a1, N + a1, N + b1])
    return V, fs


def rib_path(px, py, nx, ny, b, z0, H, p, th, seg):
    """沿筒壳**下皮**从 v=−b 到 v=+b 的折线 —— 主肋 / 次肋的骨架。"""
    out = []
    for k in range(seg + 1):
        v = -b + 2.0 * b * k / seg
        z = _vz(b, z0, H, p, v) - th
        out.append((px + nx * v, py + ny * v, z))
    return out


def bars_from(path, r):
    """把折线变成一串方形杆。"""
    out = []
    for k in range(len(path) - 1):
        out.append(bar3d(path[k], path[k + 1], r))
    return out


# ---- 自动清障：把与环廊冲突的"分区占位体块"删掉（R5 会重排这些楼） ----
# 场地阶段的路网本来就和这几栋占位体块打架（`road(INNER, 9.0)` 也穿过它们），
# R4 顺手清干净 —— 但**只动五个分区的占位体块**，绝不碰 R0~R3 的成果。
_ZONE_PREFIX = ('BLD_科技_', 'BLD_实验_', 'BLD_教学_', 'BLD_运动_', 'BLD_生活_')


def _aabb(ob):
    from mathutils import Vector
    vs = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    return (min(v.x for v in vs), max(v.x for v in vs),
            min(v.y for v in vs), max(v.y for v in vs),
            min(v.z for v in vs), max(v.z for v in vs))


_CLEAR = _SHELL_B + 5.0             # 壳外缘 + 施工余量
_conflict = {}
for _ob in list(bpy.data.objects):
    if not any(_ob.name.startswith(_p) for _p in _ZONE_PREFIX):
        continue
    if _ob.type != 'MESH' or _ob.name.endswith('_Eave'):
        continue
    _x0, _x1, _y0, _y1, _z0, _z1 = _aabb(_ob)
    if _z1 < 7.5:
        continue                    # 比桥面底还矮的体块不冲突
    for _i in range(int(RING_LEN / 4.0)):
        _px, _py, _tx, _ty, _nx, _ny = ring_at(_i * 4.0)
        if _x0 - _CLEAR <= _px <= _x1 + _CLEAR and _y0 - _CLEAR <= _py <= _y1 + _CLEAR:
            _conflict[_ob.name] = (_x0, _x1, _y0, _y1, _z1)
            break

for _nm in list(_conflict):
    for _ob in list(bpy.data.objects):
        if _ob.name == _nm or _ob.name == _nm + '_Eave' or \
           (_ob.parent is not None and _ob.parent.name == _nm):
            _me = _ob.data
            bpy.data.objects.remove(_ob, do_unlink=True)
            if _me is not None and _me.users == 0:
                bpy.data.meshes.remove(_me)
if _conflict:
    print(f'[R4] 自动清障：{len(_conflict)} 个分区占位体块与环廊冲突，已移除 → '
          + '、'.join(sorted(_conflict)))
    print('[R4] **R5 需按环廊重新排布这几栋**（环廊是基础设施，建筑让路）')
else:
    print('[R4] 自动清障：无冲突')


# ==================================================================
# 3. 桥面 + 纵梁 + 板底横肋 + 桥墩
# ==================================================================
_deck, _beam, _pier, _pave, _srib = [], [], [], [], []

_deck.append(slab_band(_LOOP, _DECK_W, _DECK_Z - _DECK_T, _DECK_Z))
# 桥面铺装：中间 7 m 竹木，两侧各 2.5 m 清水混凝土
_pave.append(slab_band(_LOOP, 7.00, _DECK_Z, _DECK_Z + 0.05))

# ---- 纵梁：两道箱梁，沿路径分段 ----
# ★ 箱梁的**长度必须取该段的实际长度**（+0.25 搭接）。
#   v2 首版把 `_BEAM_W = 1.00` 当成"梁长"写进了 box 的第一个尺寸参数，
#   而路径重采样步长是 3.0 m ⇒ 整条 1.63 km 的纵梁变成"1 m 一块、空 2 m"的虚线，
#   从外面看是桥下挂了一排暗色小方块。**这类"参数当错了维度"的错不会报错。**
_nb = len(_LOOP)
for _off in (-_BEAM_OFF, _BEAM_OFF):
    for i in range(_nb):
        _ax, _ay = _LOOP[i]
        _bx, _by = _LOOP[(i + 1) % _nb]
        _mx, _my = (_ax + _bx) * 0.5, (_ay + _by) * 0.5
        _tx, _ty = _bx - _ax, _by - _ay
        _d = math.hypot(_tx, _ty) or 1.0
        _nx, _ny = -_ty / _d, _tx / _d
        if (_mx + _nx - RING_CX) ** 2 + (_my + _ny - RING_CY) ** 2 < \
           (_mx - _nx - RING_CX) ** 2 + (_my - _ny - RING_CY) ** 2:
            _nx, _ny = -_nx, -_ny
        _beam.append(box(_mx + _nx * _off, _my + _ny * _off,
                         _d + 0.25, _BEAM_W, _BEAM_D,
                         _DECK_Z - _DECK_T - _BEAM_D, math.atan2(_ty, _tx)))

# ---- 桥面板底横肋：@6 m，跨 9.0（避开 ±5.4 的两道纵梁） ----
for _s in _even(_SLAB_RIB)[0]:
    _px, _py, _tx, _ty, _nx, _ny = ring_at(_s)
    _srib.append(box(_px, _py, 0.24, 9.00, 0.35, _DECK_Z - _DECK_T - 0.35,
                     math.atan2(_ty, _tx)))

# ---- 桥墩：每 48 m 一道；跨过下沉智谷时落到谷底 ----
_np = 0
for i in range(int(RING_LEN / _PIER_STEP)):
    _px, _py, _tx, _ty, _nx, _ny = ring_at(i * _PIER_STEP)
    _b0 = Z_TOP - 0.60
    if _VALLEY[0] <= _px <= _VALLEY[1] and _VALLEY[2] <= _py <= _VALLEY[3]:
        _b0 = -5.40                          # 谷底 Z −5.0，墩落到谷底
    _pier.append(box(_px, _py, 1.70, 1.70, _DECK_Z - _DECK_T - _BEAM_D - _b0,
                     _b0, math.atan2(_ty, _tx)))
    _np += 1

emit_to('R4_环廊_桥面', M_SLAB, C_ANCHOR, _deck)
emit_to('R4_环廊_桥面铺装', M_BAMBOO, C_ANCHOR, _pave)
emit_to('R4_环廊_纵梁', M_STEEL, C_ANCHOR, _beam)
emit_to('R4_环廊_板底横肋', M_SLAB, C_ANCHOR, _srib)
emit_to('R4_环廊_桥墩', M_CONC, C_ANCHOR, _pier)
print(f'[R4] 桥面：宽 {_DECK_W:.0f} m、厚 {_DECK_T:.2f}、标高 Z {_DECK_Z:.2f}（= +6.0 m）；'
      f'纵梁 2 道（±{_BEAM_OFF:.1f}，{_BEAM_W:.1f}×{_BEAM_D:.2f}）；'
      f'板底横肋 @{_SLAB_RIB:.0f} m；桥墩 {_np} 道 @ {_PIER_STEP:.0f} m')


# ==================================================================
# 4. 连续筒壳 + 天窗带 + 檐口带 + 铜檐口线 + 正脊
# ==================================================================
_shell, _sky, _eave, _vcpl, _ridge, _pv = [], [], [], [], [], []

_VS_MAIN = [-_SHELL_B + 2.0 * _SHELL_B * k / _SHELL_NV for k in range(_SHELL_NV + 1)]
_shell.append(shell_ring(_LOOP, _VS_MAIN, _SHELL_B, _SHELL_Z0, _SHELL_H, _SHELL_P,
                         _SHELL_TH))
# BIPV 光伏带：v = ±2.25（脊两侧各 2.25 m），凸出壳面 0.05 ——
# V2 明确"顶棚 BIPV 光伏"。壳本身用 R3 定案的钛锌（"壳 = 钛锌"不能破），
# 光伏板作为**脊上的深色带**叠上去，屋面于是读成
#   钛锌 2.60 | 天窗 1.40 | 钛锌 1.05 | **BIPV 4.50** | 钛锌 1.05 | 天窗 1.40 | 钛锌 2.60
_pv.append(shell_ring(_LOOP, [-2.25, 2.25], _SHELL_B, _SHELL_Z0, _SHELL_H,
                      _SHELL_P, 0.12, z_off=0.05))
# 天窗带：v = ±(3.30~4.70)，凸出壳面 0.06
for _sg in (-1.0, 1.0):
    _sky.append(shell_ring(_LOOP, [3.30 * _sg, 4.70 * _sg], _SHELL_B, _SHELL_Z0,
                           _SHELL_H, _SHELL_P, 0.10, z_off=0.06))
# 檐口带：v = ±(6.30~7.30)，壳下加厚到 0.45（"檐要有厚度，不是一片纸"）
for _sg in (-1.0, 1.0):
    _eave.append(shell_ring(_LOOP, [6.30 * _sg, 7.30 * _sg], _SHELL_B, _SHELL_Z0,
                            _SHELL_H, _SHELL_P, 0.45, z_off=-_SHELL_TH))
# 铜檐口线：**只做外缘一条细线**（v2 由 0.34 收到 0.16 —— 0.34 在 1600 px 下
# 会渲成一条横贯全屏的"金腰带"，铜用量也远超 V2 定的 3%）
for _sg in (-1.0, 1.0):
    _vcpl.append(shell_ring(_LOOP, [7.20 * _sg, 7.45 * _sg], _SHELL_B, _SHELL_Z0,
                            _SHELL_H, _SHELL_P, 0.16, z_off=-0.02))
# 正脊铜条
_ridge.append(shell_ring(_LOOP, [-0.30, 0.30], _SHELL_B, _SHELL_Z0, _SHELL_H,
                         _SHELL_P, 0.28, z_off=0.0))

emit_to('R4_环廊_筒壳', M_ZINC, C_ANCHOR, _shell)
emit_to('R4_环廊_BIPV', M_STEEL, C_ANCHOR, _pv)
emit_to('R4_环廊_天窗带', M_GLASSC, C_ANCHOR, _sky)
emit_to('R4_环廊_檐口带', M_CONC, C_ANCHOR, _eave)
emit_to('R4_环廊_铜檐口线', M_COPPER, C_ANCHOR, _vcpl)
emit_to('R4_环廊_正脊', M_COPPER, C_ANCHOR, _ridge)
print(f'[R4] 连续筒壳：跨 {_SHELL_B * 2:.1f} m（桥面 {_DECK_W:.0f} + 两侧出檐 '
      f'{_SHELL_EAVE:.2f}）· 矢高 {_SHELL_H:.2f} m · 厚 {_SHELL_TH:.2f} · '
      f'剖面 p={_SHELL_P:.1f}（脊平檐陡）')
print(f'[R4] 檐口 Z {_SHELL_Z0:.2f} / 正脊 Z {_SHELL_Z0 + _SHELL_H:.2f} → '
      f'净高 檐下 {_SHELL_Z0 - _DECK_Z:.2f} m、脊下 {_SHELL_Z0 + _SHELL_H - _DECK_Z:.2f} m'
      f'（v1 只有 2.95 m → **断面从"扁板"变回"廊"**）')
print(f'[R4] 屋面分带（自脊向檐）：钛锌 2.60 | 天窗 1.40 | 钛锌 1.05 | '
      f'**BIPV 4.50** | 钛锌 1.05 | 天窗 1.40 | 钛锌 2.60')
print(f'[R4] 天窗带 v=±(3.30~4.70) 凸出壳面 0.06；BIPV 带 v=±2.25 凸出 0.05；'
      f'檐口带 v=±(6.30~7.30) 加厚到 0.45；铜檐口线（细，0.25×0.16）+ 正脊铜条（0.60×0.28）')


# ==================================================================
# 5. 胶合木主肋 + 次肋 + 斜拉索
# ==================================================================
_arch, _rib, _cable, _cridge = [], [], [], []

# ★ 肋的轴心必须放在 **壳下皮 − r/2**，不是壳下皮：
#   `bar3d` 的截面是**绕轴心对称**的 r×r（R0 的 bar3d 用 ±r*0.5）。
#   轴心放在壳下皮上 → 细肋整根埋进壳里（R3 坑 48 的同一个坑，只是这次是"半埋"）；
#   粗肋还会从壳的上皮钻出来 0.055，远看变成一圈莫名其妙的横棱。
#   同时**故意**在每道主肋位置给壳的上皮加一条外脊条 ——
#   这是 R3 的"壳必有垄"（大礼堂 外铜垄 10 道 / 92 m），不是穿模。

for _s in _even(_ARCH_SPAN)[0]:
    _px, _py, _tx, _ty, _nx, _ny = ring_at(_s)
    _path = rib_path(_px, _py, _nx, _ny, _SHELL_B, _SHELL_Z0, _SHELL_H, _SHELL_P,
                     _SHELL_TH + _ARCH_R * 0.5, _ARCH_SEG)
    _arch += bars_from(_path, _ARCH_R)
    # 外脊条：贴壳上皮，0.24 方，轴心抬到壳面 +0.10
    _opath = rib_path(_px, _py, _nx, _ny, _SHELL_B, _SHELL_Z0, _SHELL_H, _SHELL_P,
                      -0.10, _ARCH_SEG)
    _cridge += bars_from(_opath, 0.24)
    # 斜拉索：从 1/4 跨点（v = ±_SHELL_B/2）斜拉到桥面外缘、沿路径 ±8 m
    for _su in (-1.0, 1.0):
        _v = 0.5 * _SHELL_B * _su
        _cz = _vz(_SHELL_B, _SHELL_Z0, _SHELL_H, _SHELL_P, _v) - _SHELL_TH
        _cable.append(bar3d((_px + _nx * _v, _py + _ny * _v, _cz),
                            (_px + _tx * 8.0 * _su + _nx * (_DECK_W * 0.5 - 0.60),
                             _py + _ty * 8.0 * _su + _ny * (_DECK_W * 0.5 - 0.60),
                             _DECK_Z + 0.12), _CABLE_R))

for _s in _even(_RIB_SPAN)[0]:
    _px, _py, _tx, _ty, _nx, _ny = ring_at(_s)
    _rib += bars_from(rib_path(_px, _py, _nx, _ny, _SHELL_B, _SHELL_Z0, _SHELL_H,
                               _SHELL_P, _SHELL_TH + _RIB_R * 0.5, _RIB_SEG),
                      _RIB_R)

emit_to('R4_环廊_木主肋', M_WOOD, C_ANCHOR, _arch)
emit_to('R4_环廊_木次肋', M_WOOD, C_ANCHOR, _rib)
emit_to('R4_环廊_壳外脊条', M_ZINC, C_ANCHOR, _cridge)
emit_to('R4_环廊_拉索', M_STEEL, C_ANCHOR, _cable)
print(f'[R4] 胶合木主肋 {len(_even(_ARCH_SPAN)[0])} 道 @ {_ARCH_SPAN:.0f} m'
      f'（截面 {_ARCH_R:.2f} 方、{_ARCH_SEG} 段）；'
      f'次肋 {len(_even(_RIB_SPAN)[0])} 道 @ {_RIB_SPAN:.0f} m（截面 {_RIB_R:.2f} 方）'
      f'—— 壳下必有肋（R3"壳必有垄"的等价表述）')
print(f'[R4] 壳外脊条 {len(_even(_ARCH_SPAN)[0])} 道 @ 主肋位置（0.24 方、贴壳上皮）'
      f'—— 对应 R3 大礼堂的"外铜垄 10 道 / 92 m"，只是这里改用同材质成形脊')
print(f'[R4] 斜拉索 {len(_even(_ARCH_SPAN)[0]) * 2} 根（1/4 跨点 → 桥面外缘，沿路径 ±8 m）')


# ==================================================================
# 6. 外侧栏板 + 竹木格栅 / 内侧栏板 + 竹木扶手
# ==================================================================
_rail_o, _grl, _rail_i, _hand = [], [], [], []
_V_OUT = _DECK_W * 0.5 - 0.30        # 5.70
_V_IN = -(_DECK_W * 0.5 - 0.30)

# ---- 外侧：栏板 1.05（清水混凝土）+ 格栅 1.60（竹木，@1.00）+ 上部开敞 ----
# ★★ **栏板与格栅都要在每个站点断开成门洞**（v2 首版站台只比桥面宽 3.6 m，
#   七个站点在图上完全读不出来）。★ 栏板**必须一起断** —— 它原来是一整圈
#   `slab_band`，而 S3 把开敞楼梯做在**外侧**、站台向外加宽到 18 m：
#   栏板若不断，人在桥面上根本走不到 v>5.7 的站台外缘，更下不了楼梯。
#   格栅的上下压条同理（不断就成了横在门洞上的两根梁）。
_GRL_S = _even(_GRL_PITCH)[0]
for _s in _GRL_S:
    if near_station(_s):
        continue
    _px, _py, _tx, _ty, _nx, _ny = ring_at(_s)
    _rot = math.atan2(_ty, _tx)
    _ox, _oy = _px + _nx * _V_OUT, _py + _ny * _V_OUT
    _rail_o.append(box(_ox, _oy, _GRL_PITCH + 0.02, 0.36, _RAIL_H, _DECK_Z, _rot))
    _grl.append(box(_ox, _oy, 0.10, 0.36, _GRL_H, _GRL_Z0, _rot))
    # 上下压条（收口，否则格栅顶端悬空 = R0 的"断头筷子"）
    _grl.append(box(_ox, _oy, _GRL_PITCH + 0.02, 0.62, 0.22, _GRL_Z0, _rot))
    _grl.append(box(_ox, _oy, _GRL_PITCH + 0.02, 0.62, 0.22,
                    _GRL_Z0 + _GRL_H - 0.22, _rot))

# ---- 内侧：栏板 1.05 + 竹木扶手 ----
_rail_i.append(slab_band(offset_loop(_LOOP, _V_IN), 0.36, _DECK_Z, _GRL_Z0))
_hand.append(slab_band(offset_loop(_LOOP, _V_IN), 0.50, _GRL_Z0, _GRL_Z0 + 0.11))

emit_to('R4_环廊_外侧栏板', M_CONC, C_ANCHOR, _rail_o)
emit_to('R4_环廊_竹木格栅', M_BAMBOO, C_ANCHOR, _grl)
emit_to('R4_环廊_内侧栏板', M_CONC, C_ANCHOR, _rail_i)
emit_to('R4_环廊_扶手', M_BAMBOO, C_ANCHOR, _hand)
print(f'[R4] 外侧：栏板 {_RAIL_H:.2f} m（清水）+ 竹木格栅 {_GRL_H:.2f} m @ {_GRL_PITCH:.2f}'
      f'（翼 0.36×0.10）+ 上部**开敞 '
      f'{_SHELL_Z0 - (_GRL_Z0 + _GRL_H):.2f} m**（从外面能看到壳下的木肋节奏）')
print(f'[R4] 内侧：栏板 {_RAIL_H:.2f} m + 竹木扶手，全开敞')


# ==================================================================
# 7. 传感节点 + 15 处站点 + 垂直交通（V3 §2：11 楼梯 / 2 坡道 / 2 电梯）
# ==================================================================
_sensor, _mast, _plat = [], [], []
# 垂直交通按**材质**分桶（与全项目一致：同材质合并成一个对象）
_VT = {'conc': [], 'bamb': [], 'cop': [], 'glas': []}

# ---- 常量（V3 §2.2~2.4）----
_GND = Z_TOP + 0.10                     # 3.10 落地标高
_TOP = _DECK_Z                          # 9.00 桥面顶
#   ★ V3 §2.2 写「高差 5.74 m（Z 3.10 → 8.84）」。8.84 = `_DECK_Z − 0.16`，
#     也就是**旧实心方柱的顶**；可桥面顶在 9.00 —— 楼梯停在 8.84 就**差 0.16 m 上不去**。
#     这里取 `_TOP = _DECK_Z`、高差 5.90 m，32 级 ⇒ 踢面 0.1844（仍在 <0.19 的舒适区），
#     末级正好与桥面平接。**这是对 V3 数字的修正**，汇报时说明。
_DH = _TOP - _GND                       # 5.90
_VT_N = 16                              # 每跑级数（2 跑 × 16 = 32 级）
_VT_RISE = _DH / (_VT_N * 2)            # 0.1844
_VT_RUN = 0.30                          # 踏面
_VT_W = 3.00                            # 梯段宽（顺桥向布置时 = **v 向进深**）
_VT_LAND = 1.50                         # 休息平台进深（顺桥向 = 沿 u 的长度）
_VT_T = 0.62                            # 梯段板厚（阶梯状板底）
_VT_RAIL = 1.05                         # 栏杆高
_VT_RT = 0.14                           # 栏杆厚
_VT_V0 = _DECK_W * 0.5 + 3.00           # 9.00 = 楼梯内缘（贴站台外缘）
_VT_V1 = _VT_V0 + _VT_W                 # 12.00 = 楼梯外缘（校园一侧）
_VT_FR = _VT_RUN * _VT_N                # 4.80 一跑的平面长度
_VT_UA = -(0.5 * _VT_LAND + _VT_FR)     # −5.55 下跑外端（**地面起步**）
_VT_UB = 0.5 * _VT_LAND + _VT_FR        # +5.55 上跑外端（**桥面到达**）
_Z_LAND = _GND + _VT_RISE * _VT_N       # 6.05 休息平台标高

# 无障碍坡道（V3 §2.3）：1:12，高差 5.90 ⇒ 坡长 70.8 m，两段折返
_RP_W = 2.40                            # 净宽
_RP_RUN = _DH * 12.0 * 0.5              # 35.40 每段坡长
_RP_LD = 1.50                           # 休息平台
_RP_T = 0.22                            # 坡板厚
_RP_V1 = _VT_V0 + 0.30                  # 9.30 上段内缘（站台外缘 9.00 外 0.30）
_RP_V2 = _RP_V1 + _RP_W                 # 11.70
_RP_V3 = _RP_V2 + _RP_W                 # 14.10

# 电梯（V3 §2.4）
_LF_W = 3.00
_LF_V0 = _DECK_W * 0.5                  # 6.00
_LF_TOP = _DECK_Z + 2.60                # 11.60 井道顶

# 类型分配：其余全部是开敞双跑楼梯
_VT_RAMP_AT = ('S3_中轴人文区', 'S5_教学区')
_VT_LIFT_AT = ('S4_实验区', 'S6_生活区东')


def _uv(px, py, tx, ty, nx, ny, u, v):
    return (px + tx * u + nx * v, py + ty * u + ny * v)


def _pb(px, py, tx, ty, nx, ny, rot, u0, u1, v0, v1, h, z0):
    """局部矩形（u 沿路径 / v 沿外法向）→ 世界 box。"""
    cx, cy = _uv(px, py, tx, ty, nx, ny, (u0 + u1) * 0.5, (v0 + v1) * 0.5)
    return box(cx, cy, abs(u1 - u0), abs(v1 - v0), h, z0, rot)


def _prism(px, py, tx, ty, nx, ny, u0, z0, u1, z1, v0, v1, th):
    """**斜板**（坡道板 / 坡道栏板）：`box()` 只能绕 Z 转，做不出坡度，
    直接给 8 个顶点建平行六面体。`th` = 沿 Z 的板厚。

    ★ (u,v) → 世界 (x,y) 的映射行列式 = `tx*ny − ty*nx`，向外的法向取"背离形心"
      那一支，行列式可能是 **−1**（镜像）—— 镜像会让所有面的绕向反过来、法线朝内。
      所以按行列式符号决定要不要反转绕向，而不是赌它恒为 +1。
    """
    loc = [(u0, v0, z0), (u0, v1, z0), (u1, v1, z1), (u1, v0, z1)]
    loc += [(u, v, z - th) for u, v, z in loc]
    vs = [((px + tx * u + nx * v), (py + ty * u + ny * v), z) for u, v, z in loc]
    fs = [[0, 1, 2, 3], [7, 6, 5, 4],
          [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]]
    if tx * ny - ty * nx < 0.0:
        fs = [list(reversed(f)) for f in fs]
    return vs, fs


def _railE(B, px, py, tx, ty, nx, ny, rot, u0, u1, va, vb, zt):
    """一段梯段**沿 u 方向**的侧栏杆（清水混凝土）+ 竹木压顶。

    ★ 栏杆必须**沿梯段的长边**摆。横桥向布置时梯段长边在 u 两端，顺桥向布置时
      长边在 v 两侧 —— 布置一改、栏杆跟着改，否则栏杆会横着架在踏步上。
      （旧的横桥向版 `_rail2()` 已随布置一起删除。）
    """
    B['conc'].append(_pb(px, py, tx, ty, nx, ny, rot, u0, u1, va, vb,
                         _VT_RAIL, zt))
    B['bamb'].append(_pb(px, py, tx, ty, nx, ny, rot, u0, u1,
                         va - 0.04, vb + 0.04, 0.09, zt + _VT_RAIL))


def _railSlope(B, px, py, tx, ty, nx, ny, u0, z0, u1, z1, v0, v1):
    """一段**随坡度斜上去**的栏杆（清水混凝土）+ 竹木压顶。

    ★ 不能做成"每级一截水平栏杆" —— 那样在近景里读成**城垛 / 锯齿**，
      不像楼梯栏杆（2026-09-25 渲染实拍确认）。真栏杆是**连续斜板**：
      底边沿踏步包络线，顶边平行抬 `_VT_RAIL`。`_prism()` 正好做这个。
    """
    for va, vb in ((v0, v0 + _VT_RT), (v1 - _VT_RT, v1)):
        B['conc'].append(_prism(px, py, tx, ty, nx, ny,
                                u0, z0 + _VT_RAIL, u1, z1 + _VT_RAIL,
                                va, vb, _VT_RAIL))
        B['bamb'].append(_prism(px, py, tx, ty, nx, ny,
                                u0, z0 + _VT_RAIL + 0.09,
                                u1, z1 + _VT_RAIL + 0.09,
                                va - 0.04, vb + 0.04, 0.09))


def _mk_stair(B, px, py, tx, ty, nx, ny):
    """**开敞双跑楼梯**（V3 §2.2）—— 做在**外侧**，从校园里一眼看得见。

    ★★ 布置是**顺桥向**（两跑沿 u 前后排），不是横桥向（沿 v 左右并排）。
      为什么改（2026-09-25）：横桥向要占 **6.32 m** 的 v 向进深（两跑并列 +
      休息平台），而**南弧**（生活区）那段环廊中心线 Y≈147.5 夹在两排楼之间 ——
      桥面外缘（v = 6.0）到研究生公寓北墙（v = 14.0）只剩 **8.0 m**，
      站台还要往外挑 3 m ⇒ 横桥向**放不下**：实测 S7 的休息平台 + 栏杆
      插进楼里 1.3 m 深（`_diag_vt_clear.py` 精确量到 333 m² 侵入面积）。
      顺桥向只占 **3.0 m** 进深（v ∈ [9.0, 12.0]）⇒ 净距 **2.0 m** ✓，
      而且**站台仍保留 18 m 宽**（横桥向就得把站台削到 12 m 才勉强够）。
      顺带与坡道统一 —— 坡道本来就是顺桥向铺 70.8 m。
    ★ 代价：沿 u 占 11.10 m，所以门洞 / 站台长度从 7.2 加到 12 m（`_ST_HALF`）。

    动线：u = −5.55（地面）→ 下跑 16 级升到 Z 6.05 → 休息平台 1.5 m →
          上跑 16 级升到 Z 9.00 → 到 u = +5.55，**向内侧横移一步即上站台**
          （站台外缘 v = 9.00 与梯段内缘共线）。
    """
    rot = math.atan2(ty, tx)
    v0, v1 = _VT_V0, _VT_V1
    _vside = ((v0, v0 + _VT_RT), (v1 - _VT_RT, v1))
    la, lb = -0.5 * _VT_LAND, 0.5 * _VT_LAND
    # 下跑：u 自 `_VT_UA`（外端，地面）向 0 升到休息平台
    for k in range(_VT_N):
        zt = _GND + _VT_RISE * (k + 1)
        ua, ub = _VT_UA + _VT_RUN * k, _VT_UA + _VT_RUN * (k + 1)
        B['conc'].append(_pb(px, py, tx, ty, nx, ny, rot, ua, ub, v0, v1,
                             _VT_T, zt - _VT_T))
        B['cop'].append(_pb(px, py, tx, ty, nx, ny, rot, ua, ub,
                            v1, v1 + 0.05, 0.06, zt - 0.06))
    _railSlope(B, px, py, tx, ty, nx, ny,
               _VT_UA, _GND + _VT_RISE, la, _Z_LAND, v0, v1)
    # 休息平台（两跑之间，居中）+ 两侧**水平**栏杆
    B['conc'].append(_pb(px, py, tx, ty, nx, ny, rot, la, lb, v0, v1,
                         _VT_T, _Z_LAND - _VT_T))
    for va, vb in _vside:
        _railE(B, px, py, tx, ty, nx, ny, rot, la, lb, va, vb, _Z_LAND)
    # 上跑：u 自休息平台向 `_VT_UB`（外端，桥面）升
    for k in range(_VT_N):
        zt = _Z_LAND + _VT_RISE * (k + 1)
        ua, ub = 0.5 * _VT_LAND + _VT_RUN * k, 0.5 * _VT_LAND + _VT_RUN * (k + 1)
        B['conc'].append(_pb(px, py, tx, ty, nx, ny, rot, ua, ub, v0, v1,
                             _VT_T, zt - _VT_T))
        B['cop'].append(_pb(px, py, tx, ty, nx, ny, rot, ua, ub,
                            v1, v1 + 0.05, 0.06, zt - 0.06))
    _railSlope(B, px, py, tx, ty, nx, ny,
               0.5 * _VT_LAND, _Z_LAND + _VT_RISE, _VT_UB, _TOP, v0, v1)
    # 支柱：休息平台 + 上跑中点各一对。
    # ★ 不给柱子会读成"悬在空中的一块斜板"（铁律：悬空件必须能读出支承）。
    #   坡道每 6 m 一对柱，楼梯同样处理；下跑中段的板底只离地 0.95 m，不必再给。
    for uu, zt in ((0.0, _Z_LAND),
                   (0.5 * _VT_LAND + 0.5 * _VT_FR, _Z_LAND + 0.25 * _DH)):
        for vv in (v0 + 0.30, v1 - 0.30):
            B['conc'].append(_pb(px, py, tx, ty, nx, ny, rot,
                                 uu - 0.20, uu + 0.20, vv - 0.20, vv + 0.20,
                                 zt - _VT_T - Z_TOP, Z_TOP))


def _mk_ramp(B, px, py, tx, ty, nx, ny):
    """**1:12 无障碍坡道**（V3 §2.3）—— 沿环廊外侧两段折返。

    ★ 5.90 m 高差 @1:12 ⇒ 坡长 **70.8 m**，两段各 35.4 m。这个长度是坡比定的，
      躲不掉（V3 也写了 68.9 m，那是对 5.74 m 算的）。所以坡道只能**平行于环廊**
      铺开，而不是像楼梯那样垂直往外伸。上段与站台外缘平接，下段回落到地面。
    """
    rot = math.atan2(ty, tx)
    v1, v2, v3 = _RP_V1, _RP_V2, _RP_V3
    u_a = _ST_HALF                          # 上段起点（让开站台 7.2 m 长度）
    u_b = u_a + _RP_RUN                     # 上段终点 = 休息平台起点
    u_c = u_b + _RP_LD                      # 休息平台终点
    u_d = u_c - _RP_RUN                     # 下段终点（长度必须 = 坡长）
    # 与站台外缘之间的 0.30 m 过渡板（否则坡道头悬在站台外）
    B['conc'].append(_pb(px, py, tx, ty, nx, ny, rot, -1.60, 1.60,
                         _VT_V0, v1, 0.18, _TOP - 0.18))
    # 上段坡 + 休息平台 + 下段坡 + 落地平台
    B['conc'].append(_prism(px, py, tx, ty, nx, ny, u_a, _TOP, u_b, _Z_LAND,
                            v1, v2, _RP_T))
    B['conc'].append(_pb(px, py, tx, ty, nx, ny, rot, u_b, u_c, v1, v3,
                         _RP_T, _Z_LAND - _RP_T))
    B['conc'].append(_prism(px, py, tx, ty, nx, ny, u_c, _Z_LAND, u_d, _GND,
                            v2, v3, _RP_T))
    B['conc'].append(_pb(px, py, tx, ty, nx, ny, rot, 0.0, u_d, v2, v3,
                         _RP_T, _GND - _RP_T))
    # 栏板（斜的用 `_prism`，平的用 `_pb`）：两侧通长 + 休息平台外缘
    for va, vb in ((v1, v1 + 0.12), (v2 - 0.12, v2), (v3 - 0.12, v3)):
        if vb <= v2 + 0.01:                 # 上段的两侧
            B['conc'].append(_prism(px, py, tx, ty, nx, ny, u_a, _TOP + 0.95,
                                    u_b, _Z_LAND + 0.95, va, vb, 0.55))
        if va >= v2 - 0.01:                 # 下段的两侧
            B['conc'].append(_prism(px, py, tx, ty, nx, ny, u_c, _Z_LAND + 0.95,
                                    u_d, _GND + 0.95, va, vb, 0.55))
    B['conc'].append(_pb(px, py, tx, ty, nx, ny, rot, u_b, u_c, v3 - 0.12, v3,
                         1.05, _Z_LAND))
    B['bamb'].append(_pb(px, py, tx, ty, nx, ny, rot, u_b, u_c, v3 - 0.16, v3,
                         0.09, _Z_LAND + 1.05))
    # 坡道下的支柱（每 6 m 一对）—— 坡道是架空的，不给柱子会读成"悬浮"
    for uu, zz in ((u_a + 6, None), (u_a + 12, None), (u_a + 18, None),
                   (u_a + 24, None), (u_a + 30, None)):
        zt = _TOP - (uu - u_a) / 12.0
        for vv in (v1 + 0.30, v2 - 0.30):
            B['conc'].append(_pb(px, py, tx, ty, nx, ny, rot, uu - 0.22, uu + 0.22,
                                 vv - 0.22, vv + 0.22, zt - _RP_T - Z_TOP,
                                 Z_TOP))
    for uu in (u_c - 6, u_c - 12, u_c - 18, u_c - 24, u_c - 30):
        zt = _Z_LAND - (u_c - uu) / 12.0
        for vv in (v2 + 0.30, v3 - 0.30):
            B['conc'].append(_pb(px, py, tx, ty, nx, ny, rot, uu - 0.22, uu + 0.22,
                                 vv - 0.22, vv + 0.22, zt - _RP_T - Z_TOP,
                                 Z_TOP))


def _mk_lift(B, px, py, tx, ty, nx, ny):
    """**电梯塔**（V3 §2.4）—— 井道 3.0 × 3.0，玻璃幕 + 铜顶，两层站。"""
    rot = math.atan2(ty, tx)
    v0, v1 = _LF_V0, _LF_V0 + _LF_W
    u0, u1 = -_LF_W * 0.5, _LF_W * 0.5
    # 基座
    B['conc'].append(_pb(px, py, tx, ty, nx, ny, rot, u0 - 0.22, u1 + 0.22,
                         v0 - 0.22, v1 + 0.22, 0.35, Z_TOP))
    # 四角铜柱
    for uu in (u0 - 0.06, u1 - 0.14):
        for vv in (v0 - 0.06, v1 - 0.14):
            B['cop'].append(_pb(px, py, tx, ty, nx, ny, rot, uu, uu + 0.20,
                                vv, vv + 0.20, _LF_TOP - Z_TOP - 0.35,
                                Z_TOP + 0.35))
    # 玻璃幕：四面，**内面留 1.20 m 门洞**（否则读成一根实心玻璃柱）
    _zb, _zh = Z_TOP + 0.35, _LF_TOP - 0.35 - Z_TOP
    for vv in (v0, v1 - 0.10):
        B['glas'].append(_pb(px, py, tx, ty, nx, ny, rot, u0, u1, vv, vv + 0.10,
                             _zh, _zb))
    B['glas'].append(_pb(px, py, tx, ty, nx, ny, rot, u1 - 0.10, u1, v0, v1,
                         _zh, _zb))
    for uu, uw in ((u0, (_LF_W - 1.20) * 0.5), (u1 - (_LF_W - 1.20) * 0.5,
                                                (_LF_W - 1.20) * 0.5)):
        B['glas'].append(_pb(px, py, tx, ty, nx, ny, rot, uu, uu + uw,
                             v0, v0 + 0.10, _zh, _zb))
    # 铜顶 + 压顶
    B['cop'].append(_pb(px, py, tx, ty, nx, ny, rot, u0 - 0.30, u1 + 0.30,
                        v0 - 0.30, v1 + 0.30, 0.26, _LF_TOP - 0.26))
    B['cop'].append(_pb(px, py, tx, ty, nx, ny, rot, u0 - 0.02, u1 + 0.02,
                        v0 - 0.02, v1 + 0.02, 0.55, _LF_TOP))
    # 桥面标高处的门厅挑板（与桥面接）
    B['conc'].append(_pb(px, py, tx, ty, nx, ny, rot, u0 - 0.40, u1 + 0.40,
                         v0 - 1.10, v0 + 0.10, 0.18, _DECK_Z - 0.18))


_NS = 60.0
for _s in _even(_NS)[0]:
    _px, _py, _tx, _ty, _nx, _ny = ring_at(_s)
    _rot = math.atan2(_ty, _tx)
    _sensor.append(box(_px, _py, 0.58, 0.58, 0.78, _DECK_Z - _DECK_T - 0.78, _rot))
    _sensor.append(box(_px, _py, 0.10, 0.10, 1.40, _DECK_Z - _DECK_T - 2.18, _rot))

# _STATIONS 已在第 1 节（路径之后）定义 —— 格栅要在站点处断开，必须先有站点表
_VT_LOG = []
for _nm, _s, _tgt in _STATIONS:
    _px, _py, _tx, _ty, _nx, _ny = ring_at(_s)
    _rot = math.atan2(_ty, _tx)
    # 站台：桥面加宽到 18 m（每侧挑出 3 m），读作"这里是个节点"。
    # ★ 长度由 3.20 改到 `2 × _ST_HALF` —— 原来比门洞还短一半，
    #   楼梯（总宽 6.32 m）根本落不到站台上。
    _plat.append(box(_px, _py, 2.0 * _ST_HALF, _DECK_W + 6.00, 0.16,
                     _DECK_Z + 0.06, _rot))
    # 门洞两侧的**铜柱**：从桥面直上到檐口，把站点框出来（这是站点唯一的竖向标识）
    for _ds in (-_ST_HALF, _ST_HALF):
        _qx, _qy, _qtx, _qty, _qnx, _qny = ring_at(_s + _ds)
        _mast.append(box(_qx + _qnx * _V_OUT, _qy + _qny * _V_OUT, 0.45, 0.45,
                         _SHELL_Z0 - _DECK_Z, _DECK_Z, math.atan2(_qty, _qtx)))
        _mast.append(box(_qx + _qnx * _V_OUT, _qy + _qny * _V_OUT, 0.85, 0.85,
                         0.35, _SHELL_Z0 - 0.05, math.atan2(_qty, _qtx)))
    # 传感立柱：铜顶（落在桥面外缘内侧，不挡通行）
    _mast.append(box(_px + _nx * 4.30, _py + _ny * 4.30, 0.55, 0.55, 3.20,
                     _DECK_Z, _rot))
    _mast.append(box(_px + _nx * 4.30, _py + _ny * 4.30, 1.35, 1.35, 0.55,
                     _DECK_Z + 3.20, _rot))
    # ---- 垂直交通 ----
    if _nm in _VT_RAMP_AT:
        _mk_ramp(_VT, _px, _py, _tx, _ty, _nx, _ny)
        _VT_LOG.append((_nm, _s, '坡道'))
    elif _nm in _VT_LIFT_AT:
        _mk_lift(_VT, _px, _py, _tx, _ty, _nx, _ny)
        _VT_LOG.append((_nm, _s, '电梯'))
    else:
        _mk_stair(_VT, _px, _py, _tx, _ty, _nx, _ny)
        _VT_LOG.append((_nm, _s, '楼梯'))

emit_to('R4_环廊_传感节点', M_STEEL, C_ANCHOR, _sensor)
emit_to('R4_环廊_站台', M_SLAB, C_ANCHOR, _plat)
emit_to('R4_环廊_传感立柱', M_COPPER, C_ANCHOR, _mast)
emit_to('R4_环廊_垂直交通_清水', M_CONC, C_ANCHOR, _VT['conc'])
emit_to('R4_环廊_垂直交通_竹木', M_BAMBOO, C_ANCHOR, _VT['bamb'])
emit_to('R4_环廊_垂直交通_铜', M_COPPER, C_ANCHOR, _VT['cop'])
emit_to('R4_环廊_电梯玻璃', M_GLASSC, C_ANCHOR, _VT['glas'])

_VT_KIND = {}
for _nm, _s, _k in _VT_LOG:
    _VT_KIND[_k] = _VT_KIND.get(_k, 0) + 1
print(f'[R4] 垂直交通 {len(_VT_LOG)} 处：'
      + ' / '.join(f'{k} {v} 处' for k, v in sorted(_VT_KIND.items()))
      + f'（开敞双跑楼梯（**顺桥向**）：梯段宽 {_VT_W:.1f} m、踏步 '
        f'{_VT_RUN * 1000:.0f}×{_VT_RISE * 1000:.0f} mm、2 跑 × {_VT_N} 级、'
        f'休息平台 {_VT_W:.2f}×{_VT_LAND:.1f} m、平面 {_VT_UB - _VT_UA:.2f} m 长、'
        f'高差 {_DH:.2f} m）')
print(f'[R4] 无障碍坡道：1:12，坡长 {_RP_RUN * 2:.1f} m（两段折返）、净宽 {_RP_W:.1f} m、'
      f'休息平台 {_RP_LD:.1f} m —— 坡比定的长度，躲不掉')
print(f'[R4] 电梯塔：井道 {_LF_W:.1f}×{_LF_W:.1f} m，玻璃幕 + 铜顶，'
      f'两层站（地面 {Z_TOP:.2f} / 桥面 {_DECK_Z:.2f}）')
# ★ 站点 / 垂直交通清单留给后续脚本（`_vt_render.py` 摆机位、图集脚本点名用）。
#   与 `_entrance_all.py` 的 `ENT_LIST` 同一套做法：走 globals，不必二次构建。
STATION_LIST = tuple((_nm, _s, _k, ring_at(_s)) for _nm, _s, _k in _VT_LOG)

_KIND = dict((_nm, _k) for _nm, _s, _k in _VT_LOG)
print(f'[R4] 传感节点 {len(_even(_NS)[0])} 个 @ {_NS:.0f} m（桥面板底，盒 0.58 + 细杆）')
print(f'[R4] 站点 {len(_STATIONS)} 处（门洞 ±{_ST_HALF:.1f} m + 一对铜柱 + 18 m 站台）：'
      + ' / '.join(f'{n.split("_")[0]}@{s:.0f}m·{_KIND.get(n, "?")}'
                   for n, s, _ in _STATIONS))
_gaps = [( _STATIONS[(i + 1) % len(_STATIONS)][1] - _STATIONS[i][1]) % RING_LEN
         for i in range(len(_STATIONS))]
print(f'[R4] 站点最大间距 {max(_gaps):.0f} m（V3 §2.1 目标 ≤ 150 m）')

print(f'[R4] 智慧环廊 完成 —— 全长 {RING_LEN:.0f} m，串联七区')
