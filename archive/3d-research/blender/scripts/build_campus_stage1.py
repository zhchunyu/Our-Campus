# -*- coding: utf-8 -*-
"""
build_campus_stage1.py —— 山河大学 · 阶段 1：中轴尽端核心
================================================================
本脚本**不是独立运行**的，由 run_campus.py 在场地脚本之后串联执行，
共享同一个 globals —— 所以 W() / box() / new_obj() / make_mat() / Z_TOP
这些场地脚本里的东西可以直接用，不必抄一遍常量（抄一遍迟早走散）。

产出：
  1. 山河大学图书馆 —— 三层重檐楼阁 + 三层台基丹陛 + 脊上光庭
  2. 镇山塔        —— 七级楼阁式塔 + 须弥座 + 攒尖顶 + 青铜塔刹
  3. 塔院、中轴塔前段、前庭镜面水池与灯柱阵

形制语言来源（只取形制逻辑，不做 1:1 复制）：
  · 应县木塔 / 黄鹤楼 —— 层层出檐、逐层收分、四角起翘、平座栏杆
  · 贝聿铭苏州博物馆 —— 几何化坡顶 + 深色压边 + 白墙
  · 现代图书馆       —— 通高玻璃门厅、竖向棂条、屋脊采光亭

【第二版修掉的 5 个问题】（首版出图后核对发现的）
  1. 屋顶在正立面上压成纯黑剪影 → M_ROOF 0.058→0.092、M_RIDGE 0.104→0.142
  2. 主体层间有 1.8 / 1.4 m 的缝 → BODY 改成首尾相接
  3. 腰檐与大屋顶之间空出 6.4 m 木墙 → 大屋顶起点从 31.80 降到 29.40
  4. 塔 70.4 m 被图书馆 41.2 m 挡住大半 → 塔抬到 ~81 m、图书馆压到 45.3 m
  5. 屋面薄壳的法线靠 recalc 碰运气 → roof_ring 改「平檐底」闭合壳，手推法线
================================================================
"""

import math

import bpy

# ==================================================================
# 0. 清掉阶段 0 的占位体块
# ==================================================================
# 占位体块的名字是 BLD_人文_Library / _Eave、BLD_人文_Zhenshan_Tower / _EaveN，
# 用前缀匹配统一清掉，避免以后改名字时漏删。
_DROP_PREFIX = ('BLD_人文_Library', 'BLD_人文_Zhenshan_Tower')
_dropped = 0
for _ob in list(bpy.data.objects):
    if any(_ob.name.startswith(p) for p in _DROP_PREFIX):
        _me = _ob.data
        bpy.data.objects.remove(_ob, do_unlink=True)
        if _me is not None and _me.users == 0:
            bpy.data.meshes.remove(_me)
        _dropped += 1
print(f'[stage1] 已移除占位体块 {_dropped} 个')


# ==================================================================
# 1. 材质
# ==================================================================
# 瓦面不能太黑：中式屋顶在正立面视角下几乎是逆光，如果基色再压到 0.06，
# 整块屋顶会塌成纯黑剪影，看不出瓦垄、脊线和翼角。抬到 0.092 并保留
# 噪声渐变，才读得出"黛瓦"而不是"黑洞"。
#
# 但**高光必须掐掉**：大屋顶的坡度接近 36°，在 300 m 外、20 m 高的机位上
# 是极掠射角，粗糙度 0.58 的介电面在这个角度会把整片天空镜面反射进来，
# 结果屋顶顶面比白墙还亮，整块屋顶读成浅灰板。粗糙度抬到 0.80 并把
# Specular IOR Level 压到 0.03（几乎无镜面），掠射高光才会消失。
M_ROOF = make_mat('M_瓦屋面', (0.074, 0.082, 0.090), rough=0.80,
                  noise_scale=0.9, col_b=(0.048, 0.054, 0.060))
set_in(principled(M_ROOF), 'Specular IOR Level', 0.03)
M_RIDGE = make_mat('M_脊饰', (0.142, 0.146, 0.152), rough=0.78)
set_in(principled(M_RIDGE), 'Specular IOR Level', 0.08)
M_TIMBER = make_mat('M_木构朱漆', (0.222, 0.082, 0.058), rough=0.70,
                    noise_scale=0.6, col_b=(0.172, 0.062, 0.044))
M_TIMBER_D = make_mat('M_木构深', (0.098, 0.056, 0.044), rough=0.76)
M_STONE = make_mat('M_石作', (0.408, 0.392, 0.362), rough=0.88,
                   noise_scale=0.05, col_b=(0.356, 0.342, 0.316), bump=0.25, bump_scale=1.4)
M_STONE_D = make_mat('M_石作深', (0.292, 0.284, 0.266), rough=0.90,
                     noise_scale=0.06, col_b=(0.248, 0.242, 0.226), bump=0.25, bump_scale=1.6)
M_WALL = make_mat('M_白墙', (0.726, 0.712, 0.676), rough=0.92,
                  noise_scale=0.02, col_b=(0.664, 0.652, 0.620), bump=0.18, bump_scale=0.5)
M_WALL_D = make_mat('M_深灰压边', (0.212, 0.218, 0.228), rough=0.80)
# 塔身用暖石灰，和图书馆的冷白墙（0.726）拉开：
# 两栋都用同一种白，在中轴视角里会糊成一片，塔的层数读不出来。
M_TOWER_WALL = make_mat('M_塔身抹灰', (0.598, 0.562, 0.502), rough=0.90,
                        noise_scale=0.03, col_b=(0.542, 0.508, 0.452), bump=0.16, bump_scale=0.6)
M_GLASS = make_mat('M_玻璃幕', (0.052, 0.082, 0.092), rough=0.055, metal=0.0)
set_in(principled(M_GLASS), 'Transmission Weight', 0.35)
set_in(principled(M_GLASS), 'IOR', 1.45)
# 门窗玻璃用另一支：M_GLASS 太黑（0.052），大面积用在二三层窗带上会读成
# "墙缺了一块"；0.115 的蓝灰在阴影里仍然暗，但有反射层次，读得出是玻璃。
M_WIN = make_mat('M_门窗玻璃', (0.118, 0.140, 0.156), rough=0.115, metal=0.0)
set_in(principled(M_WIN), 'Specular IOR Level', 0.62)
M_BRONZE = make_mat('M_青铜塔刹', (0.598, 0.398, 0.146), rough=0.26, metal=1.0)


# ==================================================================
# 2. 构件工具
# ==================================================================
def square_ring(cx, cy, hw, hd, z, n=8, lift=0.0):
    """方形环的 4n 个点 + 逐点高度（四角起翘）。

    中式屋顶最容易被忽略、又最出效果的一笔就是**翼角起翘**：檐口在四角
    向上翘起。用逐点高度实现，比事后加"翘角"小模型干净得多。
    环按逆时针给（俯视 +X 右、+Y 上），后面所有法线推导都基于这个环绕方向。
    """
    pts, zs = [], []
    corners = [(cx + hw, cy - hd), (cx + hw, cy + hd),
               (cx - hw, cy + hd), (cx - hw, cy - hd)]
    for s in range(4):
        p0, p1 = corners[s], corners[(s + 1) % 4]
        for i in range(n):
            t = i / float(n)
            pts.append((p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t))
            if lift:
                d = min(i, n - 1 - i)
                zs.append(z + lift * max(0.0, 1.0 - d / 2.6) ** 1.5)
            else:
                zs.append(z)
    return pts, zs


def roof_ring(cx, cy, hw_in, hd_in, z_in, hw_out, hd_out, z_out,
              th=0.42, n=8, lift=0.0, cap_hole=True):
    """一块带厚度的坡屋面环（腰檐 / 大屋顶通用）。

    四个要点：

    1. **做成闭合壳**（上表面 + 外檐边 + 平檐底 + **内环封板**）而不是一张单面。
       单面在低机位会看到背面，而开放曲面的法线方向是随机的 ——
       补 `up=True` 也救不了竖直的外檐边（法线 Z 分量为 0）。

    2. **内环必须封底**（`cap_hole`）。大屋顶的内环只有 28×1.2，
       不封的话从檐下仰视会从这道缝里看到里面的阁楼顶（白墙），
       画面上一道亮带横在屋顶上 —— 首版渲出来就是这样，
       用 `scene.ray_cast` 打射线才定位到"命中的是 Body 而不是 Roof"。

    3. **檐底做成平的**（不是跟着屋面斜上去）。斜檐底会在墙顶与屋面之间
       留出一个越靠外越大的空腔，低机位能从檐下看穿进室内。平檐底把
       这个空腔压成一条缝，同时天然形成"檐下天花"的阴影带。

    4. 四张面全部按环绕方向**手推法线**，一次写对，不依赖 recalc
       （调用方必须传 recalc=False）。
    """
    A, za = square_ring(cx, cy, hw_in, hd_in, z_in, n, 0.0)              # 内环·上
    B, zb = square_ring(cx, cy, hw_out, hd_out, z_out, n, lift)          # 外环·上（檐口）
    C = list(B)                                                          # 外环·下
    zc = [v - th for v in zb]
    D, zd = square_ring(cx, cy, hw_in, hd_in, z_out - th, n, 0.0)        # 内环·下（平檐底）
    verts, faces = [], []
    k = len(A)
    for ring, zz in ((A, za), (B, zb), (C, zc), (D, zd)):
        verts.extend([(ring[i][0], ring[i][1], zz[i]) for i in range(k)])
    o1, o2, o3, o4 = 0, k, 2 * k, 3 * k
    for i in range(k):
        j = (i + 1) % k
        faces.append([o1 + i, o2 + i, o2 + j, o1 + j])      # 上表面 → 外 + 上
        faces.append([o2 + i, o3 + i, o3 + j, o2 + j])      # 外檐边 → 外
        faces.append([o3 + i, o4 + i, o4 + j, o3 + j])      # 平檐底 → 下
    if cap_hole:
        # 内环封板：环是逆时针给的，倒序取点才得到朝下的法线
        faces.append([o4 + (k - 1 - i) for i in range(k)])
    return verts, faces


def pyramid_roof(cx, cy, hw, hd, z0, h, n=8, mid=0.62, mid_k=0.52, lift=0.0):
    """四角攒尖顶：底环 → 腰环 → 尖。腰环让屋面有一点"举折"，不是直锥。

    注意面序：底环 → 腰环那一圈必须是 [底i, 底j, 腰j, 腰i]。
    写成 [底i, 腰i, 腰j, 底j] 会得到朝内朝下的法线（首版就踩了这个，
    因为瓦面本来就黑，肉眼几乎看不出来，但明暗是错的）。
    """
    r1, z1 = square_ring(cx, cy, hw, hd, z0, n, lift)
    r2, z2 = square_ring(cx, cy, hw * mid_k, hd * mid_k, z0 + h * mid, n, 0.0)
    verts, faces = [], []
    k = len(r1)
    for ring, zz in ((r1, z1), (r2, z2)):
        verts.extend([(ring[i][0], ring[i][1], zz[i]) for i in range(k)])
    apex = len(verts)
    verts.append((cx, cy, z0 + h))
    for i in range(k):
        j = (i + 1) % k
        faces.append([i, j, k + j, k + i])                  # 底环 → 腰环（外 + 上）
        faces.append([k + i, k + j, apex])                  # 腰环 → 尖（外 + 上）
    return verts, faces


def disc(cx, cy, r, z, th=0.14, n=16):
    """扁平圆盘（塔刹相轮、宝珠用）"""
    v, f = [], []
    for i in range(n):
        a = math.tau * i / n
        v.append((cx + r * math.cos(a), cy + r * math.sin(a), z + th * 0.5))
        v.append((cx + r * math.cos(a), cy + r * math.sin(a), z - th * 0.5))
    for i in range(n):
        j = (i + 1) % n
        f.append([2 * i, 2 * j, 2 * j + 1, 2 * i + 1])      # 侧边 → 外
    f.append(list(range(0, 2 * n, 2)))                      # 顶面 → +Z
    f.append(list(range(2 * n - 1, 0, -2)))                 # 底面 → -Z
    return v, f


def emit_to(name, mat, coll, parts, smooth=False, up=False, recalc=True):
    """把若干 (verts, faces) 合并成一个对象 —— 少建对象，省同步开销。

    ★ 空 `parts` 直接返回 None，**不建空网格**。
      踩过：R3 的 `emit_to('BLD_人文_Auditorium_铜压顶', M_COPPER, C_BLD, _acop)`
      里 `_acop` 从头到尾都是 `[]`（只声明、没 append），于是在**世界原点**
      留下一个零尺寸对象。体检脚本把它当成一栋"楼"，报出
      "距最近道路 73.5 m 无路"的假缺陷 —— 白查一轮。
      （`_diag_plan.py` 现在也有退化 bbox 检查，两道防线。）
    """
    V, F = [], []
    for v, f in parts:
        off = len(V)
        V.extend(v)
        F.extend([[i + off for i in fc] for fc in f])
    if not V or not F:
        print(f'[warn] emit_to({name}) 没有任何几何 —— 跳过，不建空网格')
        return None
    return new_obj(name, V, F, mat, coll, smooth=smooth, up=up, recalc=recalc)


# ==================================================================
# 3. 山河大学图书馆
# ==================================================================
# 中轴尽端、坐北朝南。三层台基 + 三层重檐楼阁 + 脊上光庭。
# 总高（自 Z_TOP 起）：台基 4.20 + 主体 25.20 + 大屋顶 12.90 + 光庭 2.60 ≈ 45.3 m
LX, LY = 0.0, 518.4

# ---- 台基（三层，逐层收进） ----
PODIUM = ((112.0, 80.0, 0.00, 1.50),
          (106.0, 74.0, 1.50, 2.90),
          (100.0, 68.0, 2.90, 4.20))
_pv = []
for _w, _d, _z0, _z1 in PODIUM:
    _pv.append(box(LX, LY, _w, _d, _z1 - _z0, Z_TOP + _z0))
    _pv.append(box(LX, LY, _w + 0.7, _d + 0.7, 0.22, Z_TOP + _z1 - 0.22))   # 压边
emit_to('BLD_人文_Library_Podium', M_STONE, C_BLD, _pv)

# ---- 南向丹陛：20 级踏跺 + 两侧垂带 ----
# 首版用了 7 级 0.60 m 的"大台阶"，读起来像三层平台不像踏步；
# 按 4.20 m 台基 / 20 级 = 0.21 m 踢面、0.55 m 踏面重做。
_dan = []
_STEP_N, _RISE, _TREAD = 20, 0.21, 0.55
for _i in range(_STEP_N):
    _top = 4.20 - _RISE * (_i + 1)
    _yy = LY - 34.0 - _TREAD * (_i + 0.5)
    _ww = 38.0 + 2.0 * (1.0 - _i / float(_STEP_N))
    _dan.append(box(LX, _yy, _ww, _TREAD + 0.02, _top, Z_TOP))
    for _sx in (-1.0, 1.0):
        _dan.append(box(LX + _sx * (_ww * 0.5 + 0.6), _yy, 1.2, _TREAD + 0.02,
                        _top + 0.34, Z_TOP))
emit_to('BLD_人文_Library_Danbi', M_STONE_D, C_BLD, _dan)

# ---- 台基栏板与望柱（东西北三面 + 南面丹陛两侧） ----
_rail = []
for _sx in (-1.0, 1.0):
    _rail.append(box(LX + _sx * 50.0, LY, 0.9, 67.0, 1.05, Z_TOP + 4.20))
_rail.append(box(LX, LY + 33.8, 100.0, 0.9, 1.05, Z_TOP + 4.20))
for _sx in (-1.0, 1.0):
    _rail.append(box(LX + _sx * 34.5, LY - 33.8, 30.0, 0.9, 1.05, Z_TOP + 4.20))
for _k in range(23):                                    # 东西两侧望柱
    _yy = LY - 33.0 + _k * 3.0
    for _sx in (-1.0, 1.0):
        _rail.append(box(LX + _sx * 50.0, _yy, 0.62, 0.62, 1.55, Z_TOP + 4.20))
for _k in range(34):                                    # 北沿望柱
    _rail.append(box(LX - 49.5 + _k * 3.0, LY + 33.8, 0.62, 0.62, 1.55, Z_TOP + 4.20))
for _k in range(10):                                    # 南沿望柱（丹陛两侧）
    _yy = LY - 33.8
    for _sx in (-1.0, 1.0):
        _rail.append(box(LX + _sx * (21.0 + _k * 3.0), _yy, 0.62, 0.62, 1.55, Z_TOP + 4.20))
emit_to('BLD_人文_Library_Rail', M_STONE, C_BLD, _rail)

# ---- 主体：三层 + 檐下阁楼，**层间首尾相接不留缝** ----
BODY = ((86.0, 56.0, 4.20, 13.60),      # 一层 h 9.4
        (72.0, 44.0, 13.60, 22.40),     # 二层 h 8.8
        (56.0, 32.0, 22.40, 29.40))     # 三层 h 7.0
ATTIC = (44.0, 24.0, 29.40, 32.60)      # 大屋顶下的檐下墙，填掉檐下空腔
_bv = []
for _w, _d, _z0, _z1 in BODY:
    _bv.append(box(LX, LY, _w, _d, _z1 - _z0, Z_TOP + _z0))
_bv.append(box(LX, LY, ATTIC[0], ATTIC[1], ATTIC[3] - ATTIC[2], Z_TOP + ATTIC[2]))
emit_to('BLD_人文_Library_Body', M_WALL, C_BLD, _bv)

# ---- 各层勒脚 / 腰线（深色压边，中式"柱额"意向） ----
_tr = []
for _w, _d, _z0, _z1 in BODY:
    _tr.append(box(LX, LY, _w + 1.0, _d + 1.0, 0.90, Z_TOP + _z0))
    _tr.append(box(LX, LY, _w + 0.8, _d + 0.8, 0.50, Z_TOP + _z1 - 0.50))
emit_to('BLD_人文_Library_Trim', M_WALL_D, C_BLD, _tr)

# ---- 一层竖向棂条（朱漆格栅） ----
_lat = []
_w1, _d1 = 86.0, 56.0
for _i in range(-17, 18):
    _x = _i * 2.4
    if abs(_x) > _w1 * 0.5 - 1.2:
        continue
    for _sy in (-1.0, 1.0):
        _lat.append(box(LX + _x, LY + _sy * (_d1 * 0.5 + 0.45), 0.55, 0.50, 8.0, Z_TOP + 5.10))
for _i in range(-11, 12):
    _y = _i * 2.4
    if abs(_y) > _d1 * 0.5 - 1.2:
        continue
    for _sx in (-1.0, 1.0):
        _lat.append(box(LX + _sx * (_w1 * 0.5 + 0.45), LY + _y, 0.50, 0.55, 8.0, Z_TOP + 5.10))
emit_to('BLD_人文_Library_Lattice', M_TIMBER, C_BLD, _lat)

# ---- 二、三层：一圈深色横向窗带 ----
# 竖向棂条只留给一层（人的尺度）；上面两层用一条横向长窗带，
# 不然二三层就是两块空白墙面，整栋楼上重下轻。
# 做法：用一个比墙体大 0.3 m 的实心盒子，只有外圈 0.15 m 露出来成为窗带。
_win = []
for _w, _d, _z0, _z1 in BODY[1:]:
    _hh = _z1 - _z0
    _win.append(box(LX, LY, _w + 1.00, _d + 1.00, _hh * 0.38, Z_TOP + _z0 + _hh * 0.32))
emit_to('BLD_人文_Library_Window', M_WIN, C_BLD, _win)

# ---- 南向通高玻璃门厅（凸出，压在腰檐之下） ----
# 门厅顶必须低于一层腰檐在该处的下皮，否则会从檐上穿出去。
emit_to('BLD_人文_Library_Porch', M_GLASS, C_BLD,
        [box(LX, LY - 30.5, 32.0, 5.0, 7.8, Z_TOP + 4.20)])
_pframe = []
for _sx in (-1.0, 1.0):
    _pframe.append(box(LX + _sx * 16.6, LY - 30.5, 1.0, 5.4, 7.8, Z_TOP + 4.20))
_pframe.append(box(LX, LY - 33.2, 34.6, 1.0, 0.95, Z_TOP + 11.90))
_pframe.append(box(LX, LY - 27.4, 34.6, 1.0, 7.8, Z_TOP + 4.20))
emit_to('BLD_人文_Library_PorchFrame', M_TIMBER, C_BLD, _pframe)

# ---- 北侧后门厅（朝塔一侧，尺度收小） ----
emit_to('BLD_人文_Library_BackPorch', M_GLASS, C_BLD,
        [box(LX, LY + 30.0, 24.0, 4.6, 6.8, Z_TOP + 4.20)])

# ---- 三层腰檐 + 大屋顶 ----
# 内环一律取"该层主体半宽 + 0.10 m 抬高"，让檐口从墙面里长出来；
# 大屋顶内环收成 32×2.8 的窄脊，正脊压在上面正好盖住。
_roofs = []
_roofs.append(roof_ring(LX, LY, 43.0, 28.0, 13.70, 49.5, 34.5, 12.50,
                        th=0.46, n=8, lift=1.05))       # 一层腰檐
_roofs.append(roof_ring(LX, LY, 36.0, 22.0, 22.50, 41.5, 27.5, 21.30,
                        th=0.42, n=8, lift=0.90))       # 二层腰檐
_roofs.append(roof_ring(LX, LY, 28.0, 16.0, 29.50, 33.0, 21.0, 28.30,
                        th=0.42, n=8, lift=0.85))       # 三层腰檐
# 大屋顶：起坡必须够陡。首版内环只比外环高 4.8 m（约 22°），在仰视和
# 中轴视角里整块屋顶被压成一块平板，"大屋顶"完全立不起来。
# 抬到 7.2 m（约 36°），屋顶才成为整栋楼的主导体量。
# 内环给 28×1.2 的**窄脊**：首版给的是 32×2.8 的平顶，从檐下仰视时
# 那块平顶连同正脊会读成"屋顶上摆了一只托盘"。
_roofs.append(roof_ring(LX, LY, 14.0, 0.6, 40.60, 26.0, 14.0, 33.40,
                        th=0.50, n=8, lift=1.25))       # 大屋顶
emit_to('BLD_人文_Library_Roof', M_ROOF, C_BLD, _roofs, recalc=False)

# ---- 三层腰檐内的平座栏杆（三级屋顶之间的"回廊"，最上一圈） ----
_ping = []
for _s in range(4):
    _sx = (1.0, -1.0, 0.0, 0.0)[_s]
    _sy = (0.0, 0.0, 1.0, -1.0)[_s]
    _ping.append(box(LX + _sx * 27.4, LY + _sy * 15.4,
                     0.22 if _sx else 54.8, 0.22 if _sy else 30.8,
                     0.95, Z_TOP + 29.50))
emit_to('BLD_人文_Library_PingZuo', M_TIMBER, C_BLD, _ping)

# ---- 正脊 + 鸱吻 ----
# 正脊只做 1.6 m 宽，正好盖住 28×1.2 的脊顶。首版做到 4.0~5.6 m 宽，
# 从檐下仰视时正脊的底面会读成"屋顶上摆了一块横板"。
# 正脊做成**左右两条窄边**（各 0.20 m），中间 1.20 m 让给玻璃采光带 ——
# 这样脊线是连续的，玻璃是"嵌进脊里"的，而不是"脊上又叠了一个盒子"。
_rg = [box(LX, LY + _sy, 28.4, 0.20, 1.20, Z_TOP + 40.60) for _sy in (-0.70, 0.70)]
for _sx in (-1.0, 1.0):
    _rg.append(box(LX + _sx * 13.4, LY, 3.0, 2.60, 2.00, Z_TOP + 40.60))
emit_to('BLD_人文_Library_Ridge', M_RIDGE, C_BLD, _rg)

# ---- 脊上光庭：嵌在正脊中间的一条玻璃采光带（中庭的采光顶） ----
# 与正脊**同高同底**（40.60~41.80），从檐下仰视时脊底是一整条 1.6 m 的连续面，
# 不再有"独立盒子"的悬浮感。
# 首版做成 26×5×2.6 的方盒压在 5.6 m 宽的正脊上，中轴看过去就是
# "屋顶上摆了个盘子"，整个顶部轮廓全散掉。
emit_to('BLD_人文_Library_Lantern', M_GLASS, C_BLD,
        [box(LX, LY, 24.0, 1.20, 1.20, Z_TOP + 40.60)])
# 玻璃两端各封一段（否则顺着脊缝能看到中庭内部）
emit_to('BLD_人文_Library_LanternFrame', M_TIMBER_D, C_BLD,
        [box(LX + _e * 12.3, LY, 0.60, 1.20, 1.20, Z_TOP + 40.60) for _e in (-1.0, 1.0)])

LIB_RIDGE = Z_TOP + 41.80
LIB_TOP = Z_TOP + 41.80


# ==================================================================
# 4. 镇山塔（七级楼阁式）
# ==================================================================
# 中轴最北端、半岛尽头的镇山。塔高必须明显压过图书馆，
# 否则从中轴看过去塔会被图书馆的屋顶吃掉大半（首版就是这个问题）。
TX, TY = 0.0, 648.0

# ---- 月台 + 须弥座（三级收进） ----
emit_to('BLD_人文_Zhenshan_Terrace', M_STONE, C_BLD,
        [box(TX, TY, 58.0, 58.0, 1.10, Z_TOP),
         box(TX, TY, 60.0, 60.0, 0.22, Z_TOP)])

_BASE = ((44.0, 1.50, 1.10), (40.0, 1.70, 2.60), (36.0, 1.50, 4.30))
_bp = []
for _w, _h, _z0 in _BASE:
    _bp.append(box(TX, TY, _w, _w, _h, Z_TOP + _z0))
    _bp.append(box(TX, TY, _w + 1.0, _w + 1.0, 0.26, Z_TOP + _z0 + _h - 0.26))
emit_to('BLD_人文_Zhenshan_Base', M_STONE, C_BLD, _bp)

# ---- 塔身七层 ----
LEVELS = ((30.0, 10.5), (27.4, 9.6), (24.8, 8.8), (22.4, 8.0),
          (20.0, 7.2), (17.8, 6.4), (15.6, 5.6))
_shaft, _eaves, _trim, _door = [], [], [], []
_z = 5.80
for _lv, (_w, _h) in enumerate(LEVELS):
    if _lv > 0:
        # 平座：每层基部的挑出平台 + 朱漆栏杆，让"层"读得出来
        _rr = _w * 0.5 + 0.62
        _trim.append(box(TX, TY, _w + 1.6, _w + 1.6, 0.50, Z_TOP + _z))
        _trim.append(box(TX, TY + _rr, _w + 1.4, 0.24, 0.80, Z_TOP + _z + 0.50))
        _trim.append(box(TX, TY - _rr, _w + 1.4, 0.24, 0.80, Z_TOP + _z + 0.50))
        _trim.append(box(TX + _rr, TY, 0.24, _w + 1.4, 0.80, Z_TOP + _z + 0.50))
        _trim.append(box(TX - _rr, TY, 0.24, _w + 1.4, 0.80, Z_TOP + _z + 0.50))
    _shaft.append(box(TX, TY, _w, _w, _h, Z_TOP + _z))
    # 四角立柱（朱漆），做出"木构楼阁"而不是"一根方柱"的观感
    for _sx in (-1.0, 1.0):
        for _sy in (-1.0, 1.0):
            _trim.append(box(TX + _sx * (_w * 0.5 - 0.06), TY + _sy * (_w * 0.5 - 0.06),
                             0.84, 0.84, _h, Z_TOP + _z))
    # 每层四面各开一门（深色玻璃）。没有门洞的话，塔身就是一叠白盒子，
    # 完全读不出"楼阁式塔"。门宽取 0.30w、高 0.40h —— 首版用了
    # 0.44w×0.62h，门洞大得把整面墙吃掉，塔读成"缺了几块"。
    for _sx, _sy in ((1.0, 0.0), (-1.0, 0.0), (0.0, 1.0), (0.0, -1.0)):
        _door.append(box(TX + _sx * (_w * 0.5 + 0.02), TY + _sy * (_w * 0.5 + 0.02),
                         0.20 if _sx else _w * 0.30,
                         0.20 if _sy else _w * 0.30,
                         _h * 0.40, Z_TOP + _z + _h * 0.26))
    # 腰檐：出檐 3.2 m，四角起翘。板厚 0.52（首版 0.42 太薄，
    # 远看只剩一条线，起翘也读不出来）
    _eaves.append(roof_ring(TX, TY, _w * 0.5, _w * 0.5, _z + _h,
                            _w * 0.5 + 3.2, _w * 0.5 + 3.2, _z + _h - 1.15,
                            th=0.52, n=8, lift=1.30))
    _z += _h
emit_to('BLD_人文_Zhenshan_Shaft', M_TOWER_WALL, C_BLD, _shaft)
emit_to('BLD_人文_Zhenshan_Door', M_WIN, C_BLD, _door)
emit_to('BLD_人文_Zhenshan_Trim', M_TIMBER, C_BLD, _trim)
emit_to('BLD_人文_Zhenshan_Eaves', M_ROOF, C_BLD, _eaves, recalc=False)

# ---- 塔顶：攒尖（底环与第七层腰檐外沿重合，屋面接得上去） ----
_CAP_H = 11.0
_zs0 = _z - 1.15 + _CAP_H          # 攒尖尖顶相对标高
emit_to('BLD_人文_Zhenshan_Cap', M_ROOF, C_BLD,
        [pyramid_roof(TX, TY, 11.0, 11.0, _z - 1.15, _CAP_H,
                      n=8, mid=0.60, mid_k=0.50, lift=1.00)],
        recalc=False)

# ---- 塔刹：刹杆 + 六层相轮 + 双宝珠 ----
# 刹杆必须从攒尖尖顶下方 1 m 处起步，一直穿到宝珠里 ——
# 首版刹杆从尖顶下方 0.6 m 起、只到 5.8 m，相轮与尖顶之间留出一道缝，
# 远看塔刹是"飘"在塔尖上的。
emit_to('BLD_人文_Zhenshan_FinialRod', M_BRONZE, C_BLD,
        [box(TX, TY, 0.95, 0.95, 7.60, Z_TOP + _zs0 - 1.00)])
_rings = []
for _i in range(6):
    _rings.append(disc(TX, TY, 3.30 - 0.36 * _i,
                       Z_TOP + _zs0 + 0.55 + _i * 1.00, th=0.32, n=16))
emit_to('BLD_人文_Zhenshan_FinialRings', M_BRONZE, C_BLD, _rings)
emit_to('BLD_人文_Zhenshan_FinialBall', M_BRONZE, C_BLD,
        [disc(TX, TY, 1.55, Z_TOP + _zs0 + 7.00, th=1.50, n=16),
         disc(TX, TY, 0.85, Z_TOP + _zs0 + 8.30, th=1.10, n=16)])

TOWER_BODY = _z - Z_TOP
TOWER_TOP = _zs0 + 8.85
print(f'[stage1] 镇山塔 塔身 {TOWER_BODY:.1f} m / 含刹总高 {TOWER_TOP:.1f} m')
print(f'[stage1] 图书馆 正脊 {LIB_RIDGE - Z_TOP:.2f} m / 光庭顶 {LIB_TOP - Z_TOP:.2f} m')


# ==================================================================
# 5. 塔院 + 中轴塔前段 + 前庭水景
# ==================================================================
# ---- 塔院：方形铺装 + 三面矮墙（南向留口） ----
emit_to('SITE_塔院', M_PAVE, C_PAVE,
        [round_rect(TX - 62.0, TY - 62.0, TX + 62.0, TY + 62.0, 10.0, Z_TOP + 0.06)],
        up=True)

_wall = []
for _i in range(-15, 16):
    _o = _i * 4.0
    _wall.append(box(TX + _o, TY + 62.5, 3.0, 0.7, 1.15, Z_TOP + 0.06))
    if abs(_o) > 22.0:
        _wall.append(box(TX + _o, TY - 62.5, 3.0, 0.7, 1.15, Z_TOP + 0.06))
    _wall.append(box(TX + 62.5, TY + _o, 0.7, 3.0, 1.15, Z_TOP + 0.06))
    _wall.append(box(TX - 62.5, TY + _o, 0.7, 3.0, 1.15, Z_TOP + 0.06))
emit_to('SITE_塔院矮墙', M_STONE, C_SITE, _wall)

# ---- 铺装分格（回字纹 + 中轴分格线） ----
# 124 m 见方的塔院和 200 m 长的中轴如果是一整块素色铺装，
# 在实景里会读成"没做完的水泥地"，而且完全没有尺度感。
# 用 1.2 m 宽的深色石带压出分格，代价极小，尺度立刻回来。
_band = []
for _r in (34.0, 48.0):
    for _s in range(4):
        _sx = (1.0, -1.0, 0.0, 0.0)[_s]
        _sy = (0.0, 0.0, 1.0, -1.0)[_s]
        _band.append(box(TX + _sx * _r, TY + _sy * _r,
                         1.2 if _sx else 2.0 * _r, 1.2 if _sy else 2.0 * _r,
                         0.05, Z_TOP + 0.075))
emit_to('SITE_塔院分格', M_STONE_D, C_SITE, _band)

_aband = []
for _sx in (-1.0, 1.0):
    _aband.append(box(TX + _sx * 23.0, (LY + 41.0 + TY - 62.0) * 0.5,
                      1.2, (TY - 62.0) - (LY + 41.0), 0.05, Z_TOP + 0.07))
    _aband.append(box(LX + _sx * 23.0, LY - 62.0, 1.2, 56.0, 0.05, Z_TOP + 0.07))
emit_to('SITE_中轴分格', M_STONE_D, C_SITE, _aband)

# ---- 塔院石灯：一圈八座，给 124 m 见方的院子一个尺度参照 ----
# 首版塔院是一整块空铺装，塔显得像摆在一块空地上，读不出院子有多大。
_lt = []
for _k in range(8):
    _a = math.tau * _k / 8.0
    _lx = TX + 44.0 * math.cos(_a)
    _ly = TY + 44.0 * math.sin(_a)
    _lt.append(box(_lx, _ly, 2.00, 2.00, 0.36, Z_TOP + 0.06))     # 基座
    _lt.append(box(_lx, _ly, 0.80, 0.80, 1.70, Z_TOP + 0.42))     # 柱身
    _lt.append(box(_lx, _ly, 1.60, 1.60, 0.22, Z_TOP + 2.12))     # 中台
    _lt.append(box(_lx, _ly, 1.30, 1.30, 0.95, Z_TOP + 2.34))     # 火袋
    _lt.append(box(_lx, _ly, 2.30, 2.30, 0.32, Z_TOP + 3.29))     # 笠
    _lt.append(box(_lx, _ly, 0.55, 0.55, 0.50, Z_TOP + 3.61))     # 宝珠
emit_to('SITE_塔院石灯', M_STONE_D, C_SITE, _lt)

# ---- 中轴：图书馆北侧 → 塔院（阶段 0 的中轴大道只到图书馆南侧） ----
# ★ 南端由 `LY + 36.0`（= 554.4）退到 `LY + 41.0`（= 559.4）。
#   图书馆台基一层是 112×80 ⇒ 北面在 `LY + 40.0` = 558.4，压边再出 0.35 m。
#   原来从 554.4 起，等于**南端 4 m 埋在台基里**（体检报 231.8 m²）。
#   退到 559.4 之后正好从台基北面起铺，一厘米不重叠。
emit_to('SITE_中轴_塔前段', M_PAVE_W, C_PAVE,
        [round_rect(TX - 26.0, LY + 41.0, TX + 26.0, TY - 62.0, 6.0, Z_TOP + 0.055)],
        up=True)

# ---- 前庭镜面水池（丹陛两侧对称，倒影把图书馆"抬"起来） ----
_ponds = []
for _sx in (-1.0, 1.0):
    _ponds.append(round_rect(LX + _sx * 46.0 - 22.0, LY - 84.0,
                             LX + _sx * 46.0 + 22.0, LY - 58.0, 8.0, Z_TOP + 0.10))
emit_to('SITE_前庭水池', M_WATER, C_WATER, _ponds, up=True)
emit_to('SITE_前庭水池沿', M_STONE_D, C_SITE,
        [box(LX + _sx * 46.0, LY - 71.0, 46.4, 28.4, 0.30, Z_TOP - 0.16)
         for _sx in (-1.0, 1.0)])

# ---- 中轴灯柱（前庭两侧，六对） ----
_lamps = []
for _i in range(6):
    _yy = LY - 100.0 + _i * 12.0
    for _sx in (-1.0, 1.0):
        _lamps.append(box(LX + _sx * 74.0, _yy, 1.60, 1.60, 0.34, Z_TOP + 0.06))
        _lamps.append(box(LX + _sx * 74.0, _yy, 0.55, 0.55, 4.30, Z_TOP + 0.40))
        _lamps.append(box(LX + _sx * 74.0, _yy, 1.45, 1.45, 0.80, Z_TOP + 4.70))
emit_to('SITE_前庭灯柱', M_TIMBER_D, C_SITE, _lamps)

print('[stage1] 图书馆 + 镇山塔 + 塔院 完成')
