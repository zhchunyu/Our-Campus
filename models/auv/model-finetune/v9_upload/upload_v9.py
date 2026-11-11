# -*- coding: utf-8 -*-
"""
V8 提取数据集一键上传到 AutoDL

用法：
    1. 填入你的 SSH 地址和端口（在 AutoDL 控制台"容器实例"里能看到）
    2. 运行：python upload_v8.py
    3. 输入密码（AutoDL 的登录密码）

或者手动指定：
    python upload_v8.py --host region-1.autodl.com --port 12345
"""

import argparse
import os
import subprocess

# ============ 改这里 ============
DEFAULT_HOST = ""      # 例如 region-3.autodl.com
DEFAULT_PORT = ""      # 例如 30512
DEFAULT_USER = "root"
# ================================

REMOTE_DATA_DIR = "/root/autodl-tmp/data"
REMOTE_ROOT_DIR = "/root/autodl-tmp"

# (本地文件, 远端目录)
FILES = [
    ("v9_extract_train.json", REMOTE_DATA_DIR),
    ("v9_extract_eval.json",  REMOTE_DATA_DIR),
    ("dataset_info.json",     REMOTE_DATA_DIR),
    ("v9_extract.yaml",       REMOTE_ROOT_DIR),
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
        f'ls -la {REMOTE_ROOT_DIR}/v9_extract.yaml && echo --- && '
        f'python -c \\"import json;'
        f'a=json.load(open(\'{REMOTE_DATA_DIR}/v9_extract_train.json\'));'
        f'b=json.load(open(\'{REMOTE_DATA_DIR}/v9_extract_eval.json\'));'
        f'print(\'训练集\',len(a),\'评估集\',len(b))\\""')

    print("\n" + ("=" * 50))
    if ok:
        print("上传完成。在 AutoDL 上执行：")
        print(f"  cd {REMOTE_ROOT_DIR}")
        print("  llamafactory-cli train v9_extract.yaml")
        print()
        print("★ 训练完成后，用这个脚本验证提取效果（不是看 loss）：")
        print("  python - <<'EOF'")
        print("  import json")
        print("  for l in open('/root/autodl-tmp/data/v9_extract_eval.json'):")
        print("      pass")
        print("  EOF")
        print()
        print("★ 重要：这是「两个独立适配器」中的提取 LoRA。")
        print("  另一个（人设化回应）用 v7_train.yaml 单独训，两个 checkpoint 分开存。")
    else:
        print("部分文件失败，请检查上面的输出。")
    print("=" * 50)


if __name__ == "__main__":
    main()
