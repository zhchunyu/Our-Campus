# -*- coding: utf-8 -*-
"""
_entrance_all.py —— 全园楼栋「入口门廊」统一补强
=====================================================================================
挂在 `make_render_configs.py` 的 `CAMPUS_TAIL`（**r0~r6 每个阶段都挂**），
排在 `_teach_detail.py` 之后、`build_campus_r7_landscape.py` 之前、`palette_retune.py` 之前
（**重标恒为末项**，否则新加的几何拿不到 V2.6 配色）。
★ 2026-09-26（S5）从"只挂 r5"提到"全阶段"：只挂 r5 会让**成图集内部割裂** ——
R0~R4 的楼没有门廊、R5/R6 有，同一栋楼在两个阶段长得不一样。

## 为什么做

用户评审意见「整体视觉风格不够美观、不便于对外展示」，病根之一是
**全园 30 栋楼一处入口都没有** —— 光秃的体量 + 一圈通高玻璃带，
读起来是"未完工的盒子"，不是"能走进去的楼"。
`_teach_detail.py` 已经把这条语言在**教学区 4 栋**上跑通（门廊 / 楼梯塔 / 女儿墙），
本脚本只把其中的「入口」这一件事**推广到全园其余楼栋**：

    门廊 4 柱 + 雨篷（混凝土板 + 铜压边）+ 玻璃门 + 铜门框 + 入口平台 + 3~6 级踏步

## ★★ 一切靠射线实测，不写死任何一个数

`_teach_detail.py` 的朝向是**手填**的 —— 教学区只有 4 栋、开放面一眼看得出，所以写得对。
全园 30 栋靠手填必然出错，而且**楼一挪位置就静默失效**（不报错、只是门开在墙上）。
本脚本对每栋楼做三件事，全部实测：

  ① **哪一面有路**：对该栋四个面各取 5 个采样点，沿法线外移 5/8/11/14 m 向下打射线，
     命中**非 `BLD_*` 的铺装**才算。分两级 —— 通行铺装（主路/步道/御道/广场）优先，
     分区地坪（`M_区_*`）次之。★ 外探取**一串**距离而不是一个：体育馆最近的路在
     9.1 m 外的院角，只探 6 m 会整栋漏掉（实测首轮 7 栋落选，5 栋是这个原因）。

  ② **墙到底在哪**：从面外 40 m 处、**门的半高**向内打一条水平射线，第一处 `BLD_*`
     命中就是墙面。★ 这一条是必须的 —— 簇 bbox 的外缘**经常不是墙**：
     图书馆南缘是**丹陛（大台阶）的趾**（真墙在 11 m 里），
     美术馆北缘是**屋面出檐的投影**（真墙在 8 m 里）。
     按 bbox 摆门廊，玻璃门会悬在半空（实拍确认过图书馆那一例）。
     取门的半高而不是低处，是因为低处会把台基/踏步认成墙。

  ③ **门廊落在多高的地面上**：在墙面处向下打射线，得到墙基标高 `z_base`。
     它决定入口平台抬多高、踏步做几级（`z_base` 高过地坪 2.0 m 的面直接放弃 ——
     那是台基顶面，门廊会被埋进台基里）。

## ★ 已知取舍

带**台基**的楼（大礼堂 / 美术馆 / 图书馆），门廊落在台基外皮上、平台抬到台基顶，
读作"台基层入口"，与各自的丹陛 / 大台阶并存不冲突。
这是**刻意不做布尔开洞**的代价（R5 建成的墙不能再切），也是 `_teach_detail.py`
当初就定下的策略：用**凸出的体量**读出入口，玻璃门贴墙当洞口。
"""
import json
import math
import os

from mathutils import Vector

print('[ENT] ── 全园入口门廊补强 ──')

# ==================================================================
# 0. `put()` / `flush()` —— **本地兜底定义（从 `build_campus_r5.py` 抄来）**
# ==================================================================
# ★★ 本脚本原先直接用 `put()` 和 `flush()`，而这两个**只在 `build_campus_r5.py` 里定义**。
#    起因：本脚本最早只挂在 `STAGE_EXTRA['r5']`，那时 r5 一定在链里，所以从没报过错。
#    S5 把它提到 `CAMPUS_TAIL`（**所有阶段**）之后，r0~r4 的链里没有 r5 ⇒ 连环炸两次：
#        ① `NameError: name 'put' is not defined`
#        ② 补上 put 之后：`TypeError: flush() missing 1 required positional argument: 'coll_target'`
#           —— 因为 **`flush` 这个名字在工程里有两种完全不同的语义**：
#             · `build_campus_site.py:flush(name, mat, coll_target, ...)`  把 `BUF[mat]` 落地成一个对象
#             · `build_campus_r5.py:flush(B, prefix, coll=C_BLD)`          把"材质→几何表"整批落地
#           r5 阶段把它**同名覆盖**掉了；r0~r4 没有 r5 ⇒ 本脚本拿到的是**另一个** `flush`。
#    ★ 教训（"跨脚本隐式依赖"的标准形态）：靠后一个阶段碰巧定义了同名函数才能跑通，
#      链条一变短就炸，而且报错位置离病因很远（报"缺一个参数"，真因是"拿到的是别人的同名函数"）。
#      **一个脚本要用什么，就应该自己带**；同名不同义的函数更不该靠"谁后跑谁生效"来区分。
#    ★ 与 `build_campus_r5.py` 的实现**逐字一致**（r5/r6 链里会被同名覆盖，行为不变）。
def put(B, mat, geos):
    """按材质分桶 —— 一个 emit_to 一个材质（R3 的"整条脊变成胶合木色"就是这个坑）。"""
    _l = B.setdefault(mat, [])
    if isinstance(geos, list):
        _l.extend(geos)
    else:
        _l.append(geos)


def flush(B, prefix, coll=C_BLD):
    """把"材质对象 → 几何表"整批落地成对象（桶的 key 是**材质对象**，不是字符串）。

    ★ 要拼对象名必须走 `mat.name`。写 `mat[2:]` 会报
      "only strings are allowed as keys of ID properties"。
    """
    for mat, gs in B.items():
        if gs:
            emit_to(f'{prefix}_{mat.name[2:]}', mat, coll, gs)
    B.clear()

# 教学区 4 栋已由 `_teach_detail.py` 做过（门廊 + 楼梯塔 + 女儿墙），跳过。
_SKIP_PREFIX = ('BLD_教学_',)
# 景园构筑物 / 山门 / 商业街：不是"能走进去的独栋楼"，门廊对它们不成立。
_SKIP_KEY = ('案山', '智谷', '台地', '坐凳', '侧壁', '土丘', '校门', '商业街')

# 什么算"有硬化地面" —— **两级**（材质名先 grep `make_mat('M_` 核对过）：
#   ① 真正的通行铺装（主路 / 步道 / 御道 / 广场 / 庭院 / 中央 / 谷底）
#   ② 分区地坪（`M_区_*`）—— 它也是**可达的硬化地面**，但几乎铺满全校，
#      只认它等于"每一面都有路"，所以降一级，只在①一个都没有时才用。
#   ★ 为什么必须留②：人文书院四面 5 m 处都是 `M_区_人文` 分区地坪，
#     真正的步道在 15 m 外 —— 而**射线只返回最近的一次命中**，分区地坪把步道挡在后面，
#     四级全判"无铺装"，整栋楼没有入口。这是**判据口径**问题，不是规划缺陷。
_ROAD_MATS = ('M_主路沥青', 'M_步道', 'M_中轴铺装')
_PLAZA_MATS = ('M_广场铺装', 'M_庭院铺装', 'M_中央铺装', 'M_谷底铺装')
_DIST_MATS = ('M_区_人文', 'M_区_科技', 'M_区_教学',
              'M_区_生活', 'M_区_实验', 'M_区_运动')

_OFFS = (5.0, 8.0, 11.0, 14.0, 18.0, 22.0)   # 外探距离串
_FAR = 40.0                      # 找墙射线的起点（面外）
_MAXSET = 30.0                   # 允许的最大进深
# ★ 由 2.0 放宽到 3.5（2026-09-25 实测）。2.0 是**误诊**：当时 `z_base` 量的是自家屋面
#   （楼高），所有楼都"墙基过高"；修好取法后真正的最大值是 **2.6 m** ——
#   科技区那一片（创新中心 / 演艺中心 / 校医院 / 宿舍F）**楼自己坐 2.6 m 台基**，
#   门槛真就在 Z 5.6，墙外 20 m 仍是 5.6（同一台基面）。这类楼的入口本来就该是
#   **台基大台阶**，不该被否决。3.5 是留给它的余量。
_MAXBASE = 3.5
_PLAT = 0.45                     # 入口平台比墙基再抬 0.45 m（有"被抬高"才有"入口"）
_ST_RISE = 0.18                  # 一级踏步的目标踢面
_ST_RUN = 0.45                   # 一级踏步的踏面
_NSTEP = (3, 18)                 # 踏步级数上下限（平地 3 级；2.6 m 台基约 15 级）
# 面的优先序（同分时）：中国校园主入口朝南是惯例。
_FACE_ORDER = ('S', 'N', 'E', 'W')


# ==================================================================
# 1. 建筑簇（与 `_diag_plan.py` 同一套合并规则，避免"三个 Academy 分不开"）
# ==================================================================
def _bbox(obs):
    xs, ys, zs = [], [], []
    for ob in obs:
        for c in ob.bound_box:
            w = ob.matrix_world @ Vector(c)
            xs.append(w.x)
            ys.append(w.y)
            zs.append(w.z)
    return [min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)]


def _ov(a, b):
    dx = min(a[1], b[1]) - max(a[0], b[0])
    dy = min(a[3], b[3]) - max(a[2], b[2])
    return dx * dy if dx > 0 and dy > 0 else 0.0


def _ar(b):
    return max(0.0, b[1] - b[0]) * max(0.0, b[3] - b[2])


_obs = [ob for ob in bpy.data.objects
        if ob.type == 'MESH' and ob.name.startswith('BLD_')]
_cl = [{'bb': _bbox([ob]), 'obs': [ob]} for ob in _obs]
_ch = True
while _ch:
    _ch = False
    for i in range(len(_cl)):
        for j in range(i + 1, len(_cl)):
            a, b = _cl[i]['bb'], _cl[j]['bb']
            if _ov(a, b) > 0.12 * min(_ar(a), _ar(b)):
                _cl[i]['bb'] = [min(a[0], b[0]), max(a[1], b[1]),
                                min(a[2], b[2]), max(a[3], b[3]),
                                min(a[4], b[4]), max(a[5], b[5])]
                _cl[i]['obs'] += _cl[j]['obs']
                _cl.pop(j)
                _ch = True
                break
        if _ch:
            break


def _clname(obs):
    """簇名：成员里最长的"主干"名去掉材质后缀（与 `_diag_plan.py` 同一口径）。"""
    best = max((ob.name for ob in obs), key=len)
    p = best.split('_')
    return '_'.join(p[:3]) if len(p) > 3 else best


CL = [{'name': _clname(c['obs']), 'bb': c['bb'],
       'own': {ob.name for ob in c['obs']}} for c in _cl]
CL.sort(key=lambda c: c['name'])
_seen = {}
for c in CL:                                  # 三个 Academy 同名，报告里要分得开
    k = c['name']
    _seen[k] = _seen.get(k, 0) + 1
    if _seen[k] > 1:
        c['name'] = f'{k}#{_seen[k]}'


# ==================================================================
# 2. 射线工具
# ==================================================================
bpy.context.view_layer.update()
_DG = bpy.context.evaluated_depsgraph_get()
_RAY_Z = 260.0
_UP = Vector((0.0, 0.0, -1.0))


def _hit(px, py, z0=None):
    """(px, py) 自上而下打射线 → (对象名, 材质名)。

    ★ `z0` 指定**起点高度**（默认 `_RAY_Z`）。临路采样必须从**门的半高**起，
      不能从 260 m 起 —— 从天上往下打会**先命中自家屋面出檐**：
      美术馆（`人文_Art`）的大平板屋面外挑很远，四面 5~14 m 的探测点全落在
      檐口正下方，于是量到的全是 `BLD_人文_Art_Museum*`，被判"无硬化地面"。
    """
    zs = _RAY_Z if z0 is None else z0
    ok, _loc, _n, _i, ob, _mw = bpy.context.scene.ray_cast(
        _DG, Vector((px, py, zs)), _UP, distance=zs + 20.0)
    if not ok:
        return None, None
    mn = ob.data.materials[0].name if (ob.data.materials
                                      and ob.data.materials[0]) else ''
    return ob.name, mn


def _shot(org, d, dist):
    """水平射线 → (是否命中, 命中对象名, 命中距离)。"""
    ok, loc, _n, _i, ob, _mw = bpy.context.scene.ray_cast(
        _DG, Vector(org), Vector(d), distance=dist)
    if not ok:
        return False, None, 0.0
    return True, ob.name, (loc - Vector(org)).length


def _shot_own(org, d, dist, own):
    """水平射线，**穿透**掉一切不是"本簇自己的墙"的东西 → (是否命中, 名, 距离)。

    ★ 只取"最近一次命中"是错的，实测踩了两类：
      ① **非 `BLD_*` 的遮挡物**：`生活_宿舍F` 东面正好长着一棵树，
         射线先命中 `SITE_树干` ⇒ 整面判"找不到墙"。桥面、铺装同理。
      ② **别人家的楼**：排屋式布局里隔壁楼就压在簇 bbox 的外缘上，
         不跳过就会把门廊建到**隔壁楼**的墙上（宿舍F 北面 20 m 外就是教学C）。
    所以循环投射，只认 `own`（本簇对象名集合）里的 `BLD_*` 命中。
    """
    o = Vector(org)
    dv = Vector(d)
    left = dist
    cur = o
    for _ in range(32):
        ok, loc, _n, _i, ob, _mw = bpy.context.scene.ray_cast(
            _DG, cur, dv, distance=left)
        if not ok:
            return False, None, 0.0
        if ob.name.startswith('BLD_') and ob.name in own:
            return True, ob.name, (loc - o).length
        step = (loc - cur).length + 0.02
        left -= step
        if left <= 0.0:
            return False, None, 0.0
        cur = loc + dv * 0.02
    return False, None, 0.0


def _nstep_of(z_top, z_bot):
    """从平台顶 `z_top` 降回**墙前实测地面** `z_bot` 要几级踏步。

    ★★ 落点是 `z_bot`（实测），**不是 `Z_TOP`**。这一点踩过：
      美术馆 `人文_Art` 的门廊落在**台基顶**上（`z_base` = Z_TOP + 1.2），
      踏步却按"降到 Z_TOP"算 ⇒ 10 级里有 8 级**埋进台基实体**，
      成图只露出顶上 2 级（实拍确认）。
      正确口径是：平台只比**脚下的地面**高 `_PLAT`(0.45 m) ⇒ 恒定 3 级，
      跟"这栋楼坐多高的台基"无关 —— 上不上得了台基是丹陛/大台阶的事，
      不是门廊该管的。台基顶那一圈，本来就已经是可走的地面了。
    """
    return max(_NSTEP[0], min(_NSTEP[1],
                              int(math.ceil((z_top - z_bot) / _ST_RISE))))


def _face_scan(x0, x1, y0, y1, face, hh, z0, own):
    """→ (通行铺装点数, 分区地坪点数, 墙进深, 墙基标高, 是否被挡, 原因)"""
    if face in ('N', 'S'):
        u0, u1 = x0 + 4.0, x1 - 4.0
        edge = y1 if face == 'N' else y0
        s = 1.0 if face == 'N' else -1.0
        mk = lambda u, v: (u, edge + s * v)
        _in = Vector((0.0, -1.0, 0.0)) if face == 'N' else Vector((0.0, 1.0, 0.0))
    else:
        u0, u1 = y0 + 4.0, y1 - 4.0
        edge = x1 if face == 'E' else x0
        s = 1.0 if face == 'E' else -1.0
        mk = lambda u, v: (edge + s * v, u)
        _in = Vector((-1.0, 0.0, 0.0)) if face == 'E' else Vector((1.0, 0.0, 0.0))
    if u1 - u0 < 9.0:
        return 0, 0, None, None, True, '面太窄'
    cu = (u0 + u1) * 0.5
    # ★ 门的半高**自本簇的底面起算**，不能写死 `Z_TOP`：
    #   `讲堂_竹木竖翼` 悬在桥面上、底面 Z = 6.0，而 `Z_TOP + 0.45 + …` = 5.18
    #   **比构件本身还低**，四条水平射线从构件底下穿过去 ⇒ 四面"找不到墙"。
    _zm = max(Z_TOP, z0) + 0.45 + (hh - 0.55) * 0.5      # 门的半高

    # ---- ② 找墙（穿透树 / 隔壁楼，只认本簇）----
    px, py = mk(cu, _FAR)
    ok, nm, dist = _shot_own((px, py, _zm), _in, _FAR + _MAXSET, own)
    if not ok:
        return 0, 0, None, None, True, f'找不到墙({(nm or "空")[:16]})'
    wall_d = dist - _FAR
    if wall_d > _MAXSET:
        return 0, 0, None, None, True, '墙太深'
    wall = edge - s * wall_d
    _mkw = (lambda u, v: (u, wall + s * v)) if face in ('N', 'S') \
        else (lambda u, v: (wall + s * v, u))

    # ---- ③ 墙前地面标高（= 门槛标高 z_base）----
    # ★★ 这一步曾经把 24 栋里的 22 栋判成"墙基过高(5.0~36.2 m)"，根因是**射线的起点**：
    #   原来从 `_RAY_Z`(260) 往下打、落点又正好压在**墙面**上 —— 于是**先命中自家屋面**，
    #   `z_base` 取到的是楼高，不是墙脚。两处修正：
    #     ① 起点降到 `_zm`（门的半高）。这个高度刚刚被水平射线证明是**空的**
    #        （`_shot` 从面外 40 m 打进来，`_zm` 处一路无遮挡直到墙面），
    #        所以从 `_zm` 往下**不可能**碰到屋面。
    #     ② 落点外移 0.30 m（`_mkw(cu, 0.30)`）。压在墙面上擦行在数值上不可靠，
    #        而 0.30 m 仍在"门口"的尺度内，量到的还是**墙脚那一级**的地面。
    #   注意 0.30 m 是**墙外**，对带台基的楼量到的是**台基顶**（2.6 m 的那几栋），
    #   对平地楼量到的就是室外地坪（`Z_TOP`）—— 这正是我们要区分的两种情况。
    #   台基顶不算缺陷：门廊抬到台基顶、踏步数按实测高差算（2.6 m ⇒ 15 级大台阶），
    #   只把"高过 `_MAXBASE`(3.5 m)"的才算异常（那已经不是入口，是挡土墙）。
    gx, gy = _mkw(cu, 0.30)
    _bok, _loc, _n, _i, _gob, _mw = bpy.context.scene.ray_cast(
        _DG, Vector((gx, gy, _zm)), _UP, distance=_RAY_Z)
    z_base = max(Z_TOP, _loc.z) if _bok else Z_TOP
    if z_base > Z_TOP + _MAXBASE:
        # ★ 报错必须能区分两种完全不同的情况 —— 它们的处置方式相反：
        #   ① **楼自己坐台基**（墙外 20 m 就是室外地坪）⇒ 门廊该抬到台基顶、配大台阶；
        #   ② **周边地面整体抬高**（墙外 20 m 也这么高）⇒ `Z_TOP` 根本不是这一片的
        #      真实地坪，门廊应从**实测地坪**起做，抬 0 级踏步。
        #   只报一个 "墙基过高" 分不出这两者，所以顺带量一下墙外 20 m 的开阔地。
        ox, oy = _mkw(cu, 20.0)
        _ok2, _loc2, _n2, _i2, _ob2, _mw2 = bpy.context.scene.ray_cast(
            _DG, Vector((ox, oy, _zm)), _UP, distance=_RAY_Z)
        _fz = max(Z_TOP, _loc2.z) if _ok2 else Z_TOP
        _fn = (_ob2.name if (_ok2 and _ob2 is not None) else '空')
        return 0, 0, None, None, True, \
            f'墙基过高({z_base - Z_TOP:.1f}m; 墙外20m={_fz - Z_TOP:.1f}m {_fn[:14]})'

    # ---- ① 临路采样（自**墙面**起算）----
    n1 = n2 = 0
    _pr = {}                       # 失败诊断用：最外一圈探到了什么
    for t in (0.1, 0.3, 0.5, 0.7, 0.9):
        u = u0 + (u1 - u0) * t
        _best = None
        for v in _OFFS:
            qx, qy = _mkw(u, v)
            nm2, mn2 = _hit(qx, qy, _zm)     # ★ 自门半高起，避开自家出檐
            if not nm2 or nm2.startswith('BLD_'):
                if v == _OFFS[-1]:
                    _pr[(nm2 or '空')[:16] + '/BLD'] = _pr.get(
                        (nm2 or '空')[:16] + '/BLD', 0) + 1
                continue
            if mn2 in _ROAD_MATS or mn2 in _PLAZA_MATS:
                _best = 1
                break
            if mn2 in _DIST_MATS:
                _best = 2
            if v == _OFFS[-1]:
                _pr[(nm2 or '空')[:16] + '/' + (mn2 or '无')[:16]] = _pr.get(
                    (nm2 or '空')[:16] + '/' + (mn2 or '无')[:16], 0) + 1
        if _best == 1:
            n1 += 1
            n2 += 1
        elif _best == 2:
            n2 += 1
    if n1 < 3 and n2 < 3:
        _top = ','.join(f'{k}×{v}' for k, v in
                        sorted(_pr.items(), key=lambda kv: -kv[1])[:3])
        return n1, n2, wall_d, z_base, True, f'无硬化地面[{_top}]'

    # ---- ④ 门廊凸出范围内不能有别的实体（隔壁楼 / 自家大台阶）----
    # ★ 探测距离必须**跟着踏步级数走**：平地楼 3 级踏步外伸 ~3.6 m，
    #   2.6 m 台基的楼要 15 级、外伸 ~9.5 m —— 写死 4.0 m 会让台基楼的门廊
    #   插进隔壁楼里却查不出来。
    _out = -_in
    _reach = _ST_RUN * _nstep_of(z_base + _PLAT, z_base) + 3.0
    for du in (-3.6, 0.0, 3.6):
        qx, qy = _mkw(cu + du, 0.35)
        hok, hnm, _hd = _shot((qx, qy, z_base + _PLAT + 1.0), _out, _reach)
        if hok and hnm.startswith('BLD_'):
            return n1, n2, wall_d, z_base, True, '凸出范围内有楼'
    return n1, n2, wall_d, z_base, False, ''


# ==================================================================
# 3. 门廊几何（局部坐标：u 沿墙面，v 沿法线向外，原点在墙脚）
# ==================================================================
def _entrance(B, face, wall, s, cu, hh, z_base):
    """★ `v` = **距墙面**的距离（向外为正）。

    ★★ 这里修过一个静默的基准错位（2026-09-25）：原来签名收的是 `edge`（簇 bbox 外缘）
    + `wall_d`，`P()` 里先做 `vv = v - wall_d` 折算，落点却写成 `edge + s*vv` ——
    **漏掉了 `- s*wall_d` 这一项**，于是整座门廊又外移了 `wall_d`。
    `wall_d` 只有 0.2 m 的楼（实验楼A/B、科研中心）看不出来，
    而 `人文_Vertical` 的 `wall_d = 10.2 m` 会让门廊整整飘出 10 m 挂在草地上。
    `_face_scan` 辛辛苦苦量出来的墙面进深被这一步吃掉了。
    现在直接传 `wall`，`v` 就是距墙距离，没有二次折算。
    """
    W_ = 6.0
    PROJ = 2.6

    def P(u, v, wu, wv, h, z):
        if face in ('N', 'S'):
            return box(u, wall + s * v, wu, wv, h, z)
        return box(wall + s * v, u, wv, wu, h, z)

    z0 = z_base + _PLAT                       # 入口平台顶面（= 门槛标高）
    nstep = _nstep_of(z0, z_base)
    put(B, M_CONC, [P(cu - W_ * 0.5 + W_ * i / 3.0, PROJ - 0.35,
                      0.50, 0.50, hh, z0) for i in range(4)])
    put(B, M_CONC, P(cu, PROJ * 0.5, W_ + 0.70, PROJ + 0.70,
                     0.30, z0 + hh))
    put(B, M_COPPER, P(cu, PROJ * 0.5, W_ + 0.86, PROJ + 0.86,
                       0.10, z0 + hh + 0.30))
    put(B, M_GLASSC, P(cu, 0.06, W_ - 1.0, 0.22, hh - 0.55, z0))
    put(B, M_COPPER, [
        P(cu - (W_ - 1.0) * 0.5, 0.12, 0.16, 0.34, hh - 0.55, z0),
        P(cu + (W_ - 1.0) * 0.5, 0.12, 0.16, 0.34, hh - 0.55, z0),
        P(cu, 0.12, W_ - 0.6, 0.34, 0.18, z0 + hh - 0.55),
    ])
    # 入口平台（自**墙前地面**填到门槛）+ nstep 级踏步逐级降回**墙前地面**。
    # ★ 基准是 `z_base` 而不是 `Z_TOP`：带台基的楼，墙前那一圈本来就在台基顶，
    #   按 `Z_TOP` 做踏步会整段埋进台基里（见 `_nstep_of` 的注释）。
    put(B, M_PAVE_W, [P(cu, 1.00, W_ + 1.2, 2.00, _PLAT, z_base)])
    rise = _PLAT / nstep
    for k in range(nstep):
        put(B, M_PAVE_W, P(cu, 2.25 + _ST_RUN * k, W_ + 1.2, _ST_RUN,
                           _PLAT - rise * (k + 1), z_base))


# ==================================================================
# 4. 逐栋：选面 → 建门廊
# ==================================================================
B = {}
_done, _none = [], []
for c in CL:
    nm = c['name']
    if nm.startswith(_SKIP_PREFIX) or any(k in nm for k in _SKIP_KEY):
        continue
    # ★★ 占位体块（`M_体块_*`）**不是建筑** —— 它们是"以后要盖楼"的体量示意。
    #   给一个白盒子做入口门廊（柱 + 雨棚 + 玻璃门 + 铜门框 + 踏步）是错的。
    #   ★ 判据只能用**材质**：占位体块的名字也是 `BLD_科技_Incubator` 这种，
    #     跟真建筑分不出来（`Z_BLK` 里就是这么命名的）。
    #   ★ 为什么现在才加：本脚本原先只挂在 r5（场地上已是真建筑），
    #     S5 把它提到"所有阶段"之后，r0~r4 的 **28 个占位体块**会全部中招。
    _mats = set()
    for _on in c['own']:
        _ob = bpy.data.objects.get(_on)
        if _ob is not None:
            for _s in getattr(_ob.data, 'materials', ()) or ():
                if _s is not None:
                    _mats.add(_s.name)
    if _mats and all(_m.startswith('M_体块_') for _m in _mats):
        continue
    x0, x1, y0, y1, z0, z1 = c['bb']
    if (x1 - x0) * (y1 - y0) < 400.0:
        continue
    # ★ **悬空件不是落地建筑**：`讲堂_竹木竖翼` 底面 Z = 6.0（吊在桥面上），
    #   它自己成了独立一簇、面积也够，但"入口门廊"对它不成立。
    #   判据用**底面标高**而不是名字 —— 名字是"竖翼"这种字眼，
    #   而真正的问题是它根本不落地，下次换个构件名这条判据照样管用。
    if z0 > Z_TOP + 1.5:
        continue
    hh = round(max(3.8, min(5.0, (z1 - z0) * 0.26)), 2)
    _sc, _bestf, _why = None, None, {}
    for f in _FACE_ORDER:
        n1, n2, wd, zb, blocked, why = _face_scan(x0, x1, y0, y1, f, hh, z0,
                                                  c['own'])
        if blocked:
            _why[f] = why
            continue
        # 优先序（字典序）：① 有真通行铺装 ② 采样点数 ③ 墙面越贴近 bbox 外缘越好
        sc = (1 if n1 >= 3 else 0, n1 if n1 >= 3 else n2, -round(wd, 1))
        if _sc is None or sc > _sc:
            _sc, _bestf = sc, (f, wd, zb)
    if _bestf is None:
        _none.append((nm, _why, c['bb']))
        continue
    f, wd, zb = _bestf
    if f in ('N', 'S'):
        edge = y1 if f == 'N' else y0
        s = 1.0 if f == 'N' else -1.0
        cu = (x0 + x1) * 0.5
    else:
        edge = x1 if f == 'E' else x0
        s = 1.0 if f == 'E' else -1.0
        cu = (y0 + y1) * 0.5
    wall = edge - s * wd                      # ★ 真墙面（不是簇 bbox 外缘）
    _entrance(B, f, wall, s, cu, hh, zb)
    _done.append({'name': nm, 'face': f, 'score': _sc, 'hh': hh,
                  'wall_d': wd, 'z_base': zb, 'wall': wall, 'cu': cu, 's': s})

flush(B, 'ENT_入口')
B.clear()

for d in _done:
    _tag = '通行铺装' if d['score'][0] else '分区地坪'
    print(f'[ENT]   {d["name"][4:]:26s} 门廊朝 {d["face"]}（{_tag} {d["score"][1]}/5）'
          f' 墙进深 {d["wall_d"]:.1f} m / 墙基 +{d["z_base"] - Z_TOP:.2f} m'
          f' / h {d["hh"]}')
print(f'[ENT] 共补 {len(_done)} 栋；未找到可用面 {len(_none)} 栋')
for nm, why, bb in _none:
    print(f'[ENT]     ✗ {nm[4:]:22s} '
          f'X[{bb[0]:.0f},{bb[1]:.0f}] Y[{bb[2]:.0f},{bb[3]:.0f}] '
          f'Z[{bb[4]:.1f},{bb[5]:.1f}]  ' +
          ' / '.join(f'{k}:{v}' for k, v in sorted(why.items())))

# ★ 门廊清单留给后续脚本（`_ent_render.py` 摆机位、未来的图集脚本点名用）。
#   走 globals 而不是文件：`run_campus.py` 的 `run()` 把同一份 `g` 一路传下去，
#   后面的脚本直接读 `ENT_LIST` 就行，不必多一次全量构建。
ENT_LIST = _done

# ★ 按需导出门廊清单（`BR_ENT_JSON`）—— 供 `_ent_render.py` 摆机位用。
#   不设这个环境变量就完全不写盘，正常建模流程零副作用。
_ent_out = os.environ.get('BR_ENT_JSON')
if _ent_out:
    with open(_ent_out, 'w', encoding='utf-8') as _fh:
        json.dump(_done, _fh, ensure_ascii=False, indent=1)
    print(f'[ENT] 门廊清单 → {_ent_out}')
