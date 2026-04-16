import { randomUUID } from "node:crypto";
import {
  CommandExitError,
  type CommandResult,
  type Sandbox,
} from "e2b";
import {
  WORKSPACE_NOTEBOOK_JUPYTER_PORT,
  clearWorkspaceNotebookJupyterKernelMetadata,
  ensureWorkspaceNotebookJupyterKernel,
  getWorkspaceNotebookJupyterRuntime,
  normalizeWorkspaceNotebookJupyterServerUrl,
  probeWorkspaceNotebookJupyterServer,
  setWorkspaceNotebookJupyterRuntimeMetadata,
  type SandboxSession,
  type WorkspaceNotebookJupyterRuntime,
} from "@agentarxiv/core";

type WorkerSandbox = Awaited<ReturnType<typeof Sandbox.create>>;

const DEFAULT_NOTEBOOK_PROJECT_ROOT = "/home/user/project";

function toProviderPid(value?: string) {
  if (!value) {
    return undefined;
  }

  const pid = Number.parseInt(value, 10);
  return Number.isInteger(pid) && pid > 0 ? pid : undefined;
}

async function runCommand(
  sandbox: WorkerSandbox,
  command: string,
  timeoutMs: number,
) {
  try {
    return await sandbox.commands.run(command, { timeoutMs });
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

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

export function resolveNotebookProjectRoot(session: SandboxSession) {
  return session.metadata.projectRoot?.trim() || DEFAULT_NOTEBOOK_PROJECT_ROOT;
}

async function ensureJupyterDependencies(
  sandbox: WorkerSandbox,
  timeoutMs: number,
) {
  const checkResult = await runCommand(
    sandbox,
    [
      "python - <<'PY'",
      "import importlib.util, sys",
      "required = ('jupyterlab', 'jupyter_server', 'ipykernel')",
      "missing = [name for name in required if importlib.util.find_spec(name) is None]",
      "sys.exit(1 if missing else 0)",
      "PY",
    ].join("\n"),
    timeoutMs,
  );

  if (checkResult.exitCode === 0) {
    return;
  }

  const installResult = await runCommand(
    sandbox,
    "python -m pip install --quiet --disable-pip-version-check jupyterlab ipykernel",
    timeoutMs,
  );

  if (installResult.exitCode !== 0) {
    throw new Error(
      installResult.stderr.trim() ||
        installResult.error ||
        "Unable to install Jupyter runtime dependencies in the sandbox session.",
    );
  }
}

export async function ensureNotebookJupyterRuntime(
  sandbox: WorkerSandbox,
  session: SandboxSession,
  timeoutMs: number,
): Promise<{
  runtime: WorkspaceNotebookJupyterRuntime;
  metadata: Record<string, string>;
}> {
  const existingRuntime = getWorkspaceNotebookJupyterRuntime(session.metadata);

  if (existingRuntime && (await probeWorkspaceNotebookJupyterServer(existingRuntime))) {
    return {
      runtime: existingRuntime,
      metadata: session.metadata,
    };
  }

  await ensureJupyterDependencies(sandbox, timeoutMs);
  const projectRoot = resolveNotebookProjectRoot(session);
  const ensureProjectRootResult = await runCommand(
    sandbox,
    `mkdir -p ${shellQuote(projectRoot)}`,
    timeoutMs,
  );

  if (ensureProjectRootResult.exitCode !== 0) {
    throw new Error(
      ensureProjectRootResult.stderr.trim() ||
        ensureProjectRootResult.error ||
        `Unable to prepare notebook project root at ${projectRoot}.`,
    );
  }

  const existingServerPid = toProviderPid(existingRuntime?.serverPid);
  if (existingServerPid) {
    try {
      await sandbox.commands.kill(existingServerPid);
    } catch {
      // The prior server may already be gone.
    }
  }

  const token = existingRuntime?.serverToken ?? randomUUID().replace(/-/g, "");
  const serverHandle = await sandbox.commands.run(
    [
      "python -m jupyter server",
      "--ServerApp.allow_origin='*'",
      "--ServerApp.allow_remote_access=True",
      "--ServerApp.disable_check_xsrf=True",
      "--ServerApp.password=''",
      `--ServerApp.token='${token}'`,
      "--ContentsManager.allow_hidden=True",
      `--ServerApp.root_dir=${shellQuote(projectRoot)}`,
      "--no-browser",
      "--ip=0.0.0.0",
      `--port=${WORKSPACE_NOTEBOOK_JUPYTER_PORT}`,
    ].join(" "),
    {
      background: true,
      timeoutMs,
    },
  );

  const serverUrl = normalizeWorkspaceNotebookJupyterServerUrl(
    sandbox.getHost(WORKSPACE_NOTEBOOK_JUPYTER_PORT),
  );
  const runtime: WorkspaceNotebookJupyterRuntime = {
    serverUrl,
    serverToken: token,
    serverPid: String(serverHandle.pid),
    serverPort: WORKSPACE_NOTEBOOK_JUPYTER_PORT,
  };

  const deadline = Date.now() + Math.min(timeoutMs, 60_000);
  while (Date.now() < deadline) {
    if (await probeWorkspaceNotebookJupyterServer(runtime)) {
      return {
        runtime,
        metadata: setWorkspaceNotebookJupyterRuntimeMetadata(
          clearWorkspaceNotebookJupyterKernelMetadata(session.metadata),
          runtime,
        ),
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error("The Jupyter server did not become ready before the startup timeout elapsed.");
}

export async function ensureNotebookJupyterKernelRuntime(
  sandbox: WorkerSandbox,
  session: SandboxSession,
  leaseSequence: number,
  timeoutMs: number,
): Promise<{
  runtime: WorkspaceNotebookJupyterRuntime & { kernelId: string };
  metadata: Record<string, string>;
}> {
  const { runtime, metadata } = await ensureNotebookJupyterRuntime(
    sandbox,
    session,
    timeoutMs,
  );
  const currentKernelId = runtime.kernelId;
  const kernelId = await ensureWorkspaceNotebookJupyterKernel(runtime, {
    kernelId: currentKernelId,
    restart:
      runtime.kernelLeaseSequence !== undefined &&
      runtime.kernelLeaseSequence !== leaseSequence,
  });

  const nextRuntime: WorkspaceNotebookJupyterRuntime & { kernelId: string } = {
    ...runtime,
    kernelId,
    kernelLeaseSequence: leaseSequence,
  };

  return {
    runtime: nextRuntime,
    metadata: setWorkspaceNotebookJupyterRuntimeMetadata(metadata, nextRuntime),
  };
}
