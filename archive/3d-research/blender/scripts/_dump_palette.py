#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""_dump_palette.py —— 从**已建好的 .blend** 里导出材质色板（sRGB hex），落盘 JSON。

★ 为什么要有这一支（2026-09-26 S4-d）：
  `make_overview_html.py` 里的材质色板是**硬编码**的 ——
      PAL = [('清水混凝土', '#5E574C'), ..., ('草地', '#1D2C11'), ('钛锌屋面板', '#20201D')]
  而配色真源是 `palette_retune.py` 的 `_RETUNE` 表。两者各写一份 ⇒ **改一次旧一次，
  而且不报错**：总览页上那块"草地色"和成图里的草地根本不是一个颜色，没人会发现。
  这正是本项目反复踩的"同一份数据在两处各写一份"。
  ⇒ 色板改为从**真源**（.blend 里材质插槽的实际取值）算出来。

★ 注意口径：材质插槽可能是**常量**，也可能被 `Noise → ColorRamp` **连线**驱动
  （见 `palette_retune.py` 的 V2.4 说明）。连线的取"各端点的均值"，与重标时的平移基准一致。

用法（必须先把 .blend 打开）：
    blender.exe --background <blend> --python scripts/_dump_palette.py -- <out.json>
不传输出路径则写到 `<工程>/02-三维资产/renders/材质色板.json`。
"""

import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.abspath(os.path.join(HERE, '..', '..', '..'))

# 总览页色板的显示顺序（显示名, 材质名）。不在这里的材质仍会全部导出，
# 只是不会出现在总览页的那一排色块里。
PAL_ORDER = (
    ('清水混凝土', 'M_清水混凝土'),
    ('混凝土楼板', 'M_混凝土楼板'),
    ('墨灰钢构', 'M_墨灰钢构'),
    ('超白玻璃', 'M_超白玻璃'),
    ('竹木格栅', 'M_竹木格栅'),
    ('胶合木', 'M_胶合木'),
    ('铜饰', 'M_铜饰'),
    ('屋面·暖灰', 'M_钛锌板_暖灰'),
    ('屋面·铜绿', 'M_钛锌板_铜绿'),
    ('屋面·暖灰(中轴)', 'M_钛锌屋面板'),
    ('中轴铺装', 'M_中轴铺装'),
    ('广场铺装', 'M_广场铺装'),
    ('草地', 'M_草地'),
    ('林地', 'M_林地'),
    ('水面', 'M_水'),
)


def _lin2srgb(v):
    v = min(1.0, max(0.0, v))
    return v * 12.92 if v <= 0.0031308 else 1.055 * (v ** (1.0 / 2.4)) - 0.055


def _base_of(mat):
    """返回 (线性RGB三元组, 来源)。连线时取 ColorRamp 各端点均值。"""
    bsdf = None
    for n in mat.node_tree.nodes:
        if n.bl_idname == 'ShaderNodeBsdfPrincipled':
            bsdf = n
            break
    if bsdf is None:
        return None, 'no-bsdf'
    s = bsdf.inputs.get('Base Color')
    if s is None:
        return None, 'no-base'
    if s.is_linked:
        src = s.links[0].from_node
        if src.bl_idname == 'ShaderNodeValToRGB':
            els = list(src.color_ramp.elements)
            return tuple(sum(e.color[i] for e in els) / len(els) for i in range(3)), 'link'
        return None, 'link-' + src.bl_idname
    return tuple(s.default_value[i] for i in range(3)), 'const'


def _sock(bsdf, name):
    s = bsdf.inputs.get(name)
    if s is None or s.is_linked:
        return None
    return s.default_value


def dump():
    mats = {}
    for m in bpy.data.materials:
        if not m.name.startswith('M_'):
            continue
        col, how = _base_of(m)
        bsdf = None
        for n in m.node_tree.nodes:
            if n.bl_idname == 'ShaderNodeBsdfPrincipled':
                bsdf = n
                break
        rec = {'how': how, 'users': m.users}
        if col is not None:
            rec['linear'] = [round(v, 4) for v in col]
            rec['srgb'] = [int(round(_lin2srgb(v) * 255)) for v in col]
            rec['hex'] = '#%02X%02X%02X' % tuple(rec['srgb'])
        if bsdf is not None:
            for k, key in (('Roughness', 'rough'), ('Metallic', 'metal')):
                v = _sock(bsdf, k)
                if v is not None:
                    rec[key] = round(v, 3)
        mats[m.name] = rec

    pal = [[label, mats[mn]['hex']] for label, mn in PAL_ORDER
           if mn in mats and 'hex' in mats[mn]]
    miss = [mn for _, mn in PAL_ORDER if mn not in mats]
    return {'materials': mats, 'pal': pal, 'pal_missing': miss}


def main():
    argv = sys.argv
    out = argv[argv.index('--') + 1] if '--' in argv else \
        os.path.join(WORK, '02-三维资产', 'renders', '材质色板.json')
    d = dump()
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(d, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('[PALETTE-DUMP] %d 个材质 → %s' % (len(d['materials']), out))
    for label, hx in d['pal']:
        print('[PALETTE-DUMP]   %-16s %s' % (label, hx))
    if d['pal_missing']:
        print('[PALETTE-DUMP]   ⚠ 本阶段未建（总览页色板会少这几块）：%s'
              % ' '.join(d['pal_missing']))


main()
