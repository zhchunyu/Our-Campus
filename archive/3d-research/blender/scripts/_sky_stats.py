# -*- coding: utf-8 -*-
"""
_sky_stats.py —— 天空色相/饱和度体检（气氛标定的**色相**指标）
=====================================================================================
起因：2026-09-24 发现「阴天漫射」预设的天空渲出来是**金褐色**，像沙尘暴，
不像阴天。而上一轮标定只量了**亮度 / 反差 / 过曝 / 死黑** —— 四个数全是明暗指标，
**一个色相指标都没有** ⇒ 明暗"对了"，颜色是错的，一路没人发现。

★ 教训：**气氛标定必须带色相/白平衡指标，不能只看直方图的明暗。**

判据（阴天 / 多云天空应当接近中性）：
    S（HSV 饱和度）  ≤ 0.10   —— 高于 0.20 就是"有色天空"，阴天不该有
    V（明度）        0.70~0.95 —— 太暗是暮色，太亮是过曝
    色相            无偏好，但**暖偏（R 明显 > B）**在阴天里是可疑的

做法：取画面上部 30% 的行（天空最可能在那里），挑 `V > 0.55` 的像素当"天空像素"
（滤掉建筑与地面），统计均值。

用法：
    python _sky_stats.py <目录> [--prefix SK] [--top 0.30]
"""

import os
import sys

from PIL import Image


def hsv_sv(r, g, b):
    mx = max(r, g, b)
    mn = min(r, g, b)
    return (0.0 if mx == 0 else (mx - mn) / float(mx)), mx / 255.0


def sky_stats(path, top_frac=0.30, vmin=0.55):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    im = im.crop((0, 0, w, max(1, int(h * top_frac))))
    px = list(im.getdata())
    sel = []
    for p in px:
        r, g, b = p[0], p[1], p[2]
        s, v = hsv_sv(r, g, b)
        if v > vmin:
            sel.append((r, g, b, s, v))
    if not sel:
        return None
    n = len(sel)
    avg = tuple(sum(x[i] for x in sel) / n for i in range(3))
    return {'n': n, 'ratio': n / float(len(px)), 'avg': avg,
            's': sum(x[3] for x in sel) / n, 'v': sum(x[4] for x in sel) / n}


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    d = sys.argv[1]
    prefix = 'SK'
    top = 0.30
    if '--prefix' in sys.argv:
        prefix = sys.argv[sys.argv.index('--prefix') + 1]
    if '--top' in sys.argv:
        top = float(sys.argv[sys.argv.index('--top') + 1])

    names = sorted(f for f in os.listdir(d) if f.startswith(prefix) and f.endswith('.png'))
    print('=' * 92)
    print('天空体检（上 %.0f%% 行，V>0.55）—— 阴天目标：S ≤ 0.10 且 V 0.70~0.95' % (top * 100))
    print('=' * 92)
    print('%-40s %14s %7s %7s %8s  %s' % ('图', '天空均值 RGB', 'S', 'V', '占上部', '判定'))
    for nm in names:
        r = sky_stats(os.path.join(d, nm), top)
        if r is None:
            print('%-40s %14s' % (nm[:-4], '(没有天空像素)'))
            continue
        verdict = []
        if r['s'] > 0.20:
            verdict.append('★有色天空')
        elif r['s'] > 0.10:
            verdict.append('·略偏色')
        else:
            verdict.append('中性')
        if r['v'] > 0.95:
            verdict.append('过曝')
        elif r['v'] < 0.60:
            verdict.append('偏暗')
        if r['avg'][0] - r['avg'][2] > 12:
            verdict.append('暖偏(可疑)')
        print('%-40s %14s %7.3f %7.3f %7.1f%%  %s'
              % (nm[:-4], '(%3d,%3d,%3d)' % tuple(round(c) for c in r['avg']),
                 r['s'], r['v'], r['ratio'] * 100, ' '.join(verdict)))


if __name__ == '__main__':
    main()
