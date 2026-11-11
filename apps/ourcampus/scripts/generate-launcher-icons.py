"""Convert the user-supplied icon into Android and web resource sizes."""
import argparse
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}


def save_scaled(image, path, size):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.resize((size, size), Image.Resampling.LANCZOS).save(path, optimize=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / 'public/assets/brand/ourcampus-teammate-icon-1024.png')
    args = parser.parse_args()
    if not args.source.is_file():
        parser.error('Icon source missing; provide a square PNG with --source')
    full = Image.open(args.source).convert('RGBA')
    if full.width != full.height:
        parser.error('Icon source must be square')
    background = full.getpixel((0, 0))
    background_hex = '#' + ''.join(f'{v:02X}' for v in background[:3])
    # Keep the complete supplied artwork in the central 72dp adaptive viewport.
    foreground = Image.new('RGBA', (1080, 1080), (0, 0, 0, 0))
    foreground.paste(full.resize((720, 720), Image.Resampling.LANCZOS), (180, 180))
    # Theme icons use a single-color silhouette of the supplied C and dot.
    symbol_alpha = Image.eval(full.convert('L'), lambda v: round(max(0, min(255, (v - 52) * 255 / 30))))
    monochrome_alpha = Image.new('L', (1080, 1080), 0)
    monochrome_alpha.paste(symbol_alpha.resize((720, 720), Image.Resampling.LANCZOS), (180, 180))
    monochrome = Image.new('RGBA', foreground.size, (255, 255, 255, 255))
    monochrome.putalpha(monochrome_alpha)
    full = full.resize((1024, 1024), Image.Resampling.LANCZOS)
    circle_mask = Image.new('L', (1024, 1024), 0)
    ImageDraw.Draw(circle_mask).ellipse((0, 0, 1023, 1023), fill=255)
    round_icon = full.copy()
    round_icon.putalpha(circle_mask)

    res = ROOT / 'android/app/src/main/res'
    for density, factor in DENSITIES.items():
        output = res / f'mipmap-{density}'
        save_scaled(full, output / 'ic_launcher.png', round(48 * factor))
        save_scaled(round_icon, output / 'ic_launcher_round.png', round(48 * factor))
        save_scaled(foreground, output / 'ic_launcher_foreground.png', round(108 * factor))
        save_scaled(monochrome, output / 'ic_launcher_monochrome.png', round(108 * factor))

    (res / 'drawable/ic_launcher_background.xml').write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">\n'
        f'    <solid android:color="{background_hex}" />\n</shape>\n', encoding='utf-8')
    (res / 'values/ic_launcher_background.xml').write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        f'    <color name="ic_launcher_background">{background_hex}</color>\n</resources>\n', encoding='utf-8')
    (res / 'drawable-v24/ic_launcher_foreground.xml').write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<bitmap xmlns:android="http://schemas.android.com/apk/res/android"\n'
        '    android:src="@mipmap/ic_launcher_foreground" android:gravity="center" />\n', encoding='utf-8')

    brand = ROOT / 'public/assets/brand'
    save_scaled(full, brand / 'ourcampus-icon-1024.png', 1024)
    save_scaled(full, brand / 'ourcampus-icon-192.png', 192)
    save_scaled(full, brand / 'ourcampus-icon-32.png', 32)
    preview = Image.new('RGB', (720, 320), (235, 233, 228))
    for image, box in [(full, (54, 50, 220)), (round_icon, (318, 50, 220)), (full, (610, 136, 48))]:
        x, y, side = box
        icon = image.resize((side, side), Image.Resampling.LANCZOS)
        if image is full and side > 48:
            rounded = Image.new('L', icon.size, 0)
            ImageDraw.Draw(rounded).rounded_rectangle((0, 0, side - 1, side - 1), radius=side * .23, fill=255)
            icon.putalpha(rounded)
        preview.paste(icon, (x, y), icon)
    output = ROOT / 'docs/screenshots/ourcampus-launcher-icon-preview.png'
    output.parent.mkdir(parents=True, exist_ok=True)
    preview.save(output)
    print('Converted supplied icon: 20 Android resources, web sizes and launcher preview.')


if __name__ == '__main__':
    main()
