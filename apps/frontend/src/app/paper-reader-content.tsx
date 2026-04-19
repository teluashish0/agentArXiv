"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, FileText } from "lucide-react";
import type { PaperReaderResponse } from "./paper-reader-model";
import { WorkspaceChatKitPane } from "./workspace-chatkit-pane";
import {
  buildRenderedLatexDocument,
  MAX_WORKSPACE_PAPER_FIT_SCALE,
  MIN_WORKSPACE_PAPER_FIT_SCALE,
  WORKSPACE_PAPER_PAGE_WIDTH_PX,
  type WorkspaceCapturedSelection,
  WorkspaceLatexSurface,
} from "./workspace-latex-surface";

const DEFAULT_CHAT_PANE_WIDTH = 468;
const MIN_CHAT_PANE_WIDTH = 340;
const MAX_CHAT_PANE_WIDTH = 624;
const PAPER_READER_INITIAL_ZOOM = 0.8;

function getStorageKey(paperId: string) {
  return `agentArXiv.paper-reader.${paperId}.v6`;
}

function clampChatPaneWidth(value: number) {
  return Math.min(MAX_CHAT_PANE_WIDTH, Math.max(MIN_CHAT_PANE_WIDTH, Math.round(value)));
}

function normalizeChatPaneWidth(value: number) {
  return clampChatPaneWidth(value);
}

function readStoredChatPaneWidth(paperId: string) {
  if (typeof window === "undefined") {
    return DEFAULT_CHAT_PANE_WIDTH;
  }

  const storedValue = window.localStorage.getItem(getStorageKey(paperId));

  if (!storedValue) {
    return DEFAULT_CHAT_PANE_WIDTH;
  }

  const parsedValue = Number(storedValue);

  if (!Number.isFinite(parsedValue)) {
    window.localStorage.removeItem(getStorageKey(paperId));
    return DEFAULT_CHAT_PANE_WIDTH;
  }

  return normalizeChatPaneWidth(parsedValue);
}

export function PaperReaderContent({
  backHref,
  backLabel,
  reader,
}: {
  backHref: string;
  backLabel: string;
  reader: PaperReaderResponse;
}) {
  const renderedDocument = buildRenderedLatexDocument(reader.document, [], "paper", 0);
  const [chatPaneWidth, setChatPaneWidth] = useState(DEFAULT_CHAT_PANE_WIDTH);
  const [restoredChatPaneWidthPaperId, setRestoredChatPaneWidthPaperId] = useState<
    string | null
  >(null);
  const [paperFitScaleState, setPaperFitScaleState] = useState<{
    paperId: string;
    scale: number | null;
  }>({
    paperId: reader.paper.id,
    scale: null,
  });
  const [isResizingChatPane, setIsResizingChatPane] = useState(false);
  const [selection, setSelection] = useState<WorkspaceCapturedSelection | null>(null);
  const paperSurfaceHostRef = useRef<HTMLDivElement | null>(null);
  const chatColumnRef = useRef<HTMLElement | null>(null);
  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const hasRestoredChatPaneWidth = restoredChatPaneWidthPaperId === reader.paper.id;
  const paperFitScale =
    paperFitScaleState.paperId === reader.paper.id ? paperFitScaleState.scale : null;

  useLayoutEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedWidth = readStoredChatPaneWidth(reader.paper.id);

    const animationFrameId = window.requestAnimationFrame(() => {
      setChatPaneWidth((currentWidth) =>
        currentWidth === storedWidth ? currentWidth : storedWidth,
      );
      setRestoredChatPaneWidthPaperId((currentPaperId) =>
        currentPaperId === reader.paper.id ? currentPaperId : reader.paper.id,
      );
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [reader.paper.id]);

  useLayoutEffect(() => {
    if (!hasRestoredChatPaneWidth) {
      return;
    }

    const host = paperSurfaceHostRef.current;

    if (!host) {
      return;
    }

    let animationFrameId = 0;
    let disposed = false;
    let currentFitScale: number | null = null;

    const updateFitScale = () => {
      animationFrameId = 0;

      if (disposed) {
        return;
      }

      const availableWidth = Math.round(host.getBoundingClientRect().width);

      if (availableWidth <= 0) {
        animationFrameId = window.requestAnimationFrame(updateFitScale);
        return;
      }

      const nextFitScale = Math.max(
        MIN_WORKSPACE_PAPER_FIT_SCALE,
        Math.min(
          MAX_WORKSPACE_PAPER_FIT_SCALE,
          Number((availableWidth / WORKSPACE_PAPER_PAGE_WIDTH_PX).toFixed(3)),
        ),
      );

      if (currentFitScale !== null && Math.abs(currentFitScale - nextFitScale) < 0.001) {
        return;
      }

      currentFitScale = nextFitScale;
      setPaperFitScaleState((currentState) => {
        if (
          currentState.paperId === reader.paper.id &&
          currentState.scale !== null &&
          Math.abs(currentState.scale - nextFitScale) < 0.001
        ) {
          return currentState;
        }

        return {
          paperId: reader.paper.id,
          scale: nextFitScale,
        };
      });
    };

    const scheduleFitScaleUpdate = () => {
      if (animationFrameId) {
        return;
      }

      animationFrameId = window.requestAnimationFrame(updateFitScale);
    };

    scheduleFitScaleUpdate();

    const resizeObserver = new ResizeObserver(() => {
      scheduleFitScaleUpdate();
    });
    resizeObserver.observe(host);

    return () => {
      disposed = true;

      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }

      resizeObserver.disconnect();
    };
  }, [hasRestoredChatPaneWidth, reader.paper.id]);

  useEffect(() => {
    if (typeof window === "undefined" || !hasRestoredChatPaneWidth) {
      return;
    }

    window.localStorage.setItem(getStorageKey(reader.paper.id), String(chatPaneWidth));
  }, [chatPaneWidth, hasRestoredChatPaneWidth, reader.paper.id]);

  useEffect(() => {
    if (!isResizingChatPane) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = resizeStateRef.current;

      if (!resizeState) {
        return;
      }

      const nextWidth = resizeState.startWidth - (event.clientX - resizeState.startX);

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

  function startChatPaneResize(clientX: number) {
    if (typeof window === "undefined" || window.innerWidth <= 900) {
      return;
    }

    const startWidth = chatColumnRef.current?.getBoundingClientRect().width ?? chatPaneWidth;

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
  const isPaperReaderLayoutPending =
    !hasRestoredChatPaneWidth || paperFitScale === null;

  return (
    <div className="workspace-page paper-reader-page">
      <div
        className={["workspace-layout", "paper-reader-layout", isResizingChatPane ? "is-resizing" : ""].join(" ").trim()}
        style={layoutStyle}
      >
        <div
          className={[
            "workspace-layout-body",
            isPaperReaderLayoutPending ? "is-pending-paper-layout" : "",
          ]
            .join(" ")
            .trim()}
        >
          <section className="workspace-document-column">
            <div className="workspace-document-frame">
              <div className="workspace-surface-bar">
                <Link className="workspace-back-link" href={backHref}>
                  <ArrowLeft className="workspace-back-link-icon" absoluteStrokeWidth strokeWidth={2.2} />
                  <span>{backLabel}</span>
                </Link>

                <div className="paper-reader-surface-label" aria-label="Published paper view">
                  <FileText className="paper-reader-surface-label-icon" absoluteStrokeWidth strokeWidth={2.1} />
                  <span>Published paper</span>
                  <span className="paper-reader-surface-label-divider" aria-hidden="true">
                    •
                  </span>
                  <span>Read-only</span>
                </div>
              </div>

              <div className="workspace-paper-surface-host" ref={paperSurfaceHostRef}>
                {paperFitScale !== null ? (
                  <WorkspaceLatexSurface
                    fitScale={paperFitScale}
                    hidden={false}
                    onSelectionCapture={setSelection}
                    renderedDocument={renderedDocument}
                    initialZoom={PAPER_READER_INITIAL_ZOOM}
                  />
                ) : null}
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
                setChatPaneWidth((currentWidth) => clampChatPaneWidth(currentWidth + 24));
              }

              if (event.key === "ArrowRight") {
                event.preventDefault();
                setChatPaneWidth((currentWidth) => clampChatPaneWidth(currentWidth - 24));
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
            <WorkspaceChatKitPane
              messagesPath={`/api/chatkit/papers/${reader.paper.id}/messages`}
              surface="paper"
              surfaceContext={reader.chatContext}
              selection={selection}
              pendingReferences={[]}
              onSelectionDismiss={() => {
                setSelection(null);
              }}
              onReferencesChange={() => {}}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}
