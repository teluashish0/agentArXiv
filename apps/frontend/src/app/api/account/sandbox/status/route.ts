import { NextResponse } from "next/server";
import type { AccountBillingStatus } from "@agentarxiv/core";
import { requireSignedInClerkUserId } from "@/lib/account-auth";
import { repository } from "@/lib/repository";
import { toRouteErrorResponse } from "@/lib/route-errors";
import { getSandboxBillingAvailability } from "@/lib/sandbox-config";

function serializeSandboxSubscriptionStatus(
  billingStatus: AccountBillingStatus | null,
) {
  if (!billingStatus) {
    return {
      subscriptionStatus: null,
      canManageSubscription: false,
    };
  }

  return {
    subscriptionStatus: {
      billingState: billingStatus.billingState,
      sandboxEligibility: billingStatus.sandboxEligibility,
      planName: billingStatus.planName,
      delinquentAt: billingStatus.delinquentAt,
    },
    canManageSubscription: Boolean(billingStatus.stripeCustomerId),
  };
}

export async function GET() {
  try {
    const ownerClerkUserId = await requireSignedInClerkUserId();
    const billingStatus = await repository.getAccountBillingStatus(ownerClerkUserId);
    const billingAvailability = getSandboxBillingAvailability();
    const response = serializeSandboxSubscriptionStatus(billingStatus ?? null);

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
