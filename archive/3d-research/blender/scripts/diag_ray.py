# -*- coding: utf-8 -*-
"""
diag_ray.py —— 从指定机位按**像素坐标**打射线，报出命中的对象名。
================================================================
用途：截图里出现"来历不明的板 / 块 / 影子"时，**不要猜**，直接问场景。
R2 第 4 版就是靠它定位到那块悬在讲堂左侧水面上的灰板 ——
结果是 `BLD_讲堂_玻璃幕` 的西立面在掠射角下把天空反射成一块亮板。

用法（便携版 Blender，无头）：
    set BR_CFG_FILE=<ASCII 路径的 json>
    blender.exe --background --factory-startup --python diag_ray.py

配置 JSON（复用渲染配置的字段，额外加 "probe"）：
    {
      "build_extra": ["build_campus_r0.py", ...],
      "jobs": [{"res_x": 960, "res_y": 540, "lens": 32,
                "cam_pos": [-130, 872, 5.2], "cam_tgt": [0, 844, 9]}],
      "probe": [{"px": 250, "py": 240, "note": "可疑灰板"}]
    }
注意：`px/py` 是**像素坐标**（左上为原点），按 `jobs[0]` 的分辨率换算。
"""

import json
import os

import bpy
from mathutils import Vector

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

job = (cfg.get('jobs') or [{}])[0]
RES_X = job.get('res_x', 960)
RES_Y = job.get('res_y', 540)
LENS = job.get('lens', 40.0)
SENSOR = 36.0
POS = Vector(job.get('cam_pos', (0, 0, 0)))
TGT = Vector(job.get('cam_tgt', (0, 100, 0)))

cam_data = bpy.data.cameras.new('DiagCam')
cam_data.lens = LENS
cam_data.sensor_width = SENSOR
cam_data.clip_start = 1.0
cam_data.clip_end = 20000.0
cam = bpy.data.objects.new('DiagCam', cam_data)
bpy.context.scene.collection.objects.link(cam)
cam.location = POS
cam.rotation_euler = (TGT - POS).to_track_quat('-Z', 'Y').to_euler()
bpy.context.view_layer.update()

R = cam.matrix_world.to_3x3()
half_w = SENSOR * 0.5
half_h = half_w * RES_Y / RES_X

dg = bpy.context.evaluated_depsgraph_get()
scene = bpy.context.scene

probes = cfg.get('probe') or []
print(f'### PROBE {len(probes)} 点 / {RES_X}x{RES_Y} / {LENS}mm ###')
for p in probes:
    px, py = p['px'], p['py']
    nx = (px + 0.5) / RES_X * 2.0 - 1.0
    ny = 1.0 - (py + 0.5) / RES_Y * 2.0
    d = R @ Vector((nx * half_w, ny * half_h, -LENS))
    d.normalize()
    ok, loc, nor, idx, ob, _mw = scene.ray_cast(dg, POS, d, distance=30000.0)
    if ok:
        print(f'  ({px:4d},{py:4d}) -> {ob.name:<34s} '
              f'hit=({loc.x:9.1f},{loc.y:9.1f},{loc.z:8.1f}) '
              f'dist={(loc - POS).length:8.1f}  {p.get("note", "")}')
    else:
        print(f'  ({px:4d},{py:4d}) -> <天空>  {p.get("note", "")}')
print('### PROBE DONE ###')
