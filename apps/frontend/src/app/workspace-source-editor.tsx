"use client";

import { EditorState } from "@codemirror/state";
import { drawSelection, EditorView, highlightActiveLine, lineNumbers } from "@codemirror/view";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { RenderedLatexCaret } from "./workspace-latex-surface";

type WorkspaceSourceEditorProps = {
  text: string;
  carets: RenderedLatexCaret[];
  onSelectionCapture: () => void;
};

type PositionedCaret = RenderedLatexCaret & {
  top: number;
  left: number;
};

const overleafLikeTheme = EditorView.theme({
  "&": {
    height: "100%",
    color: "#1f2328",
    backgroundColor: "#ffffff",
    fontFamily:
      "\"DM Mono\", ui-monospace, SFMono-Regular, SFMono, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
    fontSize: "13px",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily:
      "\"DM Mono\", ui-monospace, SFMono-Regular, SFMono, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
    lineHeight: "1.65",
  },
  ".cm-content": {
    padding: "14px 0 40px",
    minHeight: "100%",
    caretColor: "#0f6fff",
  },
  ".cm-line": {
    padding: "0 18px 0 8px",
  },
  ".cm-focused": {
    outline: "none",
  },
  ".cm-activeLine": {
    backgroundColor: "#f7f4ef",
  },
  ".cm-gutters": {
    backgroundColor: "#faf9f7",
    color: "#b0a79b",
    borderRight: "1px solid #ece8e2",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 12px 0 18px",
    minWidth: "38px",
  },
  ".cm-cursor": {
    borderLeftWidth: "2px",
    marginLeft: "-1px",
  },
  "&:not(.cm-focused) > .cm-scroller > .cm-cursorLayer .cm-cursor": {
    display: "block",
    opacity: 0.3,
  },
  ".cm-selectionBackground": {
    backgroundColor: "rgba(15, 111, 255, 0.16)",
  },
});

function clampCaretPosition(view: EditorView, lineNumber: number, column: number) {
  const safeLine = Math.max(1, Math.min(lineNumber, view.state.doc.lines));
  const line = view.state.doc.line(safeLine);
  return Math.min(line.to, line.from + column);
}

export function WorkspaceSourceEditor({
  text,
  carets,
  onSelectionCapture,
}: WorkspaceSourceEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [positionedCarets, setPositionedCarets] = useState<PositionedCaret[]>([]);
  const extensions = useMemo(
    () => [
      lineNumbers(),
      drawSelection(),
      highlightActiveLine(),
      EditorView.editable.of(false),
      EditorState.readOnly.of(true),
      overleafLikeTheme,
    ],
    [],
  );

  useEffect(() => {
    const container = containerRef.current;

    if (!container || viewRef.current) {
      return;
    }

    const view = new EditorView({
      state: EditorState.create({
        doc: text,
        extensions,
      }),
      parent: container,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [extensions, text]);

  useEffect(() => {
    const view = viewRef.current;

    if (!view || text === view.state.doc.toString()) {
      return;
    }

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: text,
      },
    });
  }, [text]);

  useEffect(() => {
    const view = viewRef.current;
    const wrapper = wrapperRef.current;

    if (!view || !wrapper) {
      return;
    }

    let frameId = 0;

    const refreshCaretPositions = () => {
      if (!viewRef.current || !wrapperRef.current) {
        return;
      }

      const nextCarets = carets
        .map((caret) => {
          const position = clampCaretPosition(viewRef.current!, caret.lineNumber, caret.column);
          const coords = viewRef.current!.coordsAtPos(position);
          const wrapperRect = wrapperRef.current!.getBoundingClientRect();

          if (!coords) {
            return null;
          }

          return {
            ...caret,
            top: coords.top - wrapperRect.top,
            left: coords.left - wrapperRect.left,
          } satisfies PositionedCaret;
        })
        .filter((caret): caret is PositionedCaret => Boolean(caret));

      setPositionedCarets(nextCarets);
    };

    const scheduleRefresh = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(refreshCaretPositions);
    };

    scheduleRefresh();

    const scroller = view.scrollDOM;
    scroller.addEventListener("scroll", scheduleRefresh);
    window.addEventListener("resize", scheduleRefresh);

    return () => {
      window.cancelAnimationFrame(frameId);
      scroller.removeEventListener("scroll", scheduleRefresh);
      window.removeEventListener("resize", scheduleRefresh);
    };
  }, [carets, text]);

  return (
    <div
      className="workspace-source-editor"
      ref={wrapperRef}
      onMouseUp={onSelectionCapture}
      onKeyUp={onSelectionCapture}
    >
      <div className="workspace-source-editor-inner" ref={containerRef} />

      <div className="workspace-source-caret-layer" aria-hidden="true">
        {positionedCarets.map((caret) => (
          <div
            className={[
              "workspace-source-caret",
              caret.isTyping ? "is-typing" : "",
            ]
              .join(" ")
              .trim()}
            key={`${caret.surface}-${caret.sectionId}-${caret.agentId}`}
            style={
              {
                "--workspace-agent-accent": caret.agentAccent,
                top: `${caret.top}px`,
                left: `${caret.left}px`,
              } as CSSProperties
            }
          >
            <span className="workspace-source-caret-pill">{caret.agentName}</span>
            <span className="workspace-source-caret-stem" />
          </div>
        ))}
      </div>
    </div>
  );
}
