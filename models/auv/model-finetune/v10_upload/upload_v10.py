# -*- coding: utf-8 -*-
"""
V10 数据集上传脚本（本地跑，推到 AutoDL）
用法：python upload_v10.py <服务器地址> <端口>
例：  python upload_v10.py region-1.autodl.com 12345
"""
import os, sys, subprocess

HOST = sys.argv[1] if len(sys.argv) > 1 else "region-1.autodl.com"
PORT = sys.argv[2] if len(sys.argv) > 2 else "12345"
DEST = "root@%s:/root/autodl-tmp/" % HOST

HERE = os.path.dirname(os.path.abspath(__file__))

FILES = [
    # —— 训练必需 ——
    ("v10_extract.yaml",             "/root/autodl-tmp/v10_extract.yaml"),
    ("data/v10_extract_train.json",  "/root/autodl-tmp/data/v10_extract_train.json"),
    ("data/v10_extract_eval.json",   "/root/autodl-tmp/data/v10_extract_eval.json"),
    ("data/dataset_info.json",       "/root/autodl-tmp/data/dataset_info.json"),
    # —— 测验必需（★ 之前漏传，导致 check_v10.py 的「地点合法率」判据被跳过）——
    ("campus_locations.json",        "/root/autodl-tmp/campus_locations.json"),
    ("campus_locations.json",        "/root/autodl-tmp/data/campus_locations.json"),
    ("check_v10.py",                 "/root/autodl-tmp/check_v10.py"),
    ("check_ai_value.py",            "/root/autodl-tmp/check_ai_value.py"),
    ("check_db_match.py",            "/root/autodl-tmp/check_db_match.py"),
    ("expand_aliases.py",            "/root/autodl-tmp/expand_aliases.py"),
]

print("★ 注意：dataset_info.json 会覆盖服务器上的同名文件。")
print("  如果服务器上还有别的数据集要保留，请先备份。\n")

for local, remote in FILES:
    src = os.path.join(HERE, local)
    if not os.path.exists(src):
        print("!! 缺失:", src)
        continue
    print("上传 %s → %s" % (local, remote))
    cmd = ["scp", "-P", PORT, src, "%s:%s" % (HOST, remote)]
    r = subprocess.run(cmd)
    if r.returncode != 0:
        print("!! 失败:", local)
        sys.exit(1)

print("\n全部上传完成。")
print("在服务器上执行：")
print("  cd /root/autodl-tmp")
print("  llamafactory-cli train v10_extract.yaml        # 训练")
print("  python check_v10.py                            # 验收（含地点合法率）")
print("  python check_ai_value.py                       # 三路对比（正则/基础/LoRA）")
print("\n★ 完整顺序见 v10_upload/RUN_ORDER.md")
