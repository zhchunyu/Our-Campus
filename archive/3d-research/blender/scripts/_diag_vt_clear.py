# -*- coding: utf-8 -*-
"""_diag_vt_clear.py —— 垂直交通 **与周边建筑净距 / 侵入**体检（只读，不改模型）

背景（2026-09-25）：
    V3 §2.2 定「开敞双跑楼梯做在环廊**外侧**」。外侧在大部分弧段是绿地，
    没问题；但**南弧（生活区）**那段，环廊中心线 Y≈147.5 是"两排宿舍之间的
    林荫街"，北边 15.0 m 是人文书院南缘、南边 15.0 m 是宿舍/研究生公寓北缘
    —— **桥面外缘（v=6.0）到宿舍只剩 9.0 m**，而双跑楼梯沿 v 方向要铺
    6.32 m 宽（v0=9.0 → 15.32），正好压线。

    这个失效**几何自检查不出来**（`_diag_plan.py` 的 1.5 m 网格采样对
    0.3 m 的薄边很容易漏），只能靠精确量测。

做法：
    把垂直交通网格按 0.25 m 采样成点，用 `closest_point_on_mesh` 对每个
    `BLD_*` 做**精确内部判定**（`(loc − p)·n < 0` ⇒ 点在实体内部），
    统计侵入点数与面积。bbox 只用于快速否决（外扩 1 m）。

用法（便携版 Blender，无头）：
    set BR_CFG_FILE=<含完整 build_extra 链的 json>
    blender.exe --background --factory-startup --python _diag_vt_clear.py
★ 只读不写模型。
"""
import json
import os

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SAMP = float(os.environ.get('BR_VTC_SAMP', '0.25'))


def run(path, extra=None):
    with open(path, encoding='utf-8') as fh:
        src = fh.read()
    g = {'__name__': '__main__', '__file__': path}
    if extra:
        g.update(extra)
    exec(compile(src, path, 'exec'), g)
    return g


cfg = {}
_cf = os.environ.get('BR_CFG_FILE')
if _cf and os.path.exists(_cf):
    with open(_cf, encoding='utf-8') as fh:
        cfg = json.load(fh)

print('### BUILD ###')
g = run(os.path.join(HERE, 'build_campus_site.py'))
for extra in (cfg.get('build_extra') or []):
    print(f'### BUILD EXTRA : {extra} ###')
    g = run(os.path.join(HERE, extra), g)

ST = g.get('STATION_LIST') or []
if not ST:
    raise SystemExit('[VTC] 没拿到 STATION_LIST —— R4 是否在链里？')


def _bbox(ob):
    mw = ob.matrix_world
    ps = [mw @ Vector(c) for c in ob.bound_box]
    return (min(p.x for p in ps), max(p.x for p in ps),
            min(p.y for p in ps), max(p.y for p in ps),
            min(p.z for p in ps), max(p.z for p in ps))


# ---- 收集对象 ----
VT = []
for ob in bpy.data.objects:
    if ob.type != 'MESH':
        continue
    if ob.name.startswith('R4_环廊_垂直交通') or ob.name.startswith('R4_环廊_电梯'):
        VT.append(ob)
BLD = [ob for ob in bpy.data.objects
       if ob.type == 'MESH' and ob.name.startswith('BLD_')]

print(f'\n[VTC] 垂直交通对象 {len(VT)} 个 / 建筑对象 {len(BLD)} 个'
      f'（采样步长 {SAMP:.2f} m）')
for ob in VT:
    print(f'   · {ob.name}  面 {len(ob.data.polygons)}')

BB = {ob.name: _bbox(ob) for ob in BLD}


def _inside(ob, p, bb):
    """p 是否在 ob 的**实体内部**（精确判定，非 bbox）。"""
    if not (bb[0] - 1.0 <= p.x <= bb[1] + 1.0
            and bb[2] - 1.0 <= p.y <= bb[3] + 1.0
            and bb[4] - 1.0 <= p.z <= bb[5] + 1.0):
        return False
    ok, loc, nrm, _i = ob.closest_point_on_mesh(ob.matrix_world.inverted() @ p)
    if not ok:
        return False
    wl = ob.matrix_world @ loc
    wn = (ob.matrix_world.to_3x3() @ nrm).normalized()
    return (wl - p).dot(wn) < 0.0


def _tri_points(a, b, c, step):
    """三角形上按 step 铺点（重心坐标网格）。"""
    la = (b - a).length
    lb = (c - b).length
    lc = (a - c).length
    n = max(1, int(max(la, lb, lc) / step))
    out = []
    for i in range(n + 1):
        for j in range(n + 1 - i):
            w1 = i / float(n)
            w2 = j / float(n)
            out.append(a * (1.0 - w1 - w2) + b * w1 + c * w2)
    return out


_total = 0
_report = []
for ob in VT:
    mw = ob.matrix_world
    me = ob.data
    # 只看站点邻域：垂直交通本体就在站点附近，限制到自身 bbox 即可
    obb = _bbox(ob)
    _near = [(b, BB[b.name]) for b in BLD
             if not (BB[b.name][1] < obb[0] - 2.0 or BB[b.name][0] > obb[1] + 2.0
                     or BB[b.name][3] < obb[2] - 2.0
                     or BB[b.name][2] > obb[3] + 2.0)]
    hits = {}
    pts = 0
    bad = []                       # 侵入点（世界坐标）—— 用来定位是哪一处
    for p in me.polygons:
        vs = [mw @ me.vertices[i].co for i in p.vertices]
        for k in range(1, len(vs) - 1):
            for q in _tri_points(vs[0], vs[k], vs[k + 1], SAMP):
                pts += 1
                for b, bb in _near:
                    if _inside(b, q, bb):
                        hits[b.name] = hits.get(b.name, 0) + 1
                        bad.append(q.copy())
                        break
    _a = SAMP * SAMP
    _tot = sum(hits.values()) * _a
    _total += _tot
    if hits:
        _top = sorted(hits.items(), key=lambda kv: -kv[1])[:4]
        _report.append((ob.name, _tot, _top, pts))
        print(f'   !! {ob.name}  采样 {pts} 点 → 侵入 {sum(hits.values())} 点'
              f' / {_tot:.2f} m²')
        for k, v in _top:
            print(f'        {k}  {v * _a:.2f} m²')
        # ★ 定位：侵入点按"最近站点"归堆 —— 合并对象查不出是哪一处，
        #   只能靠坐标反查，否则只能看到总面积（改哪一处全靠猜）。
        _grp = {}
        for q in bad:
            _bn, _bd = None, 1e18
            for _nm, _s, _k, _rt in ST:
                _d = (q.x - _rt[0]) ** 2 + (q.y - _rt[1]) ** 2
                if _d < _bd:
                    _bd, _bn = _d, _nm
            _grp[_bn] = _grp.get(_bn, 0) + 1
        print('        ── 按站点归堆 ──')
        for k, v in sorted(_grp.items(), key=lambda kv: -kv[1]):
            _sub = [q for q in bad
                    if min(ST, key=lambda r: (q.x - r[3][0]) ** 2
                           + (q.y - r[3][1]) ** 2)[0] == k]
            print(f'          {k:<16} {v * _a:7.2f} m²'
                  f'  X[{min(q.x for q in _sub):.1f}, {max(q.x for q in _sub):.1f}]'
                  f' Y[{min(q.y for q in _sub):.1f}, {max(q.y for q in _sub):.1f}]'
                  f' Z[{min(q.z for q in _sub):.2f}, {max(q.z for q in _sub):.2f}]')
    else:
        print(f'   ✓ {ob.name}  采样 {pts} 点 → 无侵入')

print(f'\n[VTC] 垂直交通侵入建筑合计 {_total:.2f} m²'
      f'（{len(_report)} 个对象有侵入）')
print('### VT CLEAR DIAG DONE ###')
