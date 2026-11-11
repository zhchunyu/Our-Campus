# -*- coding: utf-8 -*-
"""_diag_tree.py —— 环廊站点 / 垂直交通 处**树木侵入**体检（只读，不改模型）

回答一个渲染才能看出来、几何自检查不出来的问题：
    「树长在楼梯里」—— 2026-09-25 在 `VT_N10` 的正立面成图上实拍发现。

为什么必须单独查：树在**场地阶段**一次性合并成 `SITE_树干` / `SITE_树冠`
两个对象，到 R4 做垂直交通时**已经删不动**。所以清树只能靠场地阶段的
`TREE_EXCLUDE` 排除区；排除区算漏一处，成图才会暴露，而且不报任何错。

本脚本做两件事：
  A. 把 `SITE_树干` 的**全部顶点**（世界坐标）对每个站点排除矩形做包含判定
     —— 树干有粗细，顶点判定比"树苗中心点"更严格。命中即打印。
  B. 每个站点在**垂直交通本体位置**向上打射线（从 Z 4.0 到天），
     打印命中的前 3 个对象 —— 若出现 `SITE_树干` / `SITE_树冠` 就是挡住楼梯了。

用法（便携版 Blender，无头）：
    set BR_CFG_FILE=<含完整 build_extra 链的 json>
    blender.exe --background --factory-startup --python _diag_tree.py
★ 只读不写模型。
"""
import json
import math
import os

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))

_UP = Vector((0.0, 0.0, 1.0))

# ★★ `_DG` **必须在建完模型之后再取**。
#   踩过：写在脚本顶部 ⇒ 拿到的是"空场景"的 depsgraph，
#   后面所有 `ray_cast` 全部返回 `ok=False`（**不报错**），
#   打印出来是一排空的命中列表，很容易被当成"这个位置上方什么都没有"。


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
EXC = g.get('TREE_EXCLUDE') or []
ring_at = g.get('ring_at')
if not ST or not ring_at:
    raise SystemExit('[DT] 没拿到 STATION_LIST / ring_at —— R4 是否在链里？')

# ★ 建完模型**之后**才取 depsgraph（见文件头注释）
_DG = bpy.context.evaluated_depsgraph_get()

# 只取"站点相关"的排除区（最后 len(RING_STATIONS) 条起，含坡道长条）
_st_exc = EXC[-(len(ST) + 2):] if len(EXC) >= len(ST) + 2 else EXC
print(f'\n[DT] 站点 {len(ST)} 处 / 全部排除区 {len(EXC)} 条'
      f'（本脚本按最后 {len(_st_exc)} 条判站点相关）')


def _in_exc(x, y, e):
    cx, cy, hw, hd = e[0], e[1], e[2], e[3]
    dx, dy = x - cx, y - cy
    if len(e) > 4 and e[4]:
        c, s = math.cos(-e[4]), math.sin(-e[4])
        dx, dy = dx * c - dy * s, dx * s + dy * c
    return abs(dx) < hw and abs(dy) < hd


# ---------- A. 树干顶点侵入 ----------
_bad = {}
for _on in ('SITE_树干', 'SITE_树冠'):
    ob = bpy.data.objects.get(_on)
    if ob is None:
        print(f'[DT] !! 找不到 {_on}')
        continue
    mw = ob.matrix_world
    _n = 0
    _hit = 0
    for v in ob.data.vertices:
        _n += 1
        p = mw @ v.co
        for _i, e in enumerate(_st_exc):
            if _in_exc(p.x, p.y, e):
                _hit += 1
                _bad.setdefault(_i, 0)
                _bad[_i] += 1
                break
    print(f'[DT] {_on}：顶点 {_n} 个，落在站点排除区内 {_hit} 个')

if _bad:
    print('\n[DT] ── 侵入明细（按排除区序号）──')
    for _i in sorted(_bad):
        e = _st_exc[_i]
        print(f'   #{_i} 中心({e[0]:.1f}, {e[1]:.1f}) 半宽 {e[2]:.1f}×{e[3]:.1f}'
              f' rot={e[4] if len(e) > 4 else 0.0:.3f} → 侵入顶点 {_bad[_i]} 个')
else:
    print('[DT] ✓ 树干/树冠顶点**无一处**落在站点排除区内')

# ---------- B. 站点范围内网格射线 ----------
# ★ 探针**不能只打站点中心**：双跑楼梯在 `u = 0` 处正好是**两跑之间的缝**
#   （下跑 u<0、上跑 u>0），中心那条射线穿缝而过，命中列表是空的 ——
#   看上去像"这里上方什么都没有"，其实什么都没测到。改成在楼梯平面上铺网格。
print('\n[DT] ── 垂直交通平面网格射线（Z 4.0 起，u×v 网格）──')
_US = (-8.0, -5.0, -2.0, 0.0, 2.0, 5.0, 8.0)
_VS = (9.5, 11.5, 13.5, 15.5, 17.5)
_warn = 0
for nm, s, kind, rt in ST:
    px, py, tx, ty, nx, ny = rt
    names = {}
    for _u in _US:
        for _v in _VS:
            cur = Vector((px + tx * _u + nx * _v, py + ty * _u + ny * _v, 4.0))
            for _k in range(3):
                ok, loc, _nn, _ii, ob, _mw = bpy.context.scene.ray_cast(
                    _DG, cur, _UP, distance=200.0)
                if not ok:
                    break
                names[ob.name] = names.get(ob.name, 0) + 1
                cur = loc + _UP * 0.05
    _tree = {k: v for k, v in names.items() if k.startswith('SITE_树')}
    if _tree:
        _warn += 1
    _top = sorted(names.items(), key=lambda kv: -kv[1])[:5]
    _show = ' | '.join(f'{k}×{v}' for k, v in _top) or '(全空)'
    print(f'   {"!!" if _tree else "  "} {nm:<16} {kind}  射线 {len(_US)*len(_VS)} 条'
          f' → {_show}')
    if _tree:
        print(f'      ★ 命中树木：{_tree}')

print(f'\n[DT] 网格射线命中树的站点：{_warn} / {len(ST)}')
print('### TREE DIAG DONE ###')
