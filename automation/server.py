#!/usr/bin/env python3
"""Minimal HTTP server for Scrutari SPA testing.
Serves static files from the parent directory.
Supports both IPv4 and IPv6 binding.

Usage:
    python3 automation/server.py              # IPv4, port 8765
    python3 automation/server.py 8000         # Custom port
    python3 automation/server.py 8765 ::      # IPv6, port 8765
    python3 automation/server.py --bind ::    # IPv6, port 8765
"""

import http.server
import os
import sys

PORT = 8765
BIND = '127.0.0.1'  # default IPv4 loopback

# Parse arguments: [port] [bind] or --bind <bind>
args = [a for a in sys.argv[1:] if not a.startswith('--')]
if args:
    try:
        PORT = int(args[0])
        if len(args) > 1:
            BIND = args[1]
    except ValueError:
        BIND = args[0]
        if len(args) > 1:
            try:
                PORT = int(args[1])
            except ValueError:
                pass

# Also support --bind <address>
if '--bind' in sys.argv:
    idx = sys.argv.index('--bind')
    if idx + 1 < len(sys.argv):
        BIND = sys.argv[idx + 1]
        # Check if next arg is a port number
        if idx + 2 < len(sys.argv):
            try:
                PORT = int(sys.argv[idx + 2])
            except ValueError:
                pass

DIR = os.path.join(os.path.dirname(__file__), '..')

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)
    def log_message(self, fmt, *args):
        pass  # quiet

if __name__ == '__main__':
    import socket
    family = socket.AF_INET6 if ':' in BIND else socket.AF_INET
    server = http.server.HTTPServer((BIND, PORT), Handler)
    server.socket = socket.socket(family, socket.SOCK_STREAM)
    server.server_address = (BIND, PORT)
    server.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.socket.bind((BIND, PORT))
    server.socket.listen(5)
    print(f'[Scrutari Test Server] http://{BIND}:{PORT}/ (family={"IPv6" if family == socket.AF_INET6 else "IPv4"})')
    server.serve_forever()
