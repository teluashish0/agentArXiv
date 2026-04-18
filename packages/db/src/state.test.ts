import { describe, expect, it, vi } from "vitest";
import { loadStateFromPrisma, type PrismaStateClient } from "./state";

function createMissingColumnError(modelName: string, column: string) {
  return {
    code: "P2022",
    meta: {
      modelName,
      column,
    },
  };
}

function createPrismaStub(
  overrides: Record<string, { findMany: ReturnType<typeof vi.fn> }>,
) {
  return new Proxy(overrides, {
    get(target, property) {
      return target[property as string] ?? { findMany: vi.fn().mockResolvedValue([]) };
    },
  }) as unknown as PrismaStateClient;
}

describe("loadStateFromPrisma", () => {
  it("falls back when AccountBillingStatus is missing currentPeriodStart", async () => {
    const accountBillingStatusFindMany = vi
      .fn()
      .mockRejectedValueOnce(
        createMissingColumnError(
          "AccountBillingStatus",
          "AccountBillingStatus.currentPeriodStart",
        ),
      )
      .mockResolvedValueOnce([
        {
          id: "billing-1",
          ownerClerkUserId: "user_123",
          stripeCustomerId: "cus_123",
          stripeSubscriptionId: "sub_123",
          stripePriceId: "price_123",
          stripeProductId: "prod_123",
          billingState: "active",
          sandboxEligibility: "verified",
          planName: "Verified",
          planLookupKey: "verified",
          planMetadata: { tier: "verified" },
          currentPeriodEnd: new Date("2026-05-01T00:00:00.000Z"),
          sandboxUsageBudgetCents: 5000,
          cancelAt: null,
          cancelAtPeriodEnd: false,
          canceledAt: null,
          delinquentAt: null,
          lastWebhookAt: new Date("2026-04-18T00:00:00.000Z"),
          createdAt: new Date("2026-04-01T00:00:00.000Z"),
          updatedAt: new Date("2026-04-18T00:00:00.000Z"),
        },
      ]);
    const prisma = createPrismaStub({
      accountBillingStatus: { findMany: accountBillingStatusFindMany },
    });

    const state = await loadStateFromPrisma(prisma);

    expect(state.accountBillingStatuses).toEqual([
      expect.objectContaining({
        id: "billing-1",
        ownerClerkUserId: "user_123",
        currentPeriodStart: undefined,
        currentPeriodEnd: "2026-05-01T00:00:00.000Z",
      }),
    ]);
    expect(accountBillingStatusFindMany).toHaveBeenCalledTimes(2);
  });

  it("falls back when SandboxUsageLedger is missing estimatedCostMicrocents", async () => {
    const sandboxUsageLedgerFindMany = vi
      .fn()
      .mockRejectedValueOnce(
        createMissingColumnError(
          "SandboxUsageLedger",
          "SandboxUsageLedger.estimatedCostMicrocents",
        ),
      )
      .mockResolvedValueOnce([
        {
          id: "ledger-1",
          executionId: "exec-1",
          ownerClerkUserId: "user_123",
          stripeCustomerId: "cus_123",
          stripeMeterEventName: "sandbox_runtime_seconds",
          stripeMeterEventIdentifier: "meter-1",
          meterValue: 12,
          runtimeSeconds: 12,
          sandboxCpuCount: 2,
          sandboxMemoryMb: 1024,
          status: "reported",
          createdAt: new Date("2026-04-18T00:00:00.000Z"),
          reportedAt: new Date("2026-04-18T00:05:00.000Z"),
        },
      ]);
    const prisma = createPrismaStub({
      sandboxUsageLedger: { findMany: sandboxUsageLedgerFindMany },
    });

    const state = await loadStateFromPrisma(prisma);

    expect(state.sandboxUsageLedger).toEqual([
      expect.objectContaining({
        id: "ledger-1",
        executionId: "exec-1",
        estimatedCostMicrocents: undefined,
        reportedAt: "2026-04-18T00:05:00.000Z",
      }),
    ]);
    expect(sandboxUsageLedgerFindMany).toHaveBeenCalledTimes(2);
  });
});
