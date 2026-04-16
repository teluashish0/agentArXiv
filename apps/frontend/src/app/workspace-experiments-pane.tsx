"use client";

import Image from "next/image";
import type {
  WorkspaceNotebookCellReference,
  WorkspaceNotebookOutputReference,
  WorkspaceReference,
} from "@agentarxiv/core";
import type { INotebookProps } from "@datalayer/jupyter-react/notebook";
import type { IJupyterLabThemeProps } from "@datalayer/jupyter-react/theme";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type PropsWithChildren,
} from "react";
import type { WorkspaceClientModel } from "./workspace/workspace-view-model";
import { createWorkspaceNotebookServiceManager } from "../lib/workspace-jupyter-service-manager";

type NotebookComponentType = ComponentType<PropsWithChildren<INotebookProps>>;
type NotebookThemeComponentType = ComponentType<
  PropsWithChildren<IJupyterLabThemeProps>
>;

type NotebookRuntime = {
  Notebook: NotebookComponentType;
  JupyterReactTheme: NotebookThemeComponentType;
};

function NotebookThemeFallback({ children }: PropsWithChildren<object>) {
  return <>{children}</>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getCellAgentArxivMetadata(
  cell: WorkspaceClientModel["notebook"]["document"]["cells"][number],
) {
  return isRecord(cell.metadata.agentarxiv)
    ? (cell.metadata.agentarxiv as Record<string, unknown>)
    : {};
}

function getOutputAgentArxivMetadata(
  output: NonNullable<
    WorkspaceClientModel["notebook"]["document"]["cells"][number]["outputs"]
  >[number],
) {
  return isRecord(output.metadata?.agentarxiv)
    ? (output.metadata?.agentarxiv as Record<string, unknown>)
    : {};
}

function getTrimmedFirstLine(source: string[]) {
  return source
    .join("")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}

function summarizeText(value: string, maxLength = 160) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return undefined;
  }

  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function summarizeBlock(value: string, maxLength = 1200) {
  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  return trimmed.length <= maxLength
    ? trimmed
    : `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

function getJoinedStringValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .join("");
  }

  return undefined;
}

function getOutputMimeType(
  output: NonNullable<
    WorkspaceClientModel["notebook"]["document"]["cells"][number]["outputs"]
  >[number],
) {
  if (!isRecord(output.data)) {
    return undefined;
  }

  const preferredMimeTypes = [
    "image/png",
    "image/jpeg",
    "image/svg+xml",
    "text/html",
    "application/json",
    "text/plain",
  ];

  for (const mimeType of preferredMimeTypes) {
    if (mimeType in output.data) {
      return mimeType;
    }
  }

  return Object.keys(output.data)[0];
}

function getOutputExcerpt(
  output: NonNullable<
    WorkspaceClientModel["notebook"]["document"]["cells"][number]["outputs"]
  >[number],
) {
  if (output.output_type === "stream" && output.text?.length) {
    return summarizeText(output.text.join(""));
  }

  if (output.output_type === "error") {
    return summarizeText(
      output.traceback?.join("\n") ||
        output.evalue ||
        output.ename ||
        "Execution error",
    );
  }

  if (isRecord(output.data)) {
    const textPlain = output.data["text/plain"];

    if (typeof textPlain === "string") {
      return summarizeText(textPlain);
    }

    if (Array.isArray(textPlain)) {
      return summarizeText(
        textPlain
          .filter((item): item is string => typeof item === "string")
          .join(""),
      );
    }
  }

  return undefined;
}

function getOutputPreviewText(
  output: NonNullable<
    WorkspaceClientModel["notebook"]["document"]["cells"][number]["outputs"]
  >[number],
) {
  if (output.output_type === "stream" && output.text?.length) {
    return summarizeBlock(output.text.join(""));
  }

  if (output.output_type === "error") {
    return summarizeBlock(
      output.traceback?.join("\n") ||
        output.evalue ||
        output.ename ||
        "Execution error",
    );
  }

  if (isRecord(output.data)) {
    const textPlain = getJoinedStringValue(output.data["text/plain"]);

    if (textPlain) {
      return summarizeBlock(textPlain);
    }

    const jsonValue = output.data["application/json"];

    if (typeof jsonValue === "string") {
      return summarizeBlock(jsonValue);
    }

    if (jsonValue !== undefined) {
      return summarizeBlock(JSON.stringify(jsonValue, null, 2));
    }
  }

  return undefined;
}

function getOutputPreviewImageSrc(
  output: NonNullable<
    WorkspaceClientModel["notebook"]["document"]["cells"][number]["outputs"]
  >[number],
) {
  if (!isRecord(output.data)) {
    return undefined;
  }

  const png = getJoinedStringValue(output.data["image/png"]);

  if (png) {
    return `data:image/png;base64,${png.replace(/\s+/g, "")}`;
  }

  const jpeg = getJoinedStringValue(output.data["image/jpeg"]);

  if (jpeg) {
    return `data:image/jpeg;base64,${jpeg.replace(/\s+/g, "")}`;
  }

  const svg = getJoinedStringValue(output.data["image/svg+xml"]);

  if (svg) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  return undefined;
}

function formatExecutionStatus(value: unknown, fallback: string) {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  const normalized = value.replace(/[_-]+/g, " ").trim();

  if (!normalized) {
    return fallback;
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatCellTypeLabel(
  cell: WorkspaceClientModel["notebook"]["document"]["cells"][number],
  cellIndex: number,
) {
  const prefix =
    cell.cell_type === "code"
      ? "Code"
      : cell.cell_type === "markdown"
        ? "Markdown"
        : "Raw";

  return `${prefix} cell ${cellIndex + 1}`;
}

function buildNotebookCellReference(
  workspace: WorkspaceClientModel,
  cell: WorkspaceClientModel["notebook"]["document"]["cells"][number],
): WorkspaceNotebookCellReference {
  const firstLine = getTrimmedFirstLine(cell.source);
  const title =
    summarizeText(
      firstLine ?? `${cell.cell_type === "code" ? "Code" : "Notebook"} cell`,
      90,
    ) ?? "Notebook cell";

  return {
    kind: "notebook_cell",
    notebookId: workspace.notebook.id,
    cellId: cell.id,
    cellType: cell.cell_type,
    title,
    excerpt:
      firstLine && firstLine !== title
        ? summarizeText(firstLine, 180)
        : undefined,
  };
}

function buildNotebookOutputReference(
  workspace: WorkspaceClientModel,
  cell: WorkspaceClientModel["notebook"]["document"]["cells"][number],
  output: NonNullable<
    WorkspaceClientModel["notebook"]["document"]["cells"][number]["outputs"]
  >[number],
  outputIndex: number,
): WorkspaceNotebookOutputReference | null {
  const cellMetadata = getCellAgentArxivMetadata(cell);
  const outputMetadata = getOutputAgentArxivMetadata(output);
  const executionId =
    typeof outputMetadata.executionId === "string"
      ? outputMetadata.executionId
      : typeof cellMetadata.lastExecutionId === "string"
        ? cellMetadata.lastExecutionId
        : undefined;

  if (!executionId) {
    return null;
  }

  const mimeType = getOutputMimeType(output);
  const title = summarizeText(
    `${mimeType?.startsWith("image/") ? "Image" : "Output"} ${outputIndex + 1} · ${
      getTrimmedFirstLine(cell.source) ?? cell.id
    }`,
    90,
  );

  return {
    kind: "notebook_output",
    notebookId: workspace.notebook.id,
    cellId: cell.id,
    executionId,
    outputId: output.id,
    mimeType,
    artifactId: output.artifactId,
    title: title ?? `Output ${outputIndex + 1}`,
    excerpt: getOutputExcerpt(output),
  };
}

function formatExecutionDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsedDate);
}

function normalizeNotebookDocument(
  document: WorkspaceClientModel["notebook"]["document"],
) {
  return {
    ...document,
    cells: document.cells.map((cell, cellIndex) => {
      const normalizedCellId =
        typeof cell.id === "string" && cell.id.trim()
          ? cell.id
          : `workspace-cell-${cellIndex + 1}`;

      return {
        ...cell,
        id: normalizedCellId,
        outputs: cell.outputs?.map((output, outputIndex) => ({
          ...output,
          id:
            typeof output.id === "string" && output.id.trim()
              ? output.id
              : `${normalizedCellId}-output-${outputIndex + 1}`,
        })),
      };
    }),
  };
}

function syncExecutionBadges(
  cellElement: HTMLElement,
  cell: WorkspaceClientModel["notebook"]["document"]["cells"][number],
  agentsById: Map<string, WorkspaceClientModel["agents"][number]>,
) {
  const existingHost = cellElement.querySelector<HTMLElement>(
    ".workspace-jupyter-inline-meta",
  );

  if (cell.cell_type !== "code") {
    existingHost?.remove();
    return;
  }

  const metadata = getCellAgentArxivMetadata(cell);
  const executingAgentId =
    typeof metadata.lastExecutingAgentId === "string"
      ? metadata.lastExecutingAgentId
      : undefined;
  const executingAgent = executingAgentId
    ? agentsById.get(executingAgentId)
    : undefined;
  const executedAtLabel =
    formatExecutionDate(metadata.lastExecutedAt) ?? "Not run";

  let host = existingHost;

  if (!host) {
    host = document.createElement("div");
    host.className = "workspace-jupyter-inline-meta";
    host.innerHTML = `
      <span class="workspace-jupyter-cell-chip" data-chip="agent"></span>
      <span class="workspace-jupyter-cell-chip workspace-jupyter-cell-chip-muted" data-chip="date"></span>
    `;

    const inputWrapper = cellElement.querySelector(".jp-Cell-inputWrapper");
    cellElement.insertBefore(host, inputWrapper ?? cellElement.firstChild);
  }

  const agentChip = host.querySelector<HTMLElement>('[data-chip="agent"]');
  const dateChip = host.querySelector<HTMLElement>('[data-chip="date"]');

  if (agentChip) {
    agentChip.textContent = executingAgent?.name ?? "No execution";
  }

  if (dateChip) {
    dateChip.textContent = executedAtLabel;
  }
}

export function WorkspaceExperimentsPane({
  workspace,
  onReferenceCapture,
}: {
  workspace: WorkspaceClientModel;
  onReferenceCapture: (reference: WorkspaceReference) => void;
}) {
  const serviceManager = useMemo(
    () => createWorkspaceNotebookServiceManager(),
    [],
  );
  const notebookShellRef = useRef<HTMLDivElement | null>(null);
  const notebookFrameRef = useRef<HTMLDivElement | null>(null);
  const [notebookHeight, setNotebookHeight] = useState(0);
  const [notebookRuntime, setNotebookRuntime] = useState<NotebookRuntime | null>(null);
  const [notebookRuntimeFailed, setNotebookRuntimeFailed] = useState(false);
  const [notebookRenderState, setNotebookRenderState] = useState<
    "loading" | "ready" | "fallback"
  >(
    workspace.notebook.document.cells.length > 0 ? "loading" : "fallback",
  );
  const notebookDocument = useMemo(
    () => normalizeNotebookDocument(workspace.notebook.document),
    [workspace.notebook.document],
  );
  const agentsById = useMemo(
    () => new Map(workspace.agents.map((agent) => [agent.id, agent])),
    [workspace.agents],
  );
  const linkedEvidenceCount = useMemo(
    () =>
      workspace.notebookEvidence.filter((item) => item.status === "linked")
        .length,
    [workspace.notebookEvidence],
  );
  const codeCellCount = useMemo(
    () =>
      notebookDocument.cells.filter((cell) => cell.cell_type === "code").length,
    [notebookDocument.cells],
  );
  const showFallbackNotebook =
    notebookRuntimeFailed || notebookRenderState === "fallback";
  const showLoadingState =
    !showFallbackNotebook &&
    notebookRenderState === "loading" &&
    notebookDocument.cells.length > 0;
  const NotebookComponent = notebookRuntime?.Notebook ?? null;
  const NotebookTheme = notebookRuntime?.JupyterReactTheme ?? NotebookThemeFallback;

  useEffect(() => {
    let cancelled = false;

    async function loadNotebookRuntime() {
      try {
        const [{ Notebook }, { JupyterReactTheme }] = await Promise.all([
          import("@datalayer/jupyter-react/notebook"),
          import("@datalayer/jupyter-react/theme"),
        ]);

        if (!cancelled) {
          setNotebookRuntime({
            Notebook: Notebook as NotebookRuntime["Notebook"],
            JupyterReactTheme: JupyterReactTheme as NotebookRuntime["JupyterReactTheme"],
          });
          setNotebookRuntimeFailed(false);
        }
      } catch (error) {
        console.error("Unable to load notebook runtime for experiments pane", error);

        if (!cancelled) {
          setNotebookRuntime(null);
          setNotebookRuntimeFailed(true);
          setNotebookRenderState("fallback");
        }
      }
    }

    void loadNotebookRuntime();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setNotebookRenderState(
      notebookDocument.cells.length > 0 && !notebookRuntimeFailed
        ? "loading"
        : "fallback",
    );
  }, [notebookDocument.cells.length, notebookRuntimeFailed, workspace.notebook.currentRevision]);

  useEffect(() => {
    const shell = notebookShellRef.current;

    if (!shell) {
      return;
    }

    const syncNotebookHeight = () => {
      const nextHeight = Math.max(shell.clientHeight, 480);

      setNotebookHeight((currentHeight) =>
        currentHeight === nextHeight ? currentHeight : nextHeight,
      );
    };

    syncNotebookHeight();
    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(syncNotebookHeight);
    });
    observer.observe(shell);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const frame = notebookFrameRef.current;

    if (!frame) {
      return;
    }

    const applyReferenceTargets = () => {
      const cellElements = frame.querySelectorAll<HTMLElement>(
        ".jp-Notebook .jp-Cell",
      );

      if (cellElements.length > 0) {
        setNotebookRenderState((currentState) =>
          currentState === "ready" ? currentState : "ready",
        );
      }

      cellElements.forEach((cellElement, cellIndex) => {
        const cell = notebookDocument.cells[cellIndex];

        if (!cell) {
          return;
        }

        syncExecutionBadges(cellElement, cell, agentsById);
        cellElement.dataset.workspaceCellId = cell.id;
        cellElement.title = "Click to reference this notebook cell in chat";

        const outputElements = cellElement.querySelectorAll<HTMLElement>(
          ".jp-OutputArea-child",
        );

        outputElements.forEach((outputElement, outputIndex) => {
          const output = cell.outputs?.[outputIndex];

          if (!output) {
            return;
          }

          outputElement.dataset.workspaceOutputId = output.id;
          outputElement.title = "Click to reference this output in chat";
        });
      });
    };

    const handleNotebookClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;

      if (!target) {
        return;
      }

      const outputElement = target.closest<HTMLElement>(
        "[data-workspace-output-id]",
      );

      if (outputElement) {
        const cellElement = outputElement.closest<HTMLElement>(
          "[data-workspace-cell-id]",
        );
        const cellId = cellElement?.dataset.workspaceCellId;
        const outputId = outputElement.dataset.workspaceOutputId;
        const cell = notebookDocument.cells.find((item) => item.id === cellId);
        const outputIndex =
          cell?.outputs?.findIndex((item) => item.id === outputId) ?? -1;
        const output =
          outputIndex >= 0 ? cell?.outputs?.[outputIndex] : undefined;

        if (cell && output && outputIndex >= 0) {
          const reference = buildNotebookOutputReference(
            workspace,
            cell,
            output,
            outputIndex,
          );

          if (reference) {
            onReferenceCapture(reference);
            return;
          }
        }
      }

      const cellElement = target.closest<HTMLElement>(
        "[data-workspace-cell-id]",
      );
      const cellId = cellElement?.dataset.workspaceCellId;
      const cell = notebookDocument.cells.find((item) => item.id === cellId);

      if (cell) {
        onReferenceCapture(buildNotebookCellReference(workspace, cell));
      }
    };

    if (notebookDocument.cells.length === 0) {
      setNotebookRenderState("fallback");
      return;
    }

    if (!NotebookComponent) {
      return;
    }

    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(applyReferenceTargets);
    });
    const fallbackTimeoutId = window.setTimeout(() => {
      const renderedCellCount = frame.querySelectorAll(".jp-Notebook .jp-Cell")
        .length;

      if (renderedCellCount === 0) {
        setNotebookRenderState((currentState) =>
          currentState === "ready" ? currentState : "fallback",
        );
      }
    }, 900);

    applyReferenceTargets();
    observer.observe(frame, {
      childList: true,
      subtree: true,
    });
    frame.addEventListener("click", handleNotebookClick);

    return () => {
      window.clearTimeout(fallbackTimeoutId);
      observer.disconnect();
      frame.removeEventListener("click", handleNotebookClick);
    };
  }, [NotebookComponent, agentsById, notebookDocument, onReferenceCapture, workspace]);

  return (
    <div
      className="workspace-experiments-notebook-shell"
      ref={notebookShellRef}
    >
      <div className="workspace-experiments-theme">
        <NotebookTheme
          backgroundColor="#0b0c0f"
          colormode="dark"
        >
          <div
            className="workspace-experiments-notebook-frame"
            ref={notebookFrameRef}
          >
            <div className="workspace-experiments-title" aria-hidden="true">
              <div className="workspace-experiments-title-inner">
                <Image
                  alt=""
                  aria-hidden="true"
                  className="workspace-experiments-title-logo"
                  height={1613}
                  priority
                  src="/sandbox-logo.png"
                  width={1613}
                />
                <span className="workspace-experiments-title-text">
                  Sandbox
                </span>
              </div>
            </div>
            <div
              className="workspace-experiments-top-fade"
              aria-hidden="true"
            />

            {showLoadingState ? (
              <div
                className="workspace-experiments-loading-state"
                role="status"
              >
                <div className="workspace-experiments-loading-card">
                  <p className="workspace-experiments-loading-eyebrow">
                    Opening notebook
                  </p>
                  <p className="workspace-experiments-loading-copy">
                    Loading the workspace experiment history and recent outputs.
                  </p>
                </div>
              </div>
            ) : null}

            {showFallbackNotebook ? (
              <div
                className="workspace-experiments-fallback"
                role="region"
                aria-label="Experiments notebook snapshot"
              >
                <div className="workspace-experiments-fallback-inner">
                  <section className="workspace-experiments-overview">
                    <div className="workspace-experiments-overview-copy">
                      <p className="workspace-experiments-eyebrow">
                        Notebook snapshot
                      </p>
                      <h2>Workspace experiments</h2>
                      <p>
                        Review notebook cells, recent execution context, and
                        linked evidence directly from the experiments tab.
                      </p>
                    </div>
                    <div className="workspace-experiments-stats">
                      <article className="workspace-experiments-stat-card">
                        <span>Notebook cells</span>
                        <strong>{notebookDocument.cells.length}</strong>
                      </article>
                      <article className="workspace-experiments-stat-card">
                        <span>Code cells</span>
                        <strong>{codeCellCount}</strong>
                      </article>
                      <article className="workspace-experiments-stat-card">
                        <span>Linked evidence</span>
                        <strong>{linkedEvidenceCount}</strong>
                      </article>
                    </div>
                  </section>

                  {notebookDocument.cells.length > 0 ? (
                    <div className="workspace-experiments-cell-list">
                      {notebookDocument.cells.map((cell, cellIndex) => {
                        const metadata = getCellAgentArxivMetadata(cell);
                        const agentName =
                          typeof metadata.lastExecutingAgentId === "string"
                            ? agentsById.get(metadata.lastExecutingAgentId)
                                ?.name
                            : undefined;
                        const executedAtLabel =
                          formatExecutionDate(metadata.lastExecutedAt) ??
                          "Not run";
                        const executionStatus = formatExecutionStatus(
                          metadata.lastExecutionStatus,
                          cell.cell_type === "code"
                            ? "Not run"
                            : "Notebook cell",
                        );
                        const cellReference = buildNotebookCellReference(
                          workspace,
                          cell,
                        );

                        return (
                          <article
                            className="workspace-experiments-cell-card"
                            key={cell.id}
                          >
                            <div className="workspace-experiments-card-header">
                              <div className="workspace-experiments-card-copy">
                                <p className="workspace-experiments-card-kicker">
                                  {formatCellTypeLabel(cell, cellIndex)}
                                </p>
                                <h3>{cellReference.title}</h3>
                              </div>
                              <button
                                className="workspace-experiments-reference-button"
                                type="button"
                                onClick={() => {
                                  onReferenceCapture(cellReference);
                                }}
                              >
                                Reference cell
                              </button>
                            </div>

                            <div className="workspace-experiments-chip-row">
                              <span className="workspace-jupyter-cell-chip">
                                {executionStatus}
                              </span>
                              <span className="workspace-jupyter-cell-chip workspace-jupyter-cell-chip-muted">
                                {agentName ??
                                  (cell.cell_type === "code"
                                    ? "No execution"
                                    : "Notebook cell")}
                              </span>
                              <span className="workspace-jupyter-cell-chip workspace-jupyter-cell-chip-muted">
                                {executedAtLabel}
                              </span>
                            </div>

                            <pre className="workspace-experiments-source-block">
                              <code>{cell.source.join("") || "No cell content."}</code>
                            </pre>

                            {cell.outputs?.length ? (
                              <div className="workspace-experiments-output-list">
                                {cell.outputs.map((output, outputIndex) => {
                                  const outputReference =
                                    buildNotebookOutputReference(
                                      workspace,
                                      cell,
                                      output,
                                      outputIndex,
                                    );
                                  const outputMimeType =
                                    getOutputMimeType(output) ??
                                    output.output_type;
                                  const outputPreview =
                                    getOutputPreviewText(output);
                                  const outputImageSrc =
                                    getOutputPreviewImageSrc(output);

                                  return (
                                    <section
                                      className={[
                                        "workspace-experiments-output-card",
                                        output.output_type === "error"
                                          ? "is-error"
                                          : "",
                                      ]
                                        .join(" ")
                                        .trim()}
                                      key={output.id}
                                    >
                                      <div className="workspace-experiments-card-header">
                                        <div className="workspace-experiments-card-copy">
                                          <p className="workspace-experiments-card-kicker">
                                            {outputMimeType}
                                          </p>
                                          <h4>
                                            {outputReference?.title ??
                                              `Output ${outputIndex + 1}`}
                                          </h4>
                                        </div>
                                        {outputReference ? (
                                          <button
                                            className="workspace-experiments-reference-button"
                                            type="button"
                                            onClick={() => {
                                              onReferenceCapture(
                                                outputReference,
                                              );
                                            }}
                                          >
                                            Reference output
                                          </button>
                                        ) : null}
                                      </div>

                                      {outputImageSrc ? (
                                        <Image
                                          alt={`Notebook output ${outputIndex + 1}`}
                                          className="workspace-experiments-output-image"
                                          height={900}
                                          src={outputImageSrc}
                                          unoptimized
                                          width={1600}
                                        />
                                      ) : null}

                                      {outputPreview ? (
                                        <pre className="workspace-experiments-output-block">
                                          <code>{outputPreview}</code>
                                        </pre>
                                      ) : (
                                        <p className="workspace-experiments-output-empty">
                                          Output is available in the notebook
                                          history.
                                        </p>
                                      )}
                                    </section>
                                  );
                                })}
                              </div>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="workspace-experiments-empty-state">
                      <p className="workspace-experiments-eyebrow">
                        No notebook activity yet
                      </p>
                      <h3>The experiments notebook is ready for the first run.</h3>
                      <p>
                        Cells and outputs will appear here as agents execute
                        notebook work and link evidence back into the workspace.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            <div
              className={[
                "workspace-experiments-notebook-host",
                showFallbackNotebook || !NotebookComponent ? "is-hidden" : "",
              ]
                .join(" ")
                .trim()}
              aria-hidden={showFallbackNotebook || !NotebookComponent}
            >
              {NotebookComponent ? (
                <NotebookComponent
                  height={notebookHeight > 0 ? `${notebookHeight}px` : "100%"}
                  id={`workspace-notebook-${workspace.id}`}
                  maxHeight={notebookHeight > 0 ? `${notebookHeight}px` : "100%"}
                  nbformat={notebookDocument as never}
                  readonly
                  serviceManager={serviceManager}
                />
              ) : null}
            </div>
          </div>
        </NotebookTheme>
      </div>
    </div>
  );
}
