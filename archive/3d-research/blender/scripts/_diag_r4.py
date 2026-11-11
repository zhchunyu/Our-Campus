# -*- coding: utf-8 -*-
"""_diag_r4.py —— R4 智慧环廊诊断（挂在 build_extra 末尾，用完即删）

查三件事：
  1. 还有哪些 `BLD_<分区>_` 占位体块没被清障（打印世界 AABB）
  2. 给定候选机位是否落在某个实体的 AABB 内（机位黑屏的根因）
  3. 环廊自身构件的 AABB（确认屋面/格栅/拱的标高没写错）
"""
import bpy
from mathutils import Vector

print('\n===== [DIAG R4] =====')


def aabb(ob):
    vs = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    return (min(v.x for v in vs), max(v.x for v in vs),
            min(v.y for v in vs), max(v.y for v in vs),
            min(v.z for v in vs), max(v.z for v in vs))


ZONE_PREFIX = ('BLD_科技_', 'BLD_实验_', 'BLD_教学_', 'BLD_运动_', 'BLD_生活_')
print('\n--- 1. 剩余分区占位体块 ---')
_rest = []
for ob in bpy.data.objects:
    if ob.type != 'MESH' or not any(ob.name.startswith(p) for p in ZONE_PREFIX):
        continue
    x0, x1, y0, y1, z0, z1 = aabb(ob)
    _rest.append((ob.name, x0, x1, y0, y1, z0, z1))
for nm, x0, x1, y0, y1, z0, z1 in sorted(_rest):
    print(f'  {nm:34s} X {x0:8.1f}~{x1:8.1f}  Y {y0:8.1f}~{y1:8.1f}  Z {z0:6.1f}~{z1:6.1f}')
print(f'  共 {len(_rest)} 个')

print('\n--- 2. 候选机位占用检查 ---')
CAND = [
    ('A_鸟瞰', 300, -520, 700), ('B_东段', 330, 300, 34),
    ('C_谷底', 0, 175, -2.0), ('D_南延远望', -260, -160, 240),
    ('E_桥面', 233, 390, 10.7), ('F_结构近景', 300, 470, 22),
    ('G_北端', 150, 700, 52), ('H_站点S4', 330, 570, 34),
    ('I_中轴', 0, -140, 46),
    # 备选机位
    ('F2_内侧看断面', 150, 452, 14), ('F3_内侧看断面', 120, 480, 12),
    ('F4_外侧看断面', 360, 520, 20), ('F5_外侧看断面', 420, 560, 26),
    ('J_断面正交', 300, 400, 12),
]
for nm, cx, cy, cz in CAND:
    hits = []
    for ob in bpy.data.objects:
        if ob.type != 'MESH':
            continue
        x0, x1, y0, y1, z0, z1 = aabb(ob)
        if x0 <= cx <= x1 and y0 <= cy <= y1 and z0 <= cz <= z1:
            hits.append(ob.name)
    print(f'  {nm:16s} ({cx:7.1f},{cy:7.1f},{cz:7.1f})  '
          + ('** 被占用: ' + ', '.join(hits[:6]) if hits else 'ok 空'))

print('\n--- 3. 环廊构件标高 ---')
for ob in sorted(bpy.data.objects, key=lambda o: o.name):
    if not ob.name.startswith('R4_环廊_') and not ob.name.startswith('R4_站点'):
        continue
    x0, x1, y0, y1, z0, z1 = aabb(ob)
    nv = len(ob.data.vertices) if ob.type == 'MESH' else 0
    print(f'  {ob.name:26s} Z {z0:7.2f}~{z1:7.2f}   X {x0:7.1f}~{x1:7.1f}'
          f'  Y {y0:7.1f}~{y1:7.1f}  顶点 {nv}')

print('\n--- 4. 环廊与已建建筑的净距（AABB 平面相交检测）---')
BLD = ('BLD_人文_', 'BLD_讲堂_', 'ANCHOR_', 'BLD_中轴_')
R4 = [ob for ob in bpy.data.objects
      if ob.type == 'MESH' and (ob.name.startswith('R4_环廊_')
                                or ob.name.startswith('R4_站点'))]
BOX = [ob for ob in bpy.data.objects
       if ob.type == 'MESH' and ob.name.startswith(BLD)]
for a in R4:
    ax0, ax1, ay0, ay1, az0, az1 = aabb(a)
    for b in BOX:
        bx0, bx1, by0, by1, bz0, bz1 = aabb(b)
        ox = min(ax1, bx1) - max(ax0, bx0)
        oy = min(ay1, by1) - max(ay0, by0)
        oz = min(az1, bz1) - max(az0, bz0)
        if ox > -0.5 and oy > -0.5 and oz > -0.5:
            print(f'  ** 体量相交: {a.name} × {b.name}'
                  f'  (X {ox:.1f} / Y {oy:.1f} / Z {oz:.1f})')
print('===== [DIAG R4] 结束 =====\n')
