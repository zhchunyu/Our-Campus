# -*- coding: utf-8 -*-
"""
make_green_ab_config.py —— 生成「草坪饱和度 + 树叶透光」的 A/B 对照配置
=====================================================================================
一次性工具，**不参与交付管线**（交付配方仍是 `configs/_src/rN_final.json`）。

为什么要有它：
  V2.5 动了两样**全园性**的东西 —— 草地/林地/土丘草三档绿（`palette_retune.py`）
  和树叶透光（`build_campus_site.py` 的 `make_mat_leaf`）。
  这两样都**只能靠渲染看出来**，而且"看起来更好了"不算证据。
  ⇒ 用**同一份配置、同一批机位**，只切两个环境变量，渲前后两遍：

      before :  BR_GRASS_V24=1  BR_LEAF_TRANS=0
      after :   （两个都用默认值）

  两个开关都写在生产脚本里（`palette_retune.py` / `build_campus_site.py`），
  **不是在这里打补丁** —— 否则"before"渲的就不是真历史版本，A/B 是假的。

机位选择（6 个，晴 3 + 阴 3）：
  · AB1 全园东南鸟瞰  —— 草地是画面主体，**饱和度指标最干净**的一格
  · AB2 教学区近景    —— 教学区补强 + 行道树
  · AB3 图书馆中轴    —— 中轴序列 + 主景树（图书馆前庭锚点）
  · AB4 图书馆退台_阴 —— 主景树近景（参考图的机位语言）
  · AB5 前庭人视_阴   —— 人眼高度，草 + 树同时入画
  · AB6 滨水近景_阴   —— 人眼高度，对岸林带
  ★ 晴 3 个沿用 R5/R2 的既有 cam_pos/lens，阴 3 个沿用 overcast.json 的，
    这样"after"成图还能顺带和 `renders/` 里的历史成图对一眼。

用法：
    python make_green_ab_config.py
    → configs/_green_ab.json
"""

import io
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = os.path.join(os.path.dirname(HERE), 'configs')

# 与 configs/r5.json 的 build_extra 完全一致（含主景树与教学区补强），
# palette_retune 仍是最后一项。
BUILD_EXTRA = [
    'build_campus_stage1.py',
    'build_campus_stage2.py',
    'build_campus_stage3.py',
    'build_campus_r0.py',
    'build_campus_r1.py',
    'build_campus_r2.py',
    'build_campus_r3.py',
    'build_campus_r4.py',
    'build_campus_r5.py',
    'build_campus_r6.py',
    '_trees_hero.py',
    '_teach_detail.py',
    'palette_retune.py',
]

# ---- 光照：从 configs/r5.json 与 configs/overcast.json 抄来的既有配方 ----
SUN = {
    'sun_elev': 38, 'sun_azim': 220, 'sun_strength': 5.8,
    'sky_strength': 0.66, 'ambient_tint': [1.08, 0.92, 0.70],
    'exposure': 0.20, 'haze_density': 1.2e-05,
    'cloud_strength': 4.5, 'cloud_scale': 2.2,
    'sun_color': [1.0, 0.905, 0.775], 'sky_visible': 0.72,
    'view_transform': 'Khronos PBR Neutral',
}
OVER = {
    'sun_elev': 38.0, 'sun_azim': 220.0, 'sun_strength': 0.20, 'sun_angle': 16.0,
    'sky_strength': 0.85, 'sky_visible': 0.16,
    'cloud_strength': 1.70, 'cloud_scale': 3.2,
    'air_density': 3.4, 'dust_density': 2.6,
    'ambient_tint': [1.02, 1.00, 1.04], 'exposure': -0.55,
    'view_transform': 'Khronos PBR Neutral', 'view_look': 'None',
}

# (name, 光照, cam_pos, cam_tgt, lens, res_x, res_y, samples, 附加字段)
CAMS = [
    ('AB1_全园东南鸟瞰_晴', SUN, [700, -420, 520], [0, 420, 25], 40, 1600, 900, 110, None),
    ('AB2_教学区近景_晴', SUN, [170, 200, 34], [300, 340, 36], 50, 1600, 900, 110, None),
    ('AB3_图书馆中轴_晴', SUN, [0, 300, 40], [0, 518.4, 24], 40, 1600, 900, 110, None),
    ('AB4_图书馆退台_阴', OVER, [-140, 452, 30], [-20, 508, 26], 45, 1280, 720, 192, None),
    ('AB5_前庭人视_阴', OVER, [275, 392, 4.6], [295, 382, 8], 32, 1280, 720, 192,
     {'dof': True, 'fstop': 3.2, 'blades': 7, 'focus_scale': 1.0}),
    ('AB6_滨水近景_阴', OVER, [-128, 856, 4.6], [96, 849, 3.0], 36, 1280, 720, 192,
     {'dof': True, 'fstop': 5.6, 'blades': 7, 'focus_scale': 1.0}),
]

jobs = []
for name, light, pos, tgt, lens, rx, ry, spp, extra in CAMS:
    j = {'name': name, 'cam_pos': pos, 'cam_tgt': tgt, 'lens': lens,
         'res_x': rx, 'res_y': ry, 'samples': spp}
    j.update(light)
    if extra:
        j.update(extra)
    jobs.append(j)

cfg = {'blend': '_tmp_green_ab.blend', 'build_extra': BUILD_EXTRA, 'jobs': jobs}

out = os.path.join(CFG, '_green_ab.json')
with io.open(out, 'w', encoding='utf-8') as fh:
    json.dump(cfg, fh, ensure_ascii=False, indent=1)
print('已写出 %s（%d 个机位）' % (out, len(jobs)))
for j in jobs:
    print('  %-22s %dx%d %sspp  lens %s' % (j['name'], j['res_x'], j['res_y'],
                                            j['samples'], j['lens']))
