import { afterEach, describe, expect, it } from "vitest";
import {
  WorkerConfigError,
  getSandboxWorkerConfig,
  getWorkerProcessConfig,
} from "./config";

const WORKER_ENV_KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_SANDBOX_METER_EVENT_NAME",
  "E2B_API_KEY",
  "E2B_SANDBOX_TEMPLATE",
  "AGENTARXIV_E2B_ALLOW_DEFAULT_TEMPLATE_FALLBACK",
  "AGENTARXIV_WORKER_MODE",
  "AGENTARXIV_WORKER_ENABLE_RUN_ADVANCEMENT",
  "AGENTARXIV_WORKER_POLL_INTERVAL_MS",
  "AGENTARXIV_WORKER_ERROR_BACKOFF_MS",
  "AGENTARXIV_WORKER_RETRY_DELAY_MS",
  "AGENTARXIV_WORKER_MAX_CYCLE_RETRIES",
] as const;

const originalEnv = Object.fromEntries(
  WORKER_ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof WORKER_ENV_KEYS)[number], string | undefined>;

function restoreWorkerEnv() {
  for (const key of WORKER_ENV_KEYS) {
    const value = originalEnv[key];

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function seedRequiredSandboxEnv() {
  process.env.STRIPE_SECRET_KEY = "sk_test_worker";
  process.env.STRIPE_SANDBOX_METER_EVENT_NAME = "sandbox_runtime_minutes";
  process.env.E2B_API_KEY = "e2b_test_worker";
}

afterEach(() => {
  restoreWorkerEnv();
});

describe("worker config", () => {
  it("requires an explicit sandbox template unless fallback is enabled", () => {
    seedRequiredSandboxEnv();
    delete process.env.E2B_SANDBOX_TEMPLATE;
    delete process.env.AGENTARXIV_E2B_ALLOW_DEFAULT_TEMPLATE_FALLBACK;

    expect(() => getSandboxWorkerConfig()).toThrowError(WorkerConfigError);
  });

  it("allows default template fallback only when explicitly enabled", () => {
    seedRequiredSandboxEnv();
    delete process.env.E2B_SANDBOX_TEMPLATE;
    process.env.AGENTARXIV_E2B_ALLOW_DEFAULT_TEMPLATE_FALLBACK = "true";

    expect(getSandboxWorkerConfig()).toMatchObject({
      e2bSandboxTemplate: undefined,
      allowDefaultTemplateFallback: true,
    });
  });

  it("parses daemon mode and polling settings from the environment", () => {
    process.env.AGENTARXIV_WORKER_MODE = "daemon";
    process.env.AGENTARXIV_WORKER_ENABLE_RUN_ADVANCEMENT = "true";
    process.env.AGENTARXIV_WORKER_POLL_INTERVAL_MS = "2500";
    process.env.AGENTARXIV_WORKER_ERROR_BACKOFF_MS = "7000";
    process.env.AGENTARXIV_WORKER_RETRY_DELAY_MS = "250";
    process.env.AGENTARXIV_WORKER_MAX_CYCLE_RETRIES = "5";

    expect(getWorkerProcessConfig()).toMatchObject({
      mode: "daemon",
      enableRunAdvancement: true,
      pollIntervalMs: 2500,
      errorBackoffMs: 7000,
      retryDelayMs: 250,
      maxCycleRetries: 5,
    });
  });
});
