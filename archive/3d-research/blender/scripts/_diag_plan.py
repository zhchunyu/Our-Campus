# -*- coding: utf-8 -*-
"""_diag_plan.py —— 总平面体检 v2：按**材质**分类的自上而下网格扫描 + 楼间距 + 道路覆盖率。

回答用户第 1 条意见「部分建筑之间没有连通的道路，彼此紧密挤压堆叠」。

产出三样：
  A. 总平面分类图（PNG）—— 直接看"楼挨楼、地面全是硬地"的位置
  B. 楼间距表 —— 先用「包围盒重叠面积占比」把同一栋楼的碎块合并成"建筑簇"，
     再算簇间轴对齐净距（这才是用户眼里的"两栋楼"）
  C. 道路覆盖率 —— 每栋建筑外扩 RING 米，量该环带里 road/path/pave 占比。
     **覆盖率 0 = 这栋楼没有任何道路接进来**（用户意见的量化判据）

用法（便携版 Blender，无头）：
    set BR_CFG_FILE=<阶段配置 json>
    set BR_PLAN_OUT=<png 输出路径>
    blender.exe --background --factory-startup --python _diag_plan.py
★ 只读不写模型。
"""
import json
import math
import os
from collections import Counter

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))

X0, X1 = -816.0, 816.0
Y0, Y1 = 0.0, 1238.0
STEP = 3.0                      # 网格间距（m）
RAY_Z = 260.0
RING = 8.0                      # 建筑外扩环带宽度（m）—— 量道路覆盖用

CAT_COLOR = {
    'bld':   (0.95, 0.95, 0.95),
    'blk':   (0.98, 0.55, 0.08),
    'ring':  (0.92, 0.10, 0.12),
    'road':  (0.06, 0.06, 0.08),
    'path':  (0.34, 0.34, 0.40),
    'pave':  (0.62, 0.60, 0.55),
    'grass': (0.28, 0.62, 0.22),
    'water': (0.14, 0.34, 0.60),
    'tree':  (0.04, 0.32, 0.10),
    'bank':  (0.46, 0.40, 0.32),
    'far':   (0.30, 0.34, 0.40),
    'other': (0.72, 0.20, 0.85),
}

# 材质名 → 类别（子串匹配，先长后短）
# ★ 这里的键必须与 `make_mat('…')` 里的**实际材质名**逐字对得上。
#   踩过：分区铺装实际叫 `M_区_科技`，而规则写的是 `M_分区` ⇒ 六个分区全被判成"其他"（紫色），
#   整张分类图看不出铺装与绿地的边界。写规则前先 grep `make_mat('M_`。
MAT_RULES = [
    ('M_水', 'water'), ('M_河道', 'water'), ('M_水面', 'water'),
    ('M_主路', 'road'), ('M_沥青', 'road'), ('M_车行', 'road'),
    ('M_步道', 'path'), ('M_桥', 'path'), ('M_木栈', 'path'),
    ('M_塑胶跑道', 'path'),
    ('M_广场铺装', 'pave'), ('M_中轴铺装', 'road'), ('M_铺装', 'pave'),
    # ★ `M_中轴铺装` 归 `road` 而不是 `pave`：它是 42 m 宽的**中轴大道**
    #   （`SITE_中轴大道`），全校的主步行脊。归 `pave` 会让"案山平台侧壁"
    #   被判成"距最近道路 81 m 无路" —— 其实它就在中轴上。
    ('M_区_', 'pave'), ('M_分区', 'pave'), ('M_台面', 'pave'),
    ('M_台阶', 'pave'), ('M_平台', 'pave'), ('M_庭院', 'pave'),
    ('M_石作', 'pave'), ('M_御道', 'pave'),
    ('M_竹木', 'path'),
    ('M_草地', 'grass'), ('M_林地', 'grass'), ('M_土丘', 'grass'),
    ('M_地形', 'grass'), ('M_草坪', 'grass'), ('M_绿坡', 'grass'),
    ('M_沙滩', 'grass'), ('M_砂', 'grass'),
    ('M_树', 'tree'), ('M_叶', 'tree'), ('M_干', 'tree'),
    ('M_驳岸', 'bank'),
    ('M_体块', 'blk'),
    ('M_远山', 'far'), ('M_对岸', 'far'),
]


def cat_of(mat_name, ob_name):
    """★ 顺序很重要：**对象名前缀优先于材质名**。
    理由：`BLD_*` 就是"建筑"这一件事，它身上挂什么材质都不改变它是建筑
    （台基可能挂 `M_庭院铺装`、看台可能挂 `M_清水混凝土`）。
    但**不能反过来只按对象名匹配** —— 第一版用"名字里有'草'字"这种子串判断，
    `SITE_半岛地形` 名字里没"草"字却挂着 `M_草地`，整岛草地被判成"其他"。
    所以：先按**前缀**定性，剩下的才交给材质名。"""
    if ob_name.startswith('BLD_'):
        return 'bld'
    if ob_name.startswith('R4_') or '环廊' in ob_name:
        return 'ring'
    # ★ 入口门廊 / 场地细节构件**不算"路"**。它们的踏步与入口平台用的是
    #   `M_中轴铺装`（跟御道同一个暖色铺装，视觉上才连得上），若不排除，
    #   `净距` 判据立刻变成**自证**：每栋楼门口都有一块自己铺的平台，
    #   于是"每栋楼到最近道路 ≤ 1 m"——量不出任何问题。
    #   （2026-09-25 加，配合 `_entrance_all.py`。）
    if ob_name.startswith(('DTL_', 'ENT_')):
        return 'pave'
    for key, c in MAT_RULES:
        if key in mat_name:
            return c
    return 'other'


def run(path, extra=None):
    with open(path, encoding='utf-8') as fh:
        src = fh.read()
    g = {'__name__': '__main__', '__file__': path}
    if extra:
        g.update(extra)
    exec(compile(src, path, 'exec'), g)
    return g


cfg = {}
cf = os.environ.get('BR_CFG_FILE')
if cf and os.path.exists(cf):
    with open(cf, encoding='utf-8') as fh:
        cfg = json.load(fh)

print('### BUILD ###')
g = run(os.path.join(HERE, 'build_campus_site.py'))
for extra in (cfg.get('build_extra') or []):
    print(f'### BUILD EXTRA : {extra} ###')
    g = run(os.path.join(HERE, extra), g)

# ==================================================================
# 1. 建筑原始包围盒（BLD_* 顶层件，排除 _Eave/_女儿墙 之类子块也一并算进簇）
# ==================================================================
def bbox_of(ob):
    mw = ob.matrix_world
    pts = [mw @ Vector(c) for c in ob.bound_box]
    return (min(p.x for p in pts), max(p.x for p in pts),
            min(p.y for p in pts), max(p.y for p in pts),
            min(p.z for p in pts), max(p.z for p in pts))


RAW = []
OBJ_OF = {}                     # 对象名 -> 对象（穿楼检查要按分件栅格化实占格）
for ob in bpy.data.objects:
    if ob.type == 'MESH' and ob.name.startswith('BLD_'):
        RAW.append((ob.name,) + bbox_of(ob))
        OBJ_OF[ob.name] = ob
print(f'\n[R5] BLD_* 顶层件 {len(RAW)} 个')

# ★ 退化 bbox（平面尺寸为 0）的 BLD_* 对象 —— 必须单独报出来。
#   踩过：`BLD_人文_Auditorium#2` 这一簇的 bbox 是 X 0~0 / Y 0~0 / Z 0~0，
#   于是"到最近道路净距 73.5 m"被算进统计，白白多出一条"无路"的假缺陷。
#   这种簇都是**空网格或原点上的零尺寸网格**，不参与任何几何判据。
_degen = [r for r in RAW
          if (r[2] - r[1]) * (r[4] - r[3]) <= 0.01]
if _degen:
    print(f'★★ 退化 bbox（零平面尺寸）的 BLD_* 对象 {len(_degen)} 个：')
    for r in _degen:
        print(f'    {r[0]}   X {r[1]:.2f}~{r[2]:.2f}  Y {r[3]:.2f}~{r[4]:.2f}'
              f'  Z {r[5]:.2f}~{r[6]:.2f}')
else:
    print('✓ 无退化 bbox')

# ---- 合并成"建筑簇"：两 bbox 重叠面积 > 较小者 12% 就视为同一栋 ----
def ov_area(a, b):
    dx = min(a[1], b[1]) - max(a[0], b[0])
    dy = min(a[3], b[3]) - max(a[2], b[2])
    return dx * dy if dx > 0 and dy > 0 else 0.0


def area(b):
    return max(0.0, b[1] - b[0]) * max(0.0, b[3] - b[2])


clusters = [{'bb': list(r[1:7]), 'members': [r[0]], 'parts': [r]} for r in RAW]
changed = True
while changed:
    changed = False
    for i in range(len(clusters)):
        for j in range(i + 1, len(clusters)):
            a, b = clusters[i]['bb'], clusters[j]['bb']
            o = ov_area(a, b)
            if o <= 0:
                continue
            if o > 0.12 * min(area(a), area(b)):
                clusters[i]['bb'] = [min(a[0], b[0]), max(a[1], b[1]),
                                     min(a[2], b[2]), max(a[3], b[3]),
                                     min(a[4], b[4]), max(a[5], b[5])]
                clusters[i]['members'] += clusters[j]['members']
                # ★ `parts` 逐件保留（每项 = (对象名, x0,x1,y0,y1,z0,z1)）。
                #   穿楼检查必须按**分件**判，不能按簇 bbox 判 —— 见 `_sample_poly`。
                clusters[i]['parts'] += clusters[j]['parts']
                clusters.pop(j)
                changed = True
                break
        if changed:
            break

# 簇名：取成员里最长的"主干"名（去掉最后的材质后缀）
def cl_name(ms):
    best = max(ms, key=len)
    p = best.split('_')
    return '_'.join(p[:3]) if len(p) > 3 else best


CL = [{'name': cl_name(c['members']), 'bb': c['bb'], 'parts': c['parts'],
       'n': len(c['members'])} for c in clusters]
CL.sort(key=lambda c: c['name'])

# 簇名去重（三个人文 Academy 同名）
_seen = Counter()
for c in CL:
    _seen[c['name']] += 1
    if _seen[c['name']] > 1:
        c['name'] = f'{c["name"]}#{_seen[c["name"]]}'

print(f'\n### 建筑簇 {len(CL)} 个（世界 m）###')
print(f'{"簇名":<30s}{"X 范围":>17s}{"Y 范围":>17s}{"占地":>13s}{"最高":>8s}{"件":>5s}')
for c in CL:
    x0, x1, y0, y1, z0, z1 = c['bb']
    print(f'{c["name"]:<30s}{x0:>7.0f}~{x1:<8.0f}{y0:>7.0f}~{y1:<8.0f}'
          f'{x1-x0:>6.0f}×{y1-y0:<6.0f}{z1:>8.1f}{c["n"]:>5d}')

# ---- 簇间净距 ----
def gap(a, b):
    dx = max(b[0] - a[1], a[0] - b[1])
    dy = max(b[2] - a[3], a[2] - b[3])
    return max(dx, dy)


print(f'\n### 楼间距（轴对齐净距，m；仅列 < 30 m）###')
rows = []
for i in range(len(CL)):
    for j in range(i + 1, len(CL)):
        gp = gap(CL[i]['bb'], CL[j]['bb'])
        if gp < 30.0:
            rows.append((gp, CL[i]['name'], CL[j]['name']))
rows.sort()
for gp, a, b in rows:
    flag = '  ★★ 挤(<12m)' if gp < 12.0 else ('  ★ 偏紧(<20m)' if gp < 20.0 else '')
    print(f'  {gp:>6.1f}   {a:<30s} ↔ {b:<30s}{flag}')
print(f'  （<30 m 共 {len(rows)} 对；<12 m 的 {sum(1 for r in rows if r[0] < 12)} 对；'
      f'<20 m 的 {sum(1 for r in rows if r[0] < 20)} 对）')

# ==================================================================
# 2. 网格扫描（按材质分类）
# ==================================================================
NX = int(round((X1 - X0) / STEP))
NY = int(round((Y1 - Y0) / STEP))
print(f'\n### 网格扫描 {NX}×{NY} = {NX*NY}（步长 {STEP:.0f} m）###')

scene = bpy.context.scene
dg = bpy.context.evaluated_depsgraph_get()
down = Vector((0.0, 0.0, -1.0))

cats = []
hit_mat = Counter()
for iy in range(NY):
    for ix in range(NX):
        px = X0 + (ix + 0.5) * STEP
        py = Y0 + (iy + 0.5) * STEP
        ok, loc, _n, _i, ob, _mw = scene.ray_cast(
            dg, Vector((px, py, RAY_Z)), down, distance=RAY_Z * 2)
        if not ok:
            cats.append('other')
            hit_mat['<MISS>'] += 1
            continue
        mn = ob.data.materials[0].name if (ob.data.materials
                                          and ob.data.materials[0]) else ''
        c = cat_of(mn, ob.name)
        cats.append(c)
        hit_mat[f'{mn}  ({ob.name})'] += 1

out_png = os.environ.get('BR_PLAN_OUT') or os.path.join(
    os.path.dirname(HERE), '_plan_diag.png')
img = bpy.data.images.new('plan_diag', NX, NY, alpha=False)
buf = [0.0] * (NX * NY * 4)
for iy in range(NY):
    for ix in range(NX):
        r, gg, b = CAT_COLOR[cats[iy * NX + ix]]
        k = ((NY - 1 - iy) * NX + ix) * 4
        buf[k], buf[k + 1], buf[k + 2], buf[k + 3] = r, gg, b, 1.0

# ---- 叠加建筑簇 bbox 框线（品红）—— 肉眼核对"路是否穿楼" ----
def _px_of(x, y):
    return (int((x - X0) / STEP), int((y - Y0) / STEP))


# ★ 默认**不画**（框线会把图糊满，反而看不清）；要核对时设 BR_PLAN_BBOX=1
if os.environ.get('BR_PLAN_BBOX'):
    for c in CL:
        x0, x1, y0, y1 = c['bb'][0], c['bb'][1], c['bb'][2], c['bb'][3]
        ia, ja = _px_of(x0, y0)
        ib, jb = _px_of(x1, y1)
        ia, ib = max(0, min(NX - 1, ia)), max(0, min(NX - 1, ib))
        ja, jb = max(0, min(NY - 1, ja)), max(0, min(NY - 1, jb))
        for ix in range(ia, ib + 1):
            for jy in (ja, jb):
                k = ((NY - 1 - jy) * NX + ix) * 4
                buf[k], buf[k + 1], buf[k + 2] = 1.0, 0.0, 1.0
        for jy in range(ja, jb + 1):
            for ix in (ia, ib):
                k = ((NY - 1 - jy) * NX + ix) * 4
                buf[k], buf[k + 1], buf[k + 2] = 1.0, 0.0, 1.0

# ★ 图的落盘放到最后：冲突点要回画上去

tot = len(cats)
cnt = Counter(cats)
land = tot - cnt['water']
print(f'\n### 分类占比 ###')
print(f'  {"类别":<8s}{"格数":>9s}{"占全图":>9s}{"占陆地":>9s}')
for c, n in cnt.most_common():
    _lp = '     —  ' if c == 'water' else f'{n/land*100:>7.2f}%'
    print(f'  {c:<8s}{n:>9d}{n/tot*100:>8.2f}%{_lp:>9s}')
print(f'  （陆地 = 全图 − 水面 = {land} 格）')

# ---- "其他"到底是些什么？不查清就会一直有个说不明的紫块 ----
print(f'\n### 落在 "other" 里的材质 Top 15 ###')
_oth = [(n, nm) for nm, n in hit_mat.most_common()
        if cat_of(nm.split('  (')[0], nm[nm.rfind('(') + 1:-1]) == 'other']
for n, nm in _oth[:15]:
    print(f'  {n:>7d}  {nm}')
print(f'  （"other" 共 {cnt.get("other", 0)} 格，来自 {len(_oth)} 个材质/对象组合）')

# ==================================================================
# 3. 道路覆盖率：每栋楼外扩 RING 米，量环带内 road/path/pave 占比
# ==================================================================
def idx_of(x, y):
    ix = int((x - X0) / STEP)
    iy = int((y - Y0) / STEP)
    return ix, iy


# ★ 判据的演进（写下来免得以后再走弯路）：
#   v1「外扩 8 m 环带内 road/path/pave 占比」——**量不出来**：分区铺装（pave）
#      几乎铺满全校，33 栋里 31 栋都在 46%~100%，看着全是绿的。
#   v2「外扩 8 m 环带内 road/path/ring 占比」——**太严**：路本来就该走在楼与楼的
#      缝里，缝宽 25~40 m、路宽 12 m ⇒ 路面边缘到楼边 6~13 m 是**正常规划**，
#      不该判成"无路接入"。结果是 25/33 被判"不足"，同样是错的。
#   v3（本版）「**到最近 路/廊 的净距**」——这才是"有没有路通到这栋楼"的直接答案。
#      判据：≤ 30 m OK（一个正常街区进深）/ 30~60 m 偏远 / > 60 m 无路。
HARD_ROAD = ('road', 'path', 'ring')
_RC = [(X0 + (i % NX + 0.5) * STEP, Y0 + (i // NX + 0.5) * STEP)
       for i, _c in enumerate(cats) if _c in HARD_ROAD]
print(f'\n### 每栋楼到最近 路/廊 的净距（路/廊 采样格 {len(_RC)} 个）###')
print(f'{"簇名":<30s}{"净距":>8s}  判定')
# ★ `BLD_` 前缀在这里被用来装**景园构筑物**（案山平台侧壁 / 智谷台地与坐凳）——
#   它们不是"楼"，"有没有路通到这栋楼"这条判据对它们不成立：
#   案山平台侧壁就在中轴上，只是**中轴铺装被案山土丘盖住**（自上而下的射线打在
#   `M_案山土丘` 上，那一带的格子被归成 other），于是"最近的路"被量到 33 m 外。
#   这是**量具的口径问题，不是规划缺陷** —— 单独列出，不混进"楼栋无路"的统计。
#   （正解是它们本不该叫 `BLD_*`；改名要动多个阶段脚本，留到后续统一处理。）
LANDSCAPE = ('案山', '智谷', '台地', '坐凳', '侧壁', '土丘', '绿坡')
bad = []
_nb = 0
for c in CL:
    if any(_k in c['name'] for _k in LANDSCAPE):
        print(f'{c["name"]:<30s}{"—":>8s}  景园构筑物（不计入楼栋判据）')
        continue
    _nb += 1
    x0, x1, y0, y1 = c['bb'][:4]
    best = 1e18
    for gx, gy in _RC:
        dx = max(x0 - gx, 0.0, gx - x1)
        dy = max(y0 - gy, 0.0, gy - y1)
        d = dx * dx + dy * dy
        if d < best:
            best = d
    d = best ** 0.5
    verdict = '★★ 无路' if d > 60.0 else ('★ 偏远' if d > 30.0 else 'OK')
    if d > 30.0:
        bad.append((d, c['name']))
    print(f'{c["name"]:<30s}{d:>7.1f} m  {verdict}')

print(f'\n### 距最近 路/廊 > 30 m 的建筑：{len(bad)} / {_nb}（景园构筑物 {len(CL)-_nb} 个不计）###')
for d, nm in sorted(bad, reverse=True):
    print(f'  {d:>6.1f} m  {nm}')

# ==================================================================
# 4. 道路/环廊 vs 建筑：按 1.5 m 网格**真实相交面积**采样
#    ★ 不能用"多边形重心落进 bbox"——路带是细长四边形，重心可以在框内
#      而实际绝大部分在框外。首版实测把 152×23 m 的山门报成 5728 m²（>自身面积），
#      一眼假。所以必须把多边形三角化后按格点判内外，逐点累加。
# ==================================================================
SAMP = 1.5

# ---- 分件的"实占格"（XY 投影，1.5 m 世界锚定栅格） ----
# ★★ 为什么**分件 bbox 还不够**：`emit_to()` 会把**多块互不连通的几何**合成一个对象 ——
#   `BLD_校门_山门_崖体` 一个对象里就装着 X ±(58.5~73.5) 两坨崖体，它的 bbox
#   因此横跨整个 117 m 门洞。按 bbox 判，中轴大道穿门洞的那 945 m² 会被报成
#   "穿楼"，而它正是设计意图（车马走门洞、门架下弦最低 Z 38.5 也在路面上方 35 m）。
#   所以再落一层：把分件的**三角形 XY 投影**栅格化，只有真有几何覆盖的格子才算"实占"。
#   判据 = 分件 bbox 命中 ∧ 该件 Z 区间含路面标高 ∧ 该格实占。
#   开销：只在 bbox + Z 都通过时才栅格化该件，结果按对象名缓存 —— 实测只栅格化个位数分件。
_FOOT_CACHE = {}


def _cell_of(px, py):
    """世界 XY → 1.5 m 栅格下标。★ 必须 floor，不能 int()：int(−0.67) = 0 会把
    X −1.5~0 的格子错并到 0~1.5 上（负坐标侧整体错一格）。"""
    return (int(math.floor(px / SAMP)), int(math.floor(py / SAMP)))


def _footprint(ob, cell=SAMP):
    """对象全部三角形的 XY 投影 → {(ix, iy)}。"""
    mw = ob.matrix_world
    me = ob.data
    cells = set()
    for p in me.polygons:
        vs = [mw @ me.vertices[i].co for i in p.vertices]
        a = vs[0]
        for t in range(1, len(vs) - 1):
            b, c = vs[t], vs[t + 1]
            i0 = int(math.floor(min(a.x, b.x, c.x) / cell))
            i1 = int(math.floor(max(a.x, b.x, c.x) / cell))
            j0 = int(math.floor(min(a.y, b.y, c.y) / cell))
            j1 = int(math.floor(max(a.y, b.y, c.y) / cell))
            if (i1 - i0 + 1) * (j1 - j0 + 1) > 400000:
                continue                       # 超大三角形（地面/水面）跳过
            det = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y)
            if abs(det) < 1e-9:
                continue
            for j in range(j0, j1 + 1):
                py = (j + 0.5) * cell
                for i in range(i0, i1 + 1):
                    px = (i + 0.5) * cell
                    w1 = ((b.y - c.y) * (px - c.x) + (c.x - b.x) * (py - c.y)) / det
                    w2 = ((c.y - a.y) * (px - c.x) + (a.x - c.x) * (py - c.y)) / det
                    if w1 < 0.0 or w2 < 0.0 or w1 + w2 > 1.0:
                        continue
                    cells.add((i, j))
    return cells


def _foot_of(nm):
    f = _FOOT_CACHE.get(nm)
    if f is None:
        ob = OBJ_OF.get(nm)
        f = _footprint(ob) if ob is not None else set()
        _FOOT_CACHE[nm] = f
    return f


def _sample_poly(vs, cl_list, ok_z, collect=None):
    """多边形（扇形三角化）→ 1.5 m 格点采样 → {簇 idx: 相交面积}
    collect 非空时把命中点的世界 XY 追加进去（用于回画冲突位置）

    ★★ 判据必须是**分件 bbox**，不能是**簇 bbox**（2026-09-25 修正）。
       簇 bbox 是整栋楼的**外接矩形**，而楼本身往往是"两崖夹一脊""台基 + 主体"：
       山门的簇 bbox 是 X −76~76 / Y 22~45，可崖体实际只在 X ±(58.5~73.5)，
       中间 117 m 是**门洞**。按簇 bbox 判，中轴大道穿过门洞的 945 m² 被报成"穿楼"——
       而它正是设计意图（车马走门洞）。改成"逐件 bbox + 该件自己的 Z 区间"之后，
       门洞（无实体）自然不算，门架（下弦最低 Z 38.5，路在 Z 3.07）也不算。
       性能上仍然先做一次簇 bbox 快速否决，绝大多数采样点在簇外，开销几乎不变。

    ★★ 但**分件 bbox 仍然不够** —— `emit_to()` 会把多块互不连通的几何合成一个对象
       （山门的 `崖体` 一个对象装两坨崖体），它的 bbox 横跨门洞。
       所以最后还要过一层 `_foot_of()`：该格**真的有几何覆盖**才算命中。
       三级判据（簇 bbox → 分件 bbox+Z → 实占格）都是"先便宜后贵"，且后两级带缓存。"""
    res = {}
    a = vs[0]
    for t in range(1, len(vs) - 1):
        b, c = vs[t], vs[t + 1]
        x0 = min(a.x, b.x, c.x)
        x1 = max(a.x, b.x, c.x)
        y0 = min(a.y, b.y, c.y)
        y1 = max(a.y, b.y, c.y)
        nx = int((x1 - x0) / SAMP) + 1
        ny = int((y1 - y0) / SAMP) + 1
        if nx * ny > 400000:
            continue
        det = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y)
        if abs(det) < 1e-9:
            continue
        for j in range(ny):
            py = y0 + (j + 0.5) * SAMP
            for i in range(nx):
                px = x0 + (i + 0.5) * SAMP
                w1 = ((b.y - c.y) * (px - c.x) + (c.x - b.x) * (py - c.y)) / det
                w2 = ((c.y - a.y) * (px - c.x) + (a.x - c.x) * (py - c.y)) / det
                w3 = 1.0 - w1 - w2
                if w1 < 0.0 or w2 < 0.0 or w3 < 0.0:
                    continue
                pz = w1 * a.z + w2 * b.z + w3 * c.z
                hit_ci, hit_pn = -1, ''
                for ci in range(len(cl_list)):
                    cb = cl_list[ci]['bb']
                    if not (cb[0] <= px <= cb[1] and cb[2] <= py <= cb[3]):
                        continue                      # 簇 bbox 快速否决
                    for pb in cl_list[ci]['parts']:
                        if (pb[1] <= px <= pb[2] and pb[3] <= py <= pb[4]
                                and ok_z(pb[5], pb[6], pz)
                                and _cell_of(px, py) in _foot_of(pb[0])):
                            hit_ci, hit_pn = ci, pb[0]
                            break
                    if hit_ci >= 0:
                        break
                if hit_ci >= 0:
                    res[hit_ci] = res.get(hit_ci, 0.0) + SAMP * SAMP
                    if collect is not None:
                        # ★ collect 是**可调用**：签名 (px, py, ci, 分件名)。
                        #   为什么不用 list.append：同一个路网对象会同时撞好几栋楼，
                        #   只有带上 ci 才能知道"这段路撞的是哪一栋、撞在哪个坐标区间"，
                        #   否则只能看到总面积，改折线时全靠猜（实测吃过这个亏）。
                        collect(px, py, hit_ci, hit_pn)
    return res


print('\n### 道路/环廊 穿楼检查（1.5 m 网格真实相交面积）###')
road_objs = []
for ob in bpy.data.objects:
    if ob.type != 'MESH' or not ob.data.materials or not ob.data.materials[0]:
        continue
    _c = cat_of(ob.data.materials[0].name, ob.name)
    if _c in ('road', 'path', 'ring'):
        road_objs.append((ob, _c))
print(f'  参与检查的路网/环廊对象 {len(road_objs)} 个')

hg, hr = {}, {}          # ci -> 面积
hgp, hrp = {}, {}        # (ci, ob_name) -> 面积（定位是哪条路）
CONFLICT_PTS = []        # 冲突采样点（世界 XY）—— 回画到总平面上
PB = {}                  # (ci, ob_name) -> [冲突点]  → 用来打印"撞在哪个坐标区间"

def _mk_collect(ob_name):
    def _c(px, py, ci, part=''):
        CONFLICT_PTS.append((px, py))
        PB.setdefault((ci, ob_name), []).append((px, py, part))
    return _c

for ob, cc in road_objs:
    mw = ob.matrix_world
    me = ob.data
    for p in me.polygons:
        vs = [mw @ me.vertices[i].co for i in p.vertices]
        if cc == 'ring':
            r = _sample_poly(vs, CL, lambda z0, z1, pz: z1 > 8.0 and pz < z1,
                             collect=_mk_collect(ob.name))
            for ci, ar in r.items():
                hr[ci] = hr.get(ci, 0.0) + ar
                hrp[(ci, ob.name)] = hrp.get((ci, ob.name), 0.0) + ar
        else:
            # ★ 容差由 0.6 m 收到 **0.02 m**。0.6 是首版为了让"路面比楼基低一点"
            #   也算命中而拍的，但它把**压在路面上的构件**也算了进来：
            #   山门的 `门槛` 是一根 42×0.4×0.1 m 的铜条，底面 Z 3.11，
            #   而御道铺装在 Z 3.06 —— 铜条**骑在路面上**（这正是门槛该做的），
            #   却因为 3.11 − 0.6 = 2.51 < 3.06 被报成 63 m² 穿楼。
            #   收到 0.02 后：门槛不算（3.11 − 0.02 = 3.09 > 3.06 ✓ 正确），
            #   而"铺装埋进台基"那类（台基底 Z 3.00、路面 3.06）照旧命中。
            r = _sample_poly(vs, CL, lambda z0, z1, pz: z0 - 0.02 <= pz <= z1,
                             collect=_mk_collect(ob.name))
            for ci, ar in r.items():
                hg[ci] = hg.get(ci, 0.0) + ar
                hgp[(ci, ob.name)] = hgp.get((ci, ob.name), 0.0) + ar


def _rep(tag, hits, pairs, note):
    print(f'\n  -- {tag} --')
    if not hits:
        print(f'    ✓ 无（{note}）')
        return
    for ci, ar in sorted(hits.items(), key=lambda kv: -kv[1]):
        c = CL[ci]
        ba = max(1.0, (c['bb'][1] - c['bb'][0]) * (c['bb'][3] - c['bb'][2]))
        print(f'    {ar:>9.1f} m²{ar / ba * 100:>7.1f}%   {c["name"]}')
        for (cj, on), a2 in sorted(pairs.items(), key=lambda kv: -kv[1]):
            if cj == ci and a2 > 5.0:
                pts = PB.get((cj, on)) or []
                if pts:
                    xs = [q[0] for q in pts]
                    ys = [q[1] for q in pts]
                    print(f'          └ {a2:>8.1f} m²  ← {on}'
                          f'   〔X {min(xs):>7.1f}~{max(xs):<7.1f}'
                          f' Y {min(ys):>7.1f}~{max(ys):<7.1f}〕')
                    # 撞在**哪个分件**上 —— 改几何时直接知道该动谁
                    for _nm, _n in Counter(q[2] for q in pts).most_common(3):
                        print(f'               撞在 {_nm}（{_n} 点）')
                else:
                    print(f'          └ {a2:>8.1f} m²  ← {on}')


_rep('地面道路/步道 与建筑相交', hg, hgp, '地面路网与建筑不冲突')
_rep('环廊（桥面/柱）与 楼高>8m 的建筑相交', hr, hrp, '环廊未压到建筑')
print(f'  （判据三级：簇 bbox → 分件 bbox+Z → 实占格；'
      f'本轮按需栅格化分件 {len(_FOOT_CACHE)} 个 / 共 {len(RAW)} 个）')

# ---- 把冲突采样点画成青色（一眼看出"路穿哪栋楼"） ----
for wx, wy in CONFLICT_PTS:
    ix = int((wx - X0) / STEP)
    iy = int((wy - Y0) / STEP)
    if 0 <= ix < NX and 0 <= iy < NY:
        k = ((NY - 1 - iy) * NX + ix) * 4
        buf[k], buf[k + 1], buf[k + 2] = 0.0, 1.0, 1.0

# ★ 默认"南在上"（= 世界 Y 0 在图上边，与 Blender 存图约定一致）。
#   设 BR_PLAN_FLIP=1 则翻成**北在上**（常规总平面读法），便于对外看。
_FLIP = bool(os.environ.get('BR_PLAN_FLIP'))
if _FLIP:
    # 只翻行（上下镜像）—— 这一步正好把"从下方看"变成"从上方看"：
    # 翻完 = 北在上 + 东在右，才是常规总平面读法。列不能再翻，再翻就成 180° 旋转了。
    for iy in range(NY // 2):
        r0, r1 = iy * NX * 4, (NY - 1 - iy) * NX * 4
        for k in range(NX * 4):
            buf[r0 + k], buf[r1 + k] = buf[r1 + k], buf[r0 + k]

img.pixels[:] = buf
img.filepath_raw = out_png
img.file_format = 'PNG'
img.save()
print(f'[plan] 分类图: {out_png} ({NX}×{NY})；冲突点 {len(CONFLICT_PTS)} 个（青色）；'
      f'朝向 {"北在上" if os.environ.get("BR_PLAN_FLIP") else "南在上"}')

# ---- 落一份 JSON：给"改路网→秒级试算净距"用（不必重跑 Blender） ----
_json = out_png.rsplit('.', 1)[0] + '.json'
with open(_json, 'w', encoding='utf-8') as _fh:
    _polys = {}
    for _k, _v in g.items():
        if not isinstance(_v, (list, tuple)) or len(_v) < 4:
            continue
        try:
            if all(isinstance(q, (list, tuple)) and len(q) >= 2
                   and isinstance(q[0], (int, float)) for q in _v):
                _polys[_k] = [[round(float(q[0]), 2), round(float(q[1]), 2)]
                              for q in _v]
        except TypeError:
            continue
    json.dump({
        'clusters': [{'name': c['name'], 'bb': c['bb']} for c in CL],
        'polys': _polys,
    }, _fh, ensure_ascii=False)
print(f'[plan] 几何 JSON: {_json}')

# ---- 可选：放大裁剪（BR_PLAN_CROP="wx0,wy0,wx1,wy1"）→ 4× 最近邻 ----
_crop = os.environ.get('BR_PLAN_CROP')
if _crop:
    _cx0, _cy0, _cx1, _cy1 = (float(v) for v in _crop.split(','))
    _a, _b = _px_of(_cx0, _cy0)
    _c, _d = _px_of(_cx1, _cy1)
    _a, _c = max(0, min(NX - 1, _a)), max(0, min(NX - 1, _c))
    _b, _d = max(0, min(NY - 1, _b)), max(0, min(NY - 1, _d))
    CW, CH, K = _c - _a + 1, _d - _b + 1, 4
    cimg = bpy.data.images.new('plan_crop', CW * K, CH * K, alpha=False)
    cbuf = [0.0] * (CW * K * CH * K * 4)
    for jy in range(CH):
        for jx in range(CW):
            # 读：buf 行号 ↔ 世界 iy（翻了就是 jy 本身，没翻要反过来）
            _ry = (_b + jy) if _FLIP else (NY - 1 - (_b + jy))
            # 写：Blender 图 row 0 在**底**。没翻时"南在上"⇒ 世界 Y=_cy0 写最上一行；
            #     翻了要"北在上"⇒ 世界 Y=_cy0 写最下一行。
            _ow = jy if _FLIP else (CH - 1 - jy)
            k0 = (_ry * NX + (_a + jx)) * 4
            r, gg, bl = buf[k0], buf[k0 + 1], buf[k0 + 2]
            for q in range(K):
                for p in range(K):
                    k1 = ((_ow * K + q) * CW * K + jx * K + p) * 4
                    cbuf[k1], cbuf[k1 + 1], cbuf[k1 + 2], cbuf[k1 + 3] = r, gg, bl, 1.0
    cimg.pixels[:] = cbuf
    cimg.filepath_raw = out_png.replace('.png', '_crop.png')
    cimg.file_format = 'PNG'
    cimg.save()
    print(f'[plan] 放大裁剪: {cimg.filepath_raw} '
          f'（世界 X {_cx0:.0f}~{_cx1:.0f} / Y {_cy0:.0f}~{_cy1:.0f}，{CW*K}×{CH*K}）')

print(f'\n### 命中材质 Top 25 ###')
for nm, n in hit_mat.most_common(25):
    print(f'  {n:>7d}  {nm}')
print('### PLAN DIAG DONE ###')
