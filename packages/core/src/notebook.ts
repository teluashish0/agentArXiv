import type {
  WorkspaceNotebook,
  WorkspaceNotebookCell,
  WorkspaceNotebookCellOutput,
  WorkspaceNotebookDocument,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toNotebookSource(source: string | string[]) {
  return Array.isArray(source)
    ? source
    : source.split(/\r?\n/).map((line, index, lines) => {
        if (index < lines.length - 1) {
          return `${line}\n`;
        }

        return line;
      });
}

export function getWorkspaceNotebookCellSource(cell: WorkspaceNotebookCell) {
  return cell.source.join("");
}

export const WORKSPACE_NOTEBOOK_JUPYTER_PORT = 8888;

export const WORKSPACE_NOTEBOOK_JUPYTER_METADATA_KEYS = {
  serverUrl: "agentarxiv_jupyter_server_url",
  serverToken: "agentarxiv_jupyter_server_token",
  serverPid: "agentarxiv_jupyter_server_pid",
  serverPort: "agentarxiv_jupyter_server_port",
  kernelId: "agentarxiv_jupyter_kernel_id",
  kernelLeaseSequence: "agentarxiv_jupyter_kernel_lease_sequence",
} as const;

export type WorkspaceNotebookJupyterRuntime = {
  serverUrl: string;
  serverToken: string;
  serverPid?: string;
  serverPort?: number;
  kernelId?: string;
  kernelLeaseSequence?: number;
};

type JupyterKernelMessage = {
  channel?: string;
  header?: {
    msg_type?: string;
  };
  parent_header?: {
    msg_id?: string;
  };
  content?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

function normalizeNotebookTextContent(value: unknown) {
  if (typeof value === "string") {
    return toNotebookSource(value);
  }

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  return undefined;
}

function normalizeNotebookOutputArtifactId(
  output: WorkspaceNotebookCellOutput,
  metadata: Record<string, unknown>,
) {
  if (typeof output.artifactId === "string" && output.artifactId.trim()) {
    return output.artifactId.trim();
  }

  const agentarxivMetadata =
    typeof metadata.agentarxiv === "object" && metadata.agentarxiv !== null
      ? (metadata.agentarxiv as Record<string, unknown>)
      : undefined;

  return typeof agentarxivMetadata?.artifactId === "string" &&
    agentarxivMetadata.artifactId.trim()
    ? agentarxivMetadata.artifactId.trim()
    : undefined;
}

export function buildWorkspaceNotebookOutputId(
  executionId: string,
  index: number,
) {
  return `nout_${executionId}_${index + 1}`;
}

export function ensureWorkspaceNotebookOutputIds(
  outputs: WorkspaceNotebookCellOutput[],
  executionId: string,
  persistedAt?: string,
) {
  return outputs.map((output, index) => {
    const metadata =
      typeof output.metadata === "object" && output.metadata !== null
        ? { ...output.metadata }
        : {};
    const agentarxivMetadata =
      typeof metadata.agentarxiv === "object" && metadata.agentarxiv !== null
        ? { ...(metadata.agentarxiv as Record<string, unknown>) }
        : {};
    const id =
      typeof output.id === "string" && output.id.trim()
        ? output.id.trim()
        : buildWorkspaceNotebookOutputId(executionId, index);

    return {
      ...output,
      id,
      artifactId: normalizeNotebookOutputArtifactId(output, metadata),
      metadata: {
        ...metadata,
        agentarxiv: {
          ...agentarxivMetadata,
          executionId,
          outputId: id,
          ...(persistedAt ? { persistedAt } : {}),
        },
      },
    } satisfies WorkspaceNotebookCellOutput;
  });
}

export function buildWorkspaceNotebookStreamText(
  outputs: WorkspaceNotebookCellOutput[],
) {
  return outputs
    .filter((output) => output.output_type === "stream")
    .map((output) => output.text?.join("") ?? "")
    .join("");
}

export function buildWorkspaceNotebookNamedStreamText(
  outputs: WorkspaceNotebookCellOutput[],
  streamName: "stdout" | "stderr",
) {
  return outputs
    .filter(
      (output) =>
        output.output_type === "stream" &&
        output.name === streamName &&
        Array.isArray(output.text),
    )
    .map((output) => output.text?.join("") ?? "")
    .join("");
}

export function normalizeWorkspaceNotebookCellOutputs(
  outputs: WorkspaceNotebookCellOutput[],
) {
  return outputs.map((output) => ({
    ...output,
    text: normalizeNotebookTextContent(output.text),
    data:
      typeof output.data === "object" && output.data !== null
        ? { ...output.data }
        : undefined,
    metadata:
      typeof output.metadata === "object" && output.metadata !== null
        ? { ...output.metadata }
        : undefined,
    traceback: Array.isArray(output.traceback)
      ? output.traceback.filter(
          (line): line is string => typeof line === "string",
        )
      : undefined,
  }));
}

export function normalizeWorkspaceNotebookJupyterServerUrl(value: string) {
  const normalizedValue = value.trim().replace(/\/$/, "");

  if (!normalizedValue) {
    throw new Error("A Jupyter server URL is required.");
  }

  return /^https?:\/\//i.test(normalizedValue)
    ? normalizedValue
    : `https://${normalizedValue}`;
}

function createJupyterRequestUrl(
  runtime: Pick<WorkspaceNotebookJupyterRuntime, "serverToken" | "serverUrl">,
  pathname: string,
  searchParams?: Record<string, string | undefined>,
) {
  const url = new URL(
    pathname,
    `${normalizeWorkspaceNotebookJupyterServerUrl(runtime.serverUrl)}/`,
  );
  url.searchParams.set("token", runtime.serverToken);

  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (typeof value === "string" && value) {
      url.searchParams.set(key, value);
    }
  }

  return url;
}

function buildJupyterRequestHeaders(
  runtime: Pick<WorkspaceNotebookJupyterRuntime, "serverToken">,
  init?: HeadersInit,
) {
  const headers = new Headers(init);
  headers.set("authorization", `token ${runtime.serverToken}`);
  return headers;
}

async function requestJupyterJson<T>(
  runtime: Pick<WorkspaceNotebookJupyterRuntime, "serverToken" | "serverUrl">,
  pathname: string,
  init?: RequestInit,
) {
  const headers = buildJupyterRequestHeaders(runtime, init?.headers);
  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(createJupyterRequestUrl(runtime, pathname), {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new Error(
      `Jupyter request failed for ${pathname} with status ${response.status}.`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function getWorkspaceNotebookJupyterRuntime(
  metadata: Record<string, string>,
) {
  const serverUrl =
    metadata[WORKSPACE_NOTEBOOK_JUPYTER_METADATA_KEYS.serverUrl];
  const serverToken =
    metadata[WORKSPACE_NOTEBOOK_JUPYTER_METADATA_KEYS.serverToken];

  if (!serverUrl || !serverToken) {
    return null;
  }

  const serverPort = Number.parseInt(
    metadata[WORKSPACE_NOTEBOOK_JUPYTER_METADATA_KEYS.serverPort] ?? "",
    10,
  );
  const kernelLeaseSequence = Number.parseInt(
    metadata[WORKSPACE_NOTEBOOK_JUPYTER_METADATA_KEYS.kernelLeaseSequence] ??
      "",
    10,
  );

  return {
    serverUrl,
    serverToken,
    serverPid: metadata[WORKSPACE_NOTEBOOK_JUPYTER_METADATA_KEYS.serverPid],
    serverPort: Number.isFinite(serverPort) ? serverPort : undefined,
    kernelId: metadata[WORKSPACE_NOTEBOOK_JUPYTER_METADATA_KEYS.kernelId],
    kernelLeaseSequence: Number.isFinite(kernelLeaseSequence)
      ? kernelLeaseSequence
      : undefined,
  } satisfies WorkspaceNotebookJupyterRuntime;
}

export function setWorkspaceNotebookJupyterRuntimeMetadata(
  metadata: Record<string, string>,
  runtime: Partial<WorkspaceNotebookJupyterRuntime>,
) {
  const nextMetadata = { ...metadata };

  if (typeof runtime.serverUrl === "string") {
    nextMetadata[WORKSPACE_NOTEBOOK_JUPYTER_METADATA_KEYS.serverUrl] =
      runtime.serverUrl;
  }

  if (typeof runtime.serverToken === "string") {
    nextMetadata[WORKSPACE_NOTEBOOK_JUPYTER_METADATA_KEYS.serverToken] =
      runtime.serverToken;
  }

  if (typeof runtime.serverPid === "string") {
    nextMetadata[WORKSPACE_NOTEBOOK_JUPYTER_METADATA_KEYS.serverPid] =
      runtime.serverPid;
  }

  if (typeof runtime.serverPort === "number") {
    nextMetadata[WORKSPACE_NOTEBOOK_JUPYTER_METADATA_KEYS.serverPort] = String(
      runtime.serverPort,
    );
  }

  if (typeof runtime.kernelId === "string") {
    nextMetadata[WORKSPACE_NOTEBOOK_JUPYTER_METADATA_KEYS.kernelId] =
      runtime.kernelId;
  }

  if (typeof runtime.kernelLeaseSequence === "number") {
    nextMetadata[WORKSPACE_NOTEBOOK_JUPYTER_METADATA_KEYS.kernelLeaseSequence] =
      String(runtime.kernelLeaseSequence);
  }

  return nextMetadata;
}

export function clearWorkspaceNotebookJupyterKernelMetadata(
  metadata: Record<string, string>,
) {
  const nextMetadata = { ...metadata };
  delete nextMetadata[WORKSPACE_NOTEBOOK_JUPYTER_METADATA_KEYS.kernelId];
  delete nextMetadata[
    WORKSPACE_NOTEBOOK_JUPYTER_METADATA_KEYS.kernelLeaseSequence
  ];
  return nextMetadata;
}

export async function probeWorkspaceNotebookJupyterServer(
  runtime: Pick<WorkspaceNotebookJupyterRuntime, "serverToken" | "serverUrl">,
) {
  try {
    await requestJupyterJson(runtime, "/api");
    return true;
  } catch {
    return false;
  }
}

export async function createWorkspaceNotebookJupyterKernel(
  runtime: Pick<WorkspaceNotebookJupyterRuntime, "serverToken" | "serverUrl">,
  kernelName = "python3",
) {
  const kernel = await requestJupyterJson<{ id: string }>(
    runtime,
    "/api/kernels",
    {
      method: "POST",
      body: JSON.stringify({ name: kernelName }),
    },
  );

  return kernel.id;
}

export async function probeWorkspaceNotebookJupyterKernel(
  runtime: Pick<WorkspaceNotebookJupyterRuntime, "serverToken" | "serverUrl">,
  kernelId: string,
) {
  try {
    await requestJupyterJson(
      runtime,
      `/api/kernels/${encodeURIComponent(kernelId)}`,
    );
    return true;
  } catch {
    return false;
  }
}

export async function ensureWorkspaceNotebookJupyterKernel(
  runtime: Pick<WorkspaceNotebookJupyterRuntime, "serverToken" | "serverUrl">,
  input?: {
    kernelId?: string;
    kernelName?: string;
    restart?: boolean;
  },
) {
  if (input?.kernelId && !input.restart) {
    const kernelExists = await probeWorkspaceNotebookJupyterKernel(
      runtime,
      input.kernelId,
    );

    if (kernelExists) {
      return input.kernelId;
    }
  }

  if (input?.kernelId) {
    await shutdownWorkspaceNotebookJupyterKernel(runtime, input.kernelId);
  }

  return createWorkspaceNotebookJupyterKernel(
    runtime,
    input?.kernelName ?? "python3",
  );
}

export async function shutdownWorkspaceNotebookJupyterKernel(
  runtime: Pick<WorkspaceNotebookJupyterRuntime, "serverToken" | "serverUrl">,
  kernelId: string,
) {
  try {
    await requestJupyterJson(
      runtime,
      `/api/kernels/${encodeURIComponent(kernelId)}`,
      {
        method: "DELETE",
      },
    );
  } catch {
    // The kernel may already be gone.
  }
}

export async function interruptWorkspaceNotebookJupyterKernel(
  runtime: Pick<WorkspaceNotebookJupyterRuntime, "serverToken" | "serverUrl">,
  kernelId: string,
) {
  await requestJupyterJson(
    runtime,
    `/api/kernels/${encodeURIComponent(kernelId)}/interrupt`,
    {
      method: "POST",
    },
  );
}

function toWorkspaceNotebookCellOutput(
  output: Record<string, unknown>,
): WorkspaceNotebookCellOutput | null {
  const outputType =
    typeof output.output_type === "string" ? output.output_type : undefined;

  if (!outputType) {
    return null;
  }

  if (outputType === "stream") {
    return {
      id: "",
      output_type: "stream",
      name: typeof output.name === "string" ? output.name : undefined,
      text: normalizeNotebookTextContent(output.text),
      metadata:
        typeof output.metadata === "object" && output.metadata !== null
          ? { ...(output.metadata as Record<string, unknown>) }
          : undefined,
    };
  }

  if (outputType === "display_data" || outputType === "execute_result") {
    return {
      id: "",
      output_type: outputType,
      data:
        typeof output.data === "object" && output.data !== null
          ? { ...(output.data as Record<string, unknown>) }
          : undefined,
      metadata:
        typeof output.metadata === "object" && output.metadata !== null
          ? { ...(output.metadata as Record<string, unknown>) }
          : undefined,
    };
  }

  if (outputType === "error") {
    return {
      id: "",
      output_type: "error",
      ename: typeof output.ename === "string" ? output.ename : undefined,
      evalue: typeof output.evalue === "string" ? output.evalue : undefined,
      traceback: Array.isArray(output.traceback)
        ? output.traceback.filter(
            (line): line is string => typeof line === "string",
          )
        : undefined,
    };
  }

  return {
    id: "",
    output_type: outputType,
    metadata:
      typeof output.metadata === "object" && output.metadata !== null
        ? { ...(output.metadata as Record<string, unknown>) }
        : undefined,
  };
}

export async function executeWorkspaceNotebookJupyterCode(
  runtime: Pick<
    WorkspaceNotebookJupyterRuntime,
    "serverToken" | "serverUrl"
  > & {
    kernelId: string;
  },
  input: {
    code: string;
    timeoutMs?: number;
  },
) {
  const outputs: WorkspaceNotebookCellOutput[] = [];
  const executeMessageId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const wsUrl = createJupyterRequestUrl(
    runtime,
    `/api/kernels/${encodeURIComponent(runtime.kernelId)}/channels`,
    {
      session_id: sessionId,
    },
  )
    .toString()
    .replace(/^http/i, "ws");

  let executionCount: number | null = null;
  let replyStatus = "ok";
  let settled = false;

  return await new Promise<{
    executionCount: number | null;
    outputs: WorkspaceNotebookCellOutput[];
    replyStatus: string;
    stdout: string;
    stderr: string;
  }>((resolve, reject) => {
    const websocket = new WebSocket(wsUrl);
    const timeoutId = globalThis.setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      websocket.close();
      reject(
        new Error(
          "Timed out while waiting for the Jupyter kernel execution to finish.",
        ),
      );
    }, input.timeoutMs ?? 900_000);

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      globalThis.clearTimeout(timeoutId);
      callback();
    };

    websocket.addEventListener("error", () => {
      finish(() => {
        reject(new Error("Unable to connect to the Jupyter kernel channel."));
      });
    });

    websocket.addEventListener("open", () => {
      websocket.send(
        JSON.stringify({
          channel: "shell",
          header: {
            date: new Date().toISOString(),
            msg_id: executeMessageId,
            msg_type: "execute_request",
            session: sessionId,
            username: "agentarxiv",
            version: "5.3",
          },
          metadata: {},
          parent_header: {},
          content: {
            code: input.code,
            silent: false,
            store_history: true,
            user_expressions: {},
            allow_stdin: false,
            stop_on_error: true,
          },
        }),
      );
    });

    websocket.addEventListener("message", (event) => {
      let message: JupyterKernelMessage;

      try {
        message = JSON.parse(String(event.data)) as JupyterKernelMessage;
      } catch {
        return;
      }

      if (message.parent_header?.msg_id !== executeMessageId) {
        return;
      }

      const content =
        typeof message.content === "object" && message.content !== null
          ? message.content
          : {};

      if (
        message.channel === "shell" &&
        message.header?.msg_type === "execute_reply"
      ) {
        replyStatus =
          typeof content.status === "string" ? content.status : replyStatus;
        executionCount =
          typeof content.execution_count === "number"
            ? content.execution_count
            : executionCount;
        return;
      }

      if (message.channel !== "iopub") {
        return;
      }

      switch (message.header?.msg_type) {
        case "execute_input": {
          executionCount =
            typeof content.execution_count === "number"
              ? content.execution_count
              : executionCount;
          return;
        }
        case "stream":
        case "display_data":
        case "execute_result":
        case "error": {
          const output = toWorkspaceNotebookCellOutput({
            ...content,
            metadata:
              typeof message.metadata === "object" && message.metadata !== null
                ? message.metadata
                : content.metadata,
            output_type:
              message.header.msg_type === "execute_result"
                ? "execute_result"
                : message.header.msg_type,
          });

          if (output) {
            outputs.push(output);
          }
          return;
        }
        case "clear_output": {
          outputs.length = 0;
          return;
        }
        case "status": {
          if (content.execution_state !== "idle") {
            return;
          }

          finish(() => {
            websocket.close();
            const normalizedOutputs =
              normalizeWorkspaceNotebookCellOutputs(outputs);
            resolve({
              executionCount,
              outputs: normalizedOutputs,
              replyStatus,
              stdout: buildWorkspaceNotebookNamedStreamText(
                normalizedOutputs,
                "stdout",
              ),
              stderr:
                buildWorkspaceNotebookNamedStreamText(
                  normalizedOutputs,
                  "stderr",
                ) ||
                normalizedOutputs
                  .filter((output) => output.output_type === "error")
                  .map((output) =>
                    [output.ename, output.evalue, ...(output.traceback ?? [])]
                      .filter(Boolean)
                      .join("\n"),
                  )
                  .join("\n\n"),
            });
          });
          return;
        }
        default:
          return;
      }
    });
  });
}

export function createWorkspaceNotebookCell(input: {
  id: string;
  type?: WorkspaceNotebookCell["cell_type"];
  source?: string | string[];
  metadata?: Record<string, unknown>;
}): WorkspaceNotebookCell {
  return {
    id: input.id,
    cell_type: input.type ?? "markdown",
    source: toNotebookSource(input.source ?? ""),
    metadata: input.metadata ?? {},
    execution_count: input.type === "code" ? null : undefined,
    outputs: input.type === "code" ? [] : undefined,
  };
}

const WORKSPACE_NOTEBOOK_OVERVIEW_SOURCE = [
  "# Experiments\n\n",
  "Use this notebook to capture reproducible runtime experiments, outputs, and evidence for the workspace.\n",
] as const;

function createWorkspaceNotebookStarterCell(workspaceId: string) {
  return createWorkspaceNotebookCell({
    id: `cell_${workspaceId}_starter`,
    type: "code",
    source: [
      "workspace_id = ",
      JSON.stringify(workspaceId),
      "\n",
      'print(f"Notebook ready for {workspace_id}")\n',
    ],
    metadata: {
      agentarxiv: {
        starter: true,
      },
    },
  });
}

function isDefaultWorkspaceNotebookOverviewCell(
  cell: WorkspaceNotebookCell,
  workspaceId: string,
) {
  return (
    cell.id === `cell_${workspaceId}_overview` &&
    cell.cell_type === "markdown" &&
    cell.source.join("") === WORKSPACE_NOTEBOOK_OVERVIEW_SOURCE.join("")
  );
}

export function ensureWorkspaceNotebookDocumentDefaults(
  document: WorkspaceNotebookDocument,
  workspaceId: string,
) {
  const overviewCellId = `cell_${workspaceId}_overview`;
  const starterCellId = `cell_${workspaceId}_starter`;
  const normalizedCells = document.cells.filter(
    (cell) => !isDefaultWorkspaceNotebookOverviewCell(cell, workspaceId),
  );
  const removedGeneratedOverviewCell =
    normalizedCells.length !== document.cells.length;
  const hasStarterCell = normalizedCells.some((cell) => {
    if (cell.id === starterCellId) {
      return true;
    }

    if (!isRecord(cell.metadata.agentarxiv)) {
      return false;
    }

    return cell.metadata.agentarxiv.starter === true;
  });
  const notebookMetadata = isRecord(document.metadata) ? document.metadata : {};
  const agentarxivMetadata = isRecord(notebookMetadata.agentarxiv)
    ? notebookMetadata.agentarxiv
    : {};
  const metadataNeedsWorkspaceId =
    agentarxivMetadata.workspaceId !== workspaceId;

  if (
    !metadataNeedsWorkspaceId &&
    !removedGeneratedOverviewCell &&
    hasStarterCell
  ) {
    return document;
  }

  const nextDocument: WorkspaceNotebookDocument = {
    ...document,
    metadata: {
      ...notebookMetadata,
      agentarxiv: {
        ...agentarxivMetadata,
        workspaceId,
      },
    },
    cells: [...normalizedCells],
  };

  if (!hasStarterCell) {
    const overviewIndex = nextDocument.cells.findIndex(
      (cell) => cell.id === overviewCellId,
    );
    const starterCell = createWorkspaceNotebookStarterCell(workspaceId);

    if (overviewIndex >= 0) {
      nextDocument.cells.splice(overviewIndex + 1, 0, starterCell);
    } else {
      nextDocument.cells.unshift(starterCell);
    }
  }

  return nextDocument;
}

export function createEmptyWorkspaceNotebookDocument(
  workspaceId: string,
): WorkspaceNotebookDocument {
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: {
        display_name: "Python 3",
        language: "python",
        name: "python3",
      },
      language_info: {
        name: "python",
        version: "3.x",
      },
      agentarxiv: {
        workspaceId,
      },
    },
    cells: [createWorkspaceNotebookStarterCell(workspaceId)],
  };
}

export function createEmptyWorkspaceNotebook(
  workspaceId: string,
): WorkspaceNotebook {
  const now = new Date().toISOString();

  return {
    id: `notebook_${workspaceId}`,
    workspaceId,
    currentRevision: 1,
    document: createEmptyWorkspaceNotebookDocument(workspaceId),
    createdAt: now,
    updatedAt: now,
  };
}
