# -*- coding: utf-8 -*-
"""_diag_cam.py —— 机位 / 坐标 / 体量高度 一次性体检（挂在 build_extra 末尾，用完即删）

回答三件事：
  1. `W()` 到底把 SVG 映射到世界的哪里（打印若干已知点的双向换算）
  2. 关键对象的**世界包围盒**（中心 + 顶高）—— 用来核对"天际线"是否真的错落
  3. 每个机位画面上 5×3 网格的首个命中物 —— 用来核对机位是否真的对着目标区
"""
import json
import math
import os

import bpy
from mathutils import Vector

_cf = os.environ.get('BR_CFG_FILE')
_cfg = {}
if _cf and os.path.exists(_cf):
    with open(_cf, encoding='utf-8') as _fh:
        _cfg = json.load(_fh)

print('\n===== [DIAG CAM] =====')
print(f'  S={S}  AX={AX}  BASE={BASE}  Z_TOP={Z_TOP}')
for _p in ((340, 516), (340, 100), (0, 0), (680, 0), (340, 250)):
    print(f'  W{_p} -> {tuple(round(v, 1) for v in W(_p[0], _p[1]))}')

_KEYS = ('山门_崖体', 'Vertical_Academy_Core', 'Library_Shell', '校门',
         'R4_环廊_筒壳', 'R5_', 'BLD_科技_', 'BLD_实验_', 'BLD_教学_',
         'BLD_运动_', 'BLD_生活_')
print('  ── 关键对象世界包围盒（中心 X,Y / 顶 Z / 底 Z）──')
_rows = []
for _ob in bpy.data.objects:
    if _ob.type != 'MESH':
        continue
    if not any(_k in _ob.name for _k in _KEYS):
        continue
    _cs = [_ob.matrix_world @ Vector(c) for c in _ob.bound_box]
    _x0 = min(c.x for c in _cs); _x1 = max(c.x for c in _cs)
    _y0 = min(c.y for c in _cs); _y1 = max(c.y for c in _cs)
    _z0 = min(c.z for c in _cs); _z1 = max(c.z for c in _cs)
    _rows.append((_z1, _ob.name, (_x0 + _x1) * 0.5, (_y0 + _y1) * 0.5, _z0, _z1,
                  _x1 - _x0, _y1 - _y0))
_rows.sort(reverse=True)
for _z1, _nm, _cx, _cy, _z0, _z1b, _wx, _wy in _rows[:34]:
    print(f'    {_nm:42s} c=({_cx:8.1f},{_cy:8.1f}) Z {_z0:6.2f}→{_z1b:6.2f} '
          f'尺寸 {_wx:6.0f}×{_wy:6.0f}')

_deps = bpy.context.evaluated_depsgraph_get()
_IGN = ('SITE_对岸', 'SITE_水面', 'SITE_半岛', 'SITE_远山')
for _j in (_cfg.get('jobs') or []):
    _rx, _ry = _j.get('res_x', 960), _j.get('res_y', 540)
    _lens = _j.get('lens', 40.0)
    _o = Vector(_j.get('cam_pos'))
    _t = Vector(_j.get('cam_tgt'))
    _f = (_t - _o).normalized()
    _r = _f.cross(Vector((0, 0, 1))).normalized()
    _u = _r.cross(_f).normalized()
    _hw = math.tan(math.atan(18.0 / _lens))
    _hh = _hw * _ry / float(_rx)
    print(f'  ── {_j.get("name")}  cam={tuple(round(v) for v in _o)} '
          f'tgt={tuple(round(v) for v in _t)} lens={_lens}')
    for _vy in (0.62, 0.0, -0.62):
        _cells = []
        for _vx in (-0.85, -0.42, 0.0, 0.42, 0.85):
            _d = (_f + _r * (_vx * _hw) + _u * (_vy * _hh)).normalized()
            _cur, _hit = _o.copy(), None
            for _ in range(5):
                _ok, _loc, _nor, _idx, _ob, _mx = bpy.context.scene.ray_cast(
                    _deps, _cur, _d)
                if not _ok:
                    break
                if not _ob.name.startswith(_IGN):
                    _hit = f'{_ob.name}@{(_loc - _o).length:.0f}'
                    break
                _cur = _loc + _d * 0.5
            _cells.append(_hit or '空/天')
        print('     ' + ' | '.join(f'{c:24s}' for c in _cells))

print('===== [DIAG CAM] 结束 =====\n')
