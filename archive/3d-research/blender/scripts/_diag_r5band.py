# -*- coding: utf-8 -*-
"""_diag_r5band.py —— 找出"立面上还在出横带"的构件（挂在 build_extra 末尾）。

用途（2026-09-25 S4-a 第二轮排查）：
    S4-a 把 `solid_body()` 的楼板挑檐删掉之后，实拍 `R5_科技区_近景` 里
    创新中心的立面上**仍然有一圈圈横向暗带**。肉眼分不清是
        · 竖向格构带 `v_lattice` 的之字撑读成了横带，
        · 还是某个**别的脚本**（`_teach_detail` / `_entrance_all` / …）
          又往立面上挂了一层水平构件。
    靠猜会来回改错地方，所以直接**量**。

判据（逐**面**判，不是逐对象）：
    `flush()` 把同材质的几百个盒子并进同一个对象，**对象级包围盒必然是
    "整栋楼"**，什么也筛不出来 —— 必须逐面。一条"立面上的水平带"表现为
        · 竖向尺寸 < 1.20 m（薄）
        · 水平尺寸里**至少一个 > 3.00 m**（长）
        · 底面高于 Z_TOP + 1.0（排除地面铺装）
    而竖柱 / 竖翼 / 通高竖窗的竖向尺寸都等于层高或体量高，会被自然排除。

输出按 `对象名` 归堆（对象名就是 `emit_to` 的 `前缀_材质名`），
所以一眼能看出是**哪个脚本、哪个材质**挂上去的，并给出**检出标高**。
"""
import os

import bpy

print('[BAND] ── 立面横带体检 ──')

_TGT = os.environ.get('BR_BAND_TGT', 'BLD_科技_创新中心')
_ZMAX_H = float(os.environ.get('BR_BAND_H', '1.20'))
_MINL = float(os.environ.get('BR_BAND_L', '3.00'))

_hit = {}
for _ob in bpy.data.objects:
    if _ob.type != 'MESH' or not _ob.name.startswith(_TGT):
        continue
    _mw = _ob.matrix_world
    _vs = _ob.data.vertices
    _n = 0
    _zs = []
    for _p in _ob.data.polygons:
        _q = [_mw @ _vs[_i].co for _i in _p.vertices]
        _zz = [w.z for w in _q]
        _xx = [w.x for w in _q]
        _yy = [w.y for w in _q]
        _h = max(_zz) - min(_zz)
        _lx, _ly = max(_xx) - min(_xx), max(_yy) - min(_yy)
        if _h < _ZMAX_H and max(_lx, _ly) > _MINL and min(_zz) > Z_TOP + 1.0:
            _n += 1
            _zs.append(0.5 * (max(_zz) + min(_zz)))
    if _n:
        _zs.sort()
        # 归堆：把标高按 0.8 m 的桶聚合，看出"每隔几米一道"
        _buckets = []
        for _z in _zs:
            if _buckets and _z - _buckets[-1][-1] < 0.8:
                _buckets[-1].append(_z)
            else:
                _buckets.append([_z])
        _lv = ' / '.join('%.1f' % (sum(b) / len(b)) for b in _buckets[:14])
        _hit[_ob.name] = (_n, len(_buckets), _lv)

if _hit:
    print('[BAND] ⚠ 检出"水平薄带"面片（高 < %.2f m、水平长边 > %.2f m、底面 > %.1f）：'
          % (_ZMAX_H, _MINL, Z_TOP + 1.0))
    for _k in sorted(_hit, key=lambda k: -_hit[k][0]):
        _n, _nb, _lv = _hit[_k]
        print('[BAND]     %-44s %5d 面 / %2d 道 @ Z %s' % (_k, _n, _nb, _lv))
else:
    print('[BAND] ✓ 无水平薄带（判据 高 < %.2f m 且水平长边 > %.2f m）' % (_ZMAX_H, _MINL))
