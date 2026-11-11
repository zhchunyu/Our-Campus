# -*- coding: utf-8 -*-
"""
_trees_hero.py —— 主景树（分形枝干 + 枝上苔藓 + 枝梢叶团）
=====================================================================================
病根（2026-09-24，对照实景参考图）：
  现有树木 = **一根六棱柱 + 13~17 个绿球**（`build_campus_site.py` 的 add_tree）。
  远看是"棒棒糖"，近看是"杆顶一堆气球"。而实景里的校园大树是这样的：
    · 主干在 1/4 高度处**分叉成 5~8 条主枝**
    · 主枝**向外横扫**（活栎型，冠幅≈树高），不是向上收
    · 枝干**表面全长满苔藓/附生** —— 所以枝是**绿的**，不是褐的
    · 叶子只在**枝梢外围**成团，中段枝干完全裸露可见
  ⇒ 参考图里"贵"的地方，八成是这棵树，不是那栋楼。

做法：
  · 只给**少量关键位置**升级成主景树（默认 16 株），其余 600 多株维持低模
    —— 这是 LOD 思路：镜头看得到的才值得花面数。全株升级会把面数打爆。
  · 主景树几何 = 递归锥形管 + 顶面苔藓带 + 枝梢叶团
  · 主景树的 `h`/`r` 比普通树放大（1.35× / 1.5×）—— 参考图里那棵树是压倒性的

★ 选点策略：**从 `trees` 列表里挑**（那个列表是 site 脚本的全局变量），
  按"离关键视点锚点最近"打分。这样保证不会和既有树/建筑打架 —— 那些位置
  本来就已经通过了 `TREE_EXCLUDE` 的检查。挑中的从低模列表里剔除，不重叠。

★ 运行时机：挂在 STAGE_EXTRA 的每个阶段、palette_retune 之前。
  `trees` / `_sphere` / `Z_TOP` / `new_obj` 都是 site 脚本留下的全局变量。
"""

import math
import random

import bpy

print('[TREE] ── 主景树：分形枝干 ──')

# ---- 新材质（首次定义；make_mat 按名字缓存，同名第二次的色值会被静默忽略）----
M_MOSS = make_mat('M_苔藓', (0.118, 0.158, 0.062), rough=0.97, noise_scale=2.6)
M_BARK_H = make_mat('M_树皮_主景', (0.132, 0.098, 0.068), rough=0.94, noise_scale=1.8)
M_LEAF_H = make_mat_leaf('M_树叶_主景', (0.062, 0.118, 0.042), (0.185, 0.285, 0.098))

# ---- 关键视点锚点（世界坐标）：主景树优先落在这附近 ----
HERO_ANCHORS = [
    (0.0, 62.0),      # 山门内
    (0.0, 130.0),     # 明堂广场
    (0.0, 205.0),     # 案山
    (0.0, 330.0),     # 图书馆前庭
    (0.0, 430.0),     # 图书馆北
    (300.0, 389.0),   # 教学区前庭带
    (400.0, 389.0),
    (0.0, 850.0),     # 滨水讲堂
    (0.0, 100.0),     # 智谷谷口
]
HERO_PER_ANCHOR = 2      # 每个锚点取最近 2 株
HERO_MAX_DIST = 95.0     # 超过这个距离就不要（宁可少，不要乱）


def _norm(v):
    L = math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2) or 1.0
    return (v[0] / L, v[1] / L, v[2] / L)


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def _frame(d):
    """给方向 d 配一组正交基 (u, v)，用于绕轴旋转。"""
    ref = (0.0, 0.0, 1.0) if abs(d[2]) < 0.92 else (1.0, 0.0, 0.0)
    u = _norm(_cross(d, ref))
    v = _norm(_cross(d, u))
    return u, v


def _tube(p0, p1, r0, r1, n=6):
    """两点之间的锥形管。返回 (verts, faces, up_faces, 外法线)。

    `up_faces` = 朝上的那 1~2 个侧面在 faces 里的下标 —— 苔藓只长在枝干**上面**
    （长在下面就不像苔藓，像包了层绿漆）。
    """
    d = _norm((p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]))
    u, v = _frame(d)
    verts, faces = [], []
    for (p, r) in ((p0, r0), (p1, r1)):
        for i in range(n):
            a = math.tau * i / n
            verts.append((p[0] + r * (u[0] * math.cos(a) + v[0] * math.sin(a)),
                          p[1] + r * (u[1] * math.cos(a) + v[1] * math.sin(a)),
                          p[2] + r * (u[2] * math.cos(a) + v[2] * math.sin(a))))
    up = []
    for i in range(n):
        j = (i + 1) % n
        f = [i, j, n + j, n + i]
        faces.append(f)
        # 面法线 = 两条边的叉积；取 Z 分量最大的那几个当"朝上"
        c = [(verts[k][0] + verts[n + k][0]) * 0.5 for k in (i, j)]
        mid = ((verts[i][0] + verts[j][0] + verts[n + i][0] + verts[n + j][0]) * 0.25,
               (verts[i][1] + verts[j][1] + verts[n + i][1] + verts[n + j][1]) * 0.25,
               (verts[i][2] + verts[j][2] + verts[n + i][2] + verts[n + j][2]) * 0.25)
        nz = _norm((mid[0] - (p0[0] + p1[0]) * 0.5,
                    mid[1] - (p0[1] + p1[1]) * 0.5,
                    mid[2] - (p0[2] + p1[2]) * 0.5))[2]
        if nz > 0.45:
            up.append((len(faces) - 1, nz, mid, c))
    return verts, faces, up, (d, u, v)


def _grow(p0, d, L, r0, depth, rng, out, wide=1.0):
    """递归生成一条枝。

    `wide` —— 横向铺展系数。活栎的枝**先向外横扫再微微上翘**，
    写成纯向上收就成了杨树/松树，不是校园大树。
    """
    p1 = (p0[0] + d[0] * L, p0[1] + d[1] * L, p0[2] + d[2] * L)
    r1 = r0 * (0.70 if depth > 0 else 0.52)
    vv, ff, up, (dd, u, v) = _tube(p0, p1, r0, r1)
    o = len(out['bark_v'])
    out['bark_v'].extend(vv)
    out['bark_f'].extend([[k + o for k in f] for f in ff])
    # 苔藓：只给够粗的枝（细枝上苔藓看不见，白费面数）
    if r0 > 0.115 and up:
        mo = len(out['moss_v'])
        mv, mf = [], []
        for (fi, nz, mid, c) in up:
            base = len(mv)
            for k in ff[fi]:
                vx = vv[k]
                # 沿"从轴心指向面心"的方向外推 5% —— 苔藓盖在树皮**外面**
                dx, dy, dz = vx[0] - mid[0], vx[1] - mid[1], vx[2] - mid[2]
                dd2 = math.sqrt(dx * dx + dy * dy + dz * dz) or 1.0
                mv.append((vx[0] + dx / dd2 * r0 * 0.10,
                           vx[1] + dy / dd2 * r0 * 0.10,
                           vx[2] + dz / dd2 * r0 * 0.10))
            mf.append([base, base + 1, base + 2, base + 3])
        out['moss_v'].extend(mv)
        out['moss_f'].extend([[k + mo for k in f] for f in mf])
    # 枝梢 → 叶团
    if depth <= 0:
        for _ in range(rng.randint(2, 3)):
            out['leaf'].append((p1[0] + rng.uniform(-0.5, 0.5) * L,
                                p1[1] + rng.uniform(-0.5, 0.5) * L,
                                p1[2] + rng.uniform(-0.4, 0.5) * L,
                                r0 * rng.uniform(1.5, 2.4)))
        return
    # 分叉：1 根续枝 + 2~3 根侧枝
    nch = rng.randint(2, 3)
    for i in range(nch):
        ang = math.radians(rng.uniform(26.0, 46.0) * (1.0 - 0.25 * (3 - depth)))
        az = math.tau * i / nch + rng.uniform(-0.5, 0.5)
        nd = _norm((dd[0] * math.cos(ang) + (u[0] * math.cos(az) + v[0] * math.sin(az)) * math.sin(ang) * wide,
                    dd[1] * math.cos(ang) + (u[1] * math.cos(az) + v[1] * math.sin(az)) * math.sin(ang) * wide,
                    dd[2] * math.cos(ang) + (u[2] * math.cos(az) + v[2] * math.sin(az)) * math.sin(ang) * wide))
        # 活栎特征：越到梢头越**下垂**（先横扫出去，末端微微下坠）
        droop = 0.05 + 0.10 * (3 - depth)
        nd = _norm((nd[0], nd[1], nd[2] - droop))
        _grow(p1, nd, L * rng.uniform(0.62, 0.78), r1, depth - 1, rng, out, wide)


def hero_tree(x, y, h, r, sd, out):
    """一株主景树。`h` 树高 / `r` 冠幅半径。"""
    rng = random.Random(int(sd * 1e7) + 17)
    trunk_h = h * 0.30
    r0 = r * 0.155
    # 主干
    vv, ff, up, _ = _tube((x, y, Z_TOP), (x, y, Z_TOP + trunk_h), r0, r0 * 0.86)
    o = len(out['bark_v'])
    out['bark_v'].extend(vv)
    out['bark_f'].extend([[k + o for k in f] for f in ff])
    if up:
        mo = len(out['moss_v'])
        mv, mf = [], []
        for (fi, nz, mid, c) in up:
            base = len(mv)
            for k in ff[fi]:
                vx = vv[k]
                dx, dy, dz = vx[0] - mid[0], vx[1] - mid[1], vx[2] - mid[2]
                d2 = math.sqrt(dx * dx + dy * dy + dz * dz) or 1.0
                mv.append((vx[0] + dx / d2 * r0 * 0.12,
                           vx[1] + dy / d2 * r0 * 0.12,
                           vx[2] + dz / d2 * r0 * 0.12))
            mf.append([base, base + 1, base + 2, base + 3])
        out['moss_v'].extend(mv)
        out['moss_f'].extend([[k + mo for k in f] for f in mf])
    # 主枝：5~7 条，向外横扫。**递归 3 级** —— 2 级只有约 58 段枝，
    # 对照参考图明显不够（那棵树的枝条是密织的）；3 级约 151 段，代价仅 +0.5k 面/株。
    nlimb = rng.randint(5, 7)
    for i in range(nlimb):
        az = math.tau * i / nlimb + rng.uniform(-0.22, 0.22)
        elev = math.radians(rng.uniform(34.0, 58.0))
        d = (math.cos(elev) * math.cos(az), math.cos(elev) * math.sin(az), math.sin(elev))
        _grow((x, y, Z_TOP + trunk_h), d, h * rng.uniform(0.30, 0.40), r0 * 0.72,
              3, rng, out, wide=1.25)


# ==================================================================
# 选点：从既有 `trees` 里挑离锚点最近的若干株
# ==================================================================
_hero = []
_used = set()
for _ax, _ay in HERO_ANCHORS:
    _cand = sorted(range(len(trees)),
                   key=lambda i: math.hypot(trees[i][0] - _ax, trees[i][1] - _ay))
    _n = 0
    for _i in _cand:
        if _n >= HERO_PER_ANCHOR:
            break
        if _i in _used:
            continue
        if math.hypot(trees[_i][0] - _ax, trees[_i][1] - _ay) > HERO_MAX_DIST:
            break
        _used.add(_i)
        _hero.append(trees[_i])
        _n += 1

if not _hero:
    print('[TREE]   !! 没有候选主景树（trees 为空？），跳过')
else:
    # ---- 1) 重建低模树（把挑中的主景树从列表里剔除，避免两套树重叠）----
    for _nm in ('SITE_树干', 'SITE_树冠'):
        _ob = bpy.data.objects.get(_nm)
        if _ob:
            bpy.data.objects.remove(_ob, do_unlink=True)
    tv, tf, lv, lf = [], [], [], []
    for (x, y, h, r, sd) in [t for i, t in enumerate(trees) if i not in _used]:
        rng = random.Random(int(sd * 1e6))
        th = r * 0.105
        vv, ff = [], []
        for i in range(6):
            a = math.tau * i / 6
            vv.append((x + th * math.cos(a), y + th * math.sin(a), Z_TOP))
            vv.append((x + th * math.cos(a), y + th * math.sin(a), Z_TOP + h * 0.62))
        for i in range(6):
            j = (i + 1) % 6
            ff.append([2 * i, 2 * j, 2 * j + 1, 2 * i + 1])
        o = len(tv)
        tv.extend(vv)
        tf.extend([[i + o for i in f] for f in ff])
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
    # ★★ 树冠材质**按名字取**，不用 `M_LEAF` 全局 —— 见 `build_campus_site.py` 里
    #   `M_LEAF_TREE` 的长注释：`build_campus_r0.py` 会把 `M_LEAF` 重绑成
    #   `M_庭院绿植`，而本脚本跑在 r0 **之后**，用全局就会静默换掉全园 605 株树的树冠材质。
    #   按名取 + 断言，让这类重绑**不可能**再静默发生。
    _mat_leaf = bpy.data.materials.get('M_树叶')
    assert _mat_leaf is not None, '找不到 M_树叶 —— 树冠材质会退化成平色，必须查'
    new_obj('SITE_树冠', lv, lf, _mat_leaf, C_GREEN, smooth=True)

    # ---- 2) 生成主景树 ----
    out = {'bark_v': [], 'bark_f': [], 'moss_v': [], 'moss_f': [], 'leaf': []}
    for (x, y, h, r, sd) in _hero:
        hero_tree(x, y, h * 1.35, r * 1.50, sd, out)
    new_obj('SITE_主景树_枝', out['bark_v'], out['bark_f'], M_BARK_H, C_GREEN)
    if out['moss_f']:
        new_obj('SITE_主景树_苔', out['moss_v'], out['moss_f'], M_MOSS, C_GREEN)
    hv, hf = [], []
    for (cx, cy, cz, cr) in out['leaf']:
        sv, sf = _sphere(cx, cy, cz, cr, seg=7, ring=5)
        o = len(hv)
        hv.extend(sv)
        hf.extend([[i + o for i in f] for f in sf])
    new_obj('SITE_主景树_冠', hv, hf, M_LEAF_H, C_GREEN, smooth=True)
    print('[TREE]   主景树 %d 株（原低模 %d 株 → 重建后 %d 株）'
          % (len(_hero), len(trees), len(trees) - len(_used)))
    print('[TREE]   面数：枝 %d / 苔 %d / 冠 %d'
          % (len(out['bark_f']), len(out['moss_f']), len(hf)))
