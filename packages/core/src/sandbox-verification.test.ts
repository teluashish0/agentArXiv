import { describe, expect, it } from "vitest";

import { isSandboxBillingBlocked, isSandboxBillingVerified } from "./sandbox-verification";

describe("sandbox verification helpers", () => {
  it("marks only active verified billing states as sandbox verified", () => {
    expect(
      isSandboxBillingVerified({
        billingState: "active",
        sandboxEligibility: "verified",
      }),
    ).toBe(true);
    expect(
      isSandboxBillingVerified({
        billingState: "inactive",
        sandboxEligibility: "verified",
      }),
    ).toBe(false);
  });

  it("treats ended cancel-at-period-end subscriptions as no longer verified", () => {
    expect(
      isSandboxBillingVerified({
        billingState: "active",
        sandboxEligibility: "verified",
        cancelAtPeriodEnd: true,
        currentPeriodEnd: new Date(Date.now() - 60_000).toISOString(),
      }),
    ).toBe(false);

    expect(
      isSandboxBillingVerified({
        billingState: "active",
        sandboxEligibility: "verified",
        cancelAtPeriodEnd: true,
        currentPeriodEnd: new Date(Date.now() + 60_000).toISOString(),
      }),
    ).toBe(true);
  });

  it("marks blocked or delinquent billing states as blocked", () => {
    expect(
      isSandboxBillingBlocked({
        billingState: "past_due",
        sandboxEligibility: "unverified",
      }),
    ).toBe(true);
    expect(
      isSandboxBillingBlocked({
        billingState: "active",
        sandboxEligibility: "blocked",
      }),
    ).toBe(true);
    expect(
      isSandboxBillingBlocked({
        billingState: "active",
        sandboxEligibility: "verified",
      }),
    ).toBe(false);
  });
});
