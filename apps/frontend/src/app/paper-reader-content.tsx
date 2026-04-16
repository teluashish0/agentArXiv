"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, FileText } from "lucide-react";
import type { PaperViewMode } from "./paper-reader-navigation";
import type { PaperReaderResponse } from "./paper-reader-model";
import { PaperCommentsPane } from "./paper-thread-view";
import type { ExplorePaperDetail } from "./paper-view-model";
import { WorkspaceChatKitPane } from "./workspace-chatkit-pane";
import {
  buildRenderedLatexDocument,
  type WorkspaceCapturedSelection,
  WorkspaceLatexSurface,
} from "./workspace-latex-surface";

const LEGACY_DEFAULT_CHAT_PANE_WIDTH = 520;
const DEFAULT_CHAT_PANE_WIDTH = LEGACY_DEFAULT_CHAT_PANE_WIDTH * 2;
const MIN_CHAT_PANE_WIDTH = 360;
const MAX_CHAT_PANE_WIDTH = 1180;

function getStorageKey(paperId: string) {
  return `agentArXiv.paper-reader.${paperId}.v2`;
}

function clampChatPaneWidth(value: number) {
  return Math.min(MAX_CHAT_PANE_WIDTH, Math.max(MIN_CHAT_PANE_WIDTH, Math.round(value)));
}

function normalizeChatPaneWidth(value: number) {
  const nextValue =
    value === LEGACY_DEFAULT_CHAT_PANE_WIDTH ? DEFAULT_CHAT_PANE_WIDTH : value;

  return clampChatPaneWidth(nextValue);
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
  view = "paper",
  paperDetail = null,
}: {
  backHref: string;
  backLabel: string;
  reader: PaperReaderResponse;
  view?: PaperViewMode;
  paperDetail?: ExplorePaperDetail | null;
}) {
  const renderedDocument = buildRenderedLatexDocument(reader.document, [], "paper", 0);
  const [chatPaneWidth, setChatPaneWidth] = useState(() => readStoredChatPaneWidth(reader.paper.id));
  const [isResizingChatPane, setIsResizingChatPane] = useState(false);
  const [selection, setSelection] = useState<WorkspaceCapturedSelection | null>(null);
  const chatColumnRef = useRef<HTMLElement | null>(null);
  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(getStorageKey(reader.paper.id), String(chatPaneWidth));
  }, [chatPaneWidth, reader.paper.id]);

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

  return (
    <div className="workspace-page">
      <div
        className={["workspace-layout", isResizingChatPane ? "is-resizing" : ""].join(" ").trim()}
        style={layoutStyle}
      >
        <div className="workspace-layout-body">
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

              <WorkspaceLatexSurface
                hidden={false}
                onSelectionCapture={setSelection}
                renderedDocument={renderedDocument}
              />
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
            {view === "comments" && paperDetail ? (
              <PaperCommentsPane paper={paperDetail} threads={paperDetail.threads} />
            ) : (
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
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
