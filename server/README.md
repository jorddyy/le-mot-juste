# Optional sync server

The app works without this. To keep phone and laptop in step, run `sync_server.py` somewhere you
control and enter its URL and a token under Settings → Sync on each device. Nothing in this
repository points at any server.

1. Make a token: `python3 -c "import secrets; print(secrets.token_urlsafe(32))"`
2. Run it as an unprivileged user (systemd example):

   ```ini
   [Service]
   User=lmj
   Environment=LMJ_TOKENS=<token> LMJ_DIR=/var/lib/lmj-sync
   ExecStart=/usr/bin/python3 /opt/lmj/sync_server.py
   Restart=on-failure
   ```
3. Put HTTPS in front, e.g. Caddy: `sync.example.org { reverse_proxy 127.0.0.1:8787 }`

What it holds: learning progress only (cards, answer log, flags). A leaked token lets someone read
or overwrite that document; the previous version is kept as `.bak`, and the app's export is a backup.
Protocol: `GET` and `PUT` on the URL with `Authorization: Bearer <token>`; the app validates
everything it downloads and merges per card (the most recent review wins).
