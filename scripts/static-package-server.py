#!/usr/bin/env python3
"""双拼 NEXT 静态包启动器。

不依赖任何第三方 Python 包：在静态包根目录运行 `python start.py`，
会打印可点击的地址并自动打开浏览器。也可以传入 --no-browser 关闭自动打开。
"""
from __future__ import annotations

import argparse
import http.server
import socket
import sys
import threading
import webbrowser
from functools import partial
from pathlib import Path


class StaticHandler(http.server.SimpleHTTPRequestHandler):
    """开发/本地静态包用：禁用缓存，避免更新 ZIP 后仍看到旧资源。"""

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()


def pick_port(start: int, host: str) -> int:
    for port in range(start, start + 20):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
                probe.bind((host, port))
            return port
        except OSError:
            continue
    raise SystemExit(f"端口 {start}-{start + 19} 都被占用，请用 --port 指定其它端口。")


def main() -> None:
    # 后台/重定向输出时也立即显示启动信息。
    try:
        sys.stdout.reconfigure(line_buffering=True)
    except (AttributeError, ValueError):
        pass
    parser = argparse.ArgumentParser(description="启动双拼 NEXT 静态包")
    parser.add_argument("--port", type=int, default=8080, help="监听端口，默认 8080")
    parser.add_argument("--no-browser", action="store_true", help="不自动打开浏览器")
    parser.add_argument("--root", type=Path, default=None, help="静态目录，默认是 start.py 所在目录")
    args = parser.parse_args()

    root = (args.root or Path(__file__).resolve().parent).resolve()
    index = root / "index.html"
    if not index.is_file():
        raise SystemExit(f"没有找到 {index}，请从解压后的静态包目录运行本脚本。")

    host = "127.0.0.1"
    port = pick_port(args.port, host)
    url = f"http://{host}:{port}/"
    handler = partial(StaticHandler, directory=str(root))
    server = http.server.ThreadingHTTPServer((host, port), handler)

    print()
    print("=" * 58)
    print("  双拼 NEXT · 静态包")
    print(f"  打开地址：{url}")
    print(f"  数据目录：{root}")
    print("  停止服务：按 Ctrl+C")
    if args.no_browser:
        print("  自动打开：已关闭（--no-browser）")
    else:
        print("  自动打开：正在打开浏览器…")
    print("=" * 58)
    print()

    if not args.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已停止。")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
