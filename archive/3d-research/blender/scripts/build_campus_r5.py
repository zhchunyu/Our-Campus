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

────────────────────────────────────────────────────────────────
§4 ★★ S4-a（V3 §3.1）立面语言分型：横条纹 → 竖向格构 + 实墙
────────────────────────────────────────────────────────────────
■ 病根（V3 §3.1 原话）：
    「把 `fin_facade()` 的**横向条纹**改成**竖向格构 + 实墙**
      （横条纹是"办公园区感"的第一来源）」
  实拍 `renders/R5_教学区_近景.png` 逐条核对，横条纹**有四个来源，全在
  `solid_body()` 里**（不是 `fin_facade` —— V3 点错了函数名，但方向是对的）：
    ① 每层一条**通长水平条窗**（`strip_windows`，亮带）
    ② 每层一圈**楼板挑檐**（`M_SLAB` band，出挑 0.20 m，投出水平阴影线）
    ③ 顶部**横向编织钢桁架带**（`truss_band`，水平之字撑）
    ④ 密排细竖翼（`fin_ring`）—— **这一条本来就是竖的**，保留
■ 处方 —— ①②③ 逐个换成竖向对应物，再加一套**通高竖柱**把立面锁成竖构图：
    ① → `v_windows()`   竖长窗（窗落在**格心**）
    ② → **删除**（改由通高竖柱提供楼层尺度，不再需要挑檐来"分家"）
    ③ → **删除**（横向编织带没有竖向对应物 —— 见下文"竖向格构的落地方式"，
          "格构"由 `v_ribs()` 的**节奏 + 材质**表达：清水 / 钢 / 铜三种）
    ④ → 保留并升格为"竖柱"本身（`fin=True` ⇒ 柱用竹木）
  ★ 柱与窗**共用同一套分格口径**（都 `max(1, round(L/pitch))`，
    柱在 `(i+0.5)/m`、窗在 `i/m`）⇒ 天然错开半格、永不错缝。
    两套分格各算各的，柱窗必然错缝 —— 近景一眼假，而且**不会报错**。
■ 五种功能分型（V3 §3.1 表，`_LANG`）：
    分区     墙          竖柱        玻璃    格构    立面节奏（pitch / 窗宽比）
    教学     清水混凝土  清水混凝土  超白     —      3.00 m / 0.62   ← 清水格构 + 实墙
    科研实验 清水混凝土  **墨灰钢**  超白    钢      3.20 m / 0.60   ← 浅灰 + 钢格构
    生活     **白墙**    **竹木**    超白     —      2.20 m / 0.60   ← 白墙 + 竹木格栅
    科技     清水混凝土  **铜**      超白    钢      3.00 m / 0.74   ← 玻璃幕 + 钢格构
    运动     清水混凝土  清水混凝土  超白     —      3.60 m / 0.50   ← 清水混凝土
  ★ 墙 : 玻璃 ≈ 65 : 30（教学）~ 45 : 45（科技），**实墙一律过半** ——
    全玻璃幕会把 22 栋一起拉黑（见 §0 的教训）。
■ `div` —— 竖向窗分几段：生活区**每层一樘**（宿舍窗本来就按层分），
  其余**通高一道竖缝**（把"竖向格构"读满）。
■ A/B 开关 `BR_R5_LANG=0` 退回 V2 旧水平语言（逐字未改），只为同机位量化对照。
"""

import math
import os

import bpy

print('### [R5] 五区重建 ###')

GZ = Z_TOP

_R5_SLAB = 0.90          # 楼板厚
_R5_TRH = 1.25           # 编织格构带高（与 R2 图书馆同一条语言）

# ★★ S4-a（V3 §3.1）立面语言总开关：横条纹 → **竖向格构 + 实墙**。
#   置 0 退回 V2 的旧水平语言 —— 只为"改前 vs 改后"**同机位量化对照**。
#   交付一律用默认（V3 竖向语言）。理由同 `palette_retune.py` 的 `BR_GRASS_V24`：
#   不设开关就只能靠"翻 git 改回来再渲一遍"，那种做法迟早把交付版留在错误的一侧。
_VERT = os.environ.get('BR_R5_LANG', '1') != '0'
print('[R5] 立面语言：%s' % ('★ 竖向格构 + 实墙（V3 §3.1）'
                            if _VERT else '旧水平条纹（BR_R5_LANG=0，A/B 对照）'))

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


# ==================================================================
# 2.0 ★ V3 规划重排：楼体缩放（缩平面、**不动高度**）
# ==================================================================
# 动机（用户评审意见第 1 条「建筑彼此紧密挤压堆叠、之间没有连通的道路」）：
# 实测 32 个建筑簇里 24 对净距 < 12 m、11 对包围盒直接重叠；
# 根因是**分区用地照建筑轮廓画的**（生活区覆盖率 96%、科技区 85%）。
# 处方：楼体平面缩小 → 让出间距与园路，**高度一律不动**
# （全园五级标高是上一轮专门做出来的成果，动高度会打乱天际线层级）。
def shrink(parts, sx, sy=None):
    """把 `layered()` 的 parts 表按 sx/sy 缩放**平面尺寸**（高度不动）。

    缩放对象：体量宽 `sx_`、深 `sy_`、偏移 `dx`/`dy`、屋面起拱 `rise`、
              玻璃灯笼的平面尺寸。**高度 h 与裙房高 ph 一律不动。**
    ★ rise 必须跟着缩：起拱是按跨度的百分比读的，楼缩了而 rise 不缩，
      屋顶会变成一个"鼓包"。
    """
    if sy is None:
        sy = sx
    _k = (sx + sy) * 0.5
    out = []
    for p in parts:
        dx, dy, a, b, h, rk, rise = p[:7]
        q = (dx * sx, dy * sy, a * sx, b * sy, h, rk, rise * _k)
        if len(p) > 7:
            lan = p[7]
            q = q + ((lan[0] * sx, lan[1] * sy, lan[2]),)
        out.append(q)
    return out


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


# ==================================================================
# 2.1 ★★ S4-a（V3 §3.1）立面语言分型：横条纹 → **竖向格构 + 实墙**
# ==================================================================
# 病根（V3 §3.1 原话）：
#     「把 `fin_facade()` 的**横向条纹**改成**竖向格构 + 实墙**
#       （横条纹是"办公园区感"的第一来源）」
#
# 实拍 `R5_教学区_近景.png` 逐条核对，横条纹**有四个来源，全在 `solid_body()` 里**：
#     ① 每层一条**通长水平条窗**（`strip_windows`，亮带）
#     ② 每层一圈**楼板挑檐**（`M_SLAB` band，出挑 0.20 m，投出水平阴影线）
#     ③ 顶部**横向编织钢桁架带**（`truss_band`，水平之字撑）
#     ④ 密排细竖翼（`fin_ring`）—— **这一条本来就是竖的**，保留
# ⇒ 本版把 ①②③ 换成竖向对应物，再加一套**通高竖柱**把立面锁成竖构图：
#     ① → `v_windows()`   竖长窗（窗落在格心）
#     ② → **删除**（改由通高竖柱提供楼层尺度，不再需要挑檐来"分家"）
#     ③ → **删除**（横向编织带没有竖向对应物；见下文"竖向格构的落地方式"）
#     ④ → 保留，并升格为"竖柱"本身（`fin=True` ⇒ 柱用竹木）
#
# ★ 关键：柱与窗必须**共用同一套分格口径**（都 `round(L / pitch)`，柱在格缝、
#   窗在格心）。两套分格各算各的 ⇒ 柱窗错缝，近景一眼假，而且**不会报错**。
#   （`fin_ring()` 恰好就是"柱在格缝"的口径，所以旧调用点能无缝迁移。）

# ---- 分型用材质：生活区要"白墙" ----
# ★ 用 `bpy.data.materials.get` 而不是变量名 —— `M_白墙` 是 stage1 建的，
#   它的全局变量叫 `M_WALL`，但 `M_WALL` 在后续阶段**可能被重绑**（本工程有过先例）。
M_WHITE = bpy.data.materials.get('M_白墙')
if M_WHITE is None:
    # 只在"没有 stage1"的极端场景下兜底；正常全链 stage1 一定先跑
    M_WHITE = make_mat('M_白墙', (0.726, 0.712, 0.676), rough=0.92)

# ---- 五种功能分型（V3 §3.1 表）----
#   teach 教学 = 清水格构 + 实墙（暖灰）    lab 科研/实验 = 浅灰 + 钢格构
#   life  生活 = 白墙 + 竹木格栅            tech 科技 = 玻璃幕 + 钢格构（玻璃 + 铜）
#   sport 运动 = 清水混凝土
# `pitch`/`rib_d`/`rib_t`/`frac` 是按"**柱 + 窗**"的立面节奏定的：
#   净开间 = pitch − rib_t；窗宽 = 净开间 × frac；柱两侧各留 (净开间−窗宽)/2 的实墙。
#   全部落在"墙 55~65% / 玻璃 25~35%"这条区间里 —— 这是校园该有的明度
#   （全玻璃幕会把 22 栋一起拉黑，见旧版 `solid_body` 的教训）。
# ★ 第一轮渲染实测（2026-09-25）的两条修正：
#   ① `rib_d` 0.40 → **0.52~0.64**。原值在实拍里只投出一条**发丝般的暗线**，
#      竖向感全靠"颜色交替"撑着；挑深到 0.6 m 档之后竖缝才自己投出阴影，
#      立面才"立"起来（旧版靠楼板挑檐投的水平阴影线提供立体感，挑檐一删，
#      这份立体感必须**由竖柱补回来**）。
#   ② 独立的"竖向格构带"（竖弦杆 + 之字撑）**整个方案作废** —— 它与竖柱
#      叠在一起读成一张密网格，而且之字撑无论怎么拉长，在远景里都退化成
#      横带（实拍 `R5_科技区_近景` 一眼可见）。详见下文
#      "★ 关于竖向格构的落地方式"。
#   ③ **幕墙也要改**：`glass_body()` 是"每层一块楼板带 + 每层一截竖翼"，
#      实拍正中那栋（学生中心）就是**四五道横带** —— 横条纹来源 ② 的幕墙版。
_LANG = {
    'teach': dict(wall=M_CONC,   rib=M_CONC,    pitch=3.30, rib_d=0.62,
                  rib_t=0.42, frac=0.58, div_floor=False),
    'lab':   dict(wall=M_CONC,   rib=M_STEEL,   pitch=3.40, rib_d=0.52,
                  rib_t=0.30, frac=0.56, div_floor=False),
    'life':  dict(wall=M_WHITE,  rib=M_BAMBOO,  pitch=2.40, rib_d=0.36,
                  rib_t=0.14, frac=0.60, div_floor=True),
    'tech':  dict(wall=M_CONC,   rib=M_COPPER,  pitch=3.20, rib_d=0.50,
                  rib_t=0.26, frac=0.68, div_floor=False),
    'sport': dict(wall=M_CONC,   rib=M_CONC,    pitch=3.80, rib_d=0.64,
                  rib_t=0.50, frac=0.50, div_floor=False),
}


def v_ribs(cx, cy, hx, hy, z0, z1, pitch=3.00, d=0.40, t=0.36):
    """**通高竖柱**（竖向格构里"实"的那一半）—— 落在**格缝**（`s=(i+0.5)/m`）。

    ★ 分格口径与 `fin_ring()` 完全一致（`max(1, round(L/pitch))` + `(i+0.5)/m`），
      而 `v_windows()` 把窗落在**格心**（`s=i/m`）—— 柱与窗天然错开半格、永不错缝。
    """
    g = []
    h = z1 - z0
    for _ax, _ay, _bx, _by, _L, _nx, _ny in side_frames(cx, cy, hx, hy, 0.0):
        _m = max(1, int(round(_L / pitch)))
        for _i in range(_m):
            _s = (_i + 0.5) / float(_m)
            _px = _ax + (_bx - _ax) * _s + _nx * (d * 0.5)
            _py = _ay + (_by - _ay) * _s + _ny * (d * 0.5)
            g.append(fin_box(_px, _py, _nx, _ny, d, t, h, z0))
    return g


def v_windows(cx, cy, hx, hy, z0, z1, pitch=3.00, frac=0.62, gap=-0.22, t=0.30,
              div=1, sill=0.90, head=0.60, rib_t=0.36):
    """**竖长窗**（V3 §3.1）—— 取代通长水平条窗 `strip_windows()`。

    沿每条边按 `pitch` 分格，**窗落在格心**（`s = i/m`）；窗宽 = 净开间 × `frac`。

    `div` —— 竖向分几段：
      · `div = 1` → **通高一道竖缝**（教学 / 科研 / 科技 / 运动：把"竖向格构"读满）
      · `div = nf` → **每层一樘**（生活区：宿舍窗本来就该按层分，
        而且"每层一樘 + 通高竹木柱"= V3 的"白墙 + 竹木格栅"）
      `div > 1` 时 `sill`/`head` 按**每层**计（层高 − 窗台 − 窗上墙 = 窗高）。

    ★ `gap` 给**负值**（凸出墙面）：墙是实体，内退的玻璃会被整条埋进墙里 ——
      静默失效，图上看不出任何异常（旧版 `strip_windows` 同一条铁律）。
    ★ 分格口径必须与 `v_ribs()` / `fin_ring()` 一致，否则柱窗错缝。
    """
    gl = []
    h = z1 - z0
    if div > 1:
        _fh = h / float(div)
        _wh = _fh - sill - head
    else:
        _fh = h
        _wh = h - sill - head
    if _wh < 1.20:                       # 太矮就不开窗（低层车间 / 附属体量）
        return gl
    for _ax, _ay, _bx, _by, _L, _nx, _ny in side_frames(cx, cy, hx, hy, 0.0):
        _m = max(1, int(round(_L / pitch)))
        _cw = max(0.50, (_L / _m) - rib_t) * frac
        for _i in range(_m):
            _s = _i / float(_m)
            _px = _ax + (_bx - _ax) * _s - _nx * gap
            _py = _ay + (_by - _ay) * _s - _ny * gap
            for _k in range(max(1, div)):
                # div == 1：整段体量只开一道竖缝（sill/head 是**绝对**上下留边）
                # div  > 1：每层一樘（sill/head 是**每层**的窗台 / 窗上墙）
                _za = z0 + sill if div == 1 else z0 + _fh * _k + sill
                if abs(_nx) > abs(_ny):
                    gl.append(box(_px, _py, t, _cw, _wh, _za))
                else:
                    gl.append(box(_px, _py, _cw, t, _wh, _za))
    return gl


# ★★ 关于"竖向格构"的落地方式（第一轮试错记录，2026-09-25）：
#   最初按 V3 字面做了一个独立的 `v_lattice()`（竖弦杆 + 之字撑，挂在立面上），
#   与 `v_ribs()` 并存。实拍 `R5_科技区_近景` 发现：**两套竖向构件叠在一起
#   读成了一张密网格**，而且之字撑在 30 m 高的立面上无论怎么拉长，
#   在远景里都退化成**横带** —— 等于把刚删掉的横条纹又请回来。
#   ⇒ 定案：**"竖向格构"就是通高竖柱的节奏本身**（`v_ribs()`）。
#     科研 / 实验 / 科技的分型把竖柱材质换成**墨灰钢 / 铜**，
#     节奏 + 材质一变，"清水格构"就变成"钢格构 / 铜格构"，不需要第二个构件。
#     （`truss_band()` 与 `v_lattice()` 都不再用于主体立面。）


# ---- 2.1 ★ 默认立面：**实墙 + 竖向格构 + 竖长窗**（V3 §3.1）----
def solid_body(cx, cy, hx, hy, z0, z1, nf, lang='teach', lattice=None, win=True,
               win_frac=None, fin=False, fin_pitch=None, fin_d=0.36, fin_t=0.12,
               band=True, rib=None, rib_pitch=None, rib_d=None, rib_t=None,
               div=None, sill=0.90, head=0.60):
    """**实墙 + 竖向格构 + 竖长窗** —— 全园五区的主体做法（S4-a 改版）。

    ★ 为什么不是"玻璃幕 + 竖翼"：那套做法（R2 图书馆）成立的前提是
      **台地本身就是大面积浅色混凝土**，玻璃只是点缀。搬到常规多层体量上，
      浅色混凝土只剩几道薄板边，主色面变成玻璃 —— 玻璃必然是暗的，
      于是整园 22 栋一起发黑。**实墙占约 60% 才是校园该有的明度。**

    `lang` —— 功能分型（V3 §3.1）：`'teach'` / `'lab'` / `'life'` /
      `'tech'` / `'sport'`。决定**墙·柱·玻璃·线脚**四者的材质与立面节奏。
    `lattice` —— **只在 A/B 旧分支里有效**（挂旧版的横向编织格构带）；
      竖向语言下"格构"由竖柱的节奏 + 材质表达，这个开关不起作用。
    `fin` —— 旧参数，语义迁移为「**竖柱用竹木**」（旧的 `fin=True` 就是竹木竖翼）。
      旧调用点的 `fin_pitch` / `fin_d` / `fin_t` 会**自动映射**成柱的分格与截面，
      所以不必逐个改调用点。
    `div` —— 竖向窗分几段；`None` 走分型默认（生活区 = 每层一樘，其余 = 通高一道）。
    `band` —— 只在 A/B 旧分支（`BR_R5_LANG=0`）里有效；竖向语言**不做楼板挑檐**
      （挑檐的水平阴影线正是横条纹的来源 ②）。

    ★ `make_mat` 按名字缓存 ⇒ 材质色值只在本阶段**第一次定义**处有效；
      这里只**引用**不定义，色值一律走 `palette_retune.py` 统一出口。
    """
    _P = _LANG.get(lang, _LANG['teach'])
    _wall = _P['wall']
    _ribm = _P['rib']
    # 旧参数 `fin=True` 的语义迁移：**竖柱改用竹木**（旧的"竹木竖翼"）。
    # 于是"暖色锚点"这条设计意图完整保留，只是构件从"只做一层高的薄翼"
    # 变成了"通高竖柱"。V3 §3.1 表里要"清水格构"的分型（教学 / 运动）
    # 在调用点显式给 `fin=False`。
    if fin:
        _ribm = M_BAMBOO
    if rib is not None:
        _ribm = rib
    _pitch = (rib_pitch if rib_pitch is not None
              else (fin_pitch if (fin and fin_pitch is not None) else _P['pitch']))
    _rd = rib_d if rib_d is not None else (fin_d if fin else _P['rib_d'])
    _rt = rib_t if rib_t is not None else (fin_t if fin else _P['rib_t'])
    _wf = win_frac if win_frac is not None else _P['frac']
    if div is None:
        div = nf if _P['div_floor'] else 1
    # `lattice` 只在**旧分支**（A/B 对照）里有效 —— 见上文"竖向格构的落地方式"：
    # 竖向语言下，"格构"由竖柱的**节奏 + 材质**表达，不需要第二个构件。
    _lat = bool(lattice)

    B = {}
    put(B, _wall, box(cx, cy, 2 * hx, 2 * hy, z1 - z0, z0))

    if _VERT:
        # ① 通高竖柱（格构的"实"）—— 落在格缝
        put(B, _ribm, v_ribs(cx, cy, hx, hy, z0, z1, pitch=_pitch, d=_rd, t=_rt))
        # ② 竖长窗 —— 落在格心
        if win:
            put(B, M_GLASSC, v_windows(cx, cy, hx, hy, z0, z1, pitch=_pitch,
                                       frac=_wf, gap=-0.22, t=0.30, div=div,
                                       sill=sill, head=head, rib_t=_rt))
    else:
        # ---- 旧水平语言（`BR_R5_LANG=0` 的 A/B 对照分支，与改前逐字一致）----
        fh = (z1 - z0) / float(nf)
        for k in range(1, nf):
            zt = z0 + fh * k
            if band:
                put(B, M_SLAB, box(cx, cy, 2 * hx + 0.40, 2 * hy + 0.40,
                                   _R5_SLAB, zt - _R5_SLAB))
            if _lat:
                put(B, M_STEEL, truss_band(cx, cy, hx, hy,
                                           zt - _R5_SLAB - _R5_TRH,
                                           zt - _R5_SLAB - 0.02,
                                           bar=0.26, diag=0.17, seg=2.40, out=0.16))
        if win:
            for k in range(nf):
                _g, _t = strip_windows(cx, cy, hx, hy, z0 + fh * (k + 0.56),
                                       w=min(2.90, fh * _wf), gap=-0.24, t=0.36)
                put(B, M_GLASSC, _g)
                put(B, M_COPPER, _t)
        if fin:
            put(B, M_BAMBOO, fin_ring(cx, cy, hx, hy, z0, z1,
                                      pitch=(fin_pitch or 2.60),
                                      fin_d=fin_d, fin_t=fin_t))
    return B


# ---- 2.2 特例：整层玻璃幕 + 竖翼（只给 3 栋用）----
def glass_body(cx, cy, hx, hy, z0, z1, nf, pitch=1.60, fin_d=0.42, fin_t=0.13,
               fin_mat=None):
    """整层玻璃幕 + **竖向**遮阳翼 + 铜压顶（科技区 / 玻璃灯笼）。

    ★ S4-a：`fin_mat` 可换竖翼材质 —— 科技区用**铜**（V3 §3.1「玻璃 + 铜」），
      其余仍用竹木。竖向语言下额外挂一道**通高竖向钢格构**，
      取代原先每层一圈的横向 `truss_band`（横条纹来源 ③）。
    """
    _fm = fin_mat or M_BAMBOO
    B = {}
    if _VERT:
        # ★ S4-a：**竖向幕墙** —— 整面玻璃 + **通高**竖翼，一次到底。
        #   旧做法是"每层一块楼板带 + 每层一截竖翼 + 每层一道铜压顶"，
        #   实拍（`R5_科技区_近景` 正中那栋 = 学生中心）一眼就是**四五道横带** ——
        #   这是横条纹来源 ② 的**幕墙版**，`solid_body` 改了它没改。
        #   竖翼间距 `pitch` 就是幕墙的竖梃间距，材质由分型给（科技 = 铜）。
        put(B, M_GLASSC, box(cx, cy, 2 * hx + 0.10, 2 * hy + 0.10, z1 - z0, z0))
        put(B, _fm, fin_ring(cx, cy, hx, hy, z0, z1, pitch=pitch,
                             fin_d=fin_d, fin_t=fin_t))
        return B
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
        put(B, _fm, _f)
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
            lattice=None, fin=True, fin_pitch=2.40, podium='solid',
            nf_step=4.20, lang='teach'):
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
        B = merge(B, solid_body(cx, cy, _px, _py, z0, z0 + ph, 2, lang=lang,
                                win_frac=0.50, fin=fin, fin_pitch=3.00,
                                fin_d=0.34, fin_t=0.12))
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
            B = merge(B, glass_body(_tx, _ty, _thx, _thy, _zb, _z1, _n,
                                    fin_mat=_LANG.get(lang, _LANG['teach'])['rib']))
        else:
            B = merge(B, solid_body(_tx, _ty, _thx, _thy, _zb, _z1, _n,
                                    lang=lang, lattice=lattice, win_frac=0.46,
                                    fin=fin, fin_pitch=fin_pitch, fin_d=0.36,
                                    fin_t=0.12))
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

# ---- ★ V3 重排：4 栋统一缩到 0.84 倍，2×2 围合中央广场 ----
# 旧布局：4 栋两两净距仅 0.4~5.4 m（创新中心↔演艺中心 −5.4 m 包围盒重叠）。
# 新布局：可用区 X −444~−250（环廊净空线内）194 m × Y 417.6~643.2（225.6 m），
#         2 列 × 2 行，**列净距 32.7 m / 行净距 32.1 m**（扣裙房外扩 2.2 后仍有 28 m 以上）。
_S3 = 0.84
_cx, _cy, _hx, _hy = Z(171.8, 268.1, 40 * _S3, 48 * _S3)      # NW
_cx2, _cy2 = W(219.0, 268.1)[0], _cy                            # NE
_cx3, _cy3 = _cx, W(171.8, 321.8)[1]                            # SW
_cx4, _cy4 = _cx2, _cy3                                         # SE

# 3.1 创新中心：**分区地标** —— 裙房 9.0 + 主塔 30 + 玻璃灯笼 8 + 壳 5.2 = 52.2 m
B = layered(_cx, _cy, _hx, _hy, GZ, shrink([
    (-12, 0, 54, 66, 30.0, 'hip', 5.0, (44, 54, 8.0)),   # 主塔 + 玻璃灯笼
    (+26, +20, 40, 42, 16.0, 'hip', 3.4),                # 副塔
], _S3), ph=9.0, pout=2.2, lang='tech', fin=False)
flush(B, 'BLD_科技_创新中心')
print('[R5]   创新中心（分区地标）裙房 9.0 + 主塔 30.0 + 玻璃灯笼 8.0 + 壳 5.2 '
      '→ **52.2 m**；副塔 16.0 + 壳 3.4 → 28.4 m')

# 3.2 学生中心：29.8 m（★ 特例：整层玻璃幕，与创新中心的实墙形成对比）
B = layered(_cx2, _cy2, _hx, _hy, GZ, shrink([
    (-14, 0, 56, 70, 17.0, 'hip', 4.8),
    (+28, +22, 38, 42, 10.0, 'hip', 3.2),
], _S3), ph=8.0, pout=1.8, style='glass', lang='tech', fin=False)
flush(B, 'BLD_科技_学生中心')
print('[R5]   学生中心（特例·玻璃幕）裙房 8.0 + 主厅 17.0 + 壳 4.8 → 29.8 m；'
      '副厅 10.0 + 壳 3.2 → 21.2 m')

# 3.3 演艺中心：30.0 m（观众厅筒壳沿 X，前厅低一档）
B = layered(_cx3, _cy3, _hx, _hy, GZ, shrink([
    (+10, 0, 56, 82, 16.0, 'barrel_x', 7.0),
    (-34, 0, 26, 72, 11.0, 'hip', 3.2),
], _S3), ph=7.0, pout=2.0, lang='tech', fin=False)
flush(B, 'BLD_科技_演艺中心')
print('[R5]   演艺中心 裙房 7.0 + 观众厅 16.0 + 筒壳 7.0 → 30.0 m；'
      '前厅 11.0 + 壳 3.2 → 21.2 m')

# 3.4 创客工坊：14.9 m 低层车间（五级，压住天际线底）
B = layered(_cx4, _cy4, _hx, _hy, GZ, shrink([
    (-14, 0, 48, 78, 8.0, 'flat', 0.0),
    (+26, 0, 28, 72, 3.5, 'hip', 1.8),
], _S3), ph=5.0, pout=1.4, lang='tech', fin=False)
flush(B, 'BLD_科技_创客工坊')
print('[R5]   创客工坊 裙房 5.0 + 车间 8.0 + 屋面桁架 1.9 → 14.9 m；'
      '低跨 3.5 + 壳 1.8 → 10.3 m')

# 中央广场：落在 2×2 的正中，尺寸 = 列净距 × 行净距
_plx = (_cx + _cx2) * 0.5
_ply = (_cy + _cy3) * 0.5
_plw = (_cx2 - _hx) - (_cx + _hx)          # 列净距
_plh = (_cy - _hy) - (_cy3 + _hy)          # 行净距
emit_to('R5_科技区_中央广场', M_PAVE, C_BLD,
        [box(_plx, _ply, _plw, _plh, 0.10, GZ + 0.06)], up=True)
_sh = []
for _k in range(7):
    _t = -1.0 + 2.0 * _k / 6.0
    _sh.append(shrub(_plx + _t * (_plw * 0.30), _ply + _plh * 0.34,
                     GZ + 0.16, h=2.4, r=1.30))
    _sh.append(shrub(_plx + _t * (_plw * 0.30), _ply - _plh * 0.34,
                     GZ + 0.16, h=2.4, r=1.30))
emit_to('R5_科技区_灌木', M_LEAF, C_BLD, _sh, smooth=True)
print(f'[R5]   科技区 V3 重排：列净距 {_plw:.1f} m / 行净距 {_plh:.1f} m，'
      f'中央广场 {_plw:.0f}×{_plh:.0f} m')


# ==================================================================
# 4. 实验区（东北）—— 格构 + 混凝土 · 剖面外露
# ==================================================================
# 环廊沿本区**西缘**经过（SVG x 392.5~437.2），建筑退到 x ≥ 435。
print('[R5] ── 实验区（格构 + 剖面外露）──')

# ---- ★ V3 重排：科研中心缩 0.82、实验楼 A/B 缩到 76×76 一字排开 ----
# 旧布局：实验楼A↔实验楼B 包围盒**重叠 −4.6 m**（A 东缘与 B 西缘正好贴死）。
# 新布局：A/B 各 76×76，**净距 30 m**；两者与科研中心**净距 29.8 m**。
_S4A = 0.82
_S4B = 0.754

# 4.1 科研中心：**分区地标** —— 大裙房 14.0 + 塔楼 26.0 + 壳 4.6 = 44.6 m
_cx, _cy, _hx, _hy = Z(478, 268, 86 * _S4A, 38 * _S4A)
B = layered(_cx, _cy, _hx, _hy, GZ, shrink([
    (-50, 0, 64, 62, 26.0, 'hip', 4.6),
    (+52, 0, 58, 54, 12.0, 'flat', 0.0),
], _S4A), ph=14.0, pout=2.0, lattice=True, lang='lab', fin=False)
# ★ service_shaft 返回的是**按材质分桶的 dict**，不是几何列表 ——
#   必须走 merge，走 put 会把整个 dict 当成一个几何塞进列表，
#   到 emit_to 里 unpack 时报 "not enough values to unpack"。
B = merge(B, service_shaft(_cx - 50 * _S4A, _cy, 32.0 * _S4A, 31.0 * _S4A,
                           GZ + 14.0, GZ + 40.0, w=4.2))
flush(B, 'BLD_实验_科研中心')
print('[R5]   科研中心（分区地标）大裙房 14.0 + 塔楼 26.0 + 壳 4.6 + 外露梯井 '
      '→ **44.6 m**；东翼 12.0 + 桁架 1.9 → 27.9 m')

# 4.2 实验楼 A：25.9 m
_cx, _cy, _hx, _hy = Z(450.83, 311.83, 42 * _S4B, 42 * _S4B)
B = layered(_cx, _cy, _hx, _hy, GZ, shrink([
    (-12, -8, 56, 56, 15.0, 'hip', 3.4),
    (+24, +22, 42, 44, 8.0, 'flat', 0.0),
], _S4B), ph=7.5, pout=1.8, lattice=True, lang='lab', fin=False)
B = merge(B, service_shaft(_cx - 12 * _S4B, _cy - 8 * _S4B, 28.0 * _S4B, 28.0 * _S4B,
                           GZ + 7.5, GZ + 22.5, w=3.8))
flush(B, 'BLD_实验_实验楼A')
print('[R5]   实验楼A 裙房 7.5 + 主楼 15.0 + 壳 3.4 → 25.9 m（+ 外露梯井）；'
      '附楼 8.0 + 桁架 1.9 → 17.4 m')

# 4.3 实验楼 B：18.4 m（低一档，拉出区内高差）
_cx, _cy, _hx, _hy = Z(495, 311.83, 34 * 0.931, 42 * _S4B)
B = layered(_cx, _cy, _hx, _hy, GZ, shrink([
    (0, -14, 72, 50, 9.0, 'flat', 0.0),
    (0, +26, 56, 40, 5.0, 'hip', 2.6),
], 0.931, _S4B), ph=7.5, pout=1.6, lattice=True, lang='lab', fin=False)
flush(B, 'BLD_实验_实验楼B')
print('[R5]   实验楼B 裙房 7.5 + 长跨 9.0 + 屋面桁架 1.9 → 18.4 m；'
      '南翼 5.0 + 壳 2.6 → 15.1 m')

_cx, _cy, _hx, _hy = Z(478, 295.17, 83.33, 91.67)
emit_to('R5_实验区_院落', M_PAVE, C_BLD,
        [box(_cx, _cy, 2 * _hx, 2 * _hy, 0.10, GZ + 0.06)], up=True)
print('[R5]   实验区 V3 重排：实验楼A↔B 净距 30.0 m / 与科研中心净距 29.8 m')


# ==================================================================
# 5. 运动医疗区（西南）—— 曲面 + 可上人绿坡
# ==================================================================
# 环廊沿本区**东缘**经过（SVG x 244.5~263.7），建筑退到 x ≤ 240。
print('[R5] ── 运动医疗区（曲面 + 绿坡看台）──')

# 5.1 体育馆：34.0 m —— 分区地标（曲面大跨）
#     西侧再挂一个两层附属体量，避免大跨体量孤零零一个盒子。
# ---- ★ V3 重排：体育馆与校医院旧版**包围盒重叠 −21.4 m**（体育馆西侧训练房
#      与校医院东缘撞在一起）。新布局：校医院退到西端、体育馆居中偏东、
#      训练房改挂**东侧**，三者沿 X 依次排开，净距 26 m，且训练房东缘
#      停在环廊净空线（X −240）以西 5 m。
_cx, _cy, _hx, _hy = Z(212.5, 374, 33.33, 28.33)
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
# 东侧附属：两层训练房（低一档，打破"一个盒子"）
# ★ 由"西侧"改到"东侧" —— 西侧会撞校医院（旧版 −21.4 m 重叠的元凶）
_wx = _cx + _hx + 8.0
B = merge(B, solid_body(_wx, _cy + 6.0, 13.0, 24.0, GZ, GZ + 9.5, 2,
                        win_frac=0.50, lang='sport', fin=False))
put(B, M_COPPER, rim_band(_wx, _cy + 6.0, 13.0, 24.0, GZ + 9.5, h=0.24, out=0.80))
flush(B, 'BLD_运动_体育馆')
print('[R5]   体育馆（分区地标）{:.0f}×{:.0f}×22.0（含 12.6~16.0 高侧窗带）'
      '+ 筒壳 13.5 → **总高 36.0 m**；东侧训练房 9.5 m'
      .format(2 * _hx, 2 * _hy))

# 5.2 校医院：27.3 m（裙房 7.5 + 主楼 11 + 塔 17）
_cx, _cy, _hx, _hy = Z(170, 374, 30, 30)
B = layered(_cx, _cy, _hx, _hy, GZ, shrink([
    (-8, -4, 48, 52, 11.0, 'hip', 3.2),
    (+22, +12, 30, 32, 17.0, 'hip', 2.8),
], 0.833), ph=7.5, pout=1.6, lang='sport', fin=False)
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
# ★ V3：南移 4 SVG px（9.6 m），把外圈绿坡顶（Y 283）与体育馆（Y 306.8）
#   的净距从 14.2 m 拉到 **23.8 m**，两栋不再"挨着"。
_cx, _cy, _hx, _hy = Z(198, 426, 84, 48)
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

# ---- ★ V3 重排：4 栋统一缩到 0.84 倍，2×2 围合中央庭院 ----
# 旧布局：公共教学楼↔教学B 6.5 m / ↔教学D 7.8 m / ↔教学C 9.6 m（全部 < 12 m）。
# 新布局：可用区 X 240~436.8（环廊净空线以东）196.8 m × Y 168~379.2（211.2 m），
#         2 列 × 2 行，**列净距 35.5 m / 行净距 49.9 m**。
_S6 = 0.84
_cx, _cy, _hx, _hy = Z(456.8, 374.8, 40 * _S6, 40 * _S6)      # NW 公共教学楼
_cx2, _cy2 = W(505.2, 374.8)[0], _cy                            # NE 教学B
_cx3, _cy3 = _cx, W(456.8, 429.2)[1]                            # SW 教学C
_cx4, _cy4 = _cx2, _cy3                                         # SE 教学D

# 6.1 公共教学楼：**分区地标** —— 裙房 8.5 + 主塔 22 + 玻璃灯笼 8 + 壳 4.4 = 42.9 m
B = layered(_cx, _cy, _hx, _hy, GZ, shrink([
    (-12, -10, 52, 50, 22.0, 'hip', 4.4, (42, 40, 8.0)),
    (+26, +22, 42, 42, 11.0, 'hip', 3.4),
], _S6), ph=8.5, pout=2.0, lang='teach', fin=False)
flush(B, 'BLD_教学_公共教学楼')
print('[R5]   公共教学楼（分区地标）裙房 8.5 + 主塔 22.0 + 玻璃灯笼 8.0 + 壳 4.4 '
      '→ **42.9 m**；副楼 11.0 + 壳 3.4 → 22.9 m')

# 6.2 教学 B：25.1 m
B = layered(_cx2, _cy2, 34 * _S6, 40 * _S6, GZ, shrink([
    (+6, -10, 54, 52, 14.0, 'hip', 3.6),
    (-20, +24, 38, 40, 7.0, 'flat', 0.0),
], _S6), ph=7.5, pout=1.6, lang='teach', fin=False)
flush(B, 'BLD_教学_教学B')
print('[R5]   教学B 裙房 7.5 + 主楼 14.0 + 壳 3.6 → 25.1 m；'
      '附楼 7.0 + 桁架 1.9 → 16.4 m')

# 6.3 教学 C：21.4 m（低一档）
B = layered(_cx3, _cy3, _hx, _hy, GZ, shrink([
    (-16, 0, 56, 78, 11.0, 'hip', 3.4),
    (+30, +16, 30, 42, 6.0, 'flat', 0.0),
], _S6), ph=7.0, pout=1.6, fin=True, fin_pitch=2.40)
flush(B, 'BLD_教学_教学C')
print('[R5]   教学C 裙房 7.0 + 主楼 11.0 + 壳 3.4 → 21.4 m；'
      '附楼 6.0 + 桁架 1.9 → 14.9 m')

# 6.4 教学 D：29.5 m（主楼 + 南向低翼）
B = layered(_cx4, _cy4, 34 * _S6, 40 * _S6, GZ, shrink([
    (0, -8, 70, 62, 18.0, 'hip', 4.0),
    (0, +32, 54, 38, 9.0, 'flat', 0.0),
], _S6), ph=7.5, pout=1.6, lang='teach', fin=False)
flush(B, 'BLD_教学_教学D')
print('[R5]   教学D 裙房 7.5 + 主楼 18.0 + 壳 4.0 → 29.5 m；'
      '南翼 9.0 + 桁架 1.9 → 18.4 m')

# 中央庭院：落在 2×2 的正中
_cty_x = (_cx + _cx2) * 0.5
_cty_y = (_cy + _cy3) * 0.5
_cty_w = (_cx2 - _hx) - (_cx + _hx)
_cty_h = (_cy - _hy) - (_cy3 + _hy)
emit_to('R5_教学区_中央庭院', M_PAVE, C_BLD,
        [box(_cty_x, _cty_y, _cty_w, _cty_h, 0.10, GZ + 0.06)], up=True)
print(f'[R5]   教学区 V3 重排：列净距 {_cty_w:.1f} m / 行净距 {_cty_h:.1f} m，'
      f'中央庭院 {_cty_w:.0f}×{_cty_h:.0f} m')


# ==================================================================
# 7. 生活区（南）—— 竹木 + 混凝土 · 底层架空共享客厅
# ==================================================================
# 环廊从本区北侧 27 m 外掠过（SVG y 448.5），全区可用；
# 并且**两处直接与环廊接驳**（V2："与环廊直接接驳"）。
print('[R5] ── 生活区（竹木 + 底层架空）──')

# ★ 六栋宿舍原本是**六个一模一样的 139×48 盒子** —— 远景里就是六片同高的平板，
#   这是"全是平房"最直接的来源。这里每栋都拆成**三段不同高度**，
#   且相邻两栋的高度序列**错开**（A 高→低、B 低→高），远看才有起伏。
# ---- ★ V3 重排：6 栋统一 106×38 m，2 列 × 2 行 ----
# 旧布局：宿舍A/B/D/研究生公寓 2×2 **两两贴合**（净距 −0.2~−4.6 m 即包围盒重叠），
#         宿舍E↔F −0.2 m、宿舍E↔食堂 −6.9 m、商业街↔宿舍F −5.9 m。
# 根因：生活区西用地 245×110 m = 26,950 m²，4 栋楼占 25,864 m² ⇒ **覆盖率 96%**。
# 新布局：楼体 139×48 → **106×38**（面积 −42%），
#         列净距 **32 m**（扣裙房外扩 2.0 后仍有 28 m，正好是一条林荫街）、
#         行净距 **30 m**（扣后 26 m，正好是一排庭院）。
#         半岛南端宽仅 768 m（岸线所限），**无法再向外扩地**，
#         所以这一区也走"缩楼体"路线（原计划的"扩地"在岸线处做不到）。
# ★ V3b（S2 路网）：西片整体 **+10 m**、东片整体 **−13 m**。
#   理由：滨水主路要从宿舍与岸线之间穿过，而半岛颈部岸线只有 X ±384、
#   宿舍外缘已到 −363 / +375 ⇒ 不足 9 m，路根本插不进去。
#   让位后西片 −350~−106、东片 111~362，主路在两侧各留 5.5~14 m 绿化带。
_DORM = (
    ('宿舍A',     216.25, 469.75, 44.17, 15.83, ((-35.5, 12.0), (0, 17.0), (+35.5, 9.0))),
    ('宿舍B',     216.25, 498.08, 44.17, 15.83, ((-35.5, 9.0), (0, 17.0), (+35.5, 12.0))),
    ('研究生公寓', 273.75, 469.75, 44.17, 15.83, ((-35.5, 10.0), (0, 28.0), (+35.5, 14.0))),
    ('宿舍D',     273.75, 498.08, 44.17, 15.83, ((-35.5, 14.0), (0, 10.0), (+35.5, 12.0))),
    ('宿舍E',     409.83, 469.75, 44.17, 15.83, ((-35.5, 14.0), (0, 24.0), (+35.5, 11.0))),
    ('宿舍F',     467.33, 469.75, 44.17, 15.83, ((-35.5, 11.0), (0, 14.0), (+35.5, 18.0))),
)
for _nm, _sx, _sy, _w, _d, _prof in _DORM:
    _cx, _cy, _hx, _hy = Z(_sx, _sy, _w, _d)
    _mid_w = _w * 2.4 * 0.36
    _side_w = (_w * 2.4 - _mid_w) * 0.5 - 1.0
    _parts = []
    for (_dx, _h), _sw in zip(_prof, (_side_w, _mid_w, _side_w)):
        _parts.append((_dx, 0, _sw, _d * 2.4 - 4.0, _h, 'hip', 3.4))
    B = layered(_cx, _cy, _hx, _hy, GZ, _parts, ph=4.20, pout=2.0,
                podium='stilt', lang='life', fin=True, fin_pitch=2.20)
    flush(B, f'BLD_生活_{_nm}')
    _tops = ' / '.join(f'{4.20 + _h + 3.4:.1f}' for _dx, _h in _prof)
    print(f'[R5]   {_nm} {2*_hx:.0f}×{2*_hy:.0f}  架空 4.2 + 三段主体 '
          f'（{" / ".join(str(_h) for _dx, _h in _prof)}）→ 三段标高 {_tops} m')

# 7.7 食堂：14.9 m（低层 + 大跨筒壳 + 低一档门厅）
_cx, _cy, _hx, _hy = Z(409.83, 498.08, 44.17, 15.83)
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
                        win_frac=0.50, lang='life', fin=True, fin_pitch=2.20))
put(B, M_COPPER, rim_band(_cx + _hx - 7.0, _cy, 7.0, 16.0, GZ + 5.60, h=0.22, out=0.60))
flush(B, 'BLD_生活_食堂')
print(f'[R5]   食堂 {2*_hx:.0f}×{2*_hy:.0f}×10.2 + 筒壳 4.2 → 14.9 m；'
      f'东侧门厅 5.6 m')

# 7.8 商业街：10.0 m（五级，最低一档；拆成两段高度）
_cx, _cy, _hx, _hy = Z(467.33, 498.08, 44.17, 15.83)
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
if _VERT:
    # ★ S4-a：原先是一圈 **1.70 m 高的竹木横带**（绕全楼一圈）——
    #   这正是 V3 要消灭的横条纹。改成**竹木竖翼**，暖色锚点一点不丢。
    put(B, M_BAMBOO, fin_ring(_cx, _cy, _hx + 1.0, _hy + 1.0, GZ + 4.60,
                              GZ + 6.85, pitch=2.20, fin_d=0.30, fin_t=0.12))
else:
    put(B, M_BAMBOO, box(_cx, _cy, 2 * _hx + 2.0, 2 * _hy + 2.0, 1.70, GZ + 5.15))
# 东段抬高一档（10.0），西段压到 7.6 —— 一条街也要有高低
put(B, M_CONC, box(_cx + 16.0, _cy, 2 * _hx - 32.0, 2 * _hy, 3.15, GZ + 6.85))
B = merge(B, barrel_roof(_cx + 16.0, _cy, _hx - 16.0, _hy + 1.6, GZ + 10.00, 2.60,
                         along='X', n1=10, n2=12, ribs=False))
B = merge(B, solid_body(_cx - 22.0, _cy, 18.0, _hy, GZ, GZ + 4.60, 1,
                        win_frac=0.50, lang='life', fin=True, fin_pitch=2.20))
put(B, M_COPPER, rim_band(_cx - 22.0, _cy, 18.0, _hy, GZ + 4.60, h=0.22, out=0.70))
flush(B, 'BLD_生活_商业街')
print(f'[R5]   商业街 {2*_hx:.0f}×{2*_hy:.0f}：东段 10.0 m / 西段 7.6 m'
      f'（低层长条 + 竹木格栅带）')

# 院落铺装：东西两片（中间是半岛南端的公共绿地，不铺）
for _tag, _sx in (('西', 245.17), ('东', 438.58)):
    _cx, _cy, _hx, _hy = Z(_sx, 483.92, 102.0 if _tag == '西' else 112.0, 48.33)
    emit_to(f'R5_生活区_{_tag}院落', M_PAVE, C_BLD,
            [box(_cx, _cy, 2 * _hx, 2 * _hy, 0.10, GZ + 0.06)], up=True)
# ★ V3：接驳桥落点跟着重排后的**列间街心**走
#   （旧落点 world −205.9 现在正好落进宿舍楼里 ⇒ 会把桥头插进房间）
# ★ V3 二次修正：落点由 Y 120 抬到 **Y 144**。
#   原因：桥是一条**斜线**，从环廊外缘 (−196, 154) 下到 (−228, 120)，
#   这条斜线在 X = −215.2 处只有 Y 133.5 —— 而研究生公寓的西北角是
#   (−215.2, **132.5**)，桥面半宽 2.5 + 竹木格栅外挑 ⇒ 实测刮掉楼角 20 m²。
#   落点抬到 Y 144 后，桥的 Y 值域是 144~154，**整条桥都在宿舍北缘之外**。
flush(link_bridge((258.37, 452.0), (244.97, 456.0)), 'R5_生活区_接驳桥西')
flush(link_bridge((420.38, 452.0), (438.58, 456.0)), 'R5_生活区_接驳桥东')
flush(link_bridge((247.3, 325.8), (238.0, 325.8)), 'R5_科技区_接驳桥')
print('[R5]   生活区 V3 重排：6 栋 106×38 m，列净距 32 m / 行净距 30 m')
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
if _VERT:
    print('[R5] ★★ S4-a 立面分型（V3 §3.1）：横条纹 → **竖向格构 + 实墙** —— '
          '通长水平条窗 → 竖长窗 / 楼板挑檐 → 删除 / 横向编织桁架带 → 删除；'
          '"格构"由通高竖柱的节奏 + 材质表达（清水 / 钢 / 铜 / 竹木）；'
          '幕墙 glass_body 同步改竖向（不再每层一块楼板带）')
    print('[R5]    五型：教学 清水格构+实墙(3.00 m) / 科研实验 浅灰+钢格构(3.20 m) / '
          '生活 白墙+竹木格栅(2.20 m·每层一樘) / 科技 玻璃幕+钢格构+铜柱(3.00 m) / '
          '运动 清水混凝土(3.60 m)')
else:
    print('[R5] ⚠ BR_R5_LANG=0：立面走**旧水平语言**（A/B 对照用，非交付版）')
