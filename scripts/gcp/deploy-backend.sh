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

resolve_ngrok_public_url() {
  python - <<'PY'
from urllib.request import urlopen
import json
import sys

try:
    payload = json.load(urlopen("http://127.0.0.1:4040/api/tunnels"))
except Exception:
    sys.exit(1)

for tunnel in payload.get("tunnels", []):
    public_url = tunnel.get("public_url", "")
    if public_url.startswith("https://"):
        print(public_url.rstrip("/"))
        sys.exit(0)

sys.exit(1)
PY
}

ensure_project_exists() {
  if gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1; then
    return
  fi

  if gcloud projects create "$PROJECT_ID" --name="$PROJECT_NAME"; then
    return
  fi

  if [[ "$PROJECT_ID" == "agentarxiv" ]]; then
    PROJECT_ID="agentarxiv-$(date +%Y%m%d)"
    gcloud projects create "$PROJECT_ID" --name="$PROJECT_NAME"
    return
  fi

  echo "Unable to create project $PROJECT_ID" >&2
  exit 1
}

ensure_billing_linked() {
  local billing_enabled
  billing_enabled="$(gcloud beta billing projects describe "$PROJECT_ID" --format='value(billingEnabled)' 2>/dev/null || true)"
  if [[ "$billing_enabled" == "True" ]]; then
    return
  fi

  local billing_account="${AGENTARXIV_GCP_BILLING_ACCOUNT:-}"
  if [[ -z "$billing_account" ]]; then
    billing_account="$(gcloud beta billing accounts list --filter='open=true' --format='value(name)' | head -n 1)"
  fi

  if [[ -z "$billing_account" ]]; then
    echo "No open billing account is available for project $PROJECT_ID" >&2
    exit 1
  fi

  gcloud beta billing projects link "$PROJECT_ID" --billing-account="$billing_account"
}

ensure_service_enabled() {
  local service="$1"
  gcloud services enable "$service" --project "$PROJECT_ID" >/dev/null
}

ensure_artifact_repo() {
  if gcloud artifacts repositories describe "$ARTIFACT_REPO" --project "$PROJECT_ID" --location "$REGION" >/dev/null 2>&1; then
    return
  fi

  gcloud artifacts repositories create "$ARTIFACT_REPO" \
    --project "$PROJECT_ID" \
    --location "$REGION" \
    --repository-format docker \
    --description "AgentArxiv runtime images"
}

ensure_docker_auth() {
  gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet >/dev/null
}

ensure_bucket() {
  if gcloud storage buckets describe "gs://$GCS_BUCKET" --project "$PROJECT_ID" >/dev/null 2>&1; then
    return
  fi

  gcloud storage buckets create "gs://$GCS_BUCKET" \
    --project "$PROJECT_ID" \
    --location "$REGION" \
    --uniform-bucket-level-access
}

ensure_sql_instance() {
  if gcloud sql instances describe "$DB_INSTANCE" --project "$PROJECT_ID" >/dev/null 2>&1; then
    return
  fi

  gcloud sql instances create "$DB_INSTANCE" \
    --project "$PROJECT_ID" \
    --database-version POSTGRES_16 \
    --region "$REGION" \
    --edition ENTERPRISE \
    --tier db-custom-1-3840 \
    --storage-size 20 \
    --storage-type SSD
}

ensure_sql_database() {
  if gcloud sql databases describe "$DB_NAME" --instance "$DB_INSTANCE" --project "$PROJECT_ID" >/dev/null 2>&1; then
    return
  fi

  gcloud sql databases create "$DB_NAME" --instance "$DB_INSTANCE" --project "$PROJECT_ID"
}

ensure_sql_user() {
  if gcloud sql users list --instance "$DB_INSTANCE" --project "$PROJECT_ID" --format='value(name)' | grep -qx "$DB_USER"; then
    gcloud sql users set-password "$DB_USER" \
      --instance "$DB_INSTANCE" \
      --project "$PROJECT_ID" \
      --password "$DB_PASSWORD" >/dev/null
    return
  fi

  gcloud sql users create "$DB_USER" \
    --instance "$DB_INSTANCE" \
    --project "$PROJECT_ID" \
    --password "$DB_PASSWORD"
}

build_image() {
  local dockerfile="$1"
  local image="$2"
  docker buildx build \
    --platform linux/amd64 \
    --provenance=false \
    --push \
    -f "$dockerfile" \
    -t "$image" \
    .
}

load_env_file ".env.local"
load_env_file "apps/frontend/.env.local"

require_cmd gcloud
require_cmd pnpm
require_cmd docker
require_cmd python

PROJECT_NAME="${AGENTARXIV_GCP_PROJECT_NAME:-agentarxiv}"
PROJECT_ID="${AGENTARXIV_GCP_PROJECT_ID:-agentarxiv}"
REGION="${AGENTARXIV_GCP_REGION:-us-central1}"
ARTIFACT_REPO="${AGENTARXIV_GCP_ARTIFACT_REPO:-agentarxiv}"
CHATKIT_SERVICE="${AGENTARXIV_GCP_CHATKIT_SERVICE:-agentarxiv-chatkit}"
MCP_SERVICE="${AGENTARXIV_GCP_MCP_SERVICE:-agentarxiv-mcp}"
WORKER_JOB="${AGENTARXIV_GCP_WORKER_JOB:-agentarxiv-worker}"
WORKER_SERVICE="${AGENTARXIV_GCP_WORKER_SERVICE:-agentarxiv-worker-service}"
DB_INSTANCE="${AGENTARXIV_GCP_DB_INSTANCE:-agentarxiv-pg}"
DB_NAME="${AGENTARXIV_GCP_DB_NAME:-agentarxiv}"
DB_USER="${AGENTARXIV_GCP_DB_USER:-agentarxiv}"
DB_PASSWORD="${AGENTARXIV_GCP_DB_PASSWORD:-}"
GCS_BUCKET="${AGENTARXIV_CHATKIT_GCS_BUCKET:-agentarxiv-chatkit-attachments-us-central1-20260415}"
LOCAL_DB_PROXY_PORT="${AGENTARXIV_LOCAL_DB_PROXY_PORT:-55432}"
PUBLIC_APP_URL="${AGENTARXIV_PUBLIC_APP_URL:-}"
SHARED_SECRET="${AGENTARXIV_CHATKIT_SHARED_SECRET:-}"
WORKER_ENABLE_RUN_ADVANCEMENT="${AGENTARXIV_WORKER_ENABLE_RUN_ADVANCEMENT:-true}"
ALLOW_DEFAULT_TEMPLATE_FALLBACK="${AGENTARXIV_E2B_ALLOW_DEFAULT_TEMPLATE_FALLBACK:-false}"

require_env OPENAI_API_KEY
require_env E2B_API_KEY
require_env E2B_SANDBOX_TEMPLATE
require_env STRIPE_SECRET_KEY
require_env STRIPE_SANDBOX_METER_EVENT_NAME
require_env AGENTARXIV_SANDBOX_USAGE_PRICE_USD_PER_SECOND
require_env DB_PASSWORD
require_env SHARED_SECRET

if [[ -z "$PUBLIC_APP_URL" ]]; then
  if PUBLIC_APP_URL="$(resolve_ngrok_public_url)"; then
    :
  elif [[ "${AGENTARXIV_APP_URL:-}" =~ ^https:// ]]; then
    PUBLIC_APP_URL="${AGENTARXIV_APP_URL%/}"
  else
    echo "Set AGENTARXIV_PUBLIC_APP_URL or start an ngrok tunnel for the local frontend before deploying." >&2
    exit 1
  fi
fi

ensure_project_exists
gcloud config set project "$PROJECT_ID" >/dev/null
gcloud config set run/region "$REGION" >/dev/null
gcloud config set compute/region "$REGION" >/dev/null

ensure_billing_linked
ensure_service_enabled artifactregistry.googleapis.com
ensure_service_enabled cloudbuild.googleapis.com
ensure_service_enabled run.googleapis.com
ensure_service_enabled sqladmin.googleapis.com

ensure_artifact_repo
ensure_docker_auth
ensure_bucket
ensure_sql_instance
ensure_sql_database
ensure_sql_user

CONNECTION_NAME="$(gcloud sql instances describe "$DB_INSTANCE" --project "$PROJECT_ID" --format='value(connectionName)')"
RUN_DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost/${DB_NAME}?host=/cloudsql/${CONNECTION_NAME}&schema=public"
LOCAL_DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${LOCAL_DB_PROXY_PORT}/${DB_NAME}?schema=public"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
IMAGE_BASE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}"
CHATKIT_IMAGE="${IMAGE_BASE}/chatkit:${TIMESTAMP}"
MCP_IMAGE="${IMAGE_BASE}/mcp:${TIMESTAMP}"
WORKER_IMAGE="${IMAGE_BASE}/worker:${TIMESTAMP}"

build_image apps/chatkit-server/Dockerfile "$CHATKIT_IMAGE"
build_image apps/mcp/Dockerfile "$MCP_IMAGE"
build_image apps/worker/Dockerfile "$WORKER_IMAGE"

gcloud run deploy "$CHATKIT_SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --image "$CHATKIT_IMAGE" \
  --port 8080 \
  --allow-unauthenticated \
  --add-cloudsql-instances "$CONNECTION_NAME" \
  --set-env-vars "DATABASE_URL=${RUN_DATABASE_URL},OPENAI_API_KEY=${OPENAI_API_KEY},OPENAI_CHATKIT_MODEL=${OPENAI_CHATKIT_MODEL:-gpt-5.4-mini},AGENTARXIV_CONTEXT_API_BASE_URL=${PUBLIC_APP_URL},AGENTARXIV_CHATKIT_SHARED_SECRET=${SHARED_SECRET},AGENTARXIV_CHATKIT_ATTACHMENT_STORAGE_BACKEND=gcs,AGENTARXIV_CHATKIT_GCS_BUCKET=${GCS_BUCKET},AGENTARXIV_CHATKIT_GCS_PREFIX=${AGENTARXIV_CHATKIT_GCS_PREFIX:-chatkit-attachments},AGENTARXIV_CHATKIT_GCS_PROJECT=${PROJECT_ID}"

CHATKIT_URL="$(gcloud run services describe "$CHATKIT_SERVICE" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"

gcloud run services update "$CHATKIT_SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --update-env-vars "AGENTARXIV_CHATKIT_BACKEND_URL=${CHATKIT_URL},AGENTARXIV_CHATKIT_PUBLIC_BASE_URL=${CHATKIT_URL}" >/dev/null

gcloud run deploy "$MCP_SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --image "$MCP_IMAGE" \
  --port 8080 \
  --allow-unauthenticated \
  --add-cloudsql-instances "$CONNECTION_NAME" \
  --set-env-vars "DATABASE_URL=${RUN_DATABASE_URL},AGENTARXIV_APP_URL=${PUBLIC_APP_URL},AGENTARXIV_CHATKIT_BACKEND_URL=${CHATKIT_URL},AGENTARXIV_CHATKIT_SHARED_SECRET=${SHARED_SECRET},E2B_API_KEY=${E2B_API_KEY},E2B_SANDBOX_TEMPLATE=${E2B_SANDBOX_TEMPLATE},AGENTARXIV_ALPHAXIV_MCP_URL=${AGENTARXIV_ALPHAXIV_MCP_URL:-https://api.alphaxiv.org/mcp/v1},AGENTARXIV_ALPHAXIV_BEARER_TOKEN=${AGENTARXIV_ALPHAXIV_BEARER_TOKEN:-}"

MCP_URL="$(gcloud run services describe "$MCP_SERVICE" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"

gcloud run deploy "$WORKER_SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --image "$WORKER_IMAGE" \
  --port 8080 \
  --min-instances 1 \
  --max-instances 1 \
  --concurrency 1 \
  --no-cpu-throttling \
  --add-cloudsql-instances "$CONNECTION_NAME" \
  --startup-probe "initialDelaySeconds=5,timeoutSeconds=5,periodSeconds=10,failureThreshold=3,httpGet.path=/health,httpGet.port=8080" \
  --liveness-probe "timeoutSeconds=5,periodSeconds=30,failureThreshold=3,httpGet.path=/health,httpGet.port=8080" \
  --set-env-vars "DATABASE_URL=${RUN_DATABASE_URL},STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY},STRIPE_SANDBOX_METER_EVENT_NAME=${STRIPE_SANDBOX_METER_EVENT_NAME},AGENTARXIV_SANDBOX_USAGE_PRICE_USD_PER_SECOND=${AGENTARXIV_SANDBOX_USAGE_PRICE_USD_PER_SECOND},E2B_API_KEY=${E2B_API_KEY},E2B_SANDBOX_TEMPLATE=${E2B_SANDBOX_TEMPLATE},AGENTARXIV_WORKER_MODE=daemon,AGENTARXIV_WORKER_ENABLE_RUN_ADVANCEMENT=${WORKER_ENABLE_RUN_ADVANCEMENT},AGENTARXIV_E2B_ALLOW_DEFAULT_TEMPLATE_FALLBACK=${ALLOW_DEFAULT_TEMPLATE_FALLBACK}"

upsert_env_file ".env.local" "AGENTARXIV_GCP_PROJECT_ID" "$PROJECT_ID"
upsert_env_file ".env.local" "AGENTARXIV_SANDBOX_USAGE_PRICE_USD_PER_SECOND" "$AGENTARXIV_SANDBOX_USAGE_PRICE_USD_PER_SECOND"
upsert_env_file ".env.local" "AGENTARXIV_CHATKIT_BACKEND_URL" "$CHATKIT_URL"
upsert_env_file ".env.local" "AGENTARXIV_APP_URL" "$PUBLIC_APP_URL"
upsert_env_file ".env.local" "AGENTARXIV_CONTEXT_API_BASE_URL" "$PUBLIC_APP_URL"
upsert_env_file ".env.local" "AGENTARXIV_MCP_ENDPOINT" "${MCP_URL}/mcp"
upsert_env_file ".env.local" "AGENTARXIV_GCP_WORKER_SERVICE" "$WORKER_SERVICE"

upsert_env_file "apps/frontend/.env.local" "AGENTARXIV_APP_URL" "$PUBLIC_APP_URL"
upsert_env_file "apps/frontend/.env.local" "AGENTARXIV_CHATKIT_BACKEND_URL" "$CHATKIT_URL"
upsert_env_file "apps/frontend/.env.local" "AGENTARXIV_MCP_ENDPOINT" "${MCP_URL}/mcp"
upsert_env_file "apps/frontend/.env.local" "DATABASE_URL" "$LOCAL_DATABASE_URL"
upsert_env_file ".env.local" "DATABASE_URL" "$LOCAL_DATABASE_URL"

echo "Deployed project: $PROJECT_ID"
echo "Public frontend URL: $PUBLIC_APP_URL"
echo "ChatKit URL: $CHATKIT_URL"
echo "MCP URL: $MCP_URL"
echo "Worker service: $WORKER_SERVICE"
echo "Legacy worker job (not updated or deleted): $WORKER_JOB"
echo "Cloud SQL connection: $CONNECTION_NAME"
echo "Local DATABASE_URL written for Cloud SQL Proxy on port $LOCAL_DB_PROXY_PORT"
