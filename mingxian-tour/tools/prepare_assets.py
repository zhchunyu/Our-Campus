#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""铭贤学堂旧址 全景素材预处理

从原始全景图生成三档产物：
  assets/panoramas/<id>.webp        4096x2048  桌面
  assets/panoramas-mobile/<id>.webp 2048x1024  手机
  assets/previews/<id>.jpg           512x256    场景条缩略图

同时把音频按拼音重命名复制到 assets/audio/，并输出 scenes.json 供生成 data.js。
"""
import json
import os
import re
import shutil
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(os.environ['USERPROFILE'], 'Downloads', 'OurCampus-铭贤学堂素材')

PANORAMAS = os.path.join(SRC, 'panoramas')
AUDIO_SRC = os.path.join(SRC, 'audio')

OUT_PANO = os.path.join(ROOT, 'assets', 'panoramas')
OUT_MOBILE = os.path.join(ROOT, 'assets', 'panoramas-mobile')
OUT_PREVIEW = os.path.join(ROOT, 'assets', 'previews')
OUT_AUDIO = os.path.join(ROOT, 'assets', 'audio')

# 房间名 -> 音频拼音文件名（与 5itui 后台配音保持一致；空表示该房间暂无配音）
AUDIO_MAP = {
    '崇圣楼': 'chongshenglou',
    '校长院': 'xiaozhangyuan',
    '石板院': 'shibanyuan',
    '尚德堂': 'shangdetang',
    '南院别墅': 'nanyuanbieshu',
    '南院4号楼': 'nanyuan4hao',
    '南院3号楼': 'nanyuan3hao',
    '观赏楼': 'guanshanglou',
}

# 游览动线：从外门进入，穿过院落，再到南院
ORDER = ['2184', '2169', '2170', '2171', '2172', '2173', '2174', '2175',
         '2185', '2176', '2177', '2181', '2180', '2182', '2183', '2178', '2179']


def ensure_dirs():
    for d in (OUT_PANO, OUT_MOBILE, OUT_PREVIEW, OUT_AUDIO):
        os.makedirs(d, exist_ok=True)


def scan_scenes():
    scenes = []
    for name in sorted(os.listdir(PANORAMAS)):
        m = re.match(r'^(\d+)_(.+)\.jpg$', name)
        if not m:
            continue
        rid, label = m.group(1), m.group(2)
        scenes.append({'id': rid, 'name': label, 'src': os.path.join(PANORAMAS, name)})
    by_id = {s['id']: s for s in scenes}
    ordered = [by_id[i] for i in ORDER if i in by_id]
    for s in scenes:
        if s not in ordered:
            ordered.append(s)
    return ordered


def convert(scene):
    sid = scene['id']
    with Image.open(scene['src']) as im:
        im = im.convert('RGB')
        w, h = im.size
        scene['width'], scene['height'] = w, h

        desktop = im.resize((4096, 2048), Image.LANCZOS)
        p_desk = os.path.join(OUT_PANO, f'{sid}.webp')
        desktop.save(p_desk, 'WEBP', quality=80, method=6)
        desktop.close()

        mobile = im.resize((2048, 1024), Image.LANCZOS)
        p_mob = os.path.join(OUT_MOBILE, f'{sid}.webp')
        mobile.save(p_mob, 'WEBP', quality=78, method=6)
        mobile.close()

        preview = im.resize((512, 256), Image.LANCZOS)
        p_prev = os.path.join(OUT_PREVIEW, f'{sid}.jpg')
        preview.save(p_prev, 'JPEG', quality=82, optimize=True)
        preview.close()

    scene['desktop'] = os.path.getsize(p_desk)
    scene['mobile'] = os.path.getsize(p_mob)
    scene['preview'] = os.path.getsize(p_prev)
    return scene


def convert_audio():
    done = {}
    if not os.path.isdir(AUDIO_SRC):
        print(f'[warn] 音频目录不存在：{AUDIO_SRC}')
        return done
    for cn, slug in AUDIO_MAP.items():
        src = os.path.join(AUDIO_SRC, f'{cn}.mp3')
        if not os.path.exists(src):
            print(f'[warn] 缺少音频：{cn}.mp3')
            continue
        dest = os.path.join(OUT_AUDIO, f'{slug}.mp3')
        shutil.copy2(src, dest)
        done[cn] = {'slug': slug, 'bytes': os.path.getsize(dest)}
    return done


def main():
    ensure_dirs()
    scenes = scan_scenes()
    if not scenes:
        print('没有找到全景图', file=sys.stderr)
        return 1

    total_desk = total_mob = total_prev = 0
    for s in scenes:
        convert(s)
        total_desk += s['desktop']
        total_mob += s['mobile']
        total_prev += s['preview']
        print(f"{s['id']} {s['name']:<12} src={s['width']}x{s['height']} "
              f"desk={s['desktop']/1048576:.2f}MB mob={s['mobile']/1048576:.2f}MB")

    audio = convert_audio()

    manifest = {
        'scenes': [
            {
                'id': s['id'],
                'name': s['name'],
                'sourceSize': [s['width'], s['height']],
                'audio': AUDIO_MAP.get(s['name']),
            }
            for s in scenes
        ],
        'audio': audio,
    }
    with open(os.path.join(HERE, 'scenes.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f'\n全景 {len(scenes)} 张  桌面合计 {total_desk/1048576:.1f}MB  '
          f'手机合计 {total_mob/1048576:.1f}MB  缩略图合计 {total_prev/1048576:.1f}MB')
    print(f'音频 {len(audio)} 段')
    bound = [s['name'] for s in manifest['scenes'] if s['audio']]
    print('已绑定配音的场景：' + ('、'.join(bound) if bound else '无'))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())