# -*- coding: utf-8 -*-
"""check_palette_batch.py —— 批量配色体检（PIL 版）。

为什么另起一个：`check_palette.py` 刻意做成**纯 Python 无依赖**（单图体检、便于搬用），
但 63 张 1600×900 跑下来会超时被 SIGTERM 打断。本脚本用 PIL 做同一套度量，
面向**整目录批量**场景。

度量口径与 `check_palette.py` **完全一致**（改一处必须改两处）：
    暖 = R−B > 12 的像素占比     冷 = B−R > 12 的像素占比
    暗 = L < 45                  亮 = L > 210        （L = 0.299R+0.587G+0.114B）
★ **必须分上下半图**：天空天然是蓝的，整图统计永远判成"整园发蓝"。
  判建筑冷暖看**下半图**（默认 y ∈ [0.45, 1.0]）。

用法：
    python check_palette_batch.py <目录A> [目录B ...] [--lower 0.45] [--step 2]

给两个目录时会**并排对照**（用于"改动前 / 改动后"），并打印均值与变化量。
"""
import os
import sys

from PIL import Image


def stats(path, y0=0.45, y1=1.0, step=2):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    px = im.load()
    n = warm = cool = dark = bright = 0
    for y in range(int(h * y0), int(h * y1), step):
        for x in range(0, w, step):
            r, g, b = px[x, y]
            L = (r * 299 + g * 587 + b * 114) // 1000
            if r - b > 12:
                warm += 1
            elif b - r > 12:
                cool += 1
            if L < 45:
                dark += 1
            elif L > 210:
                bright += 1
            n += 1
    return dict(warm=100.0 * warm / n, cool=100.0 * cool / n,
                dark=100.0 * dark / n, bright=100.0 * bright / n)


def collect(d):
    return sorted(f for f in os.listdir(d)
                  if f.lower().endswith('.png'))


def main(argv):
    # ★★ 参数解析修过一个 bug（2026-09-26 S5）：
    #   原来写的是 `dirs = [a for a in argv if not a.startswith('--')]` ——
    #   于是 `--step 4` 里的 **`4` 被当成目录**，
    #   跑完第一张就 `FileNotFoundError: 系统找不到指定的路径。: '4'`。
    #   症状很坑：**统计结果已经打出来了**，报错在最后，看起来像"结果有但脚本挂了"。
    #   现在把 `--flag value` 的 value 也一并跳过。
    dirs, _skip = [], False
    for _a in argv:
        if _skip:
            _skip = False
            continue
        if _a in ('--lower', '--step'):
            _skip = True
            continue
        if _a.startswith('--'):
            continue
        dirs.append(_a)
    if not dirs:
        print(__doc__)
        return 2
    y0 = float(argv[argv.index('--lower') + 1]) if '--lower' in argv else 0.45
    step = int(argv[argv.index('--step') + 1]) if '--step' in argv else 2

    res = []
    for d in dirs:
        files = collect(d)
        rows = {}
        for f in files:
            rows[f] = stats(os.path.join(d, f), y0=y0, step=step)
        res.append((d, rows))
        n = len(files)
        mw = sum(r['warm'] for r in rows.values()) / n
        mc = sum(r['cool'] for r in rows.values()) / n
        md = sum(r['dark'] for r in rows.values()) / n
        mb = sum(r['bright'] for r in rows.values()) / n
        print('[%s]' % os.path.basename(d.rstrip('/\\')))
        print('  %d 张 ｜ 暖%% 均值 %.2f ｜ 冷%% 均值 %.2f ｜ 「冷−暖」 %+.2f ｜ 暗%% %.2f ｜ 亮%% %.2f'
              % (n, mw, mc, mc - mw, md, mb))
        # 逐张里「冷压倒暖」最严重的 5 张（判据：cool−warm > 15）
        bad = sorted(rows.items(), key=lambda kv: kv[1]['cool'] - kv[1]['warm'], reverse=True)[:5]
        for k, v in bad:
            print('    冷−暖 %+6.2f  暖%5.2f 冷%5.2f  %s' % (v['cool'] - v['warm'], v['warm'], v['cool'], k))

    if len(res) == 2:
        (d1, r1), (d2, r2) = res
        n = len(r1)
        mw1 = sum(r['warm'] for r in r1.values()) / n
        mw2 = sum(r['warm'] for r in r2.values()) / n
        mc1 = sum(r['cool'] for r in r1.values()) / n
        mc2 = sum(r['cool'] for r in r2.values()) / n
        print('')
        print('===== 变化（%s → %s）=====' % (os.path.basename(d1.rstrip('/\\')),
                                              os.path.basename(d2.rstrip('/\\'))))
        print('  暖%% 均值   %.2f → %.2f  （%+.2f）' % (mw1, mw2, mw2 - mw1))
        print('  冷%% 均值   %.2f → %.2f  （%+.2f）' % (mc1, mc2, mc2 - mc1))
        print('  「冷−暖」   %+.2f → %+.2f  （%+.2f）' % (mc1 - mw1, mc2 - mw2,
                                                        (mc2 - mw2) - (mc1 - mw1)))
        warmer = sum(1 for f in r1 if f in r2 and r2[f]['warm'] > r1[f]['warm'])
        print('  变暖的张数 %d / %d' % (warmer, n))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
