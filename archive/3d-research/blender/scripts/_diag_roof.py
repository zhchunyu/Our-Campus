#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""_diag_roof.py —— **屋面配色专项量化**（S4-d）

为什么不能拿 `_ab_green_stats.py` 凑合：它量的是"绿像素"，而这次改的是**第五立面**。
但这次有一个别人没有的便利 —— **几何完全没动**（同一个种子、同一套建模脚本），
所以"改前 / 改后"两张图**逐像素一一对应**。于是可以直接：

  ① 找**变了**的像素（|Δ|>TH）—— 这批像素**就是屋面**（本次只有屋面材质被改）；
  ② 报出这批像素的**改前 / 改后平均 RGB** —— "从什么色变成什么色"，不靠形容；
  ③ 报 **B>R 占比**（蓝灰判据）与 **过曝占比**（镜面金属判据）的下降。

★ 判据（V3 §3.4）：
  · 旧蓝灰钛锌 (0.172,0.180,0.190) 是 **B>R**；暖灰/铜绿都应该是 **R>B 或 G>B**；
  · 金属度 0.42 → 0.10 + 粗度 0.58 → 0.78 ⇒ 掠射反射的高光斑应当明显减少。

用法：
    python _diag_roof.py <before_dir> <after_dir> [--prefix A] [--th 6]
"""

import os
import sys

from PIL import Image, ImageChops

TH = 6
WHITE = 238


def pair_stats(a_path, b_path, th):
    a = Image.open(a_path).convert('RGB')
    b = Image.open(b_path).convert('RGB')
    if a.size != b.size:
        return None
    d = ImageChops.difference(a, b)
    # 逐像素扫一遍（1600×900 约 1~3 s，可接受；环境无 numpy）
    pa, pb, pd = list(a.getdata()), list(b.getdata()), list(d.getdata())
    n = len(pa)
    sa = [0, 0, 0]
    sb = [0, 0, 0]
    cnt = 0
    a_br = a_white = b_br = b_white = 0
    for i in range(n):
        dr, dg, db = pd[i]
        if dr <= th and dg <= th and db <= th:
            continue
        cnt += 1
        ra, ga, ba = pa[i]
        rb, gb, bb = pb[i]
        sa[0] += ra; sa[1] += ga; sa[2] += ba
        sb[0] += rb; sb[1] += gb; sb[2] += bb
        if ba > ra:
            a_br += 1
        if ba >= WHITE:
            a_white += 1
        if bb > rb:
            b_br += 1
        if bb >= WHITE:
            b_white += 1
    if not cnt:
        return {'n': n, 'chg': 0}
    return {
        'n': n, 'chg': cnt,
        'frac': cnt * 100.0 / n,
        'a': tuple(v / cnt for v in sa),
        'b': tuple(v / cnt for v in sb),
        'a_br': a_br * 100.0 / cnt, 'b_br': b_br * 100.0 / cnt,
        'a_wh': a_white * 100.0 / cnt, 'b_wh': b_white * 100.0 / cnt,
    }


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if len(args) < 2:
        print(__doc__)
        return
    d_a, d_b = args[0], args[1]
    prefix = 'A'
    th = TH
    if '--prefix' in sys.argv:
        prefix = sys.argv[sys.argv.index('--prefix') + 1]
    if '--th' in sys.argv:
        th = int(sys.argv[sys.argv.index('--th') + 1])

    names = sorted(f for f in os.listdir(d_a)
                   if f.startswith(prefix) and f.endswith('.png'))
    if not names:
        print('!! %s 下没有以 %s 开头的 PNG' % (d_a, prefix))
        return
    print('%-26s %8s %8s   %-22s %-22s  %7s %7s  %7s %7s'
          % ('机位', '变化%', '变化px', '改前均色', '改后均色',
             'B>R改前', 'B>R改后', '过曝前', '过曝后'))
    for f in names:
        pb_ = os.path.join(d_b, f)
        if not os.path.exists(pb_):
            print('%-26s （改后目录缺同名文件）' % f[:-4])
            continue
        r = pair_stats(os.path.join(d_a, f), pb_, th)
        if r is None:
            print('%-26s （尺寸不一致）' % f[:-4])
            continue
        if not r['chg']:
            print('%-26s %8.1f %8d   —— 无变化（该机位不含屋面）' % (f[:-4], 0.0, 0))
            continue
        print('%-26s %7.1f%% %8d   (%3.0f,%3.0f,%3.0f)%-8s (%3.0f,%3.0f,%3.0f)%-8s %6.1f%% %6.1f%%  %6.1f%% %6.1f%%'
              % (f[:-4], r['frac'], r['chg'],
                 r['a'][0], r['a'][1], r['a'][2], '',
                 r['b'][0], r['b'][1], r['b'][2], '',
                 r['a_br'], r['b_br'], r['a_wh'], r['b_wh']))


if __name__ == '__main__':
    main()
