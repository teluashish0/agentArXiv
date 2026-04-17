import {
  CommandExitError,
  Sandbox,
  type CommandResult,
  type SandboxMetrics,
} from "e2b";
import {
  calculateSandboxUsageCostMicrocents,
  executeWorkspaceNotebookJupyterCode,
  getSandboxSessionLastMeteredAt,
  getSandboxSessionUsageExecutionId,
  getSandboxSessionUsageRuntimeSeconds,
  getWorkspaceNotebookCellSource,
  isSandboxBillingVerified,
  SANDBOX_SESSION_USAGE_LAST_METERED_AT_KEY,
  type WorkspaceNotebook,
  type WorkspaceNotebookCell,
} from "@agentarxiv/core";
import type {
  AccountBillingStatus,
  ArtifactType,
  SandboxExecution,
  SandboxSession,
  WorkspaceSandboxSummary,
} from "@agentarxiv/core";
import {
  SANDBOX_SUPPORT_ERROR_MESSAGE,
  getStripeClient,
  getSandboxWorkerConfig,
} from "./config";
import { ensureNotebookJupyterKernelRuntime } from "./notebook-runtime";

type QueueWorkspace = {
  id: string;
  title: string;
  stage: string;
};

type WorkspaceRun = {
  status: string;
  currentStage: string;
};

type SandboxRepository = {
  listWorkspaces(): Promise<QueueWorkspace[]>;
  getWorkspaceRun(workspaceId: string): Promise<WorkspaceRun | undefined>;
  advanceWorkspaceRun(workspaceId: string): Promise<WorkspaceRun>;
  listSandboxExecutions(filters?: {
    workspaceId?: string;
    agentId?: string;
    status?: SandboxExecution["status"];
  }): Promise<SandboxExecution[]>;
  getSandboxExecution(executionId: string): Promise<SandboxExecution>;
  getSandboxSession(sessionId: string): Promise<SandboxSession>;
  getWorkspaceNotebook(input: { workspaceId: string }): Promise<WorkspaceNotebook>;
  getWorkspaceSandboxSummary(workspaceId: string): Promise<WorkspaceSandboxSummary>;
  getAccountBillingStatus(
    ownerClerkUserId: string,
  ): Promise<AccountBillingStatus | undefined>;
  upsertSandboxSession(input: {
    sessionId?: string;
    workspaceId: string;
    agentId: string;
    ownerClerkUserId: string;
    providerSessionId?: string;
    status: SandboxSession["status"];
    metadata?: Record<string, string>;
    errorMessage?: string;
    startedAt?: string;
    lastActiveAt?: string;
    expiresAt?: string;
  }): Promise<SandboxSession>;
  updateSandboxExecution(input: {
    executionId: string;
    status?: SandboxExecution["status"];
    providerExecutionId?: string;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    resultSummary?: string;
    metrics?: Record<string, number>;
    outputs?: Record<string, string>;
    billedRuntimeSeconds?: number;
    startedAt?: string;
    finishedAt?: string;
    errorMessage?: string;
    notebookCellOutputs?: WorkspaceNotebookCell["outputs"];
    notebookExecutionCount?: number | null;
    notebookOutputIds?: string[];
    artifact?: {
      type: ArtifactType;
      title: string;
      content: string;
    };
  }): Promise<SandboxExecution>;
  recordSandboxUsage(input: {
    executionId: string;
    ownerClerkUserId: string;
    stripeCustomerId: string;
    stripeMeterEventName: string;
    stripeMeterEventIdentifier: string;
    meterValue: number;
    runtimeSeconds: number;
    estimatedCostMicrocents?: number;
    sandboxCpuCount?: number;
    sandboxMemoryMb?: number;
    status: "pending" | "reported" | "failed";
    reportedAt?: string;
  }): Promise<unknown>;
};

const activeSandboxStatuses = new Set<SandboxExecution["status"]>([
  "queued",
  "provisioning",
  "running",
]);

type WorkerSandbox = Awaited<ReturnType<typeof Sandbox.create>>;

type E2BSandboxManager = {
  createSession(input: {
    workspaceId: string;
    agentId: string;
    sessionId: string;
    ownerClerkUserId: string;
  }): Promise<WorkerSandbox>;
  connectSession(providerSessionId: string): Promise<WorkerSandbox>;
  terminateSession(providerSessionId: string): Promise<void>;
};

type MeterReporter = {
  reportUsage(input: {
    stripeCustomerId: string;
    usageKey: string;
    runtimeSeconds: number;
  }): Promise<{
    identifier: string;
    meterValue: number;
  }>;
};

function toProviderPid(providerExecutionId?: string) {
  if (!providerExecutionId) {
    return undefined;
  }

  const pid = Number.parseInt(providerExecutionId, 10);

  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`Sandbox provider execution id ${providerExecutionId} is invalid`);
  }

  return pid;
}

function addMinutes(timestamp: string, minutes: number) {
  return new Date(new Date(timestamp).getTime() + minutes * 60_000).toISOString();
}

export const MAX_E2B_PROVIDER_TIMEOUT_MS = 60 * 60_000;

export function clampE2BProviderTimeoutMs(timeoutMs: number) {
  return Math.min(timeoutMs, MAX_E2B_PROVIDER_TIMEOUT_MS);
}

export function getBilledRuntimeSeconds(startedAt: string, finishedAt: string) {
  const elapsedMilliseconds =
    new Date(finishedAt).getTime() - new Date(startedAt).getTime();

  if (elapsedMilliseconds <= 0) {
    return 0;
  }

  return Math.ceil(elapsedMilliseconds / 1000);
}

export function getMeterValueSeconds(runtimeSeconds: number) {
  if (runtimeSeconds <= 0) {
    return 0;
  }

  return Math.ceil(runtimeSeconds);
}

export function getSessionExpiryAt(session: Pick<
  SandboxSession,
  "startedAt" | "lastActiveAt" | "idleTtlMinutes" | "maxAgeMinutes"
>) {
  const maxAgeExpiresAt =
    new Date(session.startedAt).getTime() + session.maxAgeMinutes * 60_000;
  const idleExpiresAt =
    new Date(session.lastActiveAt).getTime() + session.idleTtlMinutes * 60_000;

  return new Date(Math.min(maxAgeExpiresAt, idleExpiresAt)).toISOString();
}

function getSessionHardMaxAt(session: Pick<SandboxSession, "startedAt" | "maxAgeMinutes">) {
  return addMinutes(session.startedAt, session.maxAgeMinutes);
}

function isMissingTemplateError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("template") && message.includes("not found");
}

function toSandboxProvisioningErrorMessage(error: unknown) {
  return isMissingTemplateError(error)
    ? SANDBOX_SUPPORT_ERROR_MESSAGE
    : error instanceof Error
      ? error.message
      : "Sandbox execution failed";
}

function toMetricsRecord(metrics?: SandboxMetrics | null): Record<string, number> {
  if (!metrics) {
    return {};
  }

  return {
    cpuUsedPct: metrics.cpuUsedPct,
    cpuCount: metrics.cpuCount,
    memUsedBytes: metrics.memUsed,
    memTotalBytes: metrics.memTotal,
    diskUsedBytes: metrics.diskUsed,
    diskTotalBytes: metrics.diskTotal,
  };
}

function buildExecutionArtifact(input: {
  execution: SandboxExecution;
  result: CommandResult;
  runtimeSeconds: number;
  metrics: Record<string, number>;
  estimatedCostMicrocents: number;
  sandboxCpuCount?: number;
  sandboxMemoryMb?: number;
}) {
  const lines = [
    `# Sandbox Execution ${input.execution.id}`,
    "",
    `Objective: ${input.execution.objective}`,
    `Command: \`${input.execution.command.command}\``,
    `Exit code: ${input.result.exitCode}`,
    `Runtime seconds: ${input.runtimeSeconds}`,
    `Estimated usage charge: $${(
      input.estimatedCostMicrocents / 100_000_000
    ).toFixed(6)}`,
  ];

  if (input.execution.command.workingDirectory) {
    lines.push(`Working directory: ${input.execution.command.workingDirectory}`);
  }

  if (input.sandboxCpuCount || input.sandboxMemoryMb) {
    lines.push(
      `Sandbox compute: ${input.sandboxCpuCount ?? "?"} vCPU / ${input.sandboxMemoryMb ?? "?"} MiB RAM`,
    );
  }

  if (Object.keys(input.metrics).length > 0) {
    lines.push("");
    lines.push("## Metrics");
    for (const [key, value] of Object.entries(input.metrics)) {
      lines.push(`- ${key}: ${value}`);
    }
  }

  if (input.result.stdout.trim()) {
    lines.push("");
    lines.push("## Stdout");
    lines.push("```text");
    lines.push(input.result.stdout.trimEnd());
    lines.push("```");
  }

  if (input.result.stderr.trim()) {
    lines.push("");
    lines.push("## Stderr");
    lines.push("```text");
    lines.push(input.result.stderr.trimEnd());
    lines.push("```");
  }

  return {
    type: "review" as const,
    title: `Sandbox evidence · ${input.execution.objective.slice(0, 48)}`,
    content: lines.join("\n"),
  };
}

function buildResultSummary(input: {
  status: SandboxExecution["status"];
  result: CommandResult;
  runtimeSeconds: number;
}) {
  if (input.status === "completed") {
    return `Command completed in ${input.runtimeSeconds}s with exit code ${input.result.exitCode}.`;
  }

  if (input.status === "canceled") {
    return `Execution canceled after ${input.runtimeSeconds}s.`;
  }

  return `Command failed in ${input.runtimeSeconds}s with exit code ${input.result.exitCode}.`;
}

function buildNotebookResultSummary(input: {
  status: SandboxExecution["status"];
  runtimeSeconds: number;
  executionCount: number | null;
  outputCount: number;
}) {
  if (input.status === "completed") {
    return `Notebook cell completed in ${input.runtimeSeconds}s with ${input.outputCount} output(s) and execution count ${input.executionCount ?? 0}.`;
  }

  if (input.status === "canceled") {
    return `Notebook cell execution was interrupted after ${input.runtimeSeconds}s.`;
  }

  return `Notebook cell execution failed in ${input.runtimeSeconds}s.`;
}

function sortExecutionsForProcessing(executions: SandboxExecution[]) {
  const priority: Record<SandboxExecution["status"], number> = {
    running: 0,
    provisioning: 1,
    queued: 2,
    completed: 3,
    failed: 4,
    canceled: 5,
  };

  return [...executions].sort((left, right) => {
    const priorityDiff = priority[left.status] - priority[right.status];

    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return left.createdAt.localeCompare(right.createdAt);
  });
}

export function createE2BSandboxManager(): E2BSandboxManager {
  const config = getSandboxWorkerConfig();
  const baseOptions = {
    apiKey: config.e2bApiKey,
    timeoutMs: clampE2BProviderTimeoutMs(config.sessionMaxAgeMinutes * 60_000),
  };

  return {
    async createSession(input) {
      const sandboxOptions = {
        ...baseOptions,
        metadata: {
          workspaceId: input.workspaceId,
          agentId: input.agentId,
          sessionId: input.sessionId,
          ownerClerkUserId: input.ownerClerkUserId,
          provider: "e2b-managed",
        },
      };

      try {
        return await Sandbox.create(config.e2bSandboxTemplate, sandboxOptions);
      } catch (error) {
        if (isMissingTemplateError(error)) {
          throw new Error(SANDBOX_SUPPORT_ERROR_MESSAGE);
        }

        throw error;
      }
    },
    async connectSession(providerSessionId) {
      return Sandbox.connect(providerSessionId, {
        ...baseOptions,
      });
    },
    async terminateSession(providerSessionId) {
      const sandbox = await Sandbox.connect(providerSessionId, {
        ...baseOptions,
      });

      await sandbox.kill();
    },
  };
}

export function createStripeMeterReporter(): MeterReporter {
  const stripe = getStripeClient();
  const config = getSandboxWorkerConfig();

  return {
    async reportUsage(input) {
      const identifier = input.usageKey;
      const meterValue = getMeterValueSeconds(input.runtimeSeconds);

      if (meterValue <= 0) {
        return {
          identifier,
          meterValue,
        };
      }

      await stripe.v2.billing.meterEvents.create({
        event_name: config.stripeSandboxMeterEventName,
        identifier,
        payload: {
          stripe_customer_id: input.stripeCustomerId,
          value: String(meterValue),
        },
        timestamp: new Date().toISOString(),
      });

      return {
        identifier,
        meterValue,
      };
    },
  };
}

function toFiniteTimeMs(value?: string) {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getSessionUsageAnchorAt(session: SandboxSession, throughAt: string) {
  const throughAtMs = toFiniteTimeMs(throughAt);
  const startedAtMs = toFiniteTimeMs(session.startedAt);
  const expiresAtMs = toFiniteTimeMs(session.expiresAt);

  if (
    throughAtMs === undefined ||
    startedAtMs === undefined ||
    expiresAtMs === undefined
  ) {
    return throughAt;
  }

  return new Date(
    Math.max(startedAtMs, Math.min(throughAtMs, expiresAtMs)),
  ).toISOString();
}

function buildSandboxSessionUsageIdentifier(
  sessionId: string,
  fromAt: string,
  throughAt: string,
) {
  return `sandbox_session_${sessionId}_${new Date(fromAt).getTime()}_${new Date(throughAt).getTime()}`;
}

async function persistSessionUsageAnchor(
  repository: SandboxRepository,
  session: SandboxSession,
  anchorAt: string,
) {
  if (
    session.metadata[SANDBOX_SESSION_USAGE_LAST_METERED_AT_KEY] === anchorAt
  ) {
    return session;
  }

  return repository.upsertSandboxSession({
    sessionId: session.id,
    workspaceId: session.workspaceId,
    agentId: session.agentId,
    ownerClerkUserId: session.ownerClerkUserId,
    providerSessionId: session.providerSessionId,
    status: session.status,
    metadata: {
      ...session.metadata,
      [SANDBOX_SESSION_USAGE_LAST_METERED_AT_KEY]: anchorAt,
    },
    errorMessage: session.errorMessage,
    startedAt: session.startedAt,
    lastActiveAt: session.lastActiveAt,
    expiresAt: session.expiresAt,
  });
}

async function ensureSessionUsageAnchor(
  repository: SandboxRepository,
  session: SandboxSession,
  anchorAt: string,
) {
  if (session.metadata[SANDBOX_SESSION_USAGE_LAST_METERED_AT_KEY]) {
    return session;
  }

  return persistSessionUsageAnchor(repository, session, anchorAt);
}

async function expireStaleSandboxSessions(
  repository: SandboxRepository,
  sandboxManager: E2BSandboxManager,
  meterReporter: MeterReporter,
) {
  const workspaces = await repository.listWorkspaces();
  const executions = await repository.listSandboxExecutions({});
  const activeSessionIds = new Set(
    executions
      .filter((execution) => activeSandboxStatuses.has(execution.status))
      .map((execution) => execution.sessionId),
  );
  const now = new Date().toISOString();

  for (const workspace of workspaces) {
    const summary = await repository.getWorkspaceSandboxSummary(workspace.id);

    for (const session of summary.sessions) {
      if (
        session.status === "expired" ||
        session.status === "failed" ||
        activeSessionIds.has(session.id)
      ) {
        continue;
      }

      let meteredSession = session;
      const billingStatus = await repository.getAccountBillingStatus(
        session.ownerClerkUserId,
      );

      if (billingStatus?.stripeCustomerId && session.providerSessionId) {
        meteredSession = await reportSandboxSessionUsage(
          repository,
          meterReporter,
          billingStatus,
          session,
          now,
        );
      }

      if (new Date(getSessionExpiryAt(meteredSession)).getTime() > Date.now()) {
        continue;
      }

      if (meteredSession.providerSessionId) {
        try {
          await sandboxManager.terminateSession(meteredSession.providerSessionId);
        } catch {
          // The provider session might already be gone. The local runtime state
          // still needs to age out deterministically.
        }
      }

      await repository.upsertSandboxSession({
        sessionId: meteredSession.id,
        workspaceId: meteredSession.workspaceId,
        agentId: meteredSession.agentId,
        ownerClerkUserId: meteredSession.ownerClerkUserId,
        providerSessionId: meteredSession.providerSessionId,
        status: "expired",
        metadata: meteredSession.metadata,
        errorMessage: meteredSession.errorMessage,
        startedAt: meteredSession.startedAt,
        lastActiveAt: meteredSession.lastActiveAt,
        expiresAt: now,
      });
    }
  }
}

async function ensureSandboxSession(
  repository: SandboxRepository,
  sandboxManager: E2BSandboxManager,
  session: SandboxSession,
) {
  const now = new Date().toISOString();
  const sessionExpired =
    session.status === "expired" ||
    session.status === "failed" ||
    new Date(getSessionHardMaxAt(session)).getTime() <= Date.now();

  if (!sessionExpired && session.providerSessionId) {
    try {
      const sandbox = await sandboxManager.connectSession(session.providerSessionId);
      const refreshedSession = await repository.upsertSandboxSession({
        sessionId: session.id,
        workspaceId: session.workspaceId,
        agentId: session.agentId,
        ownerClerkUserId: session.ownerClerkUserId,
        providerSessionId: sandbox.sandboxId,
        status: "ready",
        metadata: session.metadata,
        startedAt: session.startedAt,
        lastActiveAt: now,
        expiresAt: getSessionHardMaxAt(session),
      });
      const anchoredSession = await ensureSessionUsageAnchor(
        repository,
        refreshedSession,
        refreshedSession.startedAt,
      );

      return {
        sandbox,
        session: anchoredSession,
      };
    } catch {
      // Fall through to provision a new provider session against the existing
      // runtime session record.
    }
  }

  if (session.providerSessionId) {
    try {
      await sandboxManager.terminateSession(session.providerSessionId);
    } catch {
      // The prior session may already be gone.
    }
  }

  await repository.upsertSandboxSession({
    sessionId: session.id,
    workspaceId: session.workspaceId,
    agentId: session.agentId,
    ownerClerkUserId: session.ownerClerkUserId,
    status: "provisioning",
    metadata: session.metadata,
    startedAt: session.startedAt,
    lastActiveAt: now,
    expiresAt: getSessionHardMaxAt({
      startedAt: now,
      maxAgeMinutes: session.maxAgeMinutes,
    }),
  });

  const sandbox = await sandboxManager.createSession({
    workspaceId: session.workspaceId,
    agentId: session.agentId,
    sessionId: session.id,
    ownerClerkUserId: session.ownerClerkUserId,
  });
  const readySession = await repository.upsertSandboxSession({
    sessionId: session.id,
    workspaceId: session.workspaceId,
    agentId: session.agentId,
    ownerClerkUserId: session.ownerClerkUserId,
    providerSessionId: sandbox.sandboxId,
    status: "ready",
    metadata: {
      ...session.metadata,
      providerSessionId: sandbox.sandboxId,
    },
    startedAt: now,
    lastActiveAt: now,
    expiresAt: addMinutes(now, session.maxAgeMinutes),
  });
  const anchoredSession = await ensureSessionUsageAnchor(
    repository,
    readySession,
    readySession.startedAt,
  );

  return {
    sandbox,
    session: anchoredSession,
  };
}

async function connectOrStartCommand(
  repository: SandboxRepository,
  execution: SandboxExecution,
  sandbox: WorkerSandbox,
) {
  const timeoutMs = (execution.command.timeoutSeconds ?? 900) * 1000;
  const pid = toProviderPid(execution.providerExecutionId);

  if (pid && execution.status !== "queued") {
    const handle = await sandbox.commands.connect(pid, {
      timeoutMs,
    });

    return {
      handle,
      startedAt: execution.startedAt ?? new Date().toISOString(),
      providerExecutionId: execution.providerExecutionId,
    };
  }

  const startedAt = new Date().toISOString();
  await repository.updateSandboxExecution({
    executionId: execution.id,
    status: "provisioning",
    startedAt,
  });

  const handle = await sandbox.commands.run(execution.command.command, {
    background: true,
    cwd: execution.command.workingDirectory,
    envs: execution.command.env,
    timeoutMs,
  });
  const providerExecutionId = String(handle.pid);

  await repository.updateSandboxExecution({
    executionId: execution.id,
    status: "running",
    providerExecutionId,
    startedAt,
    outputs: {
      providerExecutionId,
      providerSessionId: sandbox.sandboxId,
    },
  });

  return {
    handle,
    startedAt,
    providerExecutionId,
  };
}

async function waitForCommandResult(handle: {
  wait(): Promise<CommandResult>;
}) {
  try {
    return await handle.wait();
  } catch (error) {
    if (error instanceof CommandExitError) {
      return {
        exitCode: error.exitCode,
        stdout: error.stdout,
        stderr: error.stderr,
        error: error.error,
      } satisfies CommandResult;
    }

    throw error;
  }
}

async function reportSandboxSessionUsage(
  repository: SandboxRepository,
  meterReporter: MeterReporter,
  billingStatus: AccountBillingStatus,
  session: SandboxSession,
  throughAt: string,
  sandboxCompute?: {
    cpuCount?: number;
    memoryMB?: number;
  },
) {
  const config = getSandboxWorkerConfig();
  const fromAt = getSandboxSessionLastMeteredAt({
    session,
  });
  const anchorAt = getSessionUsageAnchorAt(session, throughAt);
  const runtimeSeconds = getSandboxSessionUsageRuntimeSeconds({
    session,
    fromAt,
    throughAt: anchorAt,
  });

  if (!billingStatus.stripeCustomerId) {
    return persistSessionUsageAnchor(repository, session, anchorAt);
  }

  if (runtimeSeconds <= 0) {
    return persistSessionUsageAnchor(repository, session, anchorAt);
  }

  const identifier = buildSandboxSessionUsageIdentifier(
    session.id,
    fromAt,
    anchorAt,
  );
  const meterValue = getMeterValueSeconds(runtimeSeconds);
  const estimatedCostMicrocents = calculateSandboxUsageCostMicrocents({
    runtimeSeconds,
    usagePriceUsdPerSecond: config.sandboxUsagePriceUsdPerSecond,
  });

  await repository.recordSandboxUsage({
    executionId: getSandboxSessionUsageExecutionId(session.id),
    ownerClerkUserId: session.ownerClerkUserId,
    stripeCustomerId: billingStatus.stripeCustomerId,
    stripeMeterEventName: config.stripeSandboxMeterEventName,
    stripeMeterEventIdentifier: identifier,
    meterValue,
    runtimeSeconds,
    estimatedCostMicrocents,
    sandboxCpuCount: sandboxCompute?.cpuCount,
    sandboxMemoryMb: sandboxCompute?.memoryMB,
    status: "pending",
  });

  try {
    const meterReport = await meterReporter.reportUsage({
      stripeCustomerId: billingStatus.stripeCustomerId,
      usageKey: identifier,
      runtimeSeconds,
    });

    await repository.recordSandboxUsage({
      executionId: getSandboxSessionUsageExecutionId(session.id),
      ownerClerkUserId: session.ownerClerkUserId,
      stripeCustomerId: billingStatus.stripeCustomerId,
      stripeMeterEventName: config.stripeSandboxMeterEventName,
      stripeMeterEventIdentifier: meterReport.identifier,
      meterValue: meterReport.meterValue,
      runtimeSeconds,
      estimatedCostMicrocents,
      sandboxCpuCount: sandboxCompute?.cpuCount,
      sandboxMemoryMb: sandboxCompute?.memoryMB,
      status: "reported",
      reportedAt: new Date().toISOString(),
    });
  } catch {
    await repository.recordSandboxUsage({
      executionId: getSandboxSessionUsageExecutionId(session.id),
      ownerClerkUserId: session.ownerClerkUserId,
      stripeCustomerId: billingStatus.stripeCustomerId,
      stripeMeterEventName: config.stripeSandboxMeterEventName,
      stripeMeterEventIdentifier: identifier,
      meterValue,
      runtimeSeconds,
      estimatedCostMicrocents,
      sandboxCpuCount: sandboxCompute?.cpuCount,
      sandboxMemoryMb: sandboxCompute?.memoryMB,
      status: "failed",
    });
  }

  return persistSessionUsageAnchor(repository, session, anchorAt);
}

function findNotebookCell(
  notebook: WorkspaceNotebook,
  cellId: string,
) {
  return notebook.document.cells.find((cell) => cell.id === cellId);
}

async function processNotebookExecution(
  repository: SandboxRepository,
  sandbox: WorkerSandbox,
  session: SandboxSession,
  execution: SandboxExecution,
) {
  if (!execution.notebookCellId) {
    throw new Error(
      `Notebook execution ${execution.id} is missing a notebook cell id.`,
    );
  }

  if (!execution.leaseSequence) {
    throw new Error(
      `Notebook execution ${execution.id} is missing its notebook lease sequence.`,
    );
  }

  const timeoutMs = (execution.command.timeoutSeconds ?? 900) * 1000;
  const notebook = await repository.getWorkspaceNotebook({
    workspaceId: execution.workspaceId,
  });
  const cell = findNotebookCell(notebook, execution.notebookCellId);

  if (!cell || cell.cell_type !== "code") {
    throw new Error(
      `Notebook cell ${execution.notebookCellId} is not available for execution.`,
    );
  }

  const startedAt = execution.startedAt ?? new Date().toISOString();
  await repository.updateSandboxExecution({
    executionId: execution.id,
    status: "running",
    startedAt,
    outputs: {
      ...(session.providerSessionId
        ? { providerSessionId: session.providerSessionId }
        : {}),
    },
  });

  const ensuredRuntime = await ensureNotebookJupyterKernelRuntime(
    sandbox,
    session,
    execution.leaseSequence,
    timeoutMs,
  );
  const refreshedSession = await repository.upsertSandboxSession({
    sessionId: session.id,
    workspaceId: session.workspaceId,
    agentId: session.agentId,
    ownerClerkUserId: session.ownerClerkUserId,
    providerSessionId: session.providerSessionId,
    status: "ready",
    metadata: ensuredRuntime.metadata,
    startedAt: session.startedAt,
    lastActiveAt: startedAt,
    expiresAt: getSessionExpiryAt({
      ...session,
      lastActiveAt: startedAt,
    }),
  });

  const notebookResult = await executeWorkspaceNotebookJupyterCode(
    {
      serverUrl: ensuredRuntime.runtime.serverUrl,
      serverToken: ensuredRuntime.runtime.serverToken,
      kernelId: ensuredRuntime.runtime.kernelId,
    },
    {
      code: getWorkspaceNotebookCellSource(cell),
      timeoutMs,
    },
  );

  return {
    notebookResult,
    session: refreshedSession,
    startedAt,
  };
}

async function processSandboxExecution(
  repository: SandboxRepository,
  sandboxManager: E2BSandboxManager,
  meterReporter: MeterReporter,
  executionId: string,
) {
  const execution = await repository.getSandboxExecution(executionId);

  if (!activeSandboxStatuses.has(execution.status)) {
    return execution;
  }

  const billingStatus = await repository.getAccountBillingStatus(
    execution.ownerClerkUserId,
  );

  if (execution.status === "queued" && !isSandboxBillingVerified(billingStatus)) {
    return repository.updateSandboxExecution({
      executionId: execution.id,
      status: "failed",
      finishedAt: new Date().toISOString(),
      errorMessage:
        "Sandbox billing is no longer active for the execution owner profile.",
      resultSummary:
        "Execution was not started because the owning billing profile is no longer verified.",
    });
  }

  let session = await repository.getSandboxSession(execution.sessionId);
  let sandbox: WorkerSandbox | undefined;

  try {
    const ensured = await ensureSandboxSession(repository, sandboxManager, session);

    sandbox = ensured.sandbox;
    session = ensured.session;

    if (execution.executionMode === "notebook_cell") {
      const notebookExecution = await processNotebookExecution(
        repository,
        sandbox,
        session,
        execution,
      );
      const finishedAt = new Date().toISOString();
      const runtimeSeconds = getBilledRuntimeSeconds(
        notebookExecution.startedAt,
        finishedAt,
      );
      const sandboxInfo = await sandbox.getInfo().catch(() => null);
      const estimatedCostMicrocents = calculateSandboxUsageCostMicrocents({
        runtimeSeconds,
        usagePriceUsdPerSecond: getSandboxWorkerConfig().sandboxUsagePriceUsdPerSecond,
      });
      const metrics = toMetricsRecord(
        (await sandbox.getMetrics().catch(() => null))?.at(-1) ?? null,
      );
      const currentExecution = await repository.getSandboxExecution(execution.id);
      const nextStatus =
        currentExecution.status === "canceled"
          ? "canceled"
          : notebookExecution.notebookResult.replyStatus === "ok"
            ? "completed"
            : "failed";
      const exitCode = nextStatus === "completed" ? 0 : 1;
      const notebookOutputs = notebookExecution.notebookResult.outputs;
      const notebookOutputIds = notebookOutputs.map((output, index) =>
        output.id || `nout_${execution.id}_${index + 1}`,
      );
      const jupyterServerUrl =
        notebookExecution.session.metadata.agentarxiv_jupyter_server_url;
      const jupyterKernelId =
        notebookExecution.session.metadata.agentarxiv_jupyter_kernel_id;
      const commandResult = {
        exitCode,
        stdout: notebookExecution.notebookResult.stdout,
        stderr: notebookExecution.notebookResult.stderr,
        error:
          nextStatus === "failed"
            ? notebookExecution.notebookResult.stderr ||
              "Notebook cell execution failed."
            : undefined,
      } satisfies CommandResult;

      let meteredSession = notebookExecution.session;

      if (billingStatus) {
        meteredSession = await reportSandboxSessionUsage(
          repository,
          meterReporter,
          billingStatus,
          notebookExecution.session,
          finishedAt,
          {
            cpuCount: sandboxInfo?.cpuCount,
            memoryMB: sandboxInfo?.memoryMB,
          },
        );
      }

      const updatedExecution = await repository.updateSandboxExecution({
        executionId: execution.id,
        status: nextStatus,
        stdout: commandResult.stdout,
        stderr: commandResult.stderr,
        exitCode: commandResult.exitCode,
        startedAt: notebookExecution.startedAt,
        finishedAt,
        billedRuntimeSeconds: runtimeSeconds,
        metrics,
        outputs: {
          ...(session.providerSessionId
            ? { providerSessionId: session.providerSessionId }
            : {}),
          ...(jupyterServerUrl ? { jupyterServerUrl } : {}),
          ...(jupyterKernelId ? { jupyterKernelId } : {}),
          meterSeconds: String(getMeterValueSeconds(runtimeSeconds)),
          ...(sandboxInfo?.cpuCount
            ? { sandboxCpuCount: String(sandboxInfo.cpuCount) }
            : {}),
          ...(sandboxInfo?.memoryMB
            ? { sandboxMemoryMb: String(sandboxInfo.memoryMB) }
            : {}),
          estimatedCostMicrocents: String(estimatedCostMicrocents),
        },
        notebookCellOutputs: notebookOutputs,
        notebookExecutionCount: notebookExecution.notebookResult.executionCount,
        notebookOutputIds,
        resultSummary:
          currentExecution.resultSummary ??
          buildNotebookResultSummary({
            status: nextStatus,
            runtimeSeconds,
            executionCount: notebookExecution.notebookResult.executionCount,
            outputCount: notebookOutputs.length,
          }),
        errorMessage:
          nextStatus === "failed"
            ? commandResult.error ?? commandResult.stderr
            : undefined,
        artifact: buildExecutionArtifact({
          execution,
          result: commandResult,
          runtimeSeconds,
          metrics,
          estimatedCostMicrocents,
          sandboxCpuCount: sandboxInfo?.cpuCount,
          sandboxMemoryMb: sandboxInfo?.memoryMB,
        }),
      });

      await repository.upsertSandboxSession({
        sessionId: meteredSession.id,
        workspaceId: meteredSession.workspaceId,
        agentId: meteredSession.agentId,
        ownerClerkUserId: meteredSession.ownerClerkUserId,
        providerSessionId: meteredSession.providerSessionId,
        status: "ready",
        metadata: meteredSession.metadata,
        startedAt: meteredSession.startedAt,
        lastActiveAt: finishedAt,
        expiresAt: getSessionExpiryAt({
          ...meteredSession,
          lastActiveAt: finishedAt,
        }),
      });

      return updatedExecution;
    }

    const command = await connectOrStartCommand(repository, execution, sandbox);
    const result = await waitForCommandResult(command.handle);
    const finishedAt = new Date().toISOString();
    const runtimeSeconds = getBilledRuntimeSeconds(command.startedAt, finishedAt);
    const sandboxInfo = await sandbox.getInfo().catch(() => null);
    const estimatedCostMicrocents = calculateSandboxUsageCostMicrocents({
      runtimeSeconds,
      usagePriceUsdPerSecond: getSandboxWorkerConfig().sandboxUsagePriceUsdPerSecond,
    });
    const metrics = toMetricsRecord(
      (await sandbox.getMetrics().catch(() => null))?.at(-1) ?? null,
    );
    const currentExecution = await repository.getSandboxExecution(execution.id);
    const nextStatus =
      currentExecution.status === "canceled"
        ? "canceled"
        : result.exitCode === 0
          ? "completed"
          : "failed";

    let meteredSession = session;

    if (billingStatus) {
      meteredSession = await reportSandboxSessionUsage(
        repository,
        meterReporter,
        billingStatus,
        session,
        finishedAt,
        {
          cpuCount: sandboxInfo?.cpuCount,
          memoryMB: sandboxInfo?.memoryMB,
        },
      );
    }

    const updatedExecution = await repository.updateSandboxExecution({
      executionId: execution.id,
      status: nextStatus,
      providerExecutionId: command.providerExecutionId,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      startedAt: command.startedAt,
      finishedAt,
      billedRuntimeSeconds: runtimeSeconds,
      metrics,
      outputs: {
        ...(session.providerSessionId
          ? { providerSessionId: session.providerSessionId }
          : {}),
        ...(command.providerExecutionId
          ? { providerExecutionId: command.providerExecutionId }
          : {}),
        meterSeconds: String(getMeterValueSeconds(runtimeSeconds)),
        ...(sandboxInfo?.cpuCount
          ? { sandboxCpuCount: String(sandboxInfo.cpuCount) }
          : {}),
        ...(sandboxInfo?.memoryMB
          ? { sandboxMemoryMb: String(sandboxInfo.memoryMB) }
          : {}),
        estimatedCostMicrocents: String(estimatedCostMicrocents),
      },
      resultSummary:
        currentExecution.resultSummary ??
        buildResultSummary({
          status: nextStatus,
          result,
          runtimeSeconds,
        }),
      errorMessage: nextStatus === "failed" ? result.error ?? result.stderr : undefined,
      artifact: buildExecutionArtifact({
        execution,
        result,
        runtimeSeconds,
        metrics,
        estimatedCostMicrocents,
        sandboxCpuCount: sandboxInfo?.cpuCount,
        sandboxMemoryMb: sandboxInfo?.memoryMB,
      }),
    });

    await repository.upsertSandboxSession({
      sessionId: meteredSession.id,
      workspaceId: meteredSession.workspaceId,
      agentId: meteredSession.agentId,
      ownerClerkUserId: meteredSession.ownerClerkUserId,
      providerSessionId: meteredSession.providerSessionId,
      status: "ready",
      metadata: meteredSession.metadata,
      startedAt: meteredSession.startedAt,
      lastActiveAt: finishedAt,
      expiresAt: getSessionExpiryAt({
        ...meteredSession,
        lastActiveAt: finishedAt,
      }),
    });

    return updatedExecution;
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = toSandboxProvisioningErrorMessage(error);

    await repository.upsertSandboxSession({
      sessionId: session.id,
      workspaceId: session.workspaceId,
      agentId: session.agentId,
      ownerClerkUserId: session.ownerClerkUserId,
      providerSessionId: session.providerSessionId,
      status: "failed",
      metadata: session.metadata,
      errorMessage: message,
      startedAt: session.startedAt,
      lastActiveAt: finishedAt,
      expiresAt: finishedAt,
    });

    return repository.updateSandboxExecution({
      executionId: execution.id,
      status: "failed",
      finishedAt,
      resultSummary: message,
      errorMessage: message,
    });
  }
}

export async function processSandboxQueue(
  repository: SandboxRepository,
  options?: {
    sandboxManager?: E2BSandboxManager;
    meterReporter?: MeterReporter;
  },
) {
  const sandboxManager = options?.sandboxManager ?? createE2BSandboxManager();
  const meterReporter = options?.meterReporter ?? createStripeMeterReporter();

  await expireStaleSandboxSessions(repository, sandboxManager, meterReporter);

  const executions = sortExecutionsForProcessing(
    (await repository.listSandboxExecutions({})).filter((execution) =>
      activeSandboxStatuses.has(execution.status),
    ),
  );

  return Promise.all(
    executions.map((execution) =>
      processSandboxExecution(
        repository,
        sandboxManager,
        meterReporter,
        execution.id,
      ),
    ),
  );
}
