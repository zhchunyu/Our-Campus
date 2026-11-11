# -*- coding: utf-8 -*-
"""
diag_vol.py —— **体积查询**：报出有哪些对象在给定 AABB 内有顶点。
================================================================
用途：确认"树 / 灯柱 / 构筑物有没有长进某栋建筑的体量里"。
R2 就是靠它查到滨水林带的树冠顶点最高到 Z 13.1，而漂浮讲堂楼板顶才 6.90 ——
**树直接穿楼板长进了玻璃幕里**（这类问题在画面上往往只是"一块看不清的绿"）。

用法（便携版 Blender，无头）：
    set BR_CFG_FILE=<ASCII 路径的 json>
    blender.exe --background --factory-startup --python diag_vol.py

配置 JSON（复用 build_extra，额外加 "vol"）：
    {
      "build_extra": ["build_campus_r0.py", ...],
      "vol": [{"name": "漂浮讲堂楼板", "x0": -36, "x1": 36,
               "y0": 816, "y1": 868, "z0": 5.8, "z1": 24.0,
               "objs": ["SITE_树干", "SITE_树冠"]}]
    }
`objs` 省略时查**全部网格对象**（对象多，但只有真正侵入的才会打印）。
"""

import json
import os

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))


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

print('### VOLUME QUERY ###')
for v in (cfg.get('vol') or []):
    x0, x1 = v['x0'], v['x1']
    y0, y1 = v['y0'], v['y1']
    z0, z1 = v['z0'], v['z1']
    names = v.get('objs')
    targets = ([bpy.data.objects[n] for n in names if n in bpy.data.objects]
               if names else [o for o in bpy.data.objects if o.type == 'MESH'])
    print(f'--- {v["name"]}: X[{x0},{x1}] Y[{y0},{y1}] Z[{z0},{z1}] '
          f'/ 查 {len(targets)} 个对象 ---')
    total = 0
    for ob in targets:
        n = 0
        bx0 = by0 = bz0 = 1e18
        bx1 = by1 = bz1 = -1e18
        for vt in ob.data.vertices:
            x, y, z = vt.co
            if x0 <= x <= x1 and y0 <= y <= y1 and z0 <= z <= z1:
                n += 1
                bx0, by0, bz0 = min(bx0, x), min(by0, y), min(bz0, z)
                bx1, by1, bz1 = max(bx1, x), max(by1, y), max(bz1, z)
        if n:
            total += n
            print(f'    {ob.name:<34s} {n:6d} 顶点  '
                  f'范围 X[{bx0:8.1f},{bx1:8.1f}] Y[{by0:8.1f},{by1:8.1f}] '
                  f'Z[{bz0:7.2f},{bz1:7.2f}]')
    if total == 0:
        print('    (无侵入)')
print('### VOLUME DONE ###')
