import { NextResponse } from "next/server";
import {
  summarizeAccountSandboxUsage,
  type AccountBillingStatus,
} from "@agentarxiv/core";
import { requireSignedInClerkUserId } from "@/lib/account-auth";
import { repository } from "@/lib/repository";
import { toRouteErrorResponse } from "@/lib/route-errors";
import {
  syncSandboxBillingFromCheckoutSessionId,
  syncSandboxBillingFromSubscription,
} from "@/lib/sandbox-billing";
import {
  getSandboxBillingAvailability,
  getSandboxBillingConfig,
} from "@/lib/sandbox-config";

function serializeSandboxSubscriptionStatus(
  billingStatus: AccountBillingStatus | null,
  usageStatus: {
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
    reportedUsageMicrocents: number;
    reservedUsageMicrocents: number;
    projectedUsageMicrocents: number;
    budgetLimitCents?: number;
    remainingBudgetMicrocents?: number;
    usingDefaultBudget: boolean;
    rateMicrocentsPerHour: number;
  } | null,
) {
  if (!billingStatus) {
    return {
      subscriptionStatus: null,
      canManageSubscription: false,
      usageStatus,
    };
  }

  return {
    subscriptionStatus: {
      billingState: billingStatus.billingState,
      sandboxEligibility: billingStatus.sandboxEligibility,
      planName: billingStatus.planName,
      currentPeriodStart: billingStatus.currentPeriodStart,
      currentPeriodEnd: billingStatus.currentPeriodEnd,
      sandboxUsageBudgetCents: billingStatus.sandboxUsageBudgetCents,
      cancelAt: billingStatus.cancelAt,
      cancelAtPeriodEnd: billingStatus.cancelAtPeriodEnd,
      canceledAt: billingStatus.canceledAt,
      delinquentAt: billingStatus.delinquentAt,
    },
    canManageSubscription: Boolean(billingStatus.stripeCustomerId),
    usageStatus,
  };
}

function parseSandboxUsageBudgetCents(body: Record<string, unknown>) {
  const value = body.sandboxUsageBudgetCents;

  if (value === null) {
    return null;
  }

  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new Error("sandboxUsageBudgetCents must be a positive integer or null");
  }

  return value as number;
}

async function buildSandboxUsageStatus(
  ownerClerkUserId: string,
  billingStatus: AccountBillingStatus | null,
) {
  const billingAvailability = getSandboxBillingAvailability();

  if (!billingAvailability.configured) {
    return null;
  }

  const config = getSandboxBillingConfig();
  const [sessions, usageLedger, executions] = await Promise.all([
    repository.listSandboxSessions({
      ownerClerkUserId,
    }),
    repository.listSandboxUsageLedger({
      ownerClerkUserId,
    }),
    repository.listSandboxExecutions({
      ownerClerkUserId,
    }),
  ]);

  return summarizeAccountSandboxUsage({
    ownerClerkUserId,
    billingStatus: billingStatus ?? undefined,
    sessions,
    usageLedger,
    executions,
    usagePriceUsdPerSecond: config.sandboxUsagePriceUsdPerSecond,
    defaultBudgetCents: config.sandboxDefaultUsageBudgetCents,
  });
}

async function resolveBillingStatus(
  ownerClerkUserId: string,
  checkoutSessionId?: string | null,
) {
  const billingAvailability = getSandboxBillingAvailability();

  if (checkoutSessionId) {
    return syncSandboxBillingFromCheckoutSessionId({
      checkoutSessionId,
      ownerClerkUserId,
    });
  }

  const stored = await repository.getAccountBillingStatus(ownerClerkUserId);

  if (
    !billingAvailability.configured ||
    !stored?.stripeSubscriptionId
  ) {
    return stored ?? null;
  }

  try {
    return await syncSandboxBillingFromSubscription({
      ownerClerkUserId,
      stripeCustomerId: stored.stripeCustomerId,
      stripeSubscriptionId: stored.stripeSubscriptionId,
    });
  } catch {
    return stored;
  }
}

export async function GET(request: Request) {
  try {
    const ownerClerkUserId = await requireSignedInClerkUserId();
    const url = new URL(request.url);
    const checkoutSessionId = url.searchParams.get("sessionId")?.trim();
    const billingAvailability = getSandboxBillingAvailability();
    const billingStatus = await resolveBillingStatus(
      ownerClerkUserId,
      checkoutSessionId,
    );
    const usageStatus = await buildSandboxUsageStatus(
      ownerClerkUserId,
      billingStatus,
    );
    const response = serializeSandboxSubscriptionStatus(
      billingStatus,
      usageStatus,
    );

    return NextResponse.json({
      ...response,
      billingConfigured: billingAvailability.configured,
      billingConfigurationMessage: billingAvailability.message,
    });
  } catch (error) {
    return toRouteErrorResponse(
      error,
      "Unable to load sandbox subscription status",
      { exposeMessage: false },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const ownerClerkUserId = await requireSignedInClerkUserId();
    const body = (await request.json()) as Record<string, unknown>;
    const sandboxUsageBudgetCents = parseSandboxUsageBudgetCents(body);
    const existing = await repository.getAccountBillingStatus(ownerClerkUserId);

    const billingStatus = await repository.upsertAccountBillingStatus({
      ownerClerkUserId,
      stripeCustomerId: existing?.stripeCustomerId,
      stripeSubscriptionId: existing?.stripeSubscriptionId,
      stripePriceId: existing?.stripePriceId,
      stripeProductId: existing?.stripeProductId,
      billingState: existing?.billingState ?? "inactive",
      sandboxEligibility: existing?.sandboxEligibility ?? "unverified",
      planName: existing?.planName,
      planLookupKey: existing?.planLookupKey,
      planMetadata: existing?.planMetadata ?? {},
      currentPeriodStart: existing?.currentPeriodStart,
      currentPeriodEnd: existing?.currentPeriodEnd,
      sandboxUsageBudgetCents: sandboxUsageBudgetCents ?? undefined,
      cancelAt: existing?.cancelAt,
      cancelAtPeriodEnd: existing?.cancelAtPeriodEnd,
      canceledAt: existing?.canceledAt,
      delinquentAt: existing?.delinquentAt,
      lastWebhookAt: existing?.lastWebhookAt,
    });
    const billingAvailability = getSandboxBillingAvailability();
    const usageStatus = await buildSandboxUsageStatus(
      ownerClerkUserId,
      billingStatus,
    );

    return NextResponse.json({
      ...serializeSandboxSubscriptionStatus(billingStatus, usageStatus),
      billingConfigured: billingAvailability.configured,
      billingConfigurationMessage: billingAvailability.message,
    });
  } catch (error) {
    return toRouteErrorResponse(error, "Unable to update sandbox budget", {
      exposeMessage: true,
    });
  }
}
