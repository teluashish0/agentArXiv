#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_env() {
  local key="$1"
  local value="${!key:-}"
  if [[ -z "$value" ]]; then
    echo "Missing required environment variable: $key" >&2
    exit 1
  fi
}

require_cmd curl
require_cmd gcloud
require_cmd pnpm
require_cmd python3

require_env AGENTARXIV_GCP_PROJECT_ID
require_env AGENTARXIV_GCP_DB_INSTANCE
require_env AGENTARXIV_GCP_DB_NAME
require_env AGENTARXIV_GCP_DB_USER
require_env AGENTARXIV_GCP_DB_PASSWORD

PROJECT_ID="${AGENTARXIV_GCP_PROJECT_ID}"
DB_INSTANCE="${AGENTARXIV_GCP_DB_INSTANCE}"
DB_NAME="${AGENTARXIV_GCP_DB_NAME}"
DB_USER="${AGENTARXIV_GCP_DB_USER}"
DB_PASSWORD="${AGENTARXIV_GCP_DB_PASSWORD}"
default_proxy_port() {
  python3 - <<'PY'
import socket

with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    print(sock.getsockname()[1])
PY
}

PROXY_PORT="${AGENTARXIV_GCP_DB_PROXY_PORT:-$(default_proxy_port)}"
PROXY_VERSION="v2.18.3"
PROXY_LOG="${RUNNER_TEMP:-/tmp}/agentarxiv-cloud-sql-proxy.log"

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64)
    PROXY_TARGET="darwin.arm64"
    ;;
  Darwin-x86_64)
    PROXY_TARGET="darwin.amd64"
    ;;
  Linux-aarch64 | Linux-arm64)
    PROXY_TARGET="linux.arm64"
    ;;
  Linux-x86_64)
    PROXY_TARGET="linux.amd64"
    ;;
  *)
    echo "Unsupported platform for Cloud SQL Auth Proxy: $(uname -s)-$(uname -m)" >&2
    exit 1
    ;;
esac

PROXY_BIN="${RUNNER_TEMP:-/tmp}/cloud-sql-proxy-${PROXY_TARGET}"

if [[ ! -x "$PROXY_BIN" ]]; then
  curl -fsSL \
    "https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/${PROXY_VERSION}/cloud-sql-proxy.${PROXY_TARGET}" \
    -o "$PROXY_BIN"
  chmod +x "$PROXY_BIN"
fi

CONNECTION_NAME="$(
  gcloud sql instances describe "$DB_INSTANCE" \
    --project "$PROJECT_ID" \
    --format='value(connectionName)'
)"

"$PROXY_BIN" \
  --address 127.0.0.1 \
  --port "$PROXY_PORT" \
  "$CONNECTION_NAME" >"$PROXY_LOG" 2>&1 &
PROXY_PID=$!

cleanup() {
  kill "$PROXY_PID" >/dev/null 2>&1 || true
}

trap cleanup EXIT

for _ in {1..30}; do
  if ! kill -0 "$PROXY_PID" >/dev/null 2>&1; then
    echo "Cloud SQL Auth Proxy exited before becoming ready." >&2
    cat "$PROXY_LOG" >&2 || true
    exit 1
  fi

  if (echo >"/dev/tcp/127.0.0.1/${PROXY_PORT}") >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! (echo >"/dev/tcp/127.0.0.1/${PROXY_PORT}") >/dev/null 2>&1; then
  echo "Cloud SQL Auth Proxy did not become ready." >&2
  cat "$PROXY_LOG" >&2 || true
  exit 1
fi

DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${PROXY_PORT}/${DB_NAME}?schema=public" \
  pnpm db:push
