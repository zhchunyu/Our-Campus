# -*- coding: utf-8 -*-
"""按归一化坐标裁切图片并放大，便于核对细节。"""
import os
import sys
from PIL import Image

# 用法: crop_detail.py <src> <out_dir> <tag> x0,y0,x1,y1 [x0,y0,x1,y1 ...]
src, out_dir, tag = sys.argv[1], sys.argv[2], sys.argv[3]
boxes = sys.argv[4:]
os.makedirs(out_dir, exist_ok=True)
im = Image.open(src).convert('RGB')
W, H = im.size
print(f'源图 {W}x{H}')
tiles = []
for i, spec in enumerate(boxes):
    x0, y0, x1, y1 = (float(v) for v in spec.split(','))
    box = (int(x0 * W), int(y0 * H), int(x1 * W), int(y1 * H))
    crop = im.crop(box)
    scale = max(1, min(4, int(900 / max(1, crop.width))))
    crop = crop.resize((crop.width * scale, crop.height * scale), Image.LANCZOS)
    out = os.path.join(out_dir, f'{tag}_{i:02d}.png')
    crop.save(out)
    tiles.append((spec, crop.size, out))
    print(f'  [{i}] {spec} -> {crop.size} {out}')
