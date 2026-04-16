# GitHub Actions CI/CD

This repository now ships with three GitHub Actions workflows:

- `CI`: validates frontend and backend code on every push and pull request.
- `Deploy Backend to GCP`: builds backend container images, pushes them to Artifact Registry, deploys the Cloud Run services, and smoke-tests the public services after deployment.
- `Deploy Frontend to Vercel`: fully wired Vercel deploy scaffold that stays disabled until you opt in.

## GCP deployment workflow

The backend deploy workflow targets three Cloud Run services:

- ChatKit: `apps/chatkit-server`
- MCP: `apps/mcp`
- Worker: `apps/worker`

It assumes the GCP project and its backing infrastructure already exist. In particular, these resources must already be present:

- Artifact Registry repository
- Cloud SQL instance
- ChatKit attachment GCS bucket
- The Cloud Run runtime identities with the runtime permissions they need

If you still need a one-time bootstrap path for the project resources, use the local script at `scripts/gcp/deploy-backend.sh` and then switch to GitHub Actions for ongoing deploys.

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
- `AGENTARXIV_CHATKIT_GCS_PREFIX` (optional, defaults to `chatkit-attachments`)
- `AGENTARXIV_ALPHAXIV_MCP_URL` (optional)
- `AGENTARXIV_WORKER_ENABLE_RUN_ADVANCEMENT` (optional)
- `AGENTARXIV_E2B_ALLOW_DEFAULT_TEMPLATE_FALLBACK` (optional)
- `OPENAI_CHATKIT_MODEL` (optional)
- `AGENTARXIV_GCP_WORKLOAD_IDENTITY_PROVIDER`
- `AGENTARXIV_GCP_SERVICE_ACCOUNT`

### Required GitHub repository secrets

- `AGENTARXIV_GCP_DB_PASSWORD`
- `AGENTARXIV_CHATKIT_SHARED_SECRET`
- `OPENAI_API_KEY`
- `E2B_API_KEY`
- `E2B_SANDBOX_TEMPLATE`
- `STRIPE_SECRET_KEY`
- `STRIPE_SANDBOX_METER_EVENT_NAME`
- `AGENTARXIV_ALPHAXIV_BEARER_TOKEN` (optional)

### Google Cloud authentication

The workflow expects GitHub OIDC plus Workload Identity Federation. The deploy service account should be able to:

- push images to Artifact Registry
- update the Cloud Run services
- inspect the Cloud SQL instance
- inspect the ChatKit GCS bucket

The workflow does not create projects, databases, billing links, or buckets. It only deploys new revisions against existing infrastructure.

## Vercel deployment workflow

The Vercel workflow is intentionally disabled by default so you can create the first Vercel project deployment later without accidental production pushes.

### Required GitHub repository variables

- `VERCEL_DEPLOY_ENABLED`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

### Required GitHub repository secrets

- `VERCEL_TOKEN`

### How to enable Vercel later

1. Create or import the Vercel project and point it at this monorepo.
2. Configure the Vercel project to use the frontend app in `apps/frontend` as its Root Directory.
3. Add `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, and `VERCEL_TOKEN` to the GitHub repository.
4. Set the repo variable `VERCEL_DEPLOY_ENABLED` to `true`.

Until that flag is enabled, the Vercel workflow exits successfully without deploying anything.
