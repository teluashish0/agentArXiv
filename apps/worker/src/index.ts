import { setTimeout as sleep } from "node:timers/promises";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import type { Run, SandboxExecution } from "@agentarxiv/core";
import { getRuntimeRepository } from "@agentarxiv/db";
import { WorkerConfigError, getWorkerProcessConfig } from "./config";
import { processSandboxQueue } from "./sandbox-runtime";

type WorkerRepository = Parameters<typeof processSandboxQueue>[0] & {
  listWorkspaceRuns(): Promise<Run[]>;
};

type WorkerAdvanceResult =
  | {
      workspaceId: string;
      status: "advanced";
      currentStage: string;
      runStatus: string;
    }
  | {
      workspaceId: string;
      status: "blocked" | "failed";
      error: string;
    };

export type WorkerCycleResult = {
  sandboxResults: SandboxExecution[];
  runResults: WorkerAdvanceResult[];
  didWork: boolean;
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isAdvanceBlockedError(error: unknown) {
  return toErrorMessage(error)
    .toLowerCase()
    .includes("waiting on active sandbox executions");
}

function isRetryableWorkerError(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2034"
  ) {
    return true;
  }

  const message = toErrorMessage(error).toLowerCase();
  return message.includes("write conflict") || message.includes("deadlock");
}

async function sleepWithSignal(ms: number, signal: AbortSignal) {
  try {
    await sleep(ms, undefined, { signal });
    return false;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return true;
    }

    throw error;
  }
}

function registerShutdownHandlers(controller: AbortController) {
  const handleSignal = (signal: NodeJS.Signals) => {
    if (controller.signal.aborted) {
      return;
    }

    console.info(`Worker received ${signal}. Shutting down after the current cycle.`);
    controller.abort();
  };

  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);

  return () => {
    process.off("SIGINT", handleSignal);
    process.off("SIGTERM", handleSignal);
  };
}

async function startHealthServer(input: {
  mode: string;
  runAdvancement: boolean;
}) {
  const port = Number.parseInt(process.env.PORT?.trim() || "8080", 10);

  if (!Number.isInteger(port) || port <= 0) {
    throw new WorkerConfigError("PORT must be a positive integer when daemon mode is enabled");
  }

  const server = createServer((request, response) => {
    const pathname = request.url?.split("?")[0] ?? "/";

    if (pathname === "/" || pathname === "/health" || pathname === "/healthz") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          status: "ok",
          service: "agentarxiv-worker",
          mode: input.mode,
          runAdvancement: input.runAdvancement,
          uptimeSeconds: Math.floor(process.uptime()),
        }),
      );
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Not found" }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => {
      server.off("error", reject);
      resolve();
    });
  });

  console.info(`Worker health server listening on port ${port}.`);

  return server;
}

export async function advanceActiveWorkspaceRuns(
  repository: WorkerRepository,
): Promise<WorkerAdvanceResult[]> {
  const runs = await repository.listWorkspaceRuns();
  const activeRuns = runs.filter((run) => run.status === "running");
  const results: WorkerAdvanceResult[] = [];

  for (const run of activeRuns) {
    try {
      const next = await repository.advanceWorkspaceRun(run.workspaceId);
      results.push({
        workspaceId: run.workspaceId,
        status: "advanced",
        currentStage: next.currentStage,
        runStatus: next.status,
      });
    } catch (error) {
      results.push({
        workspaceId: run.workspaceId,
        status: isAdvanceBlockedError(error) ? "blocked" : "failed",
        error: toErrorMessage(error),
      });
    }
  }

  return results;
}

export async function runWorkerCycle(
  repository: WorkerRepository,
  input?: {
    cycleOptions?: Parameters<typeof processSandboxQueue>[1];
    enableRunAdvancement?: boolean;
  },
): Promise<WorkerCycleResult> {
  const sandboxResults = await processSandboxQueue(repository, input?.cycleOptions);
  const runResults = input?.enableRunAdvancement
    ? await advanceActiveWorkspaceRuns(repository)
    : [];

  return {
    sandboxResults,
    runResults,
    didWork:
      sandboxResults.length > 0 ||
      runResults.some((result) => result.status === "advanced"),
  };
}

async function runWorkerCycleWithRetry(
  repository: WorkerRepository,
  input: {
    cycleOptions?: Parameters<typeof processSandboxQueue>[1];
    enableRunAdvancement?: boolean;
    maxCycleRetries: number;
    retryDelayMs: number;
    signal: AbortSignal;
  },
) {
  let attempt = 0;

  while (true) {
    try {
      return await runWorkerCycle(repository, {
        cycleOptions: input.cycleOptions,
        enableRunAdvancement: input.enableRunAdvancement,
      });
    } catch (error) {
      attempt += 1;

      if (!isRetryableWorkerError(error) || attempt > input.maxCycleRetries) {
        throw error;
      }

      console.warn(
        `Worker cycle hit a retryable error (${toErrorMessage(error)}). Retrying ${attempt}/${input.maxCycleRetries}.`,
      );

      const interrupted = await sleepWithSignal(input.retryDelayMs, input.signal);

      if (interrupted) {
        throw error;
      }
    }
  }
}

function logCycleResult(result: WorkerCycleResult) {
  if (result.sandboxResults.length > 0) {
    console.table(
      result.sandboxResults.map((execution) => ({
        executionId: execution.id,
        workspaceId: execution.workspaceId,
        agentId: execution.agentId,
        status: execution.status,
        billedRuntimeSeconds: execution.billedRuntimeSeconds,
      })),
    );
  }

  const noteworthyRunResults = result.runResults.filter(
    (item) => item.status !== "blocked",
  );

  if (noteworthyRunResults.length > 0) {
    console.table(
      noteworthyRunResults.map((item) =>
        item.status === "advanced"
          ? {
              workspaceId: item.workspaceId,
              status: item.status,
              currentStage: item.currentStage,
              runStatus: item.runStatus,
            }
          : {
              workspaceId: item.workspaceId,
              status: item.status,
              error: item.error,
            },
      ),
    );
  }
}

export async function runWorkerProcess(
  repository: WorkerRepository = getRuntimeRepository() as WorkerRepository,
  input?: {
    cycleOptions?: Parameters<typeof processSandboxQueue>[1];
  },
) {
  const processConfig = getWorkerProcessConfig();
  const controller = new AbortController();
  const unregisterSignals = registerShutdownHandlers(controller);
  const healthServer =
    processConfig.mode === "daemon"
      ? await startHealthServer({
          mode: processConfig.mode,
          runAdvancement: processConfig.enableRunAdvancement,
        })
      : null;
  let lastResult: WorkerCycleResult = {
    sandboxResults: [],
    runResults: [],
    didWork: false,
  };

  console.info(
    `Starting worker in ${processConfig.mode} mode (poll=${processConfig.pollIntervalMs}ms, errorBackoff=${processConfig.errorBackoffMs}ms, runAdvancement=${processConfig.enableRunAdvancement}).`,
  );

  try {
    while (!controller.signal.aborted) {
      try {
        lastResult = await runWorkerCycleWithRetry(repository, {
          cycleOptions: input?.cycleOptions,
          enableRunAdvancement: processConfig.enableRunAdvancement,
          maxCycleRetries: processConfig.maxCycleRetries,
          retryDelayMs: processConfig.retryDelayMs,
          signal: controller.signal,
        });
        logCycleResult(lastResult);

        if (processConfig.mode === "once") {
          return lastResult;
        }

        if (lastResult.didWork) {
          continue;
        }
      } catch (error) {
        if (processConfig.mode === "once") {
          throw error;
        }

        console.error("Worker cycle failed:", error);

        const interrupted = await sleepWithSignal(
          processConfig.errorBackoffMs,
          controller.signal,
        );

        if (interrupted) {
          break;
        }

        continue;
      }

      const interrupted = await sleepWithSignal(
        processConfig.pollIntervalMs,
        controller.signal,
      );

      if (interrupted) {
        break;
      }
    }

    return lastResult;
  } finally {
    await new Promise<void>((resolve) => {
      if (!healthServer) {
        resolve();
        return;
      }

      healthServer.close(() => resolve());
    });
    unregisterSignals();
  }
}

function isMainModule() {
  const entrypoint = process.argv[1];

  if (!entrypoint) {
    return false;
  }

  return import.meta.url === pathToFileURL(entrypoint).href;
}

if (isMainModule()) {
  runWorkerProcess().catch((error) => {
    if (error instanceof WorkerConfigError) {
      console.error(`Worker configuration error: ${error.message}`);
    } else {
      console.error(error);
    }

    process.exitCode = 1;
  });
}
