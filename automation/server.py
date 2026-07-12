#!/usr/bin/env python3
"""Minimal HTTP server for Scrutari SPA testing.
Serves static files from the parent directory on port 8765."""

import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
DIR = os.path.join(os.path.dirname(__file__), '..')

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)
    def log_message(self, fmt, *args):
        pass  # quiet

if __name__ == '__main__':
    http.server.HTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
