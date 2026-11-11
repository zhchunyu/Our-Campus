# -*- coding: utf-8 -*-
"""_diag_road_nav.py —— 前端路网诊断工具（纯 Python，秒级）

直接从 site/src/navigation.campus.js 正则提取 BUILDINGS / ROAD_NODES / ROAD_EDGES，
做 6 项诊断：
  1. 数据完整性 —— 节点/边数、孤立节点、重复边
  2. 连通性 —— 有几个连通分量 / 最大分量占比
  3. 入口朝向校验 —— 每栋楼入口侧 vs 另一侧，哪边路更近
  4. 路网穿楼检测 —— 路段与建筑包围盒相交（净距 < 0）
  5. 关键路径长度 —— 预设几条路线，输出距离与段数
  6. 封路绕行测试 —— 封掉指定边后，关键路径变化量

用法：
    cd 02-三维资产
    python blender/scripts/_diag_road_nav.py

    # 指定要封的边做绕行测试
    python blender/scripts/_diag_road_nav.py --block outer_s2,outer_s3

    # 只看某几栋楼的入口诊断
    python blender/scripts/_diag_road_nav.py --buildings 食堂,宿舍E,中心图书馆

输出：彩色终端报告 + 退出码（0=全部通过，非0=有问题）
"""
import argparse
import heapq
import math
import os
import re
import sys

# ─────────────────────────────────────────────────────────────
# 1. 从 JS 文件正则提取数据
# ─────────────────────────────────────────────────────────────

HERE = os.path.dirname(os.path.abspath(__file__))
SITE_SRC = os.path.normpath(os.path.join(HERE, '..', '..', 'site', 'src'))
NAV_JS = os.path.join(SITE_SRC, 'navigation.campus.js')


def _extract_js_array(js_text, var_name):
    """从 JS 里提取 `const VAR = { ... };` 的内容，返回原始字符串。"""
    pattern = rf'const\s+{var_name}\s*=\s*\{{(.*?)\n\}};'
    m = re.search(pattern, js_text, re.DOTALL)
    return m.group(1) if m else ''


def _parse_road_nodes(js_text):
    """解析 ROAD_NODES → {id: (x, y)}"""
    body = _extract_js_array(js_text, 'ROAD_NODES')
    nodes = {}
    for line in body.split('\n'):
        line = line.strip()
        # 匹配: 'node_id': { x: 123, y: 456 },
        m = re.match(r"'([^']+)'\s*:\s*\{\s*x\s*:\s*([-\d.]+)\s*,\s*y\s*:\s*([-\d.]+)", line)
        if m:
            nid, x, y = m.group(1), float(m.group(2)), float(m.group(3))
            nodes[nid] = (x, y)
    return nodes


def _parse_road_edges(js_text):
    """解析 ROAD_EDGES → [(a, b), ...]"""
    # 找 ROAD_EDGES = [ ... ];
    m = re.search(r'const\s+ROAD_EDGES\s*=\s*\[(.*?)\];', js_text, re.DOTALL)
    if not m:
        return []
    body = m.group(1)
    edges = []
    for line in body.split('\n'):
        line = line.strip()
        m = re.match(r"\['([^']+)'\s*,\s*'([^']+)'\]", line)
        if m:
            edges.append((m.group(1), m.group(2)))
    return edges


def _parse_buildings(js_text):
    """解析 BUILDINGS → [{name, sx, sy, shx, shy, type, entrance}, ...]"""
    # 找 export const BUILDINGS = [ ... ];
    m = re.search(r'export\s+const\s+BUILDINGS\s*=\s*\[(.*?)\n\];', js_text, re.DOTALL)
    if not m:
        return []
    body = m.group(1)
    buildings = []
    for line in body.split('\n'):
        line = line.strip()
        if not line.startswith('{'):
            continue
        # 提取字段
        def get(pattern, default=None):
            m2 = re.search(pattern, line)
            return m2.group(1) if m2 else default

        name = get(r"name:\s*'([^']+)'", '')
        if not name:
            continue
        sx = float(get(r"sx:\s*([-\d.]+)", '0'))
        sy = float(get(r"sy:\s*([-\d.]+)", '0'))
        shx = float(get(r"shx:\s*([-\d.]+)", '0'))
        shy = float(get(r"shy:\s*([-\d.]+)", '0'))
        btype = get(r"type:\s*'([^']+)'", '')
        entrance = get(r"entrance:\s*'([^']+)'", 'south')

        # SVG → Blender 世界坐标
        wx = (sx - 340) * 2.4
        wy = (516 - sy) * 2.4
        w_half_x = shx * 2.4
        w_half_y = shy * 2.4

        buildings.append({
            'name': name,
            'sx': sx, 'sy': sy,
            'shx': shx, 'shy': shy,
            'type': btype,
            'entrance': entrance,
            'x': wx, 'y': wy,                      # 中心（Blender 世界坐标）
            'half_x': w_half_x, 'half_y': w_half_y,  # 半宽/半高（米）
        })
    return buildings


def load_nav_data(js_path=NAV_JS):
    """一次性加载所有导航数据。"""
    with open(js_path, 'r', encoding='utf-8') as f:
        text = f.read()
    return {
        'nodes': _parse_road_nodes(text),
        'edges': _parse_road_edges(text),
        'buildings': _parse_buildings(text),
    }


def _compute_anchors(data):
    """模拟 buildAnchors() 的逻辑，计算锚点坐标（Blender 世界坐标 x, y）。
    因为 Python 端的坐标是 Blender (x=东, y=北)，需要把 JS 的 z 转成 -y。
    """
    buildings = data['buildings']
    nodes = data['nodes']
    anchors = []

    # 1. 建筑锚点：建筑中心 + 入口方向偏移
    for b in buildings:
        offset = max(b['shx'], b['shy']) * 2.4 * 0.6
        dx, dy = 0, 0
        ent = b.get('entrance', 'south')
        if ent == 'south':
            dy = -offset   # 入口朝南 → Blender y 更小的一侧
        elif ent == 'north':
            dy = offset
        elif ent == 'east':
            dx = offset
        elif ent == 'west':
            dx = -offset
        anchors.append({
            'name': b['name'],
            'type': 'building',
            'x': b['x'] + dx,
            'y': b['y'] + dy,   # Blender y
            'buildingName': b['name'],
        })

    # 2. 道路/站点锚点
    node_map = {
        'ring_s1':     ('S1站', 'station'),
        'ring_s4':     ('S4站', 'station'),
        'ring_s7':     ('S7站', 'station'),
        'axis_gate':   ('主校门路口', 'junction'),
        'axis_lib_s':  ('图书馆南路口', 'junction'),
        'axis_plaza':  ('明堂广场', 'area'),
        'axis_mound_s':('案山南坡', 'area'),
    }
    for nid, (name, typ) in node_map.items():
        if nid in nodes:
            anchors.append({
                'name': name, 'type': typ,
                'x': nodes[nid][0], 'y': nodes[nid][1],
                'nodeId': nid,
            })

    # 3. 智谷谷底
    if 'axis_valley_n' in nodes:
        n = nodes['axis_valley_n']
        anchors.append({
            'name': '智谷谷底', 'type': 'area',
            'x': n[0], 'y': n[1],
        })

    return anchors


# ─────────────────────────────────────────────────────────────
# 2. 图算法（A* + 连通分量）
# ─────────────────────────────────────────────────────────────

def build_adj(nodes, edges):
    """邻接表：{node_id: [(neighbor_id, distance), ...]}"""
    adj = {nid: [] for nid in nodes}
    for a, b in edges:
        if a not in nodes or b not in nodes:
            continue
        dx = nodes[a][0] - nodes[b][0]
        dy = nodes[a][1] - nodes[b][1]
        d = math.hypot(dx, dy)
        adj[a].append((b, d))
        adj[b].append((a, d))
    return adj


def connected_components(adj):
    """返回 [set(node_id), ...]，按大小降序。"""
    visited = set()
    components = []
    for nid in adj:
        if nid in visited:
            continue
        comp = set()
        stack = [nid]
        while stack:
            cur = stack.pop()
            if cur in visited:
                continue
            visited.add(cur)
            comp.add(cur)
            for nb, _ in adj[cur]:
                if nb not in visited:
                    stack.append(nb)
        components.append(comp)
    components.sort(key=len, reverse=True)
    return components


def a_star(adj, nodes, start, goal, blocked_edges=None):
    """A* 最短路径，返回 (distance, path_nodes) 或 (None, None)。
    blocked_edges: set of frozenset({a, b})
    """
    if blocked_edges is None:
        blocked_edges = set()

    def h(nid):
        dx = nodes[nid][0] - nodes[goal][0]
        dy = nodes[nid][1] - nodes[goal][1]
        return math.hypot(dx, dy)

    g_score = {start: 0.0}
    came_from = {}
    open_set = [(h(start), start)]
    closed = set()

    while open_set:
        f_cur, cur = heapq.heappop(open_set)
        if cur in closed:
            continue
        if cur == goal:
            # 回溯路径
            path = [cur]
            while cur in came_from:
                cur = came_from[cur]
                path.append(cur)
            path.reverse()
            return g_score[goal], path
        closed.add(cur)

        for nb, dist in adj[cur]:
            if nb in closed:
                continue
            if frozenset({cur, nb}) in blocked_edges:
                continue
            tentative = g_score[cur] + dist
            if tentative < g_score.get(nb, float('inf')):
                g_score[nb] = tentative
                came_from[nb] = cur
                heapq.heappush(open_set, (tentative + h(nb), nb))

    return None, None


# ─────────────────────────────────────────────────────────────
# 3. 几何工具
# ─────────────────────────────────────────────────────────────

def seg_rect_gap(p, q, bb):
    """线段 pq 到轴对齐矩形 bb 的净距（相交返回 0）。
    bb = (x0, x1, y0, y1)
    """
    x0, x1, y0, y1 = bb

    def pt_seg(r, a, b):
        vx, vy = b[0] - a[0], b[1] - a[1]
        L2 = vx * vx + vy * vy
        if L2 <= 1e-12:
            return math.hypot(r[0] - a[0], r[1] - a[1])
        t = max(0.0, min(1.0, ((r[0] - a[0]) * vx + (r[1] - a[1]) * vy) / L2))
        return math.hypot(r[0] - a[0] - t * vx, r[1] - a[1] - t * vy)

    def seg_cross(a, b, c, d):
        def o(p, q, r):
            return (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1])
        o1 = o(a, b, c)
        o2 = o(a, b, d)
        o3 = o(c, d, a)
        o4 = o(c, d, b)
        if o1 * o2 < 0 and o3 * o4 < 0:
            return True
        return False

    # 线段端点在矩形内 → 相交
    for r in (p, q):
        if x0 <= r[0] <= x1 and y0 <= r[1] <= y1:
            return 0.0

    # 线段与矩形四边相交 → 0
    rect_edges = [
        ((x0, y0), (x1, y0)),
        ((x1, y0), (x1, y1)),
        ((x1, y1), (x0, y1)),
        ((x0, y1), (x0, y0)),
    ]
    for a, b in rect_edges:
        if seg_cross(p, q, a, b):
            return 0.0

    # 否则取四角到线段的最小距离
    best = min(pt_seg((x, y), p, q)
               for x in (x0, x1) for y in (y0, y1))
    return best


def nearest_node_to_point(nodes, px, py, filter_fn=None):
    """找离 (px, py) 最近的道路节点，返回 (node_id, distance)。
    filter_fn(node_id) → True/False，可选过滤。
    """
    best_id = None
    best_d = float('inf')
    for nid, (nx, ny) in nodes.items():
        if filter_fn and not filter_fn(nid):
            continue
        d = math.hypot(nx - px, ny - py)
        if d < best_d:
            best_d = d
            best_id = nid
    return best_id, best_d


def nearest_road_node_by_entrance(nodes, building):
    """按建筑入口方向找最近道路节点（模拟 navigation.campus.js 的 nearestRoadNode）。
    building: Blender 坐标的建筑 dict
    返回 (node_id, distance)
    """
    bx, by = building['x'], building['y']
    entrance = building.get('entrance', 'south')

    def entrance_side(nid):
        nx, ny = nodes[nid]
        dx, dy = nx - bx, ny - by
        if entrance == 'south':
            return dy < -5 and abs(dx) < 80   # 节点在建筑南边
        elif entrance == 'north':
            return dy > 5 and abs(dx) < 80
        elif entrance == 'east':
            return dx > 5 and abs(dy) < 80
        elif entrance == 'west':
            return dx < -5 and abs(dy) < 80
        return True

    ent_id, ent_d = nearest_node_to_point(nodes, bx, by, entrance_side)
    if ent_id:
        return ent_id, ent_d
    # 入口侧没找到，退回全局最近
    return nearest_node_to_point(nodes, bx, by)


# ─────────────────────────────────────────────────────────────
# 4. 诊断项
# ─────────────────────────────────────────────────────────────

def diag_basics(data):
    """1. 数据完整性"""
    nodes, edges, buildings = data['nodes'], data['edges'], data['buildings']
    issues = []

    # 引用不存在的节点
    node_set = set(nodes.keys())
    bad_edges = []
    for a, b in edges:
        if a not in node_set or b not in node_set:
            bad_edges.append((a, b))
    if bad_edges:
        issues.append(f'❌ {len(bad_edges)} 条边引用了不存在的节点')
        for a, b in bad_edges[:5]:
            issues.append(f'   ↳ {a} ↔ {b}')

    # 重复边
    edge_set = set()
    dup_edges = []
    for a, b in edges:
        key = frozenset({a, b})
        if key in edge_set:
            dup_edges.append((a, b))
        edge_set.add(key)
    if dup_edges:
        issues.append(f'⚠️  {len(dup_edges)} 条重复边')

    # 孤立节点（度=0）
    adj = build_adj(nodes, edges)
    isolated = [nid for nid, nbs in adj.items() if len(nbs) == 0]
    if isolated:
        issues.append(f'⚠️  {len(isolated)} 个孤立节点')
        for nid in isolated[:5]:
            issues.append(f'   ↳ {nid}')

    # 锚点数量
    anchors = _compute_anchors(data)

    summary = f'节点 {len(nodes)} / 边 {len(edges)} / 建筑 {len(buildings)} / 锚点 {len(anchors)}'
    if not issues:
        issues.append('✅ 数据完整，无孤立节点和悬空边')
    return summary, issues


def diag_anchors(data):
    """1.5 锚点偏差检测
    
    建筑类锚点到对应建筑中心的距离应该合理（一般 < 建筑半长的 0.8 倍 + 一点偏移）。
    所有锚点到最近建筑的距离应该 ≤ 60 m（否则就是"飘在野外"的锚点）。
    """
    buildings = data['buildings']
    anchors = _compute_anchors(data)
    issues = []
    bad_count = 0

    # 判据 1：建筑类锚点到对应建筑中心的距离
    bld_anchors = [a for a in anchors if a['type'] == 'building']
    for a in bld_anchors:
        b = next((b for b in buildings if b['name'] == a.get('buildingName')), None)
        if not b:
            issues.append(f'❌ 锚点「{a["name"]}」找不到对应建筑')
            bad_count += 1
            continue
        dist = math.hypot(a['x'] - b['x'], a['y'] - b['y'])
        half_max = max(b['half_x'], b['half_y'])
        # 合理范围：0.3 ~ 0.8 倍半长
        if dist > half_max * 1.2:
            issues.append(
                f'⚠️  建筑锚点「{a["name"]}」距中心 {dist:.0f} m，'
                f'超过建筑半长 ({half_max:.0f} m) 的 1.2 倍 — 可能偏移过头了'
            )
            bad_count += 1

    # 判据 2：所有锚点到最近建筑的距离 ≤ 60 m
    for a in anchors:
        min_d = min(
            math.hypot(a['x'] - b['x'], a['y'] - b['y'])
            for b in buildings
        )
        if min_d > 60:
            issues.append(
                f'⚠️  锚点「{a["name"]}」({a["type"]}) 距最近建筑 {min_d:.0f} m > 60 m '
                f'— 坐标可能过时了'
            )
            bad_count += 1

    if bad_count == 0:
        issues.append(f'✅ {len(anchors)} 个锚点全部合规（距最近建筑 ≤ 60 m）')
    return f'{len(anchors)} 个锚点，{bad_count} 个异常', issues


def diag_connectivity(data):
    """2. 连通性"""
    adj = build_adj(data['nodes'], data['edges'])
    comps = connected_components(adj)
    issues = []

    if len(comps) == 1:
        issues.append(f'✅ 全连通（{len(comps[0])} 个节点在同一分量）')
    else:
        issues.append(f'❌ {len(comps)} 个连通分量：')
        for i, comp in enumerate(comps[:5]):
            sample = sorted(list(comp))[:3]
            issues.append(f'   #{i}: {len(comp)} 个节点，如 {", ".join(sample)}')
        if len(comps) > 5:
            issues.append(f'   … 还有 {len(comps) - 5} 个')

    return f'{len(comps)} 个连通分量', issues


def diag_entrances(data):
    """3. 入口朝向校验"""
    nodes = data['nodes']
    buildings = data['buildings']
    issues = []
    bad_count = 0

    for b in buildings:
        bx, by = b['x'], b['y']
        entrance = b.get('entrance', 'south')

        # 入口侧 vs 对侧 最近节点距离
        def entrance_side(nid):
            nx, ny = nodes[nid]
            dx, dy = nx - bx, ny - by
            if entrance == 'south':
                return dy < -5    # 节点在建筑南边（y 更小）
            elif entrance == 'north':
                return dy > 5
            elif entrance == 'east':
                return dx > 5
            elif entrance == 'west':
                return dx < -5
            return True

        def opposite_side(nid):
            return not entrance_side(nid)

        ent_id, ent_d = nearest_node_to_point(nodes, bx, by, entrance_side)
        opp_id, opp_d = nearest_node_to_point(nodes, bx, by, opposite_side)

        if ent_id is None:
            issues.append(f'❌ {b["name"]}: 入口侧({entrance})完全找不到道路节点')
            bad_count += 1
        elif opp_id and ent_d > opp_d * 1.5 and opp_d < ent_d - 20:
            # 入口侧比对侧远 50% 以上，且差距 > 20m → 朝向可能反了
            issues.append(
                f'⚠️  {b["name"]}: 入口朝{entrance}，但入口侧最近路 ({ent_id}, {ent_d:.0f}m) '
                f'比对侧 ({opp_id}, {opp_d:.0f}m) 远 {ent_d - opp_d:.0f}m — 朝向可能反了'
            )
            bad_count += 1

    if bad_count == 0:
        issues.append('✅ 所有建筑入口朝向合理')
    return f'{bad_count} 栋可能有问题', issues


def diag_road_inside_buildings(data):
    """4. 路网穿楼检测"""
    nodes = data['nodes']
    edges = data['edges']
    buildings = data['buildings']
    issues = []

    for a, b in edges:
        if a not in nodes or b not in nodes:
            continue
        p = nodes[a]
        q = nodes[b]
        for bld in buildings:
            # 建筑包围盒（Blender 坐标，x 东 / y 北）
            bb = (
                bld['x'] - bld['half_x'], bld['x'] + bld['half_x'],
                bld['y'] - bld['half_y'], bld['y'] + bld['half_y'],
            )
            gap = seg_rect_gap(p, q, bb)
            if gap < 0.5:  # 基本相交或贴边
                issues.append(
                    f'❌ 路段 {a}↔{b} 穿过建筑「{bld["name"]}」（净距 {gap:.1f}m）'
                )

    if not issues:
        issues.append('✅ 路网不穿越任何建筑')
    return f'{len(issues)} 处穿楼', issues


def diag_key_routes(data, routes=None):
    """5. 关键路径长度"""
    nodes = data['nodes']
    adj = build_adj(data['nodes'], data['edges'])
    buildings = {b['name']: b for b in data['buildings']}

    if routes is None:
        routes = [
            ('主校门', '中心图书馆'),
            ('主校门', '食堂'),
            ('宿舍E', '食堂'),
            ('创新中心', '科研中心'),
            ('主校门', '垂直书院'),
        ]

    issues = []
    results = []
    for from_name, to_name in routes:
        fb = buildings.get(from_name)
        tb = buildings.get(to_name)
        if not fb or not tb:
            issues.append(f'⚠️  找不到建筑：{from_name} 或 {to_name}')
            continue

        # 按入口方向找道路节点（模拟真实 computeRoute 的逻辑）
        from_id, _ = nearest_road_node_by_entrance(nodes, fb)
        to_id, _ = nearest_road_node_by_entrance(nodes, tb)

        dist, path = a_star(adj, nodes, from_id, to_id)
        if dist is None:
            issues.append(f'❌ {from_name} → {to_name}: 不可达')
            results.append((from_name, to_name, None, None))
        else:
            # 直线距离
            straight = math.hypot(fb['x'] - tb['x'], fb['y'] - tb['y'])
            ratio = dist / straight if straight > 0 else 0
            issues.append(
                f'  · {from_name} → {to_name}: {dist:.0f} m / {len(path) - 1} 段 '
                f'(直线 {straight:.0f} m，绕行系数 {ratio:.2f}×)'
            )
            results.append((from_name, to_name, dist, len(path) - 1))

    return results, issues


def diag_blocked_reroute(data, blocked_edge, routes=None):
    """6. 封路绕行测试"""
    nodes = data['nodes']
    adj = build_adj(data['nodes'], data['edges'])
    buildings = {b['name']: b for b in data['buildings']}

    if routes is None:
        routes = [('主校门', '食堂')]

    a, b = blocked_edge.split(',') if ',' in blocked_edge else (blocked_edge, '')
    if not b:
        return [], [f'⚠️  封路边格式错误，应为 nodeA,nodeB']

    blocked_set = {frozenset({a, b})}

    issues = []
    issues.append(f'封路：{a} ↔ {b}')

    for from_name, to_name in routes:
        fb = buildings.get(from_name)
        tb = buildings.get(to_name)
        if not fb or not tb:
            continue

        from_id, _ = nearest_road_node_by_entrance(nodes, fb)
        to_id, _ = nearest_road_node_by_entrance(nodes, tb)

        # 不封路
        d0, p0 = a_star(adj, nodes, from_id, to_id)
        # 封路
        d1, p1 = a_star(adj, nodes, from_id, to_id, blocked_set)

        if d0 is None or d1 is None:
            issues.append(f'  · {from_name} → {to_name}: 不可达')
        elif abs(d1 - d0) < 1.0:
            issues.append(
                f'  ⚠️  {from_name} → {to_name}: 封路后距离不变 ({d0:.0f} m) '
                f'— 最优路径不经过该路段！'
            )
        else:
            delta = d1 - d0
            pct = delta / d0 * 100
            issues.append(
                f'  · {from_name} → {to_name}: {d0:.0f} → {d1:.0f} m '
                f'(+{delta:.0f} m, +{pct:.0f}%) — 绕行可见 ✓'
            )

    return None, issues


# ─────────────────────────────────────────────────────────────
# 5. 主流程
# ─────────────────────────────────────────────────────────────

# ANSI 颜色
C = {
    'reset': '\033[0m',
    'bold': '\033[1m',
    'red': '\033[91m',
    'green': '\033[92m',
    'yellow': '\033[93m',
    'cyan': '\033[96m',
    'dim': '\033[2m',
}


def section(title):
    print(f"\n{C['bold']}{C['cyan']}══ {title} ══{C['reset']}")


def main():
    parser = argparse.ArgumentParser(description='前端路网诊断工具')
    parser.add_argument('--block', help='封路绕行测试，格式：nodeA,nodeB')
    parser.add_argument('--buildings', help='只检查指定建筑（逗号分隔）')
    parser.add_argument('--js', default=NAV_JS, help='navigation.campus.js 路径')
    args = parser.parse_args()

    print(f"{C['bold']}{C['cyan']}")
    print("╔══════════════════════════════════════════╗")
    print("║     山河大学 · 路网诊断 v1.0             ║")
    print("╚══════════════════════════════════════════╝")
    print(f"{C['reset']}")
    print(f"{C['dim']}数据源：{args.js}{C['reset']}")

    data = load_nav_data(args.js)
    total_issues = 0

    # 1. 数据完整性
    section('1. 数据完整性')
    summary, issues = diag_basics(data)
    print(f"  {C['bold']}{summary}{C['reset']}")
    for i in issues:
        print(f"  {i}")
    total_issues += sum(1 for i in issues if '❌' in i)

    # 1.5 锚点偏差
    section('1.5 锚点偏差检测')
    summary, issues = diag_anchors(data)
    print(f"  {C['bold']}{summary}{C['reset']}")
    for i in issues[:15]:
        print(f"  {i}")
    if len(issues) > 15:
        print(f"  … 还有 {len(issues) - 15} 条")
    total_issues += sum(1 for i in issues if '❌' in i or '⚠️' in i)

    # 2. 连通性
    section('2. 连通性')
    summary, issues = diag_connectivity(data)
    print(f"  {C['bold']}{summary}{C['reset']}")
    for i in issues:
        print(f"  {i}")
    total_issues += sum(1 for i in issues if '❌' in i)

    # 3. 入口朝向
    section('3. 入口朝向校验')
    summary, issues = diag_entrances(data)
    if args.buildings:
        target = set(args.buildings.split(','))
        issues = [i for i in issues if any(t in i for t in target) or '✅' in i]
    print(f"  {C['bold']}{summary}{C['reset']}")
    for i in issues:
        print(f"  {i}")
    total_issues += sum(1 for i in issues if '❌' in i or '⚠️' in i)

    # 4. 穿楼检测
    section('4. 路网穿楼检测')
    summary, issues = diag_road_inside_buildings(data)
    print(f"  {C['bold']}{summary}{C['reset']}")
    for i in issues:
        print(f"  {i}")
    total_issues += sum(1 for i in issues if '❌' in i)

    # 5. 关键路径
    section('5. 关键路径长度')
    _, issues = diag_key_routes(data)
    for i in issues:
        print(f"  {i}")

    # 6. 封路绕行
    if args.block:
        section('6. 封路绕行测试')
        _, issues = diag_blocked_reroute(data, args.block)
        for i in issues:
            print(f"  {i}")

    # 总结
    print(f"\n{C['bold']}{'═' * 45}{C['reset']}")
    if total_issues == 0:
        print(f"  {C['green']}✅ 全部通过，路网健康{C['reset']}")
    else:
        print(f"  {C['yellow']}⚠️  发现 {total_issues} 个问题需要处理{C['reset']}")
    print()

    return 0 if total_issues == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
