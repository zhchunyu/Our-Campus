# -*- coding: utf-8 -*-
"""
build_campus_r1.py —— 山河大学 R1：山门 + 下沉智谷（中轴南段重做）
================================================================
由 run_campus.py 的 build_extra 串联在 stage1/2/3 与 r0 之后执行，
**共享同一个 globals**（`box` / `ribbon` / `cap` / `band` / `round_rect` /
`rect` / `offset_poly` / `emit_to` / `new_obj` / `make_mat` / `principled` /
`set_in` / `bar3d` / `signed_area` / `P0` / `MAIN` / `Z_TOP` / `C_BLD` /
`C_PAVE` / `C_SITE` / `N_GATE` / `N_LIB` / `N_DECK` / `M_PAVE` / `M_PAVE_W` /
`M_PATH` / `M_STONE` / `M_STONE_D` / `M_WIN` …）。

V2 的两个锚点在本阶段落地：
  锚点 1 · **山门**（替代牌坊群 + 阙 + 石狮）
  锚点 4 · **下沉智谷**（替代明堂广场）

------------------------------------------------------------------
【山门：不是"把牌坊做大"，而是换一个原型 —— 山口】
------------------------------------------------------------------
牌坊是"礼制符号"，它的问题不在尺度而在**原型**：四柱三间、层层叠楼、
匾额题名，这套语言属于科举时代的门第宣示，放大十倍只会更旧。

山门的原型改取**山口的剖面**：
  · 两片清水混凝土**崖体**（底 15×20 @X ±66 → 顶 13×17 @X ±58，内倾 8 m，高 38 m）
    —— 内倾是关键，竖直的方柱是"阙"，内倾的才是"崖"。
  · 崖之间横跨一道 **116 m 的变截面拱形门架**：
    上弦 z(t) = 41 + 12·(1 − |2t−1|^1.55)   端部 41 → 中轴 53（脊线取"尖顶山脊"，不是圆弧）
    下弦 z(t) = 38.5 − 0.5·(1 − (2t−1)²)    端部 38.5 → 中轴 38（近乎水平）
    腹板高 端 2.5 m → 中轴 15.0 m：**形态跟着弯矩走**，中间厚两端薄。
  · 门架下缘净空 35 m，人车自由通行；地面只留一道 0.40 m 宽的铜门槛线。

于是从正面读到的不是"一座门"，而是**"两崖夹一脊"的山口**：
崖是实的、脊是暗的、肋是亮的，虚实之间就是"门"。
这也是"山门"二字最本来的意思 —— 山中的隘口，而非山前的牌坊。

【一处必须说明的材料修正：腹板不是镜面，镜面移到了肋上】
V2 原写"门架腹板用镜面不锈钢"。第一次渲染就证伪了：
  **竖直镜面对天空是隐形的。** 站在地面仰视 38~53 m 高的竖直镜面，
  反射光线朝上打到地平线附近的天空 —— 镜面把天空原样还给天空，
  整片腹板在画面里彻底消失，只剩 20 道加劲肋像一把梳子挂在空中。
这是几何光学的事实，不是口味问题。所以：
  · 腹板 → **哑光钛锌板（墨）**，成为一道深色的山脊剪影；
  · 上下弦 → 保留钢构，压出清晰边线；
  · 镜面不锈钢 → 移到 **14 道竖向加劲肋** 与 **智谷玻璃幕的竖向遮阳柱** 上。
    这两处都是**近距离、掠射角、有对比背景**的位置，镜面才看得见。

------------------------------------------------------------------
【下沉智谷：把"看得见的科学"做成中轴上的一个洞】
------------------------------------------------------------------
  谷   Y 95 → 188（长 93 m），X ±21（宽 42 m，**与中轴大道同宽**），深 8 m
  上壁 Z −0.60 → 3.00 垂直（3.60 m）→ **超白玻璃幕** + 镜面竖向柱，
       透出地下实验平台的剖面
  下壁 Z −5.00 → −0.60 内斜（4.40 m）→ 清水混凝土，内收 3.2 m，可坐
  南北端各 16 级实心台地（0.50 m 高 × 0.85 m 深），从谷底堆上来
  谷底 X ±17.8、Y 108.6 → 174.4；中央装置（铺装 + 发光盘 + 铜环 + 环形坐凳）
  玻璃幕后的地下层：楼面 Z −0.55 / 夹层 Z 1.20 / 吊顶 Z 2.70，
  内置设备箱体与连续灯带 —— 白天从谷底仰视能看见"仪器在墙后运转"。

宽度取 ±21 而不是 ±22：中轴大道正好 42 m 宽，谷口与大道**同宽**，
人从大道走进谷口时两边界是一条直线，不会多出一条 1 m 的草缝。

------------------------------------------------------------------
【两步"不做就白做"的清理】
------------------------------------------------------------------
(1) 地形开洞。`SITE_半岛地形` 是 `cap(P0)` 生成的**单个平铺 n 边形**，
    没有任何内部顶点 —— 不挖洞，谷就整个埋在地面以下（首版鸟瞰图里
    谷完全不存在，只看到一片草地）。挖法是"半平面切开 + 边缘开缺口"：
    沿 X=0 把半岛切成东西两块，各自在切口边上咬掉半个矩形。
    这样得到的是**简单多边形**，不需要零宽锁孔缝（退化边会让
    n 边形三角化结果不可预期）。
(2) 重建 6 个铺装对象。`SITE_中轴大道` / `SITE_广场与平台` / `SITE_步道` /
    `SITE_御道分格` / `SITE_中轴灯柱`+`灯罩` 的 `flush` 在各自阶段就做完了，
    无法"部分删除"，只能删掉重建（去掉落在谷里的部分）。
    `SITE_门区广场` 一并重建：原宽 X ±54 托不住 X ±66 的崖体基座。

选址是算过的：谷只能放在**明堂广场原位**——往北 Y 300+ 会撞人文区台基
（X ≥17）与东西主路（Y 404），往南放不下，只有这里是净空。
（V2 原写"土丘是谷的南缘"，Y 轴向北，土丘实际在谷的**北侧**，此处修正。）

------------------------------------------------------------------
【案山土丘：保留，但改成谷的北缘观景台】
------------------------------------------------------------------
V2 字面写"下沉智谷替代明堂广场 + 案山"。实际算下来土丘（Y 196.8~292.8）
落在谷的**北侧**而不是谷里，正好充当谷的北岸；而"案山"是 D7 定的风水骨架
（朝山—案山—主山）里的一环，拆掉会让中轴失去障景。所以处置为：
保留土丘，拆掉丘顶的**仿古方亭**（攒尖顶 + 宝顶 = 旧语言），
改成直径 24 m 的**圆形观景平台**（清水混凝土，台面 Z 12.60）。
登上平台可回望山门、俯瞰智谷 —— 土丘从"被看的景"变成"看景的地方"。

设计依据：`01-产品设计/山河大学_设计方案修订纲要V2.md` 第三节 · 锚点 1 / 锚点 4
"""

import math

import bpy

print('### [R1] 山门 + 下沉智谷 ###')

GZ = Z_TOP
AX = 0.0
GY = N_GATE                      # 33.6


# ==================================================================
# 0. 拆除旧语言构件（V2 处置：牌坊群拆、明堂/案山亭改造）
# ==================================================================
# ★ 清障边界：**只拆 V2 已定"拆除 / 取消"的**；"改造"类（图书馆 / 大礼堂 /
#   美术馆 / 书院）保留旧版作"改造前"语境 —— 它们原地重建为新语言，不是消失。
_DROP = (
    'BLD_校门_牌坊_',            # 4 个：木构 / 石作 / 屋面 / 脊饰
    'BLD_校门_阙_',              # 3 个：石作 / 屋面 / 宝顶
    'BLD_校门_石狮',
    'SITE_明堂地雕',
    'SITE_明堂灯柱',
    'SITE_明堂灯亭',
    'BLD_案山_亭_',              # 4 个
    # ★ 钟楼（5 个）—— R3 定为**取消**（不重建）。原先只写在 r3 的 `_DROP` 里，
    #   于是 R1 / R2 的成图一直带着它：`R2_图书馆_中轴` 里那座孤零零的旧钟楼
    #   就坐在新图书馆前庭广场上（`diag_grid.py` 实测中心行左端命中
    #   `BLD_人文_Bell_Tower_屋面`）。"取消"类构件的拆除必须提前到**最早
    #   重做中轴的那一阶段**，否则成图里会留下永远不会存在的楼。
    'BLD_人文_Bell_Tower_',
    'SITE_门区广场',             # 以下 7 个：删掉后按新方案重建
    'SITE_半岛地形',
    'SITE_水面',
    'SITE_分区_中轴人文区',
    'SITE_中轴大道',
    'SITE_广场与平台',
    # ★★ 这里**不能**再列 `SITE_步道`。踩过的坑（2026-09-25 定位）：
    #   场地阶段的 `SITE_步道` 是「内环次路 + 东西次路 + 两条放射支路 + 广场环路带」
    #   四样合并成的**整张次级路网**，而 `emit_to()` 是**整体替换**不是追加 ——
    #   R1 把它 drop 掉再只重建一条滨水步道，等于把整张次级路网删了，
    #   于是"楼与楼之间没有连通的路"（用户意见的原话）。
    #   现在滨水步道单独成 `SITE_滨水步道`，`SITE_步道` 留给路网，两边互不干扰。
    'SITE_御道分格',
    'SITE_中轴灯柱',
    'SITE_中轴灯罩',
)
_drop_n = 0
for _ob in list(bpy.data.objects):
    if any(_ob.name.startswith(_p) for _p in _DROP):
        _me = _ob.data
        bpy.data.objects.remove(_ob, do_unlink=True)
        if _me is not None and _me.users == 0:
            bpy.data.meshes.remove(_me)
        _drop_n += 1
print(f'[R1] 已移除旧语言构件 {_drop_n} 个'
      f'（牌坊群 / 阙 / 石狮 / 明堂 / 案山亭 / 钟楼 / 7 个待重建对象）')


# ==================================================================
# 1. 新语言材质
# ==================================================================
# 首版清水混凝土 (0.585, 0.570, 0.540) 在 sun 4.2 / 曝光 −0.25 下渲成近乎纯白，
# 崖体读成"白塑料"。第二版压到 0.400 —— **还是白**。
#
# 第三版才想通：**不是反照率的问题**。
#   `make_mat` 是按**名字**缓存的（`bpy.data.materials.get(name)` 命中就直接返回），
#   R0 已经建过 'M_清水混凝土'，这里再调一次只会把 R0 那份拿回来，
#   传进去的颜色被**静默忽略** —— 改多少都没用。
#
# 正确做法：色值以 R0 为**唯一来源**，这里只取引用。
# （顺带把 R0 的 0.585 一起修成 0.272，并把渲染的 sun_strength 4.2 降到 2.9 ——
#   0.585 那套是按旧配色"黛瓦黑"标定的，换浅色系后受光面全被推到压缩段顶端。）
M_CONC = bpy.data.materials['M_清水混凝土']
M_STEEL = make_mat('M_墨灰钢构', (0.125, 0.132, 0.143), rough=0.42, metal=0.82)
set_in(principled(M_STEEL), 'Specular IOR Level', 0.30)
# 镜面不锈钢 —— V2 规定**只用在两个锚点**上，用滥立刻变网红。
# 粗糙度取 0.07 而不是 0.02：无 HDRI 场景里纯镜面会渲成一块死板的灰板，
# 留一点模糊反而能吃到天空与远山的层次。
M_MIRROR = make_mat('M_镜面不锈钢', (0.845, 0.870, 0.895), rough=0.070, metal=1.0)
M_ZINC = make_mat('M_钛锌板', (0.172, 0.180, 0.190), rough=0.58, metal=0.42)
M_GLASSC = make_mat('M_超白玻璃', (0.165, 0.200, 0.220), rough=0.075, metal=0.0)
set_in(principled(M_GLASSC), 'Specular IOR Level', 0.68)
M_BAMBOO = make_mat('M_竹木格栅', (0.455, 0.315, 0.185), rough=0.72,
                    noise_scale=2.2, col_b=(0.335, 0.222, 0.126))
M_COPPER = make_mat('M_铜饰', (0.435, 0.268, 0.128), rough=0.33, metal=1.0)
M_VOID = make_mat('M_地下结构', (0.212, 0.216, 0.222), rough=0.86, noise_scale=2.0,
                  col_b=(0.176, 0.180, 0.186))
M_PAVE_V = make_mat('M_谷底铺装', (0.228, 0.222, 0.211), rough=0.90,
                    noise_scale=3.0, col_b=(0.186, 0.181, 0.172))
# 中央圆形铺装单独给一个深色：谷底铺装与圆盘如果同色，从谷底看
# 中央装置就只剩一个发光点，"仪器台"的尺度完全读不出来。
M_PAVE_C = make_mat('M_中央铺装', (0.196, 0.198, 0.202), rough=0.74,
                    noise_scale=3.4, col_b=(0.156, 0.158, 0.162))


def make_glass(name, col=(0.930, 0.955, 0.965)):
    """**真透明**玻璃（Principled 的 Transmission）。

    `make_mat` 做出来的"玻璃"其实是不透明的深蓝灰面板 —— 远景读作玻璃没问题，
    但智谷的玻璃幕后面就是地下实验层，**必须真的透过去**，
    否则"看得见的科学"这个锚点等于没做。
    """
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.node_tree.nodes.clear()
    nt = m.node_tree
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    set_in(bsdf, 'Base Color', (col[0], col[1], col[2], 1.0))
    set_in(bsdf, 'Roughness', 0.030)
    set_in(bsdf, 'Transmission Weight', 1.0)
    set_in(bsdf, 'IOR', 1.45)
    return m


M_GLASST = make_glass('M_超白玻璃_透')


def make_glow(name, col, strength):
    """自发光材质（`make_mat` 不带 emission，只能自己搭节点）。"""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    set_in(bsdf, 'Base Color', (0.020, 0.030, 0.038, 1.0))
    set_in(bsdf, 'Roughness', 0.35)
    set_in(bsdf, 'Emission Color', (col[0], col[1], col[2], 1.0))
    set_in(bsdf, 'Emission Strength', strength)
    return m


# 发光强度压到 3.0 / 2.2：曝光 −0.25、日光 4.2 的场景里，
# 首版按 7.0 试算会直接把发光面顶成纯白，失去"青蓝色科技光"的色相。
M_GLOW = make_glow('M_科学可视化发光', (0.330, 0.720, 0.860), 3.0)
M_GLOW_D = make_glow('M_地下灯带', (0.520, 0.780, 0.900), 3.2)


# ==================================================================
# 2. 构件工具
# ==================================================================
def slant_prism(cx0, cx1, cy, hx0, hy0, hx1, hy1, z0, z1):
    """倾斜方柱：底 (cx0,cy,hx0,hy0)@z0 → 顶 (cx1,cy,hx1,hy1)@z1。

    `frustum` 只能做**竖直**收分；崖体要向内倾，所以单独写一个斜棱柱。
    上下底面都是轴对齐矩形、只平移不收分 —— 侧面因此是斜平面（平行四边形），
    这正是"崖"的读法；若改成绕 Z 扭转，就变成 r0 那种"错位堆叠"了，此处不要。
    """
    A = ((cx0 - hx0, cy - hy0), (cx0 + hx0, cy - hy0),
         (cx0 + hx0, cy + hy0), (cx0 - hx0, cy + hy0))
    B = ((cx1 - hx1, cy - hy1), (cx1 + hx1, cy - hy1),
         (cx1 + hx1, cy + hy1), (cx1 - hx1, cy + hy1))
    vs = [(x, y, z0) for x, y in A] + [(x, y, z1) for x, y in B]
    fs = [[i, (i + 1) % 4, 4 + (i + 1) % 4, 4 + i] for i in range(4)]
    fs.append([3, 2, 1, 0])
    fs.append([4, 5, 6, 7])
    return vs, fs


def arch_solid(x0, x1, y, th, f_lo, f_hi, n):
    """沿 X 的**变截面拱形腹板**实体（连续曲面，不是分段 box 拼的台阶）。

    f_lo / f_hi 是 t→z 的函数。门架腹板高度从端部 2.5 m 渐变到中轴 15 m，
    用分段 box 会在斜面上留下肉眼可见的台阶，必须直接生成曲面。
    """
    vs, fs = [], []
    for i in range(n + 1):
        t = i / n
        x = x0 + (x1 - x0) * t
        zl, zh = f_lo(t), f_hi(t)
        vs += [(x, y - th * 0.5, zl), (x, y - th * 0.5, zh),
               (x, y + th * 0.5, zh), (x, y + th * 0.5, zl)]
    for i in range(n):
        a, b = i * 4, (i + 1) * 4
        fs.append([a + 0, b + 0, b + 1, a + 1])     # 前面 −Y
        fs.append([a + 1, b + 1, b + 2, a + 2])     # 顶面
        fs.append([a + 2, b + 2, b + 3, a + 3])     # 后面 +Y
        fs.append([a + 3, b + 3, b + 0, a + 0])     # 底面
    fs.append([0, 1, 2, 3])
    fs.append([n * 4 + 3, n * 4 + 2, n * 4 + 1, n * 4 + 0])
    return vs, fs


def prism(prof, y0, y1):
    """把 XZ 平面上的闭合截面 prof=[(x,z)…] 沿 Y 拉成实体。"""
    n = len(prof)
    vs = [(x, y0, z) for x, z in prof] + [(x, y1, z) for x, z in prof]
    fs = [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    fs.append(list(range(n - 1, -1, -1)))
    fs.append([n + i for i in range(n)])
    return vs, fs


def circle_pts(cx, cy, r, n=72):
    return [(cx + r * math.cos(2 * math.pi * i / n),
             cy + r * math.sin(2 * math.pi * i / n)) for i in range(n)]


def clip_half_x(poly, sign):
    """Sutherland–Hodgman：保留 sign·x ≤ 0 的一侧。

    切口（x = 0 那条直线段）会作为**一条边**出现在结果里 ——
    这正是下一步"开缺口"要用的落点。
    """
    out, n = [], len(poly)
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        fa, fb = sign * a[0], sign * b[0]
        if fa <= 0.0:
            out.append(a)
        if (fa <= 0.0) != (fb <= 0.0):
            t = fa / (fa - fb)
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def notch_x0(poly, x_in, y0, y1):
    """在切口边（x≈0）上咬掉一个矩形 [min(0,x_in), max(0,x_in)] × [y0, y1]。

    缺口有两种绕行方向，只有一种是"减面积"的。不去猜多边形的旋向，
    两种都生成一遍，取面积恰好减少 |x_in|·(y1−y0) 的那个 —— 稳。
    """
    n = len(poly)
    cut = abs(x_in) * (y1 - y0)
    a0 = abs(signed_area(poly))
    best, best_err = poly, 1e18
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        if abs(a[0]) > 1e-6 or abs(b[0]) > 1e-6:
            continue
        for seq in ([(0.0, y0), (x_in, y0), (x_in, y1), (0.0, y1)],
                    [(0.0, y1), (x_in, y1), (x_in, y0), (0.0, y0)]):
            cand = poly[:i + 1] + seq + poly[i + 1:]
            err = abs(abs(signed_area(cand)) - (a0 - cut))
            if err < best_err:
                best, best_err = cand, err
    return best


# ==================================================================
# 3. 锚点 1 · 山门（两崖夹一脊）
# ==================================================================
_TW_X0 = 66.0                    # 崖体底中心 X
_TW_X1 = 58.0                    # 崖体顶中心 X（向内倾 8 m）
_TW_HX0, _TW_HY0 = 7.50, 10.00   # 底 15 × 20
_TW_HX1, _TW_HY1 = 6.50, 8.50    # 顶 13 × 17
_TW_Z1 = GZ + 38.0               # 崖顶 Z 41.0
_TW_Z0 = GZ + 1.20               # 崖身从基座顶起（基座高 1.20）

_GA_X0 = -_TW_X1                 # 门架起端 −58
_GA_X1 = _TW_X1                  # 门架终端 +58（跨度 116 m）
_GA_T = 2.60                     # 腹板厚（Y 向）
_GA_TOP_TIP = 41.0               # 上弦端部
_GA_TOP_MID = 53.0               # 上弦中轴（脊线最高点）
# 下弦中轴抬到 44.0：首版下弦是近乎水平的 38.0，整个门架读成"桥面 + 桥拱"，
# 中间那 15 m 厚的一块是"桥肚子"。把下弦也做成拱（38.5 → 44.0），
# 腹板就变成一个**两端薄、中间厚的月牙**——正是拱的弯矩图，
# 同时洞口成为"山口"，而不是"桥下净空"。
_GA_BOT_TIP = 38.50              # 下弦端部
_GA_BOT_MID = 44.00              # 下弦中轴
_GA_N = 48


def _prof(t, k):
    """t ∈ [0,1] → 1（中轴）… 0（端部）。k 越大脊线越尖。"""
    return 1.0 - abs(2.0 * t - 1.0) ** k


def _z_top(t):
    # k = 1.55：比抛物线（k=2）更尖，读成"山脊"而不是"拱桥"。
    return _GA_TOP_TIP + (_GA_TOP_MID - _GA_TOP_TIP) * _prof(t, 1.55)


def _z_bot(t):
    return _GA_BOT_TIP + (_GA_BOT_MID - _GA_BOT_TIP) * _prof(t, 2.0)


def _tw_sec(sgn, t):
    """崖体在高度比例 t 处的截面：返回 (中心X, 半宽X, 半宽Y)。"""
    return (sgn * (_TW_X0 + (_TW_X1 - _TW_X0) * t),
            _TW_HX0 + (_TW_HX1 - _TW_HX0) * t,
            _TW_HY0 + (_TW_HY1 - _TW_HY0) * t)


_tw, _gd, _mr, _ga, _gc, _gs, _cp = [], [], [], [], [], [], []

for _s in (-1.0, 1.0):
    # ---- 崖体（清水混凝土，向内倾） ----
    _tw.append(slant_prism(_s * _TW_X0, _s * _TW_X1, GY,
                           _TW_HX0, _TW_HY0, _TW_HX1, _TW_HY1, GZ, _TW_Z1))
    # 崖基座（托住底截面）
    _gd.append(box(_s * _TW_X0, GY, 2 * _TW_HX0 + 5.0, 2 * _TW_HY0 + 3.0,
                   1.20, GZ))
    # 崖顶钢箍：把崖体收头，同时给门架一个明确的落点。
    # 首版做成 +3.0 m 外扩的混凝土"鞍座"，渲出来像一顶蘑菇帽；
    # 收到 +1.6 m 并换成墨灰钢，读作"柱头箍"而不是"帽子"。
    _gs.append(box(_s * _TW_X1, GY, 2 * _TW_HX1 + 1.6, 2 * _TW_HY1 + 1.6,
                   1.60, _TW_Z1))
    # ---- 崖面竖向分格肋（±X 面各 6 道 / ±Y 面各 4 道） ----
    # 首版两个循环都写成了同一个面（±X 面），结果是 6 道肋各建两遍 ——
    # 共面重复 → Z-fighting，而另外两个面一根肋都没有。
    _a = _tw_sec(_s, 0.0)
    _b = _tw_sec(_s, 1.0)
    for _u in (-1.0, 1.0):                     # ±X 面
        for _k in range(6):
            _v = (_k + 0.5) / 6.0
            _cp.append(bar3d((_a[0] + _u * (_a[1] + 0.10), GY + _a[2] * (2 * _v - 1),
                              _TW_Z0),
                             (_b[0] + _u * (_b[1] + 0.10), GY + _b[2] * (2 * _v - 1),
                              _TW_Z1), 0.34))
    for _u in (-1.0, 1.0):                     # ±Y 面
        for _k in range(4):
            _v = (_k + 0.5) / 4.0
            _cp.append(bar3d((_a[0] + _a[1] * (2 * _v - 1), GY + _u * (_a[2] + 0.10),
                              _TW_Z0),
                             (_b[0] + _b[1] * (2 * _v - 1), GY + _u * (_b[2] + 0.10),
                              _TW_Z1), 0.34))

# ---- 门架腹板（哑光钛锌，变截面拱） ----
_ga.append(arch_solid(_GA_X0, _GA_X1, GY, _GA_T, _z_bot, _z_top, _GA_N))
# ---- 上弦 / 下弦（镜面不锈钢，沿曲线分段） ----
# 镜面在这里是**对的**：它们是 1.3 / 1.0 m 见方的杆，四面朝向不同，
# 掠射时每一段各自吃到不同的天空与远山，在深色腹板上勾出一条会变的亮边。
# （首版把 14 道镜面竖肋贴在腹板上，渲出来是一排整齐的白色栅栏 —— 撤掉。）
for _i in range(_GA_N):
    _t0, _t1 = _i / _GA_N, (_i + 1) / _GA_N
    _x0 = _GA_X0 + (_GA_X1 - _GA_X0) * _t0
    _x1 = _GA_X0 + (_GA_X1 - _GA_X0) * _t1
    _gc.append(bar3d((_x0, GY, _z_top(_t0)), (_x1, GY, _z_top(_t1)), 1.30))
    _gc.append(bar3d((_x0, GY, _z_bot(_t0)), (_x1, GY, _z_bot(_t1)), 1.00))
# ---- 崖体南面的镜面嵌板（人行高度，两面各一块） ----
# 竖直镜面在人眼高度、正对观看者时，映的是**广场与走进校园的人** ——
# 这是镜面唯一真正成立的位置（高处竖直镜面只会把天空还给天空，见文件头）。
# 宽度 3.4 m 正好卡在两道竖向分格肋之间，不打架。
_mr = []
for _s in (-1.0, 1.0):
    _c0, _hx0, _hy0 = _tw_sec(_s, 0.0)
    _c1, _hx1, _hy1 = _tw_sec(_s, 26.0 / 38.0)
    _w = 1.70
    _y0, _y1 = GY - (_hy0 + 0.14), GY - (_hy1 + 0.14)
    _mr.append(quad((_c0 - _w, _y0, GZ + 1.60), (_c0 + _w, _y0, GZ + 1.60),
                    (_c1 + _w, _y1, GZ + 26.0), (_c1 - _w, _y1, GZ + 26.0)))

emit_to('BLD_校门_山门_崖体', M_CONC, C_BLD, _tw)
emit_to('BLD_校门_山门_崖座', M_CONC, C_BLD, _gd)
emit_to('BLD_校门_山门_崖顶钢箍', M_STEEL, C_BLD, _gs)
emit_to('BLD_校门_山门_门架', M_ZINC, C_BLD, _ga)
emit_to('BLD_校门_山门_弦梁', M_MIRROR, C_BLD, _gc)
emit_to('BLD_校门_山门_分格', M_STEEL, C_BLD, _cp)
emit_to('BLD_校门_山门_镜面嵌板', M_MIRROR, C_BLD, _mr, recalc=False)
emit_to('BLD_校门_山门_门槛', M_COPPER, C_BLD,
        [box(AX, GY, 42.0, 0.40, 0.10, GZ + 0.11)])


# ==================================================================
# 4. 锚点 4 · 下沉智谷
# ==================================================================
_V_S, _V_N = 95.0, 188.0         # 谷的南北端（Y）
_V_HX = 21.0                     # 谷口半宽（= 中轴大道半宽，谷口与大道同宽）
_V_ZB = GZ - 8.0                 # 谷底 Z −5.0
_V_GZ0 = GZ - 3.60               # 玻璃幕下沿 Z −0.60
_V_BHX = 17.80                   # 谷底半宽（下斜壁内收 3.2 m）
_V_SD, _V_SH, _V_NS = 0.85, 0.50, 16     # 台阶深 / 台阶高 / 级数（16×0.5 = 8.0 m）
_V_Y0 = _V_S + _V_NS * _V_SD     # 南端台阶结束 Y = 108.6
_V_Y1 = _V_N - _V_NS * _V_SD     # 北端台阶结束 Y = 174.4
_V_MID = (_V_Y0 + _V_Y1) * 0.5   # 谷底中心 Y = 141.5

_vw, _vs, _vh, _vp, _vg, _vd, _vc, _vr, _vb, _vm, _vpc = \
    [], [], [], [], [], [], [], [], [], [], []

# ---- 上壁：玻璃幕（Z −0.60 → 3.00），透出地下实验平台的剖面 ----
for _e in (-1.0, 1.0):
    _vw.append(box(_e * _V_HX, _V_MID, 0.30, _V_N - _V_S, 3.60, _V_GZ0))
    # 镜面竖向遮阳柱：93 m 长的一整片玻璃不打断，会读成一块塑料板；
    # 竖柱给足尺度感，同时是"镜面"在近距离掠射角下的正解用法。
    for _k in range(24):
        _yy = _V_S + (_k + 0.5) * (_V_N - _V_S) / 24.0
        _vm.append(box(_e * (_V_HX - 0.17), _yy, 0.34, 0.16, 3.60, _V_GZ0))
# ---- 下壁：内斜清水混凝土（可坐的斜台地） ----
# 两个斜面的**顶点顺序必须相反**，否则西壁的法线朝外（背离谷内），
# 单独 emit 且 recalc=False 时西壁会渲成背面。
for _e in (-1.0, 1.0):
    if _e > 0:
        _vs.append(band([(_e * _V_HX, _V_S), (_e * _V_HX, _V_N)], _V_GZ0,
                        [(_e * _V_BHX, _V_S), (_e * _V_BHX, _V_N)], _V_ZB))
    else:
        _vs.append(band([(_e * _V_BHX, _V_S), (_e * _V_BHX, _V_N)], _V_ZB,
                        [(_e * _V_HX, _V_S), (_e * _V_HX, _V_N)], _V_GZ0))
# 斜壁上的三道模板缝：一整面 4.4 m 高的斜墙没有任何线，近景就是一块白板。
# 缝很浅（凸 0.06），只在侧光下显影 —— 和 r0 板底结构肋是同一条道理。
for _e in (-1.0, 1.0):
    for _fz in (-1.70, -2.90, -4.10):
        _fx_ = _V_HX - (_V_HX - _V_BHX) * ((_V_GZ0 - _fz) / (_V_GZ0 - _V_ZB))
        _vs.append(box(_e * (_fx_ - 0.05), _V_MID, 0.16, _V_N - _V_S - 1.0,
                       0.10, _fz))
# 竹木长凳：贴着斜壁顶端通长一条 —— "可坐的台地"要给出明确的坐面，
# 否则 4.4 m 的斜墙只是个坡，没有人会坐上去。
for _e in (-1.0, 1.0):
    _bx = _V_HX - (_V_HX - _V_BHX) * (0.40 / (_V_GZ0 - _V_ZB))
    _vr.append(box(_e * (_bx - 0.26), _V_MID, 0.52, _V_N - _V_S - 2.0,
                   0.15, _V_GZ0 + 0.06))
# ---- 南北端封头（YZ 截面沿 Y 拉 0.5 m 的实体） ----
# 不封的话，站在谷底朝南北看是一整片"没有底边的洞"：地形是零厚度平面，
# 任何下挖都会在边界上缺一道立面。
_END_PROF = [(-_V_HX, GZ), (_V_HX, GZ), (_V_HX, _V_GZ0), (_V_BHX, _V_ZB),
             (-_V_BHX, _V_ZB), (-_V_HX, _V_GZ0)]
_vh.append(prism(_END_PROF, _V_S - 0.50, _V_S))
_vh.append(prism(_END_PROF, _V_N, _V_N + 0.50))
# ---- 南北端台阶：16 级实心台地（X ±17.8，与谷底同宽） ----
# 台地宽度必须取 _V_BHX 而不是 _V_HX：取 ±21 的话，越往下越会从内斜壁上
# 穿出去，从谷外看就是一块从斜墙里长出来的混凝土。
for _k in range(_V_NS):
    _top = GZ - (_k + 1) * _V_SH
    _h = _top - _V_ZB
    if _h > 0.01:
        _vh.append(box(AX, _V_S + (_k + 0.5) * _V_SD, 2 * _V_BHX, _V_SD, _h, _V_ZB))
        _vh.append(box(AX, _V_N - (_k + 0.5) * _V_SD, 2 * _V_BHX, _V_SD, _h, _V_ZB))
# ---- 谷底铺装 ----
_vp.append(cap([(-_V_BHX, _V_Y0), (_V_BHX, _V_Y0),
                (_V_BHX, _V_Y1), (-_V_BHX, _V_Y1)], _V_ZB + 0.06))
_vpc = [cap(circle_pts(AX, _V_MID, 13.0), _V_ZB + 0.12)]
# ---- 中央装置：发光盘（青蓝，科技感）+ 铜环 + 环形坐凳 ----
_vd.append(cap(circle_pts(AX, _V_MID, 4.60), _V_ZB + 0.14))
_vc.append(band(circle_pts(AX, _V_MID, 5.20), _V_ZB + 0.13,
                circle_pts(AX, _V_MID, 5.70), _V_ZB + 0.13))
# 环形坐凳：24 段 —— **每段必须绕自己转**（box 的 rot 参数），
# 不转的话 24 个轴对齐方块会散成"一堆石头"，拼不成一个环。
for _i in range(24):
    _a = 2 * math.pi * (_i + 0.5) / 24
    _rr = 10.6
    _vh.append(box(AX + _rr * math.cos(_a), _V_MID + _rr * math.sin(_a),
                   1.30, 2.60, 0.45, _V_ZB + 0.12, rot=_a))
# ---- 谷口栏杆（玻璃 + 竹木扶手） ----
for _e in (-1.0, 1.0):
    _vg.append(box(_e * _V_HX, _V_MID, 0.16, _V_N - _V_S, 1.10, GZ))
    _vr.append(box(_e * _V_HX, _V_MID, 0.24, _V_N - _V_S, 0.14, GZ + 1.10))

# ---- 玻璃幕后的地下实验层 ----
# 可见层：楼面 Z −0.55 / 夹层 Z 1.20 / 吊顶 Z 2.70（吊顶顶面正好齐地面 Z 3.00）。
# 首版把设备箱体直接摆在 Z 2.65 的楼板上，箱顶窜到 Z 4.95 ——
# 高于地面 3.00，等于从地形里长出来一排灰盒子。可见净高必须按玻璃幕的
# 3.60 m 反算，箱体一律压在吊顶之下。
_UG_XI, _UG_XO = _V_HX, 32.50            # 玻璃面 → 后墙
_UG_YC, _UG_YD = _V_MID, _V_N - _V_S - 2.0
_UG_CX, _UG_WD = (_UG_XI + _UG_XO) * 0.5, _UG_XO - _UG_XI
for _e in (-1.0, 1.0):
    _xc = _e * _UG_CX
    _vb.append(box(_xc, _UG_YC, _UG_WD, _UG_YD, 0.30, GZ - 3.85))    # 楼面 −0.85~−0.55
    _vb.append(box(_xc, _UG_YC, _UG_WD, _UG_YD, 0.30, GZ - 0.30))    # 吊顶  2.70~3.00
    _vb.append(box(_e * 28.50, _UG_YC, 8.00, _UG_YD, 0.28, GZ - 1.80))  # 夹层 1.20~1.48
    _vb.append(box(_e * 33.00, _UG_YC, 0.50, _UG_YD, 4.00, GZ - 4.00))  # 后墙 −1.00~3.00
    _vb.append(box(_xc, _V_S + 0.50, _UG_WD, 0.50, 4.00, GZ - 4.00))    # 南端墙
    _vb.append(box(_xc, _V_N - 0.50, _UG_WD, 0.50, 4.00, GZ - 4.00))    # 北端墙
    # 设备箱体：楼面一层（顶 ≤ 1.05）+ 夹层一层（顶 ≤ 2.53）
    for _k in range(9):
        _yy = _V_S + 6.0 + _k * 9.6
        _ww = 2.2 + 0.9 * ((_k * 7) % 3)
        _vb.append(box(_e * (23.6 + 1.9 * ((_k * 3) % 3)), _yy,
                       _ww, _ww * 1.6, 1.55, GZ - 3.55))
        _vb.append(box(_e * (25.4 + 2.2 * ((_k * 5) % 3)), _yy + 4.2,
                       _ww * 0.9, _ww * 1.2, 1.05, GZ - 1.52))
    # 连续灯带（贴吊顶 + 贴楼面各一条）：只有一条顶部灯带时，
    # 透过玻璃看到的是"一条亮线 + 一片黑"，实验层的进深读不出来。
    _vd.append(box(_e * 22.60, _UG_YC, 0.50, _UG_YD, 0.14, GZ - 0.45))
    _vd.append(box(_e * 22.60, _UG_YC, 0.40, _UG_YD, 0.12, GZ - 3.45))

emit_to('BLD_智谷_玻璃幕', M_GLASST, C_BLD, _vw)
emit_to('BLD_智谷_镜面竖柱', M_MIRROR, C_BLD, _vm)
emit_to('BLD_智谷_斜壁', M_CONC, C_BLD, _vs, recalc=False)
emit_to('BLD_智谷_台地与坐凳', M_CONC, C_BLD, _vh)
emit_to('BLD_智谷_谷底铺装', M_PAVE_V, C_PAVE, _vp, up=True)
emit_to('BLD_智谷_中央铺装', M_PAVE_C, C_PAVE, _vpc, up=True)
emit_to('BLD_智谷_中央装置', M_GLOW, C_BLD, _vd)
emit_to('BLD_智谷_铜环', M_COPPER, C_BLD, _vc)
emit_to('BLD_智谷_地下结构', M_VOID, C_BLD, _vb)
emit_to('BLD_智谷_谷口栏杆', M_GLASSC, C_BLD, _vg)
emit_to('BLD_智谷_扶手', M_BAMBOO, C_BLD, _vr)


# ==================================================================
# 5. 案山土丘改造：去亭，改圆形观景平台
# ==================================================================
# 土丘是径向穹顶（R 48 / H 9，丘顶 Z 12.00）。r = 12 m 处的丘面高度是
# 3 + 9·(1 − 0.25²)^1.5 = 11.18 —— 平台侧壁必须**埋到丘面以下**，
# 从 Z 6.00 起，否则平台边缘会悬空 0.8 m，露出一圈缝。
_MD_Y = 244.8
_MD_TOP = GZ + 9.60              # 台面 Z 12.60
_mw = [band(circle_pts(AX, _MD_Y, 12.0, 64), GZ + 6.00,
            circle_pts(AX, _MD_Y, 12.0, 64), _MD_TOP)]
emit_to('BLD_案山_平台侧壁', M_CONC, C_BLD, _mw, recalc=False)
emit_to('BLD_案山_观景平台', M_CONC, C_BLD,
        [cap(circle_pts(AX, _MD_Y, 12.0, 64), _MD_TOP)], up=True)


# ==================================================================
# 6. 地形开洞 + 重建 7 个对象
# ==================================================================
# ---- 6.1 半岛地形：沿 X = 0 切两半，各在切口上咬掉半个谷 ----
# 谷口正好以中轴为界，所以 X = 0 是最自然的切缝，切口与谷的南北边
# （Y 95 / 188）垂直相交，得到的缺口是一个干净的矩形。
_HOLE_X = _V_HX
_left = notch_x0(clip_half_x(P0, 1.0), -_HOLE_X, _V_S, _V_N)
_right = notch_x0(clip_half_x(P0, -1.0), _HOLE_X, _V_S, _V_N)
emit_to('SITE_半岛地形', M_GRASS, C_SITE,
        [cap(_left, GZ), cap(_right, GZ), cap(MAIN, GZ)], up=True)
print(f'[R1] 地形开洞：左半 {len(_left)} 点 / 右半 {len(_right)} 点，'
      f'缺口 X ±{_HOLE_X:.0f} × Y {_V_S:.0f}~{_V_N:.0f}；'
      f'面积 {abs(signed_area(_left)):.0f} + {abs(signed_area(_right)):.0f} '
      f'= {abs(signed_area(_left)) + abs(signed_area(_right)):.0f} m²，'
      f'原岸线 {abs(signed_area(P0)):.0f} m²（差 '
      f'{abs(signed_area(P0)) - abs(signed_area(_left)) - abs(signed_area(_right)):.0f}）')

# ---- 6.2 水面：在谷口处开洞 ----
# `SITE_水面` 是一张 rect(-4000, -3800, 4000, 4200) 的**整片水平面**（Z 0），
# 平地上它被 Z 3.0 的地形盖住，看不见；可谷底在 Z −5.0 —— 水面正好横在
# 谷中间。首版谷底全黑、鸟瞰里谷是一片均匀蓝灰，就是这张水面。
# 拆成"左右 + 南北"四块，洞的口径与地形洞**完全一致**：
# 洞口四边分别被玻璃幕（X ±21，含 0.30 厚度）与端头封头（Y 94.5~95 / 188~188.5）盖住。
emit_to('SITE_水面', M_WATER, C_WATER, [
    rect(-4000.0, -3800.0, -_V_HX, 4200.0, Z_WATER),
    rect(_V_HX, -3800.0, 4000.0, 4200.0, Z_WATER),
    rect(-_V_HX, -3800.0, _V_HX, _V_S, Z_WATER),
    rect(-_V_HX, _V_N, _V_HX, 4200.0, Z_WATER),
], up=True)

# ---- 6.3 分区铺装（中轴人文区）：南边缘上咬掉谷的北段 ----
# `SITE_分区_中轴人文区` 是 round_rect(-110.4, 153.6, 110.4, 700.8, 26.0)，
# 它的南边缘（Y 153.6）落在谷里 —— 不咬掉的话，谷的北段会被这块铺装盖住。
_zv, _ = round_rect(-110.4, 153.6, 110.4, 700.8, 26.0, 0.0)
_zp, _done = [], False
for _i in range(len(_zv)):
    _p, _q = _zv[_i], _zv[(_i + 1) % len(_zv)]
    _zp.append((_p[0], _p[1]))
    if (not _done and abs(_p[1] - 153.6) < 1e-6 and abs(_q[1] - 153.6) < 1e-6
            and _q[0] - _p[0] > 2 * _V_HX):
        _zp += [(-_V_HX, 153.6), (-_V_HX, _V_N), (_V_HX, _V_N), (_V_HX, 153.6)]
        _done = True
emit_to('SITE_分区_中轴人文区', M_Z_HUM, C_PAVE, [cap(_zp, GZ + 0.045)], up=True)
print(f'[R1] 分区铺装缺口：{len(_zp)} 点，缺口 X ±{_V_HX:.0f} × Y 153.6~{_V_N:.0f}'
      f'（{"成功" if _done else "**未找到南边缘**"}）')

# ---- 6.4 中轴大道 ----
# 首版南段起点写 −30、林荫大道终点写 GY−18 = 15.6，两段在 Y −30~15.6
# **完全重叠且共面**（同在 Z 3.06）→ 静默 Z-fighting。改成首尾相接。
# ★★ 北段终点由 `N_LIB + 46.0`（= 564.4）收到 **`N_LIB − 52.0`（= 466.4）**。
#   原来的终点落在图书馆**北面之外 5.4 m**，于是这条 42 m 宽的御道**纵穿整座图书馆**：
#   ① 3232 m² 埋进台基实体（看不见，但属于"不该有的几何"）；
#   ② 台基北面还露出 **42 × 6 m 一条铺装舌**浮在草地上 —— 这条**看得见**。
#   `N_LIB − 52.0` 不是新数：R1 自己的 6.8 节「御道分格」北段终点就写在
#   `N_LIB − 52.0`（分格线只画到这儿），也就是说**当年设计意图就是到此为止**，
#   只是 6.4 节的铺装没跟上。收到 466.4 之后分格线与铺装边正好对齐，
#   再往北由 `SITE_广场与平台` 的图书馆前庭（M_PAVE，Y 444.4~592.4）接续。
_APPROACH = [(0.0, -1000.0), (0.0, -620.0), (0.0, -260.0), (0.0, -30.0)]
emit_to('SITE_中轴大道', M_PAVE_W, C_PAVE, [
    ribbon(_APPROACH, 36.0, GZ + 0.06),
    ribbon([(AX, -30.0), (AX, _V_S)], 42.0, GZ + 0.06),
    ribbon([(AX, _V_N), (AX, N_LIB - 52.0)], 42.0, GZ + 0.06),
], up=True)

# ---- 6.5 广场与平台：前导广场 + 图书馆前庭 + 观景台（**去掉明堂椭圆**） ----
_fx, _fy = W(340, 300)
_deck = [(AX - 34.0, N_DECK - 6.0)]
for _i in range(25):
    _a = math.pi * _i / 24
    _deck.append((AX + 34.0 * math.cos(_a), N_DECK - 6.0 + 34.0 * math.sin(_a)))
_deck.append((AX + 34.0, N_DECK - 6.0))
emit_to('SITE_广场与平台', M_PAVE, C_PAVE, [
    round_rect(-96.0, GY - 76.0, 96.0, GY - 8.0, 16.0, GZ + 0.05),
    rect(_fx - 78.0, _fy - 74.0, _fx + 78.0, _fy + 74.0, GZ + 0.05),
    cap(_deck, GZ + 0.35),
], up=True)

# ---- 6.6 门区广场：加宽（原 X ±54 托不住 X ±66 的崖体基座） ----
# 北边只到 Y 46.0：环路在 X = 0 处最低点 Y 58（半宽 6.5 → 51.5），留 5.5 m 净距。
emit_to('SITE_门区广场', M_PAVE, C_PAVE,
        [round_rect(-90.0, GY - 8.0, 90.0, GY + 12.4, 10.0, GZ + 0.075)], up=True)

# ---- 6.7 步道：**不再重建**（见 `_DROP` 处的说明） ----
# 场地阶段的 `SITE_步道` 现在就是整张次级路网，R1 不碰它。
# 滨水步道在场地阶段已单独成 `SITE_滨水步道`，也不需要在这里重建
# （它只走 Y ≥ 150 的半岛开阔段，与下沉智谷 Y 95~188 / X ±21 无交集）。
print('[R1] 步道：保留场地阶段的整张次级路网（内环 / 东西次路 / 放射支路 / 广场环路带）')

# ---- 6.8 御道分格：南段 / 北段 / 谷底段 ----
emit_to('SITE_御道分格', M_STONE_D, C_PAVE, [
    box(_s * 7.6, (GY + 15.0 + _V_S) * 0.5, 1.00, _V_S - GY - 15.0, 0.16, GZ + 0.06)
    for _s in (-1.0, 1.0)] + [
    box(_s * 7.6, (_V_N + N_LIB - 52.0) * 0.5, 1.00, N_LIB - 52.0 - _V_N,
        0.16, GZ + 0.06)
    for _s in (-1.0, 1.0)] + [
    box(_s * 7.6, _V_MID, 1.00, _V_Y1 - _V_Y0, 0.16, _V_ZB + 0.10)
    for _s in (-1.0, 1.0)], up=True)

# ---- 6.9 中轴灯柱 / 灯罩：跳过谷段 ----
# 灯柱在 X ±16.5，**落在谷口宽度（±21）之内** —— 不跳过就会悬在谷上空。
_ls, _lg = [], []
for _i in range(18):
    _y = GY + 24.0 + _i * 26.0
    if _y > N_LIB - 56.0:
        break
    if _V_S - 6.0 < _y < _V_N + 8.0:
        continue
    for _s in (-1.0, 1.0):
        _lx = _s * 16.5
        _ls.append(box(_lx, _y, 1.30, 1.30, 0.50, GZ + 0.06))
        _ls.append(box(_lx, _y, 0.50, 0.50, 3.80, GZ + 0.56))
        _lg.append(box(_lx, _y, 1.00, 1.00, 0.70, GZ + 4.36))
emit_to('SITE_中轴灯柱', M_STONE, C_SITE, _ls)
emit_to('SITE_中轴灯罩', M_WIN, C_SITE, _lg)


# ==================================================================
# 7. 校验输出
# ==================================================================
print(f'[R1] 山门：崖体底 15×20 @X±{_TW_X0:.0f} → 顶 13×17 @X±{_TW_X1:.0f}，'
      f'内倾 {_TW_X0 - _TW_X1:.1f} m，高 {_TW_Z1 - GZ:.1f} m')
print(f'[R1] 门架：跨度 {_GA_X1 - _GA_X0:.1f} m，脊线端 {_GA_TOP_TIP:.1f} → 中轴 '
      f'{_GA_TOP_MID:.1f} m；腹板高 端 {_GA_TOP_TIP - _GA_BOT_TIP:.1f} → 中轴 '
      f'{_GA_TOP_MID - _GA_BOT_MID:.1f} m；下缘净空 {_GA_BOT_MID - GZ:.1f} m')
print(f'[R1] 下沉智谷：Y {_V_S:.0f}→{_V_N:.0f}（长 {_V_N - _V_S:.0f} m）×'
      f'X ±{_V_HX:.0f}（宽 {2 * _V_HX:.0f} m），深 {GZ - _V_ZB:.0f} m，'
      f'谷底 Z {_V_ZB:.2f}')
print(f'[R1] 谷壁：上 3.60 m 玻璃幕（Z {_V_GZ0:.2f}→{GZ:.2f}）+ 24 道镜面竖柱；'
      f'下 {_V_GZ0 - _V_ZB:.2f} m 内斜清水混凝土（内收 {_V_HX - _V_BHX:.1f} m）')
print(f'[R1] 谷底 X ±{_V_BHX:.1f}，Y {_V_Y0:.1f}→{_V_Y1:.1f}；'
      f'南北各 {_V_NS} 级台地（{_V_SH} × {_V_SD} m）')
print(f'[R1] 地下层：楼面 Z {GZ - 3.55:.2f} / 夹层 Z {GZ - 1.52:.2f} / '
      f'吊顶 Z {GZ - 0.30:.2f}（顶面齐地面）')
print(f'[R1] 重建 7 个对象（半岛地形 / 中轴大道 / 广场与平台 / 门区广场 / '
      f'步道 / 御道分格 / 中轴灯柱）')
print('[R1] 山门 + 下沉智谷 完成')
