"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  startTransition,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ArrowLeft,
  FileText,
  FlaskConical,
  Sparkles,
  Users,
} from "lucide-react";
import type { WorkspaceReference } from "@agentarxiv/core";
import { VerifiedName } from "./verified-badge";
import type { WorkspaceClientModel } from "./workspace/workspace-view-model";
import { WorkspaceChatKitPane } from "./workspace-chatkit-pane";
import type { WorkspaceChatSurface, WorkspaceChatSurfaceContext } from "./workspace-chat-context";
import {
  buildRenderedLatexDocument,
  type RenderedLatexCaret,
  type WorkspaceCapturedSelection,
  WorkspaceLatexSurface,
} from "./workspace-latex-surface";

const WorkspaceExperimentsPane = dynamic(
  () =>
    import("./workspace-experiments-pane").then(
      (module) => module.WorkspaceExperimentsPane,
    ),
  {
    ssr: false,
  },
);

type PaneTab = "proposal" | "draft" | "experiments" | "agents";

type PersistedWorkspaceState = {
  paneTab: PaneTab;
  chatPaneWidth: number;
  chatSurface: WorkspaceChatSurface;
};

const LEGACY_DEFAULT_CHAT_PANE_WIDTH = 520;
const DEFAULT_CHAT_PANE_WIDTH = LEGACY_DEFAULT_CHAT_PANE_WIDTH * 2;
const MIN_CHAT_PANE_WIDTH = 360;
const MAX_CHAT_PANE_WIDTH = 1180;

function getStorageKey(workspaceId: string) {
  return `agentArXiv.workspace.${workspaceId}.v10`;
}

function clampChatPaneWidth(value: number) {
  return Math.min(
    MAX_CHAT_PANE_WIDTH,
    Math.max(MIN_CHAT_PANE_WIDTH, Math.round(value)),
  );
}

function normalizeChatPaneWidth(value: number) {
  const nextValue =
    value === LEGACY_DEFAULT_CHAT_PANE_WIDTH ? DEFAULT_CHAT_PANE_WIDTH : value;

  return clampChatPaneWidth(nextValue);
}

function buildDefaultPersistedState(
  draftAvailable: boolean,
): PersistedWorkspaceState {
  return {
    paneTab: draftAvailable ? "draft" : "proposal",
    chatPaneWidth: DEFAULT_CHAT_PANE_WIDTH,
    chatSurface: "workspace",
  };
}

function sanitizePersistedWorkspaceState(
  value: Partial<PersistedWorkspaceState>,
  draftAvailable: boolean,
): PersistedWorkspaceState {
  const defaults = buildDefaultPersistedState(draftAvailable);
  const paneTab =
    value.paneTab === "proposal" ||
    value.paneTab === "agents" ||
    value.paneTab === "experiments"
      ? value.paneTab
      : value.paneTab === "draft" && draftAvailable
        ? "draft"
        : defaults.paneTab;

  return {
    paneTab,
    chatPaneWidth:
      typeof value.chatPaneWidth === "number"
        ? normalizeChatPaneWidth(value.chatPaneWidth)
        : defaults.chatPaneWidth,
    chatSurface: "workspace",
  };
}

function readStoredWorkspaceState(
  workspaceId: string,
  draftAvailable: boolean,
) {
  if (typeof window === "undefined") {
    return buildDefaultPersistedState(draftAvailable);
  }

  const storedValue = window.localStorage.getItem(getStorageKey(workspaceId));

  if (!storedValue) {
    return buildDefaultPersistedState(draftAvailable);
  }

  try {
    const parsedValue = JSON.parse(storedValue);

    if (parsedValue && typeof parsedValue === "object") {
      return sanitizePersistedWorkspaceState(
        parsedValue as Partial<PersistedWorkspaceState>,
        draftAvailable,
      );
    }
  } catch {
    window.localStorage.removeItem(getStorageKey(workspaceId));
  }

  return buildDefaultPersistedState(draftAvailable);
}

function buildVisibleCarets(
  paneTab: PaneTab,
  proposalCarets: RenderedLatexCaret[],
  draftCarets: RenderedLatexCaret[],
) {
  const preferredCarets =
    paneTab === "proposal"
      ? [...proposalCarets, ...draftCarets]
      : paneTab === "draft"
        ? [...draftCarets, ...proposalCarets]
        : [...draftCarets, ...proposalCarets];
  const caretByAgent = new Map<string, RenderedLatexCaret>();

  for (const caret of preferredCarets) {
    if (!caretByAgent.has(caret.agentId)) {
      caretByAgent.set(caret.agentId, caret);
    }
  }

  return [...caretByAgent.values()];
}

function formatCaretActivity(caret: RenderedLatexCaret) {
  return caret.activity === "editing" ? "Editing" : "Ready";
}

function formatCaretLocation(caret: RenderedLatexCaret) {
  return `${caret.sectionTitle} · page ${caret.pageNumber}`;
}

function buildWorkspaceReferenceKey(reference: WorkspaceReference) {
  switch (reference.kind) {
    case "artifact":
      return `artifact:${reference.artifactId}`;
    case "manuscript_selection":
      return `selection:${reference.sectionId ?? "passage"}:${reference.pageNumber}:${reference.text}`;
    case "message":
      return `message:${reference.messageId}`;
    case "notebook_cell":
      return `cell:${reference.notebookId}:${reference.cellId}`;
    case "notebook_execution":
      return `execution:${reference.executionId}`;
    case "notebook_output":
      return `output:${reference.executionId}:${reference.outputId}`;
    default:
      return JSON.stringify(reference);
  }
}

export function WorkspaceContent({
  workspace,
}: {
  workspace: WorkspaceClientModel;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const draftAvailable = workspace.surfaceAccess.draft.available;
  const [persistedState] = useState<PersistedWorkspaceState>(() =>
    readStoredWorkspaceState(workspace.id, draftAvailable),
  );
  const [paneTab, setPaneTab] = useState<PaneTab>(persistedState.paneTab);
  const [chatPaneWidth, setChatPaneWidth] = useState(
    persistedState.chatPaneWidth,
  );
  const [isResizingChatPane, setIsResizingChatPane] = useState(false);
  const [pendingSelection, setPendingSelection] =
    useState<WorkspaceCapturedSelection | null>(null);
  const [pendingReferences, setPendingReferences] = useState<
    WorkspaceReference[]
  >([]);
  const [decisionChatContext, setDecisionChatContext] =
    useState<WorkspaceChatSurfaceContext | null>(null);
  const [decisionContextError, setDecisionContextError] = useState<string | null>(
    null,
  );
  const chatColumnRef = useRef<HTMLElement | null>(null);
  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(
    null,
  );
  const proposalRendered = buildRenderedLatexDocument(
    workspace.proposalDocument,
    workspace.agents,
    "proposal",
    0,
  );
  const draftRendered = buildRenderedLatexDocument(
    workspace.draftDocument,
    workspace.agents,
    "draft",
    0,
  );
  const activePaneTab =
    paneTab === "draft" && !draftAvailable ? "proposal" : paneTab;
  const activeChatSurface: WorkspaceChatSurface = "workspace";
  const activeDecisionId = searchParams.get("decision");
  const activeSelection = pendingSelection;
  const agentCaretsForCards = buildVisibleCarets(
    "agents",
    proposalRendered.carets,
    draftRendered.carets,
  );
  const agentCaretMap = new Map(
    agentCaretsForCards.map((caret) => [caret.agentId, caret]),
  );
  const activeChatContext =
    activeDecisionId && decisionChatContext ? decisionChatContext : workspace.chatContext;

  useEffect(() => {
    if (!activeDecisionId) {
      setDecisionChatContext(null);
      setDecisionContextError(null);
      return;
    }

    let cancelled = false;

    async function loadDecisionContext() {
      try {
        const response = await fetch(
          `/api/workspaces/${workspace.id}/chat-context?surface=workspace&decisionId=${activeDecisionId}`,
          {
            cache: "no-store",
          },
        );
        const payload = (await response.json()) as WorkspaceChatSurfaceContext | { error?: string };

        if (!response.ok || !("threadId" in payload)) {
          throw new Error(
            "error" in payload && typeof payload.error === "string"
              ? payload.error
              : "Unable to load the decision chat",
          );
        }

        if (!cancelled) {
          setDecisionChatContext(payload);
          setDecisionContextError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setDecisionContextError(
            error instanceof Error ? error.message : "Unable to load the decision chat",
          );
          setDecisionChatContext(null);
        }
      }
    }

    void loadDecisionContext();

    return () => {
      cancelled = true;
    };
  }, [activeDecisionId, workspace.id, workspace.chatContext.governanceDecisions]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const nextState: PersistedWorkspaceState = {
      paneTab: activePaneTab,
      chatPaneWidth,
      chatSurface: activeChatSurface,
    };

    window.localStorage.setItem(
      getStorageKey(workspace.id),
      JSON.stringify(nextState),
    );
  }, [activeChatSurface, activePaneTab, chatPaneWidth, workspace.id]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    // The notebook owns local Jupyter view state, so route refreshes while the
    // experiments tab is open cause visible remount/flicker.
    if (activePaneTab === "experiments") {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }

      startTransition(() => {
        router.refresh();
      });
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activePaneTab, router, workspace.id]);

  useEffect(() => {
    if (!isResizingChatPane) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = resizeStateRef.current;

      if (!resizeState) {
        return;
      }

      const nextWidth =
        resizeState.startWidth - (event.clientX - resizeState.startX);

      setChatPaneWidth(clampChatPaneWidth(nextWidth));
    };

    const stopResizing = () => {
      resizeStateRef.current = null;
      setIsResizingChatPane(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
    };
  }, [isResizingChatPane]);

  function handlePaneTabChange(nextPaneTab: PaneTab) {
    if (nextPaneTab === "draft" && !draftAvailable) {
      return;
    }

    setPaneTab(nextPaneTab);
  }

  function startChatPaneResize(clientX: number) {
    if (typeof window === "undefined" || window.innerWidth <= 900) {
      return;
    }

    const startWidth =
      chatColumnRef.current?.getBoundingClientRect().width ?? chatPaneWidth;

    resizeStateRef.current = {
      startX: clientX,
      startWidth,
    };
    setChatPaneWidth(clampChatPaneWidth(startWidth));
    setIsResizingChatPane(true);
  }

  const layoutStyle = {
    "--workspace-chat-width": `${chatPaneWidth}px`,
  } as CSSProperties;

  return (
    <div className="workspace-page">
      <div
        className={["workspace-layout", isResizingChatPane ? "is-resizing" : ""]
          .join(" ")
          .trim()}
        style={layoutStyle}
      >
        <div className="workspace-layout-body">
          <section className="workspace-document-column">
            <div className="workspace-document-frame">
              <div className="workspace-surface-bar">
                <Link className="workspace-back-link" href="/workspace">
                  <ArrowLeft
                    className="workspace-back-link-icon"
                    absoluteStrokeWidth
                    strokeWidth={2.2}
                  />
                  <span>Back to workspace</span>
                </Link>

                <div
                  className="workspace-reader-tabs"
                  role="tablist"
                  aria-label="Workspace panes"
                >
                  <button
                    className={[
                      "workspace-reader-tab",
                      activePaneTab === "proposal" ? "is-active" : "",
                    ].join(" ")}
                    type="button"
                    role="tab"
                    aria-selected={activePaneTab === "proposal"}
                    onClick={() => {
                      handlePaneTabChange("proposal");
                    }}
                  >
                    <Sparkles
                      className="workspace-reader-tab-icon"
                      absoluteStrokeWidth
                      strokeWidth={2.1}
                    />
                    <span>Proposal</span>
                  </button>
                  <button
                    className={[
                      "workspace-reader-tab",
                      activePaneTab === "draft" ? "is-active" : "",
                      !draftAvailable ? "is-disabled" : "",
                    ]
                      .join(" ")
                      .trim()}
                    type="button"
                    role="tab"
                    aria-selected={activePaneTab === "draft"}
                    aria-disabled={!draftAvailable}
                    disabled={!draftAvailable}
                    title={
                      !draftAvailable
                        ? workspace.surfaceAccess.draft.reason
                        : undefined
                    }
                    onClick={() => {
                      handlePaneTabChange("draft");
                    }}
                  >
                    <FileText
                      className="workspace-reader-tab-icon"
                      absoluteStrokeWidth
                      strokeWidth={2.1}
                    />
                    <span>Draft</span>
                  </button>
                  <button
                    className={[
                      "workspace-reader-tab",
                      activePaneTab === "experiments" ? "is-active" : "",
                    ].join(" ")}
                    type="button"
                    role="tab"
                    aria-selected={activePaneTab === "experiments"}
                    onClick={() => {
                      handlePaneTabChange("experiments");
                    }}
                  >
                    <FlaskConical
                      className="workspace-reader-tab-icon"
                      absoluteStrokeWidth
                      strokeWidth={2.1}
                    />
                    <span>Experiments</span>
                  </button>
                  <button
                    className={[
                      "workspace-reader-tab",
                      activePaneTab === "agents" ? "is-active" : "",
                    ].join(" ")}
                    type="button"
                    role="tab"
                    aria-selected={activePaneTab === "agents"}
                    onClick={() => {
                      handlePaneTabChange("agents");
                    }}
                  >
                    <Users
                      className="workspace-reader-tab-icon"
                      absoluteStrokeWidth
                      strokeWidth={2.1}
                    />
                    <span>Agents</span>
                  </button>
                </div>
              </div>

              {workspace.sandbox.hasBlockingJobs ? (
                <div className="workspace-sandbox-banner" role="status">
                  {workspace.sandbox.blockingExecutionCount} linked experiment
                  execution
                  {workspace.sandbox.blockingExecutionCount === 1
                    ? ""
                    : "s"}{" "}
                  currently block paper completion. Exploratory runs only gate
                  the workspace after they are linked as evidence.
                </div>
              ) : null}

              <WorkspaceLatexSurface
                hidden={activePaneTab !== "proposal"}
                onSelectionCapture={(selection) => {
                  setPendingSelection(selection);
                }}
                renderedDocument={proposalRendered}
              />

              <WorkspaceLatexSurface
                hidden={activePaneTab !== "draft"}
                onSelectionCapture={(selection) => {
                  if (!draftAvailable) {
                    return;
                  }

                  setPendingSelection(selection);
                }}
                renderedDocument={draftRendered}
              />

              {activePaneTab === "experiments" ? (
                <div className="workspace-sandbox-panel-shell">
                  <WorkspaceExperimentsPane
                    workspace={workspace}
                    onReferenceCapture={(reference) => {
                      setPendingReferences((currentReferences) => {
                        const referenceKey =
                          buildWorkspaceReferenceKey(reference);

                        if (
                          currentReferences.some(
                            (currentReference) =>
                              buildWorkspaceReferenceKey(currentReference) ===
                              referenceKey,
                          )
                        ) {
                          return currentReferences;
                        }

                        return [...currentReferences, reference];
                      });
                    }}
                  />
                </div>
              ) : null}

              <div
                className="workspace-agents-panel"
                hidden={activePaneTab !== "agents"}
                aria-hidden={activePaneTab !== "agents"}
              >
                <div className="workspace-agents-grid">
                  <article className="workspace-agent-card workspace-agent-card-wide">
                    <div className="workspace-agent-meta">
                      <span className="workspace-agent-role">
                        {workspace.paperStatus}
                      </span>
                      <span className="workspace-agent-status">
                        {workspace.collaboratorsLocked
                          ? "Roster locked"
                          : "Roster open"}
                      </span>
                    </div>
                    <h2>{workspace.title}</h2>
                    <p>{workspace.abstract}</p>
                  </article>

                  {workspace.agents.map((agent) => {
                    const agentCaret = agentCaretMap.get(agent.id);

                    return (
                      <article className="workspace-agent-card" key={agent.id}>
                        <div className="workspace-agent-meta">
                          <span className="workspace-agent-role">
                            {agent.role}
                          </span>
                          <span className="workspace-agent-status">
                            {agentCaret
                              ? formatCaretActivity(agentCaret)
                              : "Queued"}
                          </span>
                        </div>
                        <h3>
                          <VerifiedName
                            className="workspace-agent-verified-name"
                            iconClassName="workspace-agent-verified-icon"
                            verified={agent.verifiedProfile}
                          >
                            {agent.name}
                          </VerifiedName>
                        </h3>
                        <p>
                          {agentCaret
                            ? `${agentCaret.surface === "proposal" ? "Proposal" : "Draft"} · ${formatCaretLocation(agentCaret)}`
                            : agent.description}
                        </p>
                        <div className="workspace-agent-focus-list">
                          {agent.focus.map((focus) => (
                            <span
                              className="workspace-agent-focus"
                              key={`${agent.id}-${focus}`}
                            >
                              {focus}
                            </span>
                          ))}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          <button
            className="workspace-pane-divider"
            type="button"
            aria-label="Resize chat pane"
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.focus();
              startChatPaneResize(event.clientX);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                setChatPaneWidth((currentWidth) =>
                  clampChatPaneWidth(currentWidth + 24),
                );
              }

              if (event.key === "ArrowRight") {
                event.preventDefault();
                setChatPaneWidth((currentWidth) =>
                  clampChatPaneWidth(currentWidth - 24),
                );
              }

              if (event.key === "Home") {
                event.preventDefault();
                setChatPaneWidth(MAX_CHAT_PANE_WIDTH);
              }

              if (event.key === "End") {
                event.preventDefault();
                setChatPaneWidth(MIN_CHAT_PANE_WIDTH);
              }
            }}
          />

          <aside className="workspace-chat-column" ref={chatColumnRef}>
            {activeDecisionId && !decisionChatContext ? (
              <div className="workspace-loading-card workspace-loading-page">
                {decisionContextError ?? "Loading decision chat…"}
              </div>
            ) : (
              <WorkspaceChatKitPane
                key={`${workspace.id}-${activeChatContext.threadId}`}
                messagesPath={
                  activeDecisionId
                    ? `/api/chatkit/workspaces/${workspace.id}/decisions/${activeDecisionId}/messages`
                    : `/api/chatkit/workspaces/${workspace.id}/${activeChatSurface}/messages`
                }
                surface={activeChatSurface}
                surfaceContext={activeChatContext}
                selection={activeSelection}
                pendingReferences={pendingReferences}
                onOpenDecision={(decisionId) => {
                  const nextParams = new URLSearchParams(searchParams.toString());
                  nextParams.set("decision", decisionId);
                  router.replace(`${pathname}?${nextParams.toString()}`, {
                    scroll: false,
                  });
                }}
                onNavigateBack={() => {
                  const nextParams = new URLSearchParams(searchParams.toString());
                  nextParams.delete("decision");
                  const query = nextParams.toString();
                  router.replace(query ? `${pathname}?${query}` : pathname, {
                    scroll: false,
                  });
                }}
                onSelectionDismiss={() => {
                  setPendingSelection(null);
                }}
                onReferencesChange={setPendingReferences}
              />
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
