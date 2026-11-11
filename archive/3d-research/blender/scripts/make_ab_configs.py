# -*- coding: utf-8 -*-
"""
make_ab_configs.py —— 从正式 config 里切出"只跑指定机位"的 A/B 临时 config
================================================================================
为什么需要它
--------------------------------------------------------------------------------
`run_campus.py` 会**无条件**用 `RENDER_DIR/<name>.png` 覆盖 `job['out']`
（见 run_campus.py:91），所以：
  · config 里写 `out` 路径 —— 拦不住；
  · 给 make_render_configs 传 `--out-dir` —— 也拦不住。
唯一的出口是环境变量 **`BR_RENDER_DIR`**。

本脚本只做一件事：把 `configs/rN.json` 的 `jobs` 按名字过滤出需要的几张，
写到临时目录，并把 `export` 段**摘掉**（A/B 不需要重导 GLB，而且 export 是
破坏性的：压平材质 + 抽稀）。

用法
--------------------------------------------------------------------------------
    python make_ab_configs.py <输出目录> <r3:R3_书院_鸟瞰> <r4:R4_环廊_鸟瞰> ...

`<stage:jobname>` —— stage 是 configs 下的 rN，jobname 必须**完全匹配**。
找不到的名字会直接报错退出（防"静默少渲一张"）。
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BLENDER_DIR = os.path.dirname(HERE)
CFG_DIR = os.path.join(BLENDER_DIR, 'configs')


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    out_dir = sys.argv[1]
    os.makedirs(out_dir, exist_ok=True)

    # stage -> [jobname, ...]
    want = {}
    for spec in sys.argv[2:]:
        if ':' not in spec:
            print('[AB-CFG] 参数格式应为 <stage>:<jobname>，收到：%s' % spec)
            return 2
        st, jn = spec.split(':', 1)
        want.setdefault(st, []).append(jn)

    made = []
    for st, names in want.items():
        src = os.path.join(CFG_DIR, st + '.json')
        if not os.path.exists(src):
            print('[AB-CFG] 找不到 config：%s' % src)
            return 2
        with open(src, encoding='utf-8') as fh:
            cfg = json.load(fh)

        all_jobs = cfg.get('jobs') or []
        by_name = {j.get('name'): j for j in all_jobs}
        miss = [n for n in names if n not in by_name]
        if miss:
            print('[AB-CFG] %s 里没有这些机位：%s' % (st, miss))
            print('[AB-CFG]   可用的有：%s' % list(by_name))
            return 2

        # ★ 保持原 config 的 jobs 顺序（渲染顺序会影响 Haze 之类对象的复用路径，
        #   虽然已加守卫，但保持顺序最保险）
        cfg['jobs'] = [j for j in all_jobs if j.get('name') in names]
        # ★ A/B 不导出 GLB：export 段摘掉
        cfg.pop('export', None)
        # 临时工程文件名加前缀，避免覆盖 projects/ 里的正式 .blend
        cfg['blend'] = '_ab_' + cfg.get('blend', 'scene.blend')

        dst = os.path.join(out_dir, '%s_ab.json' % st)
        with open(dst, 'w', encoding='utf-8') as fh:
            json.dump(cfg, fh, ensure_ascii=False, indent=2)
        made.append((st, [j['name'] for j in cfg['jobs']], dst))
        print('[AB-CFG] %s → %s  (%d 张：%s)'
              % (st, dst, len(cfg['jobs']), ' / '.join(j['name'] for j in cfg['jobs'])))

    print('[AB-CFG] 共生成 %d 份临时 config' % len(made))
    return 0


if __name__ == '__main__':
    sys.exit(main())
