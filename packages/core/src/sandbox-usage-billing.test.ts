import { describe, expect, it } from "vitest";
import {
  calculateSandboxUsageCostMicrocents,
  formatStripeUnitAmountDecimalFromUsdPerSecond,
  SANDBOX_SESSION_USAGE_LAST_METERED_AT_KEY,
  summarizeAccountSandboxUsage,
} from "./sandbox-usage-billing";

describe("sandbox usage billing", () => {
  it("calculates execution costs from the configured per-second rate", () => {
    expect(
      calculateSandboxUsageCostMicrocents({
        runtimeSeconds: 600,
        usagePriceUsdPerSecond: 0.00003025,
      }),
    ).toBe(1_815_000);
  });

  it("summarizes reported and reserved spend for the active billing cycle", () => {
    const summary = summarizeAccountSandboxUsage({
      ownerClerkUserId: "user_123",
      asOf: "2026-04-12T12:05:00.000Z",
      billingStatus: {
        currentPeriodStart: "2026-04-01T00:00:00.000Z",
        currentPeriodEnd: "2026-05-01T00:00:00.000Z",
        sandboxUsageBudgetCents: 500,
      },
      sessions: [
        {
          id: "session_active",
          ownerClerkUserId: "user_123",
          providerSessionId: "e2b_session_active",
          status: "ready",
          idleTtlMinutes: 15,
          maxAgeMinutes: 120,
          metadata: {
            [SANDBOX_SESSION_USAGE_LAST_METERED_AT_KEY]:
              "2026-04-12T12:00:00.000Z",
          },
          startedAt: "2026-04-12T12:00:00.000Z",
          lastActiveAt: "2026-04-12T12:00:00.000Z",
          expiresAt: "2026-04-12T12:20:00.000Z",
        },
      ],
      usageLedger: [
        {
          executionId: "exec_reported",
          ownerClerkUserId: "user_123",
          createdAt: "2026-04-10T12:00:00.000Z",
          runtimeSeconds: 600,
          estimatedCostMicrocents: 1_815_000,
        },
      ],
      executions: [
        {
          id: "exec_reported",
          sessionId: "session_reported",
          ownerClerkUserId: "user_123",
          createdAt: "2026-04-10T12:00:00.000Z",
          status: "completed",
          command: {
            command: "python reported.py",
            timeoutSeconds: 900,
            env: {},
          },
        },
        {
          id: "exec_active",
          sessionId: "session_active",
          ownerClerkUserId: "user_123",
          createdAt: "2026-04-12T12:00:00.000Z",
          status: "running",
          command: {
            command: "python active.py",
            timeoutSeconds: 300,
            env: {},
          },
        },
      ],
      usagePriceUsdPerSecond: 0.00003025,
    });

    expect(summary.reportedUsageMicrocents).toBe(2_722_500);
    expect(summary.reservedUsageMicrocents).toBe(2_722_500);
    expect(summary.projectedUsageMicrocents).toBe(5_445_000);
    expect(summary.remainingBudgetMicrocents).toBe(494_555_000);
  });

  it("formats Stripe metered unit amounts in cents per second", () => {
    expect(formatStripeUnitAmountDecimalFromUsdPerSecond(0.00003025)).toBe(
      "0.003025",
    );
  });
});
