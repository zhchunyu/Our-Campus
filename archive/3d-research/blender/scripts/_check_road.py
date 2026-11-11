# -*- coding: utf-8 -*-
"""_check_road.py —— 纯 Python 路网净距试算器（不开 Blender，秒级）。

读 `_diag_plan.py` 落下的几何 JSON，对候选路网折线算：
  1. 与每个建筑簇包围盒的**相交面积**（把路带栅格化后点数）
  2. 与每个建筑簇包围盒的**净距**（线段到轴对齐矩形的精确距离）
并列出低于目标净距的项。

用法：
    python _check_road.py <geom.json>                     # 只看现状
    python _check_road.py <geom.json> <cand.json>         # 试算候选
cand.json 格式：
    {"roads": [{"name": "主路", "pts": [[x,y],...], "width": 13, "closed": true,
                "target": 25}]}
"""
import json
import math
import sys


def seg_rect_gap(p, q, bb):
    """线段 pq 到轴对齐矩形 bb 的净距（相交返回 0）"""
    x0, x1, y0, y1 = bb
    # 快速：若线段的包围盒与矩形不交，退化为点距
    sx0, sx1 = min(p[0], q[0]), max(p[0], q[0])
    sy0, sy1 = min(p[1], q[1]), max(p[1], q[1])
    if sx1 < x0 or sx0 > x1 or sy1 < y0 or sy0 > y1:
        pass
    else:
        # 可能相交：线段与矩形四边求交
        for a, b in (((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)),
                     ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))):
            if _seg_cross(p, q, a, b):
                return 0.0

    def pt_seg(r, a, b):
        vx, vy = b[0] - a[0], b[1] - a[1]
        L2 = vx * vx + vy * vy
        if L2 <= 1e-12:
            return math.hypot(r[0] - a[0], r[1] - a[1])
        t = max(0.0, min(1.0, ((r[0] - a[0]) * vx + (r[1] - a[1]) * vy) / L2))
        return math.hypot(r[0] - a[0] - t * vx, r[1] - a[1] - t * vy)

    best = min(pt_seg((x, y), p, q)
               for x in (x0, x1) for y in (y0, y1))
    # 线段端点落进矩形内 → 0
    for r in (p, q):
        if x0 <= r[0] <= x1 and y0 <= r[1] <= y1:
            return 0.0
    # 线段端点分别落在矩形两条相对边的外侧时，取端点到最近边的距离
    for r in (p, q):
        dx = max(x0 - r[0], 0.0, r[0] - x1)
        dy = max(y0 - r[1], 0.0, r[1] - y1)
        best = min(best, math.hypot(dx, dy))
    return best


def _seg_cross(a, b, c, d):
    def o(p, q, r):
        v = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1])
        return 0 if abs(v) < 1e-12 else (1 if v > 0 else -1)
    return o(a, b, c) != o(a, b, d) and o(c, d, a) != o(c, d, b)


def ribbon_cells(pts, width, closed, step=1.0):
    """把路带栅格化成 (ix,iy) 集合，格边长 = step"""
    half = width * 0.5
    segs = []
    n = len(pts)
    for i in range(n if closed else n - 1):
        segs.append((pts[i], pts[(i + 1) % n]))
    cells = set()
    R = int(half / step) + 1
    for (ax, ay), (bx, by) in segs:
        L = math.hypot(bx - ax, by - ay)
        m = max(1, int(L / step))
        for k in range(m + 1):
            t = k / m
            cx, cy = ax + (bx - ax) * t, ay + (by - ay) * t
            ix, iy = int(math.floor(cx / step)), int(math.floor(cy / step))
            for dx in range(-R, R + 1):
                for dy in range(-R, R + 1):
                    if math.hypot(dx, dy) * step <= half:
                        cells.add((ix + dx, iy + dy))
    return cells, step


def point_in_poly(pt, poly):
    x, y = pt
    inside = False
    n = len(poly)
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        if (a[1] > y) != (b[1] > y):
            xx = a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0])
            if x < xx:
                inside = not inside
    return inside


def main():
    geom = json.load(open(sys.argv[1], encoding='utf-8'))
    CL = geom['clusters']
    P0 = geom['polys'].get('P0')
    roads = []
    if len(sys.argv) > 2:
        cand = json.load(open(sys.argv[2], encoding='utf-8'))
        roads = cand['roads']
    else:
        # ★ 默认只算"唯一真源"那几条。`RING_ROAD`（主环）与 `INNER`（内环次路，
        #   = R4 环廊同线）都在场地脚本里；`RING` 这个名字会被 R4 覆盖，不要用。
        for nm, w, cl, tg in (('RING_ROAD', 12.0, True, 20.0),
                              ('INNER', 12.0, True, 8.0),
                              ('WALK', 8.0, False, 5.0)):
            if nm in geom['polys']:
                roads.append({'name': nm, 'pts': geom['polys'][nm],
                              'width': w, 'closed': cl, 'target': tg})
    if not roads:
        print('没有可试算的路网。可用折线名：')
        for k, v in sorted(geom['polys'].items()):
            xs = [p[0] for p in v]
            ys = [p[1] for p in v]
            print(f'  {k:<12s} {len(v):>4d} 点  X {min(xs):>7.1f}~{max(xs):<7.1f}'
                  f'Y {min(ys):>7.1f}~{max(ys):<7.1f}')
        return

    for rd in roads:
        pts = [(float(p[0]), float(p[1])) for p in rd['pts']]
        w = float(rd.get('width', 13.0))
        closed = bool(rd.get('closed', True))
        target = float(rd.get('target', 25.0))
        print(f'\n=== {rd["name"]}  宽 {w:.0f} m  {"闭合" if closed else "开敞"}  '
              f'{len(pts)} 点  目标净距 ≥ {target:.0f} m ===')
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        print(f'  包围盒 X {min(xs):.0f}~{max(xs):.0f}  Y {min(ys):.0f}~{max(ys):.0f}')

        cells, step = ribbon_cells(pts, w, closed)
        # 岸线越界检查
        if P0:
            out = [c for c in cells
                   if not point_in_poly(((c[0] + 0.5) * step, (c[1] + 0.5) * step), P0)]
            if out:
                xs2 = [(c[0] + 0.5) * step for c in out]
                ys2 = [(c[1] + 0.5) * step for c in out]
                print(f'  ★★ 越出岸线 {len(out)} 格 ≈ {len(out)*step*step:.0f} m²'
                      f'（X {min(xs2):.0f}~{max(xs2):.0f} Y {min(ys2):.0f}~{max(ys2):.0f}）')
            else:
                print('  ✓ 全在岸线以内')
        bad, over = [], []
        for c in CL:
            x0, x1, y0, y1 = c['bb'][:4]
            # 相交面积
            n = 0
            for (ix, iy) in cells:
                gx, gy = (ix + 0.5) * step, (iy + 0.5) * step
                if x0 <= gx <= x1 and y0 <= gy <= y1:
                    n += 1
            ar = n * step * step
            # 净距（扣掉路带半宽）
            segs = [(pts[i], pts[(i + 1) % len(pts)])
                    for i in range(len(pts) if closed else len(pts) - 1)]
            gp = min(seg_rect_gap(a, b, (x0, x1, y0, y1)) for a, b in segs) - w * 0.5
            if ar > 1.0:
                over.append((ar, gp, c['name']))
            elif gp < target:
                bad.append((gp, ar, c['name']))
        if over:
            print(f'  ★★ 相交 {len(over)} 处：')
            for ar, gp, nm in sorted(over, key=lambda r: -r[0]):
                print(f'      {ar:>9.1f} m²   {nm}')
        else:
            print('  ✓ 无相交')
        if bad:
            print(f'  ★ 净距不足 {len(bad)} 处（< {target:.0f} m）：')
            for gp, ar, nm in sorted(bad):
                print(f'      {gp:>7.1f} m    {nm}')
        else:
            print(f'  ✓ 全部净距 ≥ {target:.0f} m')


if __name__ == '__main__':
    main()
