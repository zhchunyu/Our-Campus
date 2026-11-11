#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""验证 Contents API 能否承载 62 MB 的 .blend，并核对它生成的 blob SHA 是否与本地 git 一致。

★ 为什么要核对 SHA：Contents API 与 git 都是内容寻址（SHA-1），
  若 SHA 一致，就能用 Contents API 把大文件"送进"对象库，
  再用 Git Data API 建一个**干净的单次提交**引用它们（见 push_blend_via_contents.py）。
"""
import base64
import hashlib
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
STAGE = '_blobstage'

# 1) 建临时分支
r = S.get('https://api.github.com/repos/%s/git/ref/heads/main' % REPO, timeout=60)
base = r.json()['object']['sha']
print('main head =', base[:12], flush=True)
r = S.post('https://api.github.com/repos/%s/git/refs' % REPO,
           json={'ref': 'refs/heads/%s' % STAGE, 'sha': base}, timeout=60)
print('建 %s → HTTP %d %s' % (STAGE, r.status_code, r.text[:100] if r.status_code != 201 else 'OK'), flush=True)

# 2) 造一个 62 MB 的随机文件（模拟最大的 .blend）
raw = os.urandom(62 * 1024 * 1024)
# git blob sha = sha1("blob <len>\0" + content)
h = hashlib.sha1()
h.update(b'blob %d\x00' % len(raw))
h.update(raw)
local_sha = h.hexdigest()
print('本地 git blob sha =', local_sha[:12], '｜ 体积 %.1f MB' % (len(raw) / 1024 / 1024), flush=True)

body = {'message': 'probe 62MB', 'content': base64.b64encode(raw).decode('ascii'), 'branch': STAGE}
r = S.put('https://api.github.com/repos/%s/contents/.probe_62.bin' % REPO, json=body, timeout=1200)
print('PUT 62 MB → 请求体 %.1f MB → HTTP %d' % (len(body['content']) / 1024 / 1024, r.status_code), flush=True)
if r.status_code in (200, 201):
    got = r.json()['content']['sha']
    print('远端 blob sha  =', got[:12], '｜ SHA 一致:', got == local_sha, flush=True)
else:
    print('  ', r.text[:300], flush=True)
