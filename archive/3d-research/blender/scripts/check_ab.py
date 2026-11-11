"""A/B 成图对照 —— 量化"我改了 X，成图到底变了多少"。

用途：任何会改变成图观感的改动（光照 / 配色 / 材质 / 几何）在**全量重渲之前**，
先渲 2~3 张有代表性的机位做对照，用数字决定"值不值得重渲"。

用法：
    python check_ab.py <旧目录> <新目录> [--out 对照图输出目录]

输出：
    每个同名文件一行 —— 平均绝对差 / 受影响像素占比 / 最大差 / 平均亮度变化
    并在 --out 目录写 `AB_<名字>.png`：左旧 右新 中缝标注差量（方便 Read 看图判断）

判读（经验值，来自本项目 R0~R6 的实测）：
    平均绝对差 < 2.0   → 肉眼基本看不出，**不值得重渲**
    2.0 ~ 6.0          → 可感知但轻微，看具体是"整体变亮/变暗"还是局部
    > 6.0              → 明显，需要重渲
    ★ 但**平均亮度变化**才是关键：配色整体平移（如清水混凝土 0.249→0.368）
      会同时抬高平均差与亮度；这时要看**受影响像素占比**，
      占比 > 40% 说明是全园级变化，不是局部噪点。

★ 依赖 PIL（本项目默认 venv 里有：`~/.workbuddy-ai/binaries/python/envs/default`）。
  与 `check_palette.py`（刻意做成纯 Python 无依赖）分工不同：那个做单图体检，这个做两图对照。
"""
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFont


def stats(a_path, b_path):
    a = Image.open(a_path).convert('RGB')
    b = Image.open(b_path).convert('RGB')
    if a.size != b.size:
        b = b.resize(a.size)
    # 用 tobytes() 而非 getdata()：后者在 Pillow 14 会被移除，且慢一个数量级
    db = ImageChops.difference(a, b).tobytes()
    ab = a.tobytes()
    bb = b.tobytes()
    n = len(db) // 3
    mean_abs = sum(db) / len(db)
    worst = max(db)
    # "受影响像素"：任一通道差 > 8（低于 8 在 8bit 里基本是抗锯齿/降噪噪声）
    affected = sum(1 for i in range(0, len(db), 3)
                   if max(db[i], db[i + 1], db[i + 2]) > 8) / n * 100.0
    la = sum(ab) / len(ab)
    lb = sum(bb) / len(bb)
    return dict(mean_abs=mean_abs, worst=worst, affected=affected,
                lum_old=la, lum_new=lb, size=a.size)


def side_by_side(a_path, b_path, out_path, title):
    a = Image.open(a_path).convert('RGB')
    b = Image.open(b_path).convert('RGB')
    if a.size != b.size:
        b = b.resize(a.size)
    w, h = a.size
    gap, bar = 8, 26
    canvas = Image.new('RGB', (w * 2 + gap, h + bar), (24, 24, 26))
    canvas.paste(a, (0, bar))
    canvas.paste(b, (w + gap, bar))
    d = ImageDraw.Draw(canvas)
    try:
        f = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 15)
    except Exception:
        f = ImageFont.load_default()
    d.text((6, 5), f'旧 {title}', fill=(230, 230, 230), font=f)
    d.text((w + gap + 6, 5), f'新 {title}', fill=(255, 214, 130), font=f)
    canvas.save(out_path)
    return out_path


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    out = None
    if '--out' in sys.argv:
        out = sys.argv[sys.argv.index('--out') + 1]
        args = [a for a in args if a != out]
    if len(args) != 2:
        print(__doc__)
        return 2
    d_old, d_new = args
    if out:
        os.makedirs(out, exist_ok=True)
    names = sorted(f for f in os.listdir(d_old) if f.lower().endswith('.png'))
    hit = 0
    print(f'{"文件":<26}{"平均绝对差":>10}{"受影响%":>9}{"最大差":>7}'
          f'{"旧亮度":>8}{"新亮度":>8}{"Δ亮度":>8}')
    print('-' * 78)
    for nm in names:
        p_new = os.path.join(d_new, nm)
        if not os.path.exists(p_new):
            print(f'{nm:<26}{"(新目录无此图)":>10}')
            continue
        s = stats(os.path.join(d_old, nm), p_new)
        print(f'{nm:<26}{s["mean_abs"]:>10.2f}{s["affected"]:>8.1f}%'
              f'{s["worst"]:>7}{s["lum_old"]:>8.1f}{s["lum_new"]:>8.1f}'
              f'{s["lum_new"] - s["lum_old"]:>+8.1f}')
        hit += 1
        if out:
            side_by_side(os.path.join(d_old, nm), p_new,
                         os.path.join(out, 'AB_' + nm), nm.rsplit('.', 1)[0])
    print('-' * 78)
    print(f'共对照 {hit} 张' + (f'；左右拼图写入 {out}' if out else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
