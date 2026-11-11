# -*- coding: utf-8 -*-
"""diag_grid.py —— 一次构建，遍历配置里**所有机位**做 5×3 网格射线，报首个命中物。

用途：批量排查"这张图的主体是不是被别的东西挡住了 / 机位是不是对着目标"。
是 `diag_ray.py`（单点、只认 jobs[0]）的批量版。

用法（便携版 Blender，无头）：
    BR_CFG_FILE=<阶段配置 json> blender.exe --background --factory-startup --python diag_grid.py

输出：每个机位一行摘要 —— 中心 3 格命中物 + 全网格去重命中物（带次数）。
"""
import json
import os
from collections import Counter

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SENSOR = 36.0


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

cam_data = bpy.data.cameras.new('GridCam')
cam_data.sensor_width = SENSOR
cam_data.clip_start = 1.0
cam_data.clip_end = 20000.0
cam = bpy.data.objects.new('GridCam', cam_data)
bpy.context.scene.collection.objects.link(cam)

jobs = cfg.get('jobs') or []
print(f'\n### GRID 5x3 / {len(jobs)} 个机位 ###')
for j in jobs:
    RES_X = j.get('res_x', 960)
    RES_Y = j.get('res_y', 540)
    cam_data.lens = j.get('lens', 40.0)
    POS = Vector(j.get('cam_pos', (0, 0, 0)))
    TGT = Vector(j.get('cam_tgt', (0, 100, 0)))
    cam.location = POS
    cam.rotation_euler = (TGT - POS).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.view_layer.update()

    R = cam.matrix_world.to_3x3()
    half_w = SENSOR * 0.5
    half_h = half_w * RES_Y / RES_X
    dg = bpy.context.evaluated_depsgraph_get()
    scene = bpy.context.scene

    names, row_c = [], []
    for iy in range(3):
        for ix in range(5):
            px = (ix + 0.5) / 5.0 * RES_X
            py = (iy + 0.5) / 3.0 * RES_Y
            nx = (px + 0.5) / RES_X * 2.0 - 1.0
            ny = 1.0 - (py + 0.5) / RES_Y * 2.0
            d = R @ Vector((nx * half_w, ny * half_h, -cam_data.lens))
            d.normalize()
            ok, loc, _n, _i, ob, _mw = scene.ray_cast(dg, POS, d, distance=30000.0)
            nm = ob.name if ok else '<天空>'
            names.append(nm)
            if iy == 1:
                row_c.append(nm)

    cnt = Counter(names)
    top = ' / '.join('%s×%d' % (n, c) for n, c in cnt.most_common(4))
    print(f'  {j["name"]:<22s} 中心: {" | ".join(row_c)}')
    print(f'  {"":22s} 全网格: {top}')
print('### GRID DONE ###')
