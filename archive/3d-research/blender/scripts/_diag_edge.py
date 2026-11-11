# -*- coding: utf-8 -*-
"""_diag_edge.py —— 半岛岸线在若干 Y 处的可用宽度（判断主路能不能外推）。只读。"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))


def run(path, extra=None):
    with open(path, encoding='utf-8') as fh:
        src = fh.read()
    g = {'__name__': '__main__', '__file__': path}
    if extra:
        g.update(extra)
    exec(compile(src, path, 'exec'), g)
    return g


g = run(os.path.join(HERE, 'build_campus_site.py'))
P0 = g['P0']
print(f'P0 = {len(P0)} 点')
xs = [p[0] for p in P0]
ys = [p[1] for p in P0]
print(f'岸线包围盒  X {min(xs):.0f} ~ {max(xs):.0f}   Y {min(ys):.0f} ~ {max(ys):.0f}')

RING = g['RING']
print(f'RING = {len(RING)} 点')
print(f'{"Y":>7s}{"岸线Xmin":>10s}{"岸线Xmax":>10s}{"环廊X":>9s}{"西余量":>9s}{"东余量":>9s}')


def x_at_y(poly, y):
    """扫描线求多边形在 y 处的 X 交点（min / max）"""
    hit = []
    n = len(poly)
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        if (a[1] - y) * (b[1] - y) <= 0 and a[1] != b[1]:
            t = (y - a[1]) / (b[1] - a[1])
            hit.append(a[0] + t * (b[0] - a[0]))
    return (min(hit), max(hit)) if hit else (None, None)


for y in (60, 96, 140, 196, 232, 300, 396, 470, 566, 640, 706, 760, 812, 880):
    xa, xb = x_at_y(P0, y)
    xr = x_at_y(RING, y)
    if xa is None or xr is None:
        print(f'{y:>7.0f}   --')
        continue
    print(f'{y:>7.0f}{xa:>10.0f}{xb:>10.0f}{xr[0]:>9.0f}~{xr[1]:<6.0f}'
          f'{xr[0] - xa:>8.0f}{xb - xr[1]:>8.0f}')
