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

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

load_env_file ".env.local"

require_cmd cloud-sql-proxy

PROJECT_ID="${AGENTARXIV_GCP_PROJECT_ID:-agentarxiv}"
REGION="${AGENTARXIV_GCP_REGION:-us-central1}"
DB_INSTANCE="${AGENTARXIV_GCP_DB_INSTANCE:-agentarxiv-pg}"
LOCAL_DB_PROXY_PORT="${AGENTARXIV_LOCAL_DB_PROXY_PORT:-55432}"

CONNECTION_NAME="${PROJECT_ID}:${REGION}:${DB_INSTANCE}"

exec cloud-sql-proxy "$CONNECTION_NAME" --port "$LOCAL_DB_PROXY_PORT"
