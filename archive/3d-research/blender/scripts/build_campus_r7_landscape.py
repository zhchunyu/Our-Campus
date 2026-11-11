# -*- coding: utf-8 -*-
"""build_campus_r7_landscape.py —— 山河大学 R7：**分区景观 + 地形起伏**（S4-b / S4-c）
=====================================================================================
由 `run_campus.py` 的 `build_extra` 串联在 `_entrance_all.py` 之后执行，**共享同一个 globals**。
挂载位置：`… r6 → _trees_hero → _teach_detail → _entrance_all → **r7_landscape** → palette_retune`

★ 为什么排在 **`_entrance_all.py` 之后**（而不是之前）：
  本脚本的落位完全由"占用栅格"决定 —— 栅格越完整，草坪越不会压到别人的东西。
  排在最后（除配色重标外）⇒ 栅格能看到主景树 / 教学区路缘标线 / 全园门廊踏步。
  反过来的代价（`_entrance_all` 看不到草坪）可以忽略：草坪被 `margin=2.5` 推离
  所有建筑 ≥2.5 m，而门廊踏步只在**贴墙**处取样，取到的仍是分区铺装。
★ 必须排在 **`palette_retune.py` 之前** —— 新材质要走统一配色出口。

依据 `规划调整方案V3.md`：
  §3.2 分区景观 —— 每区抠出 25~35% 做草坪 + 树阵广场 + 庭院水景；
                  目标：**硬质路面占分区地面 ≤ 60%**（现状 ~100%）
  §3.3 地形起伏（降险版）—— 缓丘 +1.5~3.0 m、坡比 1:8；
                  起伏只做在**绿地 / 边界 / 庭院**，**不动 R0~R3 落位基准**

────────────────────────────────────────────────────────────────
★★ 本脚本的核心方法论：**摆件位置不靠手算，靠量**
────────────────────────────────────────────────────────────────
现状是"分区铺装把整块地铺满"（`SITE_分区_*`，覆盖率 ~100%）。
要在上面抠绿地，就得知道**哪里真的空着** —— 而建筑、路网、环廊、桥、
运动场、门廊踏步全都在场地里，手算一遍必然漏。

所以本脚本：
  1. 先建一张 **2.0 m 占用栅格**（自上而下 `scene.ray_cast`），
     命中"**不可覆盖**"的东西即占用 —— 判据是**白名单**（见 `_coverable`）：
     只有**分区铺装 `M_区_*`** 与 **R5 的院落 / 中央广场 / 中央庭院**允许被草坪覆盖，
     其余一律占用。白名单比黑名单安全：将来新增一类构件，默认是"不覆盖"。
  2. 候选区 = **分区矩形内缩 5 m**（不再给窄带 —— 窄带抠不出 25~35%）；
  3. 用**最大矩形（直方图 + 单调栈）**反复抠出无占用矩形，占用格按 `margin` 膨胀；
  4. 只在抠出来的矩形里铺草 / 种树 / 放水景 / 起缓丘。
  ⇒ **摆件落在建筑里这种"静默失效"从机制上被排除**，不依赖我算得准。

★★ 三个必须记住的实现细节：
  · `depsgraph` **必须在模型建完之后再取**。写在脚本顶部（在别人之后、自己之前）
    才是对的；更早取会拿到空场景的 depsgraph，之后所有 `ray_cast` 返回 `ok=False`
    **且不报错**（本项目踩过）。
  · `ray_cast` 只认**取 depsgraph 那一刻**的场景 ⇒ 本脚本自己建的东西对它不可见，
    天然不会自我干扰；**最终验收栅格必须重新取一次 depsgraph**。
  · `emit_to()` / `new_obj()` 是**新建对象**，不是"替换"：同名再调一次会生成
    `名字.001`。所以**所有几何先进登记表 `_REG`，最后统一落地一次**
    —— 否则几百株树 = 几百个 `R7_景观_树干.NNN` 对象。
"""

import math
import random

import bpy
from mathutils import Vector

print('[R7] ── 分区景观 + 地形起伏（S4-b / S4-c）──')

# ==================================================================
# 0. 材质（**只引用不定义** —— 色值一律走 palette_retune.py 统一出口）
# ==================================================================
# ★ 本工程铁律：`bpy.data.materials.get()` 必须传**中文材质名**。
#   传变量名（如 `get('M_CONC')`）会**静默返回 None**。
def _M(name):
    _m = bpy.data.materials.get(name)
    if _m is None:
        raise RuntimeError('[R7] 找不到材质 %s —— 景观材质不能凭空建，'
                           '必须先由 site / stage 阶段建出来（否则配色重标漏掉它）' % name)
    return _m


M_LAWN = _M('M_草地')
M_WOOD = _M('M_林地')
M_WATER = _M('M_水')
M_MOUND = _M('M_土丘草')
M_SHRUB = _M('M_庭院绿植')
M_STONE = _M('M_石作')
M_TRUNK = _M('M_树干')
M_LEAF = _M('M_树叶')

# 景观构件的标高（★ 必须**高于**所有既有铺装/道路/标线，否则被静默盖住）
#   实测既有标高：分区铺装 Z_TOP+0.045 / 步道 +0.06 / 路缘 +0.07 / 标线 +0.09 /
#                 人行道 +0.06 / 运动场 +0.06~0.10 / 分区广场 +0.06
_LAWN_T = 0.16          # 草坪板厚 → 顶面 Z_TOP+0.16（比最高既有面高 7 cm，读成草畦）
_WATER_T = 0.10         # 水面板厚 → 顶面比草坪低 6 cm（沉在草坪里 = 池）
_RIM_H = 0.26           # 池岸石高

# ==================================================================
# 1. 幂等：先删自己上一轮留下的（同一 .blend 重跑时不叠加）
# ==================================================================
_DROP = ('R7_',)
_rm = 0
for _ob in list(bpy.data.objects):
    if _ob.name.startswith(_DROP):
        bpy.data.objects.remove(_ob, do_unlink=True)
        _rm += 1
if _rm:
    print('[R7] 清障：移除上一轮遗留 R7_ 对象 %d 个' % _rm)

# ==================================================================
# 2. 几何登记表 —— ★ 同名对象**只 emit 一次**
# ==================================================================
_REG = {}


def _push(name, mat, coll, parts, smooth=False, up=False):
    """把几何挂到登记表。`emit_to` 只在最后 `_flush_reg()` 里调一次。

    ★ 这不是优化，是**正确性**：`new_obj()` 每次新建对象，
      同名再调一次得到的是 `名字.001`。几百株树逐株 emit = 几百个对象。
    """
    if not parts:
        return
    _e = _REG.get(name)
    if _e is None:
        _REG[name] = {'mat': mat, 'coll': coll, 'parts': list(parts),
                      'smooth': smooth, 'up': up}
    else:
        _e['parts'].extend(parts)


def _flush_reg():
    for _n in sorted(_REG):
        _e = _REG[_n]
        emit_to(_n, _e['mat'], _e['coll'], _e['parts'],
                smooth=_e['smooth'], up=_e['up'])
    print('[R7] 落地 %d 个对象（合并后；未合并的话是几百个）' % len(_REG))


# ==================================================================
# 3. 占用栅格 —— "哪里不能盖"
# ==================================================================
# ★★ 白名单判据（不是黑名单）。只有这几类允许被草坪覆盖：
#   ① `SITE_分区_*`（挂 `M_区_*`）—— 就是本次要改造的那层铺装，占绝大部分；
#   ② `R5_*` 的院落 / 中央广场 / 中央庭院（挂 `M_广场铺装`）—— V3 §3.2 要的
#      "庭院水景"就落在这些院里。
#   其余（建筑 / 主路 / 步道 / 中轴 / 广场 / 环廊 / 桥 / 运动场 / 门廊踏步 /
#   主景树 …）**一律占用**。将来新增一类构件，默认落在"不覆盖"一侧 —— 安全。
_M_PAVE_OK = ('M_区_', 'M_广场铺装', 'M_庭院铺装', 'M_中央铺装', 'M_谷底铺装')
_KEEP_OBJ = (
    'BLD_', 'SITE_主路', 'SITE_步道', 'SITE_中轴', 'SITE_广场', 'SITE_塔院',
    'SITE_桥', 'SITE_滨水', 'SITE_驳岸', 'SITE_水口砂', 'SITE_远山',
    'R4_', 'R5_运动_', 'R6_', 'DTL_', 'ENT_', 'SITE_主景树', 'SITE_树',
)
_KEEP_KEY = ('接驳桥', '环廊', '树池', '花坛')

_SCENE = bpy.context.scene
# ★★ 取 depsgraph 的**位置**很关键：所有建模阶段之后、本脚本建东西之前。
_DG = bpy.context.evaluated_depsgraph_get()
_DOWN = Vector((0.0, 0.0, -1.0))
_RAY_Z = 150.0
_RAY_D = 320.0


def _hit(x, y):
    """自上而下打一条射线，返回 (命中对象名, 命中材质名)。"""
    _ok, _l, _n, _i, _ob, _mw = _SCENE.ray_cast(
        _DG, Vector((x, y, _RAY_Z)), _DOWN, distance=_RAY_D)
    if not _ok:
        return '', ''
    _mn = ''
    if _ob.data.materials and _ob.data.materials[0]:
        _mn = _ob.data.materials[0].name
    return _ob.name, _mn


def _coverable(on, mn):
    """这个点能不能盖草坪。★ 白名单。"""
    if not on:
        return False                      # 打不到东西 = 边界外/异常 ⇒ 保守当占用
    if on.startswith(_KEEP_OBJ) or any(k in on for k in _KEEP_KEY):
        return False
    if mn.startswith('M_区_'):
        return True                       # 分区铺装：本次改造对象
    if on.startswith('R5_') and mn in _M_PAVE_OK:
        return True                       # 五区院落 / 中央广场 / 中央庭院
    return False


# ==================================================================
# 4. 最大矩形抠图（直方图 + 单调栈）
# ==================================================================
def _max_rect(free, nx, ny):
    """全自由格矩阵里的**最大矩形**，返回 `(i0, j0, i1, j1)`。

    ★ 为什么不用"从四边往内缩"：那只对付得了贴边的障碍物；
      障碍物在候选区**中间**时会缩不动，直接报废一整块地。
      最大矩形法对"中间有楼"同样成立（它会把地劈成两半，取大的那半）。
    """
    best, best_a = None, 0
    h = [0] * nx
    for j in range(ny):
        for i in range(nx):
            h[i] = h[i] + 1 if free[j][i] else 0
        st = []
        for i in range(nx + 1):
            cur = h[i] if i < nx else 0
            start = i
            while st and st[-1][1] > cur:
                si, sh = st.pop()
                a = sh * (i - si)
                if a > best_a:
                    best_a, best = a, (si, j - sh + 1, i, j + 1)
                start = si
            st.append((start, cur))
    return best


def _clear_rects(x0, y0, x1, y1, cell=2.0, margin=2.5, min_area=500.0,
                 min_side=6.0, max_n=8, cap_area=None):
    """在候选区 `(x0,y0)-(x1,y1)` 里抠出**最大的若干块可覆盖矩形**（世界坐标）。

    `margin`   —— 把占用格向外膨胀这么多米，保证草坪不贴着楼根 / 路缘。
    `min_side` —— 短边下限（防止抠出 2 m × 200 m 的细条）。
    `cap_area` —— 累计面积上限（对应 V3 的"每区 25~35%"）。
    """
    nx = max(1, int(round((x1 - x0) / cell)))
    ny = max(1, int(round((y1 - y0) / cell)))
    cw, ch = (x1 - x0) / nx, (y1 - y0) / ny
    free = [[False] * nx for _ in range(ny)]
    for j in range(ny):
        for i in range(nx):
            _on, _mn = _hit(x0 + (i + 0.5) * cw, y0 + (j + 0.5) * ch)
            free[j][i] = _coverable(_on, _mn)

    _mr = int(math.ceil(margin / cell))
    if _mr > 0:
        _dil = [[False] * nx for _ in range(ny)]
        for j in range(ny):
            for i in range(nx):
                if free[j][i]:
                    continue
                for dj in range(-_mr, _mr + 1):
                    _jj = j + dj
                    if not (0 <= _jj < ny):
                        continue
                    for di in range(-_mr, _mr + 1):
                        _ii = i + di
                        if 0 <= _ii < nx:
                            _dil[_jj][_ii] = True
        free = [[not _dil[j][i] for i in range(nx)] for j in range(ny)]

    out, _acc = [], 0.0
    for _ in range(max_n):
        r = _max_rect(free, nx, ny)
        if r is None:
            break
        i0, j0, i1, j1 = r
        _w, _d = (i1 - i0) * cw, (j1 - j0) * ch
        if _w * _d < min_area or min(_w, _d) < min_side:
            break
        if cap_area is not None and _acc + _w * _d > cap_area:
            break
        out.append((x0 + i0 * cw, y0 + j0 * ch, x0 + i1 * cw, y0 + j1 * ch))
        _acc += _w * _d
        for j in range(j0, j1):
            for i in range(i0, i1):
                free[j][i] = False
    return out


# ==================================================================
# 5. 景观构件（★ 全部走 `_push`，不直接 emit）
# ==================================================================
_LAWN_BOX = []          # 草坪矩形累计（供统计）
_WOOD_BOX = []
_TREE_AT = []
_WATER_AT = []
_MOUNDS = 0


# ★★ 池子登记表：水景 / 树 / 灌木 / 缓丘**都要避开它**。
#   踩过：水景与缓丘都是"放在最大草坪块的正中" ⇒ 第一轮渲出来**山堆在池子里**。
#   根因是两处各自独立地取"rect[0] 的中心"，谁也不知道对方占了那块地。
#   ⇒ 把池子登记成一张表，后面所有落位都先查表。
_POOLS = []


def _in_pool(x, y, pad=1.5):
    for _px0, _py0, _px1, _py1 in _POOLS:
        if _px0 - pad <= x <= _px1 + pad and _py0 - pad <= y <= _py1 + pad:
            return True
    return False


def lawn(x0, y0, x1, y1, mat=None, dz=0.0):
    """铺一块草坪板（**厚板**，不是零厚度平面 —— 零厚度在掠射角下会露缝）。

    `dz` —— 在草坪顶面之上再抬多少。**同位置叠第二层草（林地色斑）时必须给正值**：
      两层板顶面同在 `Z_TOP+0.16` 就是**共面**，Cycles 会在两片之间随机取面 ⇒ 花斑。
    """
    _m = mat or M_LAWN
    _push('R7_景观_草坪_%s' % _m.name[2:], _m, C_GREEN,
          [box((x0 + x1) * 0.5, (y0 + y1) * 0.5, x1 - x0, y1 - y0,
               _LAWN_T + dz, Z_TOP)])
    (_LAWN_BOX if _m is M_LAWN else _WOOD_BOX).append((x0, y0, x1, y1))


def water(x0, y0, x1, y1):
    """庭院水景：水面 + 一圈池岸石 —— **抬高式水池**（不是下沉）。

    ★ 标高要算清楚（第一轮这里想错了）：水面盒从 `Z_TOP+0.10` 起、厚 0.10 ⇒
      顶面 `Z_TOP+0.20`，比草坪顶面（`Z_TOP+0.16`）**高 4 cm**；池岸石顶到
      `Z_TOP+0.26`。所以它读成"石边抬高水池"，不是"沉下去的池"。
      要真下沉就得把草坪板在池口挖洞（拆成四块），不值当 —— 抬高式本来也是常见做法。
    """
    _cx, _cy = (x0 + x1) * 0.5, (y0 + y1) * 0.5
    _w, _d = x1 - x0, y1 - y0
    _zt = Z_TOP + _LAWN_T - 0.06
    _push('R7_景观_水景', M_WATER, C_GREEN,
          [box(_cx, _cy, _w, _d, _WATER_T, _zt)])
    _push('R7_景观_池岸石', M_STONE, C_GREEN, [
        box(_cx, _cy - _d * 0.5 - 0.30, _w + 1.20, 0.60, _RIM_H, _zt - 0.10),
        box(_cx, _cy + _d * 0.5 + 0.30, _w + 1.20, 0.60, _RIM_H, _zt - 0.10),
        box(_cx - _w * 0.5 - 0.30, _cy, 0.60, _d, _RIM_H, _zt - 0.10),
        box(_cx + _w * 0.5 + 0.30, _cy, 0.60, _d, _RIM_H, _zt - 0.10),
    ])
    _POOLS.append((x0, y0, x1, y1))
    _WATER_AT.append((x0, y0, x1, y1))


def _sphere(cx, cy, cz, r, seg=8, ring=5):
    """低面数球（树冠）—— 与 `build_campus_site.py` 同一套，保持风格一致。"""
    vv, ff = [], []
    vv.append((cx, cy, cz + r))
    for iy in range(1, ring):
        ph = math.pi * iy / ring
        for ix in range(seg):
            th = math.tau * ix / seg
            vv.append((cx + r * math.sin(ph) * math.cos(th),
                       cy + r * math.sin(ph) * math.sin(th),
                       cz + r * math.cos(ph)))
    vv.append((cx, cy, cz - r))
    for ix in range(seg):
        ff.append([0, 1 + ix, 1 + (ix + 1) % seg])
    for iy in range(ring - 2):
        a0 = 1 + iy * seg
        b0 = a0 + seg
        for ix in range(seg):
            j = (ix + 1) % seg
            ff.append([a0 + ix, b0 + ix, b0 + j, a0 + j])
    last = 1 + (ring - 2) * seg
    for ix in range(seg):
        ff.append([len(vv) - 1, last + (ix + 1) % seg, last + ix])
    return vv, ff


def _tree_here(x, y):
    """该点是否已经站着别人的树（主景树 / 低模树）—— 是就别再种。"""
    _on, _ = _hit(x, y)
    return ('树' in _on)


def tree(x, y, h=9.0, r=3.6, seed=0.0):
    """一株低模树（树干 + 多球冠）。

    ★ 树干半径必须远小于冠幅（`0.105 r`）：用 `0.30 r` 渲出来是一排电线杆（场地阶段的教训）。
    ★ 冠底压到 `0.48 h` 并让球心向外铺开，避免"一根杆顶一个球"的棒棒糖剪影。
    """
    _rng = random.Random(int(seed * 1e6) & 0x7FFFFFFF)
    _th = r * 0.105
    _tv, _tf = [], []
    for i in range(6):
        a = math.tau * i / 6.0
        _tv.append((x + _th * math.cos(a), y + _th * math.sin(a), Z_TOP))
        _tv.append((x + _th * math.cos(a), y + _th * math.sin(a), Z_TOP + h * 0.62))
    for i in range(6):
        j = (i + 1) % 6
        _tf.append([2 * i, 2 * j, 2 * j + 1, 2 * i + 1])
    _lv, _lf = [], []
    for _ in range(11 if _rng.random() < 0.5 else 14):
        a = _rng.uniform(0.0, math.tau)
        rr = _rng.uniform(0.0, r * 0.62)
        cz = Z_TOP + h * _rng.uniform(0.48, 0.88)
        cr = r * _rng.uniform(0.34, 0.50)
        sv, sf = _sphere(x + rr * math.cos(a), y + rr * math.sin(a), cz, cr)
        _o2 = len(_lv)
        _lv.extend(sv)
        _lf.extend([[i + _o2 for i in f] for f in sf])
    _push('R7_景观_树干', M_TRUNK, C_GREEN, [(_tv, _tf)])
    _push('R7_景观_树冠', M_LEAF, C_GREEN, [(_lv, _lf)], smooth=True)
    _TREE_AT.append((x, y))


def tree_row(x0, y0, x1, y1, step=14.0, h0=7.5, h1=10.5, r0=3.0, r1=4.2,
             jitter=1.8, seed=0):
    """在草坪矩形里按网格 + 抖动种树（**树阵广场**，不是等距点阵）。

    ★ 树的落点必须在**已抠出来的草坪矩形**内 —— 否则又回到"手算位置"的老路。
    """
    _rng = random.Random(seed)
    _w, _d = x1 - x0, y1 - y0
    _nx = max(1, int(_w / step))
    _ny = max(1, int(_d / step))
    for _i in range(_nx):
        for _j in range(_ny):
            _px = x0 + _w * (_i + 0.5) / _nx + _rng.uniform(-jitter, jitter)
            _py = y0 + _d * (_j + 0.5) / _ny + _rng.uniform(-jitter, jitter)
            _px = min(max(_px, x0 + 2.5), x1 - 2.5)
            _py = min(max(_py, y0 + 2.5), y1 - 2.5)
            if _tree_here(_px, _py) or _in_pool(_px, _py):
                continue
            tree(_px, _py, _rng.uniform(h0, h1), _rng.uniform(r0, r1), _rng.random())


def shrub_cluster(x0, y0, x1, y1, n=6, seed=0):
    """灌木丛（低矮方体，成组，不点阵）。"""
    _rng = random.Random(seed)
    _g = []
    for _ in range(n * 2):
        if len(_g) >= n:
            break
        _px = _rng.uniform(x0, x1)
        _py = _rng.uniform(y0, y1)
        if _in_pool(_px, _py, pad=1.0):
            continue
        _s = _rng.uniform(2.2, 3.6)
        _g.append(box(_px, _py, _s, _s * _rng.uniform(0.7, 1.3),
                      _rng.uniform(0.9, 1.8), Z_TOP + 0.02))
    _push('R7_景观_灌木', M_SHRUB, C_GREEN, _g, smooth=True)


def mound(cx, cy, h, r, rings=4, seg=24):
    """缓丘（V3 §3.3 降险版）：**独立体量**，底面齐 `Z_TOP`。

    ★★ 为什么**不做"位移地形平面顶点"**：
      本工程的地形（`SITE_半岛地形`）是**零厚度平面**，建筑 / 路网 / 树全部按
      `Z_TOP` 落位。动地形顶点 = 建筑悬空或埋进土里、树浮起来，而且**不会报错**。
      V3 §3.3 自己写的也是"降险版：不动 R0~R3 落位基准"。
    ⇒ 改用**独立缓丘体**（`M_土丘草` —— 本工程已有这条语言：案山 / 水口砂）。
      丘落在**已抠出来的草坪里**，对既有构件零影响。

    `h : r = 1 : 8`（V3 指定的坡比）。顶部收到 `0.10 r` 并加一个顶心点，
    多环 + `smooth=True` ⇒ 读成土坡，不是方锥。
    """
    _vs, _fs = [], []
    for k in range(rings + 1):
        t = k / float(rings)
        rr = r * (1.0 - t) + r * 0.10 * t
        zz = Z_TOP + h * (t ** 0.85)
        for i in range(seg):
            a = math.tau * i / seg
            _vs.append((cx + rr * math.cos(a), cy + rr * math.sin(a), zz))
    for k in range(rings):
        a0, b0 = k * seg, (k + 1) * seg
        for i in range(seg):
            j = (i + 1) % seg
            _fs.append([a0 + i, a0 + j, b0 + j, b0 + i])
    _vs.append((cx, cy, Z_TOP + h))                       # 顶心
    _ap = len(_vs) - 1
    _top = rings * seg
    for i in range(seg):
        _fs.append([_top + i, _top + (i + 1) % seg, _ap])
    _vs.append((cx, cy, Z_TOP))                           # 底心（封底 ⇒ 闭合体，recalc 才可靠）
    _bp = len(_vs) - 1
    for i in range(seg):
        _fs.append([_bp, (i + 1) % seg, i])
    _push('R7_地形_缓丘', M_MOUND, C_GREEN, [(_vs, _fs)], smooth=True)


# ==================================================================
# 6. 分区表（世界坐标）
# ==================================================================
# 由 `build_campus_site.py` 的 ZONES 换算：W(sx,sy)=((sx−340)×2.4, (516−sy)×2.4)
#   科技区    X[-444.0, -124.8]  Y[417.6, 643.2]    实验区  X[ 124.8, 436.8] Y[417.6, 643.2]
#   运动医疗区 X[-444.0, -124.8]  Y[168.0, 379.2]    教学区  X[ 124.8, 436.8] Y[168.0, 379.2]
#   生活区西  X[-360.0, -100.8]  Y[ 24.0, 134.4]    生活区东 X[ 108.0, 364.8] Y[ 24.0, 134.4]
#   中轴人文区 X[-110.4, 110.4]  Y[153.6, 700.8]  ← **不做**（V3 §4：R0~R3 不动）
_ZONE_RECT = {
    '科技区': (-444.0, 417.6, -124.8, 643.2),
    '实验区': (124.8, 417.6, 436.8, 643.2),
    '运动医疗区': (-444.0, 168.0, -124.8, 379.2),
    '教学区': (124.8, 168.0, 436.8, 379.2),
    '生活区西': (-360.0, 24.0, -100.8, 134.4),
    '生活区东': (108.0, 24.0, 364.8, 134.4),
}

_INSET = 2.0            # 候选区 = 分区矩形内缩（环路本身在 _KEEP 里，栅格会自己避开）
_CELL = 1.0             # 占用栅格步长（★ 必须小于**最窄的自由条带**，否则窄条整条消失）
_MARGIN = 1.0           # 占用膨胀（草坪离楼 / 路 ≥1.0 m —— 就是常见的草畦退界）
_MIN_AREA = 200.0       # 单块最小面积
_MIN_SIDE = 4.0         # 单块短边下限
_MAX_N = 14             # 每区最多抠几块
_CAP_FRAC = 0.36        # 每区草坪面积上限（V3 §3.2：25~35%）

# 水景：只在**指定分区的最大草坪块**里放，尺寸给上限，超出就缩
# ★ 第一轮给 20×12 太小 —— 在 89×69 m 的草坪里读成一个小水洼。
#   按"草坪的 1/4 左右"给，池子才立得住（且仍留出四周的草坪）。
_WATER_WANT = {
    '科技区': (30.0, 19.0),
    '教学区': (26.0, 16.0),
    '生活区西': (20.0, 12.0),
    '生活区东': (20.0, 12.0),
}

# ==================================================================
# 7. 抠图
# ==================================================================
print('[R7] 占用栅格 + 最大矩形抠图（%.1f m 格 / margin %.1f m）…' % (_CELL, _MARGIN))


def _cover_area(x0, y0, x1, y1, cell):
    """**未膨胀**的可覆盖面积 —— 用来判断"抠得少"是"本来就没地"还是"被 margin 吃掉了"。"""
    _nx = max(1, int(round((x1 - x0) / cell)))
    _ny = max(1, int(round((y1 - y0) / cell)))
    _cw, _ch = (x1 - x0) / _nx, (y1 - y0) / _ny
    _c = 0
    for j in range(_ny):
        for i in range(_nx):
            _on, _mn = _hit(x0 + (i + 0.5) * _cw, y0 + (j + 0.5) * _ch)
            if _coverable(_on, _mn):
                _c += 1
    return _c * _cw * _ch


_PATCHES = {}
for _zone, (_zx0, _zy0, _zx1, _zy1) in _ZONE_RECT.items():
    _area = (_zx1 - _zx0) * (_zy1 - _zy0)
    _cx0, _cy0, _cx1, _cy1 = _zx0 + _INSET, _zy0 + _INSET, _zx1 - _INSET, _zy1 - _INSET
    _raw = _cover_area(_cx0, _cy0, _cx1, _cy1, _CELL)
    _rects = _clear_rects(_cx0, _cy0, _cx1, _cy1,
                          cell=_CELL, margin=_MARGIN, min_area=_MIN_AREA,
                          min_side=_MIN_SIDE, max_n=_MAX_N,
                          cap_area=_area * _CAP_FRAC)
    _PATCHES[_zone] = _rects
    _a = sum((r[2] - r[0]) * (r[3] - r[1]) for r in _rects)
    print('[R7]   %-8s 可覆盖 %7.0f m²（%.1f%%）⇒ 抠出 %2d 块 %7.0f m²（%.1f%%）'
          % (_zone, _raw, 100.0 * _raw / _area, len(_rects), _a, 100.0 * _a / _area))
    for _k, _r in enumerate(_rects):
        print('[R7]       #%d  X[%7.1f, %7.1f]  Y[%7.1f, %7.1f]  %.1f × %.1f m'
              % (_k, _r[0], _r[2], _r[1], _r[3], _r[2] - _r[0], _r[3] - _r[1]))

# ==================================================================
# 8. 铺草 + 树阵 + 水景
# ==================================================================
print('[R7] 铺草 / 树阵 / 水景…')
for _zone, _rects in _PATCHES.items():
    _rects = sorted(_rects, key=lambda r: -(r[2] - r[0]) * (r[3] - r[1]))
    _PATCHES[_zone] = _rects
    # ★ 顺序很关键：**先定水景、再铺草种树**。反过来就会出现"山堆在池子里"。
    _want = _WATER_WANT.get(_zone)
    if _want and _rects:
        x0, y0, x1, y1 = _rects[0]
        _w = min(_want[0], (x1 - x0) - 8.0)
        _d = min(_want[1], (y1 - y0) - 8.0)
        if _w >= 8.0 and _d >= 5.0:
            _cx, _cy = (x0 + x1) * 0.5, (y0 + y1) * 0.5
            water(_cx - _w * 0.5, _cy - _d * 0.5, _cx + _w * 0.5, _cy + _d * 0.5)
            print('[R7]   %-8s 水景 %.0f×%.0f m @ (%.0f, %.0f)'
                  % (_zone, _w, _d, _cx, _cy))
    for _k, (x0, y0, x1, y1) in enumerate(_rects):
        _w, _d = x1 - x0, y1 - y0
        lawn(x0, y0, x1, y1, M_LAWN)
        # 窄条（< 9 m）铺草但**不种树** —— 9 m 宽的草带里塞树会把通道堵死
        if _w >= 9.0 and _d >= 9.0:
            tree_row(x0, y0, x1, y1, step=12.0, h0=7.5, h1=10.5,
                     r0=3.0, r1=4.2, jitter=1.6, seed=(hash(_zone) % 997) + _k)
        if _w >= 14.0 and _d >= 14.0:
            shrub_cluster(x0 + 2.0, y0 + 2.0, x1 - 2.0, y1 - 2.0,
                          n=4, seed=(hash(_zone) % 991) + _k * 7)

# 林地色斑（深一档）—— 让草坪不是一个平色块。
# ★ 第一轮做成"整块内缩 7 m 的深绿矩形"，实拍是一块**生硬的大深绿**，
#   和周围的草坪、池子、缓丘三种绿挤在一起，谁也不像谁的邻居。
#   改成**环池种植带**（池子外扩 `_BED`）—— 语义清楚："水池 + 岸边树丛"。
_BED = 5.5
for _zone, _rects in _PATCHES.items():
    for _k, (x0, y0, x1, y1) in enumerate(_rects):
        for _px0, _py0, _px1, _py1 in _POOLS:
            if not (_px0 >= x0 - 1.0 and _px1 <= x1 + 1.0
                    and _py0 >= y0 - 1.0 and _py1 <= y1 + 1.0):
                continue
            _bx0, _by0 = max(x0, _px0 - _BED), max(y0, _py0 - _BED)
            _bx1, _by1 = min(x1, _px1 + _BED), min(y1, _py1 + _BED)
            if _bx1 - _bx0 >= 8.0 and _by1 - _by0 >= 8.0:
                lawn(_bx0, _by0, _bx1, _by1, M_WOOD, dz=0.02)

# ==================================================================
# 9. 地形起伏（V3 §3.3 降险版）
# ==================================================================
print('[R7] 缓丘（坡比 1:8）…')
for _zone, _rects in _PATCHES.items():
    _n_here = 0
    for _k, (x0, y0, x1, y1) in enumerate(_rects):
        if _n_here >= 2:
            break
        _w, _d = x1 - x0, y1 - y0
        # ★ 第一轮用 1.5~2.5 m：1:8 坡比下底半径只有 12~20 m，实拍**读成一个平的浅色圆盘**，
        #   完全不像土坡。V3 §3.3 允许到 3.0 m ⇒ 想要 2.0 / 2.5 / 3.0 m。
        # ★ 但**想要 ≠ 放得下**：1:8 坡比下底直径 = 16h，3.0 m 要 48 m 空地。
        #   所以按块大小**自适应降高**（下限 1.5 m）—— 比"统一给一个值、
        #   小地块全被跳过"更合理：小的草地也该有起伏，只是小一点。
        _want_h = 2.0 + 0.5 * ((_k + len(_zone)) % 3)
        _h_max = (min(_w, _d) - 6.0) / 16.0
        _h = min(_want_h, _h_max)
        if _h < 1.5:
            continue
        _r = _h * 8.0                                  # 坡比 1:8
        # ★ 丘与丘错开，且**必须避开池子**（`_in_pool`）—— 否则山压在水上
        _cand = [((x0 + x1) * 0.5, (y0 + y1) * 0.5),
                 ((x0 + x1) * 0.5, y0 + _r + 3.0),
                 (x0 + _r + 3.0, (y0 + y1) * 0.5),
                 (x1 - _r - 3.0, (y0 + y1) * 0.5)]
        _hit_pt = None
        for _px, _py in _cand:
            if (x0 + _r + 1.0 <= _px <= x1 - _r - 1.0
                    and y0 + _r + 1.0 <= _py <= y1 - _r - 1.0
                    and not _in_pool(_px, _py, pad=_r * 0.6)):
                _hit_pt = (_px, _py)
                break
        if _hit_pt is None:
            continue
        mound(_hit_pt[0], _hit_pt[1], _h, _r)
        _n_here += 1
        _MOUNDS += 1
        print('[R7]   %-8s #%d 缓丘 高 %.1f m / 底半径 %.0f m @ (%.0f, %.0f)'
              % (_zone, _k, _h, _r, _hit_pt[0], _hit_pt[1]))
print('[R7] 缓丘共 %d 处' % _MOUNDS)

# ==================================================================
# 10. 落地
# ==================================================================
_flush_reg()

# ==================================================================
# 11. 验收栅格 —— 重新取 depsgraph（★ 必须，否则看不到本脚本建的东西）
# ==================================================================
bpy.context.view_layer.update()
_DG = bpy.context.evaluated_depsgraph_get()

_GRASS_M = ('M_草地', 'M_林地', 'M_土丘草', 'M_草坪浅', 'M_绿坡')
# ★ 树冠 / 灌木 / 树池 —— 它们**盖住地面**，但底下的地面是什么得另打一条低射线才知道。
#   第一版把"命中树冠"直接归到"硬质"，于是**刚种完树的那块草坪反而变"硬"了**
#   （生活区西：铺了 4371 m² 草，只量出 3075 m² 绿地）—— 判据自己把成果吃掉了。
_SHADE_M = ('M_树叶', 'M_树干', 'M_树皮', 'M_苔藓', 'M_庭院绿植', 'M_树池')
_STEP = 2.5
_LOW_Z = Z_TOP + 1.40     # 低空射线：树冠底 ≥ Z_TOP+1.5 ⇒ 从这里打下去能穿冠看地
print('[R7] ── 验收栅格（步长 %.1f m；高空判建筑 + 低空 %.1f m 判地面）──'
      % (_STEP, _LOW_Z))


def _hit_at(x, y, z):
    _ok, _l, _n, _i, _ob, _mw = _SCENE.ray_cast(
        _DG, Vector((x, y, z)), _DOWN, distance=_RAY_D)
    if not _ok:
        return '', ''
    _mn = ''
    if _ob.data.materials and _ob.data.materials[0]:
        _mn = _ob.data.materials[0].name
    return _ob.name, _mn


def _cat(x, y):
    """一格地面的类别 + 这一格的**表层是不是 R7 自己铺的**。

    · 高空射线（`_RAY_Z`）只用来判"是不是建筑" —— 建筑从 `Z_TOP` 起，
      低空射线会从**建筑内部**穿过，判不出墙；
    · 低空射线（`Z_TOP+1.4`）用来判地面 —— 它低于树冠底、高于所有铺装/草坪，
      所以树冠不会挡住它，量到的就是**真正的地面材质**。

    ★ 返回 `is_r7` 的理由：`运动医疗区` 的"绿地"里有 13000 m² 是**既有体育场草地**
      （`R5_运动_体育场场地` / `绿坡` 都是 `M_草地`），不是本轮成果。
      不分开报，就等于把别人的成绩算在自己头上。
    """
    _on, _ = _hit_at(x, y, _RAY_Z)
    if _on.startswith('BLD_'):
        return 'bld', False
    _on2, _mn2 = _hit_at(x, y, _LOW_Z)
    if _on2.startswith('BLD_'):
        return 'bld', False
    if not _on2:
        return 'none', False
    _r7 = _on2.startswith('R7_')
    if _mn2 in _GRASS_M:
        return 'grass', _r7
    if _mn2 in _SHADE_M:
        return 'shade', _r7
    if _mn2.startswith('M_水'):
        return 'water', _r7
    return 'hard', _r7


print('[R7] %-10s %9s %9s %9s %8s %8s %8s %8s'
      % ('分区', '分区面积', '建筑', '地面', '草+水', '树冠下', '绿地%', '硬质%'))
_TOT_G, _TOT_S, _TOT_H, _TOT_R7 = 0.0, 0.0, 0.0, 0.0
for _zone, (zx0, zy0, zx1, zy1) in _ZONE_RECT.items():
    _nx = int((zx1 - zx0) / _STEP)
    _ny = int((zy1 - zy0) / _STEP)
    _cell_a = _STEP * _STEP
    _n = {'bld': 0, 'grass': 0, 'shade': 0, 'water': 0, 'hard': 0, 'none': 0}
    _n_r7 = 0
    _laid = sum((r[2] - r[0]) * (r[3] - r[1]) for r in _PATCHES[_zone])
    for _j in range(_ny):
        for _i in range(_nx):
            _c, _isr7 = _cat(zx0 + (_i + 0.5) * _STEP, zy0 + (_j + 0.5) * _STEP)
            _n[_c] += 1
            if _isr7 and _c in ('grass', 'shade', 'water'):
                _n_r7 += 1
    _zone_a = (zx1 - zx0) * (zy1 - zy0)
    _ground = (_n['grass'] + _n['shade'] + _n['water'] + _n['hard']) * _cell_a
    _green = (_n['grass'] + _n['shade'] + _n['water']) * _cell_a
    _hard = _n['hard'] * _cell_a
    _TOT_G += _green
    _TOT_S += _ground
    _TOT_H += _hard
    _TOT_R7 += _n_r7 * _cell_a
    print('[R7] %-10s %9.0f %9.0f %9.0f %8.0f %8.0f %7.1f%% %7.1f%%'
          % (_zone, _zone_a, _n['bld'] * _cell_a, _ground,
             (_n['grass'] + _n['water']) * _cell_a, _n['shade'] * _cell_a,
             100.0 * _green / _ground if _ground else 0.0,
             100.0 * _hard / _ground if _ground else 0.0))
    # ★ 对账：**抠出的矩形面积 vs 栅格量到的绿地面积 vs 其中 R7 新铺的**。
    #   抠出 > 量到 ⇒ 差值基本是 2.5 m 栅格的边缘量化（**保守**，少算自己）；
    #   量到 > 抠出 ⇒ 多出来的是**既有草地**（如体育场场地）。
    print('[R7]   ↳ %-8s 抠出矩形 %7.0f m² ／ 量到绿地 %7.0f m² ／ 其中 R7 新铺 %7.0f m²'
          % (_zone, _laid, _green, _n_r7 * _cell_a))
print('[R7] %-10s %9s %9s %9.0f %8.0f %8s %7.1f%% %7.1f%%'
      % ('合计', '', '', _TOT_S, _TOT_G, '',
         100.0 * _TOT_G / _TOT_S if _TOT_S else 0.0,
         100.0 * _TOT_H / _TOT_S if _TOT_S else 0.0))
print('[R7] 其中 **R7 本轮新铺** %.0f m²（占地面 %.1f%%；其余绿地是既有草地 —— 体育场场地 / 绿坡 / 教学区草畦）'
      % (_TOT_R7, 100.0 * _TOT_R7 / _TOT_S if _TOT_S else 0.0))
print('[R7] 景观构件：草坪 %d 块 / 林地色斑 %d 块 / 树 %d 株 / 水景 %d 处 / 缓丘 %d 处'
      % (len(_LAWN_BOX), len(_WOOD_BOX), len(_TREE_AT), len(_WATER_AT), _MOUNDS))
print('[R7] 目标：硬质 ≤ 60%%（V3 §3.2）')
