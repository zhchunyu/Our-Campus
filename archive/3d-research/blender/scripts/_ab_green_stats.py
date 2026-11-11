# -*- coding: utf-8 -*-
"""
_ab_green_stats.py —— 草坪 / 树叶 A/B 的**量化**（不是"看着好像更绿了"）
=====================================================================================
配套 `make_green_ab_config.py`。对比两个目录里**同名**的 PNG，输出：

  1. 全图：平均亮度 / 反差 σ / 过曝% / 死黑%（沿用本项目的度量口径）
  2. 前后像素差：平均差 / 变化像素占比（>8/255 记一次变化）
  3. **绿色像素专项**（这才是 V2.5 真正改的东西）：
       · 绿像素占比（画面里有多少草/树）
       · 绿像素平均 sRGB、HSV 饱和度 S、明度 V
       · 绿像素中**最饱和 1/6** 的均值 —— 对应"草长得最好的那一片"，
         也就是和实景参考图直接可比的那一档
  4. 参考图目标线：`(54,105,4)`，S=0.962 / V=0.412（从实景照片实测）

★ 环境无 numpy ⇒ 全部走 `PIL` + `histogram()`，逐像素用 `list(im.getdata())`。
  1600×900 = 144 万像素，纯 Python 循环约 2~4 s/张，可以接受。

用法：
    python _ab_green_stats.py <before_dir> <after_dir> [--prefix AB]
"""

import os
import sys

from PIL import Image, ImageChops, ImageStat

# 实景参考图实测：草地 sRGB (54,105,4)
REF_RGB = (54, 105, 4)


def _hsv_sv(r, g, b):
    mx, mn = (r, g, b), None
    mx = max(r, g, b)
    mn = min(r, g, b)
    s = 0.0 if mx == 0 else (mx - mn) / float(mx)
    return s, mx / 255.0


def green_stats(im):
    """返回绿像素的统计。判据：绿通道明显占优 + 有饱和度 + 不在死黑/过曝两端。"""
    px = list(im.getdata())
    n = len(px)
    gs = []
    for p in px:
        r, g, b = p[0], p[1], p[2]
        if g <= r + 6 or g <= b + 12:
            continue
        s, v = _hsv_sv(r, g, b)
        if s < 0.20 or v < 0.06 or v > 0.86:
            continue
        gs.append((r, g, b, s, v))
    if not gs:
        return None
    m = len(gs)
    avg = tuple(sum(x[i] for x in gs) / m for i in range(3))
    savg = sum(x[3] for x in gs) / m
    vavg = sum(x[4] for x in gs) / m
    # 最饱和的 1/6
    top = sorted(gs, key=lambda x: -x[3])[:max(1, m // 6)]
    t = len(top)
    tavg = tuple(sum(x[i] for x in top) / t for i in range(3))
    ts = sum(x[3] for x in top) / t
    tv = sum(x[4] for x in top) / t
    return {'ratio': m / float(n), 'avg': avg, 's': savg, 'v': vavg,
            'top': tavg, 'ts': ts, 'tv': tv}


def full_stats(im):
    st = ImageStat.Stat(im.convert('L'))
    h = im.convert('L').histogram()
    n = sum(h)
    over = sum(h[246:]) / float(n) * 100.0
    dead = sum(h[:16]) / float(n) * 100.0
    return {'mean': st.mean[0], 'sd': st.stddev[0], 'over': over, 'dead': dead}


def fmt_rgb(c):
    return '(%3d,%3d,%3d)' % (round(c[0]), round(c[1]), round(c[2]))


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return
    d_before, d_after = sys.argv[1], sys.argv[2]
    prefix = 'AB'
    if '--prefix' in sys.argv:
        prefix = sys.argv[sys.argv.index('--prefix') + 1]

    names = sorted(f for f in os.listdir(d_before) if f.startswith(prefix) and f.endswith('.png'))
    if not names:
        print('!! %s 下没有 %s*.png' % (d_before, prefix))
        return

    print('=' * 96)
    print('参考图草地目标（实景实测）：sRGB %s  S=0.962  V=0.412'
          % fmt_rgb(REF_RGB))
    print('=' * 96)

    for nm in names:
        pa = os.path.join(d_before, nm)
        pb = os.path.join(d_after, nm)
        if not os.path.exists(pb):
            print('\n[%s] 缺 after，跳过' % nm)
            continue
        ia, ib = Image.open(pa).convert('RGB'), Image.open(pb).convert('RGB')
        if ia.size != ib.size:
            print('\n[%s] 尺寸不一致 %s vs %s，跳过' % (nm, ia.size, ib.size))
            continue

        print('\n[%s]  %dx%d' % (nm[:-4], ia.size[0], ia.size[1]))

        # ---- 1. 全图影调 ----
        fa, fb = full_stats(ia), full_stats(ib)
        print('  影调   改前 %6.1f / σ%5.1f / 过曝%5.2f%% / 死黑%5.2f%%' %
              (fa['mean'], fa['sd'], fa['over'], fa['dead']))
        print('         改后 %6.1f / σ%5.1f / 过曝%5.2f%% / 死黑%5.2f%%' %
              (fb['mean'], fb['sd'], fb['over'], fb['dead']))

        # ---- 2. 像素差 ----
        d = ImageChops.difference(ia, ib).convert('L')
        sd = ImageStat.Stat(d)
        h = d.histogram()
        n = sum(h)
        chg = sum(h[9:]) / float(n) * 100.0   # >8/255 记一次变化
        print('  像素差 平均 %.2f / 变化像素占比 %.1f%%' % (sd.mean[0], chg))

        # ---- 3. 绿色专项 ----
        ga, gb = green_stats(ia), green_stats(ib)
        if ga is None or gb is None:
            print('  绿像素 无法统计')
            continue
        print('  绿占比 改前 %5.1f%%  →  改后 %5.1f%%' % (ga['ratio'] * 100, gb['ratio'] * 100))
        print('  绿均值 改前 %s S=%.3f V=%.3f  →  改后 %s S=%.3f V=%.3f'
              % (fmt_rgb(ga['avg']), ga['s'], ga['v'],
                 fmt_rgb(gb['avg']), gb['s'], gb['v']))
        print('  最饱和1/6  改前 %s S=%.3f V=%.3f  →  改后 %s S=%.3f V=%.3f'
              % (fmt_rgb(ga['top']), ga['ts'], ga['tv'],
                 fmt_rgb(gb['top']), gb['ts'], gb['tv']))
        dS = gb['ts'] - ga['ts']
        dV = gb['tv'] - ga['tv']
        print('  ΔS %+.3f   ΔV %+.3f   %s'
              % (dS, dV, '★ 饱和度确实上去了' if dS > 0.02 else '· 饱和度基本没动'))


if __name__ == '__main__':
    main()
