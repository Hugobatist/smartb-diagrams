#!/usr/bin/env python3
"""Servidor local para SmartB Diagrams Live.

Uso: python serve.py [porta]
Padrao: porta 3333 → http://localhost:3333

Serve arquivos .mmd e .html da pasta diagramas/.
Suporta subpastas para organizacao por feature.
"""
import http.server
import json
import os
import shutil
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 3333
DIR = os.path.dirname(os.path.abspath(__file__))


def scan_tree(base):
    """Scan .mmd files recursively, return nested tree structure."""
    result = []
    try:
        entries = sorted(os.listdir(base))
    except OSError:
        return result

    dirs = []
    files = []
    for e in entries:
        full = os.path.join(base, e)
        if os.path.isdir(full) and not e.startswith('.'):
            children = scan_tree(full)
            if children:  # only show non-empty folders
                dirs.append({'name': e, 'type': 'folder', 'children': children})
        elif e.endswith('.mmd'):
            rel = os.path.relpath(full, DIR)
            files.append({'name': e, 'type': 'file', 'path': rel})

    return dirs + files


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(length))

        if self.path == '/save':
            fpath = body.get('filename', '')
            content = body.get('content', '')
            if not fpath or not fpath.endswith('.mmd'):
                return self._json(400, {'error': 'Nome invalido'})
            # Allow subpaths but prevent traversal
            safe = os.path.normpath(fpath).lstrip('/')
            if '..' in safe:
                return self._json(400, {'error': 'Path invalido'})
            full = os.path.join(DIR, safe)
            os.makedirs(os.path.dirname(full), exist_ok=True)
            with open(full, 'w', encoding='utf-8') as f:
                f.write(content)
            return self._json(200, {'ok': True, 'file': safe})

        if self.path == '/delete':
            fpath = body.get('filename', '')
            if not fpath or not fpath.endswith('.mmd'):
                return self._json(400, {'error': 'Nome invalido'})
            safe = os.path.normpath(fpath).lstrip('/')
            if '..' in safe:
                return self._json(400, {'error': 'Path invalido'})
            full = os.path.join(DIR, safe)
            try:
                os.remove(full)
                # Remove empty parent dirs
                parent = os.path.dirname(full)
                while parent != DIR:
                    if not os.listdir(parent):
                        os.rmdir(parent)
                        parent = os.path.dirname(parent)
                    else:
                        break
                return self._json(200, {'ok': True})
            except FileNotFoundError:
                return self._json(404, {'error': 'Nao encontrado'})

        if self.path == '/mkdir':
            folder = body.get('folder', '')
            if not folder:
                return self._json(400, {'error': 'Nome invalido'})
            safe = os.path.normpath(folder).lstrip('/')
            if '..' in safe:
                return self._json(400, {'error': 'Path invalido'})
            os.makedirs(os.path.join(DIR, safe), exist_ok=True)
            return self._json(200, {'ok': True})

        if self.path == '/move':
            src = body.get('from', '')
            dst = body.get('to', '')
            if not src or not dst:
                return self._json(400, {'error': 'Params invalidos'})
            src_safe = os.path.normpath(src).lstrip('/')
            dst_safe = os.path.normpath(dst).lstrip('/')
            if '..' in src_safe or '..' in dst_safe:
                return self._json(400, {'error': 'Path invalido'})
            full_src = os.path.join(DIR, src_safe)
            full_dst = os.path.join(DIR, dst_safe)
            os.makedirs(os.path.dirname(full_dst), exist_ok=True)
            shutil.move(full_src, full_dst)
            return self._json(200, {'ok': True})

        self.send_response(404)
        self.end_headers()

    def _json(self, code, data):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_GET(self):
        if self.path.startswith('/tree.json'):
            tree = scan_tree(DIR)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(tree).encode())
            return

        # Legacy flat list
        if self.path.startswith('/files.json'):
            files = []
            for root, _, fnames in os.walk(DIR):
                for fn in fnames:
                    if fn.endswith('.mmd'):
                        files.append(os.path.relpath(
                            os.path.join(root, fn), DIR))
            files.sort()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(files).encode())
            return

        if self.path.split('?')[0].endswith('.mmd'):
            clean = self.path.split('?')[0].lstrip('/')
            fpath = os.path.join(DIR, clean)
            fpath = os.path.normpath(fpath)
            if not fpath.startswith(DIR):
                self.send_response(403)
                self.end_headers()
                return
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.send_header('Cache-Control', 'no-cache, no-store')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            try:
                with open(fpath, 'rb') as f:
                    self.wfile.write(f.read())
            except FileNotFoundError:
                pass
            return

        super().do_GET()

    def log_message(self, format, *args):
        if '200' not in str(args):
            super().log_message(format, *args)


if __name__ == '__main__':
    print(f'\n  SmartB Diagrams Live')
    print(f'  → http://localhost:{PORT}/live.html')
    print(f'  Ctrl+C para parar\n')
    with http.server.HTTPServer(('', PORT), Handler) as server:
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print('\nParado.')
