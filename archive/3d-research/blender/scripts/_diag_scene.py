# -*- coding: utf-8 -*-
"""_diag_scene.py —— 打开已存盘的 .blend，输出"导出前体检"报告。

用法（便携版 Blender）：
    blender.exe --background <工程.blend> --python _diag_scene.py

输出四块：
    ① 规模：对象数 / 顶点 / 三角面 / 材质数 / 全场景包围盒
    ② 材质占用：每个材质的对象数与面数（用来判断"是不是每个材质都被用上"）
    ③ 重灾对象：三角面数最大的 15 个（决定要不要合并 / 减面）
    ④ 语言一致性收口：扫描对象名里的"旧语言关键词"（V2 已定拆除/取消的构件）
       与"非 V2 配色材质"（朱漆红 / 黛瓦黑 一类残留）

★ 只读，不改场景。
"""

import os
import re
import sys
from collections import defaultdict

import bpy

# ---- V2 已定"拆除 / 取消"的旧语言构件关键词 ----
OLD_WORDS = [
    '牌坊', '牌楼', '阙', '石狮', '华表', '明堂', '钟楼', 'Bell', 'bell',
    '碑', '朱漆', '黛瓦', '琉璃', '斗拱_旧', '飞檐', '脊兽', '照壁',
]
# ---- V2 配色白名单外的可疑材质名（旧朱漆红 / 黛瓦黑 一类）----
SUSPECT_MAT = ['朱', 'red', 'Red', '漆', '琉璃', '黛', '旧']

objs = [o for o in bpy.data.objects if o.type == 'MESH']
print('=' * 68)
print('① 规模')
print('=' * 68)

n_v = n_t = 0
for o in objs:
    m = o.data
    n_v += len(m.vertices)
    m.calc_loop_triangles()
    n_t += len(m.loop_triangles)
print('  mesh 对象   %6d' % len(objs))
print('  其它对象    %6d（EMPTY/相机/灯光等）' % (len(bpy.data.objects) - len(objs)))
print('  顶点        %6d' % n_v)
print('  三角面      %6d' % n_t)
print('  材质        %6d' % len(bpy.data.materials))
print('  集合        %6d' % len(bpy.data.collections))

# 全场景包围盒（用物体 world 包围盒角点）
INF = float('inf')
bb = [INF, INF, INF, -INF, -INF, -INF]
for o in bpy.data.objects:
    if o.type not in ('MESH', 'EMPTY'):
        continue
    for c in o.bound_box:
        w = o.matrix_world @ __import__('mathutils').Vector(c)
        for i in range(3):
            bb[i] = min(bb[i], w[i])
            bb[i + 3] = max(bb[i + 3], w[i])
print('  包围盒      X[%.1f, %.1f]  Y[%.1f, %.1f]  Z[%.1f, %.1f]'
      % (bb[0], bb[3], bb[1], bb[4], bb[2], bb[5]))
print('  尺寸        %.0f × %.0f × %.0f m' % (bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]))

# ---------------- ② 材质占用 ----------------
print()
print('=' * 68)
print('② 材质占用（对象数 / 面数）')
print('=' * 68)
mat_obj = defaultdict(int)
mat_tri = defaultdict(int)
for o in objs:
    seen = set()
    o.data.calc_loop_triangles()
    for s in o.material_slots:
        if s.material:
            seen.add(s.material.name)
    for nm in seen:
        mat_obj[nm] += 1
    # 面数按槽位分摊：单材质对象直接记全量，多材质对象按槽数均分（够用）
    n = len([s for s in o.material_slots if s.material]) or 1
    for s in o.material_slots:
        if s.material:
            mat_tri[s.material.name] += len(o.data.loop_triangles) / n

for nm in sorted(mat_tri, key=lambda k: -mat_tri[k]):
    print('  %-22s %5d obj  %8d tri' % (nm, mat_obj[nm], int(mat_tri[nm])))

unused = [m.name for m in bpy.data.materials if m.name not in mat_tri]
if unused:
    print('  ⚠ 未被任何对象引用：%s' % unused)

# ---------------- ③ 重灾对象 ----------------
print()
print('=' * 68)
print('③ 三角面数最大的 20 个对象')
print('=' * 68)
rows = []
for o in objs:
    o.data.calc_loop_triangles()
    rows.append((len(o.data.loop_triangles), o.name, len(o.material_slots)))
rows.sort(reverse=True)
for t, nm, ms in rows[:20]:
    print('  %8d tri  %-42s %d 材质槽' % (t, nm, ms))
print('  合计 %d 个对象' % len(rows))

# ---------------- ④ 语言一致性收口 ----------------
print()
print('=' * 68)
print('④ 语言一致性收口')
print('=' * 68)
hits = defaultdict(list)
for o in bpy.data.objects:
    for w in OLD_WORDS:
        if w in o.name:
            hits[w].append(o.name)
if hits:
    for w, names in hits.items():
        print('  ⚠ 旧语言关键词「%s」命中 %d 个：' % (w, len(names)))
        for nm in names[:8]:
            print('      %s' % nm)
else:
    print('  ✓ 未命中任何旧语言关键词')

sm = [m.name for m in bpy.data.materials
      if any(k in m.name for k in SUSPECT_MAT)]
print('  %s 可疑配色材质：%s' % ('⚠' if sm else '✓', sm or '无'))

print()
print('### DIAG DONE ###')
