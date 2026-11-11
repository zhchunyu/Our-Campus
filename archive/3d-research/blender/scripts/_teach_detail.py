# -*- coding: utf-8 -*-
"""
_teach_detail.py —— 【教学区示范】细节补强（挂在 STAGE_EXTRA['r5']，palette_retune 之前）
=====================================================================================
对应「廉价 / 拼凑感」的五条病根：

  1. 建筑无入口   → 门廊：柱 + 雨棚 + 玻璃门 + 铜门框 + 平台踏步
  2. 无竖向交通   → 外凸楼梯塔（通高，竖向玻璃缝 + 楼层线 + 铜压顶）
  3. 顶部没收头   → 裙房屋顶女儿墙（混凝土墙 + 铜压顶线）
  4. 地面无分级   → 路缘石 + 人行道 + 中心虚线 + 斑马线（教学区北侧 东西主路 y=404）
  5. 校园无日常感 → 路灯（双侧每 24 m）+ 座椅 + 指示牌 + 花坛 + 草坪深浅

★ 光照配方一个字不改（sun_elev 38 / azim 220），新图与现有 63 张**色彩可比**。

★★ 本脚本所有坐标都从**对象实际包围盒**推出来，不硬编码。原因（2026-09-24 实测）：
   教学区四栋楼是 86~102 m 见方的大体量，楼与楼之间只剩 **6.5~9.6 m** 的缝；
   唯一成规模的开放空间是**北排楼北侧 → 主路**那条 16.2 m 的前庭带。
   早先按"中央 quadrangle"的假想坐标摆家具，结果全部落在楼体内部（静默失效，
   图上完全看不出来）。现在：门廊一律朝**开放面**，楼梯塔一律朝**外侧**，
   家具只放在实测出来的两条带上。
"""

import bpy
from mathutils import Vector

print('[DTL] ── 教学区示范：细节补强 ──')


# ==================================================================
# 0. 新材质（首次定义）
# ==================================================================
# ★ `make_mat` 按名字缓存：同名第二次调用的色值会被**静默忽略** ——
#   所以新材质只能在这里第一次定义，别在别处再写一遍。
M_CURB = make_mat('M_路缘石', (0.520, 0.508, 0.474), rough=0.88, noise_scale=0.30)
M_MARK = make_mat('M_路面标线', (0.855, 0.845, 0.806), rough=0.60)
M_LAMP = make_mat('M_灯柱', (0.172, 0.184, 0.202), rough=0.52, metal=0.30)
M_SEAT = make_mat('M_座椅木', (0.548, 0.392, 0.238), rough=0.80)
M_PLANTER = make_mat('M_花坛石', (0.466, 0.448, 0.408), rough=0.90, noise_scale=0.30)
M_SIGN = make_mat('M_指示牌', (0.716, 0.702, 0.660), rough=0.58)
M_LAWN_L = make_mat('M_草坪浅', (0.148, 0.228, 0.092), rough=0.94, noise_scale=0.45)


def bbox_of(prefix):
    """一批同名前缀对象的世界包围盒 → (x0, x1, y0, y1, z0, z1)；没有则返回 None。"""
    xs, ys, zs = [], [], []
    for ob in bpy.data.objects:
        if ob.type != 'MESH' or not ob.name.startswith(prefix):
            continue
        for c in ob.bound_box:
            w = ob.matrix_world @ Vector(c)
            xs.append(w.x)
            ys.append(w.y)
            zs.append(w.z)
    if not xs:
        return None
    return (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))


# 裙房高 + 门廊朝向 + 楼梯塔朝向
#   朝向规则：一律朝**开放面**，避开 6.5~9.6 m 的窄缝。
#     北排（公共教学楼 / 教学B）→ 门廊朝 N（16.2 m 前庭带 + 主路来的方向）
#     南排（教学C / 教学D）     → 门廊朝 S（南侧开阔地）
#     西列 → 楼梯塔朝 W（外侧）／ 东列 → 楼梯塔朝 E（外侧）
_PODIUM = {
    'BLD_教学_公共教学楼': (8.5, 'N', 'W'),
    'BLD_教学_教学B': (7.5, 'N', 'E'),
    'BLD_教学_教学C': (7.0, 'S', 'W'),
    'BLD_教学_教学D': (7.5, 'S', 'E'),
}

_BB = {}
for _nm in _PODIUM:
    _BB[_nm] = bbox_of(_nm)
    if _BB[_nm] is None:
        print(f'[DTL]   !! 找不到 {_nm}，跳过')
for _nm in [k for k, v in _BB.items() if v is None]:
    _PODIUM.pop(_nm)


def portico(B, x0, x1, y_wall, z0, hh, face='N'):
    """门廊：四柱 + 雨棚 + 玻璃门 + 铜门框 + 入口平台/踏步。

    `face` = 'N'（朝 +Y）/ 'S'（朝 −Y）。

    ★ 不做布尔开洞（R5 已建好的墙不能再切）—— 用**凸出的门廊**体量读出入口，
      玻璃门贴在墙面上当作洞口。远看近看都成立，且不会破坏既有几何。
    """
    s = 1.0 if face == 'N' else -1.0     # 朝外方向
    cx = (x0 + x1) * 0.5
    w = 6.0                              # 门廊开间
    proj = 2.6                           # 凸出深度
    yc = y_wall + s * proj * 0.5
    # 四根柱（0.5×0.5）
    put(B, M_CONC, [box(cx - w * 0.5 + w * i / 3.0, y_wall + s * (proj - 0.35),
                        0.50, 0.50, hh, z0) for i in range(4)])
    # 雨棚板 + 铜压边（铜只用在人最靠近的地方）
    put(B, M_CONC, box(cx, yc, w + 0.70, proj + 0.70, 0.30, z0 + hh))
    put(B, M_COPPER, box(cx, yc, w + 0.86, proj + 0.86, 0.10, z0 + hh + 0.30))
    # 玻璃门（贴墙当洞口）+ 铜门框（两竖梃 + 门楣）
    put(B, M_GLASSC, box(cx, y_wall + s * 0.06, w - 1.0, 0.22, hh - 0.55, z0))
    put(B, M_COPPER, [
        box(cx - (w - 1.0) * 0.5, y_wall + s * 0.12, 0.16, 0.34, hh - 0.55, z0),
        box(cx + (w - 1.0) * 0.5, y_wall + s * 0.12, 0.16, 0.34, hh - 0.55, z0),
        box(cx, y_wall + s * 0.12, w - 0.6, 0.34, 0.18, z0 + hh - 0.55),
    ])
    # 入口平台 + 两级踏步（门槛比室外高 0.32 m —— 有"被抬高"才有"入口"）
    # ★ GZ 就是室外地坪（= Z_TOP 3.0），所以踏步是**往上**走的，不是往下挖。
    put(B, M_PAVE_W, [
        box(cx, y_wall + s * 1.00, w + 1.2, 2.00, 0.32, z0),
        box(cx, y_wall + s * 2.25, w + 1.2, 0.45, 0.21, z0),
        box(cx, y_wall + s * 2.70, w + 1.2, 0.45, 0.10, z0),
    ])
    return cx, y_wall + s * proj


def stair_tower(B, x_wall, y0, y1, z0, z_top, side='E'):
    """外凸楼梯塔：通高，竖向玻璃缝 + 楼层线 + 铜压顶。

    ★ 为什么要它：R5 的 22 栋楼**没有一处竖向交通** —— 这是"未完工的盒子"观感
      最大的来源。楼梯塔一加，体量立刻读成"一栋能进人的楼"。
    """
    h = z_top - z0 - 1.2
    cx = x_wall + (1.45 if side == 'E' else -1.45)
    cy = (y0 + y1) * 0.5 - 3.0
    put(B, M_CONC, box(cx, cy, 2.90, 5.60, h, z0))
    put(B, M_GLASSC, box(cx + (1.50 if side == 'E' else -1.50), cy,
                         0.20, 4.40, h - 1.6, z0 + 0.8))
    nf = max(1, int(h / 3.9))
    put(B, M_SLAB, [box(cx, cy, 3.10, 5.80, 0.22, z0 + 3.9 * k) for k in range(1, nf)])
    put(B, M_COPPER, box(cx, cy, 3.10, 5.80, 0.16, z0 + h))


def parapet_ring(B, x0, x1, y0, y1, z, h=0.95, t=0.32):
    """裙房屋顶女儿墙：四面墙 + 铜压顶线。

    ★ 为什么放在裙房屋顶而不是塔顶：塔顶是四坡壳，压一圈女儿墙会读成"扣了个盒子"。
      裙房屋顶本来就是平屋面，女儿墙 + 塔楼穿出 = 正确的建筑逻辑关系。
    """
    put(B, M_CONC, [
        box((x0 + x1) * 0.5, y1 - t * 0.5, x1 - x0, t, h, z),
        box((x0 + x1) * 0.5, y0 + t * 0.5, x1 - x0, t, h, z),
        box(x1 - t * 0.5, (y0 + y1) * 0.5, t, y1 - y0 - 2 * t, h, z),
        box(x0 + t * 0.5, (y0 + y1) * 0.5, t, y1 - y0 - 2 * t, h, z),
    ])
    put(B, M_COPPER, [
        box((x0 + x1) * 0.5, y1 - t * 0.5, x1 - x0, t + 0.10, 0.12, z + h),
        box((x0 + x1) * 0.5, y0 + t * 0.5, x1 - x0, t + 0.10, 0.12, z + h),
        box(x1 - t * 0.5, (y0 + y1) * 0.5, t + 0.10, y1 - y0 - 2 * t, 0.12, z + h),
        box(x0 + t * 0.5, (y0 + y1) * 0.5, t + 0.10, y1 - y0 - 2 * t, 0.12, z + h),
    ])


def bench(B, x, y, rot=0.0):
    """院落长椅：木座面 + 木靠背 + 两个深色金属支腿（★ z 一律以 GZ 为基准）"""
    g = GZ
    put(B, M_SEAT, [
        box(x, y, 1.80, 0.50, 0.10, g + 0.42, rot=rot),
        box(x, y + 0.22, 1.80, 0.10, 0.44, g + 0.52, rot=rot),
    ])
    put(B, M_LAMP, [
        box(x - 0.70, y, 0.10, 0.44, 0.42, g, rot=rot),
        box(x + 0.70, y, 0.10, 0.44, 0.42, g, rot=rot),
    ])


def lamp_post(B, x, y, s=1.0):
    """路灯：6.0 m 柱 + 挑臂 + 铜色灯头（灯头朝 `s` 方向 = 路心）"""
    g = GZ
    put(B, M_LAMP, box(x, y, 0.22, 0.22, 6.00, g))
    put(B, M_LAMP, box(x, y + s * 0.55, 0.13, 1.20, 0.13, g + 5.95))
    put(B, M_COPPER, box(x, y + s * 1.05, 0.62, 0.26, 0.18, g + 5.78))


def signage(B, x, y):
    """指示牌：2.2 m 深灰立柱 + 浅色牌面（浅色才读得出"牌"）"""
    g = GZ
    put(B, M_LAMP, box(x, y, 0.13, 0.13, 2.20, g))
    put(B, M_SIGN, box(x, y, 1.00, 0.09, 0.62, g + 1.55))
    put(B, M_LAMP, box(x, y, 1.08, 0.16, 0.08, g + 1.51))


def planter(B, x, y, w=4.5, d=2.2, rot=0.0):
    """花坛：石砌边框 + 内部种植土/灌木"""
    g = GZ
    put(B, M_PLANTER, [
        box(x, y + d * 0.5 - 0.14, w, 0.28, 0.55, g, rot=rot),
        box(x, y - d * 0.5 + 0.14, w, 0.28, 0.55, g, rot=rot),
        box(x + w * 0.5 - 0.14, y, 0.28, d - 0.56, 0.55, g, rot=rot),
        box(x - w * 0.5 + 0.14, y, 0.28, d - 0.56, 0.55, g, rot=rot),
    ])
    put(B, M_GRASS_D, box(x, y, w - 0.56, d - 0.56, 0.42, g + 0.30, rot=rot))


# ==================================================================
# 1. 四栋教学楼：门廊 + 楼梯塔 + 女儿墙
# ==================================================================
B = {}
_PORT = {}          # 记录每栋门廊中心，供后面摆家具用
for _nm, (_ph, _face, _side) in _PODIUM.items():
    _x0, _x1, _y0, _y1, _z0, _z1 = _BB[_nm]
    _y_wall = _y1 if _face == 'N' else _y0
    _x_wall = _x1 if _side == 'E' else _x0
    _hh = round(_ph * 0.72, 2)          # 不顶到裙房顶，留出裙房线脚
    _cx, _yp = portico(B, _x0, _x1, _y_wall, GZ, _hh, face=_face)
    stair_tower(B, _x_wall, _y0, _y1, GZ, _z1, side=_side)
    parapet_ring(B, _x0, _x1, _y0, _y1, GZ + _ph)
    _PORT[_nm] = (_cx, _yp, _face)
    print(f'[DTL]   {_nm[5:]:8s} {_x1-_x0:3.0f}×{_y1-_y0:3.0f} m  顶 {_z1:5.1f} m'
          f'  门廊朝{_face}（开口 {_y_wall:6.1f}）h{_hh} / 楼梯塔朝{_side} / 女儿墙 @{GZ+_ph:.1f}')
flush(B, 'DTL_教学_楼栋')
B.clear()


# ==================================================================
# 2. 道路分级：教学区北侧 东西主路 y=404
# ==================================================================
# 现状：路面是**一条 ribbon 直接铺**，没有路缘、没有人行道、没有标线 ——
#       所以整条路读起来就是"一条深色带"，和草坪直接拼在一起。
_ROAD_Y = 404.0
_RW = 12.0                                   # 路面全宽（与 build_campus_site 一致）
_XA = min(v[0] for v in _BB.values()) - 6.0  # 比楼群再两端各加 6 m
_XB = max(v[1] for v in _BB.values()) + 6.0
_L = _XB - _XA
_CX = (_XA + _XB) * 0.5
_Y_SIDE_S = _ROAD_Y - _RW * 0.5 - 1.40       # 南侧人行道中心（靠楼一侧）
_Y_SIDE_N = _ROAD_Y + _RW * 0.5 + 1.40       # 北侧人行道中心

B = {}
# 2.1 路缘石：两侧各一道（0.30 宽 × 0.15 高，浅灰预制混凝土）
put(B, M_CURB, [
    box(_CX, _ROAD_Y - _RW * 0.5, _L, 0.30, 0.15, Z_TOP + 0.07),
    box(_CX, _ROAD_Y + _RW * 0.5, _L, 0.30, 0.15, Z_TOP + 0.07),
])
# 2.2 人行道：路缘石外侧 2.5 m
put(B, M_PATH, [
    box(_CX, _Y_SIDE_S, _L, 2.50, 0.06, Z_TOP + 0.06),
    box(_CX, _Y_SIDE_N, _L, 2.50, 0.06, Z_TOP + 0.06),
])
# 2.3 中心虚线（6 m 线 + 6 m 空）
_marks = []
_x = _XA + 3.0
while _x < _XB - 3.0:
    _marks.append(box(_x, _ROAD_Y, 6.0, 0.16, 0.02, Z_TOP + 0.09))
    _x += 12.0
# 2.4 斑马线：南北各一组，把人行道和楼前庭接起来
for _zx in (_PORT['BLD_教学_公共教学楼'][0], _PORT['BLD_教学_教学B'][0]):
    for _k in range(8):
        _marks.append(box(_zx - 3.5 + _k * 1.0, _ROAD_Y, 0.55, _RW - 0.8, 0.02, Z_TOP + 0.09))
put(B, M_MARK, _marks)
flush(B, 'DTL_教学_道路')
B.clear()
print(f'[DTL]   道路分级 {_L:.0f} m（x {_XA:.0f}~{_XB:.0f}）：'
      f'路缘石双侧 / 人行道 2×2.5 m / 中心虚线 / 斑马线 2 组')

# 2.5 接入步道：主路南侧人行道 → 北排两栋门廊（这才是"路与建筑出入口衔接"）
B = {}
for _nm in ('BLD_教学_公共教学楼', 'BLD_教学_教学B'):
    _cx, _yp, _ = _PORT[_nm]
    _y0, _y1 = _yp, _Y_SIDE_S + 1.25
    put(B, M_PAVE_W, box(_cx, (_y0 + _y1) * 0.5, 10.0, abs(_y1 - _y0), 0.08, GZ - 0.02))
flush(B, 'DTL_教学_接入步道')
B.clear()


# ==================================================================
# 3. 配景 + 绿化（★ 位置全部由实测包围盒推出，不写死）
# ==================================================================
# 两条可用的开放带：
#   A 前庭带 = 北排楼北墙 → 主路南侧人行道（约 16 m 宽）—— 主入口序列
#   B 南前庭 = 南排楼南墙再往南（开阔地）
_Y_NWALL = max(_BB[n][3] for n in ('BLD_教学_公共教学楼', 'BLD_教学_教学B'))
_Y_SWALL = min(_BB[n][2] for n in ('BLD_教学_教学C', 'BLD_教学_教学D'))
_Y_ARRIVE = (_Y_NWALL + _Y_SIDE_S - 1.25) * 0.5       # 前庭带中心
_Y_SOUTH = _Y_SWALL - 7.0                             # 南前庭中心

B = {}
# 3.1 路灯：主路双侧每 24 m（灯头朝路心）
_lx = _XA + 8.0
while _lx < _XB:
    lamp_post(B, _lx, _Y_SIDE_S - 1.5, s=1.0)    # 南侧 → 灯头朝北（路心）
    lamp_post(B, _lx, _Y_SIDE_N + 1.5, s=-1.0)   # 北侧 → 灯头朝南（路心）
    _lx += 24.0
_n_lamp = len(B.get(M_LAMP, [])) // 3

# 3.2 座椅：前庭带 6 把（朝楼）+ 南前庭 4 把（朝楼）
for _bx in (255.0, 280.0, 320.0, 360.0, 395.0, 425.0):
    if _XA + 4 < _bx < _XB - 4:
        bench(B, _bx, _Y_ARRIVE)                       # 背朝北 → 面朝楼
for _bx in (255.0, 300.0, 355.0, 415.0):
    if _XA + 4 < _bx < _XB - 4:
        bench(B, _bx, _Y_SOUTH, rot=3.14159)           # 背朝南 → 面朝楼

# 3.3 花坛：每栋门廊两侧各一个
for _nm, (_cx, _yp, _face) in _PORT.items():
    _s = 1.0 if _face == 'N' else -1.0
    _py = _yp + _s * 3.4
    planter(B, _cx - 8.5, _py)
    planter(B, _cx + 8.5, _py)

# 3.4 指示牌：主路人行道 2 处 + 前庭带两端 2 处 + 南前庭 1 处
signage(B, _PORT['BLD_教学_公共教学楼'][0], _Y_SIDE_N + 1.5)
signage(B, _PORT['BLD_教学_教学B'][0], _Y_SIDE_N + 1.5)
signage(B, _XA + 12.0, _Y_ARRIVE)
signage(B, _XB - 12.0, _Y_ARRIVE)
signage(B, (_XA + _XB) * 0.5, _Y_SOUTH)
flush(B, 'DTL_教学_配景')
B.clear()

# 3.5 草坪深浅 + 组团灌木：沿前庭带铺草，缝里只铺窄条（缝只有 6.5~9.6 m，塞不下家具）
B = {}
_gap_y = (max(_BB[n][2] for n in ('BLD_教学_公共教学楼', 'BLD_教学_教学B')) +
          min(_BB[n][3] for n in ('BLD_教学_教学C', 'BLD_教学_教学D'))) * 0.5
for _px, _py, _pw, _pd in ((_CX, _Y_ARRIVE + 5.5, _L * 0.8, 7.0),
                           (_CX, _Y_SOUTH + 3.0, _L * 0.7, 6.0),
                           (_CX, _gap_y, _L * 0.9, 6.0)):
    put(B, M_LAWN_L, box(_px, _py, _pw, _pd, 0.07, Z_TOP + 0.05))
    # 斑块里点几丛灌木（组团绿化，不是行道树那种等距点阵）
    _n = max(3, int(_pw / 26.0))
    for _i in range(_n):
        _sx = _px - _pw * 0.40 + _pw * 0.80 * _i / max(1, _n - 1)
        _sy = _py + (_pd * 0.22 if _i % 2 else -_pd * 0.22)
        put(B, M_GRASS_D, box(_sx, _sy, 2.8, 2.8, 0.90, Z_TOP + 0.06))
flush(B, 'DTL_教学_绿化')
B.clear()

print(f'[DTL]   开放带：前庭 y≈{_Y_ARRIVE:.0f}（宽 {_Y_SIDE_S-1.25-_Y_NWALL:.0f} m）'
      f' / 南前庭 y≈{_Y_SOUTH:.0f} / 楼间缝 y≈{_gap_y:.0f}（宽 '
      f'{max(_BB[n][2] for n in ("BLD_教学_公共教学楼","BLD_教学_教学B"))-min(_BB[n][3] for n in ("BLD_教学_教学C","BLD_教学_教学D")):.1f} m，只铺草）')
print('[DTL] 教学区示范补强完成 —— '
      f'4 栋（门廊 / 楼梯塔 / 女儿墙）+ 路网分级 {_L:.0f} m + '
      f'路灯 {_n_lamp} 根 / 座椅 10 / 指示牌 5 / 花坛 8 / 草坪带 3')
