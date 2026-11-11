# -*- coding: utf-8 -*-
"""
_diag_hero.py —— 定位 15 株主景树的实际落点
=====================================================================================
为什么需要它：主景树被 merge 进 `SITE_主景树_枝/苔/冠` 三个对象里，
**看不到"哪一株在哪"**。结果就是"我明明做了 15 株大树，可是对着图书馆拍一张，
画面里一棵都没有"——典型静默失效：东西建出来了，但不在镜头里。

做法：载入工程 blend，取 `SITE_主景树_冠` 的顶点，按 30 m 网格做二维直方图，
取有量的格子当树心，再按体量排序打印（世界坐标 X 东 / Y 北）。

用法：
    blender.exe --background <blend> --python _diag_hero.py
"""

import collections
import math

import bpy

CELL = 30.0
TARGETS = ['SITE_主景树_冠', 'SITE_主景树_枝', 'SITE_主景树_苔',
           'SITE_树冠', 'SITE_树干']


def stats(name):
    ob = bpy.data.objects.get(name)
    if ob is None:
        print('  %-16s 不存在' % name)
        return None
    vs = [ob.matrix_world @ v.co for v in ob.data.vertices]
    if not vs:
        print('  %-16s 无顶点' % name)
        return None
    xs = [v.x for v in vs]
    ys = [v.y for v in vs]
    zs = [v.z for v in vs]
    print('  %-16s 顶点 %6d  面 %6d   X %.0f~%.0f  Y %.0f~%.0f  Z %.1f~%.1f'
          % (name, len(vs), len(ob.data.polygons), min(xs), max(xs), min(ys), max(ys),
             min(zs), max(zs)))
    return vs


print('=' * 78)
print('对象体量')
print('=' * 78)
hero = stats('SITE_主景树_冠')
for n in TARGETS[1:]:
    stats(n)

if hero:
    bins = collections.Counter()
    for v in hero:
        bins[(int(math.floor(v.x / CELL)), int(math.floor(v.y / CELL)))] += 1
    print('')
    print('=' * 78)
    print('主景树树心（%g m 网格，按顶点数排序，只列前 20）' % CELL)
    print('=' * 78)
    tot = sum(bins.values())
    print('  合计 %d 个格子 / %d 顶点' % (len(bins), tot))
    for (gx, gy), n in bins.most_common(20):
        cx = (gx + 0.5) * CELL
        cy = (gy + 0.5) * CELL
        print('  X %7.0f  Y %7.0f   顶点 %6d  (%.1f%%)'
              % (cx, cy, n, 100.0 * n / tot))

    # 沿中轴（|X|<20）与教学区前庭带（Y≈389）各有多少
    axis = [v for v in hero if abs(v.x) < 20.0]
    teach = [v for v in hero if 250.0 < v.x < 450.0 and 340.0 < v.y < 440.0]
    print('')
    print('  中轴带 |X|<20 m       ：%d 顶点 (%.1f%%)' % (len(axis), 100.0 * len(axis) / tot))
    print('  教学区前庭 X250~450 Y340~440：%d 顶点 (%.1f%%)'
          % (len(teach), 100.0 * len(teach) / tot))
