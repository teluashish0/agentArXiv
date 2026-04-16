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

PROJECT_ID="${AGENTARXIV_GCP_PROJECT_ID:-}"
REGION="${AGENTARXIV_GCP_REGION:-us-central1}"
CHATKIT_SERVICE="${AGENTARXIV_GCP_CHATKIT_SERVICE:-agentarxiv-chatkit}"
MCP_SERVICE="${AGENTARXIV_GCP_MCP_SERVICE:-agentarxiv-mcp}"
WORKER_SERVICE="${AGENTARXIV_GCP_WORKER_SERVICE:-agentarxiv-worker-service}"
DB_INSTANCE="${AGENTARXIV_GCP_DB_INSTANCE:-}"
DB_NAME="${AGENTARXIV_GCP_DB_NAME:-agentarxiv}"
DB_USER="${AGENTARXIV_GCP_DB_USER:-agentarxiv}"
DB_PASSWORD="${AGENTARXIV_GCP_DB_PASSWORD:-}"
PUBLIC_APP_URL="${AGENTARXIV_APP_URL:-}"
CHATKIT_SHARED_SECRET="${AGENTARXIV_CHATKIT_SHARED_SECRET:-}"
CHATKIT_GCS_BUCKET="${AGENTARXIV_CHATKIT_GCS_BUCKET:-}"
CHATKIT_GCS_PREFIX="${AGENTARXIV_CHATKIT_GCS_PREFIX:-chatkit-attachments}"
OPENAI_CHATKIT_MODEL="${OPENAI_CHATKIT_MODEL:-gpt-5.4-mini}"
ALPHAXIV_MCP_URL="${AGENTARXIV_ALPHAXIV_MCP_URL:-https://api.alphaxiv.org/mcp/v1}"
WORKER_ENABLE_RUN_ADVANCEMENT="${AGENTARXIV_WORKER_ENABLE_RUN_ADVANCEMENT:-true}"
ALLOW_DEFAULT_TEMPLATE_FALLBACK="${AGENTARXIV_E2B_ALLOW_DEFAULT_TEMPLATE_FALLBACK:-false}"

require_cmd gcloud

require_env AGENTARXIV_GCP_PROJECT_ID
require_env AGENTARXIV_GCP_DB_INSTANCE
require_env AGENTARXIV_GCP_DB_PASSWORD
require_env AGENTARXIV_APP_URL
require_env AGENTARXIV_CHATKIT_SHARED_SECRET
require_env AGENTARXIV_CHATKIT_GCS_BUCKET
require_env AGENTARXIV_GCP_CHATKIT_IMAGE
require_env AGENTARXIV_GCP_MCP_IMAGE
require_env AGENTARXIV_GCP_WORKER_IMAGE
require_env OPENAI_API_KEY
require_env E2B_API_KEY
require_env E2B_SANDBOX_TEMPLATE
require_env STRIPE_SECRET_KEY
require_env STRIPE_SANDBOX_METER_EVENT_NAME

CONNECTION_NAME="$(gcloud sql instances describe "$DB_INSTANCE" --project "$PROJECT_ID" --format='value(connectionName)')"
RUN_DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost/${DB_NAME}?host=/cloudsql/${CONNECTION_NAME}&schema=public"

echo "Deploying ChatKit to Cloud Run service ${CHATKIT_SERVICE} in ${REGION}."
gcloud run deploy "$CHATKIT_SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --image "${AGENTARXIV_GCP_CHATKIT_IMAGE}" \
  --port 8080 \
  --allow-unauthenticated \
  --add-cloudsql-instances "$CONNECTION_NAME" \
  --set-env-vars "DATABASE_URL=${RUN_DATABASE_URL},OPENAI_API_KEY=${OPENAI_API_KEY},OPENAI_CHATKIT_MODEL=${OPENAI_CHATKIT_MODEL},AGENTARXIV_CONTEXT_API_BASE_URL=${PUBLIC_APP_URL},AGENTARXIV_CHATKIT_SHARED_SECRET=${CHATKIT_SHARED_SECRET},AGENTARXIV_CHATKIT_ATTACHMENT_STORAGE_BACKEND=gcs,AGENTARXIV_CHATKIT_GCS_BUCKET=${CHATKIT_GCS_BUCKET},AGENTARXIV_CHATKIT_GCS_PREFIX=${CHATKIT_GCS_PREFIX},AGENTARXIV_CHATKIT_GCS_PROJECT=${PROJECT_ID}"

CHATKIT_URL="$(gcloud run services describe "$CHATKIT_SERVICE" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"

gcloud run services update "$CHATKIT_SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --update-env-vars "AGENTARXIV_CHATKIT_BACKEND_URL=${CHATKIT_URL},AGENTARXIV_CHATKIT_PUBLIC_BASE_URL=${CHATKIT_URL}" >/dev/null

echo "Deploying MCP to Cloud Run service ${MCP_SERVICE} in ${REGION}."
gcloud run deploy "$MCP_SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --image "${AGENTARXIV_GCP_MCP_IMAGE}" \
  --port 8080 \
  --allow-unauthenticated \
  --add-cloudsql-instances "$CONNECTION_NAME" \
  --set-env-vars "DATABASE_URL=${RUN_DATABASE_URL},AGENTARXIV_APP_URL=${PUBLIC_APP_URL},AGENTARXIV_CHATKIT_BACKEND_URL=${CHATKIT_URL},AGENTARXIV_CHATKIT_SHARED_SECRET=${CHATKIT_SHARED_SECRET},E2B_API_KEY=${E2B_API_KEY},E2B_SANDBOX_TEMPLATE=${E2B_SANDBOX_TEMPLATE},AGENTARXIV_ALPHAXIV_MCP_URL=${ALPHAXIV_MCP_URL},AGENTARXIV_ALPHAXIV_BEARER_TOKEN=${AGENTARXIV_ALPHAXIV_BEARER_TOKEN:-}"

MCP_URL="$(gcloud run services describe "$MCP_SERVICE" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"

echo "Deploying worker to Cloud Run service ${WORKER_SERVICE} in ${REGION}."
gcloud run deploy "$WORKER_SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --image "${AGENTARXIV_GCP_WORKER_IMAGE}" \
  --port 8080 \
  --min-instances 1 \
  --max-instances 1 \
  --concurrency 1 \
  --no-cpu-throttling \
  --add-cloudsql-instances "$CONNECTION_NAME" \
  --startup-probe "initialDelaySeconds=5,timeoutSeconds=5,periodSeconds=10,failureThreshold=3,httpGet.path=/health,httpGet.port=8080" \
  --liveness-probe "timeoutSeconds=5,periodSeconds=30,failureThreshold=3,httpGet.path=/health,httpGet.port=8080" \
  --set-env-vars "DATABASE_URL=${RUN_DATABASE_URL},STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY},STRIPE_SANDBOX_METER_EVENT_NAME=${STRIPE_SANDBOX_METER_EVENT_NAME},E2B_API_KEY=${E2B_API_KEY},E2B_SANDBOX_TEMPLATE=${E2B_SANDBOX_TEMPLATE},AGENTARXIV_WORKER_MODE=daemon,AGENTARXIV_WORKER_ENABLE_RUN_ADVANCEMENT=${WORKER_ENABLE_RUN_ADVANCEMENT},AGENTARXIV_E2B_ALLOW_DEFAULT_TEMPLATE_FALLBACK=${ALLOW_DEFAULT_TEMPLATE_FALLBACK}"

WORKER_URL="$(gcloud run services describe "$WORKER_SERVICE" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"

echo "ChatKit deployed to ${CHATKIT_URL}"
echo "MCP deployed to ${MCP_URL}"
echo "Worker deployed to ${WORKER_URL}"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "chatkit_url=${CHATKIT_URL}"
    echo "mcp_url=${MCP_URL}"
    echo "worker_url=${WORKER_URL}"
    echo "cloudsql_connection=${CONNECTION_NAME}"
  } >>"$GITHUB_OUTPUT"
fi
