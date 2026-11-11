# -*- coding: utf-8 -*-
"""
build_campus_stage2.py —— 山河大学 阶段 2：校门牌坊群 + 中轴序列
================================================================
由 run_campus.py 的 build_extra 串联在 build_campus_site.py / build_campus_stage1.py
之后执行，**共享同一个 globals**，可直接复用 W() / box() / cap() / band() /
round_rect() / emit_to() / roof_ring() / pyramid_roof() / disc() / Z_TOP /
C_BLD / C_SITE / C_PAVE / M_ROOF / M_TIMBER 等，不必抄常量。

内容（对应任务书「中轴序列 南→北」）：
  1. 主校门牌坊 —— 四柱三间五楼（明楼 1 + 次楼 2 + 边楼 2）
  2. 东西阙 —— 门区的横向围合
  3. 石狮一对 —— 牌坊南侧
  4. 中轴御道分格 + 灯柱阵列
  5. 明堂广场 —— 中央地雕 + 四角灯柱
  6. 案山土丘方亭 —— 障景兼对景的点睛

形制语言：牌坊取「四柱三间五楼」经典制式（明间柱高、次间柱低，
明楼屋面压住次楼脊，两端挑出边楼）；阙取汉阙的「方柱 + 屋顶 + 宝顶」；
方亭取江南园林的「四柱攒尖」。

红线：匾额只做**空白石板**，不题任何文字。
"""

import math

import bpy

print('### [stage2] 校门牌坊群 + 中轴序列 ###')

GZ = Z_TOP
GX, GY = AX_X, N_GATE          # 主牌坊中心 = (0, 33.6)

# ==================================================================
# 0. 清掉阶段 0 的简化牌坊（本阶段重建为完整形制）
# ==================================================================
_DROP = ('SITE_校门牌坊', 'SITE_牌坊_补')
_drop_n = 0
for _ob in list(bpy.data.objects):
    if any(_ob.name.startswith(_p) for _p in _DROP):
        _me = _ob.data
        bpy.data.objects.remove(_ob, do_unlink=True)
        if _me is not None and _me.users == 0:
            bpy.data.meshes.remove(_me)
        _drop_n += 1
print(f'[stage2] 已移除阶段 0 简化牌坊 {_drop_n} 个')


# ==================================================================
# 1. 主校门牌坊：四柱三间五楼
# ==================================================================
# 竖向控制（自 Z_TOP）—— 明间柱高 12.00、次间柱高 10.20，是这套形制的关键：
# 只有中柱比边柱高，明楼屋面（檐口 13.60）才能压住次楼的正脊（13.20），
# 两坡在柱顶自然交接。柱高一致的话，次楼脊会从明楼檐口里穿出来。
_C_HI, _C_LO = 12.00, 10.20

# ---- 1.1 门区广场：把中轴大道在牌坊处加宽，四根柱子才落得住 ----
emit_to('SITE_门区广场', M_PAVE, C_PAVE,
        [round_rect(-54.0, GY - 15.0, 54.0, GY + 15.0, 6.0, GZ + 0.075)], up=True)

_pt, _ps, _pr, _pg = [], [], [], []

# ---- 1.2 柱：柱础 + 夹杆石 + 分段收分的柱身 ----
# 收分要分够多段（12 段），5 段时每段宽差 0.1 m，近景会在柱身上读出一圈"竹节"台阶。
for _cx, _ht in ((-10.0, _C_HI), (10.0, _C_HI), (-30.0, _C_LO), (30.0, _C_LO)):
    _ps.append(box(_cx, GY, 4.40, 4.40, 0.45, GZ + 0.45))        # 柱础（下）
    _ps.append(box(_cx, GY, 3.60, 3.60, 0.45, GZ + 0.90))        # 柱础（上）
    _ps.append(box(_cx, GY, 3.10, 3.10, 1.30, GZ + 1.35))        # 夹杆石
    _SEG = 12
    for _i in range(_SEG):
        _z0 = GZ + 2.65 + (_ht - 2.65) * _i / _SEG
        _wd = 2.70 - 0.55 * _i / _SEG
        _pt.append(box(_cx, GY, _wd, _wd, (_ht - 2.65) / _SEG, _z0))

# ---- 1.3 明间：下枋 / 匾额 / 上枋 / 两跳斗拱 ----
_pt.append(box(GX, GY, 23.0, 1.90, 1.30, GZ + 9.00))             # 下枋
_ps.append(box(GX, GY, 17.0, 2.30, 0.80, GZ + 10.30))            # 匾额（空白石板）
_pt.append(box(GX, GY, 23.0, 1.70, 0.90, GZ + 11.10))            # 上枋
_pt.append(box(GX, GY, 23.4, 2.60, 0.30, GZ + 11.95))            # 斗拱下的通长枋
# 斗拱芯板：不加这块，近景能透过斗拱块之间的缝直接看到天空，
# 整层斗拱读成一排"竖栏杆"而不是"层层出跳的斗拱"。
_pt.append(box(GX, GY, 23.4, 0.40, 1.60, GZ + 12.25))
for _i in range(13):
    _x = -11.2 + 22.4 * _i / 12.0
    _pt.append(box(_x, GY, 1.15, 2.30, 0.80, GZ + 12.25))        # 下跳
    _pt.append(box(_x, GY, 0.90, 2.90, 0.80, GZ + 13.05))        # 上跳（挑出更多）

# ---- 1.4 次间（中心 ±21.75）：下枋 / 上枋 / 单跳斗拱 ----
for _s in (-1.0, 1.0):
    _pt.append(box(_s * 21.75, GY, 20.5, 1.60, 1.10, GZ + 8.20))
    _pt.append(box(_s * 21.75, GY, 20.5, 1.40, 0.90, GZ + 9.60))
    _pt.append(box(_s * 21.75, GY, 20.9, 2.30, 0.28, GZ + 10.48))
    _pt.append(box(_s * 21.75, GY, 20.9, 0.36, 0.42, GZ + 10.76))    # 芯板
    for _i in range(9):
        _x = _s * 21.75 - 8.0 + 16.0 * _i / 8.0
        _pt.append(box(_x, GY, 1.05, 2.00, 0.42, GZ + 10.76))

# ---- 1.5 屋面：明楼 / 次楼 / 边楼 ----
# 边楼檐口必须**低于**次楼（10.20 < 10.80），才能做出"明楼—次楼—边楼"三级跌落。
# 首版把边楼也放在 10.80，三段檐口连成一条直线，整座牌坊读成"一条长廊"。
_pr.append(roof_ring(GX, GY, 4.50, 0.80, GZ + 16.60, 13.0, 5.40, GZ + 13.60,
                     th=0.42, n=8, lift=0.55))                   # 明楼
for _s in (-1.0, 1.0):
    _pr.append(roof_ring(_s * 20.5, GY, 3.50, 0.70, GZ + 13.20, 10.0, 4.60, GZ + 10.80,
                         th=0.36, n=8, lift=0.45))               # 次楼
    _pr.append(roof_ring(_s * 35.0, GY, 1.40, 0.60, GZ + 11.60, 5.0, 4.00, GZ + 10.20,
                         th=0.32, n=8, lift=0.38))               # 边楼（自边柱挑出）

# ---- 1.6 脊饰 + 鸱吻 ----
_pg.append(box(GX, GY, 9.00, 0.80, 0.65, GZ + 16.60))
for _s in (-1.0, 1.0):
    _pg.append(box(_s * 4.50, GY, 1.60, 1.30, 1.10, GZ + 16.60))     # 明楼鸱吻
    _pg.append(box(_s * 20.5, GY, 7.00, 0.70, 0.55, GZ + 13.20))
    _pg.append(box(_s * 23.50, GY, 1.30, 1.10, 0.90, GZ + 13.20))    # 次楼鸱吻
    _pg.append(box(_s * 35.0, GY, 2.80, 0.60, 0.45, GZ + 11.60))

emit_to('BLD_校门_牌坊_木构', M_TIMBER, C_BLD, _pt)
emit_to('BLD_校门_牌坊_石作', M_STONE, C_BLD, _ps)
emit_to('BLD_校门_牌坊_屋面', M_ROOF, C_BLD, _pr, recalc=False)
emit_to('BLD_校门_牌坊_脊饰', M_RIDGE, C_BLD, _pg)


# ==================================================================
# 2. 东西阙（门区的横向围合）
# ==================================================================
_qs, _qr, _qg = [], [], []
for _s in (-1.0, 1.0):
    _qx = _s * 62.0
    _qs.append(box(_qx, GY, 13.6, 13.6, 1.20, GZ))                   # 基座
    _qs.append(box(_qx, GY, 12.2, 12.2, 0.35, GZ + 1.20))            # 台面压边
    for _i in range(3):
        _qs.append(box(_qx, GY, 9.2 - _i * 0.9, 9.2 - _i * 0.9,
                       11.0 / 3.0, GZ + 1.55 + _i * 11.0 / 3.0))     # 阙身三段收分
    # 阙身的"枋子层"：两圈凸出的横带把方柱分成三段。
    # 没有这两圈，光秃秃的方柱 + 屋顶在近景读成"现代岗亭"。
    _qs.append(box(_qx, GY, 9.90, 9.90, 0.42, GZ + 5.22))
    _qs.append(box(_qx, GY, 8.60, 8.60, 0.42, GZ + 8.89))
    _qr.append(roof_ring(_qx, GY, 1.60, 1.60, GZ + 14.15, 6.80, 6.80, GZ + 12.55,
                         th=0.34, n=8, lift=0.40))                   # 阙顶
    _qg.append(box(_qx, GY, 1.90, 1.90, 0.60, GZ + 14.15))           # 宝顶座
    _qg.append(disc(_qx, GY, 1.00, GZ + 14.75, th=0.55, n=12))       # 宝顶
emit_to('BLD_校门_阙_石作', M_TOWER_WALL, C_BLD, _qs)
emit_to('BLD_校门_阙_屋面', M_ROOF, C_BLD, _qr, recalc=False)
emit_to('BLD_校门_阙_宝顶', M_RIDGE, C_BLD, _qg, smooth=True)


# ==================================================================
# 3. 石狮一对（牌坊南侧，面向来客）
# ==================================================================
_lion = []
for _s in (-1.0, 1.0):
    _lx, _ly = _s * 36.0, GY - 46.0
    _lion.append(box(_lx, _ly, 3.40, 3.40, 0.55, GZ + 0.06))         # 地台
    _lion.append(box(_lx, _ly, 2.60, 2.80, 1.40, GZ + 0.61))         # 须弥座
    _lion.append(box(_lx, _ly + 0.30, 1.50, 2.10, 1.30, GZ + 2.01))  # 身
    _lion.append(box(_lx, _ly - 0.75, 1.35, 1.15, 1.15, GZ + 3.31))  # 头（朝南）
    _lion.append(box(_lx, _ly + 1.55, 0.85, 1.30, 0.95, GZ + 2.40))  # 尾
emit_to('BLD_校门_石狮', M_STONE, C_SITE, _lion)


# ==================================================================
# 4. 中轴御道分格 + 灯柱阵列
# ==================================================================
# 御道：中轴大道中央 15 m 用两条石线框出，两侧各留 13 m。
# 灯柱放在 X = ±16.5 —— 中轴行道树在 X = ±22（冠幅最大 4.2），
# 这个位置刚好留出 1.3 m 间隙，不会互相穿插。
_y0, _y1 = GY + 15.0, N_LIB - 52.0
emit_to('SITE_御道分格', M_STONE_D, C_PAVE,
        [box(_s * 7.6, (_y0 + _y1) * 0.5, 1.00, _y1 - _y0, 0.16, GZ + 0.06)
         for _s in (-1.0, 1.0)])

_ls, _lg = [], []
for _i in range(18):
    _y = GY + 24.0 + _i * 26.0
    if _y > N_LIB - 56.0:
        break
    for _s in (-1.0, 1.0):
        _lx = _s * 16.5
        _ls.append(box(_lx, _y, 1.30, 1.30, 0.50, GZ + 0.06))        # 基座
        _ls.append(box(_lx, _y, 0.50, 0.50, 3.80, GZ + 0.56))        # 柱身
        _lg.append(box(_lx, _y, 1.00, 1.00, 0.70, GZ + 4.36))        # 灯罩
emit_to('SITE_中轴灯柱', M_STONE, C_SITE, _ls)
emit_to('SITE_中轴灯罩', M_WIN, C_SITE, _lg)


# ==================================================================
# 5. 明堂广场：中央地雕 + 四角灯柱
# ==================================================================
# 明堂是"聚气"的地方，中央不该有实体，所以只做**同心圆铺装纹样**（地雕），
# 不做雕塑/水池之类挡视线的构筑物。
_ang = [2.0 * math.pi * _i / 96.0 for _i in range(96)]
_medal = []
for _r, _wd in ((20.0, 1.10), (14.0, 0.85), (8.0, 0.70)):
    _pi = [(AX_X + _r * math.cos(_a), N_PLAZA + _r * math.sin(_a)) for _a in _ang]
    _po = [(AX_X + (_r + _wd) * math.cos(_a), N_PLAZA + (_r + _wd) * math.sin(_a))
           for _a in _ang]
    _medal.append(band(_pi, GZ + 0.075, _po, GZ + 0.075))
_medal.append(cap([(AX_X + 3.2 * math.cos(_a), N_PLAZA + 3.2 * math.sin(_a))
                   for _a in _ang], GZ + 0.075))
emit_to('SITE_明堂地雕', M_STONE_D, C_PAVE, _medal, up=True)

_bs, _br = [], []
for _sx in (-1.0, 1.0):
    for _sy in (-1.0, 1.0):
        _lx, _ly = _sx * 86.0, N_PLAZA + _sy * 50.0
        _bs.append(box(_lx, _ly, 2.80, 2.80, 0.90, GZ + 0.06))       # 基座
        _bs.append(box(_lx, _ly, 1.10, 1.10, 5.20, GZ + 0.96))       # 柱身
        _br.append(roof_ring(_lx, _ly, 0.45, 0.45, GZ + 7.60, 2.60, 2.60,
                             GZ + 6.16, th=0.26, n=8, lift=0.34))    # 灯亭顶
emit_to('SITE_明堂灯柱', M_STONE, C_SITE, _bs)
emit_to('SITE_明堂灯亭', M_ROOF, C_SITE, _br, recalc=False)


# ==================================================================
# 6. 案山土丘：方亭（障景兼对景的点睛）
# ==================================================================
# 土丘高 9 m，亭再叠 8.6 m。校验过视线：从校门 (Y=0) 看，亭顶仰角 4.0°
# 低于图书馆顶 4.6°；从 Y=130 看更是不挡。镇山塔（7.1°）完全不受影响。
_TZ = GZ + MOUND_H
_vs, _vt, _vr, _vg = [], [], [], []
_vs.append(box(AX_X, N_MOUND, 12.5, 12.5, 0.80, _TZ - 0.50))         # 台基（嵌入丘顶）
_vs.append(box(AX_X, N_MOUND, 11.4, 11.4, 0.55, _TZ + 0.30))
for _sx in (-1.0, 1.0):
    for _sy in (-1.0, 1.0):
        _vs.append(box(AX_X + _sx * 4.0, N_MOUND + _sy * 4.0,
                       0.90, 0.90, 0.40, _TZ + 0.85))                # 柱础
        _vt.append(box(AX_X + _sx * 4.0, N_MOUND + _sy * 4.0,
                       0.50, 0.50, 3.80, _TZ + 1.25))                # 柱
for _sy in (-1.0, 1.0):
    _vt.append(box(AX_X, N_MOUND + _sy * 4.0, 8.90, 0.46, 0.66, _TZ + 5.05))
for _sx in (-1.0, 1.0):
    _vt.append(box(AX_X + _sx * 4.0, N_MOUND, 0.46, 8.90, 0.66, _TZ + 5.05))
_vr.append(pyramid_roof(AX_X, N_MOUND, 6.40, 6.40, _TZ + 5.71, 3.10,
                        n=8, mid=0.58, mid_k=0.52, lift=0.58))
_vg.append(disc(AX_X, N_MOUND, 0.58, _TZ + 8.81, th=0.46, n=12))
_vg.append(disc(AX_X, N_MOUND, 0.32, _TZ + 9.27, th=0.36, n=12))
emit_to('BLD_案山_亭_石作', M_STONE, C_BLD, _vs)
emit_to('BLD_案山_亭_木构', M_TIMBER, C_BLD, _vt)
emit_to('BLD_案山_亭_屋面', M_ROOF, C_BLD, _vr, recalc=False)
emit_to('BLD_案山_亭_宝顶', M_RIDGE, C_BLD, _vg, smooth=True)

print(f'[stage2] 牌坊 明楼脊 {GZ + 16.60:.2f} / 次楼脊 {GZ + 13.20:.2f} / 边楼脊 {GZ + 11.60:.2f} m')
print(f'[stage2] 阙顶 {GZ + 15.30:.2f} m / 案山亭顶 {GZ + 9.63 + MOUND_H:.2f} m')
print('[stage2] 校门牌坊群 + 中轴序列 完成')
