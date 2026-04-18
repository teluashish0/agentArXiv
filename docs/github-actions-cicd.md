# GitHub Actions CI/CD

This repository ships with three GitHub Actions workflows:

- `CI`: validates frontend and backend code on every push and pull request.
- `Deploy Backend to GCP`: builds backend container images, pushes them to Artifact Registry, deploys the Cloud Run services, and smoke-tests the deployed services.
- `Deploy Frontend to Cloud Run`: validates the frontend, builds the frontend image, pushes it to Artifact Registry, deploys the frontend Cloud Run service, and smoke-tests the public site after deployment.

## Shared deployment assumptions

The deployment workflows assume the GCP project and its backing infrastructure already exist. In particular, these resources must already be present:

- Artifact Registry repository
- Cloud SQL instance
- Cloud Run services
- Runtime identities with the permissions the services need
- ChatKit attachment GCS bucket for the backend workflow

If you still need a one-time bootstrap path for the project resources, use the local scripts in `scripts/gcp/` and then switch to GitHub Actions for ongoing deploys.

Both deployment workflows expect GitHub OIDC plus Workload Identity Federation. The deploy service account must be able to:

- push images to Artifact Registry
- update the Cloud Run services
- inspect the Cloud SQL instance
- inspect the ChatKit GCS bucket for backend deploys

The workflows do not create projects, databases, billing links, or buckets. They only deploy new revisions against existing infrastructure.

## Backend workflow

The backend deploy workflow targets three Cloud Run services:

- ChatKit: `apps/chatkit-server`
- MCP: `apps/mcp`
- Worker: `apps/worker`

### Required GitHub repository variables

- `AGENTARXIV_GCP_PROJECT_ID`
- `AGENTARXIV_GCP_REGION`
- `AGENTARXIV_GCP_ARTIFACT_REPO`
- `AGENTARXIV_GCP_CHATKIT_SERVICE`
- `AGENTARXIV_GCP_MCP_SERVICE`
- `AGENTARXIV_GCP_WORKER_SERVICE`
- `AGENTARXIV_GCP_DB_INSTANCE`
- `AGENTARXIV_GCP_DB_NAME`
- `AGENTARXIV_GCP_DB_USER`
- `AGENTARXIV_APP_URL`
- `AGENTARXIV_CHATKIT_GCS_BUCKET`
- `AGENTARXIV_GCP_WORKLOAD_IDENTITY_PROVIDER`
- `AGENTARXIV_GCP_SERVICE_ACCOUNT`
- `AGENTARXIV_SANDBOX_USAGE_PRICE_USD_PER_SECOND`
- `AGENTARXIV_CHATKIT_GCS_PREFIX` (optional, defaults to `chatkit-attachments`)
- `AGENTARXIV_ALPHAXIV_MCP_URL` (optional)
- `AGENTARXIV_WORKER_ENABLE_RUN_ADVANCEMENT` (optional)
- `AGENTARXIV_E2B_ALLOW_DEFAULT_TEMPLATE_FALLBACK` (optional)
- `OPENAI_CHATKIT_MODEL` (optional)

### Required GitHub repository secrets

- `AGENTARXIV_GCP_DB_PASSWORD`
- `AGENTARXIV_CHATKIT_SHARED_SECRET`
- `OPENAI_API_KEY`
- `E2B_API_KEY`
- `E2B_SANDBOX_TEMPLATE`
- `STRIPE_SECRET_KEY`
- `STRIPE_SANDBOX_METER_EVENT_NAME`
- `AGENTARXIV_ALPHAXIV_BEARER_TOKEN` (optional)

## Frontend workflow

The frontend deploy workflow targets the Cloud Run service for `apps/frontend`.

### Required GitHub repository variables

- `AGENTARXIV_GCP_PROJECT_ID`
- `AGENTARXIV_GCP_REGION`
- `AGENTARXIV_GCP_ARTIFACT_REPO`
- `AGENTARXIV_GCP_FRONTEND_SERVICE`
- `AGENTARXIV_GCP_DB_INSTANCE`
- `AGENTARXIV_GCP_DB_NAME`
- `AGENTARXIV_GCP_DB_USER`
- `AGENTARXIV_GCP_WORKLOAD_IDENTITY_PROVIDER`
- `AGENTARXIV_GCP_SERVICE_ACCOUNT`
- `AGENTARXIV_APP_URL`
- `AGENTARXIV_CHATKIT_BACKEND_URL`
- `AGENTARXIV_MCP_ENDPOINT`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `STRIPE_SANDBOX_PRICE_ID`
- `STRIPE_SANDBOX_PRODUCT_ID`
- `STRIPE_SANDBOX_PLAN_NAME`
- `STRIPE_SANDBOX_PLAN_LOOKUP_KEY`
- `STRIPE_SANDBOX_USAGE_PRICE_ID`
- `STRIPE_SANDBOX_METER_EVENT_NAME`
- `AGENTARXIV_SANDBOX_USAGE_PRICE_USD_PER_SECOND`
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL` (optional, defaults to `/sign-in`)
- `NEXT_PUBLIC_AGENTARXIV_ENABLE_GOOGLE_SIGN_IN` (optional)
- `AGENTARXIV_SANDBOX_DEFAULT_USAGE_BUDGET_CENTS` (optional)
- `AGENTARXIV_E2B_ALLOW_DEFAULT_TEMPLATE_FALLBACK` (optional)

### Required GitHub repository secrets

- `AGENTARXIV_GCP_DB_PASSWORD`
- `CLERK_SECRET_KEY`
- `AGENTARXIV_CHATKIT_SHARED_SECRET`
- `OPENAI_API_KEY`
- `E2B_API_KEY`
- `E2B_SANDBOX_TEMPLATE`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
