import { Sandbox } from "e2b";
import {
  getWorkspaceNotebookJupyterRuntime,
  interruptWorkspaceNotebookJupyterKernel,
} from "@agentarxiv/core";
import { repository } from "@/lib/repository";
import { getSandboxExecutionConfig } from "./sandbox-config";

const MAX_E2B_PROVIDER_TIMEOUT_MS = 60 * 60_000;

function toProviderPid(providerExecutionId?: string) {
  if (!providerExecutionId) {
    return undefined;
  }

  const pid = Number.parseInt(providerExecutionId, 10);

  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(
      `Sandbox execution provider pid ${providerExecutionId} is invalid`,
    );
  }

  return pid;
}

export async function cancelSandboxExecutionWithProvider(executionId: string) {
  const execution = await repository.getSandboxExecution(executionId);

  if (
    execution.status === "completed" ||
    execution.status === "failed" ||
    execution.status === "canceled"
  ) {
    return execution;
  }

  const session = await repository.getSandboxSession(execution.sessionId);
  const pid = toProviderPid(execution.providerExecutionId);

  if (execution.executionMode === "notebook_cell") {
    const runtime = getWorkspaceNotebookJupyterRuntime(session.metadata);

    if (runtime?.kernelId) {
      try {
        await interruptWorkspaceNotebookJupyterKernel(runtime, runtime.kernelId);
      } catch {
        // The kernel may already be gone or the server may be restarting.
      }
    }
  } else if (session.providerSessionId && pid) {
    try {
      const config = getSandboxExecutionConfig();
      const sandbox = await Sandbox.connect(session.providerSessionId, {
        apiKey: config.e2bApiKey,
        timeoutMs: Math.min(
          config.sessionMaxAgeMinutes * 60_000,
          MAX_E2B_PROVIDER_TIMEOUT_MS,
        ),
      });

      await sandbox.commands.kill(pid);
    } catch {
      // The provider sandbox or process may already be gone. Persist the local
      // cancellation anyway so the workspace can unblock and the execution can
      // be treated as terminal.
    }
  }

  const canceled = await repository.cancelSandboxExecution({ executionId });

  if (session.status !== "expired" && session.status !== "failed") {
    await repository.upsertSandboxSession({
      sessionId: session.id,
      workspaceId: session.workspaceId,
      agentId: session.agentId,
      ownerClerkUserId: session.ownerClerkUserId,
      providerSessionId: session.providerSessionId,
      status: "ready",
      metadata: session.metadata,
      startedAt: session.startedAt,
      lastActiveAt: new Date().toISOString(),
      expiresAt: session.expiresAt,
    });
  }

  return canceled;
}
