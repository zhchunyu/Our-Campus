# -*- coding: utf-8 -*-
"""
build_campus_r2.py —— 山河大学 R2：图书馆改造 + 漂浮讲堂
================================================================

共享同一个 globals（由 run_campus.py 的 build_extra 串联），可直接复用
场地/阶段脚本里的 W() / box() / cap() / band() / round_rect() / emit_to() /
bar3d() / side_frames() / fin_box() / frustum() / scale_poly() 等。

------------------------------------------------------------------
一、图书馆改造 —— 保骨架、换语言
------------------------------------------------------------------
旧图书馆是「三层台基 + 三层重檐楼阁 + 大屋顶 + 正脊鸱吻 + 平座栏杆」。
换材料救不了它：**层层出檐 + 逐层收分 + 塔刹不破**，这套构图法则本身就是塔
（R0 前 4 版已经吃过一次这个亏）。

R2 换的是**读法**，不是材料：

  旧读法：三层重檐楼阁（收分 = 塔）
  新读法：**地形化的知识台地**（退台 = 台地）

四件事：

  1. **全楼取消檐口** —— 一根出挑的屋檐都不留。全楼唯一的水平线是每层顶部的
     「楼板边带」：0.90 m 板边 + 1.25 m 斜向编织格构带（"斗拱 → 编织格构"的落点）。
  2. **每层退台变成上人花园** —— 一层屋顶（86×56）与二层屋顶（72×44）各露出一圈
     6~8 m 宽的环形平台，铺装 + 种植土 + 灌木 + 栏板 + 竹木扶手。
     于是"收分"读成"台地"，而不是"密檐"。
  3. **顶部一圈 3~5.8 m 高的玻璃光庭环 + 一片变曲率薄壳** —— 壳**不外挑**，
     外缘正好落在光庭环顶上。为什么刻意不外挑：壳的起拱方向是"向内向上"，
     只要壳外挑，它的外缘就一定低于内侧，**从外面水平看会把光庭环整个挡掉**
     （第 1 版就是这么废的）。"光庭"这条（苏博唯一保留的一条）被放大成
     整栋楼的采光方式：三层通高的中庭光线从顶上灌下来。
  4. **光庭环与薄壳一起做"南低北高"的倾斜**（南 3.0 m → 北 5.8 m）。
     这是破"对称金字塔"的关键一手 —— 收分的对称感一旦被打破，
     就再也不会读成塔。

为什么这次不会又读成塔：
  * 塔靠"檐口"和"塔刹"读出来。这里**檐口 0、塔刹 0**，顶部是一片压扁的壳。
  * 塔的收分是"每层都比下层小且都出檐"。这里是**每层退台都是可上人的花园**，
    退台之间有栏板与扶手 —— 是"台地"，不是"檐"。
  * 塔是轴对称的。这里光庭环 + 壳**南低北高**，不是。

------------------------------------------------------------------
二、漂浮讲堂 —— 中轴序列的收头
------------------------------------------------------------------
半岛尖端岸线在 Y ≈ 843.5 以北就是水面。讲堂中心定在 (0, 842)，
楼板 Y 820~864 —— **北端 20.5 m 悬在水上（占进深 47%）**，正好"半悬于水"。

  楼板 64×44，Z 6.00~6.90，**底面做镜面不锈钢**
  玻璃幕 56×38（内退 4 m），Z 6.90~15.40（8.5 m 通高）
  薄壳 70×47.5，外缘 Z 15.40 → 中心 Z 20.83，厚 0.40（外挑 7 m）
  细柱 20 根 0.35 方钢，从楼板边缘直上壳底
  桥：观景台半圆平台（Z 3.35）→ 讲堂楼板（Z 6.00）

**镜面为什么放在这里**：R1 的结论是"竖直镜面对天空是隐形的"。
而讲堂的镜面是**朝下的近水平面**，人站在岸上低处看它，它反射的是脚下那片
有波纹、有倒影的水面 —— **有内容可映，所以它成立**。

------------------------------------------------------------------
三、顺带补上中轴的两处断点
------------------------------------------------------------------
  * 中轴末段铺装（Y 710 → 778）：塔院北沿到观景台之间原本是草地，轴断在这里。
  * 连接桥（Y 808 → 820.5）：观景台半圆平台 → 讲堂楼板。
"""

import math

from mathutils import Vector

GZ = Z_TOP
AX = 0.0
LY = N_LIB                       # 518.4
FLY = 842.0                      # 漂浮讲堂中心 Y
FL_SHORE = 843.5                 # 半岛尖端岸线（|X| ≤ 34 范围内基本是平的）


# ==================================================================
# 0. 拆除旧语言构件
# ==================================================================
# 图书馆保留：Podium（三层台基）/ Danbi（南向丹陛）—— 骨架与体量关系有效。
# 其余 13 个对象全部是旧语言（大屋顶 / 正脊鸱吻 / 平座 / 朱漆棂条 /
# 中式勒脚腰线 / 脊上光庭 / 望柱栏板），一个都不留。
_DROP = ('BLD_人文_Library_Body', 'BLD_人文_Library_Trim',
         'BLD_人文_Library_Lattice', 'BLD_人文_Library_Window',
         'BLD_人文_Library_Porch', 'BLD_人文_Library_PorchFrame',
         'BLD_人文_Library_BackPorch', 'BLD_人文_Library_Roof',
         'BLD_人文_Library_PingZuo', 'BLD_人文_Library_Ridge',
         'BLD_人文_Library_Lantern', 'BLD_人文_Library_LanternFrame',
         'BLD_人文_Library_Rail')
_n = 0
for _o in list(bpy.data.objects):
    for _p in _DROP:
        if _o.name == _p or _o.name.startswith(_p + '.'):
            bpy.data.objects.remove(_o, do_unlink=True)
            _n += 1
            break
print(f'[R2] 已移除旧语言构件 {_n} 个')


# ==================================================================
# 1. 材质
# ==================================================================
# ★ 只有**第一次定义**的材质才写色值；同名材质在后面的阶段再调一次，
#   会被 make_mat 的按名缓存静默忽略（R1 连踩 3 轮的坑）。
#   M_CONC / M_SLAB / M_STEEL / M_GLASSC / M_BAMBOO / M_COPPER / M_ZINC /
#   M_MIRROR / M_GLASST / M_PAVE / M_SOIL / M_LEAF 都已在 R0 / R1 里建过。
M_WOOD = make_mat('M_胶合木', (0.330, 0.215, 0.118), rough=0.68,
                  noise_scale=2.0, col_b=(0.238, 0.152, 0.082))


# ==================================================================
# 2. 构件工具
# ==================================================================
# ★ round_rect() 返回的是 `cap()` 的结果 —— **3D 顶点 (x, y, z)**，不是 2D 轮廓。
#   本文件里所有"轮廓"都是 2D（要解包 x, y），所以拿到手先降维。
def prof2d(rect_geo):
    return [(p[0], p[1]) for p in rect_geo[0]]


def shell_solid(prof, rings, th, zf):
    """**变曲率连续薄壳**（闭合流形）。

    这是 V2 §2.1「曲面替代坡屋顶」的正解：中式屋面本来就是曲面（举折），
    只是被简化成了直线坡。所以这里不是"做个弧形屋顶"，而是让**曲率沿半径变化**，
    并且允许壳面整体倾斜（`zf` 可以同时依赖 s 与平面坐标）。

    prof  —— 基准平面轮廓 [(x, y), ...]（不重复首尾）
    rings —— [(scale, dx, dy), ...]，由外到内；scale 相对 prof 形心缩放
    th    —— 壳厚
    zf    —— zf(s, x, y) → 壳**下皮**标高

    返回闭合流形（顶面 + 底面 + 外缘 + 内缘），交给 recalc 定法线最稳 ——
    **开放曲面的法线是随机的**，手推必错。
    """
    px = sum(p[0] for p in prof) / float(len(prof))
    py = sum(p[1] for p in prof) / float(len(prof))
    k, nr = len(prof), len(rings)

    def pt(s, dx, dy, i):
        x = px + (prof[i][0] - px) * s + dx
        y = py + (prof[i][1] - py) * s + dy
        return x, y, zf(s, x, y)

    vs = []
    for s, dx, dy in rings:                          # 底面
        for i in range(k):
            vs.append(pt(s, dx, dy, i))
    off = k * nr
    for s, dx, dy in rings:                          # 顶面
        for i in range(k):
            x, y, z = pt(s, dx, dy, i)
            vs.append((x, y, z + th))
    fs = []
    for r in range(nr - 1):
        a0, b0 = r * k, (r + 1) * k
        a1, b1 = off + r * k, off + (r + 1) * k
        for i in range(k):
            j = (i + 1) % k
            fs.append([a0 + i, a0 + j, b0 + j, b0 + i])
            fs.append([a1 + i, a1 + j, b1 + j, b1 + i])
    for i in range(k):                               # 外缘
        j = (i + 1) % k
        fs.append([i, j, off + j, off + i])
    r = nr - 1                                       # 内缘
    a0, a1 = r * k, off + r * k
    for i in range(k):
        j = (i + 1) % k
        fs.append([a0 + j, a0 + i, a1 + i, a1 + j])
    return vs, fs


def shell_ribs(prof, rings, zf, t=0.20, drop=0.22, n_ring=16, n_rad=14):
    """薄壳底面的**环向 + 径向格构肋网**（"暴露结构即装饰"）。

    壳底若是一整片光面，从下面看就是"一块板"（R0 的"一摞灰纸片"教训）。
    加一层肋网，底面立刻读成结构。
    """
    px = sum(p[0] for p in prof) / float(len(prof))
    py = sum(p[1] for p in prof) / float(len(prof))
    k = len(prof)

    def P(s, dx, dy, i):
        x = px + (prof[i][0] - px) * s + dx
        y = py + (prof[i][1] - py) * s + dy
        return (x, y, zf(s, x, y) - drop)

    bars = []
    for s, dx, dy in rings[1:]:
        step = max(1, k // n_ring)
        for i in range(0, k, step):
            j = (i + step) % k
            bars.append(bar3d(P(s, dx, dy, i), P(s, dx, dy, j), t))
    step = max(1, k // n_rad)
    for r in range(len(rings) - 1):
        s0, dx0, dy0 = rings[r]
        s1, dx1, dy1 = rings[r + 1]
        for i in range(0, k, step):
            bars.append(bar3d(P(s0, dx0, dy0, i), P(s1, dx1, dy1, i), t))
    return bars


def ring_wall(pa, za, pb, zb, sc=0.995):
    """**闭合薄壁环**（光庭环 / 天窗带）。

    不能用 `band()`：band 生成的是**开放曲面**，法线由顶点绕向决定，
    绕反了整圈会消失（R1 的斜壁就是靠"东西两侧顶点顺序必须相反"手工修的）。
    这里直接做成闭合流形（外表面 + 内表面 + 上下缘），交给 recalc 定法线。

    za / zb —— 下 / 上缘标高，**可以是标量，也可以是逐点列表**（做倾斜环用）。
    sc      —— 内轮廓缩放比（相对外轮廓形心），控制壁厚。
    """
    k = len(pa)
    zl = za if isinstance(za, (list, tuple)) else [za] * k
    zh = zb if isinstance(zb, (list, tuple)) else [zb] * k
    px = sum(p[0] for p in pa) / float(k)
    py = sum(p[1] for p in pa) / float(k)
    pi = [(px + (x - px) * sc, py + (y - py) * sc) for x, y in pa]
    vs = ([(pa[i][0], pa[i][1], zl[i]) for i in range(k)]
          + [(pi[i][0], pi[i][1], zl[i]) for i in range(k)]
          + [(pa[i][0], pa[i][1], zh[i]) for i in range(k)]
          + [(pi[i][0], pi[i][1], zh[i]) for i in range(k)])
    O0, I0, O1, I1 = 0, k, 2 * k, 3 * k
    fs = []
    for i in range(k):
        j = (i + 1) % k
        fs.append([O0 + i, O0 + j, O1 + j, O1 + i])      # 外表面
        fs.append([I0 + j, I0 + i, I1 + i, I1 + j])      # 内表面
        fs.append([O0 + j, O0 + i, I0 + i, I0 + j])      # 下缘
        fs.append([O1 + i, O1 + j, I1 + j, I1 + i])      # 上缘
    return vs, fs


def truss_band(cx, cy, hx, hy, z0, z1, bar=0.20, diag=0.13, seg=1.90, out=0.09):
    """**斜向编织格构带**（"斗拱 → 编织格构"的正解）。

    R0 第 5 版把它罩在立面外，结果是一只铁丝笼。斗拱本质是**层层出挑的
    受力构件**，所以它该长在**楼板边**上 —— 上下弦 + 斜腹杆，齐平楼板边缘。
    """
    g = []
    for _ax, _ay, _bx, _by, _L, _nx, _ny in side_frames(cx, cy, hx + out, hy + out, 0.0):
        g.append(bar3d((_ax, _ay, z0), (_bx, _by, z0), bar))
        g.append(bar3d((_ax, _ay, z1), (_bx, _by, z1), bar))
        m = max(2, int(round(_L / seg)))
        for i in range(m):
            t0, t1 = i / float(m), (i + 1) / float(m)
            p0 = (_ax + (_bx - _ax) * t0, _ay + (_by - _ay) * t0)
            p1 = (_ax + (_bx - _ax) * t1, _ay + (_by - _ay) * t1)
            if i % 2 == 0:
                g.append(bar3d((p0[0], p0[1], z0), (p1[0], p1[1], z1), diag))
            else:
                g.append(bar3d((p0[0], p0[1], z1), (p1[0], p1[1], z0), diag))
    return g


def fin_facade(cx, cy, hx, hy, z0, z1, gap=0.55, fin_d=0.40, fin_t=0.12, pitch=1.40):
    """一圈「玻璃幕（内退 gap）+ 竹木竖向遮阳翼 + 铜压顶」—— 每层立面是一个完整的盒。

    竖翼**必须按外法线定向**（`fin_box`）：只写一种朝向时 ±Y 面正确，
    ±X 面就变成平贴墙的宽板（R0 第 6 版的 bug）。

    ★ `side_frames` 给的是边的**两个端点** (ax,ay)/(bx,by)，不是中点。
      玻璃盒的中心必须取 `(起点 + 终点) * 0.5`；直接拿 `_gy` 当中点会让
      ±X 面的玻璃整体错位 ±hy（第 4 版 bug：讲堂西侧玻璃幕多伸出 19 m，
      悬在水面上空读成一块"来历不明的灰板"；图书馆每层错位 28 m）。
    """
    gl, fn, cp = [], [], []
    h = z1 - z0
    for _ax, _ay, _bx, _by, _L, _nx, _ny in side_frames(cx, cy, hx, hy, 0.0):
        _gx, _gy = _ax - _nx * gap, _ay - _ny * gap
        _ex, _ey = _bx - _nx * gap, _by - _ny * gap
        _mx, _my = (_gx + _ex) * 0.5, (_gy + _ey) * 0.5
        if abs(_nx) > abs(_ny):
            gl.append(box(_mx, _my, 0.14, abs(_ey - _gy), h, z0))
        else:
            gl.append(box(_mx, _my, abs(_ex - _gx), 0.14, h, z0))
        m = max(2, int(round(_L / pitch)))
        for i in range(m):
            t = (i + 0.5) / float(m)
            _px = _ax + (_bx - _ax) * t - _nx * 0.24
            _py = _ay + (_by - _ay) * t - _ny * 0.24
            fn.append(fin_box(_px, _py, _nx, _ny, fin_d, fin_t, h, z0))
        # 压顶：把本层立面收成一个完整的盒（否则竖翼顶端悬空，像断头筷子）
        cp.append(fin_box((_gx + _ex) * 0.5 - _nx * 0.24,
                          (_gy + _ey) * 0.5 - _ny * 0.24,
                          _nx, _ny, fin_d + 0.06, 0.18, 0.18, z1 + 0.06))
    return gl, fn, cp


def para_ring(cx, cy, hx, hy, z, h=1.05, th=0.36, skip_south=0.0):
    """**清水混凝土连续栏板** —— 取代旧方案的望柱 + 栏板（望柱是礼制语言）。"""
    g = [box(cx + hx, cy, th, 2 * hy, h, z), box(cx - hx, cy, th, 2 * hy, h, z),
         box(cx, cy + hy, 2 * hx, th, h, z)]
    if skip_south > 0.0:
        w = hx - skip_south
        if w > 0.2:
            g.append(box(cx + skip_south + w * 0.5, cy - hy, w, th, h, z))
            g.append(box(cx - skip_south - w * 0.5, cy - hy, w, th, h, z))
    else:
        g.append(box(cx, cy - hy, 2 * hx, th, h, z))
    return g


def hand_rail(cx, cy, hx, hy, z, th=0.14, h=0.10, skip_south=0.0):
    """竹木扶手 —— 压在栏板顶上，给清水混凝土一条暖色收边。"""
    g = [box(cx + hx, cy, th, 2 * hy + th, h, z),
         box(cx - hx, cy, th, 2 * hy + th, h, z),
         box(cx, cy + hy, 2 * hx + th, th, h, z)]
    if skip_south > 0.0:
        w = hx - skip_south
        if w > 0.2:
            g.append(box(cx + skip_south + w * 0.5, cy - hy, w, th, h, z))
            g.append(box(cx - skip_south - w * 0.5, cy - hy, w, th, h, z))
    else:
        g.append(box(cx, cy - hy, 2 * hx + th, th, h, z))
    return g


def terrace_ring(cx, cy, ox, oy, ix, iy, z, h):
    """退台花园：外圈 ox×oy、内圈 ix×iy 的环形平台（4 块矩形拼成）。"""
    d = (oy - iy) * 0.5
    w = (ox - ix) * 0.5
    return [box(cx, cy + iy + d, 2 * ox, 2 * d, h, z),
            box(cx, cy - iy - d, 2 * ox, 2 * d, h, z),
            box(cx + ix + w, cy, 2 * w, 2 * iy, h, z),
            box(cx - ix - w, cy, 2 * w, 2 * iy, h, z)]


def shrub(cx, cy, z, h=2.20, r=1.15):
    """灌木球 —— 退台花园的尺度参照。**底宽顶窄**（frustum 的 hw0 是底面）。"""
    return frustum(cx, cy, r, r, r * 0.42, r * 0.42, z, z + h, n=7, caps=True)


def rim_edge(prof, zf, s, th, r=0.15):
    """沿薄壳外缘一圈**铜收边** —— 给壳一条锐利的水平线。

    R0 的基座顶板边缘用了同一手（"取代上翘檐口，让平台边缘有一条锐利水平线"）。
    这里跟随壳的倾斜标高逐点生成，所以南低北高时收边也是斜的。

    ★ 轮廓必须**按 `s` 绕 `prof` 形心缩放**，与 `shell_solid` / `shell_ridges`
      同一约定（两者的缩放中心都是形心，所以任何 R2 生成的 prof 都能直接喂进来）：
        · `s = 1.0`  → 外缘收边（檐口铜线）
        · `s = s_min`→ 封顶铜压环
      **旧版不做缩放**：传 `s_min` 时标高按 `s_min` 算、平面却用全尺寸轮廓 ——
      等于在**壳顶标高**上画了一个**檐口大小**的环，成品是一个悬在屋顶上方
      十几米的铜"呼啦圈"（R5 第 6 版实拍可见，见 skill 铁律"细杆件"条）。
    """
    px = sum(p[0] for p in prof) / float(len(prof))
    py = sum(p[1] for p in prof) / float(len(prof))
    g = []
    n = len(prof)
    for i in range(n):
        j = (i + 1) % n
        x0, y0 = px + (prof[i][0] - px) * s, py + (prof[i][1] - py) * s
        x1, y1 = px + (prof[j][0] - px) * s, py + (prof[j][1] - py) * s
        g.append(bar3d((x0, y0, zf(s, x0, y0) + th * 0.5),
                       (x1, y1, zf(s, x1, y1) + th * 0.5),
                       r))
    return g


# ==================================================================
# 3. 图书馆 —— 地形化的知识台地
# ==================================================================
# 标高**全部是绝对 Z**（自世界原点起）：台基顶 7.20 / 三层顶 16.60 / 25.40 / 32.40
# ★ 下面三个是**半宽 / 半深**（stage1 里 BODY 的 86.0/56.0 是**全宽**，
#   直接拿来当半宽用会把楼建成 172×112 —— 4 倍面积，第 1 版踩过）。
_SLAB_T = 0.90                   # 楼板厚
_TRH = 1.25                      # 编织格构带高
POD_T = GZ + 4.20                # 台基顶 7.20
_F1 = (43.0, 28.0, 16.60)        # 半宽X, 半深Y, 层顶 Z   → 86 × 56
_F2 = (36.0, 22.0, 25.40)        #                      → 72 × 44
_F3 = (28.0, 16.0, 32.40)        #                      → 56 × 32
_SKIP = 19.5                     # 南面给丹陛留的口（半宽）

_slab, _truss, _glass, _fin, _cop = [], [], [], [], []
_pave, _soil, _leaf, _par, _hnd = [], [], [], [], []

for _hx, _hy, _zt in (_F1, _F2, _F3):
    # ---- 楼板（本层顶面；退台花园的台面就是它）----
    _slab.append(box(AX, LY, 2 * _hx, 2 * _hy, _SLAB_T, _zt - _SLAB_T))
    # ---- 编织格构带：紧贴楼板下皮，齐平楼板边缘 ----
    _truss += truss_band(AX, LY, _hx, _hy, _zt - _SLAB_T - _TRH, _zt - _SLAB_T - 0.02)

# ---- 各层立面（玻璃 + 竹木竖翼 + 铜压顶）----
# 一层从台基顶（7.20）起；二、三层从下一层楼板顶起。
for _hx, _hy, _za, _zb in ((_F1[0], _F1[1], POD_T, _F1[2] - _SLAB_T - _TRH),
                           (_F2[0], _F2[1], _F1[2], _F2[2] - _SLAB_T - _TRH),
                           (_F3[0], _F3[1], _F2[2], _F3[2] - _SLAB_T - _TRH)):
    _g, _f, _c = fin_facade(AX, LY, _hx, _hy, _za, _zb)
    _glass += _g
    _fin += _f
    _cop += _c

# ---- 台基栏板（取代望柱）：清水混凝土连续板 + 竹木扶手 ----
_par += para_ring(AX, LY, 50.0, 34.0, POD_T, skip_south=_SKIP)
_hnd += hand_rail(AX, LY, 50.0, 34.0, POD_T + 1.05, skip_south=_SKIP)

# ---- 退台花园：一层屋顶（外 86×56 / 内 72×44）+ 二层屋顶（外 72×44 / 内 56×32）----
for _ox, _oy, _ix, _iy, _zt in ((_F1[0], _F1[1], _F2[0], _F2[1], _F1[2]),
                                (_F2[0], _F2[1], _F3[0], _F3[1], _F2[2])):
    _pave += terrace_ring(AX, LY, _ox, _oy, _ix, _iy, _zt, 0.10)
    _soil += terrace_ring(AX, LY, _ox - 0.9, _oy - 0.9, _ix + 1.2, _iy + 1.2, _zt, 0.34)
    _par += para_ring(AX, LY, _ox, _oy, _zt, skip_south=_SKIP)
    _hnd += hand_rail(AX, LY, _ox, _oy, _zt + 1.05, skip_south=_SKIP)

# 灌木：沿两级退台外缘一圈（避开南面中轴开口）
# ★ shrub() 返回的是**单个** (verts, faces) 元组，不是列表 —— 必须用 append()，
#   写成 `_leaf += shrub(...)` 会把元组拆成 verts / faces 塞进列表，
#   emit_to 里 `for v, f in parts` 立刻炸（第 1 版踩过）。
for _k in range(14):
    _t = -1.0 + 2.0 * _k / 13.0
    if abs(_t) < 0.30:
        continue
    _leaf.append(shrub(AX + _t * (_F1[0] - 2.0), LY + _F1[1] - 2.2, _F1[2] + 0.34))
    _leaf.append(shrub(AX + _t * (_F1[0] - 2.0), LY - _F1[1] + 2.2, _F1[2] + 0.34))
    _leaf.append(shrub(AX + _t * (_F2[0] - 2.0), LY + _F2[1] - 2.2, _F2[2] + 0.34,
                       h=1.80, r=0.95))
    _leaf.append(shrub(AX + _t * (_F2[0] - 2.0), LY - _F2[1] + 2.2, _F2[2] + 0.34,
                       h=1.80, r=0.95))

# ---- 光庭环 + 薄壳：**壳不外挑**，外缘正好落在光庭环顶上 ----
# 第 1 版把壳做成三层轮廓的 1.464 倍（外挑 13 m），结果：
# ① 鸟瞰里壳把两级退台花园全盖住了；② 壳外缘（Z 32.40）比光庭环顶低 4.43 m，
#    从外面水平看光庭环被壳整个挡掉，"光庭"等于没做。
# 壳的起拱方向是"向内向上"，所以**只要外挑就一定挡**。壳平面 = 三层轮廓（56×32）。
_LIB_EDGE_S = 35.40              # 壳外缘南端（低）
_LIB_EDGE_N = 38.20              # 壳外缘北端（高）—— 南低北高，破对称金字塔
_LIB_H = 7.20                    # 壳起拱
_LIB_GLASS = 0.34                # 中央玻璃光庭顶的相对半径

_lib_prof = prof2d(round_rect(AX - _F3[0], LY - _F3[1], AX + _F3[0], LY + _F3[1],
                              6.0, 0.0, n=8))


def _lib_z(s, x, y):
    """壳下皮：起拱 + 南北倾斜（南低北高）。"""
    t = max(-1.0, min(1.0, (y - LY) / _F3[1]))
    return ((_LIB_EDGE_S + _LIB_EDGE_N) * 0.5
            + (_LIB_EDGE_N - _LIB_EDGE_S) * 0.5 * t
            + _LIB_H * (1.0 - s ** 1.9))


_lib_top = [_lib_z(1.0, p[0], p[1]) for p in _lib_prof]
emit_to('BLD_人文_Library_Clerestory', M_GLASST, C_BLD,
        [ring_wall(_lib_prof, _F3[2], _lib_prof, _lib_top, sc=0.988)])
# 光庭环内的结构细柱：把"壳浮在光上"讲清楚
_clr = [bar3d((p[0], p[1], _F3[2]), (p[0], p[1], _lib_top[i]), 0.34)
        for i, p in enumerate(_lib_prof) if i % 3 == 0]
emit_to('BLD_人文_Library_ClerestoryPost', M_STEEL, C_BLD, _clr)

# 环数 5 → 9：`1 - s**1.9` 在 s→1（壳外缘）处斜率最大，环稀了外缘就会折成
# 一圈可见的棱带，"变曲率连续薄壳"读成"多边形攒尖"。9 环在 1600px 下才够顺。
# 第三个数是**平面内 dy 偏移**（不是 dz）—— 内环整体北移，破正对称。
_LIB_RINGS = [(1.0 - 0.66 * (i / 8.0), 0.0, 1.8 * (i / 8.0)) for i in range(9)]
emit_to('BLD_人文_Library_Shell', M_ZINC, C_BLD,
        [shell_solid(_lib_prof, _LIB_RINGS, 0.46, _lib_z)])
emit_to('BLD_人文_Library_ShellRib', M_WOOD, C_BLD,
        shell_ribs(_lib_prof, _LIB_RINGS, _lib_z, t=0.20, drop=0.24,
                   n_ring=12, n_rad=12))
emit_to('BLD_人文_Library_ShellEdge', M_COPPER, C_BLD,
        rim_edge(_lib_prof, _lib_z, 1.0, 0.46))
# 中央玻璃光庭顶（0.34 × 三层轮廓 = 19.0 × 10.9）。
# 做薄板而不是单面 cap —— 单面 cap 从下往上看会被背面剔除掉。
emit_to('BLD_人文_Library_AtriumGlass', M_GLASST, C_BLD,
        [box(AX, LY + 1.8, 2 * _F3[0] * _LIB_GLASS, 2 * _F3[1] * _LIB_GLASS, 0.16,
             _lib_z(_LIB_GLASS, AX, LY + 1.8) + 0.36)])

emit_to('BLD_人文_Library_Slab', M_SLAB, C_BLD, _slab)
emit_to('BLD_人文_Library_Truss', M_STEEL, C_BLD, _truss)
emit_to('BLD_人文_Library_Glass', M_GLASSC, C_BLD, _glass)
emit_to('BLD_人文_Library_Fin', M_BAMBOO, C_BLD, _fin)
emit_to('BLD_人文_Library_Copper', M_COPPER, C_BLD, _cop)
emit_to('BLD_人文_Library_Parapet', M_CONC, C_BLD, _par)
emit_to('BLD_人文_Library_HandRail', M_BAMBOO, C_BLD, _hnd)
emit_to('BLD_人文_Library_Terrace', M_PAVE, C_BLD, _pave, up=True)
emit_to('BLD_人文_Library_Soil', M_SOIL, C_BLD, _soil)
emit_to('BLD_人文_Library_Shrub', M_LEAF, C_BLD, _leaf, smooth=True)

print(f'[R2] 图书馆：三层台地 {2*_F1[0]:.0f}×{2*_F1[1]:.0f} → {2*_F2[0]:.0f}×{2*_F2[1]:.0f} '
      f'→ {2*_F3[0]:.0f}×{2*_F3[1]:.0f}；**全楼檐口 0**；'
      f'楼板边带 = 0.90 板边 + {_TRH:.2f} 编织格构带')
print(f'[R2] 图书馆薄壳：{2*_F3[0]:.0f}×{2*_F3[1]:.0f}（= 三层轮廓，**不外挑**），'
      f'外缘 Z {_LIB_EDGE_S:.2f}(南)~{_LIB_EDGE_N:.2f}(北) → 中心 Z '
      f'{_lib_z(0.34, AX, LY + 1.8):.2f}（起拱 {_LIB_H:.1f} m）')
print(f'[R2] 图书馆光庭环：高 {_LIB_EDGE_S - _F3[2]:.1f}(南)~'
      f'{_LIB_EDGE_N - _F3[2]:.1f}(北) m（Z {_F3[2]:.2f} 起），'
      f'中央玻璃顶 {2*_F3[0]*_LIB_GLASS:.1f}×{2*_F3[1]*_LIB_GLASS:.1f}；'
      f'退台花园两级，栏板 + 竹木扶手')


# ==================================================================
# 4. 漂浮讲堂 —— 中轴序列的收头
# ==================================================================
_FL_T = 0.80                     # 楼板（清水混凝土部分）厚
_FL_M = 0.10                     # 镜面底板厚
_FL_Z0 = GZ + 3.00               # 楼板底 Z 6.00（水面以上 6 m）
_FL_Z1 = _FL_Z0 + _FL_T + _FL_M  # 楼板顶 Z 6.90
_FL_HX, _FL_HY = 32.0, 22.0      # 楼板 64×44（半宽 / 半深）
_FL_GX, _FL_GY = 28.0, 19.0      # 玻璃幕 56×38（内退 4 m）
_FL_K = 1.25                     # 壳 = 玻璃幕轮廓的 1.25 倍
_FL_EDGE = GZ + 12.40            # 壳外缘 = 玻璃幕顶 Z 15.40
_FL_H = 5.60                     # 壳起拱
_FL_R0 = 1.0 / _FL_K

_fl_prof = prof2d(round_rect(AX - _FL_GX, FLY - _FL_GY, AX + _FL_GX, FLY + _FL_GY,
                             10.0, 0.0, n=8))
_FL_SHX, _FL_SHY = _FL_GX * _FL_K, _FL_GY * _FL_K
_fl_shell = prof2d(round_rect(AX - _FL_SHX, FLY - _FL_SHY, AX + _FL_SHX, FLY + _FL_SHY,
                              12.0, 0.0, n=8))


def _fl_z(s, x, y):
    """壳下皮：起拱 + 东西向倾斜（东高西低），与图书馆的南北倾斜错开。"""
    u = max(-1.0, min(1.0, (x - AX) / _FL_GX))
    return _FL_EDGE + 1.10 * u + _FL_H * (1.0 - s ** 1.9)


# ---- 楼板：混凝土主体（6.10~6.90）+ **镜面底板（6.00~6.10）** ----
# 两块上下叠放、不共面，所以不会 Z-fighting；外轮廓同尺寸。
# 镜面朝下、正对水面 —— 反射的是脚下有波纹、有倒影的水，所以它成立
# （对比 R1：竖直镜面对天空是隐形的，大面镜墙必失败）。
_fl_dk, _fl_mr = [], []
_fl_dk.append(box(AX, FLY, 2 * _FL_HX, 2 * _FL_HY, _FL_T, _FL_Z0 + _FL_M))
_fl_mr.append(box(AX, FLY, 2 * _FL_HX, 2 * _FL_HY, _FL_M, _FL_Z0))
# 楼板边缘一圈铜压顶（与 R0 基座同一条语言：给悬挑一条锐利的水平线）
for _e in (-1.0, 1.0):
    _fl_dk.append(box(AX, FLY + _e * _FL_HY, 2 * _FL_HX, 0.30, 0.22, _FL_Z1))
    _fl_dk.append(box(AX + _e * _FL_HX, FLY, 0.30, 2 * _FL_HY, 0.22, _FL_Z1))

# ---- 细柱：楼板边缘 → 壳底（20 根 0.35 方钢）----
_fl_col = []
for _e in (-1.0, 1.0):
    for _k in range(5):
        _t = -1.0 + 2.0 * _k / 4.0
        for _px, _py in ((AX + _e * _FL_HX, FLY + _t * _FL_HY),
                         (AX + _t * _FL_HX, FLY + _e * _FL_HY)):
            _r = max(abs(_px - AX) / _FL_SHX, abs(_py - FLY) / _FL_SHY)
            _fl_col.append(bar3d((_px, _py, _FL_Z0),
                                 (_px, _py, _fl_z(min(1.0, _r), _px, _py) - 0.16),
                                 0.35))

# ---- 玻璃幕（真透明）+ 竹木竖翼 + 铜压顶 ----
# 玻璃幕直接顶到壳外缘（Z 15.40），8.5 m 通高 —— 不做单独的光庭带：
# 壳外缘与光庭带顶同高时，壳的裙边会把光庭带的上半遮住，读数反而更乱。
_fl_gl, _fl_fn, _fl_cp = fin_facade(AX, FLY, _FL_GX, _FL_GY, _FL_Z1, _FL_EDGE,
                                    gap=0.50, fin_d=0.42, fin_t=0.13, pitch=1.50)

# ---- 薄壳屋面（与图书馆同一套语言，但更薄更扁）----
_FL_RINGS = [(1.0 - 0.84 * (i / 8.0), 0.0, 1.8 * (i / 8.0)) for i in range(9)]
emit_to('BLD_讲堂_薄壳', M_ZINC, C_BLD,
        [shell_solid(_fl_shell, _FL_RINGS, 0.40, _fl_z)])
emit_to('BLD_讲堂_木肋', M_WOOD, C_BLD,
        shell_ribs(_fl_shell, _FL_RINGS, _fl_z, t=0.18, drop=0.22,
                   n_ring=12, n_rad=12))
# 铜收边：与图书馆同一手，给外挑 3 m 的薄壳一条锐利水平线。
# 收边跟随东西向倾斜逐点生成，所以东端比西端高 2.2 m。
emit_to('BLD_讲堂_壳收边', M_COPPER, C_BLD,
        rim_edge(_fl_shell, _fl_z, 1.0, 0.40))
emit_to('BLD_讲堂_顶光玻璃', M_GLASST, C_BLD,
        [box(AX, FLY + 1.8, 2 * _FL_GX * 0.16, 2 * _FL_GY * 0.16, 0.16,
             _fl_z(0.16, AX, FLY + 1.8) + 0.32)])

emit_to('BLD_讲堂_楼板', M_CONC, C_BLD, _fl_dk)
emit_to('BLD_讲堂_镜面底', M_MIRROR, C_BLD, _fl_mr)
emit_to('BLD_讲堂_细柱', M_STEEL, C_BLD, _fl_col)
emit_to('BLD_讲堂_玻璃幕', M_GLASSC, C_BLD, _fl_gl)
emit_to('BLD_讲堂_竹木竖翼', M_BAMBOO, C_BLD, _fl_fn)
emit_to('BLD_讲堂_铜压顶', M_COPPER, C_BLD, _fl_cp)

print(f'[R2] 漂浮讲堂：楼板 {2*_FL_HX:.0f}×{2*_FL_HY:.0f} @ Z {_FL_Z0:.2f}~{_FL_Z1:.2f}，'
      f'底面镜面 {_FL_M:.2f} m；玻璃幕 {2*_FL_GX:.0f}×{2*_FL_GY:.0f}'
      f'（内退 {_FL_HX-_FL_GX:.0f} m）Z {_FL_Z1:.2f}~{_FL_EDGE:.2f}（{_FL_EDGE-_FL_Z1:.1f} m 通高）')
print(f'[R2] 讲堂薄壳：{2*_FL_SHX:.1f}×{2*_FL_SHY:.1f}（外挑 '
      f'{_FL_SHX - _FL_HX:.1f} m），外缘 Z {_FL_EDGE:.2f} → 中心 Z '
      f'{_fl_z(0.16, AX, FLY + 1.8):.2f}；东西向倾斜 ±1.10 m；细柱 20 根 0.35 方钢；铜收边一圈')
print(f'[R2] 讲堂楼板 Y {FLY - _FL_HY:.1f}~{FLY + _FL_HY:.1f}，岸线 Y ≈ {FL_SHORE} '
      f'→ **悬于水面 {FLY + _FL_HY - FL_SHORE:.1f} m**（占进深 '
      f'{(FLY + _FL_HY - FL_SHORE) / (2 * _FL_HY) * 100:.0f}%）')


# ==================================================================
# 5. 中轴末段 + 连接桥
# ==================================================================
# 塔院北沿（Y 710）到观景台南沿（Y 776.4）之间原本是草地，中轴断在这里。
emit_to('SITE_中轴_末段', M_PAVE_W, C_PAVE,
        [round_rect(AX - 26.0, 710.0, AX + 26.0, 778.0, 6.0, GZ + 0.055)], up=True)

# 连接桥：观景台（半圆平台，台面 Z 3.35）→ 讲堂楼板（Z 6.00）
# 桥面单独发（开放曲面必须 up=True）；边梁是 box，混在一起会被 _force_up 翻坏。
_bz0, _bz1 = GZ + 0.35, _FL_Z0
emit_to('SITE_讲堂_桥面', M_CONC, C_BLD,
        [band([(AX - 7.0, 808.0), (AX + 7.0, 808.0)], _bz0,
              [(AX - 7.0, 820.5), (AX + 7.0, 820.5)], _bz1)], up=True)
emit_to('SITE_讲堂_桥边梁', M_CONC, C_BLD,
        [box(AX - 7.35, 814.25, 0.70, 13.4, 0.60, _bz0 - 0.20),
         box(AX + 7.35, 814.25, 0.70, 13.4, 0.60, _bz0 - 0.20)])
emit_to('SITE_讲堂_桥栏', M_STEEL, C_BLD,
        [bar3d((AX - 7.20, 808.0, _bz0 + 1.10), (AX - 7.20, 820.5, _bz1 + 1.10), 0.14),
         bar3d((AX + 7.20, 808.0, _bz0 + 1.10), (AX + 7.20, 820.5, _bz1 + 1.10), 0.14)])

print('[R2] 图书馆改造 + 漂浮讲堂 完成')
