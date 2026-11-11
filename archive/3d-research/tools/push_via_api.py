#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""通过 GitHub REST API（Git Data API）把本地 git 提交推送到远端仓库。

★ 为什么不用 `git push`
    本机网络经代理 127.0.0.1:54639 出口，实测：
        CONNECT github.com:443  → 502 Bad Gateway（SNI 拦截，10 秒后拒绝）
        直连 github.com:443     → 立即失败（无直连出口）
    但同一代理下 api.github.com / codeload / objects / uploads 均可达（200/301/404/302）。
    因此 git smart-HTTP 走不通，改用 Git Data API 完成**等价推送**：
        blobs → tree → commit → 更新 refs/heads/<branch>
    GitHub 的 blob SHA 与 git 的 blob SHA 同源（SHA-1），所以 tree 里可以直接引用本地算出的 SHA。

★ 断点续传
    1.1 GB 的 .blend 上传中途断掉代价很高。脚本把每个已成功的 blob 记进
    `.push_cache.json`（以 git blob SHA 为键），重跑自动跳过。

用法
    python push_via_api.py --stage light     # 轻量文件（排除 *.blend），作为首次提交
    python push_via_api.py --stage blend     # 在已有提交之上追加 .blend 工程文件
    python push_via_api.py --stage all       # 一次性全量提交
    python push_via_api.py --stage light --dry-run

依赖：requests（已装在隔离 venv）
"""

import argparse
import base64
import concurrent.futures as futures
import json
import os
import subprocess
import sys
import threading
import time

import requests

API = 'https://api.github.com'
REPO = 'zhchunyu/Chun-Yu'
BRANCH = 'main'
WS = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
# ★ 缓存/状态写到系统临时目录，不放仓库里 —— 否则会污染工作树（这两个文件不该进版本库）
_STATE_DIR = os.path.join(os.environ.get('TEMP') or os.environ.get('TMP') or '/tmp', 'chunyu_push')
CACHE = os.path.join(_STATE_DIR, 'push_cache.json')
STATE = os.path.join(_STATE_DIR, 'push_state.json')

MSG_LIGHT = """feat: 山河大学三维资产与建模交付（R0–R6）

第八届全球校园人工智能算法精英大赛 · AI+软件创新赛道（赛题 2）
建模层面的完整交付：Blender 程序化建模管线 + R0~R6 六阶段实景渲染 + 前端 3D 预览。

一、项目设定
- 完全虚构校园「山河大学」，全项目不出现任何题字
- 坐标 X 东 / Y 北 / Z 上；场地 X[-816,816] Y[0,1238]；水面 Z=0
- 总平面换算 1 SVG px = 2.4 m，原点 = 主校门 (340,516)

二、建模管线
自然语言 → CAD(STEP/DXF) → Blender 程序化建模 → 无头渲染 → GLB → 前端
- blender/scripts/   程序化建模与渲染脚本（场地骨架 + R0~R6 阶段 + 调色/诊断工具）
- blender/configs/   渲染配置（r0~r6 累进配置 + 统一光照 + 配色重标）
- blender/addons/    MCP for Blender 插件

三、分阶段成果（R0~R6）
- R0 垂直书院       语言样板，总高 93.00 m（塔/楼 2.04）
- R1 山门+下沉智谷   116 m 跨变截面拱；智谷深 8 m
- R2 图书馆+漂浮讲堂  变曲率薄壳；讲堂悬于水面 20.5 m
- R3 人文区 6 栋      大礼堂柱廊 pitch 5.40 + 筒壳
- R4 智慧环廊        全长 1631.9 m，18 顶点弧长参数化
- R5 五区重建        22 栋，天际线五级 82.6 → 10.0 m
- R6 滨水基座
- 统一光照 sun_elev 38 / sun_azim 220 / Khronos PBR Neutral

四、交付内容
- 02-三维资产/renders/      63 张 R0~R6 正式成图（1600×900）
- 02-三维资产/建模图集/      主图集 + 单文件手机版（base64 内嵌）+ 选图清单
- 02-三维资产/site/         可静态托管站点（入口页 + 3D 预览 + 图集 + 总览）
- 02-三维资产/exports/      GLB 4.62 MB / 42 材质
- 02-三维资产/web-demo/     前端 3D 演示

五、质量数据
- 配色合规度：亮像素 8.60% → 7.53%
- 全量 A/B 复验：最大逐像素差 ≤84（无几何不一致）
- 站点自检：106 条本地图片引用，断链 0

注：.blend 工程文件（1.11 GB）因体积另起一次提交。
"""

MSG_BLEND = """chore: 纳入 Blender 工程文件（.blend，24 个 / 1.11 GB）

R0~R6 各阶段的 .blend 场景工程文件，可由 blender/scripts + blender/configs 重新生成，
此处一并纳入以便直接打开与二次编辑。

- 山河大学_R0_垂直书院.blend      34.3 MB
- 山河大学_R1_山门智谷.blend      34.7 MB
- 山河大学_R2_图书馆讲堂.blend    35.5 MB
- 山河大学_R3_人文区.blend        41.6 MB
- 山河大学_R4_智慧环廊.blend      48.3 MB
- 山河大学_R5_五区.blend          62.0 MB
- 山河大学_R6_滨水基座.blend      62.2 MB
- 场地骨架 / 中轴序列 / 中轴尽端 / 人文区 等过程工程
- AB_* 为 A/B 量化验证用的临时工程

.blend1 自动备份（16 个 / 671 MB）已由 .gitignore 排除。
"""

_lock = threading.Lock()
_done_blobs = 0
_total_blobs = 0
_uploaded_bytes = 0


def log(msg):
    # ★ 不要在这里加锁！调用方 upload_blob() 可能正持有 _lock，
    #   而 threading.Lock 不可重入 —— 会死锁（本项目踩过：第 25 个文件时永久卡住）。
    print(msg, flush=True)


# ---------------------------------------------------------------- 凭据 / 请求

def get_token():
    """取 GitHub token。

    优先级：① 环境变量 GITHUB_TOKEN ② token 文件（`_read_gh_token.ps1` 从 Windows
    凭据管理器直接读出并缓存）③ `git credential fill`。
    ★ 为什么优先文件：受限环境下 `git credential fill` 会**间歇性挂起**
      （无输出、无报错、进程还在）—— 排查代价极高。一旦有了缓存文件就别再调它。
    """
    tok = os.environ.get('GITHUB_TOKEN')
    if tok:
        return tok.strip()
    tok_file = os.path.join(_STATE_DIR, 'token.txt')
    if os.path.exists(tok_file):
        with open(tok_file, encoding='ascii') as f:
            tok = f.read().strip()
        if tok:
            return tok
    p = subprocess.run(['git', 'credential', 'fill'], input='protocol=https\nhost=github.com\n\n',
                       capture_output=True, text=True, timeout=60)
    for line in p.stdout.splitlines():
        if line.startswith('password='):
            return line[len('password='):]
    raise SystemExit('未取到 GitHub token（环境变量 / token 文件 / git 凭据助手都失败）')


TOKEN = get_token()
SESSION = requests.Session()
SESSION.headers.update({
    'Authorization': 'token %s' % TOKEN,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'chunyu-push-script',
})


def api(method, path, retries=5, **kw):
    """带指数退避的 API 调用。"""
    url = API + path
    for attempt in range(retries):
        try:
            r = SESSION.request(method, url, timeout=kw.pop('timeout', 1800), **kw)
        except requests.RequestException as e:
            if attempt == retries - 1:
                raise
            wait = 2 ** attempt
            log('    ! 网络异常 %s，%d 秒后重试（%d/%d）' % (type(e).__name__, wait, attempt + 1, retries))
            time.sleep(wait)
            continue
        if r.status_code in (200, 201):
            return r.json() if r.content else {}
        if r.status_code in (403, 429, 500, 502, 503, 504) and attempt < retries - 1:
            wait = 2 ** attempt
            log('    ! HTTP %d，%d 秒后重试（%d/%d）' % (r.status_code, wait, attempt + 1, retries))
            time.sleep(wait)
            continue
        raise SystemExit('API %s %s 失败 HTTP %d：%s' % (method, path, r.status_code, r.text[:600]))
    raise SystemExit('API %s %s 重试耗尽' % (method, path))


# ---------------------------------------------------------------- 本地 git 对象

def list_tree(rev='HEAD'):
    """用 -z 读 ls-tree，彻底避开中文路径的引号转义问题。"""
    out = subprocess.run(['git', 'ls-tree', '-r', '-z', rev], cwd=WS, capture_output=True).stdout
    entries = []
    for rec in out.split(b'\x00'):
        if not rec:
            continue
        meta, _, path = rec.partition(b'\t')
        mode, typ, sha = meta.decode('ascii').split()
        entries.append((mode, sha, path.decode('utf-8')))
    return entries


def blob_bytes(sha):
    return subprocess.run(['git', 'cat-file', 'blob', sha], cwd=WS, capture_output=True).stdout


def load_json(p, default):
    try:
        with open(p, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def save_json(p, obj):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)


# ---------------------------------------------------------------- 上传

def get_ref_sha():
    """查远端分支当前的 commit sha；分支不存在返回 None。

    ★ 必须查：仓库常有 GitHub 自动生成的 "Initial commit"（README），
      直接 POST /git/refs 会 422 Reference already exists；
      而且新提交若不挂 parent 会把已有历史整条丢掉。
    """
    r = SESSION.get('%s/repos/%s/git/ref/heads/%s' % (API, REPO, BRANCH), timeout=60)
    if r.status_code == 200:
        return r.json()['object']['sha']
    if r.status_code == 404:
        return None
    raise SystemExit('查询 ref 失败 HTTP %d：%s' % (r.status_code, r.text[:300]))


def build_tree(entries):
    """按目录递归建树，返回根 tree 的 sha。

    entries: [(mode, sha, path)]，path 为仓库根相对路径。
    ★ 为什么要分层：GitHub 的 tree 接口在条目很多时（实测 703 条）会 504；
      拆成"每个目录一个请求"后，单个请求只有几十条，稳定通过。
    ★ mode 必须从 git ls-tree 原样取；目录固定 040000 / type=tree。
    """
    root_files, dirs = [], {}
    for mode, sha, path in entries:
        if '/' in path:
            head, rest = path.split('/', 1)
            dirs.setdefault(head, []).append((mode, sha, rest))
        else:
            root_files.append((mode, sha, path))

    tree = [{'path': p, 'mode': m, 'type': 'blob', 'sha': s} for m, s, p in root_files]
    for name in sorted(dirs):
        sub_sha = build_tree(dirs[name])
        tree.append({'path': name, 'mode': '040000', 'type': 'tree', 'sha': sub_sha})

    r = api('POST', '/repos/%s/git/trees' % REPO, json={'tree': tree})
    if len(tree) >= 20:          # 只报大层，避免几十行噪音
        log('      tree 层 %2d 条 → %s' % (len(tree), r['sha'][:10]))
    return r['sha']


def upload_blob(mode, sha, path, cache):
    global _done_blobs, _uploaded_bytes
    if sha in cache:
        with _lock:
            _done_blobs += 1
        return sha
    data = blob_bytes(sha)
    r = api('POST', '/repos/%s/git/blobs' % REPO,
            json={'content': base64.b64encode(data).decode('ascii'), 'encoding': 'base64'})
    got = r['sha']
    if got != sha:
        raise SystemExit('blob SHA 不一致：本地 %s / 远端 %s（%s）' % (sha, got, path))
    # ★ 计数在锁内，打印在锁外（见 log() 的注释：锁内调用 log 会死锁）
    with _lock:
        cache[sha] = True
        _done_blobs += 1
        _uploaded_bytes += len(data)
        n, tot, mb = _done_blobs, _total_blobs, _uploaded_bytes / 1024 / 1024
    if n % 25 == 0 or n == tot:
        log('    [%d/%d] 已上传 %.1f MB' % (n, tot, mb))
    return got


def local_head_message():
    """读本地 HEAD 的提交信息。读不到返回 None（退回硬编码文案）。"""
    try:
        p = subprocess.run(['git', 'log', '-1', '--format=%B'], cwd=WS,
                           capture_output=True, text=True, encoding='utf-8', timeout=20)
        if p.returncode == 0 and p.stdout.strip():
            return p.stdout.strip()
    except Exception as e:
        log('   读取本地提交信息失败：%s' % e)
    return None


def get_remote_parents():
    """取远端当前 head 提交的 parents —— 用于 --amend：新提交直接接在**祖父**上，
    等于把刚推错的那一条替换掉（tree 不变，只改提交信息）。"""
    sha = get_ref_sha()
    if not sha:
        return []
    r = SESSION.get('%s/repos/%s/git/commits/%s' % (API, REPO, sha), timeout=60)
    if r.status_code != 200:
        return []
    return [p['sha'] for p in r.json().get('parents', [])]


def push_stage(stage, dry_run=False, probe=0, message_override=None, amend=False):
    global _done_blobs, _total_blobs, _uploaded_bytes
    entries = list_tree('HEAD')
    light = [e for e in entries if not e[2].endswith('.blend')]
    blend = [e for e in entries if e[2].endswith('.blend')]

    if stage == 'light':
        todo, message, base = light, MSG_LIGHT, None
    elif stage == 'blend':
        todo, message, base = blend, MSG_BLEND, 'prev'
    else:
        todo, message, base = light + blend, MSG_LIGHT + '\n' + MSG_BLEND, None

    # ★ 提交信息默认取**本地 HEAD 的提交信息**（`git log -1 --format=%B`），
    #   只有本地拿不到时才退回上面那两条硬编码文案。
    #   否则会出现"本地写了一条准确的提交信息，推上去却变成另一条"的情况 ——
    #   Git Data API 建的是**新的 commit 对象**，不会继承本地那条。
    if message_override:
        message = message_override
    else:
        local_msg = local_head_message()
        if local_msg:
            message = local_msg
            log('   提交信息取自本地 HEAD（%d 字符）' % len(local_msg))

    if probe:
        # 冒烟测试：只上传前 N 个文件的 blob，不建 tree/commit —— 用来验证网络与鉴权通路
        todo = todo[:probe]
        log('== 冒烟测试：只上传前 %d 个文件的 blob（不建提交）' % len(todo))

    total_bytes = sum(os.path.getsize(os.path.join(WS, e[2])) for e in todo)
    log('== 阶段 %s：%d 个文件 / %.1f MB' % (stage, len(todo), total_bytes / 1024 / 1024))
    if dry_run:
        for mode, sha, path in todo[:20]:
            log('   %s  %s' % (mode, path))
        if len(todo) > 20:
            log('   … 其余 %d 个' % (len(todo) - 20))
        return

    cache = load_json(CACHE, {})
    state = load_json(STATE, {})
    _total_blobs = len(todo)
    # ★ 计数器从 0 开始，命中缓存的也要计数（否则进度会停在"未达标"的假象上）；
    #   之前写成"预置为缓存命中数 + 命中时再加 1"⇒ 计数翻倍溢出，进度显示成 725/703。
    _done_blobs = 0
    _uploaded_bytes = 0
    n_cached = sum(1 for e in todo if e[1] in cache)
    if n_cached:
        log('   续传：%d/%d 已在缓存中' % (n_cached, _total_blobs))

    # ---- 1) blobs
    t0 = time.time()
    big = [e for e in todo if os.path.getsize(os.path.join(WS, e[2])) > 5 * 1024 * 1024]
    small = [e for e in todo if e not in big]
    log('   blobs：小文件 %d 个（4 并发）｜ 大文件 %d 个（串行）' % (len(small), len(big)))
    with futures.ThreadPoolExecutor(max_workers=4) as ex:
        list(ex.map(lambda e: upload_blob(e[0], e[1], e[2], cache), small))
    for e in sorted(big, key=lambda x: os.path.getsize(os.path.join(WS, x[2]))):
        upload_blob(e[0], e[1], e[2], cache)
        save_json(CACHE, cache)
    save_json(CACHE, cache)
    log('   blobs 完成，用时 %.0f 秒' % (time.time() - t0))

    if probe:
        log('   冒烟测试结束（未建 tree/commit）')
        return

    # ---- 2) tree
    # ★ 分层建树：一次性提交 700+ 条记录的 tree 请求会被 GitHub 判 504 Gateway Timeout
    #   （本项目实测：703 条 ⇒ HTTP 504）。按目录递归拆成多个小请求即可根治。
    #   blend 阶段用**全量** entries（所有 blob 都已存在），这样不必处理 base_tree 的层层替换。
    tree_src = entries if stage == 'blend' else todo
    tree_sha = build_tree(tree_src)
    log('   tree → %s（%d 条，分层提交）' % (tree_sha[:12], len(tree_src)))

    # ---- 3) commit
    remote_sha = get_ref_sha()
    if amend:
        # 用远端 head 的父提交当 parent ⇒ 新提交**替换**掉刚推的那条（非快进，需 force）
        parents = get_remote_parents()
        log('   ⚠ --amend：将以 %s 为 parent，强制替换远端 %s'
            % ([p[:12] for p in parents], remote_sha[:12] if remote_sha else '(无)'))
    elif base == 'prev':
        parents = [state['commit_sha']]
    elif remote_sha:
        parents = [remote_sha]          # 远端已有历史 → 线性接上，不丢初始提交
    else:
        parents = []
    log('   远端 ref %s ｜ parents %s' % (remote_sha[:12] if remote_sha else '(无分支)',
                                        [p[:12] for p in parents]))
    r = api('POST', '/repos/%s/git/commits' % REPO,
            json={'message': message, 'tree': tree_sha, 'parents': parents})
    commit_sha = r['sha']
    log('   commit → %s' % commit_sha[:12])

    # ---- 4) ref
    if remote_sha:
        api('PATCH', '/repos/%s/git/refs/heads/%s' % (REPO, BRANCH),
            json={'sha': commit_sha, 'force': bool(amend)})
        log('   refs/heads/%s 已更新%s' % (BRANCH, '（force）' if amend else ''))
    else:
        api('POST', '/repos/%s/git/refs' % REPO, json={'ref': 'refs/heads/%s' % BRANCH, 'sha': commit_sha})
        log('   refs/heads/%s 已创建' % BRANCH)

    state.update({'tree_sha': tree_sha, 'commit_sha': commit_sha})
    save_json(STATE, state)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--stage', choices=['light', 'blend', 'all'], required=True)
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--probe', type=int, default=0, help='只上传前 N 个 blob 做冒烟测试，不建提交')
    ap.add_argument('--message-file', help='提交信息取自该文件（默认取本地 HEAD 的提交信息）')
    ap.add_argument('--amend', action='store_true',
                    help='替换远端当前 head（parent 取祖父提交），用于修正刚推的提交信息；会 force 更新 ref')
    a = ap.parse_args()
    msg = None
    if a.message_file:
        with open(a.message_file, encoding='utf-8') as fh:
            msg = fh.read().strip()
    log('仓库 %s ｜ 分支 %s ｜ 工作区 %s' % (REPO, BRANCH, WS))
    push_stage(a.stage, a.dry_run, a.probe, message_override=msg, amend=a.amend)


if __name__ == '__main__':
    main()
