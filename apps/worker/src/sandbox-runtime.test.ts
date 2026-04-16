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

const WORKER_ENV_KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_SANDBOX_METER_EVENT_NAME",
  "E2B_API_KEY",
  "E2B_SANDBOX_TEMPLATE",
  "AGENTARXIV_E2B_ALLOW_DEFAULT_TEMPLATE_FALLBACK",
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

  it("falls back to the default template when the configured template is missing", async () => {
    seedRequiredSandboxEnv();
    process.env.E2B_SANDBOX_TEMPLATE = "missing-template";
    process.env.AGENTARXIV_E2B_ALLOW_DEFAULT_TEMPLATE_FALLBACK = "true";

    sandboxCreateMock
      .mockRejectedValueOnce(new Error("404: template 'missing-template' not found"))
      .mockResolvedValueOnce({ sandboxId: "sbx_default" });

    const manager = createE2BSandboxManager();
    const session = await manager.createSession({
      workspaceId: "workspace_diabetes",
      agentId: "agent_secondary",
      sessionId: "session_diabetes",
      ownerClerkUserId: "user_secondary",
    });

    expect(session).toEqual({ sandboxId: "sbx_default" });
    expect(sandboxCreateMock).toHaveBeenCalledTimes(2);
    expect(sandboxCreateMock.mock.calls[0]?.[0]).toBe("missing-template");
    expect(sandboxCreateMock.mock.calls[1]).toHaveLength(1);
    expect(sandboxCreateMock.mock.calls[1]?.[0]).toMatchObject({
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
