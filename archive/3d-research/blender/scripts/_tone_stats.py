#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""影调体检 —— 对**任意目录**的成图跑全图明暗 + 色温指标。

★ 为什么单独有一个工具（`_ab_green_stats.py` 不够用）：
  `_ab_green_stats.py` 是 **A/B 专用**的 —— 它按 `AB*.png` 前缀找"前后同名对"，
  没有配对就一行不输出。日常"这批图渲得怎么样"的体检需要的是**无配对**的版本。
  两个工具的分工：
    · `_tone_stats.py`      —— 单目录体检（本文件），不需要 before/after
    · `_ab_green_stats.py`  —— 双目录 A/B 量化，带绿像素专项
    · `_sky_stats.py`       —— 只查天空色相（上 N% 行 + V>0.55）

指标口径（全项目统一，见 skill「气氛标定」条）：
  · 平均亮度     ImageStat.mean 灰度
  · 反差 σ       ImageStat.stddev 灰度
  · 过曝%        灰度 ≥ 246
  · 死黑%        灰度 ≤ 15
  · 整幅 R−B     **色温**。这是"偏蓝 / 偏暖"的唯一可靠判据 ——
                 只看亮度四个指标**完全看不出**色偏（本项目踩过：四个指标全达标，
                 天空却是金褐色）。经验值：
                   晴天配方 ≈ −13    阴天 V3 ≈ −16（阴天略冷，合理）
                   阴天 V1 ≈ +21（金褐，错）   阴天 V2 ≈ −33（过蓝，错）

用法：
    python _tone_stats.py <目录> [--prefix 质感] [--sort avg|rminusb]
    python _tone_stats.py <目录> <目录2> ...          # 多目录连续体检
"""
import os
import sys

from PIL import Image, ImageStat

OVER = 246   # 过曝阈值
DEAD = 15    # 死黑阈值


def tone(path):
    im = Image.open(path).convert('RGB')
    g = im.convert('L')
    st = ImageStat.Stat(g)
    avg = st.mean[0]
    sig = st.stddev[0]

    hist = g.histogram()                       # 256 桶
    n = float(sum(hist))
    over = sum(hist[OVER:]) / n * 100.0
    dead = sum(hist[:DEAD + 1]) / n * 100.0

    # 整幅色温：R−B 的均值差（用 ImageStat 分别取通道，比逐像素快得多）
    sr, sb = ImageStat.Stat(im).mean[0], ImageStat.Stat(im).mean[2]
    return {
        'avg': avg, 'sig': sig, 'over': over, 'dead': dead,
        'rminusb': sr - sb, 'w': im.size[0], 'h': im.size[1],
    }


def verdict(r, is_overcast):
    v = []
    if r['over'] > 5.0:
        v.append('过曝偏高')
    if r['dead'] > 3.0:
        v.append('死黑偏高')
    if r['sig'] < 45:
        v.append('反差偏低(发灰)')
    rb = r['rminusb']
    if is_overcast:
        if rb > -8:
            v.append('★偏暖(阴天应更冷)')
        elif rb < -26:
            v.append('★过蓝')
        else:
            v.append('色温正常')
    else:
        if rb < -22:
            v.append('★过蓝')
        elif rb > 6:
            v.append('★偏暖')
        else:
            v.append('色温正常')
    return ' '.join(v)


def green_uniformity(path, step=2, lag=5):
    """绿像素的**微纹理** —— 回答"草坪是不是一块平色"。

    ★ 为什么要单独量（2026-09-24）：草坪饱和度提到 V2.5 之后，"**一块平色**"
      的观感反而更明显了 —— 低饱和的绿还像"草地"，高饱和的均匀绿更像"**绿漆**"。
      饱和度是"颜色对不对"，微纹理是"**材质成不成立**"，两码事。

    ★★ 口径踩过一次坑，别退回旧版 ★★
      第一版量的是绿像素 R/G/B 的 **σ**，结果 7 张图全在 16~52 —— 看起来"完全不
      平色"，但 3× 放大一看**草坪确实是一块纯平色**。错在哪：
        σ 是**整幅**统计量，它把**树冠 / 草地 / 绿篱 / 亮草坪 / 暗草坪**全混在一起，
        量到的是"画面里有几种绿"，**不是"某一处绿有没有纹理"**。
        （顺带：阈值 4/8 因此是死代码，永远触发不了。）

    ⇒ 正解是**高频 + 看分布**：对每个绿像素，取它**右边 `lag` 像素**处的邻居，
      求 |Δ|。大范围的明暗梯度（坡向、阴影、AO）在 5 px 尺度上几乎不变，被自动消掉，
      剩下的就是**纹理**。

    ★★ 第二版仍然错了，别再退回"取均值"★★
      第二版把 |Δ| **求平均**，7 张图全在 4.09~37.16 —— 又是"看着都不平"，
      但草坪明明是一块纯平色。错因同上一版，只是换了个统计量：
        均值被**树冠**带偏了。树冠是一颗颗小球，5 px 尺度上全是边缘，|Δ| 很大；
        教学区前庭那张绿占比 35%，其中大半是树冠 ⇒ 均值被拉到 6.2，
        **草坪那一片的 0 被完全淹没了**。
      ⇒ 必须看**分布**，不是均值。本函数返回：
        · `flat`  = |Δ| < 0.5 的绿像素**占比** ← **这才是判据**（"有多少绿是死的"）
        · `med`   = 中位数 |Δ|
        · `avg`   = 均值（**仅供参考，会被树冠带偏，不要用它下结论**）

      判据：
        · `flat > 0.55`  ⇒ 画面里**过半的绿是纯平色** —— 草坪/林地没有材质
        · `flat 0.25~0.55` ⇒ 一半一半（大片草坪 + 树冠的正常情况）
        · `flat < 0.25`  ⇒ 绿主要是树，没有大面积平涂

    ★ `lag=5` 的理由：1 px 相邻差在 Cycles 降噪后接近 0（噪声被抹平），
      取 5 px 才能量到"叶片的团块感"而不是"渲染噪声"。
    """
    im = Image.open(path).convert('RGB')
    w, h = im.size
    px = im.load()
    n = 0
    s = [0.0, 0.0, 0.0]
    diffs = []
    for y in range(0, h - lag, step):
        for x in range(0, w - lag, step):
            r, g, b = px[x, y]
            if not (g > r + 8 and g > b + 8 and g > 40):   # 绿像素
                continue
            n += 1
            s[0] += r; s[1] += g; s[2] += b
            r2, g2, b2 = px[x + lag, y]
            diffs.append((abs(r2 - r) + abs(g2 - g) + abs(b2 - b)) / 3.0)
    if n < 50:
        return None
    diffs.sort()
    return {
        'n': n,
        'ratio': n / float((w // step) * (h // step)),
        'avg_rgb': tuple(c / n for c in s),
        'flat': sum(1 for v in diffs if v < 0.5) / float(n),   # ← 判据
        'med': diffs[n // 2],
        'avg': sum(diffs) / n,
    }


def scan(d, prefix=None):
    names = sorted(f for f in os.listdir(d) if f.endswith('.png'))
    if prefix:
        names = [f for f in names if f.startswith(prefix)]
    if not names:
        # ★ 扫到 0 个必须**非零退出** —— 见 skill「量化脚本的三个陷阱」：
        #   只 print 然后 return，`$?=0` 会骗过所有 `&&` 链，
        #   调用方会以为"跑完了、没问题"。
        sys.stderr.write('!! %s 下没有可体检的 PNG（prefix=%s）\n' % (d, prefix))
        sys.exit(1)
    print('=' * 118)
    print('影调体检 —— %s%s（共 %d 张）' % (d, ('（前缀 %s）' % prefix) if prefix else '', len(names)))
    print('=' * 118)
    print('%-34s %6s %6s %7s %7s %8s %7s %9s %7s  %s'
          % ('图', '亮度', 'σ', '过曝%', '死黑%', 'R−B', '绿占比', '绿平涂占比', '中位Δ', '判定'))
    rows = []
    for nm in names:
        p = os.path.join(d, nm)
        r = tone(p)
        rows.append((nm, r))
        gu = green_uniformity(p)
        gs = ''                       # ★ 必须先初始化：gu is None 时下面不会赋值
        if gu is None:
            gt, gm = '—', '—'         # 画面里几乎没有绿像素（纯建筑 / 滨水机位）
        else:
            gt = '%.0f%%' % (gu['flat'] * 100)
            gm = '%.2f' % gu['med']
            if gu['flat'] > 0.55:
                gs = '★过半绿为平涂(无材质)'
            elif gu['flat'] > 0.25:
                gs = '·绿有平涂区'
        is_oc = '阴天' in nm
        print('%-34s %6.1f %6.1f %7.2f %7.2f %8.1f %6.1f%% %9s %7s  %s'
              % (nm[:-4], r['avg'], r['sig'], r['over'], r['dead'],
                 r['rminusb'], (gu['ratio'] * 100 if gu else 0.0), gt, gm,
                 (verdict(r, is_oc) + ' ' + gs).strip()))
    if rows:
        k = len(rows)
        print('-' * 118)
        print('%-34s %6.1f %6.1f %7.2f %7.2f %8.1f'
              % ('平均 / 共 %d 张' % k,
                 sum(r['avg'] for _, r in rows) / k,
                 sum(r['sig'] for _, r in rows) / k,
                 sum(r['over'] for _, r in rows) / k,
                 sum(r['dead'] for _, r in rows) / k,
                 sum(r['rminusb'] for _, r in rows) / k))
    print()


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        print(__doc__)
        return
    prefix = None
    if '--prefix' in sys.argv:
        prefix = sys.argv[sys.argv.index('--prefix') + 1]
    for d in args:
        if not os.path.isdir(d):
            print('跳过（不是目录）：%s' % d)
            continue
        scan(d, prefix)


if __name__ == '__main__':
    main()
