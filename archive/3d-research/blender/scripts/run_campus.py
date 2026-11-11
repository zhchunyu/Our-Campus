# -*- coding: utf-8 -*-
"""
run_campus.py —— 山河大学场地骨架：建模 → 存盘 → 批量渲染
================================================================
用法（便携版 Blender，无头）：
    set BR_CFG_FILE=<ASCII 路径的 json>
    blender.exe --background --factory-startup --python run_campus.py

配置 JSON：
    {
      "blend": "山河大学_场地骨架.blend",
      "export": {                       // 可选：导出 GLB（R7 交付）
        "glb": "山河大学_全园_R6.glb",
        "draco": true,
        "decimate": {"min_tris": 200000, "ratio": 0.35}
      },
      "jobs": [
        {"name": "校园_鸟瞰", "res_x": 1600, "res_y": 900, "samples": 96,
         "cam_pos": [880, -1280, 1180], "cam_tgt": [0, 330, 20], "lens": 50}
      ]
    }
不传 BR_CFG_FILE 时只建模 + 存盘。

执行顺序：**建模 → 存盘 → 导出 GLB → 渲染**。
导出排在存盘之后，是因为 `export_glb.py` 会抽稀（破坏性）——
排在存盘之后，工程 `.blend` 永远保持"未抽稀的干净构建态"。
"""

import json
import os

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ASSET = os.path.dirname(os.path.dirname(HERE))
BLENDER_DIR = os.path.dirname(HERE)
RENDER_DIR = os.environ.get('BR_RENDER_DIR') or os.path.join(ASSET, 'renders')
# ★ BR_RENDER_DIR：把成图写到别处（默认仍是 renders/）。
#   为什么需要它：下面第 87 行会**无条件**用 `RENDER_DIR/<name>.png` 覆盖 job['out']，
#   所以 config 里写 out 路径、或给 make_render_configs 传 --out-dir，都拦不住成图落进交付目录。
#   A/B 对照、冒烟测试一律设 BR_RENDER_DIR=<临时目录>，避免污染 renders/。
PROJ_DIR = os.path.join(BLENDER_DIR, 'projects')

BUILD_PY = os.path.join(HERE, 'build_campus_site.py')
RENDER_PY = os.path.join(HERE, 'render_campus_site.py')
EXPORT_PY = os.path.join(HERE, 'export_glb.py')


def run(path, extra=None):
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
    print(f'[pipeline] 已读取配置: {cfg_file}')

print('### BUILD ###')
# 建模脚本按顺序串联，**共享同一个 globals**：
# 后面的阶段脚本可以直接复用场地脚本里的 W() / box() / make_mat() / Z_TOP 等，
# 也能复用**更早的阶段脚本**里定义的构件工具（roof_ring / pyramid_roof / emit_to …），
# 不必把常量抄一遍（抄一遍迟早会和场地脚本走散）。
# 注意必须把 run() 的返回值**回填给 g**：run() 是往一份新字典里 exec 的，
# 不回填的话，阶段 3 就拿不到阶段 2 定义的东西。
g = run(BUILD_PY)
for extra in (cfg.get('build_extra') or []):
    print(f'### BUILD EXTRA : {extra} ###')
    g = run(os.path.join(HERE, extra), g)

os.makedirs(PROJ_DIR, exist_ok=True)
blend_path = os.path.join(PROJ_DIR, cfg.get('blend', '山河大学_场地骨架.blend'))
bpy.ops.wm.save_as_mainfile(filepath=blend_path)
print(f'[pipeline] 工程已保存: {blend_path}')

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
    print(f'[pipeline] 渲染完成，共 {len(jobs)} 张')

# ---- 导出 GLB（R7）----
# ★ 顺序：**存盘 → 渲染 → 导出**，导出必须排最后。
#   export_glb.py 干的两件事都是破坏性的：
#     · 材质压平 —— 把 `Noise → ColorRamp` 连线的 Base Color 压成常量色
#       （glTF 没有程序化节点；不压平就只能导成纯白）
#     · 抽稀 —— 给大网格挂 Decimate
#   排在渲染之后，成图用的仍是原始程序化材质；
#   排在存盘之后，工程 .blend 永远保持"未压平、未抽稀"的干净构建态。
export_cfg = cfg.get('export')
if export_cfg:
    print('### EXPORT GLB ###')
    run(EXPORT_PY, {'EXPORT_CFG': export_cfg})

print('[pipeline] 结束')
