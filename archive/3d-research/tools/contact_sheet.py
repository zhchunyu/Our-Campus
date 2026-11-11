# -*- coding: utf-8 -*-
"""把一批图片拼成联系表，便于一次性浏览筛选。

用法：python contact_sheet.py <源目录> <输出png> [列数=4] [单元格宽=420]

★ 标签必须用**系统 CJK 字体**（`msyh.ttc`）：`ImageDraw.text` 不给 font 时
  走 PIL 内置位图字体，**中文全部渲染成乱码方框**（本项目图名全是中文），
  巡检时会读错图。找不到字体就退回默认字体并在末尾告警，不静默。
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

SRC = sys.argv[1]
OUT = sys.argv[2]
COLS = int(sys.argv[3]) if len(sys.argv) > 3 else 4
CELL_W = int(sys.argv[4]) if len(sys.argv) > 4 else 420


def load_font(size):
    """按顺序找系统中文字体；都找不到返回 None（调用处会告警）。"""
    for p in ('C:/Windows/Fonts/msyh.ttc',      # 微软雅黑
              'C:/Windows/Fonts/Deng.ttf',      # 等线
              'C:/Windows/Fonts/simhei.ttf',    # 黑体
              '/System/Library/Fonts/PingFang.ttc',
              '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc'):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size), p
            except Exception:
                continue
    return None, None


FONT, FONT_PATH = load_font(15)

files = sorted(
    f for f in os.listdir(SRC)
    if f.lower().endswith(('.jpg', '.jpeg', '.png'))
)
if not files:
    raise SystemExit('目录里没有图片: ' + SRC)

rows = (len(files) + COLS - 1) // COLS
cell_h = int(CELL_W * 0.72)
pad = 6
label_h = 24
W = COLS * (CELL_W + pad) + pad
H = rows * (cell_h + label_h + pad) + pad

sheet = Image.new('RGB', (W, H), (250, 250, 248))
draw = ImageDraw.Draw(sheet)

for i, name in enumerate(files):
    r, c = divmod(i, COLS)
    x = pad + c * (CELL_W + pad)
    y = pad + r * (cell_h + label_h + pad)
    try:
        im = Image.open(os.path.join(SRC, name)).convert('RGB')
    except Exception as exc:
        print('跳过', name, exc)
        continue
    im.thumbnail((CELL_W, cell_h), Image.LANCZOS)
    sheet.paste(im, (x + (CELL_W - im.width) // 2, y + (cell_h - im.height) // 2))
    draw.text((x + 4, y + cell_h + 4), f'[{i:02d}] {name}',
              fill=(20, 20, 20), font=FONT)

sheet.save(OUT)
print('联系表已生成:', OUT, sheet.size, f'{len(files)} 张')
if FONT is None:
    print('⚠ 没找到系统中文字体，标签为默认位图字体 —— 中文会显示成乱码')
