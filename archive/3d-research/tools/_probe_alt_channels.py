#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""在 Git Data API 的 blob 端点被体积限制挡住后，试两条替代通道：

A) Contents API（PUT /contents/{path}）—— 若它也放宽，则大文件仍能进仓库树
B) Releases 资产（POST https://uploads.github.com/.../assets）—— 原始字节直传，单文件上限 2 GB

★ 关键差异：Releases 资产走 uploads.github.com，**不做 base64**，所以 62 MB 就是 62 MB。
"""
import base64
import json
import os
import requests

TOKEN = open(os.path.join(os.environ['TEMP'], 'chunyu_push', 'token.txt'), encoding='ascii').read().strip()
S = requests.Session()
S.headers.update({
    'Authorization': 'token %s' % TOKEN,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'probe',
})
REPO = 'zhchunyu/Chun-Yu'

print('=== A) Contents API 体积上限 ===', flush=True)
for mb in [40, 62]:
    raw = os.urandom(mb * 1024 * 1024)
    body = {'message': 'probe %dMB' % mb,
            'content': base64.b64encode(raw).decode('ascii'),
            'branch': 'probe-tmp'}
    r = S.put('https://api.github.com/repos/%s/contents/.probe_%d.bin' % (REPO, mb), json=body, timeout=900)
    print('  %3d MB → 请求体 %.1f MB → HTTP %d %s' % (mb, len(body['content']) / 1024 / 1024,
                                                    r.status_code, r.text[:140].replace('\n', ' ')), flush=True)

print('=== B) Releases 通道连通性 ===', flush=True)
r = S.get('https://api.github.com/repos/%s/releases' % REPO, timeout=60)
print('  列 releases → HTTP %d' % r.status_code, flush=True)

# 建一个用于存 .blend 的 release（若已存在则复用）
payload = {'tag_name': 'blend-projects', 'name': 'Blender 工程文件（R0~R6）',
           'body': '山河大学 R0~R6 各阶段 .blend 场景工程文件。\n\n'
                   '因 GitHub API 单请求体积限制（约 50 MB），.blend 无法进仓库树，改以 Release 资产分发。',
           'draft': False, 'prerelease': False}
r = S.post('https://api.github.com/repos/%s/releases' % REPO, json=payload, timeout=120)
if r.status_code == 201:
    rel = r.json()
    print('  创建 release → id %s  tag %s' % (rel['id'], rel['tag_name']), flush=True)
elif r.status_code == 422 and 'already_exists' in r.text:
    rel = S.get('https://api.github.com/repos/%s/releases/tags/blend-projects' % REPO, timeout=60).json()
    print('  release 已存在 → id %s' % rel['id'], flush=True)
else:
    print('  创建 release 失败 HTTP %d %s' % (r.status_code, r.text[:200]), flush=True)
    raise SystemExit(1)

# 上传一个 6.8 MB 的真实文件试通道
src = os.path.join(os.environ['TEMP'], 'chunyu_push', 'probe_asset.bin')
open(src, 'wb').write(os.urandom(7 * 1024 * 1024))
up = 'https://uploads.github.com/repos/%s/releases/%s/assets?name=probe_asset.bin' % (REPO, rel['id'])
with open(src, 'rb') as f:
    r = requests.post(up, headers={'Authorization': 'token %s' % TOKEN,
                                   'Content-Type': 'application/octet-stream',
                                   'User-Agent': 'probe'},
                      data=f, timeout=600)
print('  上传 7 MB 资产 → HTTP %d %s' % (r.status_code, r.text[:200].replace('\n', ' ')), flush=True)
if r.status_code == 201:
    print('  ✓ Releases 通道可用，下载地址示例：', r.json()['browser_download_url'], flush=True)
