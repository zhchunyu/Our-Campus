# -*- coding: utf-8 -*-
"""
build_campus_site.py —— 山河大学 · 阶段 0「场地骨架」
================================================================
平面依据：01-产品设计/山河大学_总平面格局图.svg
本脚本把该 SVG 的贝塞尔岸线**原样搬进三维**，所以平面图与模型必然一致。

比例尺：1 SVG px = 2.4 m
  → 场地东西 1440 m × 南北 950 m
  → 半岛陆地 1162 m × 852 m ≈ 78 ha ≈ 1165 亩（对应 D3 的 1200 亩）

坐标系：X = 东，Y = 北，Z = 上；原点在**主校门**（SVG 340, 516）

生成内容
  1. 半岛地形（岸线 → 顶面 + 岸坡 + 裙边）
  2. 河湾水面 + 对岸陆域（等宽河道的偏移多边形）
  3. 对岸远山（山脊剖面 + 噪声起伏）
  4. 中轴序列：牌坊 / 明堂广场 / 案山土丘 / 图书馆前庭 / 观景台
  5. 路网：环形主路 + 中轴大道 + 放射支路 + 滨水步道 + 水口桥
  6. 七区地面铺装（与平面图配色一一对应）
  7. 28 栋体块占位（**各自独立对象**，后续阶段逐栋替换为真建筑）
  8. 定位锚点（Empty，供队友接 AI 定位与人流热力）

命名约定（D9）：
  场地：SITE_*    建筑：BLD_<Zone>_<Name>    锚点：ANCHOR_<Name>
"""

import math
import os
import random

import bmesh
import bpy
from mathutils import Vector

# ==================================================================
# 0. 场景清空
# ==================================================================
for _c in list(bpy.data.collections):
    bpy.data.collections.remove(_c)
for _ob in list(bpy.data.objects):
    bpy.data.objects.remove(_ob, do_unlink=True)
for _blk in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
    for _d in list(_blk):
        if _d.users == 0:
            _blk.remove(_d)

SCENE = bpy.context.scene
ROOT = SCENE.collection


def coll(name, parent=None):
    c = bpy.data.collections.new(name)
    (parent or ROOT).children.link(c)
    return c


C_SITE = coll('SITE_场地')
C_WATER = coll('SITE_水系', C_SITE)
C_ROAD = coll('SITE_路网', C_SITE)
C_PAVE = coll('SITE_铺装', C_SITE)
C_GREEN = coll('SITE_绿化', C_SITE)
C_BLD = coll('BLD_建筑体块')
C_ANCHOR = coll('ANCHOR_锚点')

# ==================================================================
# 1. 平面基准：SVG 岸线 → 世界坐标
# ==================================================================
S = 2.4            # m / SVG px
AX = 340.0         # 中轴 SVG x
BASE = 516.0       # 图底 SVG y


def W(sx, sy):
    """SVG 平面坐标 → 世界坐标（X 东 / Y 北）"""
    return ((sx - AX) * S, (BASE - sy) * S)


def _cubic(p0, c1, c2, p1, n):
    out = []
    for i in range(1, n + 1):
        t = i / n
        u = 1.0 - t
        out.append((
            u**3 * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t**3 * p1[0],
            u**3 * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t**3 * p1[1],
        ))
    return out


def land_poly_svg():
    """平面图里那条半岛岸线（不含南侧闭合段，闭合是隐式的）

    每段三次贝塞尔采 24 点 —— 岸线点数决定了后续所有偏移环、岸坡、
    步道的网格密度，24 是「够顺滑」与「面数可控」之间的折中。
    """
    N = 24
    pts = [(180.0, 516.0), (180.0, 468.0)]
    pts += _cubic((180, 468), (130, 454), (100, 400), (98, 332), N)
    pts += _cubic((98, 332), (96, 264), (150, 204), (236, 178), N)
    pts += _cubic((236, 178), (300, 160), (380, 160), (444, 178), N)
    pts += _cubic((444, 178), (530, 204), (584, 264), (582, 332), N)
    pts += _cubic((582, 332), (580, 400), (550, 454), (500, 468), N)
    pts.append((500.0, 516.0))
    return pts


P0 = [W(*p) for p in land_poly_svg()]      # 半岛岸线（73 点，0 = 陆颈西，72 = 陆颈东）
NP = len(P0)


# ---- 多边形工具 ----
def signed_area(pts):
    a = 0.0
    for i in range(len(pts)):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % len(pts)]
        a += x0 * y1 - x1 * y0
    return a * 0.5


def offset_poly(pts, d):
    """闭合多边形的等距外扩（d<0 为内缩），带斜接补偿

    外法线方向依环绕方向而定：
      逆时针(ccw) 边 (ex,ey) 的外法线 = ( ey, -ex)
      顺时针(cw ) 边 (ex,ey) 的外法线 = (-ey,  ex)
    """
    n = len(pts)
    ccw = signed_area(pts) > 0
    out = []
    for i in range(n):
        p_prev, p, p_next = pts[(i - 1) % n], pts[i], pts[(i + 1) % n]
        e1 = (p[0] - p_prev[0], p[1] - p_prev[1])
        e2 = (p_next[0] - p[0], p_next[1] - p[1])
        L1 = math.hypot(*e1) or 1.0
        L2 = math.hypot(*e2) or 1.0
        if ccw:
            n1 = (e1[1] / L1, -e1[0] / L1)
            n2 = (e2[1] / L2, -e2[0] / L2)
        else:
            n1 = (-e1[1] / L1, e1[0] / L1)
            n2 = (-e2[1] / L2, e2[0] / L2)
        nx, ny = n1[0] + n2[0], n1[1] + n2[1]
        L = math.hypot(nx, ny)
        if L < 1e-9:
            out.append((p[0] + n1[0] * d, p[1] + n1[1] * d))
            continue
        nx, ny = nx / L, ny / L
        cos_half = max(0.30, n1[0] * nx + n1[1] * ny)
        de = d / cos_half
        out.append((p[0] + nx * de, p[1] + ny * de))
    return out


def dist_to_poly(x, y, pts):
    """点到闭合多边形边界的最短距离"""
    best = 1e18
    n = len(pts)
    for i in range(n):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % n]
        dx, dy = x1 - x0, y1 - y0
        L2 = dx * dx + dy * dy
        t = 0.0 if L2 < 1e-9 else max(0.0, min(1.0, ((x - x0) * dx + (y - y0) * dy) / L2))
        px, py = x0 + dx * t, y0 + dy * t
        d = math.hypot(x - px, y - py)
        if d < best:
            best = d
    return best


def smoothstep(a, b, x):
    if b == a:
        return 1.0 if x >= b else 0.0
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3.0 - 2.0 * t)


def _zs(z, n):
    return list(z) if isinstance(z, (list, tuple)) else [z] * n


def cap(pts, z):
    zz = _zs(z, len(pts))
    return [(pts[i][0], pts[i][1], zz[i]) for i in range(len(pts))], [list(range(len(pts)))]


def band(pa, za, pb, zb):
    """等长点列之间的四边形条带（自动闭合）；za/zb 可传标量或逐点高度列表"""
    n = len(pa)
    a, b = _zs(za, n), _zs(zb, n)
    verts = ([(pa[i][0], pa[i][1], a[i]) for i in range(n)] +
             [(pb[i][0], pb[i][1], b[i]) for i in range(n)])
    faces = [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    return verts, faces


def band_open(pa, za, pb, zb):
    """开放条带（不闭合），用于只有一段的岸线"""
    n = len(pa)
    a, b = _zs(za, n), _zs(zb, n)
    verts = ([(pa[i][0], pa[i][1], a[i]) for i in range(n)] +
             [(pb[i][0], pb[i][1], b[i]) for i in range(n)])
    faces = [[i, i + 1, n + i + 1, n + i] for i in range(n - 1)]
    return verts, faces


def quad(p0, p1, p2, p3):
    return [p0, p1, p2, p3], [[0, 1, 2, 3]]


def rect(x0, y0, x1, y1, z):
    return cap([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], z)


def round_rect(x0, y0, x1, y1, r, z, n=6):
    """圆角矩形：场地分区用直角会显得很"图纸"，圆角更接近真实地块"""
    r = min(r, (x1 - x0) * 0.5, (y1 - y0) * 0.5)
    cx = ((x0 + r, y0 + r), (x1 - r, y0 + r), (x1 - r, y1 - r), (x0 + r, y1 - r))
    a0 = (math.pi, math.pi * 1.5, 0.0, math.pi * 0.5)
    pts = []
    for k in range(4):
        for i in range(n + 1):
            a = a0[k] + (math.pi * 0.5) * i / n
            pts.append((cx[k][0] + r * math.cos(a), cx[k][1] + r * math.sin(a)))
    return cap(pts, z)


def box(cx, cy, w, d, h, z0=0.0, rot=0.0):
    """以 (cx,cy) 为底心的长方体，rot 为绕 Z 的旋转（弧度）"""
    hw, hd = w * 0.5, d * 0.5
    ca, sa = math.cos(rot), math.sin(rot)
    base = []
    for dx, dy in ((-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd)):
        base.append((cx + dx * ca - dy * sa, cy + dx * sa + dy * ca))
    verts = [(x, y, z0) for x, y in base] + [(x, y, z0 + h) for x, y in base]
    faces = [[0, 1, 2, 3], [7, 6, 5, 4],
             [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]]
    return verts, faces


def ribbon(pts, width, z, closed=False):
    """沿折线生成带宽度的带状面"""
    n = len(pts)
    hw = width * 0.5
    left, right = [], []
    for i in range(n):
        if closed:
            p_prev, p_next = pts[(i - 1) % n], pts[(i + 1) % n]
        else:
            p_prev = pts[max(0, i - 1)]
            p_next = pts[min(n - 1, i + 1)]
        tx, ty = p_next[0] - p_prev[0], p_next[1] - p_prev[1]
        L = math.hypot(tx, ty) or 1.0
        nx, ny = -ty / L, tx / L
        left.append((pts[i][0] + nx * hw, pts[i][1] + ny * hw))
        right.append((pts[i][0] - nx * hw, pts[i][1] - ny * hw))
    if closed:
        return band(left, z, right, z)
    return band_open(left, z, right, z)


def resample(pts, step):
    """把折线按等距重采样（用于沿路种树）"""
    out, acc = [pts[0]], 0.0
    for i in range(1, len(pts)):
        x0, y0 = pts[i - 1]
        x1, y1 = pts[i]
        seg = math.hypot(x1 - x0, y1 - y0)
        if seg < 1e-6:
            continue
        t = 0.0
        while acc + seg - t * seg >= step:
            t += (step - acc) / seg
            if t > 1.0:
                break
            out.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
            acc = 0.0
        acc += seg * (1.0 - t)
    return out


def scale_poly(pts, k, cx=None, cy=None):
    if cx is None:
        cx = sum(p[0] for p in pts) / len(pts)
        cy = sum(p[1] for p in pts) / len(pts)
    return [(cx + (p[0] - cx) * k, cy + (p[1] - cy) * k) for p in pts]


# ==================================================================
# 2. 材质
# ==================================================================
def principled(mat):
    for n in mat.node_tree.nodes:
        if n.bl_idname == 'ShaderNodeBsdfPrincipled':
            return n
    return None


def set_in(bsdf, key, val):
    try:
        bsdf.inputs[key].default_value = val
    except (KeyError, TypeError):
        pass


def make_mat(name, color, rough=0.85, metal=0.0,
             noise_scale=0.0, col_b=None, bump=0.0, bump_scale=30.0):
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
    set_in(bsdf, 'Base Color', (*color, 1.0))
    set_in(bsdf, 'Roughness', rough)
    set_in(bsdf, 'Metallic', metal)
    set_in(bsdf, 'Specular IOR Level', 0.5)
    set_in(bsdf, 'Specular', 0.5)

    tex = None
    if noise_scale > 0.0:
        tex = nt.nodes.new('ShaderNodeTexNoise')
        set_in(tex, 'Scale', noise_scale)
        set_in(tex, 'Detail', 6.0)
        set_in(tex, 'Roughness', 0.55)
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].position = 0.32
        ramp.color_ramp.elements[0].color = (*color, 1.0)
        ramp.color_ramp.elements[1].position = 0.68
        ramp.color_ramp.elements[1].color = (*(col_b or color), 1.0)
        nt.links.new(tex.outputs['Fac'], ramp.inputs['Fac'])
        nt.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])

    if bump > 0.0:
        src = tex if tex else nt.nodes.new('ShaderNodeTexNoise')
        if not tex:
            set_in(src, 'Scale', bump_scale)
            set_in(src, 'Detail', 8.0)
        bmp = nt.nodes.new('ShaderNodeBump')
        set_in(bmp, 'Strength', bump)
        set_in(bmp, 'Distance', 0.6)
        nt.links.new(src.outputs['Fac'], bmp.inputs['Height'])
        nt.links.new(bmp.outputs['Normal'], bsdf.inputs['Normal'])
    return m


M_WATER = make_mat('M_水', (0.095, 0.150, 0.168), rough=0.090,
                   bump=0.14, bump_scale=190.0)
M_BANK = make_mat('M_驳岸石', (0.292, 0.282, 0.262), rough=0.90,
                  noise_scale=0.05, col_b=(0.238, 0.230, 0.212), bump=0.55, bump_scale=2.0)
M_GRASS = make_mat('M_草地', (0.108, 0.180, 0.072), rough=0.93,
                   noise_scale=0.012, col_b=(0.082, 0.145, 0.055), bump=0.35, bump_scale=0.16)
M_GRASS_D = make_mat('M_林地', (0.070, 0.128, 0.052), rough=0.95,
                     noise_scale=0.02, col_b=(0.050, 0.098, 0.040), bump=0.45, bump_scale=0.3)
M_MOUND = make_mat('M_土丘草', (0.132, 0.196, 0.086), rough=0.92,
                   noise_scale=0.05, col_b=(0.100, 0.160, 0.062), bump=0.5, bump_scale=0.5)
# 铺装整体压暗一档（约 ×0.80）。
# 阶段 1 出图后发现：0.47 的浅灰铺装在太阳强度 3.4 的实景光下直接冲到
# 近白，整片校园读成一块没有材质的混凝土底板，白墙反而压不住它。
# 真实的广场石材反射率大约在 0.30~0.40，压到这个区间，白墙（0.72）和
# 深色屋面（0.09）之间才有中间调，画面层次才出得来。
M_PAVE = make_mat('M_广场铺装', (0.376, 0.366, 0.346), rough=0.76,
                  noise_scale=0.09, col_b=(0.330, 0.322, 0.304), bump=0.25, bump_scale=3.0)
M_PAVE_W = make_mat('M_中轴铺装', (0.362, 0.318, 0.260), rough=0.78,
                    noise_scale=0.07, col_b=(0.317, 0.278, 0.227), bump=0.25, bump_scale=3.0)
M_ROAD = make_mat('M_主路沥青', (0.150, 0.155, 0.162), rough=0.70,
                  noise_scale=0.30, col_b=(0.120, 0.125, 0.132), bump=0.2, bump_scale=6.0)
M_PATH = make_mat('M_步道', (0.318, 0.304, 0.277), rough=0.82,
                  noise_scale=0.25, col_b=(0.275, 0.262, 0.238), bump=0.2, bump_scale=6.0)
# 七区地面：中灰绿系，彼此只差色调，靠明暗而非色相区分，
# 这样在实景渲染里既读得出分区，又不会变成七块彩色板
M_Z_HUM = make_mat('M_区_人文', (0.352, 0.354, 0.326), rough=0.86, noise_scale=0.05)
M_Z_TEC = make_mat('M_区_科技', (0.315, 0.338, 0.336), rough=0.86, noise_scale=0.05)
M_Z_LAB = make_mat('M_区_实验', (0.330, 0.340, 0.328), rough=0.86, noise_scale=0.05)
M_Z_TEA = make_mat('M_区_教学', (0.348, 0.351, 0.325), rough=0.86, noise_scale=0.05)
M_Z_SPT = make_mat('M_区_运动', (0.307, 0.340, 0.323), rough=0.86, noise_scale=0.05)
M_Z_DOR = make_mat('M_区_生活', (0.366, 0.348, 0.320), rough=0.86, noise_scale=0.05)
M_MTN = None  # 占位：真实定义见下方 make_mat_grad


def make_mat_grad(name, stops, rough=1.0):
    """按高度渐变的材质：低处林线偏暗绿，高处偏冷灰蓝。

    远山用噪声做色差会变成一块块"污渍"，按高度渐变才对 ——
    它同时承担了植被带与空气透视两件事。
    """
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
    set_in(bsdf, 'Roughness', rough)
    set_in(bsdf, 'Specular IOR Level', 0.3)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Generated'], sep.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = stops[0]
    els[1].position, els[1].color = stops[-1]
    for pos, col in stops[1:-1]:
        e = ramp.color_ramp.elements.new(pos)
        e.color = col
    nt.links.new(sep.outputs['Z'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    return m


M_MTN = make_mat_grad('M_远山', [
    (0.00, (0.196, 0.214, 0.170, 1.0)),   # 河滩林带（窄）
    (0.11, (0.222, 0.246, 0.212, 1.0)),   # 山脚林
    (0.36, (0.268, 0.300, 0.316, 1.0)),   # 下半坡：转灰蓝
    (0.62, (0.328, 0.368, 0.416, 1.0)),   # 山腰
    (0.85, (0.400, 0.448, 0.506, 1.0)),
    (1.00, (0.494, 0.548, 0.620, 1.0)),   # 峰顶：冷灰蓝
], rough=1.0)
M_TRUNK = make_mat('M_树干', (0.145, 0.105, 0.072), rough=0.95)


# ==================================================================
# ★ 叶片透光（V2.5 补）—— 实景参考图里"树是活的"的关键一步
# ==================================================================
# 参考实景照片（红砖楼 + 巨型活栎）里，**逆光/侧逆光的叶片是半透的**：
# 叶尖透出天光、呈"亮绿发光"感，而顺光面与冠内的叶片是暗的 ——
# 这个**明暗反差本身就是"树"的读法**。没有它，树冠永远是一坨实心绿。
#
# 为什么走 Principled 的 `Transmission Weight`，而不是插一个 Translucent/
# MixShader 节点到输出：
#   `export_glb.py` 的 `flatten_materials()` 是**按 `ShaderNodeBsdfPrincipled`
#   找材质**的（它要读 Base Color 的有效色）。一旦在输出上插 MixShader，
#   这个材质就落在压平逻辑之外 ⇒ 网页端 GLB 里它会是纯白（本项目第 8 条坑）。
#   Principled 自己的插槽是常量，压平逻辑照常工作。
#
# 为什么 `IOR = 1.0` 是**必须**的：
#   IOR > 1 会真折射 —— 树冠是实心球体，会渲染成"一堆玻璃球"（比不做还糟）。
#   IOR = 1.0 时菲涅耳反射为 0，光线**直穿**，配合 roughness 0.92 就是
#   纯粹的**漫透射**，等价于经典的 Translucent BSDF 叶片。
# ★★ 2026-09-24 实测记录（很重要，别再走一遍弯路）：
#
# 【1】首版用 `trans 0.32`，A/B 同机位**像素差只有 1.03/6.0%**，树放大 3 倍看
#      叶片亮度几乎没变 —— 等于白做。两个根因：
#        · 树冠是**闭合球体**：进面 0.32 × 出面 0.32 ⇒ 有效透光 ≈ **10%**
#        · 阴天（sun 0.2）本来就没有方向性背光，**没有"可透的光"**
#      ⇒ 「透光做不出来，多半不是没开，而是**开太小 + 光不对**」。
#
# 【2】把三种实现做成可切换、一次对照（机位 LF1 树在 6 m 处，晴天）：
#
#        变体          树区像素差(vs off)   全图绿像素均值
#        off               0.00             (23, 55, 23)
#        trans 0.70       14.95             (19, 45, 17)   ← ★ 树**变暗**了，方向是错的
#        sss   0.60        3.24             (21, 54, 18)
#        sss   0.90        2.52             (23, 58, 19)   ← 冠内暗面被抬起、绿更饱和 ✓
#
#      **`trans` 是错的**：透射吃掉漫反射，树冠整体压黑（G 55→45）。
#      这正是"闭合体双面衰减"的代价 —— 换个说法：**在实心球上做透射，
#      得到的是"暗玻璃球"，不是"透光叶子"**。
#      **`sss` 才对**：皮下散射是**物体内部的体积散射，只在进面衰减一次**，
#      它把光"渗"进冠内再漫出，效果是暗面抬起、颜色更饱和，
#      而远看（LF3 机位）绿像素均值几乎不动（73,107,67 → 72,107,66）
#      —— 即"**近看更活、远看不发灰**"，正是要的。
#
# 【3】仍然要清楚：**低模树冠就是一颗光滑球**，材质再调也变不成树叶。
#      它只值"LOD"这个定位；要真正像参考图那棵活栎，得靠 `_trees_hero.py`
#      那种**分形枝干 + 枝梢叶团**的几何。别指望材质兜底。
#
# 环境变量 `BR_LEAF_MODE` / `BR_LEAF_AMT` 选实现与强度。
_LEAF_MODE = os.environ.get('BR_LEAF_MODE', 'sss')
_LEAF_AMT = float(os.environ.get('BR_LEAF_AMT', '0.85'))


def make_mat_leaf(name, low, high, rough=0.92, trans=None):
    """树冠材质：用「法线 Z」做上下渐变 + 叶片透光。

    单色球体在实景渲染里就是一颗"绿气球" —— 没有自遮挡、没有内部明暗，
    一眼假。按法线朝向在暗绿/亮绿之间插值，等于给每个小球补了一层
    「上亮下暗」的假 AO，叶片感立刻出来，成本却只有两个节点。

    第二层是**透光**：见上面 `_LEAF_MODE` 的长注释。
    """
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
    set_in(bsdf, 'Roughness', rough)
    set_in(bsdf, 'Specular IOR Level', 0.22)

    amt = _LEAF_AMT if trans is None else trans
    mode = _LEAF_MODE
    if amt <= 0.0:
        mode = 'off'
    if mode == 'trans':
        set_in(bsdf, 'Transmission Weight', amt)
        set_in(bsdf, 'IOR', 1.0)   # ★ 不折射，纯漫透射（见上方长注释）
    elif mode == 'sss':
        # 半径偏绿：让光在叶肉里"走"的时候染上绿色。
        # Scale 0.9 m 是"叶子尺度"—— 大了会变成半透明果冻球。
        set_in(bsdf, 'Subsurface Weight', amt)
        set_in(bsdf, 'Subsurface Radius', (0.55, 1.30, 0.30))
        set_in(bsdf, 'Subsurface Scale', 0.9)

    # ★★ 读回验证 —— `set_in()` 把异常吞了（KeyError/TypeError 都 pass），
    #   所以"插槽名写错"会**静默无效**：不报错、不变色、图上只是"透光没效果"。
    #   本项目已因这个吞异常吃过 32 个材质的亏（见 palette_retune.py 头部），
    #   凡是用 set_in 写**新插槽**，一律读回打出来。
    if mode == 'trans':
        _s = bsdf.inputs.get('Transmission Weight')
    elif mode == 'sss':
        _s = bsdf.inputs.get('Subsurface Weight')
    else:
        _s = None
    _v = _s.default_value if _s is not None else 0.0
    if mode == 'off':
        print('[LEAF] %s 透光：关闭（BR_LEAF_MODE=off）' % name)
    elif _v > 0.0:
        print('[LEAF] %s 透光：%s=%.3f ✓' % (name, mode, _v))
    else:
        print('[LEAF] %s 透光：⚠⚠ %s 插槽未生效，透光是假的！' % (name, mode))
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(geo.outputs['Normal'], sep.inputs['Vector'])
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = -0.55
    mr.inputs['From Max'].default_value = 0.85
    mr.clamp = True
    nt.links.new(sep.outputs['Z'], mr.inputs['Value'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (*low, 1.0)
    ramp.color_ramp.elements[1].position = 1.0
    ramp.color_ramp.elements[1].color = (*high, 1.0)
    nt.links.new(mr.outputs['Result'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    return m


# 树冠比草地略亮一点：鸟瞰时若比草地暗，成片的小圆点会读成"地面上的黑斑"
#
# ★★ 变量名故意叫 `M_LEAF_TREE` 而不是 `M_LEAF`（2026-09-24 修的一个大坑）★★
#   所有阶段脚本**共享同一个 globals**（`run_campus.py` 把 `g` 一路传下去），
#   而 `build_campus_r0.py` 里有这么一行：
#
#       M_LEAF = make_mat('M_庭院绿植', (0.148, 0.248, 0.118), ...)
#
#   它把 `M_LEAF` **重绑**成了庭院绿植。于是 `_trees_hero.py`（跑在 r0 之后、
#   要**重建** `SITE_树冠`）拿到的 `M_LEAF` 已经不是树叶材质了 ——
#   全园 605 株低模树的树冠，材质从"**按法线 Z 做上亮下暗**的树叶"
#   被静默换成了"**平色**的庭院绿植"：
#     · 那个 Normal→MapRange→ColorRamp 的假 AO 完全失效（这正是"绿气球"感的主因）
#     · 事后给 `M_树叶` 加的透光也没进过任何一张图（`M_树叶` 用户数 = 0）
#   不报错、不变色、只是在图上"看着有点平" —— 本项目第 9 条静默失效。
#   ⇒ 用**专名**避开重绑；`_trees_hero.py` 里还有一道按名取材质的兜底断言。
M_LEAF_TREE = make_mat_leaf('M_树叶', (0.055, 0.105, 0.038), (0.150, 0.235, 0.088))

# 体块：早先 0.78~0.82 的白在强日照下整片过曝，体量完全读不出来。
# 压到 0.60~0.66 的浅暖灰/浅冷灰，靠色温差区分功能区。
M_BLK_H = make_mat('M_体块_人文', (0.648, 0.618, 0.568), rough=0.84)
M_BLK_T = make_mat('M_体块_科技', (0.508, 0.540, 0.572), rough=0.80)
M_BLK_L = make_mat('M_体块_教学', (0.612, 0.592, 0.552), rough=0.84)
M_BLK_S = make_mat('M_体块_运动', (0.552, 0.578, 0.600), rough=0.80)
M_BLK_D = make_mat('M_体块_生活', (0.628, 0.588, 0.546), rough=0.84)
M_BLK_X = make_mat('M_体块_实验', (0.576, 0.570, 0.576), rough=0.82)
M_TOWER = make_mat('M_塔', (0.560, 0.402, 0.222), rough=0.72)
M_GATE = make_mat('M_牌坊', (0.440, 0.248, 0.148), rough=0.75)
M_BRIDGE = make_mat('M_桥面', (0.416, 0.410, 0.394), rough=0.74,
                    noise_scale=0.12, col_b=(0.370, 0.365, 0.350), bump=0.2, bump_scale=4.0)


# ==================================================================
# 3. 网格装配
# ==================================================================
BUF = {}


def emit(mat, verts, faces):
    v, f = BUF.setdefault(mat, ([], []))
    off = len(v)
    v.extend(verts)
    f.extend([[i + off for i in fc] for fc in faces])


def _force_up(bm):
    """把法线朝下的面翻过来，返回翻转数量。

    岸坡、驳岸、对岸、水翼、路面这类**开放曲面**（非闭合网格）交给
    recalc_face_normals 时，它只能保证各面"彼此一致"，整体朝里还是朝外
    是随机的 —— 结果就是某些坡面法线朝下，被渲染成一大块死黑的色块
    （山水全景图左下/右下那两块深色就是这么来的，射线检测证实是
    SITE_对岸远山 与 SITE_岸坡驳岸，不是水）。

    场地模型里没有真正的倒悬面，所以「法线 Z 分量为负就翻转」是安全的。
    注意：不要用在建筑体块上 —— box 的底面法线本来就该朝下。
    """
    n = 0
    for f in bm.faces:
        if f.normal.z < -0.02:
            f.normal_flip()
            n += 1
    return n


def _finish_mesh(me, smooth, up, recalc=True):
    """recalc=False 时**完全信任调用方给的面环绕方向**。

    坡屋面那种"上表面+外檐边+下表面"的薄壳是开放网格，recalc 只能保证
    彼此一致、整体朝里朝外随机；而 up=True 又会把本来就该朝下的檐底面
    翻上来。这种构件必须自己把法线推对（见 stage1 的 roof_ring），
    然后跳过 recalc。
    """
    bm = bmesh.new()
    bm.from_mesh(me)
    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if up:
        _force_up(bm)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth


def flush(name, mat, coll_target, flat=True, up=False, recalc=True):
    if mat not in BUF:
        return None
    verts, faces = BUF.pop(mat)
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.validate()
    _finish_mesh(me, not flat, up, recalc)
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    coll_target.objects.link(ob)
    return ob


def new_obj(name, verts, faces, mat, coll_target, smooth=False, up=False, recalc=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.validate()
    _finish_mesh(me, smooth, up, recalc)
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    coll_target.objects.link(ob)
    return ob


# ==================================================================
# 4. 半岛地形
# ==================================================================
Z_TOP = 3.0          # 半岛地面标高
Z_WATER = 0.0        # 水面标高
Z_BANK = -3.4        # 岸坡入水深度

P_BANK = offset_poly(P0, 16.0)          # 岸坡外缘
P_SKIRT = offset_poly(P0, 19.0)         # 裙边（封底）

emit(M_GRASS, *cap(P0, Z_TOP))
emit(M_BANK, *band(P0, Z_TOP, P_BANK, Z_BANK))
emit(M_BANK, *band(P_BANK, Z_BANK, P_SKIRT, -14.0))

# ---- 南侧陆域：颈口 768 m → 向南喇叭形展开成大陆 ----
# 早先写成一条 768 m 宽、3.4 km 长的等宽绿带，渲出来像一条"绿地跑道"，
# 半岛完全读不出来。真实江河半岛的样子是：校园所在的半岛向北探入河湾，
# 南端收成颈口与大陆相连。所以这里让陆地由颈口向南迅速展开成大陆，
# 半岛的"探出感"才成立。
MAIN = [W(180, 516), W(500, 516),
        (2400.0, -1500.0), (2400.0, -3000.0),
        (-2400.0, -3000.0), (-2400.0, -1500.0)]
emit(M_GRASS, *cap(MAIN, Z_TOP))
emit(M_BANK, *band(MAIN, Z_TOP, offset_poly(MAIN, 18.0), Z_BANK))

# ---- 水面（一张大平面，把河湾与外侧水域一次铺满） ----
emit(M_WATER, *rect(-4000, -3800, 4000, 4200, Z_WATER))

# ==================================================================
# 5. 对岸陆域 + 远山（同一张「同心多环」网格驱动）
# ==================================================================
# 早先的写法是「一块平板对岸 + 一张独立的远山矩形网格」，两者在交界处
# 只能靠高度错开，且远山网格会伸出对岸边界外悬空。改成沿河岸由近及远的
# 同心环网格后，岸线、缓丘、山脊共用同一个高度函数，不会再打架。
# 河宽 220 m 时，对岸离校园只有 220 m，远山被推到 3~4 km 外，
# 山小、河窄、对岸又和校园一样高，"背山面水"完全读不出来。
# 按真实大江大河的量级放宽到 420 m，对岸压低到 1.8 m，
# 校园（3.0 m）明显高出一档，半岛感与"玉带环腰"才立得住。
RIVER_W = 420.0
FAR_BASE = 1.8                                # 对岸滩地标高
P1 = offset_poly(P0, RIVER_W)                 # 对岸近水边
P1B = offset_poly(P0, RIVER_W + 26.0)         # 岸坡顶
P2 = offset_poly(P0, RIVER_W + 2700.0)        # 对岸远缘

# 峰高：第一版 170~295 m，在 3~4 km 视距上只有 4° 视角，
# 渲出来像一排"蓝馒头"浮在水汽里。抬到 225~390 m 并把山脚前移，
# 山体才压得住画面、才有"背山"的气势。
PEAKS = [(-1980, 430, 285), (-1060, 360, 345), (-360, 400, 276),
         (110, 450, 390), (820, 390, 330), (1560, 410, 285), (2260, 350, 225)]


def ridge(x, y):
    """山脊高度剖面（米）：前排低丘 + 后排主脊，两层拉开纵深。

    单靠一层高斯峰会渲染成一条光滑的"蓝馒头"——没有前中后的层次，
    眼睛读不出距离。前排压一条低丘是让山体立起来的关键。
    """
    h = 0.0
    for cx, w, a in PEAKS:
        h += a * math.exp(-((x - cx) / w) ** 2)
    h *= 1.0 + 0.20 * math.sin(x * 0.0021) + 0.12 * math.sin(x * 0.0057 + 1.7)
    front = (95.0 * (1.0 + 0.55 * math.sin(x * 0.0016 + 0.9))
             * math.exp(-((y - 1430.0) / 340.0) ** 2))
    back = h * smoothstep(1560.0, 2350.0, y)
    return max(0.0, front + back) * smoothstep(1160.0, 1400.0, y)


def land_mask(y):
    """远岸陆地的南北掩膜：南侧沉入水下，只保留北岸。

    同心环网格会把"对岸"沿半岛轮廓铺成一整圈 —— 从总平面看就是一条
    环形护城河，从鸟瞰看是一圈绿带，怎么都不像江河。让南半边的对岸
    沉到水面以下，河湾就变成一片向北敞开的水域、只在北岸起山，
    「背山面水」才真正成立（桥的远端另外补一块水口砂落脚）。
    """
    return smoothstep(900.0, 1450.0, y)


def far_z(x, y, d):
    """对岸地形高度：河岸留一段窄滩，随即起坡 —— 山要贴着水立起来。

    早先的缓坡区间是 580 m，渲出来对岸是一条又宽又平的深绿带，
    把河和山隔开，"背山面水"就散了。收到 370 m 后山脚几乎压到水边。
    """
    near = smoothstep(RIVER_W + 30.0, RIVER_W + 400.0, d)
    roll = (48.0 * math.sin(x * 0.00052) * math.cos(y * 0.00071)
            + 22.0 * math.sin(x * 0.0014 + 2.0) * math.cos(y * 0.0011)
            + 9.0 * math.sin(x * 0.0037 + 1.1) * math.cos(y * 0.0029))
    h = FAR_BASE + (roll + ridge(x, y)) * near
    return -26.0 + (h + 26.0) * land_mask(y)


# 近岸岸坡（水面 → 岸顶）：顶面高度必须逐点取 far_z，
# 否则和同心环网格在接缝处会差出一截台阶；沉入水下的段落夹住下限，
# 免得顶边低于底边翻出一片碎面
emit(M_BANK, *band_open(P1, Z_BANK, P1B,
                        [max(-3.0, far_z(x, y, RIVER_W + 26.0)) for x, y in P1B]))

# 环距由密到疏：近岸细、远处粗，控制面数的同时保证山脊剪影不出现大平面。
# 增长系数从 0.085 收到 0.05 —— 0.085 时最外几环间距达 275 m，
# 山脊剪影被切成一块块大平面（远看就是一个悬在天上的多边形色块）。
RING_OFF = [RIVER_W + 26.0]
_r = RIVER_W + 26.0
while _r < RIVER_W + 2700.0:
    _r = min(_r + 45.0 + (_r - RIVER_W) * 0.05, RIVER_W + 2700.0)
    RING_OFF.append(_r)
RINGS = [offset_poly(P0, d) for d in RING_OFF]
NPt, NR = len(P0), len(RING_OFF)

NS = 14                     # 东西两翼向南的分段数
SOUTH_END = -3800.0


def cap_grid(idx):
    """东西两翼：同一套环 × 向南分段。

    不能用一块 2.6 m 的平板收尾 —— 那会和环网格的地形在接缝处拉出硬直边。
    用环 × 分段的小网格，接缝处高度天然吻合。
    """
    v, f = [], []
    for r in range(NR):
        px, py = RINGS[r][idx]
        for s in range(NS + 1):
            yy = py + (SOUTH_END - py) * s / NS
            v.append((px, yy, far_z(px, yy, RING_OFF[r])))
    for r in range(NR - 1):
        for s in range(NS):
            a = r * (NS + 1) + s
            f.append([a, a + 1, a + NS + 2, a + NS + 1])
    return v, f


# 主环网格 + 东西两翼 + 远缘收边，**合成一个对象**：
# 远山材质用 Generated 坐标做高度渐变，拆成多个对象会让每块各按自己的
# 包围盒取值，同一海拔颜色不同，接缝处会露馅。
fv, ff = [], []


def push(verts, faces):
    base = len(fv)
    fv.extend(verts)
    ff.extend([[i + base for i in fc] for fc in faces])


for r, ring in enumerate(RINGS):
    d = RING_OFF[r]
    for (x, y) in ring:
        fv.append((x, y, far_z(x, y, d)))
for r in range(NR - 1):
    for i in range(NPt - 1):
        a = r * NPt + i
        ff.append([a, a + 1, a + NPt + 1, a + NPt])

for _idx in (0, -1):
    push(*cap_grid(_idx))
push(*band_open(RINGS[-1], [far_z(x, y, RING_OFF[-1]) for x, y in RINGS[-1]],
                offset_poly(P0, RIVER_W + 2790.0), -14.0))

new_obj('SITE_对岸远山', fv, ff, M_MTN, C_SITE, smooth=True, up=True)
print(f'[site] 对岸网格 {NR} 环 × {NPt} 点，合计 {len(ff)} 面')

# 两翼贴河的一侧同样要有岸坡
emit(M_BANK, *band_open([P1[0], (P1[0][0], SOUTH_END)], Z_BANK,
                        [P1B[0], (P1B[0][0], SOUTH_END)], 2.6))
emit(M_BANK, *band_open([P1[-1], (P1[-1][0], SOUTH_END)], Z_BANK,
                        [P1B[-1], (P1B[-1][0], SOUTH_END)], 2.6))

# ==================================================================
# 7. 中轴序列
# ==================================================================
AX_X = 0.0
N_GATE = 33.6          # 牌坊
N_PLAZA = 129.6        # 明堂广场
N_MOUND = 244.8        # 案山土丘
N_LIB = 518.4          # 图书馆
N_TOWER = 648.0        # 镇山塔
N_DECK = 782.4         # 观景台

# ---- 中轴大道（铺装带，从牌坊到图书馆前庭） ----
# ★★ 末端点由 `N_LIB + 46.0`（= 564.4）改成 `N_LIB − 46.0`（= 472.4）。
#   原来的末端落在图书馆**北侧 5.4 m**，于是这条 42 m 宽的铺装带**纵穿整座图书馆**：
#   ① 台基里的 3232 m² 被埋在实体里（看不见，但属于"不该有的几何"）；
#   ② 台基北面之外还露出 **42 × 6 m 的一条铺装舌**（Z 3.06 浮在草地上）—— 这条是**看得见的**。
#   图书馆台基（stage1 的 `PODIUM`）一层是 112×80 ⇒ 南面在 Y 478.4、北面在 Y 558.4，
#   而南向丹陛的**下缘在 Y 473.7**。所以中轴大道的正确终点是**丹陛脚下**：
#   R1 的 6.4 节会用同一条口径重建 `SITE_中轴大道`（那里才是最终生效的一份），
#   这一版只影响场地阶段成图，但**两处必须写同一个终点**，否则场地成图与
#   R1 之后的全园成图对不上。终点取 `N_LIB − 52.0` = 466.4（= R1 御道分格的北端）。
#   （`ribbon` 的所有控制点都在 X = 0 上，所以中间点不影响形状，只改末端即可。）
axis_pts = [(AX_X, -30.0), (AX_X, N_PLAZA), (AX_X, N_MOUND - 34.0),
            (AX_X, N_MOUND + 34.0), (AX_X, N_LIB - 52.0)]
emit(M_PAVE_W, *ribbon(axis_pts, 42.0, Z_TOP + 0.06))
# 中轴两侧的绿化条
emit(M_GRASS_D, *ribbon([(x - 34.0, y) for x, y in axis_pts], 22.0, Z_TOP + 0.04))
emit(M_GRASS_D, *ribbon([(x + 34.0, y) for x, y in axis_pts], 22.0, Z_TOP + 0.04))

# ---- 明堂广场（椭圆铺装） ----
# ★ V3 删掉了这里的 `emit(M_PATH, *band(plaza, …, scale_poly(plaza, 1.085, …)))`
#   （明堂椭圆环道）。两条理由：
#   ① **它已经被 R1 取代** —— R1 把明堂广场原位挖成下沉智谷，椭圆环道的位置
#      现在是谷口。R1 的老注释写的就是"去掉明堂椭圆环"，只是当年并进 `SITE_步道`
#      一起被整体替换掉了，所以这个环道**从来没有真正消失过**；
#   ② 实测它穿楼 2 栋：研究生公寓 470 m²、宿舍E 367 m²
#      （椭圆 a=118 / b=74、中心 (0,129.6) 的西/东弧正好落在两栋楼里）。
plaza = []
for i in range(96):
    a = 2 * math.pi * i / 96
    plaza.append((AX_X + 118.0 * math.cos(a), N_PLAZA + 74.0 * math.sin(a)))
emit(M_PAVE, *cap(plaza, Z_TOP + 0.05))

# ---- 案山土丘（径向穹顶；做对景用，刻意压低压扁，不能挡住后面的塔） ----
MOUND_R, MOUND_H = 48.0, 9.0
mring = 40
mv2, mf2 = [(AX_X, N_MOUND, Z_TOP + MOUND_H)], []
for r_i, rr in enumerate((0.34, 0.62, 0.84, 1.0)):
    zz = Z_TOP + MOUND_H * (1.0 - rr ** 2) ** 1.5
    for i in range(mring):
        a = 2 * math.pi * i / mring
        mv2.append((AX_X + MOUND_R * rr * math.cos(a), N_MOUND + MOUND_R * rr * math.sin(a), zz))
for i in range(mring):
    mf2.append([0, 1 + i, 1 + (i + 1) % mring])
for r_i in range(3):
    a0 = 1 + r_i * mring
    b0 = a0 + mring
    for i in range(mring):
        j = (i + 1) % mring
        mf2.append([a0 + i, a0 + j, b0 + j, b0 + i])
new_obj('SITE_案山土丘', mv2, mf2, M_MOUND, C_SITE, smooth=True)

# ---- 观景台（半岛尖端的半圆平台） ----
deck = [(AX_X - 34.0, N_DECK - 6.0)]
for i in range(25):
    a = math.pi * i / 24
    deck.append((AX_X + 34.0 * math.cos(a), N_DECK - 6.0 + 34.0 * math.sin(a)))
deck.append((AX_X + 34.0, N_DECK - 6.0))
emit(M_PAVE, *cap(deck, Z_TOP + 0.35))
emit(M_BANK, *band_open(deck, Z_TOP + 0.35,
                        [(x, y) for x, y in deck], Z_TOP + 0.0))

# ---- 主校门牌坊（三间四柱） ----
GATE_Y = N_GATE
for dx in (-26.0, -9.0, 9.0, 26.0):
    emit(M_GATE, *box(dx, GATE_Y, 2.6, 2.6, 13.0, Z_TOP))
emit(M_GATE, *box(0.0, GATE_Y, 62.0, 2.0, 1.6, Z_TOP + 13.0))     # 主额枋
emit(M_GATE, *box(0.0, GATE_Y, 44.0, 1.6, 1.2, Z_TOP + 10.4))     # 次额枋
emit(M_GATE, *box(0.0, GATE_Y, 72.0, 3.4, 1.1, Z_TOP + 14.6))     # 檐口
emit(M_GATE, *box(0.0, GATE_Y, 30.0, 2.2, 0.9, Z_TOP + 15.7))     # 脊

# ---- 陆路引导：自南接入的林荫大道（D10「陆路自南、尽端对山」） ----
# 没有这一段时，南侧就是一大片空草坪，山水全景的前景全是绿地，
# 既读不出"从哪里进校园"，也让画面下半部毫无信息。
APPROACH = [(0.0, -1000.0), (0.0, -620.0), (0.0, -260.0), (0.0, N_GATE - 18.0)]
emit(M_PAVE_W, *ribbon(APPROACH, 36.0, Z_TOP + 0.06))
# 校门前导广场（牌坊需要一块"前庭"才站得住）
emit(M_PAVE, *round_rect(-96.0, N_GATE - 76.0, 96.0, N_GATE - 8.0, 16.0, Z_TOP + 0.05))
# 大道两侧绿带
emit(M_GRASS_D, *ribbon([(x - 30.0, y) for x, y in APPROACH], 22.0, Z_TOP + 0.04))
emit(M_GRASS_D, *ribbon([(x + 30.0, y) for x, y in APPROACH], 22.0, Z_TOP + 0.04))

# ==================================================================
# 8. 路网
# ==================================================================
def road(pts, width, mat=M_ROAD, z=Z_TOP + 0.07, closed=False):
    emit(mat, *ribbon(pts, width, z, closed=closed))


# ---- 环形主路（★ V3 重排：外推到各分区之外 + 南段改走生活区林荫街） ----
# 旧折线的西/东弧在 X ±424~452，而各分区外缘在 X −444 / 436.8 ⇒
# **每个分区最外侧那一栋楼都被切**。实测穿楼 5 栋：
#   科研中心 1298 / 演艺中心 1292 / 创新中心 1166 / 教学D 1055 / 校医院 754 m²。
# 新折线三处调整：
#   ① 西/东弧外推到 ∓481 / ±481（`_diag_edge.py` 实测 Y 232~640 段岸线还有
#      100~150 m 余量，外推不会下水）
#   ② 北弧由 Y 812 压到 780（讲堂自 Y 818 起，留 31 m）
#   ③ 南弧改走**两排宿舍之间的林荫街 Y 77.5**（南排顶 65 / 北排底 89，
#      路带宽 12 ⇒ 两侧各留 5.5 m 绿化带）
RING_ROAD = [(-373.0, 77.5), (-373.0, 108.0), (-384.0, 126.0), (-399.0, 134.0),
        (-420.0, 148.0), (-440.0, 160.0), (-465.0, 205.0), (-478.0, 280.0),
        (-481.0, 380.0), (-481.0, 470.0), (-480.0, 560.0), (-470.0, 620.0),
        (-440.0, 675.0), (-390.0, 715.0), (-320.0, 748.0), (-220.0, 768.0),
        (0.0, 780.0), (220.0, 768.0), (320.0, 748.0), (390.0, 715.0),
        (440.0, 675.0), (470.0, 620.0), (480.0, 560.0), (481.0, 470.0),
        (481.0, 380.0), (478.0, 280.0), (465.0, 205.0), (440.0, 160.0),
        (420.0, 148.0), (399.0, 134.0), (384.0, 126.0), (373.0, 108.0),
        (373.0, 77.5), (200.0, 77.5), (0.0, 77.5), (-200.0, 77.5)]
# ★ 西/东弧的转弯段（Y 77.5→134）由 `(-373, 105) → (-390, 130)` 改成
#   `(-373, 108) → (-384, 126) → (-399, 134)`：旧折线在 Y 112~116 处
#   外缘越出岸线 22 m²（`_diag_edge.py` 实测 Y 110 岸线仅 ±384，
#   而旧折线的路带外缘到 386.5）。改后最紧处 Y 115 外缘 385.5 < 岸线 391.5 ✓。
# ★ **`(-373, 77.5)` 这个点不能删**：它既是西弧的起点，也是南段林荫街的西端。
#   删掉它，闭合折线就会从 `(-200, 77.5)` 直接连到 `(-373, 108)`，
#   这条斜线正好穿过宿舍 A（实测 1033 m²）。
RING = RING_ROAD      # 兼容别名（本文件内部后续引用）
road(RING_ROAD, 12.0, closed=True)

# ---- 内环次路（★ V3：与 R4 智慧环廊**同线** —— "廊下即街"） ----
# 旧版是 `scale_poly(RING_ROAD, 0.52, 0, 430)` 的**等比内缩环**（X ±250 / Y 247~612），
# 实测穿楼 4 栋：公共教学楼 1481 / 体育馆 1168 / 实验楼A 1096 / 创客工坊 650 m²。
# 根因：等比内缩是"按外环的形状猜"出来的，不是按建筑位置排的 ——
#   内缩环东弧 X 250 压在公共教学楼西缘 237.4 上、西弧 −250 压在体育馆东缘 −244.2 上，
#   而这两个数跟外环的 ±481 没有任何关系。外环一改、建筑一挪，内缩环必然穿。
# 新版：直接采用 R4 环廊那条**逐点量过净距**的中心线（X ±206 / Y 146~596）。
#   一举三得：① 净距已逐栋校核过（≥8 m，见 `_check_road.py`）；
#            ② 廊的桥墩正好落在 12 m 路面的中央分隔带上；
#            ③ 1.56 km 的高架廊有了"廊下即街"的读法。
#   ★ 这是**唯一真源**：`build_campus_r4.py` 里写 `RING = RING_LOOP`，不再各写一份。
RING_LOOP = [
    (0.00, 596.00), (30.00, 588.00), (60.00, 580.00), (96.00, 574.00),
    (148.00, 568.00), (186.00, 546.00), (202.00, 500.00), (206.00, 440.00),
    (206.00, 380.00), (202.00, 320.00), (198.00, 262.00), (196.00, 210.00),
    (190.00, 166.00), (178.00, 148.00), (150.00, 147.50), (110.00, 147.50),
    (60.00, 147.00), (0.00, 146.00),
    (-60.00, 147.00), (-110.00, 147.50), (-150.00, 147.50), (-178.00, 148.00),
    (-190.00, 166.00), (-196.00, 210.00), (-198.00, 262.00), (-202.00, 320.00),
    (-206.00, 380.00), (-206.00, 440.00), (-202.00, 500.00), (-186.00, 546.00),
    (-148.00, 568.00), (-96.00, 574.00), (-60.00, 580.00), (-30.00, 588.00),
]

# ★★ 内环次路在**下沉智谷处断开**（C 形开敞弧，不是闭合环）。
#   廊能飞越谷，**路不能** —— 谷底 Z −5.0、谷口 X ±21、智谷台地 X ±33.2 / Y 94.5~188.5，
#   而路面在 Z_TOP + 0.065 = 3.07，正好落进台地的踏步里（实测穿楼 806 m²）。
#   处置：把环廊折线**在谷口那一点切开** → 两条开敞弧；中轴以步行御道下穿谷底连通。
#   这比"绕着谷兜一圈"好：绕行要么撞人文书院（Y 162.5~240.6、X ±(49.6~161.6)），
#   要么贴着宿舍北缘（Y 132.5）走，两条都不干净。
_GAP_X, _GAP_Y0, _GAP_Y1 = 40.0, 90.0, 192.0
_k = next(i for i, _p in enumerate(RING_LOOP)
          if abs(_p[0]) < _GAP_X and _GAP_Y0 <= _p[1] <= _GAP_Y1)
INNER = RING_LOOP[_k + 1:] + RING_LOOP[:_k]
road(INNER, 12.0, M_PATH, Z_TOP + 0.065)
print(f'[site] 内环次路：与环廊同线，在智谷处断开 —— {len(INNER)} 点'
      f'（开口 {INNER[-1][0]:.0f} → {INNER[0][0]:.0f} m）')

# ==================================================================
# 环廊路径的弧长工具 + **站点表（唯一真源）**
# ==================================================================
# ★★ 站点表为什么必须在**场地阶段**就定下来（2026-09-25）：
#   ① `build_campus_r4.py` 要用它摆站台 / 门洞 / 垂直交通；
#   ② **`TREE_EXCLUDE` 也要用它** —— 树是在本脚本里一次性合并成
#      `SITE_树干` / `SITE_树冠` 两个对象的，等 R4 再做楼梯就删不动了。
#      实测：开敞楼梯做完后，有树正好长在梯段里（立面图实拍）。
#   两处各写一份的下场就是改了一处、另一处悄悄走散 —— 所以弧长工具与站点表
#   **只留这一份**，R4 直接引用（与 `RING = RING_LOOP` 同一套做法）。
def _seg_table(pts):
    """闭合折线的分段表：[(x0, y0, dx, dy, len, s0), ...] + 总长"""
    segs, s = [], 0.0
    n = len(pts)
    for i in range(n):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % n]
        dx, dy = x1 - x0, y1 - y0
        d = math.hypot(dx, dy)
        if d < 1e-9:
            continue
        segs.append((x0, y0, dx, dy, d, s))
        s += d
    return segs, s


_SEGS, RING_LEN = _seg_table(RING_LOOP)
RING_CX = sum(p[0] for p in RING_LOOP) / float(len(RING_LOOP))
RING_CY = sum(p[1] for p in RING_LOOP) / float(len(RING_LOOP))


def ring_at(s):
    """按弧长 s 取环廊中心线的点 + 切向 + **向外的法向**。

    向外的法向用"背离形心"判定，不靠绕向正负号 ——
    `signed_area` 能算，但绕向一旦被谁改一下，整个环廊的内外侧会静默对调。
    """
    s = s % RING_LEN
    for x0, y0, dx, dy, d, s0 in _SEGS:
        if s <= s0 + d:
            t = (s - s0) / d
            x, y = x0 + dx * t, y0 + dy * t
            tx, ty = dx / d, dy / d
            nx, ny = -ty, tx
            if (x + nx - RING_CX) ** 2 + (y + ny - RING_CY) ** 2 < \
               (x - nx - RING_CX) ** 2 + (y - ny - RING_CY) ** 2:
                nx, ny = -nx, -ny
            return x, y, tx, ty, nx, ny
    x0, y0, dx, dy, d, s0 = _SEGS[-1]
    return x0, y0, dx / d, dy / d, -dy / d, dx / d


# 站点目标点 = 各分区形心。★ **不写死弧长** —— 折线一改（V3 重排过环廊），
# 写死的弧长会让站台静默跑到别的区去，而且不报任何错。
RING_STATION_TGT = (
    ('S1_运动医疗区', (-284.0, 274.0)),
    ('S2_科技区',     (-284.0, 530.0)),
    ('S3_中轴人文区', (0.0, 596.0)),
    ('S4_实验区',     (281.0, 530.0)),
    ('S5_教学区',     (281.0, 274.0)),
    ('S6_生活区东',   (150.0, 147.5)),
    ('S7_生活区西',   (-150.0, 147.5)),
)


def ring_nearest_s(tx, ty):
    """环廊中心线上离 (tx, ty) 最近的**弧长**。"""
    best, bs = 1e18, 0.0
    n = max(2, int(RING_LEN / 2.0))
    for k in range(n):
        s = k * RING_LEN / n
        x, y = ring_at(s)[:2]
        d = (x - tx) ** 2 + (y - ty) ** 2
        if d < best:
            best, bs = d, s
    return bs


def ring_fill_stations(base, max_gap):
    """在间距 > `max_gap` 的缝里补"纯楼梯节点"，补到**处处 ≤ max_gap**。

    ★ 用**直接计算**（`k = ceil(gap / max_gap) - 1`），不用"反复劈最大间隙"的
      贪婪循环 —— 贪婪版会踩浮点：劈到 150 之后可能是 `150.0000001`，
      `<= 150.0` 判假就再劈一刀，站点数凭空多出来，而且不报错。
      容差取 1e-6（相对误差 ~5e-9）：1e-9 不够，`gap/max_gap` 在 gap≈300 时的
      浮点噪声本身就有 1e-9 量级。
    """
    out = sorted(base, key=lambda r: r[1])
    n = len(out)
    res = []
    for i in range(n):
        s0 = out[i][1]
        gap = (out[(i + 1) % n][1] - s0) % RING_LEN
        res.append(out[i])
        k = max(0, int(math.ceil(gap / max_gap - 1e-6)) - 1)
        for j in range(1, k + 1):
            res.append((f'N{len(res)}_纯楼梯节点',
                        (s0 + gap * j / float(k + 1)) % RING_LEN, None))
    return tuple(sorted(res, key=lambda r: r[1]))


RING_STATIONS = ring_fill_stations(
    tuple((n, ring_nearest_s(t[0], t[1]), t) for n, t in RING_STATION_TGT), 150.0)
_RING_GAPS = [(RING_STATIONS[(i + 1) % len(RING_STATIONS)][1]
               - RING_STATIONS[i][1]) % RING_LEN
              for i in range(len(RING_STATIONS))]
print(f'[site] 环廊站点 {len(RING_STATIONS)} 处'
      f'（7 处分区形心 + 补齐到最大间距 ≤ 150 m；实际最大 '
      f'{max(_RING_GAPS):.0f} m）')

# ---- 东西主路（横穿中轴，连接科技区与实验区） ----
R_EW_MAIN = [(-478.0, 404.0), (-180.0, 404.0), (180.0, 404.0), (478.0, 404.0)]
road(R_EW_MAIN, 12.0)
# ---- 东西次路（★ V3：Y 196 → 290） ----
# 旧折线 Y 196 **正好落在人文书院（Y 162.5~240.6）身上**，实测穿楼 3 栋：
# 人文 Academy 1611 / Academy#2 1566 / 教学C 1474 m²。
# 新 Y 290 是量出来的自由带：南侧教学C/D 顶 250.8/252.2、北侧公共教学楼/教学B 底 296/303.1
# ⇒ 净距 37.8 / 6.0 m。**中段断开**：人文区（|X| ≤ 161.6）留给中轴铺装，
# 环廊/内环在 X ±206 处纵向贯通，不需要次路横穿中轴。
for _a, _b in ((-481.0, -206.0), (206.0, 481.0)):
    road([(_a, 290.0), (_b, 290.0)], 9.0, M_PATH)

# ---- 生活区南北园路（★ V3 新增：走两列宿舍之间的街心） ----
# 旧版是两条"南北放射支路"，起点 (±210, 96) 落在宿舍 E / 宿舍 B 里，尾段
# (200,560)→(130,660) 又穿 Academy#3。新版改成**两条南北园路**，
# 只走生活区两列宿舍之间的街心（西列间 −240.8~−215.2 / 东列间 223.8~249.4），
# 南接林荫街（Y 77.5），北端斜折一段接上内环次路的西/东弧。
# 纵向贯通交给内环（X ±206）与主环（X ±373）。
for _x in (-228.0, 236.0):
    road([(_x, 18.0), (_x, 134.0), (_x * 0.855, 158.0)], 6.0, M_PATH)

# ---- 实验区 / 科技区支路（★ V3 新增） ----
# 体检（`_diag_plan.py` 的"到最近 路/廊 的净距"）量出这两片是**真空**：
#   实验楼B 37.3 m / 科研中心 33.3 m / 科技区学生中心 49.4 m 才有路。
#   原因是这两片都在 Y 450~650 的**北带**，而当时的横路只有 Y 404（东西主路）一条。
# 补三条：东实验支路 Y 545、西科技支路 Y 530、实验 A/B 之间的连络 X 319。
#   ★ 东西两条的 Y **不一样**不是笔误：东侧科研中心南缘 Y 555.2，
#     而西侧创新中心 / 学生中心南缘 Y 543.8 / 544.2 —— 两条带子本身就错开 13 m。
#     取同一个 Y 会有一侧压进楼里（Y 545 时西侧净距 −3.3 m）。
for _x0, _x1, _y, _w in ((190.0, 481.0, 545.0, 9.0),
                         (-481.0, -190.0, 530.0, 9.0)):
    road([(_x0, _y), (_x1, _y)], _w, M_PATH)
road([(319.0, 408.0), (319.0, 545.0)], 6.0, M_PATH)

# ---- 滨水步道（★ V3：只留**半岛开阔段**，开敞弧，颈部不放） ----
# 旧版是 offset_poly(P0, -22~-30) 的**闭合环**，实测穿楼 6 栋（最大 1414 m²）。
# 两条硬约束叠在一起，颈部（Y 0~110）根本排不下：
#   ① 颈部岸线是**直壁 ±384 m**（`_diag_edge.py` 实测 Y 0~110 恒定），
#      而两排 106 m 宿舍把 ±362 填满 ⇒ 内缩 22~30 m 的环一定落进宿舍；
#   ② 同一条岸线带上还要塞三样东西：主环林荫街（X ±367~379）、
#      R6 滨水基座（岸线内缩 1.5~10.5 m）、滨水步道自身 ⇒ 22~31 m 的带宽不够分。
# 新版三条改动：
#   ① 内缩 11~19 m —— 正好落在 R6 基座（≤10.5 m）之外、主环（≥367）之内；
#   ② **只取 Y ≥ 150 的开阔段**，颈部整段不放（那里由林荫街直接下到岸边）；
#   ③ 北端讲堂处断开成两条弧（`WALK_BAN`）。
WALK_D0, WALK_D1 = 11.0, 19.0
WALK = offset_poly(P0, -WALK_D0)
WALK_OUT = offset_poly(P0, -WALK_D1)
WALK_YMIN = 150.0                          # 颈部（Y < 150）不放滨水步道
WALK_BAN = (-55.0, 812.0, 55.0, 900.0)     # 讲堂占位（禁止段）


def _walk_ok(_p):
    if _p[1] < WALK_YMIN:
        return False
    return not (WALK_BAN[0] <= _p[0] <= WALK_BAN[2]
                and WALK_BAN[1] <= _p[1] <= WALK_BAN[3])


_wruns, _wcur = [], []
for _i in range(len(WALK)):
    if _walk_ok(WALK[_i]):
        _wcur.append(_i)
    else:
        if len(_wcur) > 8:
            _wruns.append(_wcur)
        _wcur = []
if len(_wcur) > 8:
    _wruns.append(_wcur)

# ★★ 滨水步道**单独成一个对象**（`SITE_滨水步道`），不再并进 `SITE_步道`。
#   为什么必须分家：R1 要重建 `SITE_步道`（先 `_DROP` 再 `emit_to`），
#   而 `emit_to` 是**整体替换**不是追加 —— 并在一起的话，R1 会把
#   内环次路 / 东西次路 / 两条放射支路 / 广场环路带**一并删掉**，
#   成图里就只剩一条贴着岸线的孤零零的步道。
#   这正是用户意见「部分建筑之间没有连通的道路」的**根因**。
_WV, _WF = [], []
for _wi, _idx in enumerate(_wruns):
    _wl = sum(math.hypot(WALK[_idx[k + 1]][0] - WALK[_idx[k]][0],
                         WALK[_idx[k + 1]][1] - WALK[_idx[k]][1])
              for k in range(len(_idx) - 1))
    # ★ 断开段必须用 band_open（band 会自动把首尾连起来，形成一条横穿半岛的假路）
    _v, _f = band_open([WALK[i] for i in _idx], Z_TOP + 0.05,
                       [WALK_OUT[i] for i in _idx], Z_TOP + 0.05)
    _off = len(_WV)
    _WV.extend(_v)
    _WF.extend([[i + _off for i in fc] for fc in _f])
    print(f'[site] 滨水步道弧 {_wi + 1}/{len(_wruns)}：{len(_idx)} 点 / 长约 {_wl:.0f} m')
if _WV:
    new_obj('SITE_滨水步道', _WV, _WF, M_PATH, C_ROAD, up=True)

# ---- 水口桥（东南下游，跨东侧河道） ----
BR_I = None
for i, p in enumerate(P0):
    if 100.0 < p[1] < 420.0 and (BR_I is None or p[0] > P0[BR_I][0]):
        BR_I = i
bx0, by0 = P0[BR_I]
bx1, by1 = P1[BR_I]
_bp = [(bx0 + (bx1 - bx0) * t, by0 + (by1 - by0) * t) for t in (0.0, 0.34, 0.67, 1.0)]
emit(M_BRIDGE, *ribbon(_bp, 15.0, Z_TOP + 6.0))
# 桥墩：河宽 420 m，两三根墩撑不住，按 14% 间距布墩
for t in (0.14, 0.28, 0.42, 0.56, 0.70, 0.86):
    px = bx0 + (bx1 - bx0) * t
    py = by0 + (by1 - by0) * t
    emit(M_BANK, *box(px, py, 4.0, 4.0, Z_TOP + 6.0, -6.0))
# 桥栏
_bd = math.hypot(bx1 - bx0, by1 - by0) or 1.0
_bux, _buy = (bx1 - bx0) / _bd, (by1 - by0) / _bd
_bpx, _bpy = -_buy, _bux
for _s in (-1.0, 1.0):
    emit(M_BRIDGE, *ribbon(
        [(bx0 + (bx1 - bx0) * t + _bpx * 7.0 * _s, by0 + (by1 - by0) * t + _bpy * 7.0 * _s)
         for t in (0.0, 0.34, 0.67, 1.0)], 1.1, Z_TOP + 7.4))

# ---- 水口砂：桥对岸的落脚小丘 ----
# 南半边对岸沉入水下后，桥的远端就悬在水上了。风水上水口本来就要有
# 砂（罗星）锁气，这里补一座小丘正好一举两得：既让桥落得下脚，
# 也让"水口收束"从平面概念变成看得见的东西。
SAND_R, SAND_H = 168.0, 14.0
_sx, _sy = bx1 + _bux * 96.0, by1 + _buy * 96.0
_sv, _sf = [(_sx, _sy, SAND_H)], []
_sr = ((0.34, None), (0.64, None), (0.86, None), (1.0, -7.0))
for _rr, _zz in _sr:
    if _zz is None:
        _zz = SAND_H * (1.0 - _rr ** 2) ** 1.4
    for _i in range(36):
        _a = math.tau * _i / 36
        _sv.append((_sx + SAND_R * _rr * math.cos(_a),
                    _sy + SAND_R * _rr * math.sin(_a), _zz))
for _i in range(36):
    _sf.append([0, 1 + _i, 1 + (_i + 1) % 36])
for _r in range(3):
    _a0 = 1 + _r * 36
    _b0 = _a0 + 36
    for _i in range(36):
        _j = (_i + 1) % 36
        _sf.append([_a0 + _i, _a0 + _j, _b0 + _j, _b0 + _i])
new_obj('SITE_水口砂', _sv, _sf, M_MOUND, C_SITE, smooth=True, up=True)

# ==================================================================
# 9. 七区地面铺装（与平面图配色对应）
# ==================================================================
ZONES = [
    ('中轴人文区', 294, 224, 386, 452, M_Z_HUM),
    ('科技区', 155, 248, 288, 342, M_Z_TEC),
    ('实验区', 392, 248, 522, 342, M_Z_LAB),
    ('运动医疗区', 155, 358, 288, 446, M_Z_SPT),
    ('教学区', 392, 358, 522, 446, M_Z_TEA),
    # ★ V3：两片生活区各向中间收（西 +10 m、东 −13 m）——
    #   半岛颈部只有 768 m 宽，主路要从宿舍与岸线之间过，必须把楼群整体让开
    ('生活区西', 190, 460, 298, 506, M_Z_DOR),
    ('生活区东', 385, 460, 492, 506, M_Z_DOR),
]
for name, x0, y0, x1, y1, mat in ZONES:
    a = W(x0, y1)
    b = W(x1, y0)
    emit(mat, *round_rect(a[0], a[1], b[0], b[1], 26.0, Z_TOP + 0.045))
    flush('SITE_分区_' + name, mat, C_PAVE, up=True)

# ==================================================================
# 10. 建筑体块占位（28 栋，各自独立对象）
# ==================================================================
Z_BLK = {
    '人文': (M_BLK_H, 26.0), '科技': (M_BLK_T, 30.0), '实验': (M_BLK_X, 24.0),
    '教学': (M_BLK_L, 20.0), '运动': (M_BLK_S, 22.0), '生活': (M_BLK_D, 22.0),
}

# (对象名, 分区, SVG_x, SVG_y, 宽, 进深, 高, 旋转°)
BLD = [
    # ---- 中轴人文区（东方塔阁语言） ----
    ('Library', '人文', 340, 300, 88, 58, 26.0, 0),
    ('Auditorium', '人文', 305, 375, 58, 44, 22.0, 0),
    ('Art_Museum', '人文', 375, 375, 54, 40, 18.0, 0),
    ('Academy_A', '人文', 296, 432, 44, 30, 14.0, 0),
    ('Academy_B', '人文', 384, 432, 44, 30, 14.0, 0),
    ('Bell_Tower', '人文', 292, 250, 15, 15, 34.0, 0),
    ('Academy_C', '人文', 388, 250, 44, 30, 14.0, 0),
    # ---- 科技区（未来曲面语言） ----
    ('Innovation_Center', '科技', 214, 272, 82, 62, 30.0, 8),
    ('Performing_Arts', '科技', 186, 320, 56, 44, 24.0, -10),
    ('Incubator', '科技', 258, 310, 52, 40, 20.0, 12),
    # ---- 实验区 ----
    ('Lab_A', '实验', 424, 272, 58, 42, 24.0, 0),
    ('Lab_B', '实验', 494, 272, 50, 42, 24.0, 0),
    ('Research_Institute', '实验', 458, 322, 66, 44, 26.0, 0),
    # ---- 教学区 ----
    ('Teaching_A', '教学', 424, 382, 66, 42, 20.0, 0),
    ('Teaching_B', '教学', 494, 382, 50, 42, 20.0, 0),
    ('Teaching_C', '教学', 424, 428, 66, 38, 20.0, 0),
    ('Teaching_D', '教学', 494, 428, 50, 38, 20.0, 0),
    # ---- 运动医疗区 ----
    ('Stadium', '运动', 214, 400, 168, 92, 20.0, 0),
    ('Gymnasium', '运动', 200, 438, 84, 62, 28.0, -14),
    ('Hospital', '运动', 262, 368, 54, 40, 16.0, 0),
    # ---- 生活区（西） ----
    ('Dorm_A', '生活', 224, 472, 62, 20, 22.0, 0),
    ('Dorm_B', '生活', 224, 496, 62, 20, 22.0, 0),
    ('Dorm_C', '生活', 284, 472, 50, 20, 22.0, 0),
    ('Dorm_D', '生活', 284, 496, 50, 20, 22.0, 0),
    # ---- 生活区（东） ----
    ('Dorm_E', '生活', 412, 472, 62, 20, 22.0, 0),
    ('Dorm_F', '生活', 412, 496, 62, 20, 22.0, 0),
    ('Canteen', '生活', 466, 484, 46, 40, 14.0, 0),
    ('Commercial_Street', '生活', 372, 484, 46, 38, 12.0, 0),
]

for nm, zone, sx, sy, w, d, h, rot in BLD:
    mat, _ = Z_BLK[zone]
    x, y = W(sx, sy)
    v, f = box(x, y, w, d, h, Z_TOP, math.radians(rot))
    ob = new_obj(f'BLD_{zone}_{nm}', v, f, mat, C_BLD)
    # 檐口薄板：体块也能读出"坡屋面/出檐"的意向
    v2, f2 = box(x, y, w + 3.4, d + 3.4, 0.9, Z_TOP + h, math.radians(rot))
    ob2 = new_obj(f'BLD_{zone}_{nm}_Eave', v2, f2, mat, C_BLD)
    ob2.parent = ob

# ---- 镇山塔：中轴尽端最高点，天际线的唯一支点 ----
tx, ty = W(340, 246)
tv, tf = box(tx, ty, 30.0, 30.0, 68.0, Z_TOP)
tower = new_obj('BLD_人文_Zhenshan_Tower', tv, tf, M_TOWER, C_BLD)
for lvl, (sc, hz) in enumerate(((1.34, 13.0), (1.34, 27.0), (1.34, 41.0),
                                (1.34, 55.0), (1.26, 65.0))):
    lv, lf = box(tx, ty, 30.0 * sc, 30.0 * sc, 1.5, Z_TOP + hz)
    new_obj(f'BLD_人文_Zhenshan_Tower_Eave{lvl}', lv, lf, M_TOWER, C_BLD).parent = tower

# ---- 图书馆前庭铺装 ----
fx, fy = W(340, 300)
emit(M_PAVE, *rect(fx - 78.0, fy - 74.0, fx + 78.0, fy + 74.0, Z_TOP + 0.05))

# ---- 场地曲面统一 up=True：岸坡/驳岸/对岸/水翼都是开放曲面，
#      recalc 只能保证彼此一致，不保证朝上，必须显式翻正 ----
flush('SITE_半岛地形', M_GRASS, C_SITE, up=True)
flush('SITE_岸坡驳岸', M_BANK, C_SITE, up=True)
flush('SITE_水面', M_WATER, C_WATER, up=True)
flush('SITE_对岸陆域', M_GRASS_D, C_SITE, up=True)
flush('SITE_中轴大道', M_PAVE_W, C_PAVE, up=True)
flush('SITE_广场与平台', M_PAVE, C_PAVE, up=True)
flush('SITE_步道', M_PATH, C_ROAD, up=True)
flush('SITE_校门牌坊', M_GATE, C_PAVE)
flush('SITE_主路', M_ROAD, C_ROAD, up=True)
flush('SITE_水口桥', M_BRIDGE, C_ROAD, up=True)
flush('SITE_桥墩', M_BANK, C_ROAD, up=True)
flush('SITE_案山土丘', M_MOUND, C_SITE, up=True)

# 兜底：任何还没落盘的材质键都建出来，避免有几何被静默丢掉
for _m, _nm in ((M_GRASS, 'SITE_草地_补'), (M_BANK, 'SITE_驳岸_补'),
                (M_WATER, 'SITE_水面_补'), (M_GRASS_D, 'SITE_林地_补'),
                (M_PAVE, 'SITE_铺装_补'), (M_PAVE_W, 'SITE_铺装暖_补'),
                (M_PATH, 'SITE_步道_补'), (M_MOUND, 'SITE_土丘_补'),
                (M_BRIDGE, 'SITE_桥面_补'), (M_GATE, 'SITE_牌坊_补')):
    if _m in BUF:
        flush(_nm, _m, C_GREEN if _m in (M_GRASS_D, M_MOUND) else C_PAVE, up=True)

# ==================================================================
# 11. 绿化
# ==================================================================
RNG = random.Random(20260920)
trees = []

# 排除区：树不能种进房子里。
# 中轴行道树是沿轴线每 30 m 一对撒的，图书馆、镇山塔正好骑在中轴上 ——
# 不过滤的话，这两栋一做细模就会有几棵树从墙里长出来。
TREE_EXCLUDE = []
for _nm, _zone, _sx, _sy, _w, _d, _h, _rot in BLD:
    _ex, _ey = W(_sx, _sy)
    TREE_EXCLUDE.append((_ex, _ey, _w * 0.5 + 7.0, _d * 0.5 + 7.0))
TREE_EXCLUDE.append((W(340, 300)[0], W(340, 300)[1], 60.0, 46.0))   # 图书馆台基
TREE_EXCLUDE.append((W(340, 246)[0], W(340, 246)[1], 66.0, 66.0))   # 塔院
# 图书馆前庭（丹陛 + 镜面水池 + 灯柱阵）。这一段的中轴行道树也要清掉：
# 前庭是"明堂"，本来就该是空的；留着树排会把对称的灯柱阵挡掉一半。
TREE_EXCLUDE.append((W(340, 323)[0], W(340, 323)[1], 86.0, 52.0))
# 阶段 2 的构筑物（牌坊群 / 阙 / 石狮 / 明堂地雕 / 案山亭）—— 提前在这里预留，
# 免得阶段 2 的柱子和枋从树冠里穿出来。灯柱阵列（X = ±16.5）不用排除：
# 行道树在 X = ±22、冠幅最大 4.2，留了 1.3 m 间隙。
# 牌坊那一条要**横着排干净**（±100）：首版只排到 ±74，
# 前导广场两侧的行道树正好卡在次楼、边楼前面，整座牌坊被树埋掉一半。
TREE_EXCLUDE.append((0.0, 33.6, 100.0, 30.0))     # 主牌坊 + 东西阙 + 门区广场
TREE_EXCLUDE.append((0.0, -12.4, 46.0, 9.0))      # 石狮一带
TREE_EXCLUDE.append((0.0, 244.8, 18.0, 18.0))     # 案山亭
# R1 把明堂广场改成**下沉智谷**（Y 95~188、X ±21、深 8 m）。
# 这条排除区必须在**场地阶段**就留出来：树是在这里一次性合并成
# SITE_树干 / SITE_树冠 两个对象的，等 R1 再想按位置删就晚了。
TREE_EXCLUDE.append((0.0, 141.5, 30.0, 54.0))     # 下沉智谷（原明堂广场一带）
TREE_EXCLUDE.append((0.0, 129.6, 26.0, 26.0))     # 明堂中央地雕（原预留，保留）
# 阶段 3 的人文区 6 栋（大礼堂 / 美术馆 / 书院 A·B·C / 钟楼）：
# 上面那个通用循环是按**阶段 0 占位体块**的尺寸算排除区的，而实建台基比占位体块
# 大得多（大礼堂台基 134×100 对占位体块 58×44）—— 不按实际台基重排一遍，
# 行道树会直接长进台基和大台阶里。
# 大礼堂 / 美术馆那两条顺带把中轴行道树（X = ±22）清掉：这两栋临中轴而立，
# 本来就不该在墙根再站一排树；御道分格与灯柱（X = ±16.5）不受影响，仍在。
TREE_EXCLUDE.append((-88.0, 338.4, 70.0, 60.0))    # 大礼堂（含南向大台阶）；X 随 R3 西移 4 m
TREE_EXCLUDE.append((84.0, 338.4, 70.0, 60.0))     # 美术馆
TREE_EXCLUDE.append((-105.6, 201.6, 59.0, 42.0))   # 书院 A
TREE_EXCLUDE.append((105.6, 201.6, 59.0, 42.0))    # 书院 B
TREE_EXCLUDE.append((115.2, 638.4, 59.0, 42.0))    # 书院 C
TREE_EXCLUDE.append((-115.2, 638.4, 23.0, 23.0))   # 钟楼
# R2 的**漂浮讲堂**：楼板 Y 820~864、X ±32（壳外缘 ±35），悬于水面之上。
# 滨水林带（tree_line(WALK…)）与水口植树都会经过这个半岛尽端，不排干净，
# 树冠会**直接穿过楼板长进玻璃幕里**（实测树冠顶点最高到 Z 13.1，楼板顶才 6.90）。
# 这里顺带把观景台→讲堂的连接桥（Y 808~820.5）和桥前广场一起清出来：
# 中轴尽端本来就该是空的，留着树排会把"尽端对山"的收头挡掉。
TREE_EXCLUDE.append((0.0, 838.0, 40.0, 38.0))      # 漂浮讲堂 + 连接桥 + 尽端广场


# ★★ 环廊站点（含垂直交通）—— 必须在这里就排除，晚了就来不及：
#   树在本脚本里一次性合并成 `SITE_树干`/`SITE_树冠` 两个对象，R4 做楼梯时已经删不动。
#   站点处有 18 m 站台 + 门洞铜柱 + 楼梯（外伸 15 m）/ 坡道（沿廊铺开 36.9 m）/ 电梯。
#   **内圈（v < 0）不排** —— 廊下遮荫的树要留着；只清外侧那一条。
for _nm, _s, _tgt in RING_STATIONS:
    _sx, _sy, _tx, _ty, _nx, _ny = ring_at(_s)
    _rot = math.atan2(_ty, _tx)
    # 站台 + 楼梯 / 电梯：沿路径 ±9 m、向外 v ≈ 5.5~17.5 m
    TREE_EXCLUDE.append((_sx + _nx * 11.5, _sy + _ny * 11.5, 9.0, 6.0, _rot))
    if _nm in ('S3_中轴人文区', 'S5_教学区'):
        # 无障碍坡道：1:12 ⇒ 沿环廊铺开 36.9 m、v ≈ 9.3~14.1 —— 单独加一条长条
        TREE_EXCLUDE.append((_sx + _tx * 19.0 + _nx * 11.7,
                             _sy + _ty * 19.0 + _ny * 11.7,
                             20.0, 4.5, _rot))
print(f'[site] 树木排除区：{len(TREE_EXCLUDE)} 条（含 {len(RING_STATIONS)} 处环廊站点）')


def _tree_blocked(x, y):
    """`TREE_EXCLUDE` 的每一项是 `(cx, cy, 半宽, 半深[, 旋转])`。

    ★ 第 5 项旋转是后加的（环廊站点排除区需要）：环廊各段走向不同，
      轴对齐的大框会在斜段上清掉一大片本不该清的树。
      不带第 5 项时行为与原来完全一致（向后兼容）。
    """
    for _e in TREE_EXCLUDE:
        _cx, _cy, _hw, _hd = _e[0], _e[1], _e[2], _e[3]
        _dx, _dy = x - _cx, y - _cy
        if len(_e) > 4 and _e[4]:
            _c, _s = math.cos(-_e[4]), math.sin(-_e[4])
            _dx, _dy = _dx * _c - _dy * _s, _dx * _s + _dy * _c
        if abs(_dx) < _hw and abs(_dy) < _hd:
            return True
    return False


def add_tree(x, y, h, r, seed):
    if _tree_blocked(x, y):
        return
    trees.append((x, y, h, r, seed))


def tree_line(pts, step, h0, h1, r0, r1, jitter=0.0, offs=0.0):
    for k, (x, y) in enumerate(resample(pts, step)):
        for s in ((-1.0, 1.0) if offs else (0.0,)):
            dx = dy = 0.0
            if jitter:
                dx = RNG.uniform(-jitter, jitter)
                dy = RNG.uniform(-jitter, jitter)
            add_tree(x + dx + s * offs, y + dy + s * offs,
                     RNG.uniform(h0, h1), RNG.uniform(r0, r1), RNG.random())


# 中轴行道树（最讲究，尺寸最大）
tree_line([(x - 22.0, y) for x, y in axis_pts], 30.0, 8.0, 10.5, 3.2, 4.2, 0.6)
tree_line([(x + 22.0, y) for x, y in axis_pts], 30.0, 8.0, 10.5, 3.2, 4.2, 0.6)
# 南侧入校林荫大道（陆路引导，两侧对称双排）
tree_line([(-46.0, y) for _, y in APPROACH], 26.0, 8.5, 11.5, 3.4, 4.6, 0.8)
tree_line([(46.0, y) for _, y in APPROACH], 26.0, 8.5, 11.5, 3.4, 4.6, 0.8)
# 环形主路两侧林带
tree_line(RING, 34.0, 7.0, 10.0, 3.0, 4.2, 1.2, 12.0)
# 滨水林带（玉带环腰的绿廊）
tree_line(WALK, 30.0, 7.5, 11.0, 3.2, 4.4, 1.4)
# 水口植树（锁气）：校园一侧沿岸密植 + 对岸水口砂上成丛。
# 南半边对岸已沉入水下，不能再按"两岸对称"撒点，否则一半树会浮在水面。
for _k in range(58):
    _along = RNG.uniform(-210.0, 210.0)
    _off = RNG.uniform(24.0, 160.0)
    _cx, _cy = bx0 - _bux * _off, by0 - _buy * _off        # 只在校园一侧
    add_tree(_cx + _bpx * _along, _cy + _bpy * _along,
             RNG.uniform(7.0, 11.5), RNG.uniform(3.2, 5.0), RNG.random())
for _ in range(30):                                        # 水口砂上成丛
    _a = RNG.uniform(0, math.tau)
    _rr = math.sqrt(RNG.random()) * SAND_R * 0.78
    add_tree(_sx + _rr * math.cos(_a), _sy + _rr * math.sin(_a),
             RNG.uniform(6.5, 10.5), RNG.uniform(3.0, 4.6), RNG.random())
# 各区散布
for _ in range(230):
    a = RNG.uniform(0, math.tau)
    rr = math.sqrt(RNG.random()) * 470.0
    x, y = rr * math.cos(a), 430.0 + rr * math.sin(a) * 0.88
    if math.hypot(x, y - 430.0) < 120.0:
        continue
    add_tree(x, y, RNG.uniform(6.5, 10.5), RNG.uniform(3.0, 4.6), RNG.random())
# 南侧大陆散布林地：山水全景的前景全在这片地上，
# 光秃秃一片草坪会把画面下半部彻底拖空
for _ in range(110):
    _yy = RNG.uniform(-1080.0, -110.0)
    _half = min(2400.0, 384.0 + 1.344 * (-_yy)) - 40.0
    _xx = RNG.uniform(-_half, _half)
    if abs(_xx) < 92.0:                     # 让开林荫大道
        continue
    add_tree(_xx, _yy, RNG.uniform(7.0, 11.5), RNG.uniform(3.2, 5.0), RNG.random())

tv, tf, lv, lf = [], [], [], []


def _sphere(cx, cy, cz, r, seg=9, ring=6):
    """低面数球（树冠）"""
    vv, ff = [], []
    vv.append((cx, cy, cz + r))
    for iy in range(1, ring):
        ph = math.pi * iy / ring
        for ix in range(seg):
            th = math.tau * ix / seg
            vv.append((cx + r * math.sin(ph) * math.cos(th),
                       cy + r * math.sin(ph) * math.sin(th),
                       cz + r * math.cos(ph)))
    vv.append((cx, cy, cz - r))
    for ix in range(seg):
        ff.append([0, 1 + ix, 1 + (ix + 1) % seg])
    for iy in range(ring - 2):
        a0 = 1 + iy * seg
        b0 = a0 + seg
        for ix in range(seg):
            j = (ix + 1) % seg
            ff.append([a0 + ix, b0 + ix, b0 + j, a0 + j])
    last = 1 + (ring - 2) * seg
    for ix in range(seg):
        ff.append([len(vv) - 1, last + (ix + 1) % seg, last + ix])
    return vv, ff


for (x, y, h, r, sd) in trees:
    rng = random.Random(int(sd * 1e6))
    # 树干半径必须远小于冠幅：0.105r 时 10 m 高的树树干直径约 0.8 m。
    # 早先用 0.30r，渲出来是一根 3 m 粗的柱子，整排树像插了一排电线杆。
    th = r * 0.105
    vv, ff = [], []
    for i in range(6):
        a = math.tau * i / 6
        vv.append((x + th * math.cos(a), y + th * math.sin(a), Z_TOP))
        vv.append((x + th * math.cos(a), y + th * math.sin(a), Z_TOP + h * 0.62))
    for i in range(6):
        j = (i + 1) % 6
        ff.append([2 * i, 2 * j, 2 * j + 1, 2 * i + 1])
    off = len(tv)
    tv.extend(vv)
    tf.extend([[i + off for i in f] for f in ff])
    # 冠形：球要小而多，用大球堆会渲成"绿气球"。
    # 冠底压到 0.48h 并让球心向外铺开，避免出现"一根杆顶一个球"的棒棒糖剪影。
    nb = 13 if rng.random() < 0.5 else 17
    for _ in range(nb):
        a = rng.uniform(0, math.tau)
        rr = rng.uniform(0.0, r * 0.62)
        cz = Z_TOP + h * rng.uniform(0.48, 0.88)
        cr = r * rng.uniform(0.34, 0.50)
        sv, sf = _sphere(x + rr * math.cos(a), y + rr * math.sin(a), cz, cr)
        o2 = len(lv)
        lv.extend(sv)
        lf.extend([[i + o2 for i in f] for f in sf])

new_obj('SITE_树干', tv, tf, M_TRUNK, C_GREEN)
new_obj('SITE_树冠', lv, lf, M_LEAF_TREE, C_GREEN, smooth=True)
print(f'[site] 树木 {len(trees)} 株')

# ==================================================================
# 12. 定位锚点（D9：供队友接 AI 定位与人流热力）
# ==================================================================
ANCHORS = [
    ('Main_Gate', 340, 502), ('Plaza_Ming_Tang', 340, 462),
    ('Mound_Anshan', 340, 414), ('Library', 340, 300),
    ('Tower_Zhenshan', 340, 246), ('Viewpoint', 340, 190),
    ('Innovation_Center', 214, 272), ('Performing_Arts', 186, 320),
    ('Stadium', 214, 400), ('Gymnasium', 200, 438), ('Hospital', 262, 368),
    ('Lab_A', 424, 272), ('Research_Institute', 458, 322),
    ('Teaching_A', 424, 382), ('Teaching_C', 424, 428),
    ('Dorm_West', 254, 484), ('Dorm_East', 442, 484),
    ('Canteen', 466, 484), ('Commercial_Street', 372, 484),
]
for nm, sx, sy in ANCHORS:
    x, y = W(sx, sy)
    e = bpy.data.objects.new(f'ANCHOR_{nm}', None)
    e.empty_display_type = 'PLAIN_AXES'
    e.empty_display_size = 12.0
    e.location = (x, y, Z_TOP)
    C_ANCHOR.objects.link(e)

# ==================================================================
# 13. 统计
# ==================================================================
tot_v = tot_f = 0
for ob in bpy.data.objects:
    if ob.type == 'MESH':
        tot_v += len(ob.data.vertices)
        tot_f += len(ob.data.polygons)
print(f'[site] 对象 {len([o for o in bpy.data.objects if o.type == "MESH"])} 个 / '
      f'顶点 {tot_v} / 面 {tot_f}')
print(f'[site] 场地范围 X {min(p[0] for p in P0):.0f}~{max(p[0] for p in P0):.0f} m, '
      f'Y {min(p[1] for p in P0):.0f}~{max(p[1] for p in P0):.0f} m')
print('[site] 山河大学 · 阶段 0 场地骨架完成')
