# -*- coding: utf-8 -*-
"""
build_tinglan_library.py —— 亭兰图书馆（1936，墨菲设计）程序化建模
================================================================
在 Blender 里执行（通过 blender_bridge.py 送入）。

参考：外部高校「亭兰图书馆」实景照片（references/亭兰图书馆_*.jpg）。
提取到的建筑特征：
  · 二层楼身，坐落在一层通高的朱红色基座上（基座开小方窗）
  · 楼身墙面为灰褐色砖石，窗间设壁柱，窗框为浅色
  · 绿琉璃瓦屋顶：歇山式、出檐很深、四角强烈起翘、正脊与垂脊带脊饰
  · 正面中央出抱厦，山花朝前，山花中央嵌圆形花窗
  · 檐下有一排椽头（露明椽）
  · 入口设柱廊，带独立的小屋顶

坐标约定：
  X = 面宽，Y = 进深，Z = 高度，建筑中心在原点，前立面朝 +Y
  立面上 u = 沿立面坐标，d = 相对外墙面向外为正

几何策略：
  不使用布尔。墙体由洞口周边实体块拼合；
  屋顶用「檐口一圈点 → 正脊」的参数化面片生成，四角起翘由高度函数控制。
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
BAYS = 10                        # 开间数
BAY = 4.60
LEN = BAYS * BAY                 # 46.0
DEP = 18.0
HX, HY = LEN / 2.0, DEP / 2.0

BASE_H = 2.90                    # 朱红基座层
F1_H = 3.60
F2_H = 3.40
WALL_TOP = BASE_H + F1_H + F2_H  # 9.90  檐口底

PIER_W = 0.95                    # 壁柱宽
PIER_OUT = 0.22

WIN_W = 2.05
WIN1_H = 2.25
WIN2_H = 2.05
BASE_WIN_W = 0.95
BASE_WIN_H = 1.05

# 屋顶
ROOF_OV = 1.75                   # 出檐
EAVE_Z = WALL_TOP
RIDGE_Z = WALL_TOP + 4.40
RIDGE_HALF = HX - 4.60           # 正脊半长（歇山收进）
UP_LIFT = 2.35                   # 翼角起翘高度

# 正面中央抱厦
BAY_W = 12.40                    # 抱厦宽
BAY_PROJ = 2.30                  # 前凸
BAY_RIDGE_Z = WALL_TOP + 5.30
BAY_RIDGE_Y = HY + BAY_PROJ + 1.15

# 材质键
M_WALL, M_BASE, M_TRIM = 'Wall', 'Base', 'Trim'
M_TILE, M_GLASS, M_STONE = 'Tile', 'Glass', 'Stone'
M_RIDGE, M_DOOR, M_CEIL = 'Ridge', 'Door', 'Ceil'

# ==================================================================
# 2. 几何累加器
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

    def quad(self, mat, a, b, c, d):
        self._add(mat, [a, b, c, d], [[0, 1, 2, 3]])

    def tri(self, mat, a, b, c):
        self._add(mat, [a, b, c], [[0, 1, 2]])

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

    def beam(self, mat, p0, p1, w, h):
        """沿 p0→p1 的矩形梁：w 为水平宽度，h 为沿面法线的厚度"""
        d = [p1[i] - p0[i] for i in range(3)]
        ln = math.sqrt(sum(c * c for c in d))
        if ln < 1e-9:
            return
        d = [c / ln for c in d]
        up = (0.0, 0.0, 1.0)
        side = [d[1] * up[2] - d[2] * up[1],
                d[2] * up[0] - d[0] * up[2],
                d[0] * up[1] - d[1] * up[0]]
        sn = math.sqrt(sum(c * c for c in side))
        if sn < 1e-6:                       # 竖直梁，换一个参考轴
            side = [1.0, 0.0, 0.0]
            sn = 1.0
        side = [c / sn for c in side]
        nrm = [side[1] * d[2] - side[2] * d[1],
               side[2] * d[0] - side[0] * d[2],
               side[0] * d[1] - side[1] * d[0]]

        v = []
        for base in (p0, p1):
            for su, nu in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                v.append(tuple(base[i] + side[i] * su * w / 2.0 + nrm[i] * nu * h / 2.0
                               for i in range(3)))
        f = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
             [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
        self._add(mat, v, f)

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

WALL_OUT = {'F': HY, 'B': HY, 'L': HX, 'R': HX}
U_SPAN = {'F': LEN, 'B': LEN, 'L': DEP, 'R': DEP}
cur_side = 'F'


def ubox(mat, u0, u1, d0, d1, z0, z1, side=None):
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
# 3. 楼身
# ==================================================================
def build_base_floor():
    """朱红基座层：整圈实墙 + 小方窗"""
    half = U_SPAN[cur_side] / 2.0
    ubox(M_BASE, -half, half, -0.30, 0.0, 0.0, BASE_H)
    # 基座压顶线脚
    ubox(M_STONE, -half, half, -0.30, 0.14, BASE_H - 0.18, BASE_H)

    centers, bay = bay_centers(U_SPAN[cur_side], BAYS if cur_side in 'FB' else 4)
    for u in centers:
        hw = BASE_WIN_W / 2.0
        z0 = 1.30
        z1 = z0 + BASE_WIN_H
        # 掏洞：左右两块 + 洞上下补齐
        ubox(M_BASE, u - bay / 2.0, u - hw, -0.30, 0.02, z0, z1)
        ubox(M_BASE, u + hw, u + bay / 2.0, -0.30, 0.02, z0, z1)
        ubox(M_BASE, u - hw, u + hw, -0.30, 0.02, 0.0, z0)
        ubox(M_BASE, u - hw, u + hw, -0.30, 0.02, z1, BASE_H)
        # 窗与窗框
        uprism(M_GLASS, [(u - hw, z0), (u + hw, z0), (u + hw, z1), (u - hw, z1)],
               -0.26, -0.22)
        t = 0.09
        ubox(M_TRIM, u - hw, u + hw, -0.20, -0.10, z0, z0 + t)
        ubox(M_TRIM, u - hw, u - hw + t, -0.20, -0.10, z0, z1)
        ubox(M_TRIM, u + hw - t, u + hw, -0.20, -0.10, z0, z1)
        ubox(M_TRIM, u - hw, u + hw, -0.20, -0.10, z1 - t, z1)


def build_window(u, z0, w, h, trim=True):
    z1 = z0 + h
    hw = w / 2.0
    uprism(M_GLASS, [(u - hw, z0), (u + hw, z0), (u + hw, z1), (u - hw, z1)],
           -0.30, -0.26)
    t = 0.10
    ubox(M_TRIM, u - hw, u + hw, -0.24, -0.12, z0, z0 + t)
    ubox(M_TRIM, u - hw, u - hw + t, -0.24, -0.12, z0, z1)
    ubox(M_TRIM, u + hw - t, u + hw, -0.24, -0.12, z0, z1)
    ubox(M_TRIM, u - hw, u + hw, -0.24, -0.12, z1 - t, z1)
    ubox(M_TRIM, u - 0.05, u + 0.05, -0.23, -0.13, z0, z1)          # 中挺
    ubox(M_TRIM, u - hw, u + hw, -0.23, -0.13, z0 + h * 0.55, z0 + h * 0.55 + 0.08)
    ubox(M_STONE, u - hw - 0.16, u + hw + 0.16, -0.08, 0.16, z0 - 0.15, z0)  # 窗台


def build_upper_floor(z_floor, h_floor, win_h, n_bays, skip_center=False):
    centers, bay = bay_centers(U_SPAN[cur_side], n_bays)
    z0 = z_floor + 0.85
    z1 = z0 + win_h
    z_top = z_floor + h_floor
    half = bay / 2.0
    for u in centers:
        if skip_center and abs(u) < 1e-6:
            continue
        hw = min(WIN_W, bay - PIER_W - 0.35) / 2.0
        ubox(M_WALL, u - half, u + half, -0.30, 0.0, z_floor, z0)
        ubox(M_WALL, u - half, u + half, -0.30, 0.0, z1, z_top)
        ubox(M_WALL, u - half, u - hw, -0.30, 0.0, z0, z1)
        ubox(M_WALL, u + hw, u + half, -0.30, 0.0, z0, z1)
        build_window(u, z0, hw * 2.0, win_h)
        # 窗上方的浅色石雕匾额（照片里窗间有浅色石板）
        ubox(M_STONE, u - hw - 0.10, u + hw + 0.10, 0.0, 0.05,
             z_floor + 0.18, z0 - 0.22)


def build_pier(u, z0, z1):
    hw = PIER_W / 2.0
    ubox(M_WALL, u - hw, u + hw, -0.30, PIER_OUT, z0, z1)


def build_facade(side, total, n_bays, skip_center=False):
    global cur_side
    cur_side = side
    build_base_floor()
    for u in pier_positions(total, n_bays):
        build_pier(u, BASE_H, WALL_TOP)
    build_upper_floor(BASE_H, F1_H, WIN1_H, n_bays, skip_center)
    build_upper_floor(BASE_H + F1_H, F2_H, WIN2_H, n_bays, skip_center)
    # 檐下额枋
    half = total / 2.0
    ubox(M_WALL, -half, half, -0.30, 0.06, WALL_TOP - 0.55, WALL_TOP)


# ==================================================================
# 4. 屋顶
# ==================================================================
XM = HX + ROOF_OV
YM = HY + ROOF_OV


def eave_z(x, y):
    """四角起翘：只在接近角部时抬起"""
    fx = (abs(x) / XM) ** 3.0
    fy = (abs(y) / YM) ** 3.0
    return EAVE_Z + UP_LIFT * fx * fy


def build_hip_roof():
    """庑殿式屋顶：檐口一圈点 → 正脊，参数化生成"""
    N = 16
    ridge_a = (-RIDGE_HALF, 0.0, RIDGE_Z)
    ridge_b = (RIDGE_HALF, 0.0, RIDGE_Z)

    def ridge_of(x):
        t = (x + XM) / (2.0 * XM)
        return (-RIDGE_HALF + 2.0 * RIDGE_HALF * t, 0.0, RIDGE_Z)

    # 前后两个主坡
    for sy in (1, -1):
        pts_e, pts_r = [], []
        for i in range(N + 1):
            x = -XM + 2.0 * XM * i / N
            pts_e.append((x, sy * YM, eave_z(x, sy * YM)))
            pts_r.append(ridge_of(x))
        for i in range(N):
            B.quad(M_TILE, pts_e[i], pts_e[i + 1], pts_r[i + 1], pts_r[i])

    # 左右两个山面（汇于正脊端点）
    for sx in (1, -1):
        end = ridge_b if sx > 0 else ridge_a
        pts_e = []
        for i in range(N + 1):
            y = -YM + 2.0 * YM * i / N
            pts_e.append((sx * XM, y, eave_z(sx * XM, y)))
        for i in range(N):
            B.tri(M_TILE, pts_e[i], pts_e[i + 1], end)

    # 檐口封边（把屋面厚度做出来）
    for sy in (1, -1):
        for i in range(N):
            x0 = -XM + 2.0 * XM * i / N
            x1 = -XM + 2.0 * XM * (i + 1) / N
            z0 = eave_z(x0, sy * YM)
            z1 = eave_z(x1, sy * YM)
            B.quad(M_RIDGE,
                   (x0, sy * YM, z0), (x1, sy * YM, z1),
                   (x1, sy * YM, z1 - 0.45), (x0, sy * YM, z0 - 0.45))
    for sx in (1, -1):
        for i in range(N):
            y0 = -YM + 2.0 * YM * i / N
            y1 = -YM + 2.0 * YM * (i + 1) / N
            z0 = eave_z(sx * XM, y0)
            z1 = eave_z(sx * XM, y1)
            B.quad(M_RIDGE,
                   (sx * XM, y0, z0), (sx * XM, y1, z1),
                   (sx * XM, y1, z1 - 0.45), (sx * XM, y0, z0 - 0.45))

    # 正脊
    B.beam(M_RIDGE, (-RIDGE_HALF - 0.4, 0, RIDGE_Z + 0.28),
           (RIDGE_HALF + 0.4, 0, RIDGE_Z + 0.28), 0.62, 0.62)
    # 正脊两端的鸱吻
    for sx in (1, -1):
        B.box(M_RIDGE, sx * (RIDGE_HALF + 0.15) - 0.42, sx * (RIDGE_HALF + 0.15) + 0.42,
              -0.42, 0.42, RIDGE_Z + 0.30, RIDGE_Z + 1.25)

    # 四条垂脊：从正脊端点到翼角
    for sx in (1, -1):
        for sy in (1, -1):
            pts = []
            for i in range(9):
                t = i / 8.0
                x = (sx * RIDGE_HALF) * (1 - t) + (sx * XM) * t
                y = 0.0 * (1 - t) + (sy * YM) * t
                z = RIDGE_Z * (1 - t) + eave_z(sx * XM, sy * YM) * t + 0.26
                pts.append((x, y, z))
            for i in range(len(pts) - 1):
                B.beam(M_RIDGE, pts[i], pts[i + 1], 0.42, 0.40)

    # 檐下露明椽（一排小方头）
    for sy in (1, -1):
        for i in range(46):
            x = -XM + 0.35 + (2 * XM - 0.7) * i / 45.0
            z = eave_z(x, sy * YM) - 0.52
            B.box(M_RIDGE, x - 0.09, x + 0.09, sy * (YM - 0.16), sy * YM, z, z + 0.20)


def build_center_bay():
    """正面中央抱厦：前凸体块 + 山花（含圆形花窗）+ 独立屋顶"""
    x0, x1 = -BAY_W / 2.0, BAY_W / 2.0
    y0, y1 = HY - 0.30, HY + BAY_PROJ
    # 抱厦体块
    B.box(M_WALL, x0, x1, y0, y1, BASE_H, WALL_TOP + 0.30)
    B.box(M_BASE, x0, x1, y0, y1, 0.0, BASE_H)
    # 抱厦正面窗
    for u in (-3.4, 0.0, 3.4):
        hw = min(WIN_W, 2.6) / 2.0
        for zf, wh in ((BASE_H, WIN1_H), (BASE_H + F1_H, WIN2_H)):
            z0 = zf + 0.85
            z1 = z0 + wh
            B.box(M_WALL, u - hw, u + hw, y1, y1 - 0.30, zf, z0)
            B.box(M_WALL, u - hw, u + hw, y1, y1 - 0.30, z1, zf + wh + 0.9)
            B.box(M_WALL, u - hw - 0.5, u - hw, y1, y1 - 0.30, z0, z1)
            B.box(M_WALL, u + hw, u + hw + 0.5, y1, y1 - 0.30, z0, z1)
            B.prism_y(M_GLASS, [(u - hw, z0), (u + hw, z0), (u + hw, z1), (u - hw, z1)],
                      y1 - 0.26, y1 - 0.22)
            t = 0.10
            B.box(M_TRIM, u - hw, u + hw, y1 - 0.20, y1 - 0.10, z0, z0 + t)
            B.box(M_TRIM, u - hw, u - hw + t, y1 - 0.20, y1 - 0.10, z0, z1)
            B.box(M_TRIM, u + hw - t, u + hw, y1 - 0.20, y1 - 0.10, z0, z1)
            B.box(M_TRIM, u - hw, u + hw, y1 - 0.20, y1 - 0.10, z1 - t, z1)

    # 抱厦山墙（三角形）+ 圆形花窗
    gw = BAY_W / 2.0
    B.prism_y(M_WALL, [(-gw, WALL_TOP + 0.30), (gw, WALL_TOP + 0.30),
                       (gw, WALL_TOP + 1.05), (0.0, BAY_RIDGE_Z - 0.30),
                       (-gw, WALL_TOP + 1.05)], y0, y1)
    # 山花浅色饰面
    B.prism_y(M_STONE, [(-gw + 0.5, WALL_TOP + 0.45), (gw - 0.5, WALL_TOP + 0.45),
                        (gw - 0.5, WALL_TOP + 1.05), (0.0, BAY_RIDGE_Z - 0.55),
                        (-gw + 0.5, WALL_TOP + 1.05)], y1, y1 + 0.08)
    # 圆形花窗
    R = 1.05
    cz = WALL_TOP + 1.35
    poly = [(R * math.cos(2 * math.pi * i / 24), cz + R * math.sin(2 * math.pi * i / 24))
            for i in range(24)]
    B.prism_y(M_STONE, poly, y1, y1 + 0.10)
    poly2 = [((R - 0.22) * math.cos(2 * math.pi * i / 24),
              cz + (R - 0.22) * math.sin(2 * math.pi * i / 24)) for i in range(24)]
    B.prism_y(M_GLASS, poly2, y1 + 0.04, y1 + 0.09)

    # 抱厦屋顶（前后两坡 + 两山，正脊沿 Y）
    OV = 1.05
    bx = gw + OV
    by0, by1 = y0 - 0.0, y1 + OV
    def bay_eave_z(x, y):
        fx = (abs(x) / bx) ** 3.0
        fy = (abs(y - BAY_RIDGE_Y) / max(by1 - BAY_RIDGE_Y, 0.1)) ** 3.0
        return WALL_TOP + 0.55 + 1.35 * fx * fy

    N = 10
    for sy in (1, -1):
        ey = by1 if sy > 0 else by0
        for i in range(N):
            x0_ = -bx + 2 * bx * i / N
            x1_ = -bx + 2 * bx * (i + 1) / N
            z0_ = bay_eave_z(x0_, ey)
            z1_ = bay_eave_z(x1_, ey)
            B.quad(M_TILE,
                   (x0_, ey, z0_), (x1_, ey, z1_),
                   (x1_, BAY_RIDGE_Y, BAY_RIDGE_Z), (x0_, BAY_RIDGE_Y, BAY_RIDGE_Z))
    for sx in (1, -1):
        ex = sx * bx
        for i in range(N):
            y0_ = by0 + (by1 - by0) * i / N
            y1_ = by0 + (by1 - by0) * (i + 1) / N
            B.tri(M_TILE, (ex, y0_, bay_eave_z(ex, y0_)),
                  (ex, y1_, bay_eave_z(ex, y1_)),
                  (0.0, BAY_RIDGE_Y, BAY_RIDGE_Z))

    # 抱厦正脊 + 脊饰
    B.beam(M_RIDGE, (0, by0 - 0.2, BAY_RIDGE_Z + 0.24),
           (0, by1 + 0.3, BAY_RIDGE_Z + 0.24), 0.52, 0.52)
    for sy in (1, -1):
        yy = (by1 + 0.3) if sy > 0 else (by0 - 0.2)
        B.box(M_RIDGE, -0.36, 0.36, yy - 0.36, yy + 0.36,
              BAY_RIDGE_Z + 0.26, BAY_RIDGE_Z + 1.10)


def build_porch():
    """入口柱廊 + 小屋顶 + 台阶"""
    w = 7.2
    x0, x1 = -w / 2.0, w / 2.0
    y_front = HY + BAY_PROJ
    y0, y1 = y_front, y_front + 2.30
    col_h = 4.20

    # 台基
    B.box(M_STONE, x0 - 0.7, x1 + 0.7, y0 - 0.2, y1 + 0.5, 0.0, 0.55)
    for i in range(3):
        B.box(M_STONE, x0 - 0.7 + i * 0.35, x1 + 0.7 - i * 0.35,
              y1 + 0.5 + i * 0.42, y1 + 0.92 + i * 0.42, 0.0, 0.55 - i * 0.13)

    # 柱（朱红）
    for cx in (x0 + 0.45, x1 - 0.45, x0 + 2.7, x1 - 2.7):
        B.box(M_BASE, cx - 0.24, cx + 0.24, y1 - 0.55, y1 - 0.07, 0.55, 0.55 + col_h)

    # 檐枋
    B.box(M_BASE, x0 - 0.1, x1 + 0.1, y1 - 0.75, y1 + 0.10, 0.55 + col_h, 0.55 + col_h + 0.55)
    # 柱廊顶板 + 小屋顶
    pz = 0.55 + col_h + 0.55
    B.box(M_WALL, x0 - 0.2, x1 + 0.2, y0 - 0.1, y1 + 0.35, pz, pz + 0.18)
    OV = 0.75
    ax0, ax1 = x0 - 0.2 - OV, x1 + 0.2 + OV
    ay0, ay1 = y0 - 0.1 - OV, y1 + 0.35 + OV
    rz = pz + 1.25
    my = (ay0 + ay1) / 2.0
    for sy in (1, -1):
        ey = ay1 if sy > 0 else ay0
        M = 8
        for i in range(M):
            xx0 = ax0 + (ax1 - ax0) * i / M
            xx1 = ax0 + (ax1 - ax0) * (i + 1) / M
            up = 0.55
            zz0 = pz + 0.18 + up * ((abs(xx0 - 0) / ax1) ** 3.0)
            zz1 = pz + 0.18 + up * ((abs(xx1 - 0) / ax1) ** 3.0)
            B.quad(M_TILE, (xx0, ey, zz0), (xx1, ey, zz1),
                   (xx1, my, rz), (xx0, my, rz))
    B.beam(M_RIDGE, (0, ay0, rz + 0.2), (0, ay1, rz + 0.2), 0.40, 0.40)

    # 大门（朱红双扇）
    B.box(M_DOOR, -1.85, 1.85, y_front - 0.16, y_front - 0.04, 0.55, 3.55)
    B.box(M_STONE, -2.05, 2.05, y_front - 0.20, y_front - 0.02, 3.55, 3.95)


# ==================================================================
# 5. 组装
# ==================================================================
build_facade('F', LEN, BAYS, skip_center=True)
build_facade('B', LEN, BAYS)
build_facade('L', DEP, 4)
build_facade('R', DEP, 4)

build_hip_roof()
build_center_bay()
build_porch()

# 室内内芯（让门窗洞口有可见的室内面，而不是穿透成黑洞）
B.box(M_CEIL, -HX + 2.4, HX - 2.4, -HY + 2.4, HY - 2.4, 0.0, WALL_TOP - 0.5)

# ==================================================================
# 6. 材质
# ==================================================================
def principled(mat):
    for n in mat.node_tree.nodes:
        if n.bl_idname == 'ShaderNodeBsdfPrincipled':
            return n
    raise RuntimeError(f'{mat.name} 缺少 Principled BSDF')


def make_material(name, base, rough, metal=0.0, noise_bump=0.0,
                  variation=0.0, vscale=6.0, tile_wave=0.0,
                  emission=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = principled(mat)
    bsdf.inputs['Base Color'].default_value = (*base, 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal

    if variation > 0:
        vn = nt.nodes.new('ShaderNodeTexNoise')
        vn.inputs['Scale'].default_value = vscale
        vn.inputs['Detail'].default_value = 6.0
        vn.inputs['Roughness'].default_value = 0.55
        vn.location = (-900, 300)
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        ramp.location = (-660, 300)
        ramp.color_ramp.elements[0].position = 0.34
        ramp.color_ramp.elements[0].color = (*[max(0.0, c * (1 - variation)) for c in base], 1.0)
        ramp.color_ramp.elements[1].position = 0.70
        ramp.color_ramp.elements[1].color = (*[min(1.0, c * (1 + variation * 0.75)) for c in base], 1.0)
        nt.links.new(vn.outputs['Fac'], ramp.inputs['Fac'])
        nt.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])

    # 琉璃瓦垄：用 Wave Texture 沿 X 做条纹凹凸
    if tile_wave > 0:
        wv = nt.nodes.new('ShaderNodeTexWave')
        wv.wave_type = 'BANDS'
        wv.bands_direction = 'X'
        wv.inputs['Scale'].default_value = 4.6
        wv.inputs['Distortion'].default_value = 0.0
        wv.location = (-900, -80)
        bump = nt.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = tile_wave
        bump.inputs['Distance'].default_value = 0.05
        bump.location = (-400, -80)
        nt.links.new(wv.outputs['Fac'], bump.inputs['Height'])
        nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

    if noise_bump > 0:
        tex = nt.nodes.new('ShaderNodeTexNoise')
        tex.inputs['Scale'].default_value = 26.0
        tex.inputs['Detail'].default_value = 10.0
        tex.inputs['Roughness'].default_value = 0.68
        tex.location = (-900, -320)
        bump2 = nt.nodes.new('ShaderNodeBump')
        bump2.inputs['Strength'].default_value = noise_bump
        bump2.inputs['Distance'].default_value = 0.03
        bump2.location = (-400, -320)
        nt.links.new(tex.outputs['Fac'], bump2.inputs['Height'])
        if tile_wave > 0:
            nt.links.new(bump2.outputs['Normal'], bump.inputs['Normal'])
        else:
            nt.links.new(bump2.outputs['Normal'], bsdf.inputs['Normal'])

    if emission:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1.0)
        bsdf.inputs['Emission Strength'].default_value = emission_strength
    return mat


MATERIALS = {
    M_WALL: make_material('TL_Wall', (0.352, 0.318, 0.268), 0.84,
                          noise_bump=0.50, variation=0.16, vscale=3.2),
    M_BASE: make_material('TL_Base', (0.318, 0.072, 0.048), 0.78,
                          noise_bump=0.35, variation=0.14, vscale=3.0),
    M_TRIM: make_material('TL_Trim', (0.760, 0.735, 0.680), 0.62,
                          noise_bump=0.28, variation=0.06, vscale=5.0),
    M_STONE: make_material('TL_Stone', (0.612, 0.588, 0.535), 0.72,
                           noise_bump=0.42, variation=0.10, vscale=4.0),
    M_TILE: make_material('TL_Tile', (0.045, 0.115, 0.068), 0.24, metal=0.10,
                          tile_wave=0.85, variation=0.18, vscale=2.0),
    M_RIDGE: make_material('TL_Ridge', (0.052, 0.128, 0.076), 0.30, metal=0.08,
                           tile_wave=0.30),
    M_GLASS: make_material('TL_Glass', (0.050, 0.068, 0.086), 0.10, metal=0.20),
    M_DOOR: make_material('TL_Door', (0.290, 0.062, 0.042), 0.66),
    M_CEIL: make_material('TL_Ceil', (0.115, 0.105, 0.092), 0.92),
}

objs = B.to_objects('TL')
for ob in objs:
    key = ob.name.split('_', 1)[1]
    if key in MATERIALS:
        ob.data.materials.append(MATERIALS[key])

# ==================================================================
# 7. 场地
# ==================================================================
gm = bpy.data.meshes.new('Ground')
G = 200.0
gm.from_pydata([(-G, -G, 0), (G, -G, 0), (G, G, 0), (-G, G, 0)], [], [[0, 1, 2, 3]])
gm.validate()
ground = bpy.data.objects.new('Ground', gm)
scene.collection.objects.link(ground)
gmat = bpy.data.materials.new('TL_Ground')
gmat.use_nodes = True
gb = principled(gmat)
gb.inputs['Base Color'].default_value = (0.085, 0.128, 0.058, 1.0)   # 草地
gb.inputs['Roughness'].default_value = 0.95
gm.materials.append(gmat)

pm = bpy.data.meshes.new('Plaza')
px, py, pz = 30.0, 20.0, 0.05
py0 = HY + BAY_PROJ + 3.2
pm.from_pydata([(-px, py0, pz), (px, py0, pz), (px, py0 + py, pz), (-px, py0 + py, pz)],
               [], [[0, 1, 2, 3]])
pm.validate()
plaza = bpy.data.objects.new('Plaza', pm)
scene.collection.objects.link(plaza)
pmat = bpy.data.materials.new('TL_Plaza')
pmat.use_nodes = True
pb = principled(pmat)
pb.inputs['Base Color'].default_value = (0.286, 0.272, 0.248, 1.0)
pb.inputs['Roughness'].default_value = 0.86
pm.materials.append(pmat)

# ==================================================================
# 8. 汇报
# ==================================================================
tris = sum(sum(len(p.vertices) - 2 for p in ob.data.polygons) for ob in objs)
print('=== 亭兰图书馆 建模完成 ===')
print(f'尺寸: 面宽 {LEN:.1f} × 进深 {DEP:.1f} × 檐高 {WALL_TOP:.2f} m；正脊 {RIDGE_Z:.2f} m')
print(f'基座 {BASE_H:.2f} m + 两层 {F1_H:.2f}/{F2_H:.2f} m；开间 {BAYS}×{BAY:.2f} m')
print(f'出檐 {ROOF_OV:.2f} m，四角起翘 {UP_LIFT:.2f} m，正脊半长 {RIDGE_HALF:.2f} m')
print(f'对象: {len(objs)} 个（按材质合并）')
for ob in sorted(objs, key=lambda o: -len(o.data.polygons)):
    print(f'   {ob.name:<16} 面数 {len(ob.data.polygons):>6}')
print(f'三角面合计: {tris}')
