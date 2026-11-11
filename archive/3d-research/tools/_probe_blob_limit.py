#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""探测 GitHub Git Data API 的 blob 端点实际可接受的体积上限。

背景：名义上限是单文件 100 MB，但 62 MB 的 .blend（base64 后 83 MB）实测被拒：
  HTTP 422 {"message":"Sorry, your input was too large to process..."}
即真正卡住的是**请求体大小**，不是文件大小。这里二分出可用边界。
"""
import base64
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
URL = 'https://api.github.com/repos/zhchunyu/Chun-Yu/git/blobs'

for mb in [8, 16, 24, 30, 34, 40, 48, 56, 64]:
    raw = os.urandom(mb * 1024 * 1024)          # 随机内容，避免压缩造成假象
    body = {'content': base64.b64encode(raw).decode('ascii'), 'encoding': 'base64'}
    try:
        r = S.post(URL, json=body, timeout=600)
        note = ''
        if r.status_code != 201:
            note = ' :: ' + r.text[:120].replace('\n', ' ')
        print('%3d MB 文件 → 请求体 %.1f MB → HTTP %d%s' % (mb, len(body['content']) / 1024 / 1024,
                                                           r.status_code, note), flush=True)
    except Exception as e:
        print('%3d MB → 异常 %s: %s' % (mb, type(e).__name__, str(e)[:120]), flush=True)
