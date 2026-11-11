# -*- coding: utf-8 -*-
"""_diag_view.py —— 机位视线诊断（挂在 build_extra 末尾，用完即删）

AABB 对环状物 / 超大面积物（远山、水面、环廊自身）完全无效 ——
改用 `scene.ray_cast`：从机位沿视线方向打一串射线，报出**前 6 个命中物 + 距离**。
"这个机位能看到什么 / 被什么挡住" 一次说清。
"""
import bpy
from mathutils import Vector

print('\n===== [DIAG VIEW] =====')
deps = bpy.context.evaluated_depsgraph_get()
IGNORE = {'SITE_对岸远山', 'SITE_水面', 'SITE_半岛地形', 'SITE_远山'}

CAND = [
    ('断面_A', (285, 412, 12.5), (235, 412, 13.5)),
    ('断面_B', (300, 412, 14.0), (235, 412, 12.6)),
    ('断面_西', (-330, 420, 26), (-228, 425, 13)),
    ('结构_西', (-340, 430, 22), (-232, 440, 13)),
    ('结构_东', (400, 430, 24), (212, 495, 13)),
    ('结构_东2', (395, 350, 20), (238, 380, 13)),
    ('东段', (330, 300, 34), (200, 520, 11)),
    ('北端', (150, 700, 52), (0, 604, 15)),
    ('站点S4', (330, 570, 34), (205, 505, 13)),
    ('南延', (-260, -160, 240), (0, 180, 6)),
    ('中轴', (0, -140, 46), (0, 150, 13)),
    ('鸟瞰', (300, -520, 700), (0, 350, 10)),
    ('桥面', (231, 400, 10.4), (196, 560, 10.2)),
    ('谷底', (0, 175, -2.0), (0, 112, 11)),
]

for nm, o, t in CAND:
    o = Vector(o)
    d = (Vector(t) - o).normalized()
    hits, cur, trav = [], o.copy(), 0.0
    for _ in range(6):
        ok, loc, nor, idx, ob, mx = bpy.context.scene.ray_cast(deps, cur, d)
        if not ok:
            break
        dist = (loc - o).length
        if ob.name not in IGNORE:
            hits.append(f'{ob.name}@{dist:.0f}m')
        cur = loc + d * 0.35
    print(f'  {nm:10s} {" | ".join(hits) if hits else "（全空）"}')

print('===== [DIAG VIEW] 结束 =====\n')
