"""把各阶段的渲染配置统一到**一套光照 + 一套配色**，生成 `blender/configs/rN.json`。

> ★ 为什么需要这个脚本：
>   R0~R4 的成图用的是 `sun 2.9 / sky 0.85 / exposure −0.25 / azim 240`，
>   R5 重标成 `sun 5.8 / sky 0.66 / exposure +0.20 / azim 220`（见 skill 铁律 18）。
>   而全园配色重标 `_RETUNE` 原先内联在 `build_campus_r5.py` 里，渲 R0~R4 时不生效。
>   → 两代成图混排会明显割裂（下 55% 建筑段冷色占比 78~99% vs 17~47%）。
>
>   本脚本是**唯一真源**：光照参数只在这里写一次，所有阶段共用；
>   `palette_retune.py` 一律追加到每个阶段的 `build_extra` 末尾。

用法：
    python make_render_configs.py                     # 优先读 configs/_src/，回退 %TEMP%
    python make_render_configs.py --src-dir <目录> --out-dir <目录>
    python make_render_configs.py --only r2 r3        # 只生成指定阶段
"""
import argparse
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BLENDER_DIR = os.path.dirname(HERE)
DEF_OUT = os.path.join(BLENDER_DIR, 'configs')
# ★ 源配置（各阶段"相机 + 机位 + 分辨率"清单）默认从**项目内** `configs/_src/` 读。
#   早先只在 %TEMP% 里 —— 临时目录一被清理，整套渲染配方就再也生成不出来。
#   已把 r0~r5_final.json 固化进 `configs/_src/`，%TEMP% 仅作回退。
DEF_SRC = os.path.join(DEF_OUT, '_src')
if not os.path.isdir(DEF_SRC):
    DEF_SRC = os.environ.get('TEMP') or os.environ.get('TMP') or '/tmp'

# ------------------------------------------------------------------
# 光照定案（**唯一真源**）—— 与 MEMORY.md §6 一致
# ------------------------------------------------------------------
LIGHT = dict(
    sun_elev=38,          # 0°=东 90°=北 180°=西 270°=南
    sun_azim=220,
    sun_strength=5.8,     # ★ 与材质反照率是一对，改配色必须重标
    sky_strength=0.66,
    sky_visible=0.72,
    ambient_tint=[1.08, 0.92, 0.70],   # 暖色乘法，只暖照明不动看得见的天空
    exposure=0.20,
    haze_density=1.2e-05,
    cloud_strength=4.5,
    cloud_scale=2.2,
    sun_color=[1.0, 0.905, 0.775],
    view_transform='Khronos PBR Neutral',
)

STAGES = ('r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6')
PALETTE = 'palette_retune.py'

# ------------------------------------------------------------------
# 各阶段专属的额外脚本（插在 PALETTE 之前）
# ------------------------------------------------------------------
# r0 是**语言样板（gate）**，其成图必须看得清新塔本身。但 r0 的管线止于
# `build_campus_r0.py`，不含 r1 的拆除块 —— 结果旧语言的牌坊群 / 阙 / 石狮
# 挡在塔前面（`正立面` 那张塔身下半被阙楼整个遮住）。
# ⇒ 给 r0 单独挂一个**限定范围**的清障脚本：只删建筑构件，不碰场地对象
#   （r1 的 `_DROP` 里那 7 个"待重建"场地对象在 R0 不重建，照搬会开洞）。
STAGE_EXTRA = {
    'r0': ['clear_old_language_r0.py'],
}

# ------------------------------------------------------------------
# ★★ 全园级内容脚本（S2 门廊 / S4 分区景观）—— **所有阶段**都挂
# ------------------------------------------------------------------
# ★ 早先只挂在 r5，结果是**成图集内部割裂**：
#   R0~R4 的六区还是"灰铺装 + 占位体块"，R5/R6 却是"草坪树阵 + 门廊"——
#   同一本图集里前后翻两页，像两个不同的校园。
#   而这两个脚本改的是**全园设计语言**，不是"某一阶段的成果"，
#   所以必须每一阶段都生效（与 `palette_retune.py` 同理）。
#
# ★ 顺序是硬约束，不能换：
#     `_teach_detail.py`  →  `_entrance_all.py`  →  `build_campus_r7_landscape.py`
#   ① `_entrance_all.py` 靠射线实测给全园楼栋补入口门廊，会**跳过**教学区 4 栋
#      （那边 `_teach_detail.py` 已做过）⇒ 顺序反了教学区会被做两遍（门廊叠门廊）。
#   ② `build_campus_r7_landscape.py` 的落位**完全由占用栅格决定** ——
#      栅格越完整，草坪越不会压到别人的东西 ⇒ 必须排在最后（除配色重标外）。
#   ③ 全部必须在 `palette_retune.py` **之前**：重标恒为末项，
#      否则新材质（`M_路缘石` / `M_灯柱` / `M_座椅木` / `M_土丘草` …）
#      拿不到配色重标，会跳出既定色域。
#
# ★★ `_entrance_all.py` 能提到"所有阶段"的前提（S5 才补上）：
#   它原先认不出 **28 个占位体块**（`M_体块_*`，名字也是 `BLD_*`），
#   会给白盒子做门廊 ⇒ 已加"整簇材质都是 `M_体块_*` 就跳过"的判据。
#
# ★ `_teach_detail.py` **不能**提到所有阶段：它按名字硬取
#   `BLD_教学_公共教学楼 / 教学B / 教学C / 教学D`，而 r0~r4 里这四个名字
#   指的是**占位体块**（`Z_BLK` 里就这么命名），会把家具摆到白盒子上。
TAIL_EXTRA = ['_entrance_all.py', 'build_campus_r7_landscape.py']
CAMPUS_TAIL = {st: TAIL_EXTRA for st in STAGES}
CAMPUS_TAIL['r5'] = ['_teach_detail.py'] + TAIL_EXTRA
CAMPUS_TAIL['r6'] = ['_teach_detail.py'] + TAIL_EXTRA

# ★ 每个阶段都要挂的 extras（在 STAGE_EXTRA 之前、palette_retune 之前）。
#   `_trees_hero.py` 依赖 `build_campus_site.py` 留下的全局 `trees` / `_sphere`，
#   而 site 脚本是**每一阶段**的第一个脚本，所以在任何阶段挂都成立。
GLOBAL_EXTRA = ['_trees_hero.py']

# ------------------------------------------------------------------
# 导出 GLB（R7）—— 只挂在**含完整园区**的那一阶段
# ------------------------------------------------------------------
# ★ 导出配置和渲染配方放同一个源里：`_src/rN_final.json` 是唯一真源，
#   导出参数若单独维护，迟早和"哪一阶段才是完整场景"走散。
# 实测（R6 工程）：1.66M 三角面 / 956k 顶点，其中 **`SITE_树冠` 一个对象占 835k 面**
#   （619 株树 × 约 15 个低面数球）—— 树冠是导出体积的绝对大头，
#   所以抽稀规则按"面数阈值"写，不按对象名写死。
EXPORT_STAGE = 'r6'
EXPORT = {
    # ★ V3 S5：改名 R6 → R7（R7 = 整合/分区景观/预览/GLB 的那一轮）
    'glb': '山河大学_全园_R7.glb',
    'yup': True,                 # glTF / three.js 标准：+Y 向上
    'apply_modifiers': True,
    'draco': True,
    'draco_level': 6,
    'cameras': False,            # 网页侧自己打光布景
    'lights': False,
    'purge_unused_materials': True,
    'decimate': {'min_tris': 200000, 'ratio': 0.35},
    # 网页服务以 web-demo/ 为根，`../exports/` 在根外会被 http.server 拒掉
    # ⇒ 复制一份进站点目录。源永远是 exports/ 那一份。
    'copy_to': 'web-demo/assets/campus.glb',
}


def build(src_dir, out_dir, only=None, res=None, samples=None):
    os.makedirs(out_dir, exist_ok=True)
    made = []
    for st in STAGES:
        if only and st not in only:
            continue
        src = os.path.join(src_dir, '%s_final.json' % st)
        if not os.path.exists(src):
            print('  skip %-4s （找不到 %s）' % (st, src))
            continue
        d = json.load(open(src, encoding='utf-8'))
        be = list(d.get('build_extra') or [])
        for x in (GLOBAL_EXTRA + list(STAGE_EXTRA.get(st, ()))
                  + list(CAMPUS_TAIL.get(st, ()))):
            if x not in be:
                be.append(x)
        if PALETTE not in be:
            be.append(PALETTE)
        jobs = []
        for j in d['jobs']:
            y = dict(j)
            y.update(LIGHT)
            if res:
                y['res_x'], y['res_y'] = res
            if samples:
                y['samples'] = samples
            jobs.append(y)
        out = dict(blend=d.get('blend'), build_extra=be, jobs=jobs)
        if st == EXPORT_STAGE:
            out['export'] = EXPORT
        dst = os.path.join(out_dir, '%s.json' % st)
        json.dump(out, open(dst, 'w', encoding='utf-8'),
                  ensure_ascii=False, indent=1)
        made.append((st, len(jobs), dst))
        print('  %-4s %2d 张  %s→  %s'
              % (st, len(jobs), '[+GLB] ' if st == EXPORT_STAGE else '', dst))

    # 顺手把光照参数落一份，方便对照
    json.dump(LIGHT, open(os.path.join(out_dir, 'lighting.json'), 'w',
                          encoding='utf-8'), ensure_ascii=False, indent=1)
    total = sum(n for _s, n, _d in made)
    print('[configs] %d 个阶段 / 共 %d 张' % (len(made), total))
    return made


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src-dir', default=DEF_SRC)
    ap.add_argument('--out-dir', default=DEF_OUT)
    ap.add_argument('--only', nargs='*', default=None)
    ap.add_argument('--res', nargs=2, type=int, default=None,
                    help='覆盖分辨率，如 --res 800 450（做候选图）')
    ap.add_argument('--samples', type=int, default=None)
    a = ap.parse_args()
    if not os.path.isdir(a.src_dir):
        sys.exit('源目录不存在: %s' % a.src_dir)
    print('[configs] 源 %s' % a.src_dir)
    print('[configs] 出 %s' % a.out_dir)
    build(a.src_dir, a.out_dir, a.only, a.res, a.samples)


if __name__ == '__main__':
    main()
