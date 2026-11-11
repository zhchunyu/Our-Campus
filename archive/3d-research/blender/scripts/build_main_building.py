# -*- coding: utf-8 -*-
"""
build_main_building.py —— 教学主楼（1950-60s 民族形式）程序化建模  v2
================================================================
参考：外部高校官网「教学主楼」条目照 + 同语汇的农学楼正面照
      （详见 02-三维资产/references/README.md）

v2 相对 v1 的修正（依据见 02-三维资产/教学主楼_实景核对与修正清单.md）：
  1. 壁柱凹槽：横向梯格 → 竖向凹槽（2 槽 3 棱，贯通柱身）
  2. 柱头：改为三级阶梯退台 + 横向叠涩线脚
  3. 柱身：新增"横槽 + 中央竖槽"的钥匙孔状装饰
  4. 底层中央：拱券 → 凹入式矩形门廊 + 四根束柱
  5. 窗：偏方 → 竖向长窗（高宽比 1.5:1），白色窗框 + 竖中梃 + 上横档
  6. 窗下墙板：改为暖褐色，加凹边框，花饰改为五瓣梅花浮雕
  7. 檐口：三层大出挑 → 白色檐口带 + 齿饰，上加细栏杆
  8. 壁灯：新增橙红球形壁灯（实景主要照明构件）
  9. 材质：整体调暗调灰，贴近灰米色水刷石
 10. 场地：新增沥青路 / 路缘石 / 人行道 / 绿篱 / 乔木 / 远山

坐标约定：
  X = 建筑长边（面宽），Y = 进深，Z = 高度，建筑中心在原点
  前立面朝向 +Y
  立面上 u = 沿立面方向的坐标，d = 相对外墙面的深度（正 = 向外）

几何策略：
  不使用布尔运算。墙体由「洞口周边的实体块」拼合而成；
  拱券的弧形肩部用一圈梯形棱柱精确铺满；法线最后统一重算。
"""

import math

import bmesh
import bpy

# ==================================================================
# 0. 清场
# ==================================================================
for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials,
             bpy.data.lights, bpy.data.cameras, bpy.data.images):
    for item in list(coll):
        coll.remove(item)

scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0

# ==================================================================
# 1. 尺寸参数（米）
# ==================================================================
BAYS = 13                        # 长边开间数
BAY = 4.00                       # 开间模数
LEN = BAYS * BAY                 # 面宽 52.0
DEP = 17.50                      # 进深
END_BAYS = 4                     # 短边开间数
HX, HY = LEN / 2.0, DEP / 2.0

# --- 壁柱（本建筑最强的形体特征）---
PIER_W = 1.45                    # 壁柱总宽
PIER_OUT = 0.42                  # 壁柱相对外墙面的出挑
RIB_W = 0.39                     # 凸棱宽（3 条）
GROOVE_W = 0.14                  # 凹槽宽（2 条） 3*0.39+2*0.14 = 1.45
GROOVE_D = 0.07                  # 凹槽深度
WALL_IN = -0.60                  # 墙体内表面（相对外墙面的深度）

# --- 层高 ---
FLOOR_H = [5.20, 3.75, 3.75, 3.75]
FLOOR_Z = [0.0]
for _h in FLOOR_H:
    FLOOR_Z.append(FLOOR_Z[-1] + _h)
WALL_TOP = FLOOR_Z[-1]           # 16.45

# --- 檐口：齿饰带 → 檐口板 → 女儿墙 → 栏杆 ---
DENTIL_Z0 = WALL_TOP             # 16.45
DENTIL_Z1 = WALL_TOP + 0.50      # 16.95
CORNICE_Z1 = WALL_TOP + 0.90     # 17.35
PARAPET_TOP = WALL_TOP + 1.75    # 18.20
RAIL_TOP = WALL_TOP + 2.40       # 18.85

# --- 窗 ---
WIN_W = 1.72
WIN_H = 2.58
WIN_SILL = 0.86
TRANSOM_RATIO = 0.74             # 上横档位置（占窗高比例）

# --- 底层拱券 ---
ARCH_W = 2.10                    # 净宽
ARCH_SPRING = 3.35               # 起拱高

# --- 中央门廊（凹入式矩形）---
PORCH_W = 3.40                   # 凹口净宽
PORCH_D = 2.20                   # 凹入深度
PORCH_H = 4.70                   # 凹口净高
PORCH_COL_W = 0.32               # 束柱宽
PORCH_COL_OUT = 0.40             # 束柱出挑
PORCH_COLS = (-1.52, -0.52, 0.52, 1.52)

# --- 壁灯 / 灯笼 ---
LAMP_Z = (2.55, 4.35)
LAMP_R = 0.15

# 材质键
M_WALL, M_TRIM, M_PANEL = 'Wall', 'Trim', 'Panel'
M_GLASS, M_DARK, M_STONE = 'Glass', 'Dark', 'Stone'
M_LANTERN, M_ORNAMENT, M_INTERIOR = 'Lantern', 'Ornament', 'Interior'
M_LAMP, M_METAL = 'Lamp', 'Metal'
M_ASPHALT, M_CURB, M_PAVING = 'Asphalt', 'Curb', 'Paving'
M_HEDGE, M_GRASS, M_TRUNK, M_LEAF = 'Hedge', 'Grass', 'Trunk', 'Leaf'
M_HILL = 'Hill'
M_CTX_WALL, M_CTX_ROOF = 'CtxWall', 'CtxRoof'

# ==================================================================
# 2. 几何累加器：按材质合并成少数几个网格
# ==================================================================
class Builder:
    def __init__(self):
        self.slots = {}

    def _add(self, mat, verts, faces):
        vs, fs = self.slots.setdefault(mat, [[], []])
        off = len(vs)
        vs.extend(verts)
        fs.extend([[i + off for i in f] for f in faces])

    def box(self, mat, x0, x1, y0, y1, z0, z1):
        v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
             (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        f = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
             [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
        self._add(mat, v, f)

    def prism_y(self, mat, poly_xz, y0, y1):
        n = len(poly_xz)
        v = [(x, y0, z) for x, z in poly_xz] + [(x, y1, z) for x, z in poly_xz]
        f = [list(range(n)), list(range(2 * n - 1, n - 1, -1))]
        for i in range(n):
            j = (i + 1) % n
            f.append([i, j, n + j, n + i])
        self._add(mat, v, f)

    def prism_x(self, mat, poly_yz, x0, x1):
        n = len(poly_yz)
        v = [(x0, y, z) for y, z in poly_yz] + [(x1, y, z) for y, z in poly_yz]
        f = [list(range(n)), list(range(2 * n - 1, n - 1, -1))]
        for i in range(n):
            j = (i + 1) % n
            f.append([i, j, n + j, n + i])
        self._add(mat, v, f)

    def blob(self, mat, cx, cy, cz, rx, ry, rz, seg=8, ring=5):
        """经纬网格椭球 —— 用于树冠、壁灯球、灯笼"""
        verts, faces = [], []
        for j in range(1, ring):
            phi = math.pi * j / ring
            for i in range(seg):
                th = 2 * math.pi * i / seg
                verts.append((cx + rx * math.sin(phi) * math.cos(th),
                              cy + ry * math.sin(phi) * math.sin(th),
                              cz + rz * math.cos(phi)))
        top, bot = len(verts), len(verts) + 1
        verts.append((cx, cy, cz + rz))
        verts.append((cx, cy, cz - rz))

        def idx(j, i):
            return (j - 1) * seg + (i % seg)

        for j in range(1, ring - 1):
            for i in range(seg):
                faces.append([idx(j, i), idx(j, i + 1), idx(j + 1, i + 1), idx(j + 1, i)])
        for i in range(seg):
            faces.append([top, idx(1, i + 1), idx(1, i)])
            faces.append([bot, idx(ring - 1, i), idx(ring - 1, i + 1)])
        self._add(mat, verts, faces)

    def disc(self, mat, u, z, r, d0, d1, seg=12, side=None):
        """立面上的圆盘（多边形棱柱）"""
        poly = [(u + r * math.cos(2 * math.pi * i / seg),
                 z + r * math.sin(2 * math.pi * i / seg)) for i in range(seg)]
        uprism(mat, poly, d0, d1, side)

    def to_objects(self, prefix):
        made = []
        for mat, (v, f) in self.slots.items():
            if not f:
                continue
            me = bpy.data.meshes.new(f"{prefix}_{mat}")
            me.from_pydata(v, [], f)
            me.validate(verbose=False)
            bm = bmesh.new()
            bm.from_mesh(me)
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            bm.to_mesh(me)
            bm.free()
            ob = bpy.data.objects.new(f"{prefix}_{mat}", me)
            scene.collection.objects.link(ob)
            made.append(ob)
        return made


B = Builder()

# 立面外表面到建筑中心的距离
WALL_OUT = {'F': HY, 'B': HY, 'L': HX, 'R': HX}
# 立面沿 u 轴的总长
U_SPAN = {'F': LEN, 'B': LEN, 'L': DEP, 'R': DEP}

cur_side = 'F'                   # 当前正在生成的立面


def ubox(mat, u0, u1, d0, d1, z0, z1, side=None):
    """立面上放一个块（u 沿立面，d 相对外墙面向外为正）"""
    s = side or cur_side
    o = WALL_OUT[s]
    a, b = o + d0, o + d1
    if s == 'F':
        B.box(mat, u0, u1, a, b, z0, z1)
    elif s == 'B':
        B.box(mat, u0, u1, -b, -a, z0, z1)
    elif s == 'R':
        B.box(mat, a, b, u0, u1, z0, z1)
    else:
        B.box(mat, -b, -a, u0, u1, z0, z1)


def uprism(mat, poly_uz, d0, d1, side=None):
    """立面上的多边形（u,z）沿深度方向拉伸"""
    s = side or cur_side
    o = WALL_OUT[s]
    a, b = o + d0, o + d1
    if s == 'F':
        B.prism_y(mat, poly_uz, a, b)
    elif s == 'B':
        B.prism_y(mat, poly_uz, -b, -a)
    elif s == 'R':
        B.prism_x(mat, poly_uz, a, b)
    else:
        B.prism_x(mat, poly_uz, -b, -a)


def bay_centers(total, n):
    bay = total / n
    return [-(n - 1) * bay / 2.0 + i * bay for i in range(n)], bay


def pier_positions(total, n):
    bay = total / n
    return [-total / 2.0 + i * bay for i in range(n + 1)]


# ==================================================================
# 3. 构件
# ==================================================================
def pier_ribs(u, z0, z1, skip=None, out=PIER_OUT, width=PIER_W):
    """壁柱柱身：3 条竖向凸棱 + 2 条竖向凹槽。
    skip = [(棱序号, z_a, z_b), ...] 用于在指定棱上留出缺口（做钥匙孔装饰）。"""
    if z1 - z0 < 0.02:
        return
    scale = width / PIER_W
    rib = RIB_W * scale
    gap = GROOVE_W * scale
    total = 3 * rib + 2 * gap
    x0 = u - total / 2.0

    for k in range(3):
        a = x0 + k * (rib + gap)
        segs = [(z0, z1)]
        if skip:
            for (kk, za, zb) in skip:
                if kk != k:
                    continue
                new = []
                for (s0, s1) in segs:
                    if zb <= s0 or za >= s1:
                        new.append((s0, s1))
                    else:
                        if s0 < za:
                            new.append((s0, za))
                        if zb < s1:
                            new.append((zb, s1))
                segs = new
        for (s0, s1) in segs:
            ubox(M_WALL, a, a + rib, WALL_IN, out, s0, s1)

    # 凹槽底（凹槽不是通到底的洞，而是有底的浅槽）
    for k in range(2):
        a = x0 + rib + k * (rib + gap)
        ubox(M_WALL, a, a + gap, WALL_IN, out - GROOVE_D, z0, z1)


def build_pier(u, bay, lamps=False):
    """贯通全高的壁柱：柱身 + 钥匙孔装饰 + 三级阶梯退台柱头"""
    hw = PIER_W / 2.0
    z_cap = WALL_TOP - 2.85          # 柱身结束、开始收头
    z_deco = FLOOR_Z[1] + 1.55       # 钥匙孔装饰高度（拱顶之上）

    # --- 柱身（含钥匙孔装饰）---
    deco_h, stub_h = 0.13, 0.45
    skip = [(k, z_deco, z_deco + deco_h) for k in range(3)]
    skip.append((1, z_deco + deco_h, z_deco + deco_h + stub_h))   # 中棱竖槽
    pier_ribs(u, 0.0, z_cap, skip=skip)
    # 横槽底 + 中竖槽底
    ubox(M_WALL, u - hw, u + hw, WALL_IN, PIER_OUT - GROOVE_D, z_deco, z_deco + deco_h)
    rib, gap = RIB_W, GROOVE_W
    ca = u - (3 * rib + 2 * gap) / 2.0 + rib + gap
    ubox(M_WALL, ca, ca + rib, WALL_IN, PIER_OUT - GROOVE_D,
         z_deco + deco_h, z_deco + deco_h + stub_h)

    # --- 柱头：三级阶梯退台，每级之间夹一道横向叠涩线脚 ---
    steps = [
        (z_cap, z_cap + 0.17, PIER_W, PIER_OUT + 0.11),
        (z_cap + 0.17, z_cap + 0.60, PIER_W - 0.30, PIER_OUT + 0.02),
        (z_cap + 0.60, z_cap + 0.77, PIER_W - 0.30, PIER_OUT + 0.13),
        (z_cap + 0.77, z_cap + 1.22, PIER_W - 0.60, PIER_OUT + 0.02),
        (z_cap + 1.22, z_cap + 1.39, PIER_W - 0.60, PIER_OUT + 0.13),
        (z_cap + 1.39, WALL_TOP, PIER_W - 0.88, PIER_OUT - 0.04),
    ]
    for (z0, z1, w, out) in steps:
        ubox(M_WALL, u - w / 2.0, u + w / 2.0, WALL_IN, out, z0, z1)

    if lamps:
        for lz in LAMP_Z:
            build_wall_lamp(u, lz)


def build_wall_lamp(u, z):
    """橙红球形壁灯：深色支架臂 + 乳橙色玻璃球 + 下方小坠"""
    o = PIER_OUT
    arm = 0.30
    # 支架臂（从柱身伸出）
    ubox(M_METAL, u - 0.05, u + 0.05, o, o + arm, z - 0.05, z + 0.05)
    # 灯球（挂在支架末端）
    cx, cy, cz = lamp_world(u, z, o + arm)
    B.blob(M_LAMP, cx, cy, cz, LAMP_R, LAMP_R, LAMP_R, seg=10, ring=6)
    # 灯球下方的深色小坠饰
    ubox(M_METAL, u - 0.06, u + 0.06, o + arm - 0.08, o + arm + 0.08,
         z - LAMP_R - 0.16, z - LAMP_R - 0.04)


def lamp_world(u, z, d):
    """把立面坐标 (u, z, d) 转成世界坐标"""
    o = WALL_OUT[cur_side]
    if cur_side == 'F':
        return u, o + d, z
    if cur_side == 'B':
        return u, -(o + d), z
    if cur_side == 'R':
        return o + d, u, z
    return -(o + d), u, z


def build_window(u, z_floor, w, h, sill):
    """竖向长窗：内凹玻璃 + 白色窗框 + 竖中梃 + 上横档 + 出挑窗台"""
    z0, z1 = z_floor + sill, z_floor + sill + h
    hw = w / 2.0
    t = 0.09

    # 玻璃：内凹 0.30
    uprism(M_GLASS, [(u - hw, z0), (u + hw, z0), (u + hw, z1), (u - hw, z1)],
           -0.34, -0.30)
    # 洞口侧壁（让窗洞有深度，不是贴片）
    ubox(M_WALL, u - hw - 0.06, u - hw, -0.34, 0.0, z0 - 0.05, z1 + 0.05)
    ubox(M_WALL, u + hw, u + hw + 0.06, -0.34, 0.0, z0 - 0.05, z1 + 0.05)
    ubox(M_WALL, u - hw - 0.06, u + hw + 0.06, -0.34, 0.0, z1, z1 + 0.05)
    ubox(M_WALL, u - hw - 0.06, u + hw + 0.06, -0.34, 0.0, z0 - 0.05, z0)
    # 窗框四边
    ubox(M_TRIM, u - hw, u + hw, -0.28, -0.16, z0, z0 + t)
    ubox(M_TRIM, u - hw, u - hw + t, -0.28, -0.16, z0, z1)
    ubox(M_TRIM, u + hw - t, u + hw, -0.28, -0.16, z0, z1)
    ubox(M_TRIM, u - hw, u + hw, -0.28, -0.16, z1 - t, z1)
    # 竖中梃 + 上横档
    ubox(M_TRIM, u - 0.045, u + 0.045, -0.27, -0.17, z0, z1)
    zt = z0 + h * TRANSOM_RATIO
    ubox(M_TRIM, u - hw, u + hw, -0.27, -0.17, zt, zt + 0.075)
    # 窗楣：窗顶上方向外出挑的白色小线脚（实景每扇窗都有）
    ubox(M_TRIM, u - hw - 0.14, u + hw + 0.14, 0.0, 0.13, z1 + 0.01, z1 + 0.15)
    # 窗台：向外出挑
    ubox(M_TRIM, u - hw - 0.16, u + hw + 0.16, -0.08, 0.15, z0 - 0.15, z0)


def build_spandrel(u, z_floor, z_sill, w):
    """窗下墙板：暖褐色板 + 凹边框 + 白色五瓣梅花浮雕"""
    hw = w / 2.0
    pz0, pz1 = z_floor + 0.12, z_sill - 0.10
    if pz1 - pz0 < 0.35:
        return
    # 板底
    ubox(M_PANEL, u - hw - 0.10, u + hw + 0.10, 0.0, 0.05, pz0, pz1)
    # 板面（内缩，形成凹边框）
    ubox(M_PANEL, u - hw + 0.02, u + hw - 0.02, 0.05, 0.085, pz0 + 0.10, pz1 - 0.10)
    # 五瓣梅花：中心 + 5 瓣 + 上下小云纹
    cz = (pz0 + pz1) / 2.0
    pr = 0.092
    B.disc(M_ORNAMENT, u, cz, 0.048, 0.085, 0.124, seg=12)
    for k in range(5):
        a = math.pi / 2.0 + 2 * math.pi * k / 5.0
        B.disc(M_ORNAMENT, u + pr * math.cos(a), cz + pr * math.sin(a),
               0.062, 0.085, 0.118, seg=10)
    for sgn in (1, -1):
        B.disc(M_ORNAMENT, u, cz + sgn * (pr + 0.085), 0.046, 0.085, 0.112, seg=10)


def build_window_floor(z_floor, z_top, bay, n, skip_center):
    """一层标准窗：填墙 + 留洞 + 窗下墙板与花饰"""
    for u in bay_centers(U_SPAN[cur_side], n)[0]:
        if skip_center and abs(u) < 1e-6:
            continue
        w = min(WIN_W, bay - PIER_W - 0.35)
        z0 = z_floor + WIN_SILL
        z1 = z0 + WIN_H
        hw = w / 2.0
        half = bay / 2.0
        # 窗下墙 / 窗上墙 / 两侧墙垛
        ubox(M_WALL, u - half, u + half, WALL_IN, 0.0, z_floor, z0)
        ubox(M_WALL, u - half, u + half, WALL_IN, 0.0, z1, z_top)
        ubox(M_WALL, u - half, u - hw, WALL_IN, 0.0, z0, z1)
        ubox(M_WALL, u + hw, u + half, WALL_IN, 0.0, z0, z1)
        build_window(u, z_floor, w, WIN_H, WIN_SILL)
        build_spandrel(u, z_floor, z0, w)


def arch_spandrel(u, r, spring, apex):
    """拱与拱顶水平线之间的弧形肩部：一圈梯形棱柱精确铺满"""
    n = 16
    for i in range(n):
        a0, a1 = math.pi * i / n, math.pi * (i + 1) / n
        uprism(M_WALL, [
            (u + r * math.cos(a0), spring + r * math.sin(a0)),
            (u + r * math.cos(a1), spring + r * math.sin(a1)),
            (u + r * math.cos(a1), apex),
            (u + r * math.cos(a0), apex),
        ], WALL_IN, 0.0)


def arch_ring(u, r, spring, t):
    """拱券白色券脸"""
    n = 16
    for i in range(n):
        a0, a1 = math.pi * i / n, math.pi * (i + 1) / n
        uprism(M_TRIM, [
            (u + r * math.cos(a0), spring + r * math.sin(a0)),
            (u + (r + t) * math.cos(a0), spring + (r + t) * math.sin(a0)),
            (u + (r + t) * math.cos(a1), spring + (r + t) * math.sin(a1)),
            (u + r * math.cos(a1), spring + r * math.sin(a1)),
        ], WALL_IN, 0.05)


def build_arch_bay(u, bay, w, spring, z_top, ring_t=0.10):
    """一个底层拱券开间"""
    hw = w / 2.0
    apex = spring + hw
    half = bay / 2.0
    ubox(M_WALL, u - half, u - hw, WALL_IN, 0.0, 0.0, apex)
    ubox(M_WALL, u + hw, u + half, WALL_IN, 0.0, 0.0, apex)
    ubox(M_WALL, u - half, u + half, WALL_IN, 0.0, apex, z_top)
    arch_spandrel(u, hw, spring, apex)
    arch_ring(u, hw, spring, ring_t)
    # 拱洞内凹 0.55 m 处的深色玻璃门窗。
    # 实景里拱券后面是门窗而不是空腔；不这么做，拱券会渲染成一个纯黑洞。
    ubox(M_GLASS, u - hw + 0.14, u + hw - 0.14, -0.58, -0.52,
         0.06, apex - 0.34)
    ubox(M_TRIM, u - hw + 0.10, u + hw - 0.10, -0.60, -0.48, 0.06, 0.22)
    ubox(M_TRIM, u - hw + 0.10, u - hw + 0.22, -0.60, -0.48, 0.06, apex - 0.34)
    ubox(M_TRIM, u + hw - 0.22, u + hw - 0.10, -0.60, -0.48, 0.06, apex - 0.34)
    ubox(M_TRIM, u - hw + 0.10, u + hw - 0.10, -0.60, -0.48,
         apex - 0.46, apex - 0.34)
    ubox(M_TRIM, u - 0.05, u + 0.05, -0.59, -0.49, 0.06, apex - 0.34)
    return apex


def build_porch(u, bay, z_top):
    """中央凹入式矩形门廊：四根束柱 + 深凹口 + 玻璃门"""
    half = bay / 2.0
    hw = PORCH_W / 2.0

    # 凹口两侧墙垛
    ubox(M_WALL, u - half, u - hw, WALL_IN, 0.0, 0.0, PORCH_H)
    ubox(M_WALL, u + hw, u + half, WALL_IN, 0.0, 0.0, PORCH_H)
    # 凹口上方墙
    ubox(M_WALL, u - half, u + half, WALL_IN, 0.0, PORCH_H, z_top)
    # 凹口顶棚 / 侧壁 / 后墙
    ubox(M_WALL, u - hw, u + hw, -PORCH_D, 0.0, PORCH_H, PORCH_H + 0.35)
    ubox(M_WALL, u - hw - 0.22, u - hw, -PORCH_D, 0.0, 0.0, PORCH_H + 0.35)
    ubox(M_WALL, u + hw, u + hw + 0.22, -PORCH_D, 0.0, 0.0, PORCH_H + 0.35)
    ubox(M_WALL, u - hw, u + hw, -PORCH_D - 0.22, -PORCH_D, 0.0, PORCH_H + 0.35)

    # 凹口内玻璃门（贴在门廊后墙的朝外表面上，不能嵌进墙里）
    ubox(M_GLASS, u - hw + 0.18, u + hw - 0.18, -PORCH_D, -PORCH_D + 0.06,
         0.05, 3.15)
    for k in range(-1, 2):
        ubox(M_TRIM, u + k * 1.00 - 0.05, u + k * 1.00 + 0.05,
             -PORCH_D - 0.01, -PORCH_D + 0.09, 0.05, 3.15)
    ubox(M_TRIM, u - hw + 0.14, u + hw - 0.14, -PORCH_D - 0.01, -PORCH_D + 0.09,
         3.15, 3.28)

    # 四根束柱（柱身 3 棱 + 小阶梯收头）
    for cu in PORCH_COLS:
        a = u + cu - PORCH_COL_W / 2.0
        rib = 0.085
        for k in range(3):
            ubox(M_WALL, a + k * 0.123, a + k * 0.123 + rib, WALL_IN,
                 PORCH_COL_OUT, 0.0, PORCH_H - 0.55)
        for k in range(2):
            ubox(M_WALL, a + rib + k * 0.123, a + rib + k * 0.123 + 0.038,
                 WALL_IN, PORCH_COL_OUT - 0.055, 0.0, PORCH_H - 0.55)
        # 小阶梯收头
        ubox(M_WALL, a - 0.045, a + PORCH_COL_W + 0.045, WALL_IN,
             PORCH_COL_OUT + 0.06, PORCH_H - 0.55, PORCH_H - 0.38)
        ubox(M_WALL, a + 0.045, a + PORCH_COL_W - 0.045, WALL_IN,
             PORCH_COL_OUT, PORCH_H - 0.38, PORCH_H - 0.14)
        ubox(M_WALL, a + 0.105, a + PORCH_COL_W - 0.105, WALL_IN,
             PORCH_COL_OUT + 0.04, PORCH_H - 0.14, PORCH_H)

    # 入口台阶
    for i in range(4):
        ubox(M_STONE, u - hw - 1.30 + i * 0.10, u + hw + 1.30 - i * 0.10,
             0.10 + i * 0.34, 1.95 - i * 0.34, 0.0, 0.10 + i * 0.13)


def build_cornice():
    """齿饰带 + 白色檐口板 + 女儿墙 + 细栏杆"""
    half = U_SPAN[cur_side] / 2.0
    # 齿饰带（一排小方块）
    ubox(M_WALL, -half, half, WALL_IN, 0.16, DENTIL_Z0, DENTIL_Z1)
    n = max(6, int(U_SPAN[cur_side] / 0.52))
    step = U_SPAN[cur_side] / n
    for i in range(n):
        a = -half + i * step
        ubox(M_TRIM, a + 0.07, a + step - 0.07, 0.16, 0.34,
             DENTIL_Z0 + 0.07, DENTIL_Z1 - 0.03)
    # 檐口板
    ubox(M_TRIM, -half, half, WALL_IN, 0.62, DENTIL_Z1, CORNICE_Z1)
    # 女儿墙
    ubox(M_WALL, -half, half, WALL_IN, 0.20, CORNICE_Z1, PARAPET_TOP)
    # 细栏杆：立柱 + 上下横杆
    ubox(M_METAL, -half, half, 0.06, 0.14, PARAPET_TOP, PARAPET_TOP + 0.07)
    ubox(M_METAL, -half, half, 0.06, 0.14, RAIL_TOP - 0.07, RAIL_TOP)
    m = max(8, int(U_SPAN[cur_side] / 1.30))
    st = U_SPAN[cur_side] / m
    for i in range(m + 1):
        a = -half + i * st
        ubox(M_METAL, a - 0.025, a + 0.025, 0.06, 0.14,
             PARAPET_TOP, RAIL_TOP)


def build_base():
    """石材勒脚"""
    half = U_SPAN[cur_side] / 2.0
    ubox(M_STONE, -half, half, WALL_IN, 0.16, 0.0, 0.62)


def build_lantern(u, z, r=0.36):
    """朱红灯笼（节日装饰）：扁球 + 金色顶盖底盖"""
    cx, cy, cz = lamp_world(u, z, 0.66)
    # 灯身（略扁）
    B.blob(M_LANTERN, cx, cy, cz, r, r, r * 0.86, seg=12, ring=7)
    # 顶盖 / 底盖（d 是相对外墙面的深度，灯笼中心在 d = 0.66）
    ubox(M_ORNAMENT, u - 0.13, u + 0.13, 0.53, 0.79,
         z + r * 0.80, z + r * 0.98)
    ubox(M_ORNAMENT, u - 0.11, u + 0.11, 0.55, 0.77,
         z - r * 0.98, z - r * 0.80)


# ==================================================================
# 4. 组装
# ==================================================================
def build_facade(side, total, n_bays, with_porch=False, lamps=False, lanterns=False):
    global cur_side
    cur_side = side
    centers, bay = bay_centers(total, n_bays)

    for u in pier_positions(total, n_bays):
        build_pier(u, bay, lamps=lamps)

    # 底层：拱券（中央为门廊）
    z_top = FLOOR_Z[1]
    for u in centers:
        if with_porch and abs(u) < 1e-6:
            build_porch(u, bay, z_top)
        else:
            w = min(ARCH_W, bay - PIER_W - 0.30)
            build_arch_bay(u, bay, w, ARCH_SPRING, z_top)

    # 二至四层：门廊只占底层，上层这一开间必须照常开窗
    for fi in range(1, len(FLOOR_H)):
        build_window_floor(FLOOR_Z[fi], FLOOR_Z[fi + 1], bay, n_bays, False)

    build_cornice()
    build_base()

    if lanterns:
        for u in centers:
            if abs((u + 4.0) % 8.0) < 1e-6:
                build_lantern(u, 6.30)


build_facade('F', LEN, BAYS, with_porch=True, lamps=True, lanterns=True)
build_facade('B', LEN, BAYS)
build_facade('L', DEP, END_BAYS)
build_facade('R', DEP, END_BAYS)

# 屋面
B.box(M_STONE, -HX + 0.25, HX - 0.25, -HY + 0.25, HY - 0.25,
      WALL_TOP - 0.25, WALL_TOP + 0.02)

# 室内内芯：任何洞口透过去都能看到有光照的室内面，而不是穿透到对面背面
INSET = 3.0
B.box(M_INTERIOR, -HX + INSET, HX - INSET, -HY + INSET, HY - INSET,
      0.0, WALL_TOP - 0.40)

# ==================================================================
# 5. 材质
# ==================================================================
def principled(mat):
    """取材质的原理化 BSDF 节点。
    注意：中文界面下节点显示名会被本地化（"原理化 BSDF"），
    所以必须按 bl_idname 查找，不能按名字。"""
    for n in mat.node_tree.nodes:
        if n.bl_idname == 'ShaderNodeBsdfPrincipled':
            return n
    raise RuntimeError(f'{mat.name} 里找不到 Principled BSDF 节点')


def make_material(name, base, rough, metal=0.0, noise_bump=0.0,
                  emission=None, emission_strength=0.0,
                  variation=0.0, vscale=6.0, stripe=0.0, bump_scale=30.0):
    """variation > 0 时用大尺度噪声做风化色差，避免整面墙一块均匀色
    —— 这是"白模感"的主要来源。
    stripe > 0 时叠加竖向条纹，模拟水刷石拉毛的竖向肌理。"""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = principled(mat)
    bsdf.inputs['Base Color'].default_value = (*base, 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal

    color_src = None

    # --- 大尺度风化色差 ---
    if variation > 0:
        vnoise = nt.nodes.new('ShaderNodeTexNoise')
        vnoise.inputs['Scale'].default_value = vscale
        vnoise.inputs['Detail'].default_value = 6.0
        vnoise.inputs['Roughness'].default_value = 0.55
        vnoise.location = (-820, 260)

        ramp = nt.nodes.new('ShaderNodeValToRGB')
        ramp.location = (-600, 260)
        dark = tuple(max(0.0, c * (1.0 - variation)) for c in base)
        light = tuple(min(1.0, c * (1.0 + variation * 0.75)) for c in base)
        ramp.color_ramp.elements[0].position = 0.34
        ramp.color_ramp.elements[0].color = (*dark, 1.0)
        ramp.color_ramp.elements[1].position = 0.70
        ramp.color_ramp.elements[1].color = (*light, 1.0)
        nt.links.new(vnoise.outputs['Fac'], ramp.inputs['Fac'])
        color_src = ramp.outputs['Color']

    if color_src is not None:
        nt.links.new(color_src, bsdf.inputs['Base Color'])

    # --- 法线：先叠竖向拉毛条纹，再叠细颗粒 ---
    normal_src = None

    if stripe > 0:
        # 竖向水刷石拉毛：把噪声在 u 方向极度拉伸，得到竖向条纹。
        # 频率按"米"算：x 方向 1/(12*1.0) ≈ 0.083 m 一条，接近实景拉毛间距。
        tc = nt.nodes.new('ShaderNodeTexCoord')
        tc.location = (-1240, -120)
        mapping = nt.nodes.new('ShaderNodeMapping')
        mapping.inputs['Scale'].default_value = (12.0, 0.30, 1.0)
        mapping.location = (-1050, -120)
        nt.links.new(tc.outputs['Object'], mapping.inputs['Vector'])

        snoise = nt.nodes.new('ShaderNodeTexNoise')
        snoise.inputs['Scale'].default_value = 1.0
        snoise.inputs['Detail'].default_value = 3.0
        snoise.location = (-850, -120)
        nt.links.new(mapping.outputs['Vector'], snoise.inputs['Vector'])

        sbump = nt.nodes.new('ShaderNodeBump')
        sbump.inputs['Strength'].default_value = stripe
        sbump.inputs['Distance'].default_value = 0.02
        sbump.location = (-620, -120)
        nt.links.new(snoise.outputs['Fac'], sbump.inputs['Height'])
        normal_src = sbump.outputs['Normal']

    if noise_bump > 0:
        tex = nt.nodes.new('ShaderNodeTexNoise')
        tex.inputs['Scale'].default_value = bump_scale
        tex.inputs['Detail'].default_value = 10.0
        tex.inputs['Roughness'].default_value = 0.68
        tex.location = (-620, -300)

        bump = nt.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = noise_bump
        bump.inputs['Distance'].default_value = 0.03
        bump.location = (-320, -240)
        nt.links.new(tex.outputs['Fac'], bump.inputs['Height'])
        if normal_src is not None:
            nt.links.new(normal_src, bump.inputs['Normal'])
        nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

        rmap = nt.nodes.new('ShaderNodeMapRange')
        rmap.inputs['From Min'].default_value = 0.0
        rmap.inputs['From Max'].default_value = 1.0
        rmap.inputs['To Min'].default_value = max(0.0, rough - 0.10)
        rmap.inputs['To Max'].default_value = min(1.0, rough + 0.10)
        rmap.location = (-320, 100)
        nt.links.new(tex.outputs['Fac'], rmap.inputs['Value'])
        nt.links.new(rmap.outputs['Result'], bsdf.inputs['Roughness'])
    elif normal_src is not None:
        nt.links.new(normal_src, bsdf.inputs['Normal'])

    if emission:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1.0)
        bsdf.inputs['Emission Strength'].default_value = emission_strength
    return mat


# 基色依据实景照片取样后整体压暗（照片在强光下偏亮，材质基色需取漫反射本色）
MATERIALS = {
    M_WALL: make_material('MB_Wall', (0.386, 0.364, 0.310), 0.86,
                          noise_bump=0.50, variation=0.20, vscale=1.6,
                          stripe=0.26),
    M_TRIM: make_material('MB_Trim', (0.676, 0.664, 0.630), 0.62,
                          noise_bump=0.28, variation=0.08, vscale=2.5),
    M_PANEL: make_material('MB_Panel', (0.374, 0.248, 0.148), 0.78,
                           noise_bump=0.42, variation=0.18, vscale=3.0),
    M_GLASS: make_material('MB_Glass', (0.036, 0.052, 0.068), 0.16, metal=0.10),
    M_DARK: make_material('MB_Dark', (0.058, 0.055, 0.050), 0.90),
    M_STONE: make_material('MB_Stone', (0.272, 0.260, 0.236), 0.88,
                           noise_bump=0.55, variation=0.16, vscale=3.0),
    M_ORNAMENT: make_material('MB_Ornament', (0.740, 0.735, 0.712), 0.52),
    M_INTERIOR: make_material('MB_Interior', (0.190, 0.184, 0.172), 0.90,
                              noise_bump=0.20, variation=0.10, vscale=2.5),
    M_METAL: make_material('MB_Metal', (0.075, 0.078, 0.082), 0.42, metal=0.75),
    # 橙红球形壁灯：实景中是最显眼的暖色点，但白天不发光，只微微自亮
    M_LAMP: make_material('MB_Lamp', (0.560, 0.150, 0.055), 0.30,
                          emission=(0.56, 0.16, 0.06), emission_strength=0.45),
    # 朱红灯笼：节日装饰
    M_LANTERN: make_material('MB_Lantern', (0.420, 0.032, 0.040), 0.44,
                             emission=(0.52, 0.05, 0.04), emission_strength=0.60),
    # --- 场地 ---
    M_ASPHALT: make_material('MB_Asphalt', (0.056, 0.057, 0.060), 0.92,
                             noise_bump=0.35, variation=0.10, vscale=22.0),
    M_CURB: make_material('MB_Curb', (0.330, 0.322, 0.304), 0.80,
                          noise_bump=0.35, variation=0.12, vscale=8.0),
    M_PAVING: make_material('MB_Paving', (0.212, 0.206, 0.194), 0.86,
                            noise_bump=0.45, variation=0.16, vscale=14.0),
    M_HEDGE: make_material('MB_Hedge', (0.026, 0.062, 0.028), 0.92,
                           noise_bump=0.75, variation=0.22, vscale=3.2,
                           bump_scale=3.0),
    # 大地面：vscale / bump_scale 必须按"米"量级给，否则 1.4 km 的平面上
    # 噪声频率高到看不见，渲染出来就是一块死板的纯色。
    M_GRASS: make_material('MB_Grass', (0.052, 0.086, 0.034), 0.94,
                           noise_bump=0.45, variation=0.30, vscale=0.16,
                           bump_scale=0.35),
    M_TRUNK: make_material('MB_Trunk', (0.078, 0.066, 0.054), 0.94,
                           noise_bump=0.85, variation=0.20, vscale=9.0),
    # 树冠：实景照片里乔木是深绿、低饱和的浓密树冠，不能用鲜绿
    M_LEAF: make_material('MB_Leaf', (0.026, 0.056, 0.023), 0.92,
                          noise_bump=0.85, variation=0.26, vscale=7.0),
    # 远山：基色取偏蓝灰，配合天空照明自然产生空气透视
    M_HILL: make_material('MB_Hill', (0.300, 0.355, 0.400), 0.98,
                          variation=0.10, vscale=1.5),
    # 校园背景建筑（只做体块，不参与近景细节）
    M_CTX_WALL: make_material('MB_CtxWall', (0.470, 0.462, 0.442), 0.88,
                              noise_bump=0.30, variation=0.16, vscale=0.6),
    M_CTX_ROOF: make_material('MB_CtxRoof', (0.300, 0.296, 0.288), 0.90,
                              variation=0.14, vscale=0.8),
}

objs = B.to_objects('MB')
for ob in objs:
    key = ob.name.split('_', 1)[1]
    if key in MATERIALS:
        ob.data.materials.append(MATERIALS[key])
    if key in (M_GLASS, M_LANTERN, M_LAMP, M_LEAF, M_HILL):
        for p in ob.data.polygons:
            p.use_smooth = True

# ==================================================================
# 6. 场地：地面 / 道路 / 绿篱 / 乔木 / 远山
# ==================================================================
G = 700.0


class Rng:
    """确定性伪随机（保证每次重建结果一致）"""

    def __init__(self, seed=20260919):
        self.s = seed & 0x7fffffff

    def next(self):
        self.s = (1103515245 * self.s + 12345) & 0x7fffffff
        return self.s / 0x7fffffff

    def uni(self, a, b):
        return a + (b - a) * self.next()


rng = Rng()


def flat(mat, x0, x1, y0, y1, z):
    gm = bpy.data.meshes.new('Tmp')
    gm.from_pydata([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)],
                   [], [[0, 1, 2, 3]])
    gm.validate()
    ob = bpy.data.objects.new('Tmp', gm)
    scene.collection.objects.link(ob)
    ob.data.materials.append(MATERIALS[mat])
    return ob


site = []

# 草坪大地面
site.append(flat(M_GRASS, -G, G, -G, G, 0.0))

# 建筑前场地分层：绿篱带 → 人行道 → 路缘石 → 沥青路 → 对面人行道
y_hedge0 = HY + 1.30
y_hedge1 = y_hedge0 + 1.30
y_walk1 = y_hedge1 + 3.20
y_road0 = y_walk1 + 0.28
y_road1 = y_road0 + 7.60
y_walk2 = y_road1 + 0.28

site.append(flat(M_PAVING, -70.0, 70.0, y_hedge0 - 0.90, y_walk1, 0.03))
site.append(flat(M_CURB, -70.0, 70.0, y_walk1, y_road0, 0.15))
site.append(flat(M_ASPHALT, -90.0, 90.0, y_road0, y_road1, 0.02))
site.append(flat(M_CURB, -90.0, 90.0, y_road1, y_walk2, 0.15))
site.append(flat(M_PAVING, -90.0, 90.0, y_walk2, y_walk2 + 3.20, 0.03))
# 近侧（相机所在侧）再铺一条步道带 + 绿篱，避免前景是一整片空草坪
site.append(flat(M_PAVING, -110.0, 110.0, y_walk2 + 7.60, y_walk2 + 12.40, 0.03))
site.append(flat(M_CURB, -110.0, 110.0, y_walk2 + 7.30, y_walk2 + 7.60, 0.15))
site.append(flat(M_CURB, -110.0, 110.0, y_walk2 + 12.40, y_walk2 + 12.70, 0.15))

# 建筑两侧与后侧的散水/便道
site.append(flat(M_PAVING, -HX - 4.0, HX + 4.0, -HY - 3.4, -HY - 0.6, 0.03))
site.append(flat(M_PAVING, -HX - 3.4, -HX - 0.6, -HY - 3.4, HY + 1.3, 0.03))
site.append(flat(M_PAVING, HX + 0.6, HX + 3.4, -HY - 3.4, HY + 1.3, 0.03))

# --- 绿篱（规整修剪的方盒子，入口留通道）---
hb = Builder()


def hedge(x0, x1, y0, y1, z0, z1):
    hb.box(M_HEDGE, x0, x1, y0, y1, z0, z1)


for (a, b) in ((-70.0, -5.2), (5.2, 70.0)):
    hedge(a, b, y_hedge0, y_hedge1, 0.0, 0.80)
# 入口两侧加高绿篱球
for sx in (-1, 1):
    hb.blob(M_HEDGE, sx * 4.2, y_hedge0 + 0.65, 1.05, 1.15, 1.15, 1.05,
            seg=10, ring=6)
# 对面人行道外侧绿篱
hedge(-90.0, 90.0, y_walk2 + 3.20, y_walk2 + 4.00, 0.0, 0.75)
# 近侧步道两侧绿篱
hedge(-110.0, 110.0, y_walk2 + 6.60, y_walk2 + 7.30, 0.0, 0.70)
hedge(-110.0, 110.0, y_walk2 + 12.70, y_walk2 + 13.40, 0.0, 0.70)

# --- 乔木：树干 + 树冠簇 ---
def tree(tx, ty, th, tr):
    """一棵树：八边形锥形树干 + 3~4 个椭球树冠。
    实景照片里校园乔木高大浓密（毛白杨 / 槐树），冠幅大、树干细，
    所以树干半径取冠幅的 7.5%，树冠底约在 62% 树高处。"""
    trunk_r = max(0.12, tr * 0.055)
    n = 8
    base = [(tx + trunk_r * math.cos(2 * math.pi * i / n),
             ty + trunk_r * math.sin(2 * math.pi * i / n)) for i in range(n)]
    top = [(tx + (x - tx) * 0.70, ty + (y - ty) * 0.70) for (x, y) in base]
    verts = [(x, y, 0.0) for (x, y) in base] + [(x, y, th * 0.64) for (x, y) in top]
    faces = [[i for i in range(n)], [2 * n - 1 - i for i in range(n)]]
    faces += [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    hb._add(M_TRUNK, verts, faces)

    # 树冠：用 6~8 个较小的椭球堆成不规则冠丛。
    # 早期版本用 3~4 个大球，渲染出来是一串"绿气球"；
    # 拆小拆多之后轮廓才有乔木的蓬松感。
    nb = 6 if rng.next() < 0.5 else 8
    for k in range(nb):
        a = 2 * math.pi * k / nb + rng.uni(-0.45, 0.45)
        rad = tr * rng.uni(0.30, 0.62)
        rr = tr * rng.uni(0.40, 0.64)
        hb.blob(M_LEAF, tx + math.cos(a) * rad, ty + math.sin(a) * rad,
                th * rng.uni(0.60, 0.94), rr, rr, rr * 0.80, seg=7, ring=5)
    # 冠顶
    hb.blob(M_LEAF, tx, ty, th * 0.90, tr * 0.70, tr * 0.70, tr * 0.50,
            seg=8, ring=5)


TREES = (
    # 框景树：必须放在建筑体量之外（左前方 / 右后方），
    # 早期版本把行道树排在建筑正前方，从 3/4 视角看整栋楼全被树冠挡住。
    [(x, y, rng.uni(13.0, 16.5), rng.uni(2.6, 3.2))
     for (x, y) in ((-22.0, 26.0), (-34.0, 21.0), (-46.0, 30.0),
                    (40.0, 6.0), (46.0, 17.0))]
    # 建筑两端（贴着山墙，不遮挡正面）
    + [(x, y, rng.uni(12.0, 15.0), rng.uni(2.4, 3.0))
       for (x, y) in ((-34.0, -6.0), (-40.0, 4.0), (34.0, -6.0), (40.0, 4.0))]
    # 建筑背后的林冠（会从屋顶后面冒出来，是校园"树海"的主要读感来源）
    + [(rng.uni(-170, 170), rng.uni(-160, -32), rng.uni(10.0, 16.0), rng.uni(2.8, 4.2))
       for _ in range(46)]
    # 两翼远处林冠
    + [(sx * rng.uni(74, 300), rng.uni(-150, 150), rng.uni(9.0, 15.0), rng.uni(2.8, 4.2))
       for sx in (-1, 1) for _ in range(24)]
    # 远景背景林
    + [(rng.uni(-340, 340), rng.uni(100, 340), rng.uni(9.0, 15.0), rng.uni(2.8, 4.2))
       for _ in range(34)]
)
for (tx, ty, th, tr) in TREES:
    tree(tx, ty, th, tr)

hedge_objs = hb.to_objects('MB')
for ob in hedge_objs:
    ob.data.materials.append(MATERIALS[ob.name.split('_', 1)[1]])
    if ob.name.endswith(M_LEAF):
        for p in ob.data.polygons:
            p.use_smooth = True

# --- 校园背景建筑群 ---
# 航拍照片里校园是由大量 3~6 层条状楼 + 树冠交织而成的；
# 只放树会让中景显得空旷，用简化体块补上这个层次。
cb = Builder()
for _ in range(30):
    bx = rng.uni(-340.0, 340.0)
    by = rng.uni(-330.0, 330.0)
    if math.hypot(bx, by) < 118.0:             # 给主楼及其场地留空
        continue
    bl = rng.uni(26.0, 58.0)
    bd = rng.uni(11.0, 17.0)
    bh = rng.uni(11.0, 20.0)
    cb.box(M_CTX_WALL, bx - bl / 2, bx + bl / 2, by - bd / 2, by + bd / 2, 0.0, bh)
    cb.box(M_CTX_ROOF, bx - bl / 2 - 0.5, bx + bl / 2 + 0.5,
           by - bd / 2 - 0.5, by + bd / 2 + 0.5, bh, bh + 0.55)
ctx_objs = cb.to_objects('MB')
for ob in ctx_objs:
    ob.data.materials.append(MATERIALS[ob.name.split('_', 1)[1]])

# --- 远山：环形山脊带 ---
hn = 110
R1, R2, R3 = 470.0, 560.0, 900.0
hv, hf = [], []
for i in range(hn):
    a = 2 * math.pi * i / hn
    h = (22.0
         + 34.0 * (0.5 + 0.5 * math.sin(3.0 * a + 1.20))
         + 20.0 * (0.5 + 0.5 * math.sin(7.0 * a + 0.45))
         + 9.0 * (0.5 + 0.5 * math.sin(13.0 * a + 2.10)))
    ca, sa = math.cos(a), math.sin(a)
    hv.append((R1 * ca, R1 * sa, -1.0))
    hv.append((R2 * ca, R2 * sa, h))
    hv.append((R3 * ca, R3 * sa, h * 1.55 + 18.0))
for i in range(hn):
    j = (i + 1) % hn
    for k in range(2):
        hf.append([i * 3 + k, j * 3 + k, j * 3 + k + 1, i * 3 + k + 1])
hm = bpy.data.meshes.new('MB_HillMesh')
hm.from_pydata(hv, [], hf)
hm.validate()
hm.materials.append(MATERIALS[M_HILL])
hill = bpy.data.objects.new('MB_Hill', hm)
scene.collection.objects.link(hill)

# ==================================================================
# 7. 汇报
# ==================================================================
tris = sum(sum(len(p.vertices) - 2 for p in ob.data.polygons) for ob in objs)
print('=== 教学主楼 v2 建模完成 ===')
print(f'尺寸: 面宽 {LEN:.1f} × 进深 {DEP:.1f} × 檐高 {WALL_TOP:.2f} m'
      f'（含女儿墙 {PARAPET_TOP:.2f} m / 栏杆 {RAIL_TOP:.2f} m）')
print(f'开间: 长边 {BAYS}×{BAY:.2f} m，短边 {END_BAYS}×{DEP / END_BAYS:.2f} m；层数 {len(FLOOR_H)}')
print(f'壁柱: 宽 {PIER_W:.2f} m，出挑 {PIER_OUT:.2f} m，竖向凹槽 {GROOVE_W:.2f}×{GROOVE_D:.2f} m')
print(f'建筑对象: {len(objs)} 个（按材质合并），三角面 {tris}')
for ob in sorted(objs, key=lambda o: -len(o.data.polygons)):
    print(f'   {ob.name:<16} 面数 {len(ob.data.polygons):>6}')
st = (sum(len(o.data.polygons) for o in site)
      + sum(len(o.data.polygons) for o in hedge_objs)
      + sum(len(o.data.polygons) for o in ctx_objs)
      + len(hm.polygons))
print(f'场地对象: {len(site) + len(hedge_objs) + len(ctx_objs) + 1} 个，面数 {st}')
print(f'合计面数约 {tris + st}')
