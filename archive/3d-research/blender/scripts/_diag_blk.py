# -*- coding: utf-8 -*-
"""_diag_blk.py —— 打印"分区占位体块"材质的实际取值（验证 palette_retune 有没有落到它们身上）。

用法：
    blender.exe --background <工程.blend> --python _diag_blk.py

为什么单独写一个：`_diag_mats.py` 关心的是"Base Color 被连线覆盖"的材质
（静默失效的重灾区），而 `M_体块_*` 是**常量**材质，正好落在它的输出之外。
占位体块是"旧语言语境"里最容易失控的一批（数量 20+、面积大），
所以单独体检：RGB / 粗糙度 / 金属度 / 是否被连线。
"""
import bpy

NAMES = [
    'M_体块_人文', 'M_体块_科技', 'M_体块_教学',
    'M_体块_运动', 'M_体块_生活', 'M_体块_实验',
    # 对照组：真建筑与分区铺装，用来核对"体块应当比清水混凝土略暗"这条判据
    'M_清水混凝土', 'M_混凝土楼板', 'M_区_人文', 'M_区_科技',
]

print('=== 体块占位材质实际取值 ===')
for n in NAMES:
    m = bpy.data.materials.get(n)
    if m is None:
        print('  %-14s 未建' % n)
        continue
    b = None
    for nd in m.node_tree.nodes:
        if nd.bl_idname == 'ShaderNodeBsdfPrincipled':
            b = nd
            break
    if b is None:
        print('  %-14s 无 Principled' % n)
        continue
    s = b.inputs['Base Color']
    c = s.default_value
    tag = 'LINKS' if s.is_linked else 'const'
    print('  %-14s %-5s RGB=(%.3f, %.3f, %.3f)  rough=%.2f metal=%.2f'
          % (n, tag, c[0], c[1], c[2],
             b.inputs['Roughness'].default_value,
             b.inputs['Metallic'].default_value))
print('=== 完 ===')
