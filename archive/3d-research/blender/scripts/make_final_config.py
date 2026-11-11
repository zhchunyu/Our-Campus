# -*- coding: utf-8 -*-
"""
make_final_config.py —— 「质感升级 V2.5」交付批次的渲染配置
=====================================================================================
产出：`configs/_final.json`（一次性工具，**不参与交付管线**；
      交付配方仍是 `configs/_src/rN_final.json`）

这一批要把三件事**同时**落进画面（前两件本轮新做，第三件是修的 bug）：
  1. 草坪饱和度 V2.5（`palette_retune.py`）
  2. 树叶皮下散射透光 sss 0.85（`build_campus_site.py` 的 `make_mat_leaf`）
  3. 「阴天」天空中性化（`make_overcast_config.py` V2：air/dust 回落到 1.0/1.2
     + 新旋钮 `cloud_cover` 铺满云盖）

机位选择（7 个）：
  · 晴 3 个 —— 沿用 r5/r2 的既有 cam_pos/lens（这样还能顺带和历史成图对一眼）
      - 全园东南鸟瞰   1600×900/110  ← 草地占画面主体，饱和度最看得出来
      - 图书馆中轴     1600×900/110
      - 教学区前庭     1280×720/160  ← 主景树 + 教学区补强 + 人眼高度
  · 阴 4 个 —— 直接抄 `configs/overcast.json` 的 jobs（含它 V2 的新天空配方），
      保证与 `renders/气氛_阴天漫射/` 的既有 4 张**同机位同参数**，可直接替换

用法：
    python make_overcast_config.py     # 先确保 overcast.json 是最新的
    python make_final_config.py
    → configs/_final.json
"""

import io
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = os.path.join(os.path.dirname(HERE), 'configs')

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
    '_entrance_all.py',          # 全园其余楼栋的入口门廊（跳过教学区 4 栋）
    'palette_retune.py',         # ★ 重标恒为末项
]

# 晴天 3 个机位：从既有阶段配置里抄光照，只覆盖 cam/分辨率
SUNNY = [
    # (name, 来源配置, 来源机位名, res_x, res_y, samples, lens覆盖)
    ('质感_全园东南鸟瞰_晴', 'r5', 'R5_全园_东南鸟瞰', 1600, 900, 110, None),
    ('质感_图书馆中轴_晴', 'r2', 'R2_图书馆_中轴', 1600, 900, 110, None),
    ('质感_教学区前庭_晴', 'r5', 'R5_教学区_近景', 1280, 720, 160, 32),
]


def load(stage):
    with io.open(os.path.join(CFG, '%s.json' % stage), encoding='utf-8') as fh:
        return json.load(fh)


def main():
    jobs = []

    for name, stage, src, rx, ry, spp, lens in SUNNY:
        d = load(stage)
        j = None
        for x in d['jobs']:
            if x['name'] == src:
                j = dict(x)
                break
        assert j is not None, '找不到 %s / %s' % (stage, src)
        j['name'] = name
        j['res_x'], j['res_y'], j['samples'] = rx, ry, spp
        if lens is not None:
            j['lens'] = lens
            # 教学区前庭：把视线从"教学B"改对准主景树群（见 _diag_hero.py 的落点）
            j['cam_tgt'] = [405.0, 385.0, 9.0]
            j['cam_pos'] = [275.0, 392.0, 4.6]
        jobs.append(j)

    ov = load('overcast')
    for x in ov['jobs']:
        jobs.append(dict(x))

    out = {'blend': '_tmp_final.blend', 'build_extra': BUILD_EXTRA, 'jobs': jobs}
    p = os.path.join(CFG, '_final.json')
    with io.open(p, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    print('已写出 %s（%d 个机位）' % (p, len(jobs)))
    for j in jobs:
        print('  %-26s %dx%d %sspp  lens %s  sun=%.1f air=%.1f'
              % (j['name'], j['res_x'], j['res_y'], j['samples'], j.get('lens'),
                 j.get('sun_strength', -1), j.get('air_density', 1.0)))


if __name__ == '__main__':
    main()
