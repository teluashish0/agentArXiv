import Stripe from "stripe";

const STRIPE_SANDBOX_API_VERSION = "2026-02-25.clover";
export const SANDBOX_SESSION_IDLE_TTL_MINUTES = 15;
export const SANDBOX_SESSION_MAX_AGE_MINUTES = 120;
const DEFAULT_WORKER_POLL_INTERVAL_MS = 5_000;
const DEFAULT_WORKER_ERROR_BACKOFF_MS = 10_000;
const DEFAULT_WORKER_RETRY_DELAY_MS = 500;
const DEFAULT_WORKER_MAX_CYCLE_RETRIES = 3;

export class WorkerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerConfigError";
  }
}

function requireEnv(name: string, context: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new WorkerConfigError(`${name} is required for ${context}`);
  }

  return value;
}

function parseBooleanEnv(name: string, fallback: boolean) {
  const value = process.env[name]?.trim().toLowerCase();

  if (!value) {
    return fallback;
  }

  if (["1", "true", "yes", "on"].includes(value)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(value)) {
    return false;
  }

  throw new WorkerConfigError(`${name} must be a boolean value`);
}

function parsePositiveIntegerEnv(name: string, fallback: number) {
  const value = process.env[name]?.trim();

  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new WorkerConfigError(`${name} must be a positive integer`);
  }

  return parsed;
}

export type WorkerMode = "once" | "daemon";

function parseWorkerModeEnv() {
  const value = process.env.AGENTARXIV_WORKER_MODE?.trim().toLowerCase();

  if (!value) {
    return "once" satisfies WorkerMode;
  }

  if (value === "once" || value === "daemon") {
    return value;
  }

  throw new WorkerConfigError(
    "AGENTARXIV_WORKER_MODE must be either \"once\" or \"daemon\"",
  );
}

export function getWorkerProcessConfig() {
  return {
    mode: parseWorkerModeEnv(),
    enableRunAdvancement: parseBooleanEnv(
      "AGENTARXIV_WORKER_ENABLE_RUN_ADVANCEMENT",
      false,
    ),
    pollIntervalMs: parsePositiveIntegerEnv(
      "AGENTARXIV_WORKER_POLL_INTERVAL_MS",
      DEFAULT_WORKER_POLL_INTERVAL_MS,
    ),
    errorBackoffMs: parsePositiveIntegerEnv(
      "AGENTARXIV_WORKER_ERROR_BACKOFF_MS",
      DEFAULT_WORKER_ERROR_BACKOFF_MS,
    ),
    retryDelayMs: parsePositiveIntegerEnv(
      "AGENTARXIV_WORKER_RETRY_DELAY_MS",
      DEFAULT_WORKER_RETRY_DELAY_MS,
    ),
    maxCycleRetries: parsePositiveIntegerEnv(
      "AGENTARXIV_WORKER_MAX_CYCLE_RETRIES",
      DEFAULT_WORKER_MAX_CYCLE_RETRIES,
    ),
  };
}

export function getSandboxWorkerConfig() {
  const e2bSandboxTemplate = process.env.E2B_SANDBOX_TEMPLATE?.trim() || undefined;
  const allowDefaultTemplateFallback = parseBooleanEnv(
    "AGENTARXIV_E2B_ALLOW_DEFAULT_TEMPLATE_FALLBACK",
    false,
  );

  if (!e2bSandboxTemplate && !allowDefaultTemplateFallback) {
    throw new WorkerConfigError(
      "E2B_SANDBOX_TEMPLATE is required for sandbox worker execution unless AGENTARXIV_E2B_ALLOW_DEFAULT_TEMPLATE_FALLBACK=true.",
    );
  }

  return {
    stripeApiVersion: STRIPE_SANDBOX_API_VERSION,
    stripeSecretKey: requireEnv("STRIPE_SECRET_KEY", "sandbox worker execution"),
    stripeSandboxMeterEventName: requireEnv(
      "STRIPE_SANDBOX_METER_EVENT_NAME",
      "sandbox worker execution",
    ),
    e2bApiKey: requireEnv("E2B_API_KEY", "sandbox worker execution"),
    e2bSandboxTemplate,
    allowDefaultTemplateFallback,
    sessionIdleTtlMinutes: SANDBOX_SESSION_IDLE_TTL_MINUTES,
    sessionMaxAgeMinutes: SANDBOX_SESSION_MAX_AGE_MINUTES,
  };
}

let stripeClient: Stripe | undefined;

export function getStripeClient() {
  if (!stripeClient) {
    const config = getSandboxWorkerConfig();

    stripeClient = new Stripe(config.stripeSecretKey, {
      apiVersion: config.stripeApiVersion as never,
    });
  }

  return stripeClient;
}
