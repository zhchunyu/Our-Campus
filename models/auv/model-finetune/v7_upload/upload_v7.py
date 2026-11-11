# -*- coding: utf-8 -*-
"""
V7 数据集一键上传到 AutoDL

用法：
    1. 填入你的 SSH 地址和端口（在 AutoDL 控制台"容器实例"里能看到）
    2. 运行：python upload_v7.py
    3. 输入密码（AutoDL 的登录密码）

或者手动指定：
    python upload_v7.py --host region-1.autodl.com --port 12345
"""

import argparse
import os
import subprocess
import sys

# ============ 改这里 ============
DEFAULT_HOST = ""      # 例如 region-3.autodl.com
DEFAULT_PORT = ""      # 例如 30512
DEFAULT_USER = "root"
# ================================

REMOTE_DATA_DIR = "/root/autodl-tmp/data"
REMOTE_ROOT_DIR = "/root/autodl-tmp"

# (本地文件, 远端目录)
FILES = [
    ("v7_train.json",       REMOTE_DATA_DIR),
    ("v7_eval.json",        REMOTE_DATA_DIR),
    ("dataset_info.json",   REMOTE_DATA_DIR),
    ("v7_train.yaml",       REMOTE_ROOT_DIR),
]


def run(cmd):
    print(f"$ {cmd}")
    r = subprocess.run(cmd, shell=True)
    return r.returncode


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default=DEFAULT_HOST)
    ap.add_argument("--port", default=DEFAULT_PORT)
    ap.add_argument("--user", default=DEFAULT_USER)
    args = ap.parse_args()

    host, port, user = args.host, args.port, args.user
    if not host:
        host = input("AutoDL SSH 地址（如 region-3.autodl.com）: ").strip()
    if not port:
        port = input("SSH 端口（如 30512）: ").strip()

    base = os.path.dirname(os.path.abspath(__file__))

    print("\n=== 开始上传 ===\n")

    # 先建远端目录
    run(f'ssh -p {port} {user}@{host} "mkdir -p {REMOTE_DATA_DIR}"')

    ok = True
    for fname, remote_dir in FILES:
        local = os.path.join(base, fname)
        if not os.path.exists(local):
            print(f"[跳过] 本地不存在: {fname}")
            ok = False
            continue
        rc = run(f'scp -P {port} "{local}" {user}@{host}:{remote_dir}/')
        if rc != 0:
            ok = False
            print(f"[失败] {fname}")

    print("\n=== 验证远端文件 ===")
    run(f'ssh -p {port} {user}@{host} "ls -la {REMOTE_DATA_DIR} && echo --- && '
        f'ls -la {REMOTE_ROOT_DIR}/v7_train.yaml && echo --- && '
        f'python -c \\"import json;d=json.load(open(\'{REMOTE_DATA_DIR}/v7_train.json\'));print(\'训练集\',len(d))\""')

    print("\n" + ("=" * 46))
    if ok:
        print("上传完成。在 AutoDL 上执行：")
        print(f"  cd {REMOTE_ROOT_DIR}")
        print("  llamafactory-cli train v7_train.yaml")
    else:
        print("部分文件失败，请检查上面的输出。")
    print("=" * 46)


if __name__ == "__main__":
    main()
