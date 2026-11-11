#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
blender_bridge.py —— Blender MCP 命令行桥接
================================================================
把本地 .py 脚本送进正在运行的 Blender 里执行，并把 Blender 的 stdout 取回来。

为什么不用 MCP 工具调用：
  MCP 工具只暴露固定几个能力，而建模需要大量任意 bpy 代码。
  这个桥接直接走 Blender 插件暴露的 socket（默认 127.0.0.1:9876），
  协议就是 {"type": "execute_code", "params": {"code": "..."}}。

前置条件：
  1. Blender 已打开
  2. 编辑 > 偏好设置 > 插件 里启用 "MCP for Blender"
  3. 3D 视图按 N → "MCP for Blender" 面板 → Start MCP Server

用法：
  python blender_bridge.py ping
  python blender_bridge.py run  build_main_building.py
  python blender_bridge.py run  build_main_building.py --timeout 1800
  python blender_bridge.py code "import bpy; print(bpy.app.version_string)"
"""

import argparse
import json
import socket
import sys
from pathlib import Path

HOST = "127.0.0.1"
PORT = 9876
RECV_CHUNK = 1 << 16


class BlenderError(RuntimeError):
    """Blender 端抛出的异常（含 traceback，便于定位到提交代码的具体行）"""


def send(command: dict, timeout: float = 600.0) -> dict:
    """发送一条命令并等待完整响应。"""
    try:
        sock = socket.create_connection((HOST, PORT), timeout=10.0)
    except OSError as exc:
        raise SystemExit(
            f"连不上 Blender（{HOST}:{PORT}）：{exc}\n"
            "→ 请确认 Blender 已打开，且 MCP for Blender 插件的 Start MCP Server 已点击。"
        )

    try:
        sock.sendall(json.dumps(command).encode("utf-8"))
        sock.settimeout(timeout)

        buf = b""
        while True:
            try:
                chunk = sock.recv(RECV_CHUNK)
            except socket.timeout:
                raise SystemExit(
                    f"等待 Blender 响应超时（{timeout}s）。"
                    "如果正在渲染，请调大 --timeout。"
                )
            if not chunk:
                break
            buf += chunk
            try:
                return json.loads(buf.decode("utf-8", "ignore"))
            except (json.JSONDecodeError, UnicodeDecodeError):
                # 响应还没收完，继续读
                continue
        raise SystemExit(f"Blender 关闭了连接且未返回完整响应（已收 {len(buf)} 字节）")
    finally:
        sock.close()


def run_code(code: str, timeout: float = 600.0) -> str:
    """在 Blender 里执行一段 bpy 代码，返回其 stdout。"""
    resp = send({"type": "execute_code", "params": {"code": code}}, timeout=timeout)

    status = resp.get("status")
    if status != "success":
        message = resp.get("message", resp)
        # 插件把异常包成了 JSON 字符串，解开让 traceback 可读
        try:
            detail = json.loads(message)
            raise BlenderError(
                f"{detail.get('exception_type')}: {detail.get('message')}\n"
                f"{detail.get('traceback', '')}"
            )
        except (json.JSONDecodeError, TypeError):
            raise BlenderError(str(message))

    return resp.get("result", {}).get("result", "")


def run_file(path: Path, timeout: float = 600.0) -> str:
    if not path.exists():
        raise SystemExit(f"脚本不存在：{path}")
    return run_code(path.read_text(encoding="utf-8"), timeout=timeout)


def main() -> int:
    ap = argparse.ArgumentParser(description="在运行中的 Blender 里执行 bpy 代码")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("ping", help="连通性检查")

    p_run = sub.add_parser("run", help="执行一个本地 .py 文件")
    p_run.add_argument("script", type=Path)
    p_run.add_argument("--timeout", type=float, default=600.0)

    p_code = sub.add_parser("code", help="直接执行一段代码")
    p_code.add_argument("code")
    p_code.add_argument("--timeout", type=float, default=600.0)

    args = ap.parse_args()

    try:
        if args.cmd == "ping":
            resp = send({"type": "ping", "params": {}})
            print(json.dumps(resp, ensure_ascii=False))
        elif args.cmd == "run":
            out = run_file(args.script, args.timeout)
            print(out, end="" if out.endswith("\n") else "\n")
        else:
            out = run_code(args.code, args.timeout)
            print(out, end="" if out.endswith("\n") else "\n")
    except BlenderError as exc:
        print(f"[Blender 报错]\n{exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
