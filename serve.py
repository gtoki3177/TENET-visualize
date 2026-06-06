#!/usr/bin/env python3
"""Dev static server that disables caching, so edited ES modules always reload fresh.
Usage: python serve.py [port]   (default 8170)"""
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8170
    print(f'No-cache server on http://localhost:{port}/')
    HTTPServer(('', port), NoCacheHandler).serve_forever()
