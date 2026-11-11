# -*- coding: utf-8 -*-
"""
_ab_montage.py —— 把 before/after 同名 PNG 拼成"上改前 / 下改后"对照图
=====================================================================================
配套 `make_green_ab_config.py` + `_ab_green_stats.py`。

★ 为什么要上下拼而不是左右拼：
  左右拼在 16:9 画面下每张只剩半幅，看不出草的颗粒与叶的透光；
  上下拼保留整幅宽度，代价是图变高 —— 对照图本来就是**给人凑近看的**，
  不是交付图。每张下方叠一行文字标签（改前 / 改后 + 尺寸）。

★★ 标签**必须显式传**（2026-09-24 修）：
  原来两个标签是硬编码的（`'V2.5 草地高饱和 · 树叶透光 0.32'`）。叶片透光的定案
  从 `trans 0.32` 改成了 `sss 0.85` 之后，**图上的字就开始说谎**了 —— 而对照图
  是拿去给人做判断的，标签错了比没有标签更坏。现在强制用 `--label-a/--label-b`
  传，脚本不再猜。不传就用中性占位（"改前 / 改后"）。

用法：
    python _ab_montage.py <before_dir> <after_dir> <out_dir>
        [--prefix AB] [--maxw 1100]
        [--label-a "改前 …"] [--label-b "改后 …"]
        [--sheet <单张总表.png>]      # 额外把所有配对纵向叠成**一张**，便于一次看全
"""

import os
import sys

from PIL import Image, ImageDraw, ImageFont

LABEL_H = 34

# ★ PIL 的默认位图字体**不含中文** —— 直接 draw.text 写中文会变成一串方框
#   （而且不报错）。必须显式指定系统里的中文字体。
_FONT_CANDIDATES = [
    'C:/Windows/Fonts/msyh.ttc',    # 微软雅黑
    'C:/Windows/Fonts/msyhbd.ttc',
    'C:/Windows/Fonts/simhei.ttf',  # 黑体
    'C:/Windows/Fonts/simsun.ttc',  # 宋体
]


def _font(size=19):
    for p in _FONT_CANDIDATES:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


def load(p, maxw):
    im = Image.open(p).convert('RGB')
    if im.width > maxw:
        im = im.resize((maxw, round(im.height * maxw / im.width)), Image.LANCZOS)
    return im


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        return
    d_before, d_after, d_out = sys.argv[1], sys.argv[2], sys.argv[3]
    prefix = 'AB'
    maxw = 1100
    # ★ 默认标签故意中性 —— 见文件头"标签必须显式传"。不传 = 不带论断，不会说谎。
    lab_a, lab_b = '改前', '改后'
    col_a, col_b = (232, 176, 96), (128, 226, 132)
    sheet = None
    if '--prefix' in sys.argv:
        prefix = sys.argv[sys.argv.index('--prefix') + 1]
    if '--maxw' in sys.argv:
        maxw = int(sys.argv[sys.argv.index('--maxw') + 1])
    if '--label-a' in sys.argv:
        lab_a = sys.argv[sys.argv.index('--label-a') + 1]
    if '--label-b' in sys.argv:
        lab_b = sys.argv[sys.argv.index('--label-b') + 1]
    if '--sheet' in sys.argv:
        sheet = sys.argv[sys.argv.index('--sheet') + 1]

    os.makedirs(d_out, exist_ok=True)
    names = sorted(f for f in os.listdir(d_before)
                   if f.startswith(prefix) and f.endswith('.png'))
    made = []
    pairs = []
    for nm in names:
        pa, pb = os.path.join(d_before, nm), os.path.join(d_after, nm)
        if not os.path.exists(pb):
            continue
        a, b = load(pa, maxw), load(pb, maxw)
        w = max(a.width, b.width)
        h = a.height + b.height + LABEL_H * 2
        cv = Image.new('RGB', (w, h), (22, 22, 24))
        dr = ImageDraw.Draw(cv)
        fnt = _font(19)
        y = 0
        for im, tag, col in ((a, lab_a, col_a), (b, lab_b, col_b)):
            dr.text((10, y + 7), tag, fill=col, font=fnt)
            y += LABEL_H
            cv.paste(im, (0, y))
            y += im.height
        op = os.path.join(d_out, 'AB_' + nm)
        cv.save(op)
        made.append(op)
        pairs.append((nm[:-4], cv))
        print('  %s  %dx%d' % (op, cv.width, cv.height))
    print('共 %d 张对照图' % len(made))

    # ---- 额外：把所有配对纵向叠成**一张**总表 --------------------------------
    if sheet and pairs:
        HEAD = 40
        W = max(c.width for _, c in pairs)
        H = sum(c.height + HEAD for _, c in pairs) + 8
        sh = Image.new('RGB', (W, H), (16, 16, 18))
        sd = ImageDraw.Draw(sh)
        fh = _font(24)
        y = 0
        for nm, c in pairs:
            sd.rectangle([0, y, W, y + HEAD], fill=(34, 34, 40))
            sd.text((12, y + 8), nm, fill=(240, 240, 245), font=fh)
            y += HEAD
            sh.paste(c, (0, y))
            y += c.height
            sd.line([(0, y - 1), (W, y - 1)], fill=(90, 90, 100))
        sh.save(sheet)
        print('总表：%s  %dx%d' % (sheet, sh.width, sh.height))


if __name__ == '__main__':
    main()
