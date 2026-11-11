# -*- coding: utf-8 -*-
"""
build_campus_r5.py —— 山河大学 R5：科技 / 实验 / 教学 / 运动 / 生活 五区重建
================================================================
由 run_campus.py 的 build_extra 串联在 R0~R4 之后执行，**共享同一个 globals**。

本阶段回答用户的两条意见：
  ①「楼层高度缺乏层次感，远看几乎全是平房，天际线太平」→ **§2 体量分层**
  ②「色彩渲染效果不佳，请调整整体配色的明暗、对比度与色调」→ **§0 配色重标**

────────────────────────────────────────────────────────────────
§0 配色重标（V2.3）—— 三轮迭代后的结论
────────────────────────────────────────────────────────────────
■ 第 1 轮（V2.1）：屋面压到 0.09、地面压到 0.20，明暗比从 2.2:1 拉到 3.4:1，
  屋顶和地面确实"立"起来了，但整园**更暗更闷**。
■ 第 2 轮（V2.2）：把默认立面从"玻璃幕 + 竖翼"改成"清水混凝土实墙 + 通长条窗"
  （玻璃幕只留给 3 栋特例），实墙提到 0.330、玻璃回到 0.128 —— 建筑确实不黑了。
  **但仍然是一张蓝调灰片。** 实测成图（960×540 全图统计）：

        R5_五区_鸟瞰      冷色 98.8%   暖色  0.2%   mean RGB ( 94,124,144)
        R5_全园_东南鸟瞰   冷色 99.1%   暖色  0.2%   mean RGB ( 97,126,146)
        R5_中轴_天际线     冷色 93.9%   暖色  2.3%   mean RGB (140,164,179)

■ 根因（V2.3 的定论）：**问题不在材质，在环境光。**
  世界环境是一张 Nishita 天空贴图，它同时干了两件事：
    (a) 当"看得见的天空"（相机射线）
    (b) 当"照明的天空"（其余射线，即环境光）
  (b) 是蓝的 → 所有背光面 / 地面 / 屋面被染蓝；而屋面又是鸟瞰里面积最大的面，
  于是整园发蓝。**改材质永远改不过环境光。**
  → 处方：在 (b) 前面插一层暖色乘法（`ambient_tint`，见 render_campus_site.py），
    只暖"照明"，不动"看得见的天空"；同时把 `sky_strength` 0.70 → 0.66、
    `sun_strength` 4.4 → 5.8、`exposure` −0.42 → **+0.20**，
    让画面由太阳主导而不是由天空主导。
  → 材质侧配合三条：
    · **屋面 roughness 0.58 → 0.80、metallic 0.60 → 0.10**。钛锌屋面接近水平，
      掠射角下菲涅耳反射很强，反射的正是蓝天 —— 鸟瞰里近 40% 的画面是屋面，
      等于把蓝天铺了一地。**只压金属度不够**（实测压到 0.15 成图几乎没变），
      必须同时把粗糙度提上去。
    · 墙 0.330 → 0.368（更暖）、玻璃 0.128 → 0.120、楼板 0.196。
    · `sky_visible` 0.72：单独压"看得见的那层天"的亮度，天空才回到饱和的蓝。

────────────────────────────────────────────────────────────────
§2 体量分层 —— 破解"远看全是平房"
────────────────────────────────────────────────────────────────
■ 第 1 轮的病根：**每栋楼是一个宽扁的盒子**（宿舍 139×48 m、教学 96×96 m），
  盒子上扣一片近乎平的壳。22 个盒子 → 22 片同色的平屋顶 →
  从鸟瞰看过去就是"一地深色平板"，这就是"全是平房"的字面来源。
  **单加高度没用**：6 栋宿舍全给 28.8 m，远看还是 6 片一样高的平板。
■ 处方（`layered()`，本版所有常规建筑统一走这一条）：
      ① **裙房**（2 层，外扩 1.4~2.2 m）+ **2~3 个主体量**（高度各不相同）
      ② 每个体量**自带女儿墙压顶 + 铜收边**（体量顶部必须收头，
         否则屋顶读成"被切平的板"）
      ③ 屋面按体量分别给（四坡壳 / 筒壳 / 平屋面 + 桁架），**同栋楼内不重复**
  → 结果：一栋楼自己就有 3 个标高，一排宿舍彼此又错开，
    全园天际线从"一条线"变成"锯齿"。
■ 全园标高（本版实测目标，五级）：
      一级 >80 m ：垂直书院 82.6（R0 已建）
      二级 52~55 ：创新中心 52.2 / 山门弦梁 53.7（R1）
      三级 42~48 ：科研中心 44.6 / 图书馆 44.2（R2）/ 公共教学楼 42.9
      四级 26~38 ：研究生公寓 35.6 / 体育馆 34.0 / 学生中心 29.8 / 教学D 29.5 /
                   宿舍E 31.6 / 演艺中心 30.0 / 实验楼A 25.9 / 教学B 25.1 /
                   校医院 27.3 / 宿舍A·B 24.6 / 教学C 21.4
      五级 10~20 ：宿舍副体量 16.6~21.6 / 实验楼B 18.4 / 体育场 17.8 /
                   食堂 14.9 / 创客工坊 14.9 / 商业街 10.0

────────────────────────────────────────────────────────────────
§3 落位 —— 环廊是基础设施，建筑让路
────────────────────────────────────────────────────────────────
R4 沿环廊清掉了 6 个占位体块，本阶段把五区 22 栋**全部按环廊净空重新落位**：
  科技区（西北）环廊沿**东缘** → 建筑退到 SVG x ≤ 240
  实验区（东北）环廊沿**西缘** → 建筑退到 SVG x ≥ 435
  运动医疗区（西南）环廊沿**东缘** → 建筑退到 SVG x ≤ 240
  教学区（东南）环廊**斜穿西半** → 建筑退到 SVG x ≥ 440
  生活区（南）环廊从北侧 27 m 外掠过 → 全区可用
净空判据：**到环廊中心线 ≥ 壳体半宽 7.30 + 施工余量 5.00 = 12.30 m**
（落位表已用 `%TEMP%/r5_check.py` 逐栋 21×21 网格采样校验，0 栋违规）

坐标换算：世界 = ((svg_x − 340) × 2.4, (516 − svg_y) × 2.4)；地面 Z_TOP = 3.0。
"""

import math

import bpy

print('### [R5] 五区重建 ###')

GZ = Z_TOP

_R5_SLAB = 0.90          # 楼板厚
_R5_TRH = 1.25           # 编织格构带高（与 R2 图书馆同一条语言）

# ==================================================================
# 0. 配色重标（V2.3）—— **已提到共享模块 palette_retune.py**
# ==================================================================
# 原先这段内联在这里，但它改的是**全园**材质（含 M_水 / M_草地 / M_区_*），
# 却只在渲 R5 时生效 → R0~R4 的成图用的是旧配色 + 旧光照，混排时风格割裂。
# 现在统一由 palette_retune.py 提供，**每个阶段的 build_extra 末尾都要挂它**：
#     "build_extra": [..., "build_campus_rN.py", "palette_retune.py"]

# ==================================================================
# 1. 清障：删掉 site 阶段遗留的五区占位体块
# ==================================================================
# **必须在建新对象之前执行** —— R5 自己的对象也叫 BLD_科技_* 之类，
# 顺序反了会把刚建好的东西删掉。
_ZONE_PREFIX = ('BLD_科技_', 'BLD_实验_', 'BLD_教学_', 'BLD_运动_', 'BLD_生活_')
_removed = []
for _ob in list(bpy.data.objects):
    if any(_ob.name.startswith(_p) for _p in _ZONE_PREFIX):
        _removed.append(_ob.name)
        bpy.data.objects.remove(_ob, do_unlink=True)
print(f'[R5] 清障：移除五区占位体块 {len(_removed)} 个（含 _Eave 子块）')


# ==================================================================
# 2. 五区语言构件库
# ==================================================================
def put(B, mat, geos):
    """按材质分桶 —— 一个 emit_to 一个材质（R3 的"整条脊变成胶合木色"就是这个坑）。"""
    _l = B.setdefault(mat, [])
    if isinstance(geos, list):
        _l.extend(geos)
    else:
        _l.append(geos)


def merge(*Bs):
    out = {}
    for B in Bs:
        for m, gs in B.items():
            out.setdefault(m, []).extend(gs)
    return out


def flush(B, prefix, coll=C_BLD):
    """★ 桶的 key 是**材质对象**（`make_mat` 的返回值），不是字符串 ——
    要拼对象名必须走 `mat.name`。写 `mat[2:]` 会报
    "only strings are allowed as keys of ID properties"。"""
    for mat, gs in B.items():
        if gs:
            emit_to(f'{prefix}_{mat.name[2:]}', mat, coll, gs)
    B.clear()


def Z(sx, sy, w, d):
    """SVG 中心 + SVG 全尺寸 → 世界 (cx, cy, hx, hy)。"""
    cx, cy = W(sx, sy)
    return cx, cy, w * 2.4 * 0.5, d * 2.4 * 0.5


def fin_ring(cx, cy, hx, hy, z0, z1, pitch=2.60, fin_d=0.36, fin_t=0.12):
    """墙面**外侧**的竹木竖翼（按外法线定向，否则 ±X 面会变成平贴墙的宽板）。"""
    g = []
    h = z1 - z0
    for _ax, _ay, _bx, _by, _L, _nx, _ny in side_frames(cx, cy, hx, hy, 0.0):
        _m = max(2, int(round(_L / pitch)))
        for _i in range(_m):
            _t = (_i + 0.5) / float(_m)
            _px = _ax + (_bx - _ax) * _t + _nx * (fin_d * 0.5 + 0.02)
            _py = _ay + (_by - _ay) * _t + _ny * (fin_d * 0.5 + 0.02)
            g.append(fin_box(_px, _py, _nx, _ny, fin_d, fin_t, h, z0))
    return g


# ---- 2.1 ★ 默认立面：清水混凝土实墙 + 通长条窗（+ 可选竹木竖翼）----
def solid_body(cx, cy, hx, hy, z0, z1, nf, lattice=False, win=True,
               win_frac=0.44, fin=False, fin_pitch=2.60, fin_d=0.36, fin_t=0.12,
               band=True):
    """**实墙开窗** —— 全园五区的主体做法。

    ★ 为什么不是"玻璃幕 + 竖翼"：那套做法（R2 图书馆）成立的前提是
      **台地本身就是大面积浅色混凝土**，玻璃只是点缀。搬到常规多层体量上，
      浅色混凝土只剩几道薄板边，主色面变成玻璃 —— 玻璃必然是暗的，
      于是整园 22 栋一起发黑。**实墙占约 70% 才是校园该有的明度。**

    `win_frac` —— 条窗高 / 层高。0.44 ≈ 层高 4.3 m 时窗高约 1.9 m。
    ★ 条窗必须 **gap 给负值（凸出墙面）**：混凝土是实体，内退的玻璃会被
      整条埋进墙里 —— 静默失效，图上看不出任何异常。
    """
    B = {}
    put(B, M_CONC, box(cx, cy, 2 * hx, 2 * hy, z1 - z0, z0))
    fh = (z1 - z0) / float(nf)
    for k in range(1, nf):
        zt = z0 + fh * k
        if band:
            put(B, M_SLAB, box(cx, cy, 2 * hx + 0.40, 2 * hy + 0.40,
                               _R5_SLAB, zt - _R5_SLAB))
        if lattice:
            put(B, M_STEEL, truss_band(cx, cy, hx, hy, zt - _R5_SLAB - _R5_TRH,
                                       zt - _R5_SLAB - 0.02,
                                       bar=0.26, diag=0.17, seg=2.40, out=0.16))
    if win:
        for k in range(nf):
            _g, _t = strip_windows(cx, cy, hx, hy, z0 + fh * (k + 0.56),
                                   w=min(2.90, fh * win_frac), gap=-0.24, t=0.36)
            put(B, M_GLASSC, _g)
            put(B, M_COPPER, _t)
    if fin:
        put(B, M_BAMBOO, fin_ring(cx, cy, hx, hy, z0, z1, pitch=fin_pitch,
                                  fin_d=fin_d, fin_t=fin_t))
    return B


# ---- 2.2 特例：整层玻璃幕 + 竖翼（只给 3 栋用）----
def glass_body(cx, cy, hx, hy, z0, z1, nf, pitch=1.60, fin_d=0.42, fin_t=0.13):
    B = {}
    fh = (z1 - z0) / float(nf)
    for k in range(1, nf + 1):
        zt = z0 + fh * k
        put(B, M_SLAB, box(cx, cy, 2 * hx + 0.30, 2 * hy + 0.30, _R5_SLAB, zt - _R5_SLAB))
        if k < nf:
            put(B, M_STEEL, truss_band(cx, cy, hx, hy, zt - _R5_SLAB - _R5_TRH,
                                       zt - _R5_SLAB - 0.02))
    for k in range(nf):
        za = z0 + fh * k
        zb = z0 + fh * (k + 1) - _R5_SLAB - (_R5_TRH if k + 1 < nf else 0.0)
        if zb - za < 1.70:
            zb = z0 + fh * (k + 1) - _R5_SLAB
        _g, _f, _c = fin_facade(cx, cy, hx, hy, za, zb,
                                pitch=pitch, fin_d=fin_d, fin_t=fin_t)
        put(B, M_GLASSC, _g)
        put(B, M_BAMBOO, _f)
        put(B, M_COPPER, _c)
    return B


# ---- 2.3 屋面 ----
def hip_shell(cx, cy, hx, hy, z0, rise, s_min=0.18, rings=9, th=0.46,
              tilt_y=0.0, n=8, ridge=26, cap=True):
    """四坡变曲率薄壳 + 铜收边 + 木肋网 + 径向垄（R3 定案：集中式 → 四坡壳）。

    ★ `shell_solid` 生成的是**环**：最内环缩到 `s_min` 之后中间是个**洞**。
      R2 图书馆用光庭玻璃把它盖住了；常规建筑没有光庭 ——
      不封顶的话，鸟瞰会**直接看进屋里**。
      → 这里强制补一块封顶板 + 一圈铜压环。
    """
    prof = prof2d(round_rect(cx - hx, cy - hy, cx + hx, cy + hy,
                             min(hx, hy) * 0.20, 0.0, n=n))

    def zf(s, x, y):
        _t = max(-1.0, min(1.0, (y - cy) / max(1e-6, hy)))
        return z0 + tilt_y * _t + rise * (1.0 - s ** 1.9)

    rg = [(1.0 - (1.0 - s_min) * (i / float(rings - 1)), 0.0, 0.0)
          for i in range(rings)]
    B = {M_ZINC: [shell_solid(prof, rg, th, zf)],
         M_COPPER: rim_edge(prof, zf, 1.0, th)}
    put(B, M_WOOD, shell_ribs(prof, rg, zf, t=0.20, drop=0.24, n_ring=12, n_rad=12))
    put(B, M_COPPER, shell_ridges(prof, zf, th, s_min=s_min, n=ridge, r=0.15, seg=7))
    if cap:
        _zt = zf(s_min, cx, cy) + th
        put(B, M_ZINC, box(cx, cy, 2 * hx * s_min * 0.96, 2 * hy * s_min * 0.96,
                           0.34, _zt - 0.34))
        put(B, M_COPPER, rim_edge(prof, zf, s_min, 0.34, r=0.20))
    return B


def barrel_roof(cx, cy, a, b, z0, H, p=1.8, th=0.50, along='X', rim=True, ridge=True,
                ribs=True, n1=18, n2=16):
    """筒壳屋面（R3 定案：线性 → 筒壳）。檐口必有铜收边，壳必有垄。"""
    B = {M_ZINC: [barrel_solid(cx, cy, a, b, z0, H, p=p, th=th,
                               along=along, n1=n1, n2=n2)]}
    if rim:
        put(B, M_COPPER, barrel_rim(cx, cy, a, b, z0, H, p=p, th=th,
                                    r=0.17, along=along, n=18))
    if ridge:
        put(B, M_COPPER, barrel_ridge(cx, cy, a, b, z0, H, p=p, th=th,
                                      r=0.26, along=along))
    if ribs:
        put(B, M_WOOD, barrel_ribs(cx, cy, a, b, z0, H, p=p, drop=0.26, t=0.20,
                                   n1=max(5, int(a / 6.0)), n2=13, along=along,
                                   inset=0.9, side='in', lift=th))
        put(B, M_ZINC, barrel_ribs(cx, cy, a, b, z0, H, p=p, t=0.18,
                                   n1=max(4, int(a / 9.0)), n2=11, along=along,
                                   inset=1.2, side='out', lift=th, cross=False))
    return B


def eave_ring(cx, cy, hx, hy, z, depth, pitch=2.80):
    """檐椽一圈 —— R3 的核心修正：壳**由椽挑出**，而不是"扣"在墙上。"""
    return eave_rafters(cx, cy, hx, hy, z, pitch=pitch, depth=depth,
                        t=0.16, h=0.30, long_only=False)


def crown(cx, cy, hx, hy, z, h=0.62, out=0.55):
    """★ 体量顶部收头：女儿墙 + 铜压顶。

    没有这一步，体量顶端就是"被切平的板"，屋顶和墙面糊成一片，
    整栋楼在远景里退化成一个色块 —— 这正是"平房感"的直接来源。
    """
    B = {}
    put(B, M_CONC, box(cx, cy, 2 * hx + 2 * out, 2 * hy + 2 * out, h, z - h))
    put(B, M_COPPER, rim_band(cx, cy, hx + out, hy + out, z, h=0.24, out=0.46))
    return B


# ---- 2.4 ★ 体量分层：裙房 + 2~3 个不同高度的主体量 ----
def layered(cx, cy, hx, hy, z0, parts, ph=7.5, pout=1.6, style='wall',
            lattice=False, fin=True, fin_pitch=2.40, podium='solid',
            nf_step=4.20):
    """**破解"全是平房"的通用做法。**

    `parts`：每项 `(dx, dy, sx, sy, h, roof, rise[, lantern])`
      dx/dy    体量中心相对整块中心的偏移（m）
      sx/sy    体量的全宽 / 全深（m）
      h        从裙房顶算起的主体高度（m）
      roof     'hip' | 'barrel_x' | 'barrel_y' | 'flat'
      rise     屋面起拱 / 筒壳矢高（m）
      lantern  可选 `(gw, gd, gh)`：主体之上再叠一段玻璃灯笼 + 四坡壳
               （只给分区地标用，常规楼不叠）

    ★ 为什么必须"裙房 + 多个体量"：
      单一个盒子无论多高，远看都是一片平板；拆成 2~3 个**不同高度**的体量，
      一栋楼自己就产生 3 个标高 —— 天际线才有锯齿。
    """
    B = {}
    _px, _py = hx + pout, hy + pout
    if podium == 'stilt':
        B = merge(B, stilt_base(cx, cy, _px, _py, z0, z0 + ph, inset=1.80, pitch=8.0))
    else:
        B = merge(B, solid_body(cx, cy, _px, _py, z0, z0 + ph, 2, win_frac=0.50,
                                fin=fin, fin_pitch=3.00, fin_d=0.34, fin_t=0.12))
    put(B, M_COPPER, rim_band(cx, cy, _px, _py, z0 + ph, h=0.26, out=0.52))

    for _p in parts:
        _dx, _dy, _sx, _sy, _h, _rk, _rise = _p[:7]
        _lan = _p[7] if len(_p) > 7 else None
        _tx, _ty = cx + _dx, cy + _dy
        _thx, _thy = _sx * 0.5, _sy * 0.5
        _zb = z0 + ph
        _z1 = _zb + _h
        _n = max(2, int(round(_h / nf_step)))
        if style == 'glass':
            B = merge(B, glass_body(_tx, _ty, _thx, _thy, _zb, _z1, _n))
        else:
            B = merge(B, solid_body(_tx, _ty, _thx, _thy, _zb, _z1, _n,
                                    lattice=lattice, win_frac=0.46, fin=fin,
                                    fin_pitch=fin_pitch, fin_d=0.36, fin_t=0.12))
        _ztop = _z1
        if _lan:
            _gw, _gd, _gh = _lan
            _ztop = _z1 + _gh
            B = merge(B, glass_body(_tx, _ty, _gw * 0.5, _gd * 0.5, _z1, _ztop, 2))
        B = merge(B, crown(_tx, _ty, _thx, _thy, _ztop))
        _hd = max(1.7, 2.0 + _sx * 0.010)
        # ★ 起拱统一 ×1.35：原值（rise/跨度 ≈ 6~9%）在 1600 px 下**读成平屋顶** ——
        #   远看就是一排深色平板，这正是"全是平房"的第二层来源。
        #   拉到 9~12% 之后壳才在轮廓线上有起伏。筒壳（barrel）同样处理。
        _rise = _rise * 1.35
        if _rk == 'hip':
            B = merge(B, hip_shell(_tx, _ty, _thx + _hd, _thy + _hd, _ztop, _rise,
                                   s_min=0.24, ridge=max(10, int(_sx / 4.5)),
                                   tilt_y=0.9 * (1.0 if _dx >= 0 else -1.0)))
            put(B, M_COPPER, eave_ring(_tx, _ty, _thx + _hd, _thy + _hd,
                                       _ztop - 0.1, 1.9))
        elif _rk in ('barrel_x', 'barrel_y'):
            _ax = 'X' if _rk == 'barrel_x' else 'Y'
            B = merge(B, barrel_roof(_tx, _ty, _thx, _thy + 1.8, _ztop, _rise,
                                     along=_ax, n1=14, n2=16))
            put(B, M_COPPER, eave_ring(_tx, _ty, _thx, _thy + 1.8,
                                       _ztop - 0.1, 2.0))
        elif _rk == 'flat':
            put(B, M_STEEL, truss_band(_tx, _ty, _thx, _thy, _ztop, _ztop + 1.9,
                                       bar=0.22, diag=0.15, seg=2.30, out=0.14))
            put(B, M_CONC, box(_tx, _ty, _sx + 1.2, _sy + 1.2, 0.34, _ztop + 1.9))
    return B


# ---- 2.5 底层架空（生活区语言："宿舍底层全部架空做共享客厅"）----
def stilt_base(cx, cy, hx, hy, z0, z1, inset=1.60, pitch=8.0):
    B = {}
    ix, iy = hx - inset, hy - inset
    put(B, M_CONC, box(cx, cy, 2 * hx, 2 * hy, 0.45, z1 - 0.45))
    _col = []
    for _ax, _ay, _bx, _by, _L, _nx, _ny in side_frames(cx, cy, ix, iy, 0.0):
        _m = max(2, int(round(_L / pitch)))
        for _i in range(_m + 1):
            _s = _i / float(_m)
            _col.append(box(_ax + (_bx - _ax) * _s, _ay + (_by - _ay) * _s,
                            0.46, 0.46, z1 - 0.45 - z0, z0))
    put(B, M_CONC, _col)
    _g, _f, _c = fin_facade(cx, cy, ix, iy, z0, z1 - 0.45,
                            gap=0.55, fin_d=0.34, fin_t=0.12, pitch=2.20)
    put(B, M_GLASSC, _g)
    put(B, M_BAMBOO, _f)
    put(B, M_COPPER, _c)
    return B


# ---- 2.6 外露服务竖井（实验区"剖面外露"的可读化）----
def service_shaft(cx, cy, hx, hy, z0, z1, w=4.0, seg=2.6):
    """挂在 **+X 立面外侧** 的**外露钢梯井**：四角立柱 + 每层平台 + 剪刀撑。

    "剖面外露"如果只体现在"混凝土是实体"，图上和普通厂房没区别；
    把楼梯/管井挑到立面外面，剖面关系才读得出来。
    ★ 只做一侧：两侧都挂会在鸟瞰里读成"两片耳朵"，还挡住 ±X 面的条窗。
    """
    B = {}
    _x = cx + hx + w * 0.5
    _ya, _yb = cy - hy * 0.40, cy + hy * 0.40
    _p = []
    for _yy in (_ya, _yb):
        for _sx in (-1.0, 1.0):
            _p.append(box(_x + _sx * w * 0.5, _yy, 0.42, 0.42, z1 - z0, z0))
    put(B, M_STEEL, _p)
    _n = max(2, int((z1 - z0) / seg))
    _d = []
    for _i in range(_n):
        _za = z0 + (z1 - z0) * _i / float(_n)
        _zb = z0 + (z1 - z0) * (_i + 1) / float(_n)
        _d.append(bar3d((_x + w * 0.5, _ya, _za), (_x + w * 0.5, _ya, _zb), 0.18))
        _d.append(bar3d((_x + w * 0.5, _yb, _za), (_x + w * 0.5, _yb, _zb), 0.18))
        _d.append(bar3d((_x + w * 0.5, _ya, _za), (_x + w * 0.5, _yb, _zb), 0.16))
        _d.append(bar3d((_x + w * 0.5, _yb, _za), (_x + w * 0.5, _ya, _zb), 0.16))
    put(B, M_STEEL, _d)
    for _i in range(1, _n + 1):
        _z = z0 + (z1 - z0) * _i / float(_n)
        put(B, M_STEEL, box(_x, cy, w + 0.5, (_yb - _ya) + w, 0.14, _z))
    return B


# ---- 2.7 接驳桥：环廊 ↔ 建筑（V2："与智慧环廊直接接驳"）----
def link_bridge(s_svg, tgt_svg, z_ring=9.00, z_end=6.60, width=5.0, n=10):
    """从环廊外侧边缘斜下到目标点的一段桥（楼板 + 双侧栏板 + 细柱）。"""
    _sx, _sy = W(s_svg[0], s_svg[1])
    _tx, _ty = W(tgt_svg[0], tgt_svg[1])
    _dx, _dy = _tx - _sx, _ty - _sy
    _L = math.hypot(_dx, _dy)
    _ux, _uy = _dx / _L, _dy / _L
    _px, _py = -_uy, _ux
    B = {}
    _dk, _rl, _pl = [], [], []
    for _i in range(n):
        _t0, _t1 = _i / float(n), (_i + 1) / float(n)
        _x0, _y0 = _sx + _dx * _t0, _sy + _dy * _t0
        _x1, _y1 = _sx + _dx * _t1, _sy + _dy * _t1
        _z0 = z_ring + (z_end - z_ring) * _t0
        _z1 = z_ring + (z_end - z_ring) * _t1
        _seg = prof2d(round_rect(-width * 0.5, -0.30, width * 0.5, 0.30,
                                 0.20, 0.0, n=2))
        _vs = []
        for _lvl in (0.0, 0.55):
            for _q in _seg:
                _vs.append((_x0 + _px * _q[0] + _ux * _q[1],
                            _y0 + _py * _q[0] + _uy * _q[1], _z0 + _lvl))
        for _q in _seg:
            _vs.append((_x1 + _px * _q[0] + _ux * _q[1],
                        _y1 + _py * _q[0] + _uy * _q[1], _z1 + 0.55))
        _k = len(_seg)
        _fs = [[_i, (_i + 1) % _k, _k + (_i + 1) % _k, _k + _i] for _i in range(_k)]
        _fs += [[2 * _k + _i, 2 * _k + (_i + 1) % _k, _k + (_i + 1) % _k, _k + _i]
                for _i in range(_k)]
        # ★ 桥面板底必须补一张面：只做"侧面 + 顶面"，从地面往上看是透空的
        _fs += [[_i, 2 * _k + _i, 2 * _k + (_i + 1) % _k, (_i + 1) % _k]
                for _i in range(_k)]
        _dk.append((_vs, _fs))
        for _sd in (-1.0, 1.0):
            _rl.append(bar3d((_x0 + _px * _sd * width * 0.5,
                              _y0 + _py * _sd * width * 0.5, _z0 + 0.55),
                             (_x1 + _px * _sd * width * 0.5,
                              _y1 + _py * _sd * width * 0.5, _z1 + 0.55), 0.14))
            _rl.append(bar3d((_x0 + _px * _sd * width * 0.5,
                              _y0 + _py * _sd * width * 0.5, _z0 + 1.12),
                             (_x1 + _px * _sd * width * 0.5,
                              _y1 + _py * _sd * width * 0.5, _z1 + 1.12), 0.12))
        if _i % 2 == 0 and _z0 > GZ + 2.0:
            _pl.append(box(_x0, _y0, 0.60, 0.60, _z0 - GZ, GZ))
    put(B, M_CONC, _dk)
    put(B, M_BAMBOO, _rl)
    put(B, M_CONC, _pl)
    return B


# ==================================================================
# 3. 科技区（西北）—— 曲面语言 · 软件核心
# ==================================================================
# 环廊沿本区**东缘**经过（SVG x 242.8~287.5），建筑一律退到 x ≤ 240。
print('[R5] ── 科技区（曲面）──')

# 3.1 创新中心：**分区地标** —— 裙房 9.0 + 主塔 30 + 玻璃灯笼 8 + 壳 5.2 = 52.2 m
_cx, _cy, _hx, _hy = Z(176, 276, 40, 48)
B = layered(_cx, _cy, _hx, _hy, GZ, [
    (-12, 0, 54, 66, 30.0, 'hip', 5.0, (44, 54, 8.0)),   # 主塔 + 玻璃灯笼
    (+26, +20, 40, 42, 16.0, 'hip', 3.4),                # 副塔
], ph=9.0, pout=2.2, fin_pitch=2.80)
flush(B, 'BLD_科技_创新中心')
print('[R5]   创新中心（分区地标）裙房 9.0 + 主塔 30.0 + 玻璃灯笼 8.0 + 壳 5.2 '
      '→ **52.2 m**；副塔 16.0 + 壳 3.4 → 28.4 m')

# 3.2 学生中心：29.8 m（★ 特例：整层玻璃幕，与创新中心的实墙形成对比）
_cx, _cy, _hx, _hy = Z(220, 276, 40, 48)
B = layered(_cx, _cy, _hx, _hy, GZ, [
    (-14, 0, 56, 70, 17.0, 'hip', 4.8),
    (+28, +22, 38, 42, 10.0, 'hip', 3.2),
], ph=8.0, pout=1.8, style='glass')
flush(B, 'BLD_科技_学生中心')
print('[R5]   学生中心（特例·玻璃幕）裙房 8.0 + 主厅 17.0 + 壳 4.8 → 29.8 m；'
      '副厅 10.0 + 壳 3.2 → 21.2 m')

# 3.3 演艺中心：30.0 m（观众厅筒壳沿 X，前厅低一档）
_cx, _cy, _hx, _hy = Z(176, 320, 40, 40)
B = layered(_cx, _cy, _hx, _hy, GZ, [
    (+10, 0, 56, 82, 16.0, 'barrel_x', 7.0),
    (-34, 0, 26, 72, 11.0, 'hip', 3.2),
], ph=7.0, pout=2.0, fin_pitch=3.20)
flush(B, 'BLD_科技_演艺中心')
print('[R5]   演艺中心 裙房 7.0 + 观众厅 16.0 + 筒壳 7.0 → 30.0 m；'
      '前厅 11.0 + 壳 3.2 → 21.2 m')

# 3.4 创客工坊：14.9 m 低层车间（五级，压住天际线底）
_cx, _cy, _hx, _hy = Z(218, 320, 36, 36)
B = layered(_cx, _cy, _hx, _hy, GZ, [
    (-14, 0, 48, 78, 8.0, 'flat', 0.0),
    (+26, 0, 28, 72, 3.5, 'hip', 1.8),
], ph=5.0, pout=1.4, fin=False)
flush(B, 'BLD_科技_创客工坊')
print('[R5]   创客工坊 裙房 5.0 + 车间 8.0 + 屋面桁架 1.9 → 14.9 m；'
      '低跨 3.5 + 壳 1.8 → 10.3 m')

_cx, _cy, _hx, _hy = Z(196, 300, 60, 70)
emit_to('R5_科技区_院落', M_PAVE, C_BLD,
        [box(_cx, _cy, 2 * _hx, 2 * _hy, 0.10, GZ + 0.06)], up=True)
_sh = []
for _k in range(9):
    _t = -1.0 + 2.0 * _k / 8.0
    _sh.append(shrub(_cx + _t * 24.0, _cy + 34.0, GZ + 0.16, h=2.4, r=1.30))
    _sh.append(shrub(_cx + _t * 24.0, _cy - 34.0, GZ + 0.16, h=2.4, r=1.30))
emit_to('R5_科技区_灌木', M_LEAF, C_BLD, _sh, smooth=True)


# ==================================================================
# 4. 实验区（东北）—— 格构 + 混凝土 · 剖面外露
# ==================================================================
# 环廊沿本区**西缘**经过（SVG x 392.5~437.2），建筑退到 x ≥ 435。
print('[R5] ── 实验区（格构 + 剖面外露）──')

# 4.1 科研中心：**分区地标** —— 大裙房 14.0 + 塔楼 26.0 + 壳 4.6 = 44.6 m
_cx, _cy, _hx, _hy = Z(478, 268, 86, 38)
B = layered(_cx, _cy, _hx, _hy, GZ, [
    (-50, 0, 64, 62, 26.0, 'hip', 4.6),
    (+52, 0, 58, 54, 12.0, 'flat', 0.0),
], ph=14.0, pout=2.0, lattice=True, fin=False)
# ★ service_shaft 返回的是**按材质分桶的 dict**，不是几何列表 ——
#   必须走 merge，走 put 会把整个 dict 当成一个几何塞进列表，
#   到 emit_to 里 unpack 时报 "not enough values to unpack"。
B = merge(B, service_shaft(_cx - 50, _cy, 32.0, 31.0, GZ + 14.0, GZ + 40.0, w=4.2))
flush(B, 'BLD_实验_科研中心')
print('[R5]   科研中心（分区地标）大裙房 14.0 + 塔楼 26.0 + 壳 4.6 + 外露梯井 '
      '→ **44.6 m**；东翼 12.0 + 桁架 1.9 → 27.9 m')

# 4.2 实验楼 A：25.9 m
_cx, _cy, _hx, _hy = Z(466, 318, 42, 42)
B = layered(_cx, _cy, _hx, _hy, GZ, [
    (-12, -8, 56, 56, 15.0, 'hip', 3.4),
    (+24, +22, 42, 44, 8.0, 'flat', 0.0),
], ph=7.5, pout=1.8, lattice=True, fin=False)
B = merge(B, service_shaft(_cx - 12, _cy - 8, 28.0, 28.0, GZ + 7.5, GZ + 22.5, w=3.8))
flush(B, 'BLD_实验_实验楼A')
print('[R5]   实验楼A 裙房 7.5 + 主楼 15.0 + 壳 3.4 → 25.9 m（+ 外露梯井）；'
      '附楼 8.0 + 桁架 1.9 → 17.4 m')

# 4.3 实验楼 B：18.4 m（低一档，拉出区内高差）
_cx, _cy, _hx, _hy = Z(504, 318, 34, 42)
B = layered(_cx, _cy, _hx, _hy, GZ, [
    (0, -14, 72, 50, 9.0, 'flat', 0.0),
    (0, +26, 56, 40, 5.0, 'hip', 2.6),
], ph=7.5, pout=1.6, lattice=True, fin=False)
flush(B, 'BLD_实验_实验楼B')
print('[R5]   实验楼B 裙房 7.5 + 长跨 9.0 + 屋面桁架 1.9 → 18.4 m；'
      '南翼 5.0 + 壳 2.6 → 15.1 m')

_cx, _cy, _hx, _hy = Z(470, 296, 68, 54)
emit_to('R5_实验区_院落', M_PAVE, C_BLD,
        [box(_cx, _cy, 2 * _hx, 2 * _hy, 0.10, GZ + 0.06)], up=True)


# ==================================================================
# 5. 运动医疗区（西南）—— 曲面 + 可上人绿坡
# ==================================================================
# 环廊沿本区**东缘**经过（SVG x 244.5~263.7），建筑退到 x ≤ 240。
print('[R5] ── 运动医疗区（曲面 + 绿坡看台）──')

# 5.1 体育馆：34.0 m —— 分区地标（曲面大跨）
#     西侧再挂一个两层附属体量，避免大跨体量孤零零一个盒子。
_cx, _cy, _hx, _hy = Z(216, 374, 36, 30)
B = {}
put(B, M_CONC, box(_cx, _cy, 2 * _hx, 2 * _hy, 22.0, GZ))
put(B, M_GLASSC, box(_cx, _cy, 2 * _hx + 0.34, 2 * _hy + 0.34, 3.40, GZ + 12.60))
put(B, M_COPPER, rim_band(_cx, _cy, _hx + 0.17, _hy + 0.17, GZ + 12.60,
                          h=0.22, out=0.42))
put(B, M_COPPER, rim_band(_cx, _cy, _hx + 0.17, _hy + 0.17, GZ + 16.00,
                          h=0.22, out=0.42))
put(B, M_CONC, box(_cx, _cy, 2 * _hx + 0.40, 2 * _hy + 0.40, 0.60, GZ + 22.0))
put(B, M_COPPER, rim_band(_cx, _cy, _hx, _hy, GZ + 22.0, h=0.30, out=1.20))
B = merge(B, barrel_roof(_cx, _cy, _hx, _hy + 2.6, GZ + 22.0, 13.5,
                         along='X', n1=14, n2=20))
put(B, M_COPPER, eave_ring(_cx, _cy, _hx, _hy + 2.6, GZ + 21.9, 2.6))
# 西侧附属：两层训练房（低一档，打破"一个盒子"）
_wx = _cx - _hx - 15.0
B = merge(B, solid_body(_wx, _cy + 6.0, 13.0, 24.0, GZ, GZ + 9.5, 2,
                        win_frac=0.50, fin=True, fin_pitch=2.60))
put(B, M_COPPER, rim_band(_wx, _cy + 6.0, 13.0, 24.0, GZ + 9.5, h=0.24, out=0.80))
flush(B, 'BLD_运动_体育馆')
print('[R5]   体育馆（分区地标）{:.0f}×{:.0f}×22.0（含 12.6~16.0 高侧窗带）'
      '+ 筒壳 13.5 → **总高 36.0 m**；西侧训练房 9.5 m'
      .format(2 * _hx, 2 * _hy))

# 5.2 校医院：27.3 m（裙房 7.5 + 主楼 11 + 塔 17）
_cx, _cy, _hx, _hy = Z(176, 374, 36, 30)
B = layered(_cx, _cy, _hx, _hy, GZ, [
    (-8, -4, 48, 52, 11.0, 'hip', 3.2),
    (+22, +12, 30, 32, 17.0, 'hip', 2.8),
], ph=7.5, pout=1.6, fin=True, fin_pitch=2.40)
flush(B, 'BLD_运动_校医院')
print('[R5]   校医院 裙房 7.5 + 门诊楼 11.0 + 壳 3.2 → 21.7 m；'
      '住院塔 17.0 + 壳 2.8 → 27.3 m')

# 5.3 体育场：**草坪竞技场**（看台自场地向外升起，外圈绿坡缓降回地面）
#     v5 修掉三处硬伤（都是"方向/标高写反"，不报错，只能靠算 + 看图）：
#     ① **旧版看台是"向内升起"**：`(1.00, 0.86, 1.20, 5.20)` = 外缘 Z1.20 → 内缘
#        Z5.20，三层一路升到 Z13.20 —— 三层台地整个压在跑道上（跑道外缘
#        `_hx-8` 落在 scale 0.921，正好在 tier1 的 1.00~0.86 区间里），
#        场地 box 又比跑道内缘大 11 m，**跑道被埋得只剩一条缝**。
#     ② **主席台棚放在 `_cy + _hy*0.30`**（场地正上方）→ 125×53 m 的筒壳浮在
#        球场中央，远景读成"球场上盖了块板"。改到**北侧脊线**上，只罩顶排看台。
#     ③ **场地沉到 GZ 以下**（第一版改法）→ 被 `SITE_地形`（Z 3.0 整片平面）
#        静默盖住，整个球场只剩一块灰平地。**场地必须齐地面**（坑 40）。
#     最终形态：场地齐地面 + 砖红跑道 + 三层看台**向外**升到脊线 + 脊线外
#     绿坡缓降回地面（= V2 的"可上人绿坡"，也和滨水岸线接得上）。
_cx, _cy, _hx, _hy = Z(198, 422, 84, 48)
_ov = prof2d(round_rect(_cx - _hx, _cy - _hy, _cx + _hx, _cy + _hy,
                        _hy * 0.92, 0.0, n=8))


def _sc(s):
    """按形心缩放同一组轮廓点（跑道 / 看台 / 绿坡共用，保证顶点一一对应）。"""
    return [(_cx + (p[0] - _cx) * s, _cy + (p[1] - _cy) * s) for p in _ov]


_RI, _RD, _CR, _GR = 0.70, 0.82, 1.00, 1.16   # 场地 / 跑道外缘 / 脊线 / 外坡落地
# ★ 场地**不能沉到 GZ 以下**：`SITE_地形` 是 Z 3.0 的整片平面，任何低于 GZ 的
#   东西都会被它静默盖住（坑 40 又踩一次 —— 沉到 Z1.80 后整个球场只剩一块
#   灰色平地）。所以场地齐地面，靠**外圈绿坡向上堆**做出看台高差。
_ZF, _ZT = GZ + 0.06, GZ + 0.10               # 场地 / 跑道标高（齐地面）
_ZC = GZ + 4.60                               # 脊线标高（看台顶）
# 场地（跑道内缘以内）
emit_to('R5_运动_体育场场地', M_GRASS, C_BLD,
        [box(_cx, _cy, 2 * _hx * _RI, 2 * _hy * _RI, 0.16, _ZF)], up=True)
# 跑道：**砖红塑胶**（新建材质，不复用任何铺装）—— 三版试错记录：
#   v1 `M_Z_SPT`（运动区铺装 0.206/0.230/0.214）→ 深绿灰，与草地同色系，
#      读成场地里一圈"沟"；
#   v2 `M_PAVE_W`（中轴铺装 0.362/0.318/0.260）→ 浅米色，与草地对比较弱，
#      鸟瞰下像一圈"水泥环"；
#   v3 ★ 新建 `M_塑胶跑道` (0.255,0.112,0.082) —— R/G = 2.28 的真砖红。
# **冷绿草坪 + 砖红跑道**是运动场唯一正确的色彩对，同时给西南角补一个暖锚点。
M_TRACK = make_mat('M_塑胶跑道', (0.255, 0.112, 0.082), rough=0.84,
                   noise_scale=0.04)
emit_to('R5_运动_跑道', M_TRACK, C_BLD,
        [skirt_ring(_sc(_RD), _ZT, _sc(_RI), _ZT, th=0.20)], up=True)
# 看台：★ 自跑道外缘**向外升起**（方向写反 = 把跑道和场地埋掉）
_bowl = []
for _s0, _s1, _z0, _z1 in ((_RD, 0.88, _ZT, 3.80), (0.88, 0.94, 3.80, 5.70),
                           (0.94, _CR, 5.70, _ZC)):
    _bowl.append(skirt_ring(_sc(_s0), _z0, _sc(_s1), _z1, th=0.42))
emit_to('R5_运动_看台', M_CONC, C_BLD, _bowl)
# 外圈**可上人绿坡**：自脊线缓降回地面，与滨水岸线连续（V2 原话）
emit_to('R5_运动_绿坡', M_GRASS, C_BLD,
        [skirt_ring(_sc(_CR), _ZC, _sc(_GR), GZ + 0.10, th=0.50)], up=True)
# 脊线栏板：**沿椭圆轮廓的斜环带**（`para_ring` 做的是矩形环，用在椭圆上
# 四角会悬空 —— 旧版就是这个问题）
emit_to('R5_运动_看台栏板', M_CONC, C_BLD,
        [skirt_ring(_sc(0.995), _ZC + 0.90, _sc(_CR), _ZC, th=0.45)], up=True)
emit_to('R5_运动_看台扶手', M_BAMBOO, C_BLD,
        [skirt_ring(_sc(0.995), _ZC + 1.04, _sc(0.978), _ZC + 0.90, th=0.18)],
        up=True)
# 主席台罩棚：★ 落在**北侧脊线**上，只罩顶排看台（旧版浮在球场中央）
_cny = _cy + _hy * 0.97
_bhx, _bhy = _hx * 0.46, _hy * 0.10
emit_to('R5_运动_主席台棚', M_ZINC, C_BLD,
        [barrel_solid(_cx, _cny, _bhx, _bhy, _ZC - 0.20, 3.20,
                      p=1.8, th=0.34, along='X', n1=14, n2=8)])
emit_to('R5_运动_棚铜收边', M_COPPER, C_BLD,
        barrel_rim(_cx, _cny, _bhx, _bhy, _ZC - 0.20, 3.20,
                   p=1.8, th=0.34, r=0.15, along='X', n=14))
emit_to('R5_运动_棚柱', M_STEEL, C_BLD,
        [bar3d((_cx + _bhx * _k, _cny - _bhy, GZ + 0.10),
               (_cx + _bhx * _k, _cny - _bhy, _ZC - 0.20), 0.42)
         for _k in (-1.0, -0.5, 0.0, 0.5, 1.0)])
# 四角照明塔：让"这是运动场"一眼可读，同时给西南角补一个竖向标记
_mast = []
for _mx, _my in ((-1, -1), (-1, 1), (1, -1), (1, 1)):
    _px, _py = _cx + _mx * _hx * 0.84, _cy + _my * _hy * 0.88
    _mast.append(bar3d((_px, _py, GZ + 0.10), (_px, _py, GZ + 14.60), 0.55))
    _mast.append(box(_px, _py, 4.60, 1.70, 1.50, GZ + 14.60))
    _mast.append(box(_px, _py, 1.70, 4.60, 1.50, GZ + 14.60))
emit_to('R5_运动_照明塔', M_STEEL, C_BLD, _mast)
print(f'[R5]   体育场 {2*_hx:.0f}×{2*_hy:.0f} **草坪竞技场**：场地 '
      f'{2*_hx*_RI:.0f}×{2*_hy*_RI:.0f} 齐地面 + 砖红跑道 + 三层看台'
      f'**向外**升到 Z {_ZC:.1f} + 外圈可上人绿坡落到地面 + 北侧脊线罩棚 → '
      f'罩棚顶 {_ZC + 3.0:.1f} m；四角照明塔 {GZ + 16.1:.1f} m；'
      f'总占地 {2*_hx*_GR:.0f}×{2*_hy*_GR:.0f} m')


# ==================================================================
# 6. 教学区（东南）—— 格构 + 玻璃 · 可变形教室
# ==================================================================
# 环廊**斜穿本区西半**（SVG x 416.3~435.5），建筑退到 x ≥ 440。
print('[R5] ── 教学区（格构 + 玻璃）──')

# 6.1 公共教学楼：**分区地标** —— 裙房 8.5 + 主塔 22 + 玻璃灯笼 8 + 壳 4.4 = 42.9 m
_cx, _cy, _hx, _hy = Z(462, 378, 40, 40)
B = layered(_cx, _cy, _hx, _hy, GZ, [
    (-12, -10, 52, 50, 22.0, 'hip', 4.4, (42, 40, 8.0)),
    (+26, +22, 42, 42, 11.0, 'hip', 3.4),
], ph=8.5, pout=2.0, fin=True, fin_pitch=2.60)
flush(B, 'BLD_教学_公共教学楼')
print('[R5]   公共教学楼（分区地标）裙房 8.5 + 主塔 22.0 + 玻璃灯笼 8.0 + 壳 4.4 '
      '→ **42.9 m**；副楼 11.0 + 壳 3.4 → 22.9 m')

# 6.2 教学 B：25.1 m
_cx, _cy, _hx, _hy = Z(504, 378, 34, 40)
B = layered(_cx, _cy, _hx, _hy, GZ, [
    (+6, -10, 54, 52, 14.0, 'hip', 3.6),
    (-20, +24, 38, 40, 7.0, 'flat', 0.0),
], ph=7.5, pout=1.6, fin=True, fin_pitch=2.40)
flush(B, 'BLD_教学_教学B')
print('[R5]   教学B 裙房 7.5 + 主楼 14.0 + 壳 3.6 → 25.1 m；'
      '附楼 7.0 + 桁架 1.9 → 16.4 m')

# 6.3 教学 C：21.4 m（低一档）
_cx, _cy, _hx, _hy = Z(460, 424, 40, 40)
B = layered(_cx, _cy, _hx, _hy, GZ, [
    (-16, 0, 56, 78, 11.0, 'hip', 3.4),
    (+30, +16, 30, 42, 6.0, 'flat', 0.0),
], ph=7.0, pout=1.6, fin=True, fin_pitch=2.40)
flush(B, 'BLD_教学_教学C')
print('[R5]   教学C 裙房 7.0 + 主楼 11.0 + 壳 3.4 → 21.4 m；'
      '附楼 6.0 + 桁架 1.9 → 14.9 m')

# 6.4 教学 D：29.5 m（主楼 + 南向低翼）
_cx, _cy, _hx, _hy = Z(504, 424, 34, 40)
B = layered(_cx, _cy, _hx, _hy, GZ, [
    (0, -8, 70, 62, 18.0, 'hip', 4.0),
    (0, +32, 54, 38, 9.0, 'flat', 0.0),
], ph=7.5, pout=1.6, fin=True, fin_pitch=2.40)
flush(B, 'BLD_教学_教学D')
print('[R5]   教学D 裙房 7.5 + 主楼 18.0 + 壳 4.0 → 29.5 m；'
      '南翼 9.0 + 桁架 1.9 → 18.4 m')

_cx, _cy, _hx, _hy = Z(482, 402, 58, 62)
emit_to('R5_教学区_院落', M_PAVE, C_BLD,
        [box(_cx, _cy, 2 * _hx, 2 * _hy, 0.10, GZ + 0.06)], up=True)


# ==================================================================
# 7. 生活区（南）—— 竹木 + 混凝土 · 底层架空共享客厅
# ==================================================================
# 环廊从本区北侧 27 m 外掠过（SVG y 448.5），全区可用；
# 并且**两处直接与环廊接驳**（V2："与环廊直接接驳"）。
print('[R5] ── 生活区（竹木 + 底层架空）──')

# ★ 六栋宿舍原本是**六个一模一样的 139×48 盒子** —— 远景里就是六片同高的平板，
#   这是"全是平房"最直接的来源。这里每栋都拆成**三段不同高度**，
#   且相邻两栋的高度序列**错开**（A 高→低、B 低→高），远看才有起伏。
_DORM = (
    ('宿舍A',     221, 474, 58, 20, ((-48, 12.0), (0, 17.0), (+48, 9.0))),
    ('宿舍B',     221, 496, 58, 20, ((-48, 9.0), (0, 17.0), (+48, 12.0))),
    ('研究生公寓', 270, 474, 38, 20, ((-28, 10.0), (0, 28.0), (+30, 14.0))),
    ('宿舍D',     270, 496, 38, 20, ((-28, 14.0), (0, 10.0), (+30, 12.0))),
    ('宿舍E',     420, 474, 60, 20, ((-50, 14.0), (0, 24.0), (+50, 11.0))),
    ('宿舍F',     420, 496, 60, 20, ((-50, 11.0), (0, 14.0), (+50, 18.0))),
)
for _nm, _sx, _sy, _w, _d, _prof in _DORM:
    _cx, _cy, _hx, _hy = Z(_sx, _sy, _w, _d)
    _mid_w = _w * 2.4 * 0.36
    _side_w = (_w * 2.4 - _mid_w) * 0.5 - 1.0
    _parts = []
    for (_dx, _h), _sw in zip(_prof, (_side_w, _mid_w, _side_w)):
        _parts.append((_dx, 0, _sw, _d * 2.4 - 4.0, _h, 'hip', 3.4))
    B = layered(_cx, _cy, _hx, _hy, GZ, _parts, ph=4.20, pout=2.0,
                podium='stilt', fin=True, fin_pitch=2.20)
    flush(B, f'BLD_生活_{_nm}')
    _tops = ' / '.join(f'{4.20 + _h + 3.4:.1f}' for _dx, _h in _prof)
    print(f'[R5]   {_nm} {2*_hx:.0f}×{2*_hy:.0f}  架空 4.2 + 三段主体 '
          f'（{" / ".join(str(_h) for _dx, _h in _prof)}）→ 三段标高 {_tops} m')

# 7.7 食堂：14.9 m（低层 + 大跨筒壳 + 低一档门厅）
_cx, _cy, _hx, _hy = Z(470, 471, 40, 22)
B = {}
put(B, M_CONC, box(_cx, _cy, 2 * _hx, 2 * _hy, 4.60, GZ))
put(B, M_GLASSC, box(_cx, _cy, 2 * _hx + 0.34, 2 * _hy + 0.34, 5.60, GZ + 4.60))
put(B, M_COPPER, rim_band(_cx, _cy, _hx + 0.17, _hy + 0.17, GZ + 4.60,
                          h=0.22, out=0.42))
put(B, M_COPPER, rim_band(_cx, _cy, _hx + 0.17, _hy + 0.17, GZ + 10.20,
                          h=0.22, out=0.42))
put(B, M_BAMBOO, fin_ring(_cx, _cy, _hx, _hy, GZ + 4.60, GZ + 10.20,
                          pitch=2.40, fin_d=0.36, fin_t=0.12))
put(B, M_CONC, box(_cx, _cy, 2 * _hx, 2 * _hy, 0.50, GZ + 10.20))
B = merge(B, barrel_roof(_cx - 6.0, _cy, _hx - 6.0, _hy + 2.0, GZ + 10.20, 4.20,
                         along='X', n1=12, n2=14))
put(B, M_COPPER, eave_ring(_cx - 6.0, _cy, _hx - 6.0, _hy + 2.0, GZ + 10.10, 2.0))
B = merge(B, solid_body(_cx + _hx - 7.0, _cy, 7.0, 16.0, GZ, GZ + 5.60, 1,
                        win_frac=0.50, fin=True, fin_pitch=2.20))
put(B, M_COPPER, rim_band(_cx + _hx - 7.0, _cy, 7.0, 16.0, GZ + 5.60, h=0.22, out=0.60))
flush(B, 'BLD_生活_食堂')
print(f'[R5]   食堂 {2*_hx:.0f}×{2*_hy:.0f}×10.2 + 筒壳 4.2 → 14.9 m；'
      f'东侧门厅 5.6 m')

# 7.8 商业街：10.0 m（五级，最低一档；拆成两段高度）
_cx, _cy, _hx, _hy = Z(470, 495, 40, 16)
B = {}
put(B, M_CONC, box(_cx, _cy, 2 * _hx, 2 * _hy, 0.40, GZ))
_col = []
for _ax, _ay, _bx, _by, _L, _nx, _ny in side_frames(_cx, _cy, _hx - 1.2, _hy - 1.2, 0.0):
    _m = max(2, int(round(_L / 7.0)))
    for _i in range(_m + 1):
        _s = _i / float(_m)
        _col.append(box(_ax + (_bx - _ax) * _s, _ay + (_by - _ay) * _s,
                        0.50, 0.50, 4.20, GZ + 0.40))
put(B, M_CONC, _col)
put(B, M_GLASSC, box(_cx, _cy, 2 * _hx - 2.4, 2 * _hy - 2.4, 4.20, GZ + 0.40))
put(B, M_CONC, box(_cx, _cy, 2 * _hx + 2.0, 2 * _hy + 2.0, 0.55, GZ + 4.60))
put(B, M_BAMBOO, box(_cx, _cy, 2 * _hx + 2.0, 2 * _hy + 2.0, 1.70, GZ + 5.15))
# 东段抬高一档（10.0），西段压到 7.6 —— 一条街也要有高低
put(B, M_CONC, box(_cx + 16.0, _cy, 2 * _hx - 32.0, 2 * _hy, 3.15, GZ + 6.85))
B = merge(B, barrel_roof(_cx + 16.0, _cy, _hx - 16.0, _hy + 1.6, GZ + 10.00, 2.60,
                         along='X', n1=10, n2=12, ribs=False))
B = merge(B, solid_body(_cx - 22.0, _cy, 18.0, _hy, GZ, GZ + 4.60, 1,
                        win_frac=0.50, fin=True, fin_pitch=2.20))
put(B, M_COPPER, rim_band(_cx - 22.0, _cy, 18.0, _hy, GZ + 4.60, h=0.22, out=0.70))
flush(B, 'BLD_生活_商业街')
print(f'[R5]   商业街 {2*_hx:.0f}×{2*_hy:.0f}：东段 10.0 m / 西段 7.6 m'
      f'（低层长条 + 竹木格栅带）')

_cx, _cy, _hx, _hy = Z(268, 485, 76, 46)
emit_to('R5_生活区_院落', M_PAVE, C_BLD,
        [box(_cx, _cy, 2 * _hx, 2 * _hy, 0.10, GZ + 0.06)], up=True)
flush(link_bridge((254.2, 452.0), (254.2, 466.0)), 'R5_生活区_接驳桥西')
flush(link_bridge((425.8, 452.0), (425.8, 466.0)), 'R5_生活区_接驳桥东')
flush(link_bridge((247.3, 325.8), (238.0, 325.8)), 'R5_科技区_接驳桥')
print('[R5]   接驳桥 3 座：生活区西 / 生活区东 / 科技区（环廊 ↔ 建筑）')


# ==================================================================
# 8. 汇总
# ==================================================================
print('[R5] 五区重建完成 —— 22 栋，全部按环廊净空 ≥ 12.30 m 重新落位')
print('[R5] ★ 体量分层：每栋 = 裙房 + 2~3 个不同高度的体量（各自女儿墙收头 + '
      '屋面分别给壳/筒壳/平屋面）')
print('[R5] 天际线五级 —— 一级 82.6（垂直书院）'
      ' / 二级 52.2·53.7 / 三级 42.9~44.6 / 四级 21.4~35.6 / 五级 10.0~18.4')
print('[R5] ★ 配色：环境光加暖色乘法（ambient_tint 1.08/0.92/0.70）+ 屋面'
      ' roughness 0.80·metallic 0.10 + 太阳主导'
      '（sky 0.70→0.66 / sun 4.4→5.8 / exposure −0.42→+0.20 / sky_visible 0.72）')
