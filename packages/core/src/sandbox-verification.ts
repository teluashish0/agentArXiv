import type { AccountBillingStatus } from "./types";

type EnvLike = Record<string, string | undefined>;

const TRUE_ENV_VALUES = new Set(["1", "true", "yes", "on"]);

function getEnvSource(env?: EnvLike) {
  if (env) {
    return env;
  }

  if (typeof process === "undefined") {
    return {};
  }

  return process.env;
}

function parseBooleanEnv(value?: string) {
  return value ? TRUE_ENV_VALUES.has(value.trim().toLowerCase()) : false;
}

function hasBillingTermEnded(
  billingStatus?:
    | Pick<
        AccountBillingStatus,
        "currentPeriodEnd" | "cancelAt" | "cancelAtPeriodEnd"
      >
    | null,
) {
  if (!billingStatus) {
    return false;
  }

  const effectiveEnd =
    billingStatus.cancelAt ??
    (billingStatus.cancelAtPeriodEnd ? billingStatus.currentPeriodEnd : undefined);

  if (!effectiveEnd) {
    return false;
  }

  const effectiveEndMs = new Date(effectiveEnd).getTime();

  return Number.isFinite(effectiveEndMs) && effectiveEndMs <= Date.now();
}

export function isSandboxBillingVerified(
  billingStatus?:
    | Pick<
        AccountBillingStatus,
        | "billingState"
        | "sandboxEligibility"
        | "currentPeriodEnd"
        | "cancelAt"
        | "cancelAtPeriodEnd"
      >
    | null,
) {
  return (
    billingStatus?.billingState === "active" &&
    billingStatus.sandboxEligibility === "verified" &&
    !hasBillingTermEnded(billingStatus)
  );
}

export function isSandboxBillingBlocked(
  billingStatus?: Pick<AccountBillingStatus, "billingState" | "sandboxEligibility"> | null,
) {
  return (
    billingStatus?.billingState === "past_due" ||
    billingStatus?.billingState === "unpaid" ||
    billingStatus?.sandboxEligibility === "blocked"
  );
}

export function getLocalSandboxVerifiedOwnerIds(env?: EnvLike) {
  const source = getEnvSource(env);

  if (source.NODE_ENV?.trim().toLowerCase() === "production") {
    return new Set<string>();
  }

  if (
    !parseBooleanEnv(
      source.AGENTARXIV_ENABLE_LOCAL_SANDBOX_VERIFICATION_OVERRIDE,
    )
  ) {
    return new Set<string>();
  }

  return new Set(
    (source.AGENTARXIV_LOCAL_SANDBOX_VERIFIED_OWNER_IDS ?? "")
      .split(/[,\s]+/)
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function hasLocalSandboxVerificationOverride(
  ownerClerkUserId?: string,
  env?: EnvLike,
) {
  if (!ownerClerkUserId) {
    return false;
  }

  return getLocalSandboxVerifiedOwnerIds(env).has(ownerClerkUserId);
}

export function getEffectiveAccountBillingStatus(
  ownerClerkUserId?: string,
  billingStatus?: AccountBillingStatus | null,
  env?: EnvLike,
): AccountBillingStatus | undefined {
  if (!ownerClerkUserId) {
    return billingStatus ?? undefined;
  }

  if (!hasLocalSandboxVerificationOverride(ownerClerkUserId, env)) {
    return billingStatus ?? undefined;
  }

  const now = new Date().toISOString();

  return {
    id: billingStatus?.id ?? `acctbill_local_override_${ownerClerkUserId}`,
    ownerClerkUserId,
    stripeCustomerId: billingStatus?.stripeCustomerId,
    stripeSubscriptionId: billingStatus?.stripeSubscriptionId,
    stripePriceId: billingStatus?.stripePriceId,
    stripeProductId: billingStatus?.stripeProductId,
    billingState: "active",
    sandboxEligibility: "verified",
    planName: billingStatus?.planName ?? "Local Sandbox Override",
    planLookupKey: billingStatus?.planLookupKey ?? "local-sandbox-override",
    planMetadata: {
      ...(billingStatus?.planMetadata ?? {}),
      sandbox_local_override: "true",
    },
    currentPeriodEnd: billingStatus?.currentPeriodEnd,
    cancelAt: billingStatus?.cancelAt,
    cancelAtPeriodEnd: billingStatus?.cancelAtPeriodEnd,
    canceledAt: billingStatus?.canceledAt,
    delinquentAt: undefined,
    lastWebhookAt: billingStatus?.lastWebhookAt,
    createdAt: billingStatus?.createdAt ?? now,
    updatedAt: now,
  };
}
