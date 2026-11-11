"""A/B 样张补丁：R4 智慧环廊「桥下深色带」问题。

> 背景：桥面板底（Z 8.45）+ 两道纵梁（±5.40，截面 1.00×1.55，Z 6.90~8.45）
> 在侧视角合成一条 **2.10 m 高的近黑带** —— 纵梁材质 `M_STEEL` 反照率仅 0.082
> （全园最深一档）。日志里登记为「读起来偏重 → 考虑纵梁改浅色或减小截面（R5 复核）」，
> 但 R5 已定稿、这一条**从未复核**。
>
> ★ 本脚本**只用于候选图**，不进正式管线。按 skill 规矩：改已确认的成图前
>   先出 A/B 样张，同机位同尺寸并排给用户看，别直接批量重渲。

用法：追加到 build_extra 末尾（在 palette_retune.py 之后），并设环境变量 `BEAM_VAR`：
    BEAM_VAR=conc        纵梁改用清水混凝土 M_CONC（与栏板 / 桥墩同族）
    BEAM_VAR=light       纵梁改用"浅钢" M_STEEL_LT（自建：0.26/0.27/0.29 · metal .35 · rough .55）
    BEAM_VAR=thin        纵梁截面 1.55 → 1.05（几何压缩，材质不变）
    BEAM_VAR=conc_thin   以上两者同时
    不设 / 其它值 = 原样（基线）
"""
import os

import bpy

# 与 build_campus_r4.py 保持一致的三个标高
_SOFFIT = 8.45          # 桥面板底 = _DECK_Z 9.00 − _DECK_T 0.55
_TOP = 6.90             # 纵梁底（原）
_THIN_D = 1.05          # 压缩后的纵梁高
_CUT = _SOFFIT - 0.60   # 只动"明显低于板底"的顶点，避免误伤搭接段

_v = os.environ.get('BEAM_VAR', '').strip().lower()
_o = bpy.data.objects.get('R4_环廊_纵梁')

if not _v:
    print('[AB] BEAM_VAR 未设 → 基线（原样）')
elif _o is None:
    print('[AB] 找不到 R4_环廊_纵梁，跳过')
else:
    # ---- 材质 ----
    # ★ 坑：脚本里 `M_CONC` 是 **Python 变量名**，材质**名字符串**是 `'M_清水混凝土'`。
    #   用变量名去 `bpy.data.materials.get()` 会静默拿到 None（不报错、只是没改）。
    _mat = None
    _tag = ''
    if 'conc' in _v:
        for _n in ('M_清水混凝土', 'M_CONC'):
            _mat = bpy.data.materials.get(_n)
            if _mat:
                break
        _tag = '清水混凝土'
    elif 'light' in _v:
        _mat = bpy.data.materials.new('M_STEEL_LT')
        _mat.use_nodes = True
        _b = _mat.node_tree.nodes.get('Principled BSDF')
        _b.inputs['Base Color'].default_value = (0.26, 0.27, 0.29, 1.0)
        _b.inputs['Metallic'].default_value = 0.35
        _b.inputs['Roughness'].default_value = 0.55
        _tag = '浅钢'
    if _mat is not None:
        for _s in _o.material_slots:
            _s.material = _mat
        print(f'[AB] 纵梁材质 → {_tag}（{_mat.name}）')
    elif _tag:
        print(f'[AB] ⚠ 找不到「{_tag}」材质；现有 M_* ：'
              f'{[m.name for m in bpy.data.materials if m.name.startswith("M_")]}')

    # ---- 几何：把底面上移，1.55 → 1.05 ----
    if 'thin' in _v:
        _z_new = _SOFFIT - _THIN_D
        _n = 0
        for _vx in _o.data.vertices:
            if _vx.co.z < _CUT:
                _vx.co.z = _z_new
                _n += 1
        _o.data.update()
        print(f'[AB] 纵梁截面 1.55 → {_THIN_D:.2f}（移动 {_n} 个顶点，底面 '
              f'{_TOP:.2f} → {_z_new:.2f}）')

    print(f'[AB] 桥下结构带总高 = {_SOFFIT + 0.55 - (min(v.co.z for v in _o.data.vertices)):.2f} m')
