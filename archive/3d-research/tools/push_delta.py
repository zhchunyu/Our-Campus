#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""push_delta.py —— 增量推送到 GitHub（只推差异，不重传全库）

为什么有它（与 push_via_api.py 的分工）
------------------------------------------------------------------
`push_via_api.py` 走的是**全量 tree**：把 HEAD 里所有非 .blend 文件逐个上传。
首次建仓、或远端与本地大面积不一致时它是对的；但日常"改了几十个文件"时，
它会重新上传 700+ 个 blob —— 慢，且每个 blob 都消耗一次 API 配额。

本脚本只做**差异推送**：
    远端 head 的 tree 作为 `base_tree`，tree 里只列「新增/修改」+「删除」项。
实测（2026-09-26）：全库 798 文件，实际只有 25 项要动 ⇒ 24 次 blob 上传 / 8 MB。

用法
------------------------------------------------------------------
    # 只看差异，不动远端
    python push_delta.py --dry-run

    # 正式推送（提交信息自动取本地 HEAD）
    python push_delta.py

    # ★ 推送到指定分支（分支不存在时自动从 --base 建；默认 base=main）
    python push_delta.py --branch feat/我的改动 --dry-run
    python push_delta.py --branch feat/我的改动

    # 以别的分支为基线建新分支
    python push_delta.py --branch feat/x --base feat/y

    # 把 .blend 也纳入 tree（默认排除 —— 本项目 .blend 走 Release）
    python push_delta.py --with-blend

    # 指定提交信息
    python push_delta.py --message-file C:/path/to/msg.txt

前置：本地已 `git commit`。本脚本推的是 **HEAD 的 tree**，不是工作区。

两个必须知道的点
------------------------------------------------------------------
1. ★ **blob 内容必须取自 git 对象库**（`git cat-file blob <sha>`），不能读工作区文件。
   仓库配了 `.gitattributes` 做行尾归一化时，工作区是 CRLF、库里是 LF，
   读磁盘算出的 sha 与 `git ls-tree` 给的对不上 ⇒ 校验必然失败。
2. ★ **删除项靠 `sha: null`**。Git Data API 的 tree 里把某个 path 的 sha 设为 null
   即表示删除，不需要额外的删除接口。
3. ★ 走 Git Data API 推出来的 commit 是**远端新建的对象**，SHA 与本地的不同
   （同样的内容、不同的提交对象）。所以本地分支与远端分支的 SHA 不会相等，
   这是正常现象；核对内容一致请比较 `git ls-tree HEAD` 与远端 tree。
"""
import argparse
import base64
import json
import os
import subprocess
import sys
import time

import requests

REPO = 'zhchunyu/Chun-Yu'
BRANCH = 'main'
API = 'https://api.github.com'
WS = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
CACHE = os.path.join(os.environ.get('TEMP', '/tmp'), 'chunyu_blob_cache.json')


def log(msg):
    print(msg, flush=True)


def get_token():
    # ★ 优先读 _read_gh_token.ps1 写出的 token 文件（本机实测，2026-10-11）：
    #   下面的 `printf ... | git credential fill` 在 Windows 上走的是 cmd.exe，
    #   cmd 没有 printf 内建 ⇒ 管道内容为空 ⇒ 永远拿不到 password。
    #   Windows 下请先跑：powershell -File 02-三维资产/tools/_read_gh_token.ps1
    token_file = os.path.join(os.environ.get('TEMP', '/tmp'), 'chunyu_push', 'token.txt')
    if os.path.exists(token_file):
        with open(token_file, encoding='utf-8') as fh:
            tok = fh.read().strip()
        if tok:
            return tok
    p = subprocess.run(
        'printf "protocol=https\\nhost=github.com\\n\\n" | git credential fill',
        shell=True, capture_output=True, text=True, encoding='utf-8')
    for line in p.stdout.splitlines():
        if line.startswith('password='):
            return line[9:]
    raise SystemExit('拿不到 GitHub 凭据（git credential fill 没返回 password）')


SESSION = requests.Session()
SESSION.headers.update({'Accept': 'application/vnd.github+json',
                        'User-Agent': 'chunyu-push-delta'})


def api(method, url, **kw):
    for attempt in range(6):
        r = SESSION.request(method, API + url, timeout=600, **kw)
        if r.status_code in (403, 429, 500, 502, 503):
            wait = 2 ** attempt
            log('   HTTP %d，%ds 后重试' % (r.status_code, wait))
            time.sleep(wait)
            continue
        if r.status_code >= 400:
            log('!! HTTP %d %s\n%s' % (r.status_code, url, r.text[:600]))
            sys.exit(1)
        return r
    raise SystemExit('重试耗尽')


def local_tree():
    """HEAD 的 {path: {mode, sha}}，用 -z 读，中文路径不被转义。"""
    p = subprocess.run(['git', 'ls-tree', '-r', '-z', 'HEAD'], cwd=WS,
                       capture_output=True, text=True, encoding='utf-8')
    out = {}
    for rec in p.stdout.split('\0'):
        if not rec:
            continue
        meta, path = rec.split('\t', 1)
        mode, _typ, sha = meta.split()
        out[path] = {'mode': mode, 'sha': sha}
    return out


def blob_bytes(sha):
    """★ 从 git 对象库取内容 —— 不能读工作区（见文件头第 1 点）。"""
    q = subprocess.run(['git', 'cat-file', 'blob', sha], cwd=WS, capture_output=True)
    if q.returncode != 0:
        raise SystemExit('git cat-file 失败：%s' % sha)
    return q.stdout


def remote_state(branch):
    r = SESSION.get(API + '/repos/%s/git/ref/heads/%s' % (REPO, branch), timeout=60)
    if r.status_code == 404:
        return None
    head = api('GET', '/repos/%s/git/ref/heads/%s' % (REPO, branch)).json()
    commit_sha = head['object']['sha']
    commit = api('GET', '/repos/%s/git/commits/%s' % (REPO, commit_sha)).json()
    tree_sha = commit['tree']['sha']
    tr = api('GET', '/repos/%s/git/trees/%s?recursive=1' % (REPO, tree_sha)).json()
    if tr.get('truncated'):
        log('⚠ 远端树被截断（truncated=true）—— 仓库文件数过多，差异比对可能不准')
    files = {e['path']: e['sha'] for e in tr['tree'] if e['type'] == 'blob'}
    return commit_sha, tree_sha, files, commit['message'].splitlines()[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true', help='只列差异，不动远端')
    ap.add_argument('--with-blend', action='store_true',
                    help='把 .blend 也纳入 tree（默认排除，本项目 .blend 走 Release）')
    ap.add_argument('--message-file', help='提交信息取自该文件（默认取本地 HEAD）')
    ap.add_argument('--branch', default=BRANCH,
                    help='目标分支（默认 %s）；分支不存在时自动从 --base 创建' % BRANCH)
    ap.add_argument('--base', default=None,
                    help='新分支的基线分支（默认取 main）')
    a = ap.parse_args()

    SESSION.headers['Authorization'] = 'token ' + get_token()

    target = a.branch
    log('仓库 %s ｜ 目标分支 %s' % (REPO, target))
    state = remote_state(target)
    if state is None:
        base = a.base or BRANCH
        log('分支 %s 不存在 → 从 %s 创建' % (target, base))
        state = remote_state(base)
        if state is None:
            raise SystemExit('基线分支 %s 也不存在' % base)
        creating = True
    else:
        creating = False
    r_commit, r_tree, r_files, r_msg = state
    log('基线 head = %s  （%s）' % (r_commit[:8], r_msg))
    log('基线 %d 个文件' % len(r_files))

    loc = local_tree()
    log('本地 %d 个文件' % len(loc))

    add = sorted(set(loc) - set(r_files))
    dele = sorted(set(r_files) - set(loc))
    diff = sorted(p for p in (set(loc) & set(r_files)) if loc[p]['sha'] != r_files[p])
    if not a.with_blend:
        add = [x for x in add if not x.endswith('.blend')]
        dele = [x for x in dele if not x.endswith('.blend')]

    log('\n新增 %d ｜ 修改 %d ｜ 删除 %d' % (len(add), len(diff), len(dele)))
    for x in add:
        log('   + %s' % x)
    for x in diff:
        log('   ~ %s' % x)
    for x in dele:
        log('   - %s' % x)

    if not (add or diff or dele):
        log('\n✅ 远端已与本地 HEAD 一致，无需推送。')
        return
    if a.dry_run:
        log('\n（--dry-run，未改动远端）')
        return

    todo = add + diff
    cache = json.load(open(CACHE, encoding='utf-8')) if os.path.exists(CACHE) else {}
    entries = []
    total = 0
    for i, path in enumerate(todo, 1):
        want = loc[path]['sha']
        raw = blob_bytes(want)
        total += len(raw)
        if cache.get(path) == want:
            log('  [%d/%d] 缓存命中 %s' % (i, len(todo), path))
        else:
            r = api('POST', '/repos/%s/git/blobs' % REPO,
                    json={'content': base64.b64encode(raw).decode('ascii'),
                          'encoding': 'base64'})
            got = r.json()['sha']
            if got != want:
                raise SystemExit('!! blob SHA 不符（上传损坏）：%s\n   want=%s\n   got =%s'
                                 % (path, want, got))
            cache[path] = want
            json.dump(cache, open(CACHE, 'w', encoding='utf-8'))
            log('  [%d/%d] 上传 %s (%d B)' % (i, len(todo), path, len(raw)))
        entries.append({'path': path, 'mode': loc[path]['mode'], 'type': 'blob', 'sha': want})

    for path in dele:
        entries.append({'path': path, 'mode': '100644', 'type': 'blob', 'sha': None})
        log('  删除 %s' % path)

    log('上传完毕：%.2f MB' % (total / 1048576))

    new_tree = api('POST', '/repos/%s/git/trees' % REPO,
                   json={'tree': entries, 'base_tree': r_tree}).json()['sha']
    log('新 tree = %s' % new_tree)

    if a.message_file:
        msg = open(a.message_file, encoding='utf-8').read().strip()
    else:
        msg = subprocess.run(['git', 'log', '-1', '--format=%B'], cwd=WS,
                             capture_output=True, text=True,
                             encoding='utf-8').stdout.strip()
    if not msg:
        raise SystemExit('提交信息为空 —— 本地 HEAD 读不到，且未给 --message-file')

    new_commit = api('POST', '/repos/%s/git/commits' % REPO,
                     json={'message': msg, 'tree': new_tree,
                           'parents': [r_commit]}).json()['sha']
    log('新 commit = %s' % new_commit)
    log('   信息首行 = %s' % msg.splitlines()[0])

    out = None
    if creating:
        out = api('POST', '/repos/%s/git/refs' % REPO,
                  json={'ref': 'refs/heads/%s' % target, 'sha': new_commit}).json()
        log('已创建 refs/heads/%s -> %s' % (target, out['object']['sha'][:8]))
    else:
        out = api('PATCH', '/repos/%s/git/refs/heads/%s' % (REPO, target),
                  json={'sha': new_commit}).json()
        log('refs/heads/%s 已更新 -> %s' % (target, out['object']['sha'][:8]))
    log('\n✅ 推送完成。验收：再跑一次 `--dry-run --branch %s`，三组应全为 0（.blend 除外）。' % target)


if __name__ == '__main__':
    main()
