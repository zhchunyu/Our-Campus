# -*- coding: utf-8 -*-
"""
V7-Deep 数据集一键上传到 AutoDL

用法：
    1. 填入你的 SSH 地址和端口（AutoDL 控制台"容器实例"里能看到）
    2. 运行：python upload_v7_deep.py
    3. 输入密码（AutoDL 的登录密码）

或者手动指定：
    python upload_v7_deep.py --host region-1.autodl.com --port 12345

★ 会传 6 个文件：训练集/评估集/dataset_info 到 data/，yaml + 生成器 + 验收脚本到根目录。
★ dataset_info.json 是**覆盖**上传 —— 已包含现有全部 12 条注册 + 新增 2 条（auv_v7_deep / _eval），
  不会破坏 v6/v7/v8/v9/v10 的数据集注册。
"""

import argparse
import os
import subprocess

# ============ 改这里（或运行时用 --host/--port）============
DEFAULT_HOST = ""      # 例如 region-3.autodl.com
DEFAULT_PORT = ""      # 例如 30512
DEFAULT_USER = "root"
# =========================================================

REMOTE_DATA_DIR = "/root/autodl-tmp/data"
REMOTE_ROOT_DIR = "/root/autodl-tmp"

# (本地文件, 远端目录)
FILES = [
    ("v7_deep_train.json",  REMOTE_DATA_DIR),
    ("v7_deep_eval.json",   REMOTE_DATA_DIR),
    ("dataset_info.json",   REMOTE_DATA_DIR),
    ("v7_deep_train.yaml",  REMOTE_ROOT_DIR),
    ("build_v7_deep.py",    REMOTE_ROOT_DIR),
    ("check_v7_deep.py",    REMOTE_ROOT_DIR),
]


def run(cmd):
    print(f"$ {cmd}")
    return subprocess.run(cmd, shell=True).returncode


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
    run(f'ssh -p {port} {user}@{host} "mkdir -p {REMOTE_DATA_DIR}"')

    ok = True
    for fname, remote_dir in FILES:
        local = os.path.join(base, fname)
        if not os.path.exists(local):
            print(f"[跳过] 本地不存在: {fname}")
            ok = False
            continue
        if run(f'scp -P {port} "{local}" {user}@{host}:{remote_dir}/') != 0:
            ok = False
            print(f"[失败] {fname}")

    print("\n=== 验证远端文件 ===")
    run(f'ssh -p {port} {user}@{host} "ls -la {REMOTE_DATA_DIR}/v7_deep_*.json && echo --- && '
        f'ls -la {REMOTE_ROOT_DIR}/v7_deep_train.yaml && echo --- && '
        f'python -c \\"import json;'
        f'a=json.load(open(\'{REMOTE_DATA_DIR}/v7_deep_train.json\'));'
        f'b=json.load(open(\'{REMOTE_DATA_DIR}/v7_deep_eval.json\'));'
        f'print(\'训练集\',len(a),\'评估集\',len(b))\\""')

    print("\n" + "=" * 52)
    if ok:
        print("上传完成。在 AutoDL 上执行：")
        print(f"  cd {REMOTE_ROOT_DIR}")
        print("  llamafactory-cli train v7_deep_train.yaml")
        print("\n★ 输出在 output/qwen25-14b-auv-v7-deep/")
    else:
        print("部分文件失败，请检查上面的输出。")
    print("=" * 52)


if __name__ == "__main__":
    main()
