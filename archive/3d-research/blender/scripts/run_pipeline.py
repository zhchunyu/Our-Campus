# -*- coding: utf-8 -*-
"""
run_pipeline.py —— 无头流水线：建模 → 存盘 → 批量渲染
================================================================
用法（便携版 Blender）：
    blender.exe --background --python run_pipeline.py

渲染任务从环境变量 BR_CFG_FILE 指向的 JSON 文件读取，形如：
    {
      "jobs": [
        {"name": "主楼_预览", "res_x": 900, "res_y": 520, "samples": 40,
         "cam_pos": [38, 50, 7.5], "cam_tgt": [0, 0, 9.5], "lens": 40},
        {"name": "主楼_正面", "res_x": 1920, "res_y": 1080, "samples": 140}
      ]
    }
不传该变量时只建模 + 存盘，不渲染。

之所以用「配置文件」而不是命令行参数：项目路径含中文，
经环境变量/argv 传递容易被 Windows 的编码转换破坏。
"""

import json
import os

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))          # .../blender/scripts
ASSET = os.path.dirname(os.path.dirname(HERE))             # 02-三维资产
BLENDER_DIR = os.path.dirname(HERE)                        # .../blender
RENDER_DIR = os.path.join(ASSET, 'renders')
PROJ_DIR = os.path.join(BLENDER_DIR, 'projects')

BUILD_PY = os.path.join(HERE, 'build_main_building.py')
RENDER_PY = os.path.join(HERE, 'render_main_building.py')


def run(path, extra=None):
    """在共享的全局命名空间里执行脚本，可预置变量（如 RENDER_CFG）。"""
    with open(path, encoding='utf-8') as fh:
        src = fh.read()
    g = {'__name__': '__main__', '__file__': path}
    if extra:
        g.update(extra)
    exec(compile(src, path, 'exec'), g)
    return g


cfg = {}
cfg_file = os.environ.get('BR_CFG_FILE')
if cfg_file and os.path.exists(cfg_file):
    with open(cfg_file, encoding='utf-8') as fh:
        cfg = json.load(fh)
    print(f'[pipeline] 已读取渲染配置: {cfg_file}')

# --- 1. 建模 ---
print('### BUILD ###')
run(BUILD_PY)

# --- 2. 存盘 ---
os.makedirs(PROJ_DIR, exist_ok=True)
blend_path = os.path.join(PROJ_DIR, '教学主楼.blend')
bpy.ops.wm.save_as_mainfile(filepath=blend_path)
print(f'[pipeline] 工程已保存: {blend_path}')

# --- 3. 渲染 ---
jobs = cfg.get('jobs') or []
if not jobs:
    print('### NO RENDER JOBS ###')
else:
    os.makedirs(RENDER_DIR, exist_ok=True)
    for i, job in enumerate(jobs):
        job = dict(job)
        name = job.pop('name', f'render_{i:02d}')
        job['out'] = os.path.join(RENDER_DIR, name + '.png')
        print(f'### RENDER {i} : {name} ###')
        run(RENDER_PY, {'RENDER_CFG': job})
    print(f'[pipeline] 全部渲染完成，共 {len(jobs)} 张')

print('[pipeline] 结束')
