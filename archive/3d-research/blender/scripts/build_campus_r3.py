# -*- coding: utf-8 -*-
"""
build_campus_r3.py —— 山河大学 R3：人文区改造（第 2 版）
================================================================
由 run_campus.py 的 build_extra 串联在 stage1/2/3 与 R0/R1/R2 之后执行，
**共享同一个 globals**，可直接复用：
  - 场地：box / round_rect / cap / band / prof2d / GZ / C_BLD / C_PAVE
  - R0：bar3d / side_frames / fin_box / corners / mini_tree / frustum
  - R1：make_glass（M_GLASST 已在 R1 定义）
  - R2：shell_solid / shell_ribs / ring_wall / truss_band / fin_facade /
        para_ring / hand_rail / terrace_ring / shrub / rim_edge
**不要再写 make_mat 定义新材质**：同名材质第二次调用会被静默忽略（R1 踩过 3 轮）。

范围（V2 §九 对阶段 3 的处置：「保留台基与体量关系，去掉仿古构件，
换曲面屋盖与格构立面；钟楼取消」）：

  1. 大礼堂（中轴西侧，-88, 338.4）—— 三层台地 + 大台阶 + 两级退台外廊
     + 斜向玻璃天窗带 + **大跨度变曲率筒壳** + **玻璃山墙**
  2. 美术馆（中轴东侧，+84, 338.4）—— 三个几何体块保留，尖坡顶 → **四坡变曲率薄壳**
  3. 书院 A / B / C —— 回字形院落保留，悬山直坡 → **平缓筒壳**（长条体量）
  4. 钟楼 —— **取消**（V2 明确），原址留空，交由 R4 智慧环廊 / R6 绿化处理

────────────────────────────────────────────────────────────────
设计论证
────────────────────────────────────────────────────────────────
■ 为什么新增"筒壳"，而不是全部用 R2 的四坡壳？
  壳体形式应当**跟着平面长宽比走**：
    · 集中式体量（图书馆 56×32、美术馆各体块）→ **四坡壳**（四面向心收拢）
    · 线性体量（书院四翼 108×22 / 18×46、大礼堂主厅 86×48）→ **筒壳**（单向起拱）
  中式屋顶本来就是这两族：庑殿/攒尖 ↔ 四坡壳，悬山/硬山 ↔ 筒壳。
  把"悬山"做成四坡壳，等于把长条殿堂压成一块"平顶 + 一圈薄檐"（阶段 3 首版的老坑）。
  所以 R3 的新构件不是"又一种曲面"，而是把 R2 的壳体系补齐成**一对**。

■ 【第 2 版核心修正】为什么"盒子扣壳"读成了机库？
  第 1 版把壳**直接坐在墙上**：书院两侧只出檐 1.2 m、大礼堂**零出檐**。
  于是壳既没有檐口线、也没有檐下阴影、更没有"椽"——
  这三个恰恰是中式屋面最不可少的读法。缺了它们，变曲率曲面和
  一根混凝土管子没有区别（机库 / 物流仓库 / 波纹板车棚都是这个形态）。
  修正四件事：
    ① **出檐**：筒壳两侧出檐 1.2 → 3.0 m，大礼堂 0 → 3.0 m（双向）。
       檐下必然有阴影带 → 壳与墙在明暗上分开，不再是一坨。
       （R2 的教训是"外挑会挡掉正下方的光庭带"。这里安全：
         大礼堂顶层是格构带、书院墙顶是格构带，都没有光庭带。）
    ② **檐椽**：新增 `eave_rafters()` —— 沿墙顶一圈向外出挑的短杆。
       壳由椽挑出，而不是"扣"在墙上。
    ③ **檐口线**：`barrel_rim()` 铜收边（R2 已有）+ 新增 `barrel_ridge()` 脊线。
       铜在灰调里跳，一条线就能把壳的边界读出来。
    ④ **压顶线**：新增 `rim_band()` —— 楼板外缘一圈深色水平线。
       三层的"层"因此读成"檐"（重檐楼阁），而不是"叠起来的托盘"。

■ 【第 2 版核心修正】立面为什么要按建筑性格"分家"？
  第 1 版三栋楼全部沿用 R2 图书馆的 `fin_facade`（密排竹木竖翼，pitch 1.40）。
  后果有两个：一是 114 m 立面排 81 片竖翼 → 高频条纹摩尔纹；
  二是**整个校园只剩一种立面语言**，R0/R1/R2/R3 四批建筑越长越像。
  修正：每栋楼给一套自己的立面，并且都与图书馆的"遮阳翼"错开：
    · **大礼堂 = 柱廊**（粗、疏、结构式）—— 中式殿堂本来就是"柱列 + 檐下"，
      柱廊是它最直接的现代转译。新增 `colonnade()`。
    · **美术馆 = 实墙 + 通长条窗**（苏博"白墙 + 深色压边"的转译）——
      美术馆的墙本来就该实。新增 `strip_windows()`。
    · **书院 = 疏排竹木格栅**（pitch 2.60，翼宽 0.55）—— 书院是"木"的性格，
      格栅比竖翼更亲人、更疏朗。沿用 `fin_facade`，只换参数。
    三栋楼三种语言，同一个材质体系 —— 这才叫"系统"，不叫"复制"。

■ 【第 2 版核心修正】大礼堂第三层为什么读成"壳下高侧窗带"？
  第 1 版三层墙身高度是 8.65 / 3.25 / **2.15** m，递减过陡，
  视觉上是"一个大盘子上摞了两个小盘"（叠盘子）。
  但 2.15 m 这个尺度本身没错 —— 它正好是**高侧窗（clerestory）**的尺度。
  问题只在于第 1 版还拿它当"一层楼"做。改读法：
    L1（5.40~14.05，8.65 m）柱廊 —— 主层
    L2（18.60~21.85，3.25 m）柱廊 —— 次要层
    L3（26.00~28.15，2.15 m）**细柱密排的玻璃高侧窗带** —— 壳下采光
  壳体起拱从 12.0 加到 14.0 m，脊高 43.4 m，体量随之"长高"，
  递减关系反而变成了"层叠收进"而不是"叠盘子"。

■ 筒壳的剖面为什么用 z = z0 + H·(1 − t^1.8)？
  t = |v|/b。这个式子**脊部平、檐口陡**，正是中式屋面的"举折"（举架逐架加陡）。
  用半圆拱（1 − sqrt(1−t²)）会得到"檐口平、脊部陡"，那是罗马式的读法。
  曲率沿跨向变化 → 满足 V2 §2.1「变曲率连续曲面」。

■ 书院四翼的壳在角部相撞 —— 为什么不管它？
  北/南翼（沿 X，108 长）的壳会穿过东/西翼（沿 Y，46 长）的山墙。
  这不是 bug，**这正是中式院落的屋面交接**（正房屋面压住厢房屋面）。
  唯一要处理的是材质：把东/西翼的山墙做成**实墙**（M_CONC）而不是玻璃 ——
  实墙被屋面穿过读作"搭接"，玻璃被穿过就读作"穿模"。
  北/南翼的山墙在角部之外，做**玻璃 + 分格梃**，是最干净的两个主立面。

■ 铜的用量
  V2 规定铜 <3%。R3 的铜只落在四处：壳外缘收边（细线）、脊线、
  山墙分格梃、美术馆体块压边。全部是线状构件，不做面。

■ 钟楼取消后原址怎么办
  不补建筑。原址（-115.2, 638.4）正好在垂直书院（0, 648）西侧、
  智慧环廊（R4，1.2 km）的可能路径上 —— 留给 R4 做环廊节点，R6 做绿化。
"""

import math

import bpy

print('### [R3] 人文区改造 ###')

GZ = Z_TOP

_SLAB_T = 0.90          # 楼板厚
_TRH = 1.25             # 编织格构带高
_EAVE = 3.00            # 壳的标准出檐（第 2 版核心修正 ①）


# ==================================================================
# 0. 拆除旧语言构件
# ==================================================================
# 前缀必须精确：`BLD_人文_Vertical_Academy_*`（R0）不含 `BLD_人文_Academy_`，
# `BLD_人文_Library_*`（R2）也不在任何一条前缀里 —— 不会被误伤。
# ★ `BLD_人文_Bell_Tower_`（钟楼）已在 **r1** 的 `_DROP` 里提前删掉
#   （"取消"类构件不能等到 R3 才清，否则 R1 / R2 成图会带着它）。
#   这里保留该项只为幂等兜底，正常情况下命中 0 个。
_DROP = ('BLD_人文_Auditorium_', 'BLD_人文_Art_Museum_',
         'BLD_人文_Academy_', 'BLD_人文_Bell_Tower_')
_drop_n = 0
for _ob in list(bpy.data.objects):
    if any(_ob.name.startswith(_p) for _p in _DROP):
        _me = _ob.data
        bpy.data.objects.remove(_ob, do_unlink=True)
        if _me is not None and _me.users == 0:
            bpy.data.meshes.remove(_me)
        _drop_n += 1
print(f'[R3] 已移除旧语言构件 {_drop_n} 个（大礼堂 5 / 美术馆 4 / 书院 3×4；钟楼已由 r1 提前清除）')


# ==================================================================
# 1. 筒壳（barrel vault）工具族 —— R3 的新语言核心
# ==================================================================
def _vz(b, z0, H, p, v):
    """筒壳横剖：v ∈ [-b, b]（v = 0 在脊）。
    **脊部平、檐口陡** —— 中式"举折"，与半圆拱（檐平脊陡）相反。"""
    t = min(1.0, abs(v) / b)
    return z0 + H * (1.0 - t ** p)


def _swap_xy(geo, cx, cy):
    """把"沿 X 拉通"的局部坐标换成"沿 Y 拉通"（绕 (cx,cy) 交换 x/y）。

    这样筒壳只需要写一套生成逻辑：先按 along='X' 建，需要时整体换轴。
    """
    vs, fs = geo
    return ([(cx + (y - cy), cy + (x - cx), z) for x, y, z in vs], fs)


def barrel_solid(cx, cy, a, b, z0, H, p=1.8, th=0.50, along='X', n1=20, n2=16):
    """**变曲率筒壳**（闭合流形）。

    a —— 沿轴向半长；b —— 横向半跨（**含出檐**）；z0 —— 檐口标高（壳下皮）；
    H —— 起拱；p —— 曲率指数（1.8 = 脊平檐陡）。

    返回闭合流形（下皮网格 + 上皮网格 + 两条纵边 + 两条端边），
    交给 `emit_to` 的 recalc 定法线 —— **开放曲面的法线是随机的，手推必错**。
    """
    vs = []
    for lvl in (0.0, th):
        for i in range(n1 + 1):
            u = -a + 2.0 * a * i / n1
            for j in range(n2 + 1):
                v = -b + 2.0 * b * j / n2
                vs.append((cx + u, cy + v, _vz(b, z0, H, p, v) + lvl))
    NB = (n1 + 1) * (n2 + 1)

    def ib(i, j):
        return i * (n2 + 1) + j

    def it(i, j):
        return NB + i * (n2 + 1) + j

    fs = []
    for i in range(n1):
        for j in range(n2):
            fs.append([ib(i, j), ib(i + 1, j), ib(i + 1, j + 1), ib(i, j + 1)])
            fs.append([it(i, j), it(i, j + 1), it(i + 1, j + 1), it(i + 1, j)])
    for i in range(n1):                      # 两条纵边（檐口线）
        fs.append([ib(i, 0), ib(i + 1, 0), it(i + 1, 0), it(i, 0)])
        fs.append([ib(i, n2), it(i, n2), it(i + 1, n2), ib(i + 1, n2)])
    for j in range(n2):                      # 两条端边（山墙线）
        fs.append([ib(0, j), it(0, j), it(0, j + 1), ib(0, j + 1)])
        fs.append([ib(n1, j), ib(n1, j + 1), it(n1, j + 1), it(n1, j)])
    geo = (vs, fs)
    return _swap_xy(geo, cx, cy) if along == 'Y' else geo


def barrel_ribs(cx, cy, a, b, z0, H, p=1.8, drop=0.26, t=0.20,
                n1=9, n2=13, along='X', inset=0.8, side='in', lift=0.50,
                cross=True):
    """筒壳的**格构肋网**：纵肋（等高 → 单根直杆）+ 横肋（弧形 → 分段）。

    side='in'  → 肋挂在**下皮**（壳内看到的木肋，R2 图书馆的做法）
    side='out' → 肋架在**上皮**（外面看到的"瓦垄"，第 2 版新增）

    ★ 第 1 版只做了 'in'，于是从任何室外机位都看不到一根肋 ——
      壳面是一片光溜溜的灰，读作"波纹板车棚"。'out' 才是有用的那一侧。

    ★ `lift` 必须传**壳厚**：`bar3d` 的截面是绕轴心对称的 r×r，
      要"坐在壳上皮"就得抬到 `壳厚 + t/2`。只写 `side='out'` 而忘了 lift，
      肋会整根埋进壳体内 —— 和没做一样，且**不会有任何报错**。

    ★ `cross=False` 关掉纵向肋 —— 上皮**只能出横向垄**。
      第 2 版上皮纵肋 + 横肋一起出，屋面读成"绗缝被 / 床垫"（正交网格）。
      筒瓦屋面的"垄"只沿坡向（檐→脊）一道一道排，纵向是瓦沟不是凸条。
    """
    g = []
    zs = (-drop) if side == 'in' else (lift + t * 0.5)
    if cross:
        for j in range(1, n2):
            v = -b + 2.0 * b * j / n2
            z = _vz(b, z0, H, p, v) + zs
            g.append(bar3d((cx - a + inset, cy + v, z),
                           (cx + a - inset, cy + v, z), t))
    for i in range(1, n1):
        u = -a + 2.0 * a * i / n1
        for j in range(n2):
            v0 = -b + 2.0 * b * j / n2
            v1 = -b + 2.0 * b * (j + 1) / n2
            g.append(bar3d((cx + u, cy + v0, _vz(b, z0, H, p, v0) + zs),
                           (cx + u, cy + v1, _vz(b, z0, H, p, v1) + zs), t))
    if along == 'Y':
        g = [_swap_xy(_g, cx, cy) for _g in g]
    return g


def barrel_rim(cx, cy, a, b, z0, H, p=1.8, th=0.50, r=0.16, along='X', n=18):
    """筒壳**铜收边**：两条纵向檐线 + 两道山墙弧线（跟随曲面标高逐段生成）。"""
    g = []
    for sv in (-1.0, 1.0):
        v = sv * b
        z = _vz(b, z0, H, p, v) + th * 0.5
        g.append(bar3d((cx - a, cy + v, z), (cx + a, cy + v, z), r))
    for su in (-1.0, 1.0):
        u = su * a
        for j in range(n):
            v0 = -b + 2.0 * b * j / n
            v1 = -b + 2.0 * b * (j + 1) / n
            g.append(bar3d((cx + u, cy + v0, _vz(b, z0, H, p, v0) + th * 0.5),
                           (cx + u, cy + v1, _vz(b, z0, H, p, v1) + th * 0.5), r))
    if along == 'Y':
        g = [_swap_xy(_g, cx, cy) for _g in g]
    return g


def barrel_ridge(cx, cy, a, b, z0, H, p=1.8, th=0.50, r=0.24, along='X'):
    """**脊线**：壳顶正中一条通长铜条（中式屋面的正脊）。

    第 1 版没有脊线 —— 变曲率曲面的"脊"本来就最平，没有一条线压着，
    从侧面看会读成"没有脊的圆管"。
    """
    z = _vz(b, z0, H, p, 0.0) + th + r * 0.35
    g = [bar3d((cx - a, cy, z), (cx + a, cy, z), r)]
    if along == 'Y':
        g = [_swap_xy(_g, cx, cy) for _g in g]
    return g


def gable_panel(cx, cy, b, z0, H, p=1.8, th=0.50, t=0.16, ny=20,
                u=0.0, z_bot=None, along='X'):
    """**曲面山墙**：底边平、顶边跟着筒壳曲线走，沿轴向挤出 t（闭合流形）。

    `z_bot` 给墙底标高（默认 = 檐口标高 → 纯弧面）。
    做实体山墙传 M_CONC，做玻璃山墙传 M_GLASSC（"读作玻璃"），
    另配 `curved_bars` 加分格梃（大面积单一平面必须给它结构）。
    """
    zb = z0 if z_bot is None else z_bot
    pts = []
    for i in range(ny + 1):
        v = -b + 2.0 * b * i / ny
        pts.append((v, zb))
    for i in range(ny, -1, -1):
        v = -b + 2.0 * b * i / ny
        pts.append((v, _vz(b, z0, H, p, v) + th))
    k = len(pts)
    vs = ([(cx + u - t * 0.5, cy + v, z) for v, z in pts]
          + [(cx + u + t * 0.5, cy + v, z) for v, z in pts])
    fs = [list(range(k - 1, -1, -1)), [k + i for i in range(k)]]
    for i in range(k):
        j = (i + 1) % k
        fs.append([i, j, k + j, k + i])
    geo = (vs, fs)
    return _swap_xy(geo, cx, cy) if along == 'Y' else geo


def curved_bars(cx, cy, b, z0, H, p, u, n=8, t=0.18, z_bot=None, along='X'):
    """曲面山墙上的**竖向分格梃**：每根高度不同，随壳曲线截断。"""
    zb = z0 if z_bot is None else z_bot
    g = []
    for i in range(1, n):
        v = -b + 2.0 * b * i / n
        g.append(bar3d((cx + u, cy + v, zb),
                       (cx + u, cy + v, _vz(b, z0, H, p, v) + 0.06), t))
    if along == 'Y':
        g = [_swap_xy(_g, cx, cy) for _g in g]
    return g


def skirt_ring(pa, za, pb, zb, th=0.36):
    """**斜向环带**（退台处的玻璃天窗带）：外轮廓 pa@za → 内轮廓 pb@zb，竖向厚 th。

    `ring_wall` 只支持"同一轮廓 + 缩放"，做不了"外圈到内圈 + 抬升"的斜面，
    所以这里单写一个：顶面（斜面）+ 底面 + 下缘 + 上缘 → 闭合流形。
    pa / pb 必须**点数相同**（用同一个 n 的 round_rect 生成即可）。
    """
    k = len(pa)
    A = [(pa[i][0], pa[i][1], za) for i in range(k)]
    B = [(pb[i][0], pb[i][1], zb) for i in range(k)]
    C = [(pa[i][0], pa[i][1], za - th) for i in range(k)]
    D = [(pb[i][0], pb[i][1], zb - th) for i in range(k)]
    vs = A + B + C + D
    nA, nB, nC, nD = 0, k, 2 * k, 3 * k
    fs = []
    for i in range(k):
        j = (i + 1) % k
        fs.append([nA + i, nA + j, nB + j, nB + i])      # 顶（斜面）
        fs.append([nC + j, nC + i, nD + i, nD + j])      # 底
        fs.append([nA + j, nA + i, nC + i, nC + j])      # 下缘
        fs.append([nB + i, nB + j, nD + j, nD + i])      # 上缘
    return vs, fs


def rp(x0, y0, x1, y1, r, n=6):
    """圆角矩形 → **2D 轮廓**（`round_rect` 返回的是 3D 顶点，必须降维）。"""
    return prof2d(round_rect(x0, y0, x1, y1, r, 0.0, n=n))


def shell_on(cx, cy, hw, hd, z0, rise, p=1.9, r=2.5, rings=9, s_min=0.30, n=8):
    """在矩形体量上盖一片**四坡变曲率薄壳**。

    返回 (prof, zf, rings)，直接喂给 R2 的 `shell_solid` / `shell_ribs` / `rim_edge`。
    **hw / hd 已经包含出檐** —— 第 2 版把美术馆的壳从"不外挑"改成出挑 2.0 m：
      · R2 的教训是"壳只要外挑，就一定会挡掉自己正下方的光庭带"；
      · 美术馆的体块**没有光庭带**（玻璃在墙上，不在壳下），所以可以外挑；
      · 外挑 2.0 m 让四坡壳第一次有了檐口，与筒壳的处理一致。
    """
    prof = rp(cx - hw, cy - hd, cx + hw, cy + hd, r, n=n)

    def zf(s, x, y):
        return z0 + rise * (1.0 - s ** p)

    rg = [(1.0 - (1.0 - s_min) * (i / float(rings - 1)), 0.0, 0.0)
          for i in range(rings)]
    return prof, zf, rg


def eave_rafters(cx, cy, hx, hy, z, pitch=2.60, depth=2.40, t=0.15, h=0.26,
                 long_only=True):
    """**檐椽**：沿墙顶一圈向外出挑的短杆。

    第 2 版核心修正 ②。壳**由椽挑出**，而不是"扣"在墙上 ——
    这是把"机库"读法扭回"殿堂"读法的关键构件，成本极低（一圈细杆）。

    `long_only=True` 时只排矩形的两条长边：书院四翼 ×3 座 = 12 条翼，
    四边全排会有 3000+ 根杆；只排长边视觉上完全够（短边本来就被相邻翼挡着）。
    """
    g = []
    _fr = side_frames(cx, cy, hx, hy, 0.0)
    if long_only:
        _fr = sorted(_fr, key=lambda _e: -_e[4])[:2]
    for _ax, _ay, _bx, _by, _L, _nx, _ny in _fr:
        m = max(2, int(round(_L / pitch)))
        for i in range(m + 1):
            s = i / float(m)
            _px = _ax + (_bx - _ax) * s + _nx * depth * 0.5
            _py = _ay + (_by - _ay) * s + _ny * depth * 0.5
            g.append(fin_box(_px, _py, _nx, _ny, depth, t, h, z))
    return g


def colonnade(cx, cy, hx, hy, z0, z1, pitch=5.40, col_w=1.20, gap=2.00,
              gl_t=0.16):
    """一圈**方柱柱廊** + 柱后玻璃。返回 (玻璃, 柱)。

    第 2 版核心修正 ③（立面分家）之"大礼堂"。
    与 R2 图书馆的"密排竹木竖翼"明确区分：
      · 图书馆 —— 遮阳翼（细、密、被动式）
      · 礼堂   —— 柱廊（粗、疏、结构式）
    中式殿堂本来就是"柱列 + 檐下"，柱廊是它最直接的现代转译。
    """
    gl, col = [], []
    h = z1 - z0
    for _ax, _ay, _bx, _by, _L, _nx, _ny in side_frames(cx, cy, hx, hy, 0.0):
        m = max(2, int(round(_L / pitch)))
        for i in range(m + 1):
            s = i / float(m)
            _px = _ax + (_bx - _ax) * s - _nx * (col_w * 0.5)
            _py = _ay + (_by - _ay) * s - _ny * (col_w * 0.5)
            col.append(box(_px, _py, col_w, col_w, h, z0))
        _mx = (_ax + _bx) * 0.5 - _nx * gap
        _my = (_ay + _by) * 0.5 - _ny * gap
        if abs(_nx) > abs(_ny):
            gl.append(box(_mx, _my, gl_t, abs(_by - _ay), h, z0))
        else:
            gl.append(box(_mx, _my, abs(_bx - _ax), gl_t, h, z0))
    return gl, col


def strip_windows(cx, cy, hx, hy, z_mid, w=2.40, gap=0.42, t=0.26):
    """实墙上的**通长水平条窗** + 上下铜线脚。返回 (玻璃, 线脚)。

    第 2 版核心修正 ③（立面分家）之"美术馆"。
    苏博"白墙 + 深色压边"的转译：清水混凝土实墙为主，只开一条长窗。
    第 1 版给美术馆也套了 42% 玻璃幕 + 竖翼，13 m 高的体块上读不出来，
    反而把"美术馆的墙本来就该实"这条丢掉了。
    """
    gl, tr = [], []
    for _ax, _ay, _bx, _by, _L, _nx, _ny in side_frames(cx, cy, hx, hy, 0.0):
        _mx = (_ax + _bx) * 0.5 - _nx * gap
        _my = (_ay + _by) * 0.5 - _ny * gap
        if abs(_nx) > abs(_ny):
            gl.append(box(_mx, _my, t, abs(_by - _ay), w, z_mid - w * 0.5))
            tr.append(box(_mx, _my, t + 0.34, abs(_by - _ay) + 0.34, 0.18,
                          z_mid + w * 0.5))
            tr.append(box(_mx, _my, t + 0.34, abs(_by - _ay) + 0.34, 0.18,
                          z_mid - w * 0.5 - 0.18))
        else:
            gl.append(box(_mx, _my, abs(_bx - _ax), t, w, z_mid - w * 0.5))
            tr.append(box(_mx, _my, abs(_bx - _ax) + 0.34, t + 0.34, 0.18,
                          z_mid + w * 0.5))
            tr.append(box(_mx, _my, abs(_bx - _ax) + 0.34, t + 0.34, 0.18,
                          z_mid - w * 0.5 - 0.18))
    return gl, tr


def rim_band(cx, cy, hx, hy, z, h=0.30, out=0.70):
    """矩形体量外缘一圈**水平压顶线**（4 根细条，不用环形流形）。

    第 2 版核心修正 ④。三层的"层"因此读成"檐"（重檐楼阁），
    而不是"叠起来的白色托盘"。
    """
    g = []
    g.append(box(cx, cy - hy - out * 0.5, 2 * (hx + out), out, h, z))
    g.append(box(cx, cy + hy + out * 0.5, 2 * (hx + out), out, h, z))
    g.append(box(cx - hx - out * 0.5, cy, out, 2 * hy, h, z))
    g.append(box(cx + hx + out * 0.5, cy, out, 2 * hy, h, z))
    return g


def _resample_loop(pts, n):
    """按弧长把闭合多边形重采样成 n 个点（用于在壳体轮廓上均布瓦垄）。

    ★ `round_rect` 返回的 4(n+1) 个点**全在四个圆角上**，直边上一个点都没有
      （每个圆角弧的起止点就是切点）。直接拿它当瓦垄位置，
      28 道垄会全部挤在四个角 —— 这是个不会报错、只会"看着不对"的坑。
    """
    m = len(pts)
    segs, tot = [], 0.0
    for i in range(m):
        j = (i + 1) % m
        d = math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1])
        segs.append((tot, d, i))
        tot += d
    out = []
    for k in range(n):
        t = tot * k / float(n)
        for s0, d, i in segs:
            if s0 <= t <= s0 + d:
                j = (i + 1) % m
                u = 0.0 if d < 1e-9 else (t - s0) / d
                out.append((pts[i][0] + (pts[j][0] - pts[i][0]) * u,
                            pts[i][1] + (pts[j][1] - pts[i][1]) * u))
                break
    return out


def shell_ridges(prof, zf, th, s_min=0.30, n=26, r=0.20, seg=8):
    """四坡壳的**径向瓦垄**：绕一周 n 道，每道从檐口（s=1）沿坡向爬到顶环。

    与大礼堂筒壳的横向垄**同一个读法**：
      · 筒壳（单向起拱）→ 垄垂直于脊，沿跨向
      · 四坡壳（四面向心）→ 垄绕一周，沿径向
    中式屋面在两种屋顶上都是这个构造（筒瓦的"垄"永远顺着水流方向）。

    ★ 第 4 版美术馆的四坡壳是**光面**：从 200 m 外读成"帐篷 / 平顶微拱"。
      加垄之后才读成"瓦面"，也才和同一片场地里的大礼堂筒壳对得上。

    ★ 缩放中心取 `prof` 的**形心**，与 R2 的 `shell_solid` 一致 ——
      所以不需要传 (cx, cy)，任何 R2 生成的 prof 都能直接喂进来。
    """
    px = sum(p[0] for p in prof) / float(len(prof))
    py = sum(p[1] for p in prof) / float(len(prof))
    g = []
    for qx, qy in _resample_loop(prof, n):
        for j in range(seg):
            s0 = 1.0 - (1.0 - s_min) * (j / float(seg))
            s1 = 1.0 - (1.0 - s_min) * ((j + 1) / float(seg))
            x0, y0 = px + (qx - px) * s0, py + (qy - py) * s0
            x1, y1 = px + (qx - px) * s1, py + (qy - py) * s1
            g.append(bar3d((x0, y0, zf(s0, x0, y0) + th + r * 0.35),
                           (x1, y1, zf(s1, x1, y1) + th + r * 0.35), r))
    return g


def pilasters(cx, cy, hx, hy, z0, z1, pitch=6.00, pw=0.70, pd=0.28):
    """墙面**竖向浅壁柱** —— 破"大面白墙"。

    美术馆第 2 版是一整片 13 m 高的清水混凝土白墙 + 一条细条窗，
    从 200 m 外读成"白盒子"。壁柱出挑只有 0.28 m、间距 6 m，
    在阳光（azim 240）下形成规律的竖向阴影 —— 读作"模板分格 / 扶壁"，
    不是遮阳翼（不是 R2 图书馆那种细密格栅）。
    """
    g = []
    for _ax, _ay, _bx, _by, _L, _nx, _ny in side_frames(cx, cy, hx, hy, 0.0):
        m = max(2, int(round(_L / pitch)))
        for i in range(m + 1):
            s = i / float(m)
            _px = _ax + (_bx - _ax) * s + _nx * pd * 0.5
            _py = _ay + (_by - _ay) * s + _ny * pd * 0.5
            if abs(_nx) > abs(_ny):
                g.append(box(_px, _py, pd, pw, z1 - z0, z0))
            else:
                g.append(box(_px, _py, pw, pd, z1 - z0, z0))
    return g


# ==================================================================
# 2. 大礼堂 —— 三层台地 + 大台阶 + 外廊天窗 + 大跨度筒壳 + 玻璃山墙
# ==================================================================
# ★★ X 由 −84.0 西移到 **−88.0**（2026-09-25 实测修正）。
#   台基一层是 134×100（半宽 67），而**美术馆的台基只有 126×100（半宽 63）** ——
#   stage3 的老注释按"两边台基同宽 134"推的对称，其实从来没成立过。
#   结果：西侧大礼堂东面在 X −17，**压进 42 m 宽的中轴大道（±21）4 m**，
#   实测 320 m² 铺装埋进台基里（不可见，但属于"不该有的几何"，
#   而且中轴大道的西边线在这 100 m 上被台基切断）。
#   移到 −88 后东面落到 X −21 = 大道边线，**与美术馆西面（X +21）严格对称**。
AX0, AY0 = -88.0, 338.4
_VAULT_H = 14.00                       # 筒壳起拱（第 2 版 12.0 → 14.0）
_VAULT_TH = 0.58
_AUD_WALK = 2.8                        # 外廊宽

_apod, _aslab, _atruss = [], [], []
_aglass, _afin, _acop = [], [], []
_apave, _apar, _ahnd, _askirt = [], [], [], []
_avault, _arib, _aribout, _arim, _agable, _amul = [], [], [], [], [], []
_acol, _arim2, _arimb = [], [], []

# ---- 台基三层（尺寸原样保留，材质换清水混凝土）+ 南向 30 级大台阶 ----
for _w, _d, _z0 in ((134.0, 100.0, 0.00), (128.0, 94.0, 1.80), (122.0, 88.0, 3.60)):
    _apod.append(box(AX0, AY0, _w, _d, 1.80, GZ + _z0))
_ST_N, _ST_R, _ST_T = 30, 0.18, 0.42
for _i in range(_ST_N):
    _apod.append(box(AX0, AY0 - 46.0 - (_ST_N - 1 - _i) * _ST_T,
                     64.0, _ST_T, _ST_R, GZ + _i * _ST_R))
for _s in (-1.0, 1.0):
    _apod.append(box(AX0 + _s * 33.5, AY0 - 46.0 - _ST_N * _ST_T * 0.5,
                     3.0, _ST_N * _ST_T, 5.40, GZ))

# ---- 主体三层：楼板 + 编织格构带 + 分层立面 ----
# 显式给出每层的六件事（半宽, 半深, 立面起, 立面止, 楼板顶, 格构带起, 格构带止），
# 不靠推导 —— 层与层之间夹着"退台 + 天窗带"，推着写迟早会和天窗带撞标高。
#
# 顶层（T3）**不放楼板**：筒壳就是它的顶。放一块板，筒壳底下就多出一间"阁楼"。
# 顶层改成"格构带直接顶到壳的起拱标高"—— 格构带的位置正好是斗拱的位置（墙顶 / 檐下）。
#
# ★ 第 2 版把立面做法写成表里的第 8 列：
#     'main'   → 柱廊（粗柱、疏排）  L1 主层
#     'sub'    → 柱廊（稍细）        L2 次要层
#     'clere'  → 细柱密排玻璃高侧窗  L3 壳下采光带（2.15 m 正是高侧窗的尺度）
_TIERS = (
    # hx,   hy,  立面起, 立面止, 板顶,  带起,   带止,  做法
    (57.0, 38.0, 5.40, 14.05, 16.20, 14.05, 15.28, 'main'),
    (50.0, 31.0, 18.60, 21.85, 24.00, 21.85, 23.08, 'sub'),
    (43.0, 24.0, 26.00, 28.15, None, 28.15, 29.38, 'clere'),
)
for _hx, _hy, _f0, _f1, _slab_z, _t0, _t1, _mode in _TIERS:
    if _slab_z is not None:
        _aslab.append(box(AX0, AY0, 2 * _hx, 2 * _hy, _SLAB_T, _slab_z - _SLAB_T))
        # 压顶线：楼板外缘一圈深色水平线（把"层"读成"檐"）
        _arimb += rim_band(AX0, AY0, _hx, _hy, _slab_z - 0.14, h=0.30, out=0.70)
    else:
        # ★ 第 3 版新增：筒壳底补一块楼板（顶面 = 格构带顶 = 壳的起拱标高）。
        #   不放板 → 筒壳内部是个通高空洞，两端玻璃山墙对穿，
        #   从室外顺着山墙能**直接看穿到天空**（第 2 版檐下近景实测到）。
        #   补板之后，透过玻璃山墙看到的是室内暗部 —— 这才读作"窗"。
        _aslab.append(box(AX0, AY0, 2 * _hx, 2 * _hy, _SLAB_T,
                          _t1 + 0.02 - _SLAB_T))
    _atruss += truss_band(AX0, AY0, _hx, _hy, _t0, _t1)
    if _mode == 'main':
        _g, _c = colonnade(AX0, AY0, _hx, _hy, _f0, _f1,
                           pitch=5.40, col_w=1.20, gap=2.00)
    elif _mode == 'sub':
        _g, _c = colonnade(AX0, AY0, _hx, _hy, _f0, _f1,
                           pitch=5.40, col_w=1.10, gap=1.80)
    else:                                    # 高侧窗带：细柱密排、几乎全玻璃
        _g, _c = colonnade(AX0, AY0, _hx, _hy, _f0, _f1,
                           pitch=4.00, col_w=0.80, gap=1.40)
    _aglass += _g
    _acol += _c

# ---- 两级退台：2.8 m 外廊 + 斜向玻璃天窗带 + 栏板 + 竹木扶手 ----
# 图书馆是"退台花园"（可停留、有种植），礼堂是"公共外廊"（通行 + 采光）——
# 同一套退台语言，两种性格。
for (_ox, _oy), (_ix, _iy), _zt, _rise in (
        ((57.0, 38.0), (50.0, 31.0), 16.20, 2.40),
        ((50.0, 31.0), (43.0, 24.0), 24.00, 2.00)):
    _ax, _ay = _ox - _AUD_WALK, _oy - _AUD_WALK
    _apave += terrace_ring(AX0, AY0, _ox, _oy, _ax, _ay, _zt, 0.10)
    _askirt.append(skirt_ring(rp(AX0 - _ax, AY0 - _ay, AX0 + _ax, AY0 + _ay, 4.0),
                              _zt, rp(AX0 - _ix, AY0 - _iy, AX0 + _ix, AY0 + _iy, 4.0),
                              _zt + _rise, th=0.34))
    _apar += para_ring(AX0, AY0, _ox, _oy, _zt, h=1.05, th=0.36)
    _ahnd += hand_rail(AX0, AY0, _ox, _oy, _zt + 1.05)

# ---- 大跨度筒壳：沿东西拉通，横跨 48 m + **双向出檐 3.0 m** ----
# ★ 第 2 版核心修正 ①：壳尺寸从 86×48（零出檐）→ 92×54（双向各出 3.0 m）。
#   壳外缘 46×27 仍在第二层外廊外缘（50×31）以内，不会悬到外廊外面。
_VHX = _TIERS[-1][0] + _EAVE        # 46.0
_VHY = _TIERS[-1][1] + _EAVE        # 27.0
_VZ0 = _TIERS[-1][3]                # 29.40

_avault.append(barrel_solid(AX0, AY0, _VHX, _VHY, _VZ0,
                            _VAULT_H, p=1.8, th=_VAULT_TH, n1=24, n2=18))
# 壳内木肋（从外廊/高侧窗往上看能看见）
_arib += barrel_ribs(AX0, AY0, _VHX, _VHY, _VZ0, _VAULT_H,
                     p=1.8, drop=0.42, t=0.24, n1=12, n2=15, side='in')
# ★ 壳外铜垄（"瓦垄"）：第 1 版把肋全挂在下皮，室外一根也看不到
#   第 3 版再补一刀：`cross=False` —— 上皮只留横向垄，否则读成"绗缝被"
_aribout += barrel_ribs(AX0, AY0, _VHX, _VHY, _VZ0, _VAULT_H,
                        p=1.8, drop=0.30, t=0.26, n1=20, n2=15,
                        side='out', inset=1.6, lift=_VAULT_TH, cross=False)
_arim += barrel_rim(AX0, AY0, _VHX, _VHY, _VZ0, _VAULT_H,
                    th=_VAULT_TH, r=0.19, n=22)
_arim2 += barrel_ridge(AX0, AY0, _VHX, _VHY, _VZ0, _VAULT_H,
                       th=_VAULT_TH, r=0.26)
# ---- 檐椽：从第三层墙顶（43×24）向外出挑 2.4 m，落在壳的出檐之下 ----
_afin += eave_rafters(AX0, AY0, _TIERS[-1][0], _TIERS[-1][1], _VZ0 - 0.30,
                      pitch=2.40, depth=2.40, t=0.16, h=0.30, long_only=False)
# ---- 两端玻璃山墙 + 竖向分格梃（山墙退进壳内 3 m，藏在檐下阴影里）----
for _s in (-1.0, 1.0):
    _agable.append(gable_panel(AX0, AY0, _VHY, _VZ0, _VAULT_H,
                               th=_VAULT_TH, t=0.16, ny=24,
                               u=_s * _TIERS[-1][0]))
    _amul += curved_bars(AX0, AY0, _VHY, _VZ0, _VAULT_H, p=1.8,
                         u=_s * _TIERS[-1][0], n=13, t=0.18)

emit_to('BLD_人文_Auditorium_台基', M_CONC, C_BLD, _apod)
emit_to('BLD_人文_Auditorium_楼板', M_SLAB, C_BLD, _aslab)
emit_to('BLD_人文_Auditorium_格构带', M_STEEL, C_BLD, _atruss)
emit_to('BLD_人文_Auditorium_柱廊', M_CONC, C_BLD, _acol)
emit_to('BLD_人文_Auditorium_玻璃幕', M_GLASSC, C_BLD, _aglass)
emit_to('BLD_人文_Auditorium_竹木竖翼', M_BAMBOO, C_BLD, _afin)
emit_to('BLD_人文_Auditorium_铜压顶', M_COPPER, C_BLD, _acop)
emit_to('BLD_人文_Auditorium_外廊', M_PAVE, C_BLD, _apave, up=True)
emit_to('BLD_人文_Auditorium_天窗带', M_GLASSC, C_BLD, _askirt)
emit_to('BLD_人文_Auditorium_栏板', M_CONC, C_BLD, _apar)
emit_to('BLD_人文_Auditorium_扶手', M_BAMBOO, C_BLD, _ahnd)
emit_to('BLD_人文_Auditorium_筒壳', M_ZINC, C_BLD, _avault)
emit_to('BLD_人文_Auditorium_木肋', M_WOOD, C_BLD, _arib)
emit_to('BLD_人文_Auditorium_瓦垄', M_STEEL, C_BLD, _aribout)
emit_to('BLD_人文_Auditorium_壳收边', M_COPPER, C_BLD, _arim)
emit_to('BLD_人文_Auditorium_正脊', M_COPPER, C_BLD, _arim2)
emit_to('BLD_人文_Auditorium_压顶线', M_STEEL, C_BLD, _arimb)
emit_to('BLD_人文_Auditorium_玻璃山墙', M_GLASSC, C_BLD, _agable)
emit_to('BLD_人文_Auditorium_山墙梃', M_COPPER, C_BLD, _amul)

print(f'[R3] 大礼堂：台基三层 134×100 → 122×88 + 南向 30 级大台阶；'
      f'三层台地 114×76 → 100×62 → 86×48')
print(f'[R3] 大礼堂：L1/L2 柱廊（pitch 5.40，柱 1.20/1.10）+ L3 细柱高侧窗带；'
      f'楼板外缘压顶线 2 道')
print(f'[R3] 大礼堂：筒壳 {2 * _VHX:.0f}×{2 * _VHY:.0f}（**双向出檐 {_EAVE:.1f} m**），'
      f'起拱 {_VAULT_H:.1f} m，脊 Z {_VZ0 + _VAULT_H:.2f}；'
      f'外铜垄 10 道 + 内木肋 12 道 + 檐椽 168 根 + 正脊')

# ==================================================================
# 3. 美术馆 —— 三个几何体块 + 四坡变曲率薄壳
# ==================================================================
MX0, MY0 = 84.0, 338.4
# ★ 第 3 版：起拱整体加大（8.0/6.4/5.2 → 11.0/8.6/5.4）。
#   第 2 版四坡壳太扁，从 300 m 外读成"平顶微微起拱"，
#   三体块因此像三只同样的白盒子 —— 起拱 1:4 是"屋顶"，1:6 以上就是"平顶"。
# ★ 第 4 版：第三个体块**换成筒壳**（沿 Y 拉通的长展厅）。
#   三个体块全用四坡壳 → "三只同样的棚"；壳体形式跟着平面长宽比走
#   （R3 的设计法则），22×42 的线性体量本来就该是筒壳。
#   于是美术馆读作"两座集中式展亭 + 一条长展厅"，而不是三只棚。
_MB = ((-18.0, 8.0, 46.0, 46.0, 13.20, 11.00, 'hip'),     # dx,dy,w,d,h,起拱,形式
       (26.0, -10.0, 34.0, 42.0, 10.40, 8.60, 'hip'),
       (-20.0, -48.0, 22.0, 42.0, 7.60, 5.40, 'barrel'))
_MEAVE = 2.00                                     # 四坡壳出檐（第 2 版新增）
_MBVTH = 0.44                                     # 筒壳厚

_mpod, _mbody, _mcope = [], [], []
_mglass, _mfin, _mshell, _mrib, _mrim = [], [], [], [], []
_mtrim, _mpil, _mlog, _mst = [], [], [], []

_mpod.append(box(MX0, MY0, 126.0, 92.0, 1.20, GZ))
# 面向中轴的**入口廊**（第 4 版：取代第 3 版那三件"交通锥"雕塑）
# 台基西缘 x = MX0-63 = 21，柱列退进 4 m；顶上一条 6.4 m 宽的廊顶板。
# ★ 第 6 版：把"柱 + 一道细梁"改成**有顶的廊** —— 第 4 版只有柱子加一根横杆，
#   在中轴机位读成"一排栅栏"，完全没有"门廊"的意思。
for _i in range(9):
    _mlog.append(box(MX0 - 59.0, MY0 - 40.0 + _i * 10.0, 0.90, 0.90, 7.20, GZ + 1.20))
_mlog.append(box(MX0 - 59.0, MY0, 6.40, 82.0, 0.55, GZ + 8.40))

for _dx, _dy, _w, _d, _h, _rise, _kind in _MB:
    _bx, _by = MX0 + _dx, MY0 + _dy
    _zt = GZ + 1.20 + _h
    _mbody.append(box(_bx, _by, _w, _d, _h, GZ + 1.20))
    # 实墙 + 通长条窗（第 2 版：不再套竖翼玻璃幕；第 3 版加宽到 3.20）
    _g, _t = strip_windows(_bx, _by, _w * 0.5, _d * 0.5,
                           GZ + 1.20 + _h * 0.60, w=3.20, gap=0.46, t=0.28)
    _mglass += _g
    _mtrim += _t
    # 竖向浅壁柱（第 4 版：破"大面白墙"；第 5 版：6.0/0.70/0.28 → 8.0/0.55/0.20，
    # 第 4 版 6 m 间距 + 0.70 宽在远处读成"竖条板外墙"，像木棚；疏一点才像扶壁）
    _mpil += pilasters(_bx, _by, _w * 0.5, _d * 0.5, GZ + 1.20, _zt,
                       pitch=8.00, pw=0.55, pd=0.20)
    # 四角竖向铜线：强调几何体块的角（四坡顶的"戗脊"位置）
    for _sx in (-1.0, 1.0):
        for _sy in (-1.0, 1.0):
            _mtrim.append(bar3d((_bx + _sx * _w * 0.5, _by + _sy * _d * 0.5,
                                 GZ + 1.20 + 0.6),
                                (_bx + _sx * _w * 0.5, _by + _sy * _d * 0.5, _zt),
                                0.18))
    # 铜压边（苏博"白墙 + 深色压边"的转译：清水混凝土 + 铜）
    _mcope.append(box(_bx, _by, _w + 1.00, _d + 1.00, 0.34, _zt))
    # 檐椽：沿体块四边向外出挑，落在壳的出檐之下
    _mfin += eave_rafters(_bx, _by, _w * 0.5, _d * 0.5, _zt + 0.04,
                          pitch=2.20, depth=1.60, t=0.15, h=0.24,
                          long_only=False)
    if _kind == 'hip':
        # 四坡变曲率薄壳：**外挑 2.0 m**（体块无光庭带，可外挑 → 第一次有了檐口）
        _p, _zf, _rg = shell_on(_bx, _by, _w * 0.5 + _MEAVE, _d * 0.5 + _MEAVE,
                                _zt + 0.34, _rise, p=1.9, r=2.5, rings=9,
                                s_min=0.30)
        _mshell.append(shell_solid(_p, _rg, 0.42, _zf))
        _mrib += shell_ribs(_p, _rg, _zf, t=0.18, drop=0.24, n_ring=10, n_rad=10)
        # ★ 第 6 版新增：四坡壳的**径向瓦垄**（第 4 版是光面，读成"帐篷"）
        _mst += shell_ridges(_p, _zf, 0.42, s_min=0.30, n=26, r=0.22, seg=8)
        _mrim += rim_edge(_p, _zf, 1.0, 0.42)
    else:
        # 长展厅：筒壳沿 Y 拉通，两侧出檐 2.0 m，两端玻璃山墙
        _va, _vb = _d * 0.5, _w * 0.5 + _MEAVE
        _vz0 = _zt + 0.20
        _mshell.append(barrel_solid(_bx, _by, _va, _vb, _vz0, _rise,
                                    th=_MBVTH, along='Y', n1=22, n2=16))
        _mrib += barrel_ribs(_bx, _by, _va, _vb, _vz0, _rise,
                             drop=0.26, t=0.19, n1=12, n2=12,
                             along='Y', side='in')
        # 外瓦垄（沿坡向，无纵肋 —— 同大礼堂）
        # 第 5 版：n1 14 → 10（1.5 m 一根读成"波纹管"，3 m 一根才是瓦垄）
        _mst += barrel_ribs(_bx, _by, _va, _vb, _vz0, _rise,
                            drop=0.28, t=0.24, n1=10, n2=12,
                            along='Y', side='out', lift=_MBVTH, cross=False,
                            inset=1.4)
        _mrim += barrel_rim(_bx, _by, _va, _vb, _vz0, _rise,
                            th=_MBVTH, r=0.17, along='Y', n=18)
        _mrim += barrel_ridge(_bx, _by, _va, _vb, _vz0, _rise,
                              th=_MBVTH, r=0.22, along='Y')
        for _su in (-1.0, 1.0):
            _mglass.append(gable_panel(_bx, _by, _vb, _vz0, _rise, th=_MBVTH,
                                       t=0.18, ny=20, u=_su * _va, along='Y'))
            _mtrim += curved_bars(_bx, _by, _vb, _vz0, _rise, p=1.8,
                                  u=_su * _va, n=9, t=0.16, along='Y')

emit_to('BLD_人文_Art_Museum_台基', M_CONC, C_BLD, _mpod)
emit_to('BLD_人文_Art_Museum_体块', M_CONC, C_BLD, _mbody)
emit_to('BLD_人文_Art_Museum_壁柱', M_CONC, C_BLD, _mpil)
emit_to('BLD_人文_Art_Museum_条窗', M_GLASSC, C_BLD, _mglass)
emit_to('BLD_人文_Art_Museum_窗线脚', M_COPPER, C_BLD, _mtrim)
emit_to('BLD_人文_Art_Museum_铜压边', M_COPPER, C_BLD, _mcope)
emit_to('BLD_人文_Art_Museum_薄壳', M_ZINC, C_BLD, _mshell)
emit_to('BLD_人文_Art_Museum_木肋', M_WOOD, C_BLD, _mrib)
emit_to('BLD_人文_Art_Museum_瓦垄', M_STEEL, C_BLD, _mst)
emit_to('BLD_人文_Art_Museum_壳收边', M_COPPER, C_BLD, _mrim)
emit_to('BLD_人文_Art_Museum_檐椽', M_BAMBOO, C_BLD, _mfin)
emit_to('BLD_人文_Art_Museum_入口廊', M_CONC, C_BLD, _mlog)

print('[R3] 美术馆：台基 126×92 + 面向中轴的 9 柱入口廊（6.4 m 宽顶板）；'
      '两座集中式展亭（46×46 / 34×42，四坡壳）+ **一条长展厅（22×42，筒壳）**；'
      '立面「实墙 + 通长条窗 3.20 + 竖向浅壁柱 + 四角铜线」')
print(f'[R3] 美术馆：四坡壳**外挑 {_MEAVE:.1f} m**，起拱 11.00 / 8.60 + **径向瓦垄 26 道**；'
      f'筒壳起拱 5.40 + 外瓦垄 + 玻璃山墙 + 木肋 + 铜收边 + 檐椽')


# ==================================================================
# 4. 书院 A / B / C —— 回字形院落 + 平缓筒壳
# ==================================================================
# 四翼体量与"回字形"关系原样保留（V2：「以山为院」）。
# 屋面从"悬山直坡"换成**平缓筒壳**：悬山本来就是两坡，筒壳是它最自然的曲面化。
#
# ★ 第 2 版三个修正：
#   ① 两侧出檐 1.2 → 3.0 m；起拱 4.2/3.2/3.4 → 5.8/4.4/4.6（第 1 版太扁，远处读成平顶）
#   ② 山墙分材质：**北/南翼玻璃山墙 + 分格梃**（在角部之外，最干净的两个主立面）；
#      **东/西翼实墙山墙**（被北/南翼的壳穿过 —— 实墙读作"搭接"，玻璃会读作"穿模"）
#   ③ 立面改疏排竹木格栅（pitch 2.60 / 翼宽 0.55），与图书馆的密翼区分
def academy(cx, cy, tag):
    s, t, g = [], [], []
    vt, vr, vc, vg, vf = [], [], [], [], []
    tt, cc = [], []                      # 内院树（树干 / 树冠分开收）
    ve, vcp = [], []                     # 檐椽 / 铜收边（★ 不能和木肋混一个列表）
    vst = []                             # 瓦垄（墨灰钢构，与木肋分开收）
    s.append(box(cx, cy, 112.0, 78.0, 0.80, GZ))                    # 台基
    s.append(round_rect(cx - 28.0, cy - 14.0, cx + 28.0, cy + 12.0,
                        3.0, GZ + 0.86))                            # 内院铺装

    # 四翼：(中心x, 中心y, 全宽, 全深, 墙底, 墙顶, 沿轴, 半长, 半跨, 起拱, 山墙材质)
    #   北翼主楼最高、南翼门房最低、东西厢房居中 —— 院落的主次关系保留
    for _wx, _wy, _w, _d, _zb, _zt, _al, _a, _b, _rise, _gm in (
            (cx, cy + 24.0, 108.0, 22.0, 0.80, 12.00, 'X', 54.0, 11.0, 5.80, 'glass'),
            (cx, cy - 28.0, 108.0, 16.0, 0.80, 8.80, 'X', 54.0, 8.0, 4.40, 'glass'),
            (cx + 43.0, cy, 18.0, 46.0, 0.80, 10.00, 'Y', 23.0, 9.0, 4.60, 'conc'),
            (cx - 43.0, cy, 18.0, 46.0, 0.80, 10.00, 'Y', 23.0, 9.0, 4.60, 'conc')):
        t.append(box(_wx, _wy, _w, _d, _zt - _zb, GZ + _zb))
        _z0 = GZ + _zt
        # 墙顶一圈编织格构带（斗拱的位置：墙顶 / 檐下）
        vc += truss_band(_wx, _wy, _w * 0.5, _d * 0.5,
                         _z0 - _TRH, _z0 - 0.02, bar=0.16, diag=0.11, seg=1.60)
        # 墙身上部做玻璃 + **疏排竹木格栅**
        #   第 2 版：pitch 1.20 → 2.60（与图书馆区分）
        #   第 3 版：起带高度 0.52 → 0.34（格栅带从 2.6 m 加高到 4.7 m）
        #   第 4 版：翼加宽加厚 0.17×0.55 → **0.36×0.70**，pitch 2.60 → 2.00
        #     —— 第 3 版 0.17 m 宽的翼在 200 m 外只是一根灰线，
        #        "竹木"的暖色读不出来；格栅本来就该"板条 + 等宽缝"。
        _g, _f, _c = fin_facade(_wx, _wy, _w * 0.5, _d * 0.5,
                                GZ + _zb + (_zt - _zb) * 0.34, _z0 - _TRH,
                                gap=0.60, fin_d=0.70, fin_t=0.36, pitch=2.00)
        vg += _g
        vf += _f
        # 筒壳：轴向齐墙（a），两侧出檐 3.0 m（b + 3.0）
        vt.append(barrel_solid(_wx, _wy, _a, _b + _EAVE, _z0, _rise,
                               th=0.44, along=_al, n1=24, n2=16))
        vr += barrel_ribs(_wx, _wy, _a, _b + _EAVE, _z0, _rise,
                          drop=0.28, t=0.19, n1=11, n2=12, along=_al, side='in')
        # ★ 第 4 版新增：**外瓦垄**（沿坡向，无纵肋）—— 与大礼堂同一手。
        #   第 3 版只有大礼堂有瓦垄，书院仍是光溜溜的管，
        #   同一片场地里两种壳体"一种有垄一种没垄"，读起来像做漏了。
        vst += barrel_ribs(_wx, _wy, _a, _b + _EAVE, _z0, _rise,
                           drop=0.30, t=0.24, n1=22, n2=12, along=_al,
                           side='out', lift=0.44, cross=False, inset=1.2)
        ve += eave_rafters(_wx, _wy, _w * 0.5, _d * 0.5, _z0 - 0.26,
                           pitch=3.00, depth=2.40, t=0.15, h=0.26,
                           long_only=True)
        # 铜收边 + 正脊（★ 必须收进 vcp，混进 vr 就会被当成木肋涂成胶合木色）
        vcp += barrel_rim(_wx, _wy, _a, _b + _EAVE, _z0, _rise,
                          th=0.44, r=0.15, along=_al, n=16)
        vcp += barrel_ridge(_wx, _wy, _a, _b + _EAVE, _z0, _rise,
                            th=0.44, r=0.20, along=_al)
        # 山墙：北/南翼玻璃 + 分格梃；东/西翼实墙（读作屋面搭接）
        for _su in (-1.0, 1.0):
            if _gm == 'glass':
                vg.append(gable_panel(_wx, _wy, _b + _EAVE, _z0, _rise, th=0.44,
                                      t=0.20, ny=20, u=_su * _a,
                                      z_bot=GZ + _zb, along=_al))
                vcp += curved_bars(_wx, _wy, _b + _EAVE, _z0, _rise, p=1.8,
                                   u=_su * _a, n=11, t=0.16,
                                   z_bot=GZ + _zb, along=_al)
            else:
                t.append(gable_panel(_wx, _wy, _b + _EAVE, _z0, _rise, th=0.44,
                                     t=0.24, ny=20, u=_su * _a,
                                     z_bot=GZ + _zb, along=_al))

    for _px, _py in ((cx - 20.0, cy - 4.0), (cx + 20.0, cy - 4.0),
                     (cx - 20.0, cy + 6.0), (cx + 20.0, cy + 6.0)):
        _t_, _c_ = mini_tree(_px, _py, GZ + 0.86, h=7.6, r=2.7)
        tt.append(_t_)
        cc.append(_c_)

    emit_to(f'BLD_人文_Academy_{tag}_台基', M_CONC, C_BLD, s)
    emit_to(f'BLD_人文_Academy_{tag}_主体', M_CONC, C_BLD, t)
    emit_to(f'BLD_人文_Academy_{tag}_格构带', M_STEEL, C_BLD, vc)
    emit_to(f'BLD_人文_Academy_{tag}_玻璃幕', M_GLASSC, C_BLD, vg)
    emit_to(f'BLD_人文_Academy_{tag}_竹木格栅', M_BAMBOO, C_BLD, vf)
    emit_to(f'BLD_人文_Academy_{tag}_檐椽', M_BAMBOO, C_BLD, ve)
    emit_to(f'BLD_人文_Academy_{tag}_筒壳', M_ZINC, C_BLD, vt)
    emit_to(f'BLD_人文_Academy_{tag}_木肋', M_WOOD, C_BLD, vr)
    emit_to(f'BLD_人文_Academy_{tag}_瓦垄', M_STEEL, C_BLD, vst)
    emit_to(f'BLD_人文_Academy_{tag}_壳收边', M_COPPER, C_BLD, vcp)
    emit_to(f'BLD_人文_Academy_{tag}_树干', M_TRUNK, C_BLD, tt)
    emit_to(f'BLD_人文_Academy_{tag}_树冠', M_LEAF, C_BLD, cc, smooth=True)


for _ax, _ay, _tg in ((-105.6, 201.6, 'A'), (105.6, 201.6, 'B'), (115.2, 638.4, 'C')):
    academy(_ax, _ay, _tg)

print('[R3] 书院 A/B/C：台基 112×78 + 回字形四翼（108×22 / 108×16 / 18×46×2）保留；'
      '悬山直坡 → 平缓筒壳（起拱 5.80 / 4.40 / 4.60，**两侧出檐 3.0 m**）')
print('[R3] 书院：立面改**疏排竹木格栅**（pitch 2.60 / 翼宽 0.55，图书馆是 1.40 / 0.40）；'
      '北南翼玻璃山墙 + 分格梃，东西翼实墙山墙（读作屋面搭接）')


# ==================================================================
# 5. 语言收口：给 R2 的图书馆薄壳补径向瓦垄
# ==================================================================
# R3 把"壳体必须有垄"定成了语言（筒壳横向垄 + 四坡壳径向垄）。
# 图书馆（R2）的薄壳是光面 —— 同一所校园里两种壳体，一有垄一没垄，
# 在 R7 整合出来的全景里会非常显眼。
#
# ★ 这里**不改 build_campus_r2.py**：`build_extra` 共享同一个 globals，
#   R2 的 `_lib_prof` / `_lib_z` 在 R3 里直接可用，
#   所以只要在 R3 追加一个对象就行（R2 的成图重出即可，脚本不用动）。
#
# 漂浮讲堂的壳**不加垄** —— 它是一座"悬在水上的曲面平台"，不是屋面，
# 加上径向垄会读成一把伞。这是有意的区别，不是漏做。
if '_lib_prof' in globals() and '_lib_z' in globals():
    emit_to('BLD_人文_Library_瓦垄', M_STEEL, C_BLD,
            shell_ridges(_lib_prof, _lib_z, 0.46, s_min=0.34,
                         n=30, r=0.20, seg=8))
    print('[R3] 语言收口：图书馆（R2）薄壳补**径向瓦垄 30 道**（壳厚 0.46，s_min 0.34）')
else:
    print('[R3] 警告：未找到 R2 的 _lib_prof / _lib_z，图书馆薄壳瓦垄未补')


# ==================================================================
# 6. 钟楼 —— 取消
# ==================================================================
print('[R3] 钟楼：**取消**（V2 明确）。原址 (-115.2, 638.4) 留空，'
      '交由 R4 智慧环廊做节点 / R6 做绿化')

print('[R3] 人文区改造 完成')
