# -*- coding: utf-8 -*-
"""_vt_render.py —— 环廊**垂直交通**逐处近景验证渲染（只读，不改模型）
=====================================================================================
用途：楼梯 / 坡道 / 电梯全部是**程序化摆出来的**（沿环廊路径的外法向展开），
      位置对不对、有没有插进楼里、踏步是不是真的落到地面 —— 几何自检查不出来，
      必须逐处出图看。这与 `_ent_render.py` 是同一套思路。

用法（便携版 Blender，无头）：
    set BR_CFG_FILE=<含完整 build_extra 链的 json>
    set BR_RENDER_DIR=<输出目录>
    blender.exe --background --factory-startup --python _vt_render.py

机位从 `STATION_LIST`（`build_campus_r4.py` 留在 globals 里的站点清单）自动摆，
**用站点局部坐标 (u, v, z) 显式给**：u 沿路径、v 沿外法向（向外为正）、z 高度。

★★ 为什么不用"沿外法向退开 dist"那种写法（2026-09-25 改）：
   **南弧**（生活区）那段，环廊外侧 26 m 就是宿舍楼 —— 沿外法向退开会把相机
   放进楼里，出图**全黑**，而且看不出是机位问题还是模型问题。
   楼梯改成**顺桥向**布置后，最好的视角本来也是"沿路径看"而不是"垂直看"，
   所以索性把机位改成显式局部坐标。

覆盖（都可选）：
    BR_VT_CAM="u,v,z"   相机局部坐标（三类交通共用）
    BR_VT_TGT="u,v,z"   目标点局部坐标
    BR_VT_CAMS          **多机位 / 按站点分别指定**（`;` 分隔多组，组内 `cam|tgt`）：
                        · `60,26,14|25,12,8`          所有站点都渲这个机位（文件名带 `_c0/_c1…`）
                        · `S5_教学区=60,26,14|25,12,8` 只对站点名含该子串的站点生效
                        ★ 挑机位每换一次要重建模型（~1.5 min）⇒ 一次建模把候选机位全渲出来再挑
    BR_VT_RES / BR_VT_SPP / BR_VT_ONLY（按站点名子串过滤，逗号分隔）
★ 只验证用，成图落 `BR_RENDER_DIR`（默认 `renders/_vt/`），不进交付目录。
"""
import json
import os

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ASSET = os.path.dirname(os.path.dirname(HERE))
RENDER_PY = os.path.join(HERE, 'render_campus_site.py')
OUT_DIR = os.environ.get('BR_RENDER_DIR') or os.path.join(ASSET, 'renders', '_vt')

RES = int(os.environ.get('BR_VT_RES', '900'))
SPP = int(os.environ.get('BR_VT_SPP', '24'))
_ONLY = [s for s in (os.environ.get('BR_VT_ONLY') or '').split(',') if s]


def run(path, extra=None):
    with open(path, encoding='utf-8') as fh:
        src = fh.read()
    g = {'__name__': '__main__', '__file__': path}
    if extra:
        g.update(extra)
    exec(compile(src, path, 'exec'), g)
    return g


cfg = {}
_cf = os.environ.get('BR_CFG_FILE')
if _cf and os.path.exists(_cf):
    with open(_cf, encoding='utf-8') as fh:
        cfg = json.load(fh)

print('### BUILD ###')
g = run(os.path.join(HERE, 'build_campus_site.py'))
for extra in (cfg.get('build_extra') or []):
    print(f'### BUILD EXTRA : {extra} ###')
    g = run(os.path.join(HERE, extra), g)

ST = g.get('STATION_LIST') or []
if not ST:
    raise SystemExit('[VTR] 没拿到 STATION_LIST —— `build_campus_r4.py` 是否在链里？')


def _xyz(txt, dflt):
    if not txt:
        return dflt
    p = [float(v) for v in txt.split(',')]
    if len(p) != 3:
        raise SystemExit(f'[VTR] 需要三个数（u,v,z），收到 {txt!r}')
    return tuple(p)


# 机位 / 目标（站点局部 u,v,z）——按类型给。
# 楼梯是**顺桥向**布置的（沿 u 占 11.1 m），所以机位必须**从外侧斜看**：
# 沿 u 退开会把 11 m 长的梯段压成端视（只剩一根"带踏步的柱子"，读不出双跑与平台）。
_VIEW = {
    #                cam(u, v, z)          tgt(u, v, z)
    '楼梯': ((13.0, 19.0, 12.0), (0.0, 10.5, 5.0)),
    '坡道': ((30.0, 20.0, 22.0), (20.0, 11.7, 6.0)),
    '电梯': ((11.0, 17.0, 11.0), (0.0, 7.5, 7.0)),
}
# ★★ 南弧（生活区）那两个站点**外侧就是宿舍楼**：研究生公寓 40.3 m（v ≥ 14.5）、
#    宿舍E 36.3 m。默认机位退到 v = 19 会**进楼** ⇒ 出图全黑。
#    这两处把机位收进"桥面外缘与宿舍北墙之间"那条 7.5 m 宽的空当
#    （v ∈ 6~14 无遮挡；垂直交通本身占 v ∈ 6~12），贴着梯段斜看。
_TIGHT = {'S6_生活区东', 'S7_生活区西'}
_VIEW_TIGHT = {
    '楼梯': ((13.0, 13.5, 9.5), (0.0, 10.5, 5.0)),
    '电梯': ((11.0, 13.5, 9.5), (0.0, 7.5, 7.0)),
}
_CM = _xyz(os.environ.get('BR_VT_CAM'), None)
_TG = _xyz(os.environ.get('BR_VT_TGT'), None)

# ★★ `BR_VT_CAMS` —— **一次建模、多机位试拍**（多组用 `;` 分隔，组内 `cam|tgt`）。
#   起因（2026-09-26 S5）：坡道 / 电梯的默认机位是为"验几何"调的 —— 太紧、太斜，
#   拿去做交付图读不出是什么。挑机位要试 3~4 个，但每试一个就重建一次模型
#   （~1.5 min）不可接受 ⇒ 加这一条：建一次，把候选机位全渲出来，再挑。
#   例：BR_VT_CAMS="45,40,28|18,12,7 ; 0,55,30|0,12,6"
#   ★★ 第二版（同日晚）—— 支持**按站点限定**：`S5_教学区=60,26,14|25,12,8`。
#   动机：挑出来的机位**各站点不一样**（坡道在 S5 好、电梯在 S6 好，S3/S4 又是别的），
#   而"全局一组机位"逼着同一个站点的所有类型共用一套坐标 ⇒ 交付图得跑两趟建模。
#   有了 `站点名=` 前缀，**一趟建模就能给每个站点各挑各的机位**。
#   判据：`=` 左边一旦出现，右侧整体当作坐标串（坐标里不含 `=`，不会误判）。
_CAMS, _CAMS_SITE = [], []
for _grp in (os.environ.get('BR_VT_CAMS') or '').split(';'):
    _grp = _grp.strip()
    if not _grp:
        continue
    _sel, _eq, _rest = _grp.partition('=')
    if _eq:                                  # `站点名=cam|tgt`
        _a, _, _b = _rest.partition('|')
        _CAMS_SITE.append((_sel.strip(),
                           _xyz(_a, (0.0, 0.0, 0.0)), _xyz(_b, (0.0, 0.0, 0.0))))
    else:                                    # `cam|tgt`（所有站点通用）
        _a, _, _b = _grp.partition('|')
        _CAMS.append((_xyz(_a, (0.0, 0.0, 0.0)), _xyz(_b, (0.0, 0.0, 0.0))))
if _CAMS_SITE:
    print('[VTR] 站点专属机位 %d 组：%s'
          % (len(_CAMS_SITE), ' / '.join(s for s, _, _ in _CAMS_SITE)))

_BASE = {
    'res_x': RES, 'res_y': int(RES * 0.5625), 'samples': SPP,
    'lens': 42.0,
    'sun_elev': 38.0, 'sun_azim': 220.0, 'sun_strength': 5.8,
    'sky_strength': 0.66, 'ambient_tint': [1.08, 0.92, 0.7],
    'exposure': 0.2, 'haze_density': 1.2e-05,
    'cloud_strength': 4.5, 'cloud_scale': 2.2,
    'sun_color': [1.0, 0.905, 0.775], 'sky_visible': 0.72,
    'view_transform': 'Khronos PBR Neutral',
}

os.makedirs(OUT_DIR, exist_ok=True)
_n = 0
for nm, s, kind, rt in ST:
    if _ONLY and not any(k in nm for k in _ONLY):
        continue
    px, py, tx, ty, nx, ny = rt

    def W(u, v, z):
        return (px + tx * u + nx * v, py + ty * u + ny * v, z)

    _c, _t = _VIEW.get(kind, _VIEW['楼梯'])
    if nm in _TIGHT and kind in _VIEW_TIGHT:
        _c, _t = _VIEW_TIGHT[kind]
    # 候选机位优先级：站点专属 > 全局多机位 > `BR_VT_CAM/TGT` > 按类型的默认机位
    _site = [(_cc, _tt) for _s, _cc, _tt in _CAMS_SITE if _s in nm]
    _cands = _site or _CAMS or [(_CM or _c, _TG or _t)]
    for _ci, (_cc, _tt) in enumerate(_cands):
        cam = W(*_cc)
        tgt = W(*_tt)
        job = dict(_BASE)
        job['cam_pos'] = list(cam)
        job['cam_tgt'] = list(tgt)
        name = f'VT_{nm}_{kind}' + (f'_c{_ci}' if len(_cands) > 1 else '')
        print(f'### VT RENDER : {name} ###  cam {cam[0]:.1f},{cam[1]:.1f},{cam[2]:.1f}')
        run(RENDER_PY, {'RENDER_CFG': dict(job, out=os.path.join(OUT_DIR, name + '.png'))})
        _n += 1

print(f'[VTR] 渲染完成 {_n} 张 → {OUT_DIR}')
