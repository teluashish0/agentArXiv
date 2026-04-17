import type {
  AccountBillingStatus,
  SandboxExecution,
  SandboxSession,
  SandboxUsageLedger,
} from "./types";

const ACTIVE_SANDBOX_EXECUTION_STATUSES = new Set<
  SandboxExecution["status"]
>(["queued", "provisioning", "running"]);
const ACTIVE_SANDBOX_SESSION_STATUSES = new Set<SandboxSession["status"]>([
  "provisioning",
  "ready",
]);

export const SANDBOX_USAGE_MICROCENTS_PER_CENT = 1_000_000;
export const SANDBOX_USAGE_SECONDS_PER_HOUR = 3_600;
export const SANDBOX_SESSION_USAGE_LAST_METERED_AT_KEY =
  "agentarxiv_sandbox_usage_last_metered_at";
export const SANDBOX_SESSION_USAGE_EXECUTION_ID_PREFIX = "sandbox_session_";

export class SandboxUsageBillingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxUsageBillingConfigError";
  }
}

function parseRequiredPositiveNumberEnv(
  env: Record<string, string | undefined>,
  name: string,
  context: string,
) {
  const value = env[name]?.trim();

  if (!value) {
    throw new SandboxUsageBillingConfigError(`${name} is required for ${context}`);
  }

  const parsed = Number.parseFloat(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new SandboxUsageBillingConfigError(`${name} must be a positive number`);
  }

  return parsed;
}

function parseOptionalPositiveIntegerEnv(
  env: Record<string, string | undefined>,
  name: string,
) {
  const value = env[name]?.trim();

  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new SandboxUsageBillingConfigError(`${name} must be a positive integer`);
  }

  return parsed;
}

export type SandboxUsageBillingConfig = {
  usagePriceUsdPerSecond: number;
  defaultBudgetCents?: number;
};

export function getSandboxUsageBillingConfig(
  env: Record<string, string | undefined> = process.env,
): SandboxUsageBillingConfig {
  return {
    usagePriceUsdPerSecond: parseRequiredPositiveNumberEnv(
      env,
      "AGENTARXIV_SANDBOX_USAGE_PRICE_USD_PER_SECOND",
      "sandbox usage billing",
    ),
    defaultBudgetCents: parseOptionalPositiveIntegerEnv(
      env,
      "AGENTARXIV_SANDBOX_DEFAULT_USAGE_BUDGET_CENTS",
    ),
  };
}

export function getSandboxUsageRateMicrocentsPerSecond(usagePriceUsdPerSecond: number) {
  return Math.round(
    usagePriceUsdPerSecond * 100 * SANDBOX_USAGE_MICROCENTS_PER_CENT,
  );
}

export function getSandboxUsageRateMicrocentsPerHour(usagePriceUsdPerSecond: number) {
  return (
    getSandboxUsageRateMicrocentsPerSecond(usagePriceUsdPerSecond) *
    SANDBOX_USAGE_SECONDS_PER_HOUR
  );
}

export function formatStripeUnitAmountDecimalFromUsdPerSecond(
  usagePriceUsdPerSecond: number,
) {
  const centsPerSecond = usagePriceUsdPerSecond * 100;
  return centsPerSecond.toFixed(12).replace(/\.?0+$/, "");
}

export function calculateSandboxUsageCostMicrocents(input: {
  runtimeSeconds: number;
  usagePriceUsdPerSecond: number;
}) {
  if (input.runtimeSeconds <= 0) {
    return 0;
  }

  return Math.round(
    input.runtimeSeconds *
      input.usagePriceUsdPerSecond *
      100 *
      SANDBOX_USAGE_MICROCENTS_PER_CENT,
  );
}

function toFiniteTimeMs(value?: string) {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

function clampUsageWindowMs(input: {
  startMs: number;
  endMs: number;
  billingStartMs?: number;
  billingEndMs?: number;
}) {
  let startMs = input.startMs;
  let endMs = input.endMs;

  if (input.billingStartMs !== undefined) {
    startMs = Math.max(startMs, input.billingStartMs);
  }

  if (input.billingEndMs !== undefined) {
    endMs = Math.min(endMs, input.billingEndMs);
  }

  if (endMs <= startMs) {
    return 0;
  }

  return Math.ceil((endMs - startMs) / 1000);
}

export function getSandboxSessionUsageExecutionId(sessionId: string) {
  return `${SANDBOX_SESSION_USAGE_EXECUTION_ID_PREFIX}${sessionId}`;
}

export function getSandboxSessionIdFromUsageExecutionId(executionId: string) {
  return executionId.startsWith(SANDBOX_SESSION_USAGE_EXECUTION_ID_PREFIX)
    ? executionId.slice(SANDBOX_SESSION_USAGE_EXECUTION_ID_PREFIX.length)
    : undefined;
}

export function getSandboxSessionLastMeteredAt(input: {
  session: Pick<SandboxSession, "startedAt" | "lastActiveAt" | "metadata">;
  latestUsageAt?: string;
}) {
  const candidates = [
    input.session.metadata[SANDBOX_SESSION_USAGE_LAST_METERED_AT_KEY],
    input.latestUsageAt,
    input.session.lastActiveAt,
    input.session.startedAt,
  ]
    .map(toFiniteTimeMs)
    .filter((value): value is number => value !== undefined);

  if (candidates.length === 0) {
    return input.session.startedAt;
  }

  return new Date(Math.max(...candidates)).toISOString();
}

export function getSandboxSessionUsageRuntimeSeconds(input: {
  session: Pick<SandboxSession, "startedAt" | "expiresAt">;
  fromAt: string;
  throughAt: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
}) {
  const startMs = toFiniteTimeMs(input.fromAt);
  const throughMs = toFiniteTimeMs(input.throughAt);
  const sessionStartMs = toFiniteTimeMs(input.session.startedAt);
  const sessionEndMs = toFiniteTimeMs(input.session.expiresAt);

  if (
    startMs === undefined ||
    throughMs === undefined ||
    sessionStartMs === undefined ||
    sessionEndMs === undefined
  ) {
    return 0;
  }

  const boundedStartMs = Math.max(startMs, sessionStartMs);
  const boundedEndMs = Math.min(throughMs, sessionEndMs);

  if (boundedEndMs <= boundedStartMs) {
    return 0;
  }

  return clampUsageWindowMs({
    startMs: boundedStartMs,
    endMs: boundedEndMs,
    billingStartMs: toFiniteTimeMs(input.currentPeriodStart),
    billingEndMs: toFiniteTimeMs(input.currentPeriodEnd),
  });
}

export function getSandboxSessionReservedRuntimeSeconds(input: {
  session: Pick<SandboxSession, "status" | "providerSessionId" | "startedAt" | "expiresAt">;
  asOf: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
}) {
  if (
    !input.session.providerSessionId ||
    !ACTIVE_SANDBOX_SESSION_STATUSES.has(input.session.status)
  ) {
    return 0;
  }

  return getSandboxSessionUsageRuntimeSeconds({
    session: input.session,
    fromAt: input.asOf,
    throughAt: input.session.expiresAt,
    currentPeriodStart: input.currentPeriodStart,
    currentPeriodEnd: input.currentPeriodEnd,
  });
}

export function estimateSandboxSessionReservationSeconds(input: {
  timeoutSeconds: number;
  idleTtlMinutes: number;
  maxAgeMinutes: number;
}) {
  const timeoutSeconds = Math.max(0, input.timeoutSeconds);
  const idleSeconds = Math.max(0, input.idleTtlMinutes) * 60;
  const maxAgeSeconds = Math.max(0, input.maxAgeMinutes) * 60;

  return Math.min(maxAgeSeconds, timeoutSeconds + idleSeconds);
}

export function estimateSandboxSessionAdditionalReservationSeconds(input: {
  timeoutSeconds: number;
  asOf?: string;
  session?: Pick<
    SandboxSession,
    | "status"
    | "providerSessionId"
    | "startedAt"
    | "expiresAt"
    | "idleTtlMinutes"
    | "maxAgeMinutes"
  >;
}) {
  const timeoutSeconds = Math.max(0, input.timeoutSeconds);
  const asOf = input.asOf ?? new Date().toISOString();

  if (
    !input.session?.providerSessionId ||
    !ACTIVE_SANDBOX_SESSION_STATUSES.has(input.session.status)
  ) {
    return estimateSandboxSessionReservationSeconds({
      timeoutSeconds,
      idleTtlMinutes: input.session?.idleTtlMinutes ?? 15,
      maxAgeMinutes: input.session?.maxAgeMinutes ?? 120,
    });
  }

  const asOfMs = toFiniteTimeMs(asOf);
  const startedAtMs = toFiniteTimeMs(input.session.startedAt);
  const expiresAtMs = toFiniteTimeMs(input.session.expiresAt);

  if (
    asOfMs === undefined ||
    startedAtMs === undefined ||
    expiresAtMs === undefined ||
    expiresAtMs <= asOfMs
  ) {
    return estimateSandboxSessionReservationSeconds({
      timeoutSeconds,
      idleTtlMinutes: input.session.idleTtlMinutes,
      maxAgeMinutes: input.session.maxAgeMinutes,
    });
  }

  const projectedEndMs = Math.min(
    startedAtMs + input.session.maxAgeMinutes * 60_000,
    asOfMs + (timeoutSeconds + input.session.idleTtlMinutes * 60) * 1000,
  );

  if (projectedEndMs <= expiresAtMs) {
    return 0;
  }

  return Math.ceil((projectedEndMs - expiresAtMs) / 1000);
}

function isWithinBillingPeriod(
  createdAt: string,
  currentPeriodStart?: string,
  currentPeriodEnd?: string,
) {
  const createdAtMs = new Date(createdAt).getTime();

  if (!Number.isFinite(createdAtMs)) {
    return false;
  }

  if (currentPeriodStart) {
    const startMs = new Date(currentPeriodStart).getTime();

    if (Number.isFinite(startMs) && createdAtMs < startMs) {
      return false;
    }
  }

  if (currentPeriodEnd) {
    const endMs = new Date(currentPeriodEnd).getTime();

    if (Number.isFinite(endMs) && createdAtMs >= endMs) {
      return false;
    }
  }

  return true;
}

export type SandboxUsageSummary = {
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  reportedUsageMicrocents: number;
  reservedUsageMicrocents: number;
  projectedUsageMicrocents: number;
  budgetLimitCents?: number;
  remainingBudgetMicrocents?: number;
  usingDefaultBudget: boolean;
  rateMicrocentsPerHour: number;
};

export function summarizeAccountSandboxUsage(input: {
  ownerClerkUserId: string;
  asOf?: string;
  billingStatus?: Pick<
    AccountBillingStatus,
    "currentPeriodStart" | "currentPeriodEnd" | "sandboxUsageBudgetCents"
  >;
  sessions: Array<
    Pick<
      SandboxSession,
      | "id"
      | "ownerClerkUserId"
      | "providerSessionId"
      | "status"
      | "idleTtlMinutes"
      | "maxAgeMinutes"
      | "metadata"
      | "startedAt"
      | "lastActiveAt"
      | "expiresAt"
    >
  >;
  executions: Array<
    Pick<
      SandboxExecution,
      "id" | "sessionId" | "ownerClerkUserId" | "createdAt" | "status" | "command"
    >
  >;
  usageLedger: Array<
    Pick<
      SandboxUsageLedger,
      | "executionId"
      | "ownerClerkUserId"
      | "createdAt"
      | "runtimeSeconds"
      | "estimatedCostMicrocents"
      | "reportedAt"
    >
  >;
  usagePriceUsdPerSecond: number;
  defaultBudgetCents?: number;
}): SandboxUsageSummary {
  const currentPeriodStart =
    input.billingStatus?.currentPeriodStart ??
    (input.billingStatus?.currentPeriodEnd
      ? new Date(
          new Date(input.billingStatus.currentPeriodEnd).getTime() -
            31 * 24 * 60 * 60 * 1000,
        ).toISOString()
      : undefined);
  const currentPeriodEnd = input.billingStatus?.currentPeriodEnd;
  const now = input.asOf ?? new Date().toISOString();
  const executionSessionIds = new Map(
    input.executions.map((execution) => [execution.id, execution.sessionId]),
  );
  const latestUsageAtBySessionId = new Map<string, number>();
  const usageEntries = input.usageLedger.filter(
    (entry) =>
      entry.ownerClerkUserId === input.ownerClerkUserId &&
      isWithinBillingPeriod(entry.createdAt, currentPeriodStart, currentPeriodEnd),
  );
  for (const entry of usageEntries) {
    const sessionId =
      getSandboxSessionIdFromUsageExecutionId(entry.executionId) ??
      executionSessionIds.get(entry.executionId);
    const usageAtMs = toFiniteTimeMs(entry.reportedAt ?? entry.createdAt);

    if (!sessionId || usageAtMs === undefined) {
      continue;
    }

    const current = latestUsageAtBySessionId.get(sessionId) ?? 0;
    latestUsageAtBySessionId.set(sessionId, Math.max(current, usageAtMs));
  }
  const meteredExecutionIds = new Set(usageEntries.map((entry) => entry.executionId));
  const settledUsageMicrocents = usageEntries.reduce((total, entry) => {
    return (
      total +
      (entry.estimatedCostMicrocents ??
        calculateSandboxUsageCostMicrocents({
          runtimeSeconds: entry.runtimeSeconds,
          usagePriceUsdPerSecond: input.usagePriceUsdPerSecond,
        }))
    );
  }, 0);
  const activeSessions = input.sessions.filter(
    (session) =>
      session.ownerClerkUserId === input.ownerClerkUserId &&
      session.providerSessionId &&
      ACTIVE_SANDBOX_SESSION_STATUSES.has(session.status) &&
      (toFiniteTimeMs(session.expiresAt) ?? 0) > (toFiniteTimeMs(now) ?? 0),
  );
  const activeSessionIds = new Set(activeSessions.map((session) => session.id));
  const currentSessionUsageMicrocents = activeSessions.reduce((total, session) => {
    const latestUsageAtMs = latestUsageAtBySessionId.get(session.id);
    const latestUsageAt =
      latestUsageAtMs !== undefined
        ? new Date(latestUsageAtMs).toISOString()
        : undefined;
    const runtimeSeconds = getSandboxSessionUsageRuntimeSeconds({
      session,
      fromAt: getSandboxSessionLastMeteredAt({
        session,
        latestUsageAt,
      }),
      throughAt: now,
      currentPeriodStart,
      currentPeriodEnd,
    });

    return (
      total +
      calculateSandboxUsageCostMicrocents({
        runtimeSeconds,
        usagePriceUsdPerSecond: input.usagePriceUsdPerSecond,
      })
    );
  }, 0);
  const reportedUsageMicrocents =
    settledUsageMicrocents + currentSessionUsageMicrocents;
  const reservedSessionUsageMicrocents = activeSessions.reduce((total, session) => {
    return (
      total +
      calculateSandboxUsageCostMicrocents({
        runtimeSeconds: getSandboxSessionReservedRuntimeSeconds({
          session,
          asOf: now,
          currentPeriodStart,
          currentPeriodEnd,
        }),
        usagePriceUsdPerSecond: input.usagePriceUsdPerSecond,
      })
    );
  }, 0);
  const sessionById = new Map(input.sessions.map((session) => [session.id, session]));
  const reservedExecutionUsageMicrocents = input.executions
    .filter(
      (execution) =>
        execution.ownerClerkUserId === input.ownerClerkUserId &&
        !meteredExecutionIds.has(execution.id) &&
        !activeSessionIds.has(execution.sessionId) &&
        isWithinBillingPeriod(
          execution.createdAt,
          currentPeriodStart,
          currentPeriodEnd,
        ),
    )
    .reduce((total, execution) => {
      const session = sessionById.get(execution.sessionId);
      return (
        total +
        calculateSandboxUsageCostMicrocents({
          runtimeSeconds: ACTIVE_SANDBOX_EXECUTION_STATUSES.has(execution.status)
            ? estimateSandboxSessionAdditionalReservationSeconds({
                timeoutSeconds: execution.command.timeoutSeconds ?? 900,
                asOf: now,
                session,
              })
            : 0,
          usagePriceUsdPerSecond: input.usagePriceUsdPerSecond,
        })
      );
    }, 0);
  const reservedUsageMicrocents =
    reservedSessionUsageMicrocents + reservedExecutionUsageMicrocents;
  const projectedUsageMicrocents =
    reportedUsageMicrocents + reservedUsageMicrocents;
  const budgetLimitCents =
    input.billingStatus?.sandboxUsageBudgetCents ?? input.defaultBudgetCents;
  const remainingBudgetMicrocents =
    budgetLimitCents === undefined
      ? undefined
      : Math.max(
          0,
          budgetLimitCents * SANDBOX_USAGE_MICROCENTS_PER_CENT -
            projectedUsageMicrocents,
        );

  return {
    currentPeriodStart,
    currentPeriodEnd,
    reportedUsageMicrocents,
    reservedUsageMicrocents,
    projectedUsageMicrocents,
    budgetLimitCents,
    remainingBudgetMicrocents,
    usingDefaultBudget:
      input.billingStatus?.sandboxUsageBudgetCents === undefined &&
      input.defaultBudgetCents !== undefined,
    rateMicrocentsPerHour: getSandboxUsageRateMicrocentsPerHour(
      input.usagePriceUsdPerSecond,
    ),
  };
}
