# -*- coding: utf-8 -*-
"""
build_campus_r0.py —— 山河大学 R0：垂直书院（新语言样板 · 第 9 版）
================================================================
由 run_campus.py 的 build_extra 串联在 stage1 / stage2 / stage3 之后执行，
**共享同一个 globals**，可直接复用 box() / square_ring() / emit_to() /
Z_TOP / C_BLD / make_mat / principled / set_in 等。

R0 是整条链路的**闸门**：语言不定死，后面每一栋都要返工。

------------------------------------------------------------------
【迭代史 —— 每一版失败在哪，必须留在代码里】
------------------------------------------------------------------
第 4 版：8 层各自出檐 + 逐层收分 + 塔刹 = **密檐塔的构图法则**。
        换材料救不了 —— 构图法则不变，它必然还读成塔。
第 5 版：取消檐口（对）。但把"编织格构"做成了一圈**外挂在立面外的斜杆笼**：
        又黑又密、遮死玻璃，且**顶端正悬在上层楼板下 1.3 m、一头不接东西**
        → 读成铁丝笼，不是结构。
第 6 版：编织格构改为**楼板边带里的钢桁架**（正解，斗拱本就长在楼板边上）；
        立面加竹木竖翼，玻璃终于看得见。方向对了，但暴露三个新问题：
        ① **竖翼朝向 bug** —— 我只写了一种朝向（0.12 沿 X、0.44 沿 Y）。
           ±Y 面正确（薄边沿墙、翼深垂直墙面），±X 面就变成**0.44 宽平贴墙的板**。
           修法：side_frames 额外返回**外法线**，按法线定朝向。
        ② **树冠倒置 bug** —— frustum(r*0.50 → r) 是**向上张开的碗**，
           渲出来是一排绿碗。改成 frustum(r → r*0.32) 向上收。
        ③ **竖翼顶端悬空** —— 楼板错位后，本层立面的顶边落在上层楼板轮廓之外，
           竖翼像"断头筷子"。修法：每层顶部加一条**压顶钢轨**，
           把本层立面收成一个**完整的盒**（这才是错位堆叠的正确写法：
           每个体量自成一体，而不是层层相接）。
第 7 版：三个 bug 全修好。但**仰视图暴露构图问题**：偏移 2.8 m/层累积到 25 m，
        楼板又只有 0.90 厚 → 读成"一摞乱飞的纸片"，不是一座塔。
第 8 版：偏移收到 1.60、楼板加厚到 1.10、收分加狠（31×22 → 20×13.2），
        并给庭院层加**悬挑翼**（局部 +X 挑出，翼上放阶梯看台）作为记忆点。
        好多了，但仰视仍读成"灰纸片"。
第 9 版：定位到根因 —— **楼板底面是一整片浅灰平面，没有任何结构表达**。
        加一组**板底结构肋**（墨灰钢，每层 6 根），底面立刻读成"结构"；
        偏移再收到 0.80，动作收敛为"以旋转为主、偏移为辅"，扭转才读得出来；
        翼底加肋、外缘加铜饰带，让"悬空看台"读成一个特殊构件。
        **本版为 R0 定稿。**

【一句话结论】"陈旧"不是材料问题，是**构图法则**问题。
塔的法则（层层出檐 + 逐层收分 + 塔刹）不破，换什么材料都还是塔。
第 9 版把这三条全部删掉，只留下"楼板边带"这一条水平线，
轮廓改由**错位旋转**提供 —— 这才是当代体量语言。

------------------------------------------------------------------
【第 7 版构成】
------------------------------------------------------------------
  楼板边带     0.90 清水混凝土（唯一的水平线）
  桁架带       1.25 墨灰钢：上下弦 + 斜腹杆，齐平楼板边缘、不出挑
  玻璃幕墙     4.95 高，内退 0.55
  竹木竖翼     间距 1.30，截面 0.44×0.12（**按外法线定向**）
  压顶钢轨     0.18 方，收住本层立面顶边 → 每层是一个完整的盒
  空中庭院层   第 3 / 6 层：楼板外挑 3.4，全开敞
               玻璃栏板 + 竹木扶手 + **竹木花架**（暖色藤架，不是黑钢网）
               + 庭院铺装 + 阶梯看台（**高校信号**）+ 4 株大树
  核心筒       10 × 7.2 清水混凝土，固定不旋转

  顶冠         悬挑观景平台（27×20）→ 斜撑 → 玻璃观景厅（16×12×6.0，
               带竖向分格与竹木翼）→ 薄平屋盖 → 细桅杆
               **不要帽檐、不要收分棱台、不要塔刹。**

  基座         42×42 清水混凝土，四面通透开口，
               顶板平直悬挑 1.6（**不上翘**）+ 薄铜压顶 + 悬挑斜撑

设计依据：`01-产品设计/山河大学_设计方案修订纲要V2.md` 第三节 · 锚点 3
"""

import math

import bpy
from mathutils import Vector

print('### [R0] 垂直书院 · 新语言样板（第 9 版：板底结构肋）###')

GZ = Z_TOP
TX, TY = 0.0, 648.0          # 原镇山塔位置，仍是全校园最高点


# ==================================================================
# 0. 清掉原镇山塔（V2 处置：塔 → 垂直书院）
# ==================================================================
_DROP = ('BLD_人文_Zhenshan_',)
_drop_n = 0
for _ob in list(bpy.data.objects):
    if any(_ob.name.startswith(_p) for _p in _DROP):
        _me = _ob.data
        bpy.data.objects.remove(_ob, do_unlink=True)
        if _me is not None and _me.users == 0:
            bpy.data.meshes.remove(_me)
        _drop_n += 1
print(f'[R0] 已移除原镇山塔构件 {_drop_n} 个')


# ==================================================================
# 1. 新语言材质（V2 §2.2 材料体系）
# ==================================================================
# ★ 清水混凝土的**唯一色值来源**在这里。R1 及以后各阶段只取引用、不再传色值：
#   `make_mat` 是按**名字**缓存的（`bpy.data.materials.get(name)` 命中就直接返回），
#   同名材质第二次调用时**传进去的颜色会被静默忽略**。
#   R1 曾把色值从 0.585 一路压到 0.272 却毫无变化，就是踩了这个坑。
#
# 色值 0.585 是按旧配色（黛瓦黑，反照率 ~0.05）标定的 sun 4.2 定的；
# V2 换成浅色系以后受光面直接被推到色调映射压缩段顶端 —— 什么反照率进去都是一片白。
# 0.272（≈ sRGB 0.55）才是清水混凝土在中灰天空下的真实观感，
# 同时把渲染配置里的 sun_strength 从 4.2 降到 2.9。
M_CONC = make_mat('M_清水混凝土', (0.272, 0.264, 0.246), rough=0.86,
                  noise_scale=1.6, col_b=(0.226, 0.219, 0.204))
M_SLAB = make_mat('M_混凝土楼板', (0.332, 0.327, 0.314), rough=0.88,
                  noise_scale=2.4, col_b=(0.282, 0.278, 0.268))
M_STEEL = make_mat('M_墨灰钢构', (0.125, 0.132, 0.143), rough=0.42, metal=0.82)
set_in(principled(M_STEEL), 'Specular IOR Level', 0.30)
M_GLASSC = make_mat('M_超白玻璃', (0.165, 0.200, 0.220), rough=0.075, metal=0.0)
set_in(principled(M_GLASSC), 'Specular IOR Level', 0.68)
M_BAMBOO = make_mat('M_竹木格栅', (0.455, 0.315, 0.185), rough=0.72,
                    noise_scale=2.2, col_b=(0.335, 0.222, 0.126))
M_ZINC = make_mat('M_钛锌屋面板', (0.172, 0.180, 0.190), rough=0.60, metal=0.42)
set_in(principled(M_ZINC), 'Specular IOR Level', 0.16)
M_COPPER = make_mat('M_铜饰', (0.435, 0.268, 0.128), rough=0.33, metal=1.0)
M_LEAF = make_mat('M_庭院绿植', (0.148, 0.248, 0.118), rough=0.78,
                  noise_scale=3.2, col_b=(0.104, 0.176, 0.082))
M_SOIL = make_mat('M_树池', (0.238, 0.225, 0.208), rough=0.92)
# 庭院铺装：比楼板深而暖，庭院层才不会读成"又一块板"
M_PAVE = make_mat('M_庭院铺装', (0.262, 0.248, 0.226), rough=0.90,
                  noise_scale=3.0, col_b=(0.212, 0.200, 0.182))


# ==================================================================
# 2. 构件工具
# ==================================================================
def rot_z(geo, cx, cy, deg):
    """把 (verts, faces) 绕 (cx, cy) 旋转 deg 度。

    错位堆叠全靠旋转，而 square_ring 之类都不支持旋转 —— 统一
    "先生成未旋转几何，再整体 rot_z"，比给每个构件加 rot 参数干净。
    """
    if not deg:
        return geo
    a = math.radians(deg)
    ca, sa = math.cos(a), math.sin(a)
    vs, fs = geo
    return ([((x - cx) * ca - (y - cy) * sa + cx,
              (x - cx) * sa + (y - cy) * ca + cy, z) for x, y, z in vs], fs)


def bar3d(p0, p1, r):
    """从 p0 到 p1 的方形杆件（截面 r×r）—— 桁架腹杆、斜撑、树干的基本单元。

    box() 的 rot 只能绕 Z 轴，做不了斜杆；用方向向量的 to_track_quat
    构造正交基，就能生成任意方向的杆。
    """
    a, b = Vector(p0), Vector(p1)
    d = b - a
    L = d.length
    if L < 1e-6:
        return [], []
    q = d.normalized().to_track_quat('Z', 'Y')
    vs = []
    for zz in (0.0, L):
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            p = a + q @ Vector((sx * r * 0.5, sy * r * 0.5, zz))
            vs.append((p.x, p.y, p.z))
    fs = [[3, 2, 1, 0], [4, 5, 6, 7], [0, 1, 5, 4],
          [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
    return vs, fs


def frustum(cx, cy, hw0, hd0, hw1, hd1, z0, z1, n=8, rot=0.0, caps=True):
    """棱台。注意 **hw0/hd0 是底面、hw1/hd1 是顶面** ——
    树冠必须"底宽顶窄"（hw0 > hw1），写成 hw0 < hw1 就是一只向上张开的碗。"""
    A, _ = square_ring(cx, cy, hw0, hd0, z0, n, 0.0)
    B, _ = square_ring(cx, cy, hw1, hd1, z1, n, 0.0)
    k = len(A)
    vs = [(p[0], p[1], z0) for p in A] + [(p[0], p[1], z1) for p in B]
    fs = [[i, (i + 1) % k, k + (i + 1) % k, k + i] for i in range(k)]
    if caps:
        fs.append(list(range(k - 1, -1, -1)))
        fs.append([k + i for i in range(k)])
    return rot_z((vs, fs), cx, cy, rot)


def corners(cx, cy, hx, hy, rot=0.0):
    """旋转矩形的四个角（从 −X−Y 起逆时针）。"""
    a = math.radians(rot)
    ca, sa = math.cos(a), math.sin(a)
    out = []
    for px, py in ((cx - hx, cy - hy), (cx + hx, cy - hy),
                   (cx + hx, cy + hy), (cx - hx, cy + hy)):
        dx, dy = px - cx, py - cy
        out.append((dx * ca - dy * sa + cx, dx * sa + dy * ca + cy))
    return out


def side_frames(cx, cy, hx, hy, rot):
    """四条边：(ax, ay, bx, by, 边长, 外法线nx, 外法线ny)。

    **必须带外法线**：竖向遮阳翼要在每条边上"薄边沿墙、翼深垂直墙面"，
    只按一种朝向写 box 的话，±X 面就会变成平贴墙的宽板（第 6 版的 bug）。
    """
    c4 = corners(cx, cy, hx, hy, rot)
    _nm = ((0.0, -1.0), (1.0, 0.0), (0.0, 1.0), (-1.0, 0.0))
    a = math.radians(rot)
    ca, sa = math.cos(a), math.sin(a)
    out = []
    for s in range(4):
        ax, ay = c4[s]
        bx, by = c4[(s + 1) % 4]
        nx0, ny0 = _nm[s]
        out.append((ax, ay, bx, by, math.hypot(bx - ax, by - ay),
                    nx0 * ca - ny0 * sa, nx0 * sa + ny0 * ca))
    return out


def fin_box(px, py, nx, ny, depth, thick, h, z):
    """按外法线定向的竖向遮阳翼：翼深 depth 垂直于墙面，薄边 thick 沿墙面。"""
    if abs(nx) > abs(ny):
        return box(px, py, depth, thick, h, z)
    return box(px, py, thick, depth, h, z)


def mini_tree(cx, cy, z, h=5.6, r=2.30):
    """空中庭院的大树。**底宽顶窄** —— 第 6 版写成底窄顶宽，渲成一排绿碗。"""
    t = bar3d((cx, cy, z), (cx, cy, z + h * 0.62), 0.34)
    c = frustum(cx, cy, r, r, r * 0.32, r * 0.32, z + h * 0.46, z + h,
                n=8, caps=True)
    return t, c


# ==================================================================
# 3. 基座 —— 「台基 → 首层架空 + 公共基座」
# ==================================================================
# 台基的当代做法：**平直悬挑**，不上翘。上翘就是飞檐，飞檐就是那套旧语言。
_BS = 42.0
_BS_H = 11.25
_PT_T = 0.75
_OUTP = 1.60
_bp, _bw, _pt, _bt, _bs = [], [], [], [], []

_bp.append(box(TX, TY, _BS, _BS, _BS_H, GZ))
# 四面通透开口：公共基座的核心是"地面还给公共"，不做实心台基。
# 玻璃块要**略微凸出**基座表面 0.2 m —— 齐平会被基座本身遮住（或 Z-fighting）。
for _e in (-1.0, 1.0):
    _bw.append(box(TX, TY + _e * (_BS * 0.5 - 1.0), 33.0, 2.40, 8.40, GZ + 1.60))
    _bw.append(box(TX + _e * (_BS * 0.5 - 1.0), TY, 2.40, 33.0, 8.40, GZ + 1.60))
_pt.append(box(TX, TY, _BS + 2 * _OUTP, _BS + 2 * _OUTP, _PT_T, GZ + _BS_H))
# 顶板边缘一圈薄铜压顶 —— 取代上翘檐口，让平台边缘有一条锐利水平线。
_bt.append(box(TX, TY + (_BS * 0.5 + _OUTP - 0.14),
               _BS + 2 * _OUTP, 0.28, 0.30, GZ + _BS_H + _PT_T))
_bt.append(box(TX, TY - (_BS * 0.5 + _OUTP - 0.14),
               _BS + 2 * _OUTP, 0.28, 0.30, GZ + _BS_H + _PT_T))
_bt.append(box(TX + (_BS * 0.5 + _OUTP - 0.14), TY,
               0.28, _BS + 2 * _OUTP - 0.56, 0.30, GZ + _BS_H + _PT_T))
_bt.append(box(TX - (_BS * 0.5 + _OUTP - 0.14), TY,
               0.28, _BS + 2 * _OUTP - 0.56, 0.30, GZ + _BS_H + _PT_T))
# 顶板悬挑下的斜撑（编织格构的第一次出现）—— 把"平挑"的结构讲清楚
for _s in range(4):
    _a = corners(TX, TY, _BS * 0.5 - 1.2, _BS * 0.5 - 1.2)[_s]
    _bs.append(bar3d((_a[0], _a[1], GZ + _BS_H - 3.20),
                     (_a[0] * 1.06, _a[1] * 1.06, GZ + _BS_H), 0.26))

emit_to('BLD_人文_Vertical_Academy_Podium', M_CONC, C_BLD, _bp)
emit_to('BLD_人文_Vertical_Academy_Opening', M_GLASSC, C_BLD, _bw)
emit_to('BLD_人文_Vertical_Academy_PodiumDeck', M_SLAB, C_BLD, _pt)
emit_to('BLD_人文_Vertical_Academy_PodiumTrim', M_COPPER, C_BLD, _bt)
emit_to('BLD_人文_Vertical_Academy_PodiumBrace', M_STEEL, C_BLD, _bs)


# ==================================================================
# 4. 塔身 —— 「塔 → 空中庭院错位堆叠」
# ==================================================================
_N = 9
_LH = 7.40                      # 层高
_HWX0, _HWY0 = 15.5, 11.0       # 首层 31 × 22
_HWX1, _HWY1 = 10.0, 6.6        # 顶层 20 × 13.2（收分更狠，塔更挺）
_SPIN = -9.0                    # 每层旋转 —— 9 层共 −72°
_OFFS = 0.80                    # 每层中心偏移 —— 第 8 版 1.6 仍偏大；
                                # 动作收敛为"以旋转为主、偏移为辅"，扭转才读得出来
_SLAB_T = 1.10                  # 楼板厚 —— 第 7 版 0.90 渲成"薄纸片"，加厚才读成体量
_TRH = 1.25                     # 桁架带高（斗拱 → 编织格构）
_GAP = 0.55                     # 玻璃内退
_FIN_D, _FIN_T = 0.40, 0.12     # 竖翼：翼深 / 薄边
_Z0 = GZ + _BS_H + _PT_T        # 首层楼面 Z 15.0
_ZTOP = _Z0 + _N * _LH          # 塔身顶 Z 81.6
_CORE_HX, _CORE_HY = 5.0, 3.6   # 核心筒（固定不旋转）—— 让"楼板在滑动"可读
_OPEN = (2, 5)                  # 空中庭院层（第 3 / 6 层）
_CANT = 2.70                    # 庭院层楼板外挑
_WING = 4.50                    # 庭院层**悬挑翼**外挑（记忆点：两只悬在空中的看台）

_slabs, _truss, _glass, _fin, _rail, _pave, _seat, _soil, _leaf, _core = (
    [], [], [], [], [], [], [], [], [], [])
_rib, _cop = [], []          # 板底结构肋 / 翼缘铜饰带

for _i in range(_N):
    _z = _Z0 + _i * _LH
    _hx = _HWX0 + (_HWX1 - _HWX0) * _i / (_N - 1)
    _hy = _HWY0 + (_HWY1 - _HWY0) * _i / (_N - 1)
    _rot = _SPIN * _i
    _cx = TX + _OFFS * math.cos(math.radians(_rot))
    _cy = TY + _OFFS * math.sin(math.radians(_rot))
    _open = _i in _OPEN
    _ox = _CANT if _open else 0.0
    _sx, _sy = _hx + _ox, _hy + _ox
    _a = math.radians(_rot)

    # ---- 楼板（唯一的水平线；没有任何出挑屋面）----
    _slabs.append(rot_z(box(_cx, _cy, 2 * _sx, 2 * _sy, _SLAB_T, _z),
                        _cx, _cy, _rot))

    # ---- 板底结构肋（coffered soffit）----
    # 第 8 版仰视图读成"一摞灰纸片"：楼板底面是一整片浅灰平面，没有结构表达。
    # 加一组墨灰钢肋，底面立刻读成"结构"，纸片感消失。
    for _ry_ in (-_sy * 0.62, -_sy * 0.20, _sy * 0.20, _sy * 0.62):
        _rib.append(rot_z(box(_cx, _cy + _ry_, 2 * _sx - 0.80, 0.42, 0.55,
                              _z - 0.55), _cx, _cy, _rot))
    for _rx_ in (-_sx * 0.62, _sx * 0.62):
        _rib.append(rot_z(box(_cx + _rx_, _cy, 0.42, 2 * _sy - 0.80, 0.55,
                              _z - 0.55), _cx, _cy, _rot))

    # ---- 桁架带：上下弦 + 斜腹杆，齐平楼板边缘、不出挑 ----
    # "斗拱 → 斜向编织格构"的正解：斗拱本质是层层出挑的受力构件，
    # 那它就该长在楼板边上。第 5 版把它罩在立面外，就变成了铁丝笼。
    _tb_z0 = _z + _SLAB_T + 0.09
    _tb_z1 = _z + _SLAB_T + _TRH - 0.09
    for _ax, _ay, _bx, _by, _L, _nx, _ny in side_frames(
            _cx, _cy, _hx + 0.09, _hy + 0.09, _rot):
        _truss.append(bar3d((_ax, _ay, _tb_z0), (_bx, _by, _tb_z0), 0.20))
        _truss.append(bar3d((_ax, _ay, _tb_z1), (_bx, _by, _tb_z1), 0.20))
        _n = max(2, int(round(_L / 1.90)))
        for _k in range(_n):
            _t0, _t1 = _k / _n, (_k + 1) / _n
            _p0 = (_ax + (_bx - _ax) * _t0, _ay + (_by - _ay) * _t0)
            _p1 = (_ax + (_bx - _ax) * _t1, _ay + (_by - _ay) * _t1)
            if _k % 2 == 0:
                _truss.append(bar3d((_p0[0], _p0[1], _tb_z0),
                                    (_p1[0], _p1[1], _tb_z1), 0.13))
            else:
                _truss.append(bar3d((_p0[0], _p0[1], _tb_z1),
                                    (_p1[0], _p1[1], _tb_z0), 0.13))

    if not _open:
        # ---- 玻璃幕墙 + 竹木竖翼 + 压顶钢轨（**本层立面是一个完整的盒**）----
        _fz = _z + _SLAB_T + _TRH + 0.05
        _gh = 4.95
        for _ax, _ay, _bx, _by, _L, _nx, _ny in side_frames(
                _cx, _cy, _hx, _hy, _rot):
            # 玻璃：内退 0.55
            _gx, _gy = _ax - _nx * _GAP, _ay - _ny * _GAP
            _ex, _ey = _bx - _nx * _GAP, _by - _ny * _GAP
            if abs(_nx) > abs(_ny):
                _glass.append(rot_z(box((_gx + _ex) * 0.5, _gy, 0.14,
                                        abs(_ey - _gy), _gh, _fz), _cx, _cy, _rot))
            else:
                _glass.append(rot_z(box(_gx, (_gy + _ey) * 0.5, abs(_ex - _gx),
                                        0.14, _gh, _fz), _cx, _cy, _rot))
            # 竹木竖翼：间距 1.30，**按外法线定向**
            _n2 = max(2, int(round(_L / 1.40)))
            for _k in range(_n2):
                _t0 = (_k + 0.5) / _n2
                _px = _ax + (_bx - _ax) * _t0 - _nx * 0.24
                _py = _ay + (_by - _ay) * _t0 - _ny * 0.24
                _fin.append(rot_z(fin_box(_px, _py, _nx, _ny,
                                          _FIN_D, _FIN_T, _gh, _fz),
                                  _cx, _cy, _rot))
            # 压顶钢轨：把本层立面收成一个完整的盒（否则错位后竖翼顶端悬空）
            _fin.append(rot_z(fin_box((_gx + _ex) * 0.5 - _nx * 0.24,
                                      (_gy + _ey) * 0.5 - _ny * 0.24,
                                      _nx, _ny, _FIN_D + 0.06, 0.18,
                                      0.18, _fz + _gh + 0.09), _cx, _cy, _rot))
    else:
        # ---- 空中庭院：全开敞 + **悬挑翼** ----
        # 第 7 版只有旋转与偏移，读成"一摞乱飞的纸片"。第 8 版把动作减到
        # 一个为主（旋转），再给庭院层加一只**悬挑翼** —— 记忆点在这里。
        _rx, _ry = _sx - 0.16, _sy - 0.16
        _wy = _sy * 0.50
        # 庭院铺装（比楼板深而暖，庭院层才不会读成"又一块板"）
        _pave.append(rot_z(box(_cx, _cy, 2 * _rx - 0.20, 2 * _ry - 0.20,
                               0.10, _z + _SLAB_T), _cx, _cy, _rot))
        # 悬挑翼楼板（只从局部 +X 一侧挑出，悬在校园上空）
        _slabs.append(rot_z(box(_cx + _sx + _WING * 0.5, _cy,
                                _WING, 2 * _wy, _SLAB_T, _z), _cx, _cy, _rot))
        _pave.append(rot_z(box(_cx + _sx + _WING * 0.5, _cy,
                               _WING - 0.20, 2 * _wy - 0.20, 0.10, _z + _SLAB_T),
                           _cx, _cy, _rot))
        # 翼的板底肋 + 外缘铜饰带（让"悬空看台"读成一个特殊构件，而不是又一块楼板）
        for _ry2 in (-_wy * 0.60, _wy * 0.60):
            _rib.append(rot_z(box(_cx + _sx + _WING * 0.5, _cy + _ry2,
                                  _WING - 0.70, 0.40, 0.50, _z - 0.50),
                              _cx, _cy, _rot))
        _cop.append(rot_z(box(_cx + _sx + _WING - 0.16, _cy,
                              0.32, 2 * _wy, 0.34, _z + _SLAB_T), _cx, _cy, _rot))
        # 翼的三条暴露边也补桁架带（与塔身同一语言；否则翼会读成一块悬空的板）
        for _p0, _p1 in (((_sx, -_wy), (_sx + _WING, -_wy)),
                         ((_sx + _WING, -_wy), (_sx + _WING, _wy)),
                         ((_sx + _WING, _wy), (_sx, _wy))):
            _Lw = math.hypot(_p1[0] - _p0[0], _p1[1] - _p0[1])
            _nw = max(2, int(round(_Lw / 1.90)))
            _truss.append(rot_z(bar3d((_cx + _p0[0], _cy + _p0[1], _tb_z0),
                                      (_cx + _p1[0], _cy + _p1[1], _tb_z0), 0.20),
                                _cx, _cy, _rot))
            _truss.append(rot_z(bar3d((_cx + _p0[0], _cy + _p0[1], _tb_z1),
                                      (_cx + _p1[0], _cy + _p1[1], _tb_z1), 0.20),
                                _cx, _cy, _rot))
            for _j in range(_nw):
                _t0, _t1 = _j / _nw, (_j + 1) / _nw
                _q0 = (_p0[0] + (_p1[0] - _p0[0]) * _t0, _p0[1] + (_p1[1] - _p0[1]) * _t0)
                _q1 = (_p0[0] + (_p1[0] - _p0[0]) * _t1, _p0[1] + (_p1[1] - _p0[1]) * _t1)
                if _j % 2 == 0:
                    _truss.append(rot_z(bar3d((_cx + _q0[0], _cy + _q0[1], _tb_z0),
                                              (_cx + _q1[0], _cy + _q1[1], _tb_z1), 0.13),
                                        _cx, _cy, _rot))
                else:
                    _truss.append(rot_z(bar3d((_cx + _q0[0], _cy + _q0[1], _tb_z1),
                                              (_cx + _q1[0], _cy + _q1[1], _tb_z0), 0.13),
                                        _cx, _cy, _rot))
        # 庭院 + 翼 的合并外轮廓（8 个顶点，**局部坐标下每条边都轴对齐**，
        # 所以薄板用 box、编织用 bar3d，最后统一 rot_z，不必写任意角度构件）
        _o = ((-_rx, -_ry), (_rx, -_ry), (_rx, -_wy), (_rx + _WING, -_wy),
              (_rx + _WING, _wy), (_rx, _wy), (_rx, _ry), (-_rx, _ry))
        for _k in range(len(_o)):
            _p0 = _o[_k]
            _p1 = _o[(_k + 1) % len(_o)]
            _dx, _dy = abs(_p1[0] - _p0[0]), abs(_p1[1] - _p0[1])
            if _dx > _dy:
                _bx = box(_cx + (_p0[0] + _p1[0]) * 0.5, _cy + _p0[1],
                          _dx, 0.18, 1.10, _z + _SLAB_T + 0.10)
                _bh = box(_cx + (_p0[0] + _p1[0]) * 0.5, _cy + _p0[1],
                          _dx, 0.22, 0.14, _z + _SLAB_T + 1.20)
            else:
                _bx = box(_cx + _p0[0], _cy + (_p0[1] + _p1[1]) * 0.5,
                          0.18, _dy, 1.10, _z + _SLAB_T + 0.10)
                _bh = box(_cx + _p0[0], _cy + (_p0[1] + _p1[1]) * 0.5,
                          0.22, _dy, 0.14, _z + _SLAB_T + 1.20)
            _glass.append(rot_z(_bx, _cx, _cy, _rot))
            _fin.append(rot_z(_bh, _cx, _cy, _rot))
            # 竹木花架：栏板之上 1.60 高的编织带。
            # 第 6 版用墨灰钢，渲成"黑色铁丝网"；改竹木 —— 暖色藤架才读成"庭院"。
            _L = math.hypot(_p1[0] - _p0[0], _p1[1] - _p0[1])
            _n3 = max(2, int(round(_L / 2.60)))
            for _j in range(_n3):
                _t0, _t1 = _j / _n3, (_j + 1) / _n3
                _q0 = (_p0[0] + (_p1[0] - _p0[0]) * _t0, _p0[1] + (_p1[1] - _p0[1]) * _t0)
                _q1 = (_p0[0] + (_p1[0] - _p0[0]) * _t1, _p0[1] + (_p1[1] - _p0[1]) * _t1)
                _fin.append(rot_z(bar3d((_cx + _q0[0], _cy + _q0[1], _z + _SLAB_T + 1.34),
                                        (_cx + _q1[0], _cy + _q1[1], _z + _SLAB_T + 2.94),
                                        0.12), _cx, _cy, _rot))
                _fin.append(rot_z(bar3d((_cx + _q1[0], _cy + _q1[1], _z + _SLAB_T + 1.34),
                                        (_cx + _q0[0], _cy + _q0[1], _z + _SLAB_T + 2.94),
                                        0.12), _cx, _cy, _rot))
        # 翼上的阶梯看台（**高校信号** —— 悬在空中的户外讲堂，庭院才不只是绿化平台）
        for _k in range(3):
            _seat.append(rot_z(box(_cx + _sx + 1.10 + _k * 1.65, _cy,
                                   1.70, 2 * _wy - 1.60, 0.42,
                                   _z + _SLAB_T + 0.10 + _k * 0.42),
                               _cx, _cy, _rot))
        # 四株大树（避开翼所在的局部 +X 一侧）
        for _px, _py in ((-_hx * 0.62, _hy * 0.55), (-_hx * 0.60, -_hy * 0.54),
                         (-_hx * 0.08, _hy * 0.58), (_hx * 0.34, -_hy * 0.60)):
            _wx = _px * math.cos(_a) - _py * math.sin(_a) + _cx
            _wy2 = _px * math.sin(_a) + _py * math.cos(_a) + _cy
            _soil.append(rot_z(box(_wx, _wy2, 4.20, 4.20, 1.05, _z + _SLAB_T + 0.10),
                               _wx, _wy2, _rot))
            _t, _c = mini_tree(_wx, _wy2, _z + _SLAB_T + 1.05, h=5.6, r=2.30)
            _soil.append(_t)
            _leaf.append(_c)

# ---- 核心筒：固定不旋转，从基座顶直通塔顶 ----
_core.append(box(TX, TY, 2 * _CORE_HX, 2 * _CORE_HY, _ZTOP - _Z0 + 1.0, _Z0))

emit_to('BLD_人文_Vertical_Academy_Slab', M_SLAB, C_BLD, _slabs)
emit_to('BLD_人文_Vertical_Academy_Core', M_CONC, C_BLD, _core)
emit_to('BLD_人文_Vertical_Academy_Truss', M_STEEL, C_BLD, _truss)
emit_to('BLD_人文_Vertical_Academy_Rib', M_STEEL, C_BLD, _rib)
emit_to('BLD_人文_Vertical_Academy_WingTrim', M_COPPER, C_BLD, _cop)
emit_to('BLD_人文_Vertical_Academy_Glass', M_GLASSC, C_BLD, _glass)
emit_to('BLD_人文_Vertical_Academy_Fin', M_BAMBOO, C_BLD, _fin)
emit_to('BLD_人文_Vertical_Academy_Pave', M_PAVE, C_BLD, _pave)
emit_to('BLD_人文_Vertical_Academy_Seat', M_SLAB, C_BLD, _seat)
emit_to('BLD_人文_Vertical_Academy_Planter', M_SOIL, C_BLD, _soil)
emit_to('BLD_人文_Vertical_Academy_Foliage', M_LEAF, C_BLD, _leaf, smooth=True)


# ==================================================================
# 5. 顶冠 —— 悬挑观景平台 + 玻璃观景厅（**以水平线收头**）
# ==================================================================
# 不要帽檐（33×25 的雨棚就是帽檐，戴上就成亭）、
# 不要收分棱台（那是塔刹的写法）、不要尖顶。
_DZ = _ZTOP                     # 平台底 Z 81.6
_DT = 1.00
_DHX, _DHY = 12.5, 9.0          # 平台 25 × 18（比顶层 21×14 每边外挑 2.0）
_HX, _HY = 7.60, 5.60           # 观景厅 15.2 × 11.2
_HZ0 = _DZ + _DT
_HZ1 = 88.60                    # 观景厅顶（高 6.00）
_RT = 0.55
_RHX, _RHY = 8.40, 6.40         # 屋盖（出挑 0.8）
_MTOP = 93.00

_dk, _hl, _rf, _ms, _gb, _cf = [], [], [], [], [], []

_dk.append(box(TX, TY, 2 * _DHX, 2 * _DHY, _DT, _DZ))
for _s in range(4):
    _a2 = corners(TX, TY, _DHX - 1.3, _DHY - 1.3)[_s]
    _gb.append(bar3d((_a2[0] * 0.80 + TX * 0.20, _a2[1] * 0.80 + TY * 0.20,
                      _DZ - 2.40), (_a2[0], _a2[1], _DZ), 0.22))
# 玻璃观景厅：玻璃体 + 四角细柱 + 竖向分格（别再是一个光盒）
_hl.append(box(TX, TY, 2 * _HX - 0.30, 2 * _HY - 0.30, _HZ1 - _HZ0, _HZ0))
for _sx in (-_HX + 0.20, _HX - 0.20):
    for _sy in (-_HY + 0.20, _HY - 0.20):
        _gb.append(box(TX + _sx, TY + _sy, 0.34, 0.34, _HZ1 - _HZ0, _HZ0))
for _ax, _ay, _bx, _by, _L, _nx, _ny in side_frames(TX, TY, _HX, _HY, 0.0):
    _n4 = max(2, int(round(_L / 1.70)))
    for _k in range(_n4):
        _t0 = (_k + 0.5) / _n4
        _px = _ax + (_bx - _ax) * _t0 - _nx * 0.20
        _py = _ay + (_by - _ay) * _t0 - _ny * 0.20
        _cf.append(fin_box(_px, _py, _nx, _ny, 0.40, 0.12, _HZ1 - _HZ0, _HZ0))
# 屋盖：薄平挑板
_rf.append(box(TX, TY, 2 * _RHX, 2 * _RHY, _RT, _HZ1))
_rf.append(box(TX, TY, 2 * (_RHX + 0.12), 2 * (_RHY + 0.12), 0.22, _HZ1 - 0.26))
# 细桅杆 + 顶端小铜帽（克制，不是塔刹；第 6 版那个铜环读成了十字架，去掉）
_ms.append(bar3d((TX, TY, _HZ1 + _RT), (TX, TY, _MTOP), 0.22))
_ms.append(disc(TX, TY, 0.46, _MTOP - 0.34, th=0.30, n=16))

emit_to('BLD_人文_Vertical_Academy_Deck', M_SLAB, C_BLD, _dk)
emit_to('BLD_人文_Vertical_Academy_Hall', M_GLASSC, C_BLD, _hl)
emit_to('BLD_人文_Vertical_Academy_Roof', M_ZINC, C_BLD, _rf)
emit_to('BLD_人文_Vertical_Academy_Mast', M_COPPER, C_BLD, _ms)
emit_to('BLD_人文_Vertical_Academy_DeckFrame', M_STEEL, C_BLD, _gb)
emit_to('BLD_人文_Vertical_Academy_HallFin', M_BAMBOO, C_BLD, _cf)

VA_TOP = _MTOP
print(f'[R0] 垂直书院 基座顶 {GZ + _BS_H + _PT_T:.2f} m / 塔身 {_N} 层'
      f'（每层 {_SPIN:.0f}° 旋转 + {_OFFS:.1f} m 偏移）')
print(f'[R0] 塔身平面 {_HWX0 * 2:.1f}×{_HWY0 * 2:.1f} → '
      f'{_HWX1 * 2:.1f}×{_HWY1 * 2:.1f} m，共转 {_SPIN * (_N - 1):.0f}°')
print(f'[R0] 檐口：全楼取消；楼板 {_SLAB_T:.2f} m 边带为唯一水平线')
print(f'[R0] 斗拱 → 楼板边带 {_TRH:.2f} m 钢桁架 + 竖翼压顶轨（每层自成完整的盒）')
print(f'[R0] 空中庭院 2 层（第 3 / 6 层，楼板外挑 {_CANT:.2f} m，含阶梯看台）')
print(f'[R0] 含顶冠总高 {VA_TOP:.2f} m，塔/楼 = {VA_TOP / (Z_TOP + 42.60):.2f} 倍')
print('[R0] 垂直书院 完成')
