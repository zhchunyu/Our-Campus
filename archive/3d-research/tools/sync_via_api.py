#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""sync_via_api.py —— 用 GitHub Git Data API 把远端提交拉进本地仓库（受限网络下的"拉取版 push_via_api"）

为什么需要它
------------
本机 `github.com:443` 不可达（`git fetch/push` 全部失败：既解析不到主机，
schannel 后端还会报 `AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS`），
但 **`api.github.com` 可达**。因此拉取更新改走 Git Data API：
逐对象下载 → 在本地用 `git hash-object -w` 原样重建 → 校验 SHA 完全一致。

与 push 侧的工具一一对应：
    push_via_api.py   本地 → 远端（Git Data API 写入）
    sync_via_api.py   远端 → 本地（Git Data API 读取）  ← 本脚本
    _read_gh_token.ps1 从 Windows 凭据管理器取 token

用法
----
    python sync_via_api.py --ref main                 # 拉取远端 main 到本地对象库
    python sync_via_api.py --ref main --update-ref    # 顺带更新 refs/remotes/origin/main
    python sync_via_api.py --ref main --checkout      # 更新 ref 并把工作区切到该提交
    python sync_via_api.py --sha <sha>                # 直接指定提交
    python sync_via_api.py --ref main --dry-run       # 只统计缺哪些对象，不下载

说明与限制
----------
* 提交对象是**按 API 返回的字段重建**的：作者/提交者日期用"API 的 UTC 时间戳 + 本地时区
  偏移"写回（本仓库历史一律 +0800，可用 --tz 覆盖）。重建后会立刻校验 SHA，
  与远端不一致就直接报错退出，避免写入"看起来像但其实不同"的提交。
* 递归树接口对超大仓库会截断（`truncated: true`），此时本脚本明确报错而不是静默漏文件。
* 只读操作：除非显式给出 `--update-ref` / `--checkout`，否则不动任何 ref 和工作区。
"""

from __future__ import annotations

import argparse
import base64
import concurrent.futures as futures
import datetime
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

OWNER_DEFAULT = "zhchunyu"
REPO_DEFAULT = "Chun-Yu"
API = "https://api.github.com"
TOKEN_FILE = os.path.join(os.environ.get("TEMP", "."), "chunyu_push", "token.txt")

# 受限网络：api.github.com 必须直连，本地代理反而会失败
for _v in list(os.environ):
    if "PROXY" in _v.upper():
        os.environ.pop(_v, None)


def log(msg):
    try:
        sys.stderr.write(msg + "\n")
    except UnicodeEncodeError:
        enc = sys.stderr.encoding or "utf-8"
        sys.stderr.write(msg.encode(enc, "replace").decode(enc, "replace") + "\n")
    sys.stderr.flush()


def read_token(explicit=None):
    if explicit:
        return explicit.strip()
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE, encoding="ascii") as fh:
            return fh.read().strip()
    raise SystemExit(
        "找不到 token。请先运行 02-三维资产/tools/_read_gh_token.ps1，"
        "或用 --token 指定，或设置 GH_TOKEN 环境变量。")


class GitHub:
    def __init__(self, token, owner, repo):
        self.owner, self.repo = owner, repo
        self.auth = "Basic " + base64.b64encode(
            "x-access-token:{}".format(token).encode()).decode()
        self.calls = 0
        self.bytes = 0

    def raw(self, path, accept="application/vnd.github+json"):
        req = urllib.request.Request(API + path)
        req.add_header("Authorization", self.auth)
        req.add_header("Accept", accept)
        req.add_header("User-Agent", "chunyu-sync")
        with urllib.request.urlopen(req, timeout=300) as resp:
            data = resp.read()
        self.calls += 1
        self.bytes += len(data)
        return data

    def json(self, path):
        return json.loads(self.raw(path).decode("utf-8"))

    def ref(self, ref):
        return self.json("/repos/{}/{}/git/ref/heads/{}".format(
            self.owner, self.repo, ref))["object"]["sha"]

    def commit(self, sha):
        return self.json("/repos/{}/{}/git/commits/{}".format(
            self.owner, self.repo, sha))

    def tree_recursive(self, sha):
        data = self.json("/repos/{}/{}/git/trees/{}?recursive=1".format(
            self.owner, self.repo, sha))
        if data.get("truncated"):
            raise SystemExit(
                "递归树被 GitHub 截断了（truncated=true），本脚本不做分块补拉。"
                "请改用更小的子树或换用真实 git fetch。")
        return data["tree"]

    def tree(self, sha):
        return self.json("/repos/{}/{}/git/trees/{}".format(
            self.owner, self.repo, sha))["tree"]

    def blob(self, sha):
        return self.raw("/repos/{}/{}/git/blobs/{}".format(
            self.owner, self.repo, sha), accept="application/vnd.github.raw")


def git(args, repo, stdin=None, check=False):
    proc = subprocess.run(["git", "-C", repo] + args, input=stdin,
                          capture_output=True)
    if check and proc.returncode != 0:
        raise SystemExit("git {} 失败: {}".format(
            " ".join(args), proc.stderr.decode("utf-8", "replace")))
    return proc


def has_object(repo, sha):
    return git(["cat-file", "-e", sha], repo).returncode == 0


def write_object(repo, otype, payload):
    proc = git(["hash-object", "-w", "-t", otype, "--stdin"], repo, stdin=payload)
    if proc.returncode != 0:
        raise SystemExit("hash-object 失败: " +
                         proc.stderr.decode("utf-8", "replace"))
    return proc.stdout.decode().strip()


def git_date(iso, tz):
    """ISO-8601 → git 原始 ident 格式 `<epoch> <±HHMM>`。

    注意：GitHub API 只给 UTC，丢失了原始时区；本仓库历史统一 +0800，
    因此默认按 --tz 补回。重建后必须校验 SHA，否则说明这里猜错了。
    """
    s = iso.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    dt = datetime.datetime.fromisoformat(s)
    epoch = int(dt.timestamp())
    return "{} {}".format(epoch, tz)


def render_commit(c, tz):
    lines = ["tree {}".format(c["tree"]["sha"])]
    for p in c.get("parents", []):
        lines.append("parent {}".format(p["sha"]))
    a, m = c["author"], c["committer"]
    lines.append("author {} <{}> {}".format(a["name"], a["email"], git_date(a["date"], tz)))
    lines.append("committer {} <{}> {}".format(m["name"], m["email"], git_date(m["date"], tz)))
    return ("\n".join(lines) + "\n\n" + c["message"]).encode("utf-8")


def entry_name(e):
    return e.get("name") or e["path"]


def render_tree(entries):
    def key(e):
        name = entry_name(e).encode("utf-8")
        return name + b"/" if e["type"] == "tree" else name

    out = bytearray()
    for e in sorted(entries, key=key):
        mode = e["mode"]
        if e["type"] == "tree" and mode in ("040000", "40000"):
            mode = "40000"
        out += mode.encode("ascii") + b" " + entry_name(e).encode("utf-8") + b"\x00"
        out += bytes.fromhex(e["sha"])
    return bytes(out)


def main():
    ap = argparse.ArgumentParser(description="用 Git Data API 把远端提交同步进本地仓库")
    ap.add_argument("--repo-dir", default=".", help="本地仓库路径（默认当前目录）")
    ap.add_argument("--owner", default=OWNER_DEFAULT)
    ap.add_argument("--repo", default=REPO_DEFAULT)
    ap.add_argument("--ref", help="远端分支名，如 main")
    ap.add_argument("--sha", help="直接指定提交 SHA（与 --ref 二选一）")
    ap.add_argument("--token", help="GitHub PAT；默认读 chunyu_push/token.txt（位于临时目录）")
    ap.add_argument("--tz", default="+0800",
                    help="重建提交时补回的时区，形如 +0800（默认 +0800）")
    ap.add_argument("--update-ref", action="store_true",
                    help="同步成功后更新 refs/remotes/origin/<ref>")
    ap.add_argument("--checkout", action="store_true",
                    help="同步后把工作区/HEAD 切到该提交（会改动工作区内容！）")
    ap.add_argument("--dry-run", action="store_true", help="只统计缺失对象，不下载")
    ap.add_argument("--jobs", type=int, default=6, help="blob 并发下载数（默认 6）")
    args = ap.parse_args()

    repo = os.path.abspath(args.repo_dir)
    if not os.path.isdir(os.path.join(repo, ".git")):
        raise SystemExit("不是 git 仓库: {}".format(repo))

    token = args.token or os.environ.get("GH_TOKEN") or read_token()
    gh = GitHub(token, args.owner, args.repo)

    if args.sha:
        head_sha, ref_name = args.sha, None
    elif args.ref:
        if args.ref not in ("main",) and "/" in args.ref:
            head_sha = gh.json("/repos/{}/{}/git/ref/heads/{}".format(
                args.owner, args.repo, args.ref))["object"]["sha"]
        else:
            head_sha = gh.ref(args.ref)
        ref_name = args.ref
    else:
        raise SystemExit("请给出 --ref 或 --sha")

    log("远端提交 {}".format(head_sha[:12]))
    commit_json = gh.commit(head_sha)

    # 1) 递归列出树、找出缺失对象（先不动仓库，便于 --dry-run 保持只读）
    flat = gh.tree_recursive(commit_json["tree"]["sha"])
    trees = [e for e in flat if e["type"] == "tree"]
    blobs = [e for e in flat if e["type"] == "blob"]
    commits = [e for e in flat if e["type"] == "commit"]

    missing_blobs = [b for b in blobs if not has_object(repo, b["sha"])]
    missing_trees = [t for t in trees if not has_object(repo, t["sha"])]
    total_bytes = sum(b.get("size", 0) for b in missing_blobs)

    if has_object(repo, head_sha) and not missing_trees and not missing_blobs:
        log("本地已完整拥有 {}，无需同步。".format(head_sha[:12]))
        return 0

    log("树对象 {}（缺 {}）｜文件 {}（缺 {}，约 {:.1f} MB）｜子模块 {}".format(
        len(trees), len(missing_trees), len(blobs), len(missing_blobs),
        total_bytes / 1048576.0, len(commits)))
    if commits:
        log("注意：树里有子模块（commit 类型条目），本脚本不会递归拉取子模块。")

    if args.dry_run:
        for b in missing_blobs[:40]:
            log("  缺 {} {:>10} {}".format(b["sha"][:10], b.get("size", 0), b["path"]))
        if len(missing_blobs) > 40:
            log("  ...（其余 {} 个）".format(len(missing_blobs) - 40))
        log("dry-run：未写入任何对象。")
        return 0

    # 3) 下载 blob（并发 + 单对象重试）
    # 2) 重建提交对象并校验（放在写树之前，时区/编码不对就立刻失败，不白下载）
    rebuilt = write_object(repo, "commit", render_commit(commit_json, args.tz))
    if rebuilt != head_sha:
        log("重建提交 SHA 不一致：{} != {}".format(rebuilt, head_sha))
        log("通常是时区/编码差异，请试 --tz 或检查作者信息。")
        return 2
    log("提交对象重建成功：{}".format(rebuilt[:12]))

    # 3) 下载 blob（并发 + 单对象重试）
    done = 0
    failed = []

    def fetch_blob(b):
        last = None
        for _ in range(3):
            try:
                return b, gh.blob(b["sha"])
            except Exception as exc:  # noqa: BLE001
                last = exc
        return b, last

    if missing_blobs:
        with futures.ThreadPoolExecutor(max_workers=args.jobs) as pool:
            for b, data in pool.map(fetch_blob, missing_blobs):
                if isinstance(data, Exception):
                    failed.append((b, data))
                    log("  下载失败 {} {}: {}".format(b["sha"][:10], b["path"], data))
                    continue
                sha = write_object(repo, "blob", data)
                if sha != b["sha"]:
                    failed.append((b, "SHA 不一致"))
                    log("  SHA 不一致 {} != {} ({})".format(sha, b["sha"], b["path"]))
                done += 1
                if done % 25 == 0 or done == len(missing_blobs):
                    log("  已完成 {}/{} 文件".format(done, len(missing_blobs)))

    if failed:
        log("有 {} 个对象失败，未完成同步。".format(len(failed)))
        return 3

    # 4) 重建树对象（按递归清单逐个取条目，SHA 校验）
    for t in missing_trees:
        entries = gh.tree(t["sha"])
        sha = write_object(repo, "tree", render_tree(entries))
        if sha != t["sha"]:
            log("树 SHA 不一致 {} != {}（{}）".format(sha, t["sha"], t["path"]))
            return 4
    if missing_trees:
        log("树对象重建完成：{} 个".format(len(missing_trees)))

    # 5) 完整性校验：提交必须能完整解析（缺任何对象都会在此暴露）
    proc = git(["rev-list", "--objects", "--missing=print", head_sha], repo)
    missing = [ln for ln in proc.stdout.decode("utf-8", "replace").splitlines()
               if ln.startswith("?")]
    if missing:
        log("提交仍缺 {} 个对象，未更新 ref。前几个：".format(len(missing)))
        for m in missing[:10]:
            log("  " + m)
        return 5
    log("完整性校验通过：{} 的全部对象都在本地。".format(head_sha[:12]))

    if args.update_ref and ref_name:
        git(["update-ref", "refs/remotes/origin/" + ref_name, head_sha], repo, check=True)
        log("已更新 refs/remotes/origin/{}".format(ref_name))
    if args.checkout:
        git(["checkout", "--detach", head_sha], repo, check=True)
        log("工作区已切到 {}".format(head_sha[:12]))

    log("API 调用 {} 次，约 {:.1f} MB".format(gh.calls, gh.bytes / 1048576.0))
    return 0


if __name__ == "__main__":
    sys.exit(main())
