#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

load_env_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    eval "$(
      python - "$file" <<'PY'
from os import environ
from pathlib import Path
import shlex
import sys

for raw_line in Path(sys.argv[1]).read_text().splitlines():
    line = raw_line.strip()
    if not line or line.startswith("#") or "=" not in raw_line:
        continue
    key, value = raw_line.split("=", 1)
    if key in environ:
        continue
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

require_env() {
  local key="$1"
  local value="${!key:-}"
  if [[ -z "$value" ]]; then
    echo "Missing required environment variable: $key" >&2
    exit 1
  fi
}

upsert_env_file() {
  local file="$1"
  local key="$2"
  local value="$3"
  python - "$file" "$key" "$value" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
key = sys.argv[2]
value = sys.argv[3]

lines = path.read_text().splitlines() if path.exists() else []
updated = False
output = []
for line in lines:
    if line.startswith(f"{key}="):
        output.append(f"{key}={value}")
        updated = True
    else:
        output.append(line)
if not updated:
    output.append(f"{key}={value}")
path.write_text("\n".join(output).rstrip() + "\n")
PY
}

build_image() {
  local image="$1"
  docker buildx build \
    --platform linux/amd64 \
    --provenance=false \
    --push \
    -f apps/frontend/Dockerfile \
    -t "$image" \
    --build-arg "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}" \
    .
}

load_env_file ".env.local"
load_env_file "apps/frontend/.env.local"

require_cmd gcloud
require_cmd docker
require_cmd python

PROJECT_ID="${AGENTARXIV_GCP_PROJECT_ID:-agentarxiv}"
REGION="${AGENTARXIV_GCP_REGION:-us-central1}"
ARTIFACT_REPO="${AGENTARXIV_GCP_ARTIFACT_REPO:-agentarxiv}"
FRONTEND_SERVICE="${AGENTARXIV_GCP_FRONTEND_SERVICE:-agentarxiv-frontend}"
DB_INSTANCE="${AGENTARXIV_GCP_DB_INSTANCE:-agentarxiv-pg}"
DB_NAME="${AGENTARXIV_GCP_DB_NAME:-agentarxiv}"
DB_USER="${AGENTARXIV_GCP_DB_USER:-agentarxiv}"
DB_PASSWORD="${AGENTARXIV_GCP_DB_PASSWORD:-}"
REQUESTED_PUBLIC_APP_URL="${AGENTARXIV_APP_URL:-}"
CHATKIT_BACKEND_URL="${AGENTARXIV_CHATKIT_BACKEND_URL:-}"
MCP_ENDPOINT="${AGENTARXIV_MCP_ENDPOINT:-}"
CHATKIT_SHARED_SECRET="${AGENTARXIV_CHATKIT_SHARED_SECRET:-}"
NEXT_PUBLIC_CLERK_SIGN_IN_URL="${NEXT_PUBLIC_CLERK_SIGN_IN_URL:-/sign-in}"
NEXT_PUBLIC_AGENTARXIV_ENABLE_GOOGLE_SIGN_IN="${NEXT_PUBLIC_AGENTARXIV_ENABLE_GOOGLE_SIGN_IN:-false}"
SANDBOX_DEFAULT_USAGE_BUDGET_CENTS="${AGENTARXIV_SANDBOX_DEFAULT_USAGE_BUDGET_CENTS:-}"
ALLOW_DEFAULT_TEMPLATE_FALLBACK="${AGENTARXIV_E2B_ALLOW_DEFAULT_TEMPLATE_FALLBACK:-false}"

require_env AGENTARXIV_GCP_PROJECT_ID
require_env AGENTARXIV_GCP_DB_INSTANCE
require_env AGENTARXIV_GCP_DB_PASSWORD
require_env NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
require_env CLERK_SECRET_KEY
require_env AGENTARXIV_CHATKIT_BACKEND_URL
require_env AGENTARXIV_CHATKIT_SHARED_SECRET
require_env AGENTARXIV_MCP_ENDPOINT
require_env OPENAI_API_KEY
require_env STRIPE_SECRET_KEY
require_env STRIPE_WEBHOOK_SECRET
require_env STRIPE_SANDBOX_PRICE_ID
require_env STRIPE_SANDBOX_PRODUCT_ID
require_env STRIPE_SANDBOX_PLAN_NAME
require_env STRIPE_SANDBOX_PLAN_LOOKUP_KEY
require_env STRIPE_SANDBOX_USAGE_PRICE_ID
require_env STRIPE_SANDBOX_METER_EVENT_NAME
require_env AGENTARXIV_SANDBOX_USAGE_PRICE_USD_PER_SECOND
require_env E2B_API_KEY
require_env E2B_SANDBOX_TEMPLATE

gcloud config set project "$PROJECT_ID" >/dev/null
gcloud config set run/region "$REGION" >/dev/null
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet >/dev/null

CONNECTION_NAME="$(gcloud sql instances describe "$DB_INSTANCE" --project "$PROJECT_ID" --format='value(connectionName)')"
RUN_DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost/${DB_NAME}?host=/cloudsql/${CONNECTION_NAME}&schema=public"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
IMAGE_BASE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}"
FRONTEND_IMAGE="${IMAGE_BASE}/frontend:${TIMESTAMP}"

build_image "$FRONTEND_IMAGE"

ENV_VARS=(
  "DATABASE_URL=${RUN_DATABASE_URL}"
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}"
  "CLERK_SECRET_KEY=${CLERK_SECRET_KEY}"
  "NEXT_PUBLIC_CLERK_SIGN_IN_URL=${NEXT_PUBLIC_CLERK_SIGN_IN_URL}"
  "NEXT_PUBLIC_AGENTARXIV_ENABLE_GOOGLE_SIGN_IN=${NEXT_PUBLIC_AGENTARXIV_ENABLE_GOOGLE_SIGN_IN}"
  "AGENTARXIV_APP_URL=${REQUESTED_PUBLIC_APP_URL:-https://example.com}"
  "AGENTARXIV_CHATKIT_BACKEND_URL=${CHATKIT_BACKEND_URL}"
  "AGENTARXIV_CHATKIT_SHARED_SECRET=${CHATKIT_SHARED_SECRET}"
  "AGENTARXIV_MCP_ENDPOINT=${MCP_ENDPOINT}"
  "OPENAI_API_KEY=${OPENAI_API_KEY}"
  "STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}"
  "STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}"
  "STRIPE_SANDBOX_PRICE_ID=${STRIPE_SANDBOX_PRICE_ID}"
  "STRIPE_SANDBOX_PRODUCT_ID=${STRIPE_SANDBOX_PRODUCT_ID}"
  "STRIPE_SANDBOX_PLAN_NAME=${STRIPE_SANDBOX_PLAN_NAME}"
  "STRIPE_SANDBOX_PLAN_LOOKUP_KEY=${STRIPE_SANDBOX_PLAN_LOOKUP_KEY}"
  "STRIPE_SANDBOX_USAGE_PRICE_ID=${STRIPE_SANDBOX_USAGE_PRICE_ID}"
  "STRIPE_SANDBOX_METER_EVENT_NAME=${STRIPE_SANDBOX_METER_EVENT_NAME}"
  "AGENTARXIV_SANDBOX_USAGE_PRICE_USD_PER_SECOND=${AGENTARXIV_SANDBOX_USAGE_PRICE_USD_PER_SECOND}"
  "E2B_API_KEY=${E2B_API_KEY}"
  "E2B_SANDBOX_TEMPLATE=${E2B_SANDBOX_TEMPLATE}"
  "AGENTARXIV_E2B_ALLOW_DEFAULT_TEMPLATE_FALLBACK=${ALLOW_DEFAULT_TEMPLATE_FALLBACK}"
)

if [[ -n "$SANDBOX_DEFAULT_USAGE_BUDGET_CENTS" ]]; then
  ENV_VARS+=(
    "AGENTARXIV_SANDBOX_DEFAULT_USAGE_BUDGET_CENTS=${SANDBOX_DEFAULT_USAGE_BUDGET_CENTS}"
  )
fi

gcloud run deploy "$FRONTEND_SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --image "$FRONTEND_IMAGE" \
  --port 8080 \
  --allow-unauthenticated \
  --add-cloudsql-instances "$CONNECTION_NAME" \
  --startup-probe "initialDelaySeconds=5,timeoutSeconds=5,periodSeconds=10,failureThreshold=12,httpGet.path=/health,httpGet.port=8080" \
  --liveness-probe "timeoutSeconds=5,periodSeconds=30,failureThreshold=3,httpGet.path=/health,httpGet.port=8080" \
  --set-env-vars "$(IFS=,; echo "${ENV_VARS[*]}")"

FRONTEND_URL="$(gcloud run services describe "$FRONTEND_SERVICE" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"
PUBLIC_APP_URL="${REQUESTED_PUBLIC_APP_URL:-$FRONTEND_URL}"

if [[ -z "$REQUESTED_PUBLIC_APP_URL" ]]; then
  gcloud run services update "$FRONTEND_SERVICE" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --update-env-vars "AGENTARXIV_APP_URL=${PUBLIC_APP_URL}" >/dev/null
fi

upsert_env_file ".env.local" "AGENTARXIV_APP_URL" "$PUBLIC_APP_URL"
upsert_env_file ".env.local" "AGENTARXIV_GCP_FRONTEND_SERVICE" "$FRONTEND_SERVICE"
upsert_env_file "apps/frontend/.env.local" "AGENTARXIV_APP_URL" "$PUBLIC_APP_URL"

echo "Frontend deployed to ${FRONTEND_URL}"
echo "Frontend canonical app URL ${PUBLIC_APP_URL}"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "frontend_url=${FRONTEND_URL}"
    echo "frontend_image=${FRONTEND_IMAGE}"
    echo "cloudsql_connection=${CONNECTION_NAME}"
    echo "app_url=${PUBLIC_APP_URL}"
  } >>"$GITHUB_OUTPUT"
fi
