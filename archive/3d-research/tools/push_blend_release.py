#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 24 个 .blend 工程文件作为 GitHub Release 资产上传。

★ 为什么不用仓库树：
    Git Data API 的 blob 端点与 Contents API 都受"单请求体积"限制 —— 实测
      34 MB 文件（请求体 45 MB）→ 通过
      40 MB 文件（请求体 53 MB）→ 422 too large
      62 MB 文件（请求体 83 MB）→ 422 too large
    即**上限约 36 MB / 请求体约 50 MB**，与"单文件 100 MB"的名义上限无关。
    24 个 .blend 里 16 个（41.6~62.2 MB）过不去 ⇒ 改走 Release 资产。
★ 为什么 Release 可以：走 uploads.github.com，**原始字节直传、不做 base64**，
  单资产上限 2 GB。这也是 GitHub 官方推荐的大二进制分发方式。

用法：python push_blend_release.py [--tag blend-projects] [--dry-run]
支持断点续传：已上传的资产记在 push_release_cache.json，重跑跳过。
"""

import argparse
import json
import os
import subprocess
import sys
import time

import requests

API = 'https://api.github.com'
UPLOAD = 'https://uploads.github.com'
REPO = 'zhchunyu/Chun-Yu'
TAG = 'blend-projects'
WS = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
_STATE_DIR = os.path.join(os.environ.get('TEMP') or os.environ.get('TMP') or '/tmp', 'chunyu_push')
CACHE = os.path.join(_STATE_DIR, 'push_release_cache.json')

TOKEN = open(os.path.join(_STATE_DIR, 'token.txt'), encoding='ascii').read().strip()
S = requests.Session()
S.headers.update({
    'Authorization': 'token %s' % TOKEN,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'chunyu-release-push',
})

# ★★ Release 资产名会被 GitHub 清洗掉**所有非 ASCII 字符**（实测）：
#     `café.blend`        → `cafe.blend`
#     `R0_垂直书院.blend`  → `R0_.blend`
#     `山河大学_R0.blend`  → `_R0.blend`
#   所以必须给非 ASCII 文件配一个 ASCII 资产名，中文原名写进映射表（release body + README）。
NAME_MAP = {
    '教学主楼.blend': 'teaching_main_building.blend',
    '山河大学_R0_垂直书院.blend': 'ShanHeU_R0_vertical_academy.blend',
    '山河大学_R1_山门智谷.blend': 'ShanHeU_R1_gate_smart_valley.blend',
    '山河大学_R2_图书馆讲堂.blend': 'ShanHeU_R2_library_lecture_hall.blend',
    '山河大学_R3_人文区.blend': 'ShanHeU_R3_humanities.blend',
    '山河大学_R4_智慧环廊.blend': 'ShanHeU_R4_smart_corridor.blend',
    '山河大学_R5_五区.blend': 'ShanHeU_R5_five_zones.blend',
    '山河大学_R6_滨水基座.blend': 'ShanHeU_R6_waterfront_podium.blend',
    '山河大学_场地骨架.blend': 'ShanHeU_site_skeleton.blend',
    '山河大学_中轴序列.blend': 'ShanHeU_axis_sequence.blend',
    '山河大学_中轴尽端.blend': 'ShanHeU_axis_end.blend',
    '山河大学_人文区.blend': 'ShanHeU_humanities_zone.blend',
}


def asset_name(basename):
    """中文名 → ASCII 资产名；本身是 ASCII 的原样返回。"""
    return NAME_MAP.get(basename, basename)


def log(m):
    print(m, flush=True)


def blend_files():
    out = subprocess.run(['git', 'ls-tree', '-r', '-z', 'HEAD'], cwd=WS, capture_output=True).stdout
    rows = []
    for rec in out.split(b'\x00'):
        if not rec:
            continue
        meta, _, path = rec.partition(b'\t')
        p = path.decode('utf-8')
        if p.endswith('.blend'):
            rows.append((os.path.getsize(os.path.join(WS, p)), p))
    return sorted(rows)


def get_or_create_release():
    r = S.get('%s/repos/%s/releases/tags/%s' % (API, REPO, TAG), timeout=60)
    if r.status_code == 200:
        return r.json()
    body = {
        'tag_name': TAG,
        'name': 'Blender 工程文件（R0~R6，24 个 .blend）',
        'body': (
            '山河大学 R0~R6 各阶段的 Blender 场景工程文件。\n\n'
            '**为什么放在 Release 而不是仓库树里**：GitHub 的 Git Data API（blob）与 Contents API '
            '都有单请求体积限制，实测约 **36 MB / 文件（请求体约 50 MB）** 即被拒 '
            '（`422 too large to process`）——与"单文件 100 MB"的名义上限无关。\n'
            '本项目 24 个 .blend 中有 16 个在 41.6~62.2 MB，无法进树；'
            'Release 资产走 `uploads.github.com`、原始字节直传，单文件上限 2 GB，是官方推荐的大二进制分发方式。\n\n'
            '全部 .blend 均可由 `02-三维资产/blender/scripts/` + `blender/configs/` 重新生成。\n'
            '`.blend1` 自动备份（16 个 / 671 MB）未收录 —— 与 `.blend` 内容重复。'
        ),
        'draft': False,
        'prerelease': False,
    }
    r = S.post('%s/repos/%s/releases' % (API, REPO), json=body, timeout=120)
    if r.status_code == 201:
        return r.json()
    raise SystemExit('创建 release 失败 HTTP %d：%s' % (r.status_code, r.text[:300]))


def existing_assets(rel_id):
    """返回 {name: {'id':…, 'size':…, 'state':…}}。

    ★ 必须连 `state` 一起取 —— 只比 size 会把**上传中断的残缺资产**当成已完成：
      Release 资产上传被打断时会留下一条 `state == "starter"` 的记录，
      它的 `size` 字段仍然等于**目标大小**（实测 archfix_r4.blend：
      本地 50609801 / 远端 size 50609801 / state starter）。
      ⇒ 只判 size 会永久跳过它，仓库里留下一个下不下来的坏文件。
    """
    out, page = {}, 1
    while True:
        r = S.get('%s/repos/%s/releases/%s/assets?per_page=100&page=%d' % (API, REPO, rel_id, page), timeout=60)
        r.raise_for_status()
        data = r.json()
        if not data:
            break
        for a in data:
            out[a['name']] = {'id': a['id'], 'size': a['size'], 'state': a['state']}
        page += 1
    return out


def delete_asset(asset_id):
    r = S.delete('%s/repos/%s/releases/assets/%d' % (API, REPO, asset_id), timeout=60)
    return r.status_code in (204, 404)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--tag', default=TAG)
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()

    files = blend_files()
    total = sum(s for s, _ in files)
    log('== .blend 资产：%d 个 / %.1f MB' % (len(files), total / 1024 / 1024))
    if a.dry_run:
        for s, p in files:
            log('   %6.1f MB  %s' % (s / 1024 / 1024, os.path.basename(p)))
        return

    rel = get_or_create_release()
    log('   release id %s ｜ tag %s' % (rel['id'], rel['tag_name']))
    have = existing_assets(rel['id'])
    log('   已有资产 %d 个' % len(have))

    done_bytes = 0
    t0 = time.time()
    for i, (size, path) in enumerate(files, 1):
        name = asset_name(os.path.basename(path))
        prev = have.get(name)
        if prev and prev['size'] == size and prev['state'] == 'uploaded':
            done_bytes += size
            log('   [%2d/%d] %-40s 已存在，跳过' % (i, len(files), name))
            continue
        if prev:
            # 存在但不可用（残缺 / 大小不符）⇒ 必须先删掉，否则同名上传会被拒
            log('   [%2d/%d] %-40s 已有残留（state=%s, size=%s）→ 删除后重传'
                % (i, len(files), name, prev['state'], prev['size']))
            delete_asset(prev['id'])
        url = '%s/repos/%s/releases/%s/assets' % (UPLOAD, REPO, rel['id'])
        t1 = time.time()
        # ★ 资产上传会撞上 GitHub 的"滥用检测"限流：HTTP 400
        #   {"message":"You have sent an invalid request. Please do not send this request again."}
        #   这是**瞬时**的（同一请求稍后即 201），必须重试而不是当失败退出。
        ok = False
        for attempt in range(6):
            try:
                with open(os.path.join(WS, path), 'rb') as f:
                    # ★ 必须走带 Authorization 的会话 S（或显式加鉴权头）！
                    #   裸 requests.post 会漏掉鉴权 ⇒ GitHub 回 HTTP 400
                    #   "You have sent an invalid request." —— 极易被误读成限流。
                    r = S.post(url, params={'name': name},
                               headers={'Content-Type': 'application/octet-stream'},
                               data=f, timeout=3600)
            except requests.RequestException as e:
                log('   [%2d/%d] %-40s 网络异常 %s，重试' % (i, len(files), name, type(e).__name__))
                time.sleep(5 * (attempt + 1))
                continue
            if r.status_code == 201:
                ok = True
                break
            wait = 10 * (attempt + 1)
            log('   [%2d/%d] %-40s HTTP %d，%d 秒后重试（%d/6）'
                % (i, len(files), name, r.status_code, wait, attempt + 1))
            time.sleep(wait)
        if not ok:
            log('   [%2d/%d] %-40s ★ 重试耗尽：%s' % (i, len(files), name, r.text[:200]))
            raise SystemExit(1)
        got = r.json()
        if got['size'] != size:
            raise SystemExit('资产体积不符：本地 %d / 远端 %d（%s）' % (size, got['size'], name))
        if got['name'] != name:
            raise SystemExit('★ 远端资产名被改写：期望 %s / 实得 %s —— 名称必须全 ASCII'
                             % (name, got['name']))
        done_bytes += size
        log('   [%2d/%d] %-40s %6.1f MB  %5.0f 秒  （累计 %.1f / %.1f MB）'
            % (i, len(files), name, size / 1024 / 1024, time.time() - t1,
               done_bytes / 1024 / 1024, total / 1024 / 1024))
        time.sleep(2)      # 节流，降低触发滥用检测的概率

    log('== 全部完成，用时 %.0f 秒' % (time.time() - t0))
    log('   下载页：https://github.com/%s/releases/tag/%s' % (REPO, rel['tag_name']))


if __name__ == '__main__':
    main()
