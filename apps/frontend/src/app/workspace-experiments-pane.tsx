"use client";

import Image from "next/image";
import type {
  WorkspaceNotebookCellReference,
  WorkspaceNotebookOutputReference,
  WorkspaceReference,
} from "@agentarxiv/core";
import {
  Fragment,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { WorkspaceClientModel } from "./workspace/workspace-view-model";

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

const PYTHON_KEYWORDS = new Set([
  "False",
  "None",
  "True",
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield",
]);

const JAVASCRIPT_KEYWORDS = new Set([
  "as",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "from",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "null",
  "package",
  "private",
  "protected",
  "public",
  "readonly",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "type",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

type NotebookSyntaxName = "javascript" | "json" | "jsx" | "python" | "tsx" | "typescript";

function normalizeLanguageName(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : undefined;
}

function resolveNotebookSyntaxName(languageName?: string): NotebookSyntaxName | null {
  switch (languageName) {
    case "javascript":
    case "js":
      return "javascript";
    case "json":
      return "json";
    case "jsx":
      return "jsx";
    case "python":
    case "python3":
    case "py":
      return "python";
    case "typescript":
    case "ts":
      return "typescript";
    case "tsx":
      return "tsx";
    default:
      return null;
  }
}

function getNotebookLanguageName(
  document: WorkspaceClientModel["notebook"]["document"],
) {
  const metadata = isRecord(document.metadata) ? document.metadata : undefined;
  const languageInfo = isRecord(metadata?.language_info)
    ? metadata.language_info
    : undefined;
  const kernelspec = isRecord(metadata?.kernelspec)
    ? metadata.kernelspec
    : undefined;

  return (
    normalizeLanguageName(languageInfo?.name) ??
    normalizeLanguageName(kernelspec?.language) ??
    normalizeLanguageName(kernelspec?.name)
  );
}

function createNotebookSyntaxPattern(syntaxName: NotebookSyntaxName) {
  switch (syntaxName) {
    case "json":
      return /("(?:\\.|[^"\\])*")(?=\s*:)|("(?:\\.|[^"\\])*")|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[()[\]{},.:;]/gm;
    case "javascript":
    case "jsx":
    case "tsx":
    case "typescript":
      return /(\/\/.*$|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b[A-Za-z_$][\w$]*(?=\s*:\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[^,\n]+))|\b(?:as|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|false|finally|for|from|function|if|implements|import|in|instanceof|interface|let|new|null|package|private|protected|public|readonly|return|super|switch|this|throw|true|try|type|typeof|var|void|while|with|yield)\b|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|[()[\]{},.:;]|=>|===|!==|==|!=|<=|>=|\+\+|--|&&|\|\||[-+/*%=<>!&|^~?]+)/gm;
    case "python":
      return /(#.*$|"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b[A-Za-z_]\w*(?=\s*=)|\b(?:False|None|True|and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield)\b|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?j?\b|[()[\]{},.:;]|[-+/*%=<>!&|^~]+)/gm;
  }
}

function getNotebookTokenClassName(
  match: RegExpExecArray,
  syntaxName: NotebookSyntaxName,
) {
  const token = match[0];

  if (syntaxName === "json") {
    if (match[1]) {
      return "tok-propertyName";
    }

    if (match[2]) {
      return "tok-string";
    }

    if (/^(true|false)$/.test(token)) {
      return "tok-bool";
    }

    if (token === "null") {
      return "tok-atom";
    }

    if (/^-?\d/.test(token)) {
      return "tok-number";
    }

    if (/^[()[\]{},.:;]$/.test(token)) {
      return "tok-punctuation";
    }

    return undefined;
  }

  if (syntaxName === "python") {
    if (token.startsWith("#")) {
      return "tok-comment";
    }

    if (
      token.startsWith('"') ||
      token.startsWith("'")
    ) {
      return "tok-string";
    }

    if (PYTHON_KEYWORDS.has(token)) {
      if (token === "True" || token === "False") {
        return "tok-bool";
      }

      if (token === "None") {
        return "tok-atom";
      }

      return "tok-keyword";
    }

    if (/^\d/.test(token)) {
      return "tok-number";
    }

    if (/^[()[\]{},.:;]$/.test(token)) {
      return "tok-punctuation";
    }

    if (/^[-+/*%=<>!&|^~]+$/.test(token)) {
      return "tok-operator";
    }

    if (/^[A-Za-z_]\w*$/.test(token)) {
      return "tok-variableName tok-definition";
    }

    return undefined;
  }

  if (
    token.startsWith("//") ||
    token.startsWith("/*")
  ) {
    return "tok-comment";
  }

  if (
    token.startsWith('"') ||
    token.startsWith("'") ||
    token.startsWith("`")
  ) {
    return "tok-string";
  }

  if (JAVASCRIPT_KEYWORDS.has(token)) {
    if (token === "true" || token === "false") {
      return "tok-bool";
    }

    if (token === "null") {
      return "tok-atom";
    }

    return "tok-keyword";
  }

  if (/^\d/.test(token)) {
    return "tok-number";
  }

  if (/^[()[\]{},.:;]$/.test(token)) {
    return "tok-punctuation";
  }

  if (/^(=>|===|!==|==|!=|<=|>=|\+\+|--|&&|\|\||[-+/*%=<>!&|^~?]+)$/.test(token)) {
    return "tok-operator";
  }

  if (/^[A-Za-z_$][\w$]*$/.test(token)) {
    return "tok-propertyName";
  }

  return undefined;
}

function renderHighlightedNotebookSource(
  source: string,
  languageName?: string,
): ReactNode {
  if (!source) {
    return "No cell content.";
  }

  const syntaxName = resolveNotebookSyntaxName(languageName);

  if (!syntaxName) {
    return source;
  }

  const pattern = createNotebookSyntaxPattern(syntaxName);
  const fragments: ReactNode[] = [];
  let fragmentIndex = 0;
  let lastIndex = 0;

  for (const match of source.matchAll(pattern)) {
    const token = match[0];
    const matchIndex = match.index ?? 0;

    if (matchIndex > lastIndex) {
      fragments.push(
        <Fragment key={`segment-${fragmentIndex++}`}>
          {source.slice(lastIndex, matchIndex)}
        </Fragment>,
      );
    }

    const className = getNotebookTokenClassName(match, syntaxName);

    fragments.push(
      className ? (
        <span className={className} key={`segment-${fragmentIndex++}`}>
          {token}
        </span>
      ) : (
        <Fragment key={`segment-${fragmentIndex++}`}>{token}</Fragment>
      ),
    );

    lastIndex = matchIndex + token.length;
  }

  if (lastIndex < source.length) {
    fragments.push(
      <Fragment key={`segment-${fragmentIndex++}`}>
        {source.slice(lastIndex)}
      </Fragment>,
    );
  }

  return fragments.length > 0 ? fragments : source;
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

function formatNotebookInputPrompt(
  cell: WorkspaceClientModel["notebook"]["document"]["cells"][number],
) {
  if (cell.cell_type !== "code") {
    return "";
  }

  return `In [${cell.execution_count ?? " "}]:`;
}

function formatNotebookOutputPrompt(
  cell: WorkspaceClientModel["notebook"]["document"]["cells"][number],
  output: NonNullable<
    WorkspaceClientModel["notebook"]["document"]["cells"][number]["outputs"]
  >[number],
) {
  if (cell.cell_type !== "code") {
    return "";
  }

  if (output.output_type === "execute_result" && cell.execution_count != null) {
    return `Out[${cell.execution_count}]:`;
  }

  return "";
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

export function WorkspaceExperimentsPane({
  workspace,
  onReferenceCapture,
}: {
  workspace: WorkspaceClientModel;
  onReferenceCapture: (reference: WorkspaceReference) => void;
}) {
  const notebookDocument = useMemo(
    () => normalizeNotebookDocument(workspace.notebook.document),
    [workspace.notebook.document],
  );
  const notebookLanguageName = useMemo(
    () => getNotebookLanguageName(notebookDocument),
    [notebookDocument],
  );
  const [isNotebookScrolled, setIsNotebookScrolled] = useState(false);

  return (
    <div className="workspace-experiments-notebook-shell">
      <div className="workspace-experiments-theme">
        <div
          className={[
            "workspace-experiments-notebook-frame",
            isNotebookScrolled ? "is-scrolled" : "",
          ]
            .join(" ")
            .trim()}
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

          <div
            className="workspace-experiments-fallback"
            role="region"
            aria-label="Experiments notebook snapshot"
          >
            <div className="jp-NotebookPanel">
              <div className="jp-Notebook">
                <div
                  className="jp-WindowedPanel-outer"
                  onScroll={(event) => {
                    const nextScrolled = event.currentTarget.scrollTop > 0;

                    setIsNotebookScrolled((currentScrolled) =>
                      currentScrolled === nextScrolled
                        ? currentScrolled
                        : nextScrolled,
                    );
                  }}
                >
                  <div className="jp-WindowedPanel-viewport workspace-experiments-fallback-inner">
                    {notebookDocument.cells.length > 0 ? (
                      <div className="workspace-experiments-cell-list">
                        {notebookDocument.cells.map((cell) => {
                          const cellReference = buildNotebookCellReference(
                            workspace,
                            cell,
                          );

                          return (
                            <article
                              className={[
                                "jp-Cell",
                                cell.cell_type === "code"
                                  ? "jp-CodeCell"
                                  : cell.cell_type === "markdown"
                                    ? "jp-MarkdownCell"
                                    : "jp-RawCell",
                                cell.outputs?.length ? "" : "jp-mod-noOutputs",
                                "workspace-experiments-jupyter-cell",
                              ]
                                .join(" ")
                                .trim()}
                              key={cell.id}
                            >
                              <div className="jp-Cell-inputWrapper">
                                <div className="jp-InputArea jp-Cell-inputArea">
                                  <div
                                    className={[
                                      "jp-InputPrompt",
                                      cell.cell_type !== "code" ? "is-empty" : "",
                                    ]
                                      .join(" ")
                                      .trim()}
                                    aria-hidden="true"
                                  >
                                    {formatNotebookInputPrompt(cell)}
                                  </div>
                                  <div
                                    className="jp-InputArea-editor workspace-experiments-jupyter-input-shell"
                                    role="button"
                                    tabIndex={0}
                                    title="Reference this notebook cell in chat"
                                    onClick={() => {
                                      onReferenceCapture(cellReference);
                                    }}
                                    onKeyDown={(event) => {
                                      if (
                                        event.key === "Enter" ||
                                        event.key === " "
                                      ) {
                                        event.preventDefault();
                                        onReferenceCapture(cellReference);
                                      }
                                    }}
                                  >
                                    <pre className="workspace-experiments-jupyter-editor-content">
                                      <code
                                        className={
                                          cell.cell_type === "code"
                                            ? [
                                                "workspace-experiments-jupyter-code",
                                                resolveNotebookSyntaxName(
                                                  notebookLanguageName,
                                                )
                                                  ? `is-${resolveNotebookSyntaxName(
                                                      notebookLanguageName,
                                                    )}`
                                                  : "",
                                              ]
                                                .join(" ")
                                                .trim()
                                            : undefined
                                        }
                                      >
                                        {cell.cell_type === "code"
                                          ? renderHighlightedNotebookSource(
                                              cell.source.join(""),
                                              notebookLanguageName,
                                            )
                                          : cell.source.join("") ||
                                            "No cell content."}
                                      </code>
                                    </pre>
                                  </div>
                                </div>
                              </div>

                              {cell.outputs?.length ? (
                                <div className="jp-Cell-outputWrapper">
                                  <div className="jp-Cell-outputArea">
                                    <div className="jp-OutputArea">
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
                                          <div
                                            className="jp-OutputArea-child"
                                            key={output.id}
                                          >
                                            <div
                                              className={[
                                                "jp-OutputPrompt",
                                                !formatNotebookOutputPrompt(
                                                  cell,
                                                  output,
                                                )
                                                  ? "is-empty"
                                                  : "",
                                              ]
                                                .join(" ")
                                                .trim()}
                                              aria-hidden="true"
                                            >
                                              {formatNotebookOutputPrompt(
                                                cell,
                                                output,
                                              )}
                                            </div>
                                            <section
                                              className={[
                                                "jp-OutputArea-output",
                                                "workspace-experiments-jupyter-output-shell",
                                                output.output_type === "error"
                                                  ? "is-error"
                                                  : "",
                                              ]
                                                .join(" ")
                                                .trim()}
                                              role={
                                                outputReference
                                                  ? "button"
                                                  : undefined
                                              }
                                              tabIndex={
                                                outputReference ? 0 : undefined
                                              }
                                              title={
                                                outputReference
                                                  ? "Reference this notebook output in chat"
                                                  : undefined
                                              }
                                              onClick={() => {
                                                if (outputReference) {
                                                  onReferenceCapture(
                                                    outputReference,
                                                  );
                                                }
                                              }}
                                              onKeyDown={(event) => {
                                                if (
                                                  outputReference &&
                                                  (event.key === "Enter" ||
                                                    event.key === " ")
                                                ) {
                                                  event.preventDefault();
                                                  onReferenceCapture(
                                                    outputReference,
                                                  );
                                                }
                                              }}
                                            >
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
                                                <pre className="workspace-experiments-jupyter-output-content">
                                                  <code>{outputPreview}</code>
                                                </pre>
                                              ) : outputMimeType ? (
                                                <p className="workspace-experiments-output-empty">
                                                  {outputMimeType}
                                                </p>
                                              ) : null}
                                            </section>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
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
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
