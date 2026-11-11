# -*- coding: utf-8 -*-
"""_diag_mats.py —— 材质体检：`Base Color` 到底是"常量"还是"被连线覆盖"。

用法：
    blender.exe --background <工程.blend> --python _diag_mats.py

为什么需要它：
    `set_in(bsdf, 'Base Color', ...)` 往一个**已经被连线**的插槽写 default_value，
    **不报错、也不生效** —— 连线优先。于是"重标配色"这类操作会静默失效，
    而 glTF 导出器遇到连线（程序化节点）只能导成 `baseColorFactor = [1,1,1]`（纯白）。

输出：
    ① 汇总：多少材质的 Base Color 是常量 / 被连线
    ② 被连线的材质逐个列出：连线来源节点类型 + 该节点给出的有效颜色（取端点均值）
       + 与 `palette_retune.py` 的 `_RETUNE` 目标色对比（Δ 为最大分量差）
"""

import os
import re

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))


def principled(m):
    if not m.use_nodes:
        return None
    for n in m.node_tree.nodes:
        if n.bl_idname == 'ShaderNodeBsdfPrincipled':
            return n
    return None


# ---- 读 palette_retune 的 _RETUNE 表（拿"应该是什么色"）----
TARGET = {}
rt = os.path.join(HERE, 'palette_retune.py')
if os.path.exists(rt):
    for nm, c in re.findall(r"\('(M_[^']+)',\s*\(([0-9.,\s]+)\)", open(rt, encoding='utf-8').read()):
        v = [float(x) for x in c.split(',')]
        if len(v) >= 3:
            TARGET[nm] = tuple(v[:3])

const, linked = [], []
for m in bpy.data.materials:
    b = principled(m)
    if b is None:
        continue
    s = b.inputs.get('Base Color')
    if s is None:
        continue
    if s.is_linked:
        src = s.links[0].from_node
        eff = None
        if src.bl_idname == 'ShaderNodeValToRGB':
            els = list(src.color_ramp.elements)
            if els:
                eff = tuple(sum(e.color[i] for e in els) / len(els) for i in range(3))
        linked.append((m.name, src.bl_idname, eff, tuple(s.default_value)[:3]))
    else:
        const.append((m.name, tuple(s.default_value)[:3]))

print('=' * 74)
print('① 汇总')
print('=' * 74)
print('  Base Color 为**常量**      : %d 个' % len(const))
print('  Base Color **被连线覆盖**  : %d 个' % len(linked))
print()
print('  被连线 ⇒ ①`set_in(''Base Color'')` 静默失效  ②glTF 只能导成纯白')
print()

print('=' * 74)
print('② 被连线覆盖的材质：有效色 vs 重标目标')
print('=' * 74)
print('  %-20s %-22s %-26s %s' % ('材质', '连线来源', '有效色(端点均值) vs 目标', 'Δmax'))
worst = []
for nm, bl, eff, dv in sorted(linked):
    t = TARGET.get(nm)
    if eff and t:
        d = max(abs(eff[i] - t[i]) for i in range(3))
        worst.append((d, nm, eff, t))
        print('  %-20s %-22s [%.3f %.3f %.3f] vs [%.3f %.3f %.3f]  %.3f%s'
              % (nm, bl.replace('ShaderNode', ''), eff[0], eff[1], eff[2],
                 t[0], t[1], t[2], d, '   ← 差异显著' if d > 0.05 else ''))
    else:
        print('  %-20s %-22s %s vs %s' % (nm, bl.replace('ShaderNode', ''),
                                          eff and '[%.3f %.3f %.3f]' % eff,
                                          t and '[%.3f %.3f %.3f]' % t or '（不在 _RETUNE 表里）'))
print()
if worst:
    worst.sort(reverse=True)
    print('  差异最大的 6 个：')
    for d, nm, eff, t in worst[:6]:
        print('    %-20s Δmax %.3f   （有效 %.3f → 目标 %.3f）' % (nm, d, eff[0], t[0]))
print()
print('### DIAG MATS DONE ###')
