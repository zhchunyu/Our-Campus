# -*- coding: utf-8 -*-
"""
build_main_building.py —— 教学主楼（民国风格）程序化建模
================================================================
在 Blender 里执行（通过 blender_bridge.py 送入）。

参考：外部高校「教学主楼」实景照片。提取到的建筑特征：
  · 民国官式风格，灰米色水泥/石材墙面
  · 竖向壁柱贯通全高，柱顶阶梯状收头，柱身有横向凹槽（梯格纹）
  · 壁柱之间为凹进的窗间墙，窗下墙板为米黄色，板面有白色花饰
  · 顶部三层白色檐口，逐层出挑，上接女儿墙
  · 底层为连续拱券门洞，中央为主入口
  · 立面悬挂红灯笼

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
DEP = 17.0                       # 进深
END_BAYS = 4                     # 短边开间数
HX, HY = LEN / 2.0, DEP / 2.0

PIER_W = 1.30                    # 壁柱宽
PIER_OUT = 0.45                  # 壁柱出挑
WALL_IN = -0.55                  # 墙体内表面（相对外墙面的深度）

FLOOR_H = [5.00, 3.90, 3.90, 3.90]
FLOOR_Z = [0.0]
for _h in FLOOR_H:
    FLOOR_Z.append(FLOOR_Z[-1] + _h)
WALL_TOP = FLOOR_Z[-1]           # 16.70
CORNICE_TOP = WALL_TOP + 1.28
PARAPET_TOP = CORNICE_TOP + 0.80

WIN_W = 2.10                     # 窗宽
WIN_H = 2.20                     # 窗高
WIN_SILL = 1.00                  # 窗台距楼面
GND_WIN_H = 2.80
GND_WIN_SILL = 1.20

ARCH_W = 2.34                    # 底层拱券净宽
ARCH_SPRING = 3.10               # 起拱高度
ENT_W = 2.60                     # 主入口净宽
ENT_SPRING = 3.40
ENT_APEX = ENT_SPRING + ENT_W / 2.0

# 材质键
M_WALL, M_TRIM, M_PANEL = 'Wall', 'Trim', 'Panel'
M_GLASS, M_DARK, M_STONE = 'Glass', 'Dark', 'Stone'
M_LANTERN, M_ORNAMENT, M_INTERIOR = 'Lantern', 'Ornament', 'Interior'

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
def build_pier(u, bay):
    """贯通全高的竖向壁柱：柱身 + 阶梯收头 + 梯格凹槽"""
    hw = PIER_W / 2.0
    ubox(M_WALL, u - hw, u + hw, WALL_IN, PIER_OUT, 0.0, WALL_TOP - 1.10)
    ubox(M_WALL, u - hw + 0.17, u + hw - 0.17,
         WALL_IN, PIER_OUT + 0.10, WALL_TOP - 1.10, WALL_TOP - 0.55)
    ubox(M_TRIM, u - hw + 0.34, u + hw - 0.34,
         WALL_IN, PIER_OUT + 0.16, WALL_TOP - 0.55, WALL_TOP)
    # 柱身横向凹槽（梯格纹）：宁少勿多，太密会变成条形码
    for k in range(4):
        z = WALL_TOP - 4.20 + k * 0.95
        ubox(M_DARK, u - hw + 0.26, u + hw - 0.26,
             PIER_OUT - 0.05, PIER_OUT + 0.005, z, z + 0.11)


def build_window(u, z_floor, w, h, sill):
    """窗洞：玻璃（内凹）+ 白色窗框 + 中挺横档 + 出挑窗台"""
    z0, z1 = z_floor + sill, z_floor + sill + h
    hw = w / 2.0
    t = 0.10

    # 玻璃：内凹 0.26
    uprism(M_GLASS, [(u - hw, z0), (u + hw, z0), (u + hw, z1), (u - hw, z1)],
           -0.30, -0.26)
    # 窗框四边
    ubox(M_TRIM, u - hw, u + hw, -0.24, -0.12, z0, z0 + t)
    ubox(M_TRIM, u - hw, u - hw + t, -0.24, -0.12, z0, z1)
    ubox(M_TRIM, u + hw - t, u + hw, -0.24, -0.12, z0, z1)
    ubox(M_TRIM, u - hw, u + hw, -0.24, -0.12, z1 - t, z1)
    # 中挺 + 横档
    ubox(M_TRIM, u - 0.05, u + 0.05, -0.23, -0.13, z0, z1)
    ubox(M_TRIM, u - hw, u + hw, -0.23, -0.13, z0 + h * 0.52, z0 + h * 0.52 + 0.08)
    # 窗台：向外出挑
    ubox(M_TRIM, u - hw - 0.14, u + hw + 0.14, -0.06, 0.16, z0 - 0.14, z0)


def build_window_floor(z_floor, z_top, bay, n, skip_entrance):
    """一层标准窗：填墙 + 留洞 + 窗下墙板与花饰"""
    for u in bay_centers(U_SPAN[cur_side], n)[0]:
        if skip_entrance and abs(u) < 1e-6:
            continue
        w = min(WIN_W, bay - PIER_W - 0.30)
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

        # 窗下墙板（米黄）+ 白色花饰
        pz0, pz1 = z_floor + 0.18, z0 - 0.14
        ubox(M_PANEL, u - hw - 0.05, u + hw + 0.05, 0.0, 0.06, pz0, pz1)
        r = 0.24
        poly = [(u + r * math.cos(2 * math.pi * i / 20),
                 (pz0 + pz1) / 2.0 + r * math.sin(2 * math.pi * i / 20))
                for i in range(20)]
        uprism(M_ORNAMENT, poly, 0.06, 0.13)


def arch_spandrel(u, r, spring, apex):
    """拱与拱顶水平线之间的弧形肩部：一圈梯形棱柱精确铺满"""
    n = 18
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
    n = 18
    for i in range(n):
        a0, a1 = math.pi * i / n, math.pi * (i + 1) / n
        uprism(M_TRIM, [
            (u + r * math.cos(a0), spring + r * math.sin(a0)),
            (u + (r + t) * math.cos(a0), spring + (r + t) * math.sin(a0)),
            (u + (r + t) * math.cos(a1), spring + (r + t) * math.sin(a1)),
            (u + r * math.cos(a1), spring + r * math.sin(a1)),
        ], WALL_IN, 0.04)


def build_arch_bay(u, bay, w, spring, z_top, ring_t=0.11):
    """一个底层拱券开间"""
    hw = w / 2.0
    apex = spring + hw
    half = bay / 2.0
    ubox(M_WALL, u - half, u - hw, WALL_IN, 0.0, 0.0, apex)
    ubox(M_WALL, u + hw, u + half, WALL_IN, 0.0, 0.0, apex)
    ubox(M_WALL, u - half, u + half, WALL_IN, 0.0, apex, z_top)
    arch_spandrel(u, hw, spring, apex)
    # 洞口的侧面与顶面由墙块自身形成；背后靠 Interior 内芯提供可见面，
    # 不要再贴一块平板把洞堵死 —— 那样拱券会变成一个纯黑洞。
    arch_ring(u, hw, spring, ring_t)
    return apex


def build_entrance(u, bay, z_top):
    """中央主入口：加大拱券 + 玻璃门扇"""
    hw = ENT_W / 2.0
    apex = ENT_APEX
    half = bay / 2.0
    ubox(M_WALL, u - half, u - hw, WALL_IN, 0.0, 0.0, apex)
    ubox(M_WALL, u + hw, u + half, WALL_IN, 0.0, 0.0, apex)
    ubox(M_WALL, u - half, u + half, WALL_IN, 0.0, apex, z_top)
    arch_spandrel(u, hw, ENT_SPRING, apex)
    arch_ring(u, hw, ENT_SPRING, 0.13)
    # 门扇（深色玻璃）+ 竖挺
    ubox(M_GLASS, u - hw + 0.22, u + hw - 0.22, WALL_IN + 0.16, WALL_IN + 0.22,
         0.05, 3.05)
    for k in (-1, 0, 1):
        ubox(M_TRIM, u + k * 0.80 - 0.05, u + k * 0.80 + 0.05,
             WALL_IN + 0.14, WALL_IN + 0.24, 0.05, 3.05)
    # 入口台阶
    for i in range(3):
        ubox(M_STONE, u - hw - 1.1, u + hw + 1.1,
             0.16 + i * 0.30, 1.70 - i * 0.30, 0.0, 0.16 + i * 0.16)


def build_cornice():
    """三层白色檐口 + 女儿墙"""
    half = U_SPAN[cur_side] / 2.0
    ubox(M_TRIM, -half, half, WALL_IN, 0.62, WALL_TOP, WALL_TOP + 0.42)
    ubox(M_WALL, -half, half, WALL_IN, 0.28, WALL_TOP + 0.42, WALL_TOP + 0.92)
    ubox(M_TRIM, -half, half, WALL_IN, 0.44, WALL_TOP + 0.92, CORNICE_TOP)
    ubox(M_WALL, -half, half, WALL_IN, 0.10, CORNICE_TOP, PARAPET_TOP)


def build_base():
    """石材勒脚"""
    half = U_SPAN[cur_side] / 2.0
    ubox(M_STONE, -half, half, WALL_IN, 0.22, 0.0, 0.85)


def build_lantern(u, z, r=0.34):
    """红灯笼（经纬网格近似球）"""
    o = WALL_OUT[cur_side] + 0.62
    if cur_side == 'F':
        cx, cy = u, o
    elif cur_side == 'B':
        cx, cy = u, -o
    elif cur_side == 'R':
        cx, cy = o, u
    else:
        cx, cy = -o, u

    seg, ring = 12, 8
    verts, faces = [], []
    for j in range(1, ring):
        phi = math.pi * j / ring
        for i in range(seg):
            th = 2 * math.pi * i / seg
            verts.append((cx + r * math.sin(phi) * math.cos(th),
                          cy + r * math.sin(phi) * math.sin(th),
                          z + r * math.cos(phi)))
    top, bot = len(verts), len(verts) + 1
    verts.append((cx, cy, z + r))
    verts.append((cx, cy, z - r))

    def idx(j, i):
        return (j - 1) * seg + (i % seg)

    for j in range(1, ring - 1):
        for i in range(seg):
            faces.append([idx(j, i), idx(j, i + 1), idx(j + 1, i + 1), idx(j + 1, i)])
    for i in range(seg):
        faces.append([top, idx(1, i + 1), idx(1, i)])
        faces.append([bot, idx(ring - 1, i), idx(ring - 1, i + 1)])
    B._add(M_LANTERN, verts, faces)


# ==================================================================
# 4. 组装
# ==================================================================
def build_facade(side, total, n_bays, with_entrance=False, lanterns=False):
    global cur_side
    cur_side = side
    centers, bay = bay_centers(total, n_bays)

    for u in pier_positions(total, n_bays):
        build_pier(u, bay)

    # 底层：拱券
    z_top = FLOOR_Z[1]
    for u in centers:
        if with_entrance and abs(u) < 1e-6:
            build_entrance(u, bay, z_top)
        else:
            w = min(ARCH_W, bay - PIER_W - 0.25)
            build_arch_bay(u, bay, w, ARCH_SPRING, z_top)

    # 二至四层
    # 注意：主入口只占底层，上层这一开间必须照常开窗，
    # 否则会在立面上留下一条从 5m 直通屋顶的空洞。
    for fi in range(1, len(FLOOR_H)):
        build_window_floor(FLOOR_Z[fi], FLOOR_Z[fi + 1], bay, n_bays, False)

    build_cornice()
    build_base()

    if lanterns:
        for u in centers:
            if abs(u % 8.0) < 1e-6:
                build_lantern(u, 5.60)


build_facade('F', LEN, BAYS, with_entrance=True, lanterns=True)
build_facade('B', LEN, BAYS)
build_facade('L', DEP, END_BAYS)
build_facade('R', DEP, END_BAYS)

# 屋面
B.box(M_STONE, -HX + 0.25, HX - 0.25, -HY + 0.25, HY - 0.25,
      WALL_TOP - 0.25, WALL_TOP + 0.02)

# 室内内芯：比外轮廓小一圈的实体。
# 有了它，任何洞口（拱券 / 窗）透过去都能看到一块有光照的室内表面，
# 而不是穿透整栋楼看到对面的背面（那会渲染成纯黑）。
INSET = 3.2
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
                  variation=0.0, vscale=6.0):
    """variation > 0 时，用一层大尺度噪声在基色上做风化色差，
    避免整面墙是一块均匀色 —— 这是"白模感"的主要来源。"""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = principled(mat)
    bsdf.inputs['Base Color'].default_value = (*base, 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal

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
        nt.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])

    # --- 细节凹凸 + 粗糙度微扰 ---
    if noise_bump > 0:
        tex = nt.nodes.new('ShaderNodeTexNoise')
        tex.inputs['Scale'].default_value = 26.0
        tex.inputs['Detail'].default_value = 10.0
        tex.inputs['Roughness'].default_value = 0.68
        tex.location = (-620, -140)

        bump = nt.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = noise_bump
        bump.inputs['Distance'].default_value = 0.035
        bump.location = (-320, -140)
        nt.links.new(tex.outputs['Fac'], bump.inputs['Height'])
        nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

        rmap = nt.nodes.new('ShaderNodeMapRange')
        rmap.inputs['From Min'].default_value = 0.0
        rmap.inputs['From Max'].default_value = 1.0
        rmap.inputs['To Min'].default_value = max(0.0, rough - 0.10)
        rmap.inputs['To Max'].default_value = min(1.0, rough + 0.10)
        rmap.location = (-320, 120)
        nt.links.new(tex.outputs['Fac'], rmap.inputs['Value'])
        nt.links.new(rmap.outputs['Result'], bsdf.inputs['Roughness'])

    if emission:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1.0)
        bsdf.inputs['Emission Strength'].default_value = emission_strength
    return mat


MATERIALS = {
    M_WALL: make_material('MB_Wall', (0.548, 0.530, 0.462), 0.82,
                          noise_bump=0.55, variation=0.13, vscale=3.5),
    M_TRIM: make_material('MB_Trim', (0.845, 0.833, 0.795), 0.60,
                          noise_bump=0.30, variation=0.05, vscale=5.0),
    M_PANEL: make_material('MB_Panel', (0.588, 0.486, 0.344), 0.74,
                           noise_bump=0.40, variation=0.12, vscale=7.0),
    M_GLASS: make_material('MB_Glass', (0.055, 0.078, 0.105), 0.10, metal=0.18),
    M_DARK: make_material('MB_Dark', (0.072, 0.068, 0.060), 0.90),
    M_STONE: make_material('MB_Stone', (0.360, 0.340, 0.300), 0.88,
                           noise_bump=0.60, variation=0.15, vscale=3.0),
    M_ORNAMENT: make_material('MB_Ornament', (0.800, 0.790, 0.762), 0.55),
    M_INTERIOR: make_material('MB_Interior', (0.152, 0.148, 0.138), 0.90,
                              noise_bump=0.20, variation=0.10, vscale=2.5),
    M_LANTERN: make_material('MB_Lantern', (0.560, 0.045, 0.060), 0.42,
                             emission=(0.85, 0.12, 0.10), emission_strength=2.2),
}

objs = B.to_objects('MB')
for ob in objs:
    key = ob.name.split('_', 1)[1]
    if key in MATERIALS:
        ob.data.materials.append(MATERIALS[key])
    if key in (M_GLASS, M_LANTERN):
        for p in ob.data.polygons:
            p.use_smooth = True

# ==================================================================
# 6. 场地：地面 + 铺装广场 + 绿篱
# ==================================================================
gm = bpy.data.meshes.new('Ground')
G = 200.0
gm.from_pydata([(-G, -G, 0), (G, -G, 0), (G, G, 0), (-G, G, 0)], [], [[0, 1, 2, 3]])
gm.validate()
ground = bpy.data.objects.new('Ground', gm)
scene.collection.objects.link(ground)

gmat = bpy.data.materials.new('MB_Ground')
gmat.use_nodes = True
gb = principled(gmat)
gb.inputs['Base Color'].default_value = (0.190, 0.188, 0.176, 1.0)
gb.inputs['Roughness'].default_value = 0.94
gm.materials.append(gmat)

# 建筑前方的铺装广场（抬高 6cm，避免与地面共面产生 z-fighting）
pm = bpy.data.meshes.new('Plaza')
px, py, pz = 62.0, 34.0, 0.06
py0 = HY + 0.9
pm.from_pydata([(-px, py0, pz), (px, py0, pz), (px, py0 + py, pz), (-px, py0 + py, pz)],
               [], [[0, 1, 2, 3]])
pm.validate()
plaza = bpy.data.objects.new('Plaza', pm)
scene.collection.objects.link(plaza)
pmat = bpy.data.materials.new('MB_Plaza')
pmat.use_nodes = True
pb = principled(pmat)
pb.inputs['Base Color'].default_value = (0.312, 0.300, 0.276, 1.0)
pb.inputs['Roughness'].default_value = 0.84
pm.materials.append(pmat)

# 沿立面两段绿篱（入口处留出通道）
hm = bpy.data.meshes.new('Hedge')
hverts, hfaces = [], []


def hedge(x0, x1, y0, y1, z0, z1):
    off = len(hverts)
    hverts.extend([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                   (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)])
    for f in ([0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
              [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]):
        hfaces.append([i + off for i in f])


hedge(-HX - 1.0, -5.0, HY + 2.8, HY + 4.1, 0.0, 0.85)
hedge(5.0, HX + 1.0, HY + 2.8, HY + 4.1, 0.0, 0.85)
hm.from_pydata(hverts, [], hfaces)
hm.validate()
hedge_ob = bpy.data.objects.new('Hedge', hm)
scene.collection.objects.link(hedge_ob)
hmat = bpy.data.materials.new('MB_Hedge')
hmat.use_nodes = True
hb = principled(hmat)
hb.inputs['Base Color'].default_value = (0.055, 0.132, 0.058, 1.0)
hb.inputs['Roughness'].default_value = 0.90
hm.materials.append(hmat)

# ==================================================================
# 7. 汇报
# ==================================================================
tris = sum(sum(len(p.vertices) - 2 for p in ob.data.polygons) for ob in objs)
print('=== 教学主楼 建模完成 ===')
print(f'尺寸: 面宽 {LEN:.1f} × 进深 {DEP:.1f} × 檐高 {WALL_TOP:.2f} m（含女儿墙 {PARAPET_TOP:.2f} m）')
print(f'开间: 长边 {BAYS}×{BAY:.2f} m，短边 {END_BAYS}×{DEP / END_BAYS:.2f} m；层数 {len(FLOOR_H)}')
print(f'对象: {len(objs)} 个（按材质合并）')
for ob in sorted(objs, key=lambda o: -len(o.data.polygons)):
    print(f'   {ob.name:<16} 面数 {len(ob.data.polygons):>6}')
print(f'三角面合计: {tris}')
