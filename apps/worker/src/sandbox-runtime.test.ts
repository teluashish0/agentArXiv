import { afterEach, describe, expect, it, vi } from "vitest";

const { sandboxCreateMock, sandboxConnectMock } = vi.hoisted(() => ({
  sandboxCreateMock: vi.fn(),
  sandboxConnectMock: vi.fn(),
}));

vi.mock("e2b", () => ({
  Sandbox: {
    create: sandboxCreateMock,
    connect: sandboxConnectMock,
  },
  CommandExitError: class CommandExitError extends Error {
    result: unknown;

    constructor(result: unknown) {
      super("Command failed");
      this.result = result;
    }
  },
}));

import {
  MAX_E2B_PROVIDER_TIMEOUT_MS,
  clampE2BProviderTimeoutMs,
  createE2BSandboxManager,
} from "./sandbox-runtime";
import { SANDBOX_SUPPORT_ERROR_MESSAGE } from "./config";

const WORKER_ENV_KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_SANDBOX_METER_EVENT_NAME",
  "E2B_API_KEY",
  "E2B_SANDBOX_TEMPLATE",
  "AGENTARXIV_SANDBOX_USAGE_PRICE_USD_PER_SECOND",
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
  process.env.STRIPE_SANDBOX_METER_EVENT_NAME = "sandbox_runtime_seconds";
  process.env.E2B_API_KEY = "e2b_test_worker";
  process.env.AGENTARXIV_SANDBOX_USAGE_PRICE_USD_PER_SECOND = "0.00003025";
}

afterEach(() => {
  restoreWorkerEnv();
  sandboxCreateMock.mockReset();
  sandboxConnectMock.mockReset();
});

describe("sandbox runtime", () => {
  it("clamps provider timeouts to the current E2B one-hour limit", () => {
    expect(clampE2BProviderTimeoutMs(30 * 60_000)).toBe(30 * 60_000);
    expect(clampE2BProviderTimeoutMs(120 * 60_000)).toBe(
      MAX_E2B_PROVIDER_TIMEOUT_MS,
    );
  });

  it("surfaces the generic support error when the configured template is missing", async () => {
    seedRequiredSandboxEnv();
    process.env.E2B_SANDBOX_TEMPLATE = "missing-template";

    sandboxCreateMock.mockRejectedValueOnce(
      new Error("404: template 'missing-template' not found"),
    );

    const manager = createE2BSandboxManager();

    await expect(
      manager.createSession({
        workspaceId: "workspace_diabetes",
        agentId: "agent_secondary",
        sessionId: "session_diabetes",
        ownerClerkUserId: "user_secondary",
      }),
    ).rejects.toThrow(SANDBOX_SUPPORT_ERROR_MESSAGE);
    expect(sandboxCreateMock).toHaveBeenCalledTimes(1);
    expect(sandboxCreateMock.mock.calls[0]).toHaveLength(2);
    expect(sandboxCreateMock.mock.calls[0]?.[0]).toBe("missing-template");
    expect(sandboxCreateMock.mock.calls[0]?.[1]).toMatchObject({
      apiKey: "e2b_test_worker",
      timeoutMs: MAX_E2B_PROVIDER_TIMEOUT_MS,
      metadata: {
        workspaceId: "workspace_diabetes",
        agentId: "agent_secondary",
        sessionId: "session_diabetes",
        ownerClerkUserId: "user_secondary",
      },
    });
  });
});
