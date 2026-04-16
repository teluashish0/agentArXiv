#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

load_env_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    eval "$(
      python - "$file" <<'PY'
from pathlib import Path
import shlex
import sys

for raw_line in Path(sys.argv[1]).read_text().splitlines():
    line = raw_line.strip()
    if not line or line.startswith("#") or "=" not in raw_line:
        continue
    key, value = raw_line.split("=", 1)
    print(f"export {key}={shlex.quote(value)}")
PY
    )"
  fi
}

load_env_file ".env.local"
load_env_file "apps/frontend/.env.local"

require_url() {
  local url="$1"
  local label="$2"
  local status
  status="$(curl -fsS -o /dev/null -w '%{http_code}' "$url")"
  echo "$label $status $url"
}

require_url "http://localhost:3000" "frontend"
require_url "${AGENTARXIV_CHATKIT_BACKEND_URL%/}/health" "chatkit"
require_url "${AGENTARXIV_MCP_ENDPOINT%/mcp}/health" "mcp"
