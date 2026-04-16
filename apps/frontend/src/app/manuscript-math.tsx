import katex from "katex";
import type { ReactNode } from "react";

type ManuscriptMathDelimiter = {
  left: string;
  right: string;
  display: boolean;
  inlineDollar?: boolean;
};

export type ManuscriptMathSegment =
  | {
      kind: "text";
      value: string;
    }
  | {
      kind: "math";
      value: string;
      display: boolean;
    };

const manuscriptMathDelimiters: ManuscriptMathDelimiter[] = [
  { left: "$$", right: "$$", display: true },
  { left: "\\begin{equation}", right: "\\end{equation}", display: true },
  { left: "\\begin{equation*}", right: "\\end{equation*}", display: true },
  { left: "\\begin{align}", right: "\\end{align}", display: true },
  { left: "\\begin{align*}", right: "\\end{align*}", display: true },
  { left: "\\begin{alignat}", right: "\\end{alignat}", display: true },
  { left: "\\begin{alignat*}", right: "\\end{alignat*}", display: true },
  { left: "\\begin{gather}", right: "\\end{gather}", display: true },
  { left: "\\begin{gather*}", right: "\\end{gather*}", display: true },
  { left: "\\begin{CD}", right: "\\end{CD}", display: true },
  { left: "\\[", right: "\\]", display: true },
  { left: "\\(", right: "\\)", display: false },
  { left: "$", right: "$", display: false, inlineDollar: true },
];

const katexRenderOptions = {
  output: "htmlAndMathml" as const,
  strict: "warn" as const,
  throwOnError: false,
  trust: false,
};

function isEscaped(value: string, index: number) {
  let backslashCount = 0;

  for (let cursor = index - 1; cursor >= 0 && value.charAt(cursor) === "\\"; cursor -= 1) {
    backslashCount += 1;
  }

  return backslashCount % 2 === 1;
}

function appendTextSegment(segments: ManuscriptMathSegment[], value: string) {
  if (!value) {
    return;
  }

  const previousSegment = segments.at(-1);

  if (previousSegment?.kind === "text") {
    previousSegment.value += value;
    return;
  }

  segments.push({
    kind: "text",
    value,
  });
}

function isInlineDollarStart(value: string, index: number) {
  const nextCharacter = value.charAt(index + 1);

  if (!nextCharacter || /\s/.test(nextCharacter) || nextCharacter === "$") {
    return false;
  }

  if (isEscaped(value, index)) {
    return false;
  }

  const previousCharacter = value.charAt(index - 1);

  if (/\d/.test(previousCharacter) && /\d/.test(nextCharacter)) {
    return false;
  }

  return true;
}

function isInlineDollarEnd(value: string, index: number) {
  const previousCharacter = value.charAt(index - 1);

  if (!previousCharacter || /\s/.test(previousCharacter) || isEscaped(value, index)) {
    return false;
  }

  const nextCharacter = value.charAt(index + 1);

  if (nextCharacter === "$" || /\d/.test(nextCharacter)) {
    return false;
  }

  return true;
}

function findNextDelimiter(
  value: string,
  fromIndex: number,
): { delimiter: ManuscriptMathDelimiter; index: number } | null {
  let bestMatch: { delimiter: ManuscriptMathDelimiter; index: number } | null = null;

  for (const delimiter of manuscriptMathDelimiters) {
    let cursor = fromIndex;

    while (cursor < value.length) {
      const matchIndex = value.indexOf(delimiter.left, cursor);

      if (matchIndex === -1) {
        break;
      }

      if (
        delimiter.inlineDollar
          ? !isInlineDollarStart(value, matchIndex)
          : delimiter.left.startsWith("\\") && isEscaped(value, matchIndex)
      ) {
        cursor = matchIndex + 1;
        continue;
      }

      if (
        !bestMatch ||
        matchIndex < bestMatch.index ||
        (matchIndex === bestMatch.index && delimiter.left.length > bestMatch.delimiter.left.length)
      ) {
        bestMatch = {
          delimiter,
          index: matchIndex,
        };
      }

      break;
    }
  }

  return bestMatch;
}

function findClosingDelimiter(
  value: string,
  startIndex: number,
  delimiter: ManuscriptMathDelimiter,
) {
  let cursor = startIndex + delimiter.left.length;

  while (cursor <= value.length) {
    const matchIndex = value.indexOf(delimiter.right, cursor);

    if (matchIndex === -1) {
      return -1;
    }

    if (
      delimiter.inlineDollar
        ? !isInlineDollarEnd(value, matchIndex)
        : delimiter.right.startsWith("\\") && isEscaped(value, matchIndex)
    ) {
      cursor = matchIndex + 1;
      continue;
    }

    return matchIndex;
  }

  return -1;
}

export function splitManuscriptMath(value: string): ManuscriptMathSegment[] {
  const segments: ManuscriptMathSegment[] = [];
  let cursor = 0;

  while (cursor < value.length) {
    const nextMatch = findNextDelimiter(value, cursor);

    if (!nextMatch) {
      appendTextSegment(segments, value.slice(cursor));
      break;
    }

    if (nextMatch.index > cursor) {
      appendTextSegment(segments, value.slice(cursor, nextMatch.index));
    }

    const closingIndex = findClosingDelimiter(value, nextMatch.index, nextMatch.delimiter);

    if (closingIndex === -1) {
      appendTextSegment(
        segments,
        value.slice(nextMatch.index, nextMatch.index + nextMatch.delimiter.left.length),
      );
      cursor = nextMatch.index + nextMatch.delimiter.left.length;
      continue;
    }

    segments.push({
      kind: "math",
      value: value.slice(
        nextMatch.index + nextMatch.delimiter.left.length,
        closingIndex,
      ),
      display: nextMatch.delimiter.display,
    });
    cursor = closingIndex + nextMatch.delimiter.right.length;
  }

  return segments.length > 0 ? segments : [{ kind: "text", value }];
}

function normalizeMathForEstimate(value: string) {
  return value
    .replace(/\\begin\{[^}]+\}|\\end\{[^}]+\}/g, " ")
    .replace(/\\[a-zA-Z]+/g, " x ")
    .replace(/[{}[\]^_&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function estimateWrappedLineCount(value: string, charsPerLine: number) {
  const normalizedValue = value.replace(/\s+/g, " ").trim();

  if (!normalizedValue) {
    return 1;
  }

  return Math.max(1, Math.ceil(normalizedValue.length / Math.max(1, charsPerLine)));
}

export function estimateManuscriptParagraphLineCount(
  value: string,
  charsPerLine: number,
) {
  const segments = splitManuscriptMath(value);
  let lineCount = 0;
  let inlineTextBuffer = "";

  for (const segment of segments) {
    if (segment.kind === "text") {
      inlineTextBuffer += segment.value;
      continue;
    }

    const estimateText = normalizeMathForEstimate(segment.value) || "x";

    if (!segment.display) {
      inlineTextBuffer += ` ${estimateText} `;
      continue;
    }

    if (inlineTextBuffer.trim()) {
      lineCount += estimateWrappedLineCount(inlineTextBuffer, charsPerLine);
      inlineTextBuffer = "";
    }

    const displayCharsPerLine = Math.max(12, Math.floor(charsPerLine * 0.7));
    lineCount += Math.max(2, Math.ceil(estimateText.length / displayCharsPerLine));
  }

  if (inlineTextBuffer.trim() || lineCount === 0) {
    lineCount += estimateWrappedLineCount(inlineTextBuffer, charsPerLine);
  }

  return lineCount;
}

function renderMathSegment(
  segment: Extract<ManuscriptMathSegment, { kind: "math" }>,
  key: string,
) {
  return (
    <span
      className={[
        "workspace-paper-math",
        segment.display ? "is-display" : "is-inline",
      ]
        .join(" ")
        .trim()}
      dangerouslySetInnerHTML={{
        __html: katex.renderToString(segment.value, {
          ...katexRenderOptions,
          displayMode: segment.display,
        }),
      }}
      key={key}
    />
  );
}

export function ManuscriptRichText({ text }: { text: string }): ReactNode {
  return (
    <>
      {splitManuscriptMath(text).map((segment, segmentIndex) =>
        segment.kind === "text"
          ? segment.value
          : renderMathSegment(segment, `${segment.display ? "display" : "inline"}-${segmentIndex}`),
      )}
    </>
  );
}
