"""配色量化验收 —— 纯 Python 读 PNG 统计（无 PIL / numpy 依赖）。

铁律 20：**配色验收必须量化**，"看着还行"不算。
本脚本给每张成图输出一组可比较的数字，用来判断
"整园发蓝 / 发灰 / 太冷 / 太脏"这类主观问题到底存不存在。

用法：
    python check_palette.py <png 或目录> [更多路径...]
    python check_palette.py ../renders/R5_*.png

输出字段：
    mean RGB    全图平均色。**B > R 就是偏冷**（铁律 19 的量化入口）
    暖% / 冷%   像素级 R-B 分类：
                  暖   R − B >  12
                  冷   B − R >  12
                  中性 其余
                "整园发蓝"通常表现为 冷% − 暖% > 15
    SD(L)       亮度标准差。**越低越"糊成一团"**，大片同色会掉到 30 以下
    暗% / 亮%   L < 45 / L > 210 的占比。暗% 过高 = 屋面读成黑块

★ 为什么分「上 45% / 下 55%」两段报：
  校园机位大多天空占上小半，而天空**天然是蓝的** —— 只统计全图会被天空带偏，
  把正常的图判成"整园发蓝"。**判"建筑冷暖"要看下半图**，
  上半图留给"天空/远山是否发灰"（haze_density 的入口）。
"""
import os
import struct
import sys
import zlib


def read_png(path):
    d = open(path, 'rb').read()
    i, idat = 8, b''
    w = h = bd = ct = 0
    while i < len(d):
        ln = struct.unpack('>I', d[i:i + 4])[0]
        typ = d[i + 4:i + 8]
        data = d[i + 8:i + 8 + ln]
        if typ == b'IHDR':
            w, h, bd, ct = struct.unpack('>IIBB', data[:10])
        elif typ == b'IDAT':
            idat += data
        elif typ == b'IEND':
            break
        i += 12 + ln
    raw = zlib.decompress(idat)
    ch = 4 if ct == 6 else 3
    stride = w * ch
    rows = []
    prev = bytearray(stride)
    pos = 0
    for _y in range(h):
        f = raw[pos]; pos += 1
        line = bytearray(raw[pos:pos + stride]); pos += stride
        if f == 1:
            for x in range(ch, stride):
                line[x] = (line[x] + line[x - ch]) & 255
        elif f == 2:
            for x in range(stride):
                line[x] = (line[x] + prev[x]) & 255
        elif f == 3:
            for x in range(stride):
                a = line[x - ch] if x >= ch else 0
                line[x] = (line[x] + ((a + prev[x]) >> 1)) & 255
        elif f == 4:
            for x in range(stride):
                a = line[x - ch] if x >= ch else 0
                b = prev[x]
                c = prev[x - ch] if x >= ch else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x] + pr) & 255
        rows.append(bytes(line))
        prev = line
    return w, h, ch, rows


def stats(path, step=2, y0=0.0, y1=1.0):
    w, h, ch, rows = read_png(path)
    ya, yb = int(h * y0), int(h * y1)
    n = 0
    sr = sg = sb = 0
    sl = sl2 = 0
    warm = cool = dark = bright = 0
    for y in range(ya, yb, step):
        r = rows[y]
        for x in range(0, w, step):
            o = x * ch
            R, G, B = r[o], r[o + 1], r[o + 2]
            sr += R; sg += G; sb += B
            L = (R * 299 + G * 587 + B * 114) // 1000
            sl += L; sl2 += L * L
            if R - B > 12:
                warm += 1
            elif B - R > 12:
                cool += 1
            if L < 45:
                dark += 1
            elif L > 210:
                bright += 1
            n += 1
    mr, mg, mb = sr / n, sg / n, sb / n
    ml = sl / n
    sd = max(0.0, sl2 / n - ml * ml) ** 0.5
    return dict(name=os.path.basename(path), mr=mr, mg=mg, mb=mb, ml=ml, sd=sd,
                warm=100.0 * warm / n, cool=100.0 * cool / n,
                dark=100.0 * dark / n, bright=100.0 * bright / n)


def verdict(s, low_sd=30.0, cool_margin=15.0, dark_hi=25.0):
    f = []
    if s['mb'] - s['mr'] > 4:
        f.append('偏冷')
    if s['cool'] - s['warm'] > cool_margin:
        f.append('冷压倒暖')
    if s['sd'] < low_sd:
        f.append('发糊')
    if s['dark'] > dark_hi:
        f.append('暗块偏多')
    return ' '.join(f) if f else '—'


def main(argv):
    targets = []
    for a in argv:
        if os.path.isdir(a):
            targets += [os.path.join(a, f) for f in sorted(os.listdir(a))
                        if f.lower().endswith('.png')]
        else:
            targets.append(a)
    if not targets:
        print(__doc__)
        return
    hdr = '%-26s | %-24s | %s' % ('file', '全图 R/G/B  L  SD', '判读')
    print('==== 全图 ====')
    print(hdr)
    for t in targets:
        try:
            s = stats(t)
        except Exception as e:
            print('%-26s 读取失败: %s' % (os.path.basename(t), e))
            continue
        print('%-26s | %6.1f %6.1f %6.1f  %5.1f %5.1f | %s'
              % (s['name'], s['mr'], s['mg'], s['mb'], s['ml'], s['sd'], verdict(s)))

    print()
    print('==== 上 45%（天空 / 远山） vs 下 55%（建筑 / 场地） ====')
    print('%-26s | %-22s | %-22s' % ('file', '上: 暖% 冷% 暗% 判读', '下: 暖% 冷% 暗% 判读'))
    for t in targets:
        try:
            up = stats(t, y0=0.0, y1=0.45)
            dn = stats(t, y0=0.45, y1=1.0)
        except Exception:
            continue
        print('%-26s | %5.1f %5.1f %5.1f  %-12s | %5.1f %5.1f %5.1f  %s'
              % (os.path.basename(t), up['warm'], up['cool'], up['dark'],
                 verdict(up, low_sd=0, dark_hi=40), dn['warm'], dn['cool'], dn['dark'],
                 verdict(dn)))



if __name__ == '__main__':
    main(sys.argv[1:])
