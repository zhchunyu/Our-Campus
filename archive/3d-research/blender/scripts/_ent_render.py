# -*- coding: utf-8 -*-
"""
_ent_render.py —— 入口门廊**逐栋近景**验证渲染（只读，不改模型）
=====================================================================================
用途：`_entrance_all.py` 的门廊位置全部靠射线实测得来，**必须看图确认**它真的落在
      墙面上、踏步真的落到地面。几何自检查不出"墙面找错了一面装饰构件"这类错误 ——
      那类错误在数值上完全合法，只有眼睛能看出来。

用法（便携版 Blender，无头）：
    set BR_CFG_FILE=<含完整 build_extra 链的 json>
    set BR_RENDER_DIR=<输出目录>
    blender.exe --background --factory-startup --python _ent_render.py

机位不是手填的：从 `ENT_LIST`（`_entrance_all.py` 留在 globals 里的门廊清单）
逐栋取 `face / wall / cu / z_base`，沿**面的外法线**退开 22 m、横向偏 11 m、
抬高 13 m，看门廊本体。这样 23 栋的门廊朝向各不相同也不用写 23 组坐标，
而且**楼一挪位置机位跟着挪**，不会静默失效。

★ 只验证用，成图落 `BR_RENDER_DIR`（默认 `renders/_ent/`），不进交付目录。
"""
import os

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ASSET = os.path.dirname(os.path.dirname(HERE))
RENDER_PY = os.path.join(HERE, 'render_campus_site.py')
OUT_DIR = os.environ.get('BR_RENDER_DIR') or os.path.join(ASSET, 'renders', '_ent')

RES = int(os.environ.get('BR_ENT_RES', '800'))
SPP = int(os.environ.get('BR_ENT_SPP', '24'))
# 只渲指定的几栋（逗号分隔的子串匹配）；不设则全渲。
_ONLY = [s for s in (os.environ.get('BR_ENT_ONLY') or '').split(',') if s]


def run(path, extra=None):
    with open(path, encoding='utf-8') as fh:
        src = fh.read()
    g = {'__name__': '__main__', '__file__': path}
    if extra:
        g.update(extra)
    exec(compile(src, path, 'exec'), g)
    return g


# ---- 1. 建全场景（与 run_campus.py 同一套顺序）----
import json                                                    # noqa: E402

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

ENTS = g.get('ENT_LIST') or []
if not ENTS:
    raise SystemExit('[ENTR] 没拿到 ENT_LIST —— `_entrance_all.py` 是否在 build_extra 链里？')

# ---- 2. 逐栋摆机位 ----
# 面的外法线 / 横向（都只用到水平分量，Y 是"北"）
_OUTV = {'N': (0.0, 1.0), 'S': (0.0, -1.0), 'E': (1.0, 0.0), 'W': (-1.0, 0.0)}
_LATV = {'N': (1.0, 0.0), 'S': (1.0, 0.0), 'E': (0.0, 1.0), 'W': (0.0, 1.0)}

# ★ 机位退距可调。默认 22 m 是"能看全 6 m 门廊 + 踏步"的距离，但密集区
#   （人文区三个 Academy 挤在一起）退到 22 m 会退到**隔壁楼的屋面之上**，
#   拍回来只有屋顶。这时用 `BR_ENT_DIST=13 BR_ENT_LAT=6 BR_ENT_UP=5.5` 贴近拍。
_DIST = float(os.environ.get('BR_ENT_DIST', '22'))
_LAT = float(os.environ.get('BR_ENT_LAT', '11'))
_UP = float(os.environ.get('BR_ENT_UP', '13'))

_BASE = {
    'res_x': RES, 'res_y': int(RES * 0.5625), 'samples': SPP,
    'lens': 45.0,
    'sun_elev': 38.0, 'sun_azim': 220.0, 'sun_strength': 5.8,
    'sky_strength': 0.66, 'ambient_tint': [1.08, 0.92, 0.7],
    'exposure': 0.2, 'haze_density': 1.2e-05,
    'cloud_strength': 4.5, 'cloud_scale': 2.2,
    'sun_color': [1.0, 0.905, 0.775], 'sky_visible': 0.72,
    'view_transform': 'Khronos PBR Neutral',
}

os.makedirs(OUT_DIR, exist_ok=True)
_n = 0
for d in ENTS:
    short = d['name'][4:] if d['name'].startswith('BLD_') else d['name']
    if _ONLY and not any(k in short for k in _ONLY):
        continue
    f, wall, cu, zb = d['face'], d['wall'], d['cu'], d['z_base']
    ox, oy = _OUTV[f]
    lx, ly = _LATV[f]
    if f in ('N', 'S'):
        wx, wy = cu, wall
    else:
        wx, wy = wall, cu
    tgt = (wx + ox * 2.0, wy + oy * 2.0, zb + 2.2)
    cam = (wx + ox * _DIST + lx * _LAT,
           wy + oy * _DIST + ly * _LAT,
           zb + _UP)
    job = dict(_BASE)
    job['cam_pos'] = list(cam)
    job['cam_tgt'] = list(tgt)
    name = f'E_{short}_{f}'
    print(f'### ENTR RENDER : {name} ###')
    run(RENDER_PY, {'RENDER_CFG': dict(job, out=os.path.join(OUT_DIR, name + '.png'))})
    _n += 1

print(f'[ENTR] 渲染完成 {_n} 张 → {OUT_DIR}')
