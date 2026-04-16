#!/usr/bin/env bash

set -euo pipefail

PORT="${1:-3000}"

is_ready() {
  curl -fsS "http://127.0.0.1:4040/api/tunnels" >/dev/null 2>&1
}

if ! is_ready; then
  ngrok http "$PORT" --log=stdout >/tmp/agentarxiv-ngrok.log 2>&1 &
fi

for _ in $(seq 1 30); do
  if is_ready; then
    break
  fi
  sleep 1
done

python - <<'PY'
from urllib.request import urlopen
import json
payload = json.load(urlopen("http://127.0.0.1:4040/api/tunnels"))
for tunnel in payload.get("tunnels", []):
    public_url = tunnel.get("public_url", "")
    if public_url.startswith("https://"):
        print(public_url.rstrip("/"))
        break
else:
    raise SystemExit("No https ngrok tunnel is available")
PY
