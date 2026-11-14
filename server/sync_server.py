#!/usr/bin/env python3
"""Minimal sync endpoint for Le mot juste: one JSON document per token. Standard library only.

  LMJ_TOKENS  comma-separated secret tokens that may sync (required; use long random strings)
  LMJ_DIR     where documents are stored (default ./sync-data)
  LMJ_PORT    port on 127.0.0.1 (default 8787); put a TLS reverse proxy in front
  LMJ_HOST    address to bind (default 127.0.0.1; use 0.0.0.0 inside a container that publishes no ports)
  LMJ_ORIGIN  value for Access-Control-Allow-Origin (default *; safe, auth is the bearer token)

GET  /  -> 200 stored document | 404 nothing yet        PUT /  -> 204 stored
Every request needs "Authorization: Bearer <token>". A token only ever reaches its own document.
"""
import hashlib, hmac, json, os, tempfile, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKENS = [t.strip() for t in os.environ.get("LMJ_TOKENS", "").split(",") if len(t.strip()) >= 24]
DIR = os.environ.get("LMJ_DIR", "./sync-data")
ORIGIN = os.environ.get("LMJ_ORIGIN", "*")
MAX = 8 * 1024 * 1024
WRITE = threading.Lock()          # one upload at a time touches the stored file


class Handler(BaseHTTPRequestHandler):
    server_version = "lmj-sync"
    timeout = 20                  # seconds: a silent or slow connection is dropped, it cannot hold a thread

    def reply(self, code, body=b"", ctype="application/json"):
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin", ORIGIN)
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def path_for_token(self):
        given = self.headers.get("Authorization", "")
        given = given[7:] if given.startswith("Bearer ") else ""
        ok = [t for t in TOKENS if hmac.compare_digest(t.encode(), given.encode())]
        return os.path.join(DIR, hashlib.sha256(ok[0].encode()).hexdigest()[:40] + ".json") if ok else None

    def do_OPTIONS(self):
        self.reply(204)

    def do_GET(self):
        path = self.path_for_token()
        if not path:
            return self.reply(401)
        if not os.path.exists(path):
            return self.reply(404)
        self.reply(200, open(path, "rb").read())

    def do_PUT(self):
        path = self.path_for_token()
        if not path:
            return self.reply(401)
        size = int(self.headers.get("Content-Length") or 0)
        if not 0 < size <= MAX:
            return self.reply(413)
        body = self.rfile.read(size)
        try:
            doc = json.loads(body)
            assert isinstance(doc, dict) and doc.get("app") == "le-mot-juste" and isinstance(doc.get("cards"), dict)
        except Exception:
            return self.reply(400)
        with WRITE:
            fd, tmp = tempfile.mkstemp(dir=DIR, suffix=".tmp")      # own temp file per upload
            with os.fdopen(fd, "wb") as fh:
                fh.write(body)
            if os.path.exists(path):
                os.replace(path, path + ".bak")      # keep the previous version
            os.replace(tmp, path)
        self.reply(204)

    def log_message(self, fmt, *args):               # no tokens or bodies in logs
        print(f"{self.command} {args[1] if len(args) > 1 else ''}", flush=True)


if __name__ == "__main__":
    if not TOKENS:
        raise SystemExit("Set LMJ_TOKENS to at least one token of 24+ characters.")
    os.makedirs(DIR, mode=0o700, exist_ok=True)
    ThreadingHTTPServer((os.environ.get("LMJ_HOST", "127.0.0.1"), int(os.environ.get("LMJ_PORT", "8787"))), Handler).serve_forever()
