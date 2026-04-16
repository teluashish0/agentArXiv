export type PaperPreviewBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "image"; alt: string; src: string }
  | { type: "table"; headers: string[]; rows: string[][] };

export type PaperPreviewInput = {
  title: string;
  authors: string[];
  summary: string;
  content?: string;
};

function splitMarkdownTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isMarkdownTableSeparator(line: string) {
  const cells = splitMarkdownTableRow(line);

  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isMarkdownTableStart(lines: string[], index: number) {
  const currentLine = lines[index]?.trim() ?? "";
  const nextLine = lines[index + 1]?.trim() ?? "";

  return currentLine.includes("|") && isMarkdownTableSeparator(nextLine);
}

export function parsePaperPreviewBlocks(content: string, paperTitle: string) {
  const lines = content.split("\n");
  const blocks: PaperPreviewBlock[] = [];

  for (let index = 0; index < lines.length; ) {
    const line = lines[index]?.trim() ?? "";

    if (!line) {
      index += 1;
      continue;
    }

    if (line.startsWith("# ")) {
      const text = line.slice(2).trim();

      if (text && text !== paperTitle) {
        blocks.push({ type: "heading", level: 1, text });
      }

      index += 1;
      continue;
    }

    if (line.startsWith("## ")) {
      blocks.push({ type: "heading", level: 2, text: line.slice(3).trim() });
      index += 1;
      continue;
    }

    if (line.startsWith("### ")) {
      blocks.push({ type: "heading", level: 3, text: line.slice(4).trim() });
      index += 1;
      continue;
    }

    const imageMatch = line.match(/^!\[(.*?)\]\((.+?)\)$/);

    if (imageMatch) {
      blocks.push({
        type: "image",
        alt: imageMatch[1]?.trim() || "Figure",
        src: imageMatch[2]?.trim() || "",
      });
      index += 1;
      continue;
    }

    if (isMarkdownTableStart(lines, index)) {
      const headers = splitMarkdownTableRow(lines[index] ?? "");
      const rows: string[][] = [];

      index += 2;

      while (index < lines.length) {
        const rowLine = lines[index]?.trim() ?? "";

        if (!rowLine || !rowLine.includes("|")) {
          break;
        }

        rows.push(splitMarkdownTableRow(rowLine));
        index += 1;
      }

      blocks.push({
        type: "table",
        headers,
        rows,
      });
      continue;
    }

    if (line.startsWith("- ")) {
      const items: string[] = [];

      while (index < lines.length) {
        const itemLine = lines[index]?.trim() ?? "";

        if (!itemLine.startsWith("- ")) {
          break;
        }

        items.push(itemLine.slice(2).trim());
        index += 1;
      }

      blocks.push({ type: "list", items });
      continue;
    }

    const paragraphLines: string[] = [];

    while (index < lines.length) {
      const paragraphLine = lines[index]?.trim() ?? "";

      if (
        !paragraphLine ||
        paragraphLine.startsWith("# ") ||
        paragraphLine.startsWith("## ") ||
        paragraphLine.startsWith("### ") ||
        paragraphLine.startsWith("- ") ||
        /^!\[(.*?)\]\((.+?)\)$/.test(paragraphLine) ||
        isMarkdownTableStart(lines, index)
      ) {
        break;
      }

      paragraphLines.push(paragraphLine);
      index += 1;
    }

    if (paragraphLines.length > 0) {
      blocks.push({
        type: "paragraph",
        text: paragraphLines.join(" "),
      });
      continue;
    }

    index += 1;
  }

  return blocks;
}

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizePreviewText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function wrapPreviewText(value: string, maxChars: number) {
  const words = normalizePreviewText(value).split(" ").filter(Boolean);

  if (words.length === 0) {
    return [];
  }

  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;

    if (currentLine && candidate.length > maxChars) {
      lines.push(currentLine);
      currentLine = word;
      continue;
    }

    currentLine = candidate;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

export function buildPaperPreviewDataUri({
  title,
  authors,
  summary,
  content,
}: PaperPreviewInput) {
  const manuscriptBlocks = parsePaperPreviewBlocks(content ?? "", title);
  const width = 900;
  const height = 1160;
  const pageInset = 34;
  const contentX = 90;
  const contentWidth = width - contentX * 2;
  const maxY = height - 96;
  const svgLines: string[] = [];
  let currentY = 108;

  const pushTextBlock = ({
    text,
    fill,
    fontSize,
    fontWeight,
    lineHeight,
    maxChars,
    maxLines,
    letterSpacing,
  }: {
    text: string;
    fill: string;
    fontSize: number;
    fontWeight: number;
    lineHeight: number;
    maxChars: number;
    maxLines?: number;
    letterSpacing?: number;
  }) => {
    const wrappedLines = wrapPreviewText(text, maxChars);

    if (wrappedLines.length === 0) {
      return;
    }

    const displayedLines = typeof maxLines === "number" ? wrappedLines.slice(0, maxLines) : wrappedLines;
    const isTruncated = typeof maxLines === "number" && wrappedLines.length > maxLines;

    displayedLines.forEach((line, index) => {
      if (currentY > maxY) {
        return;
      }

      const lineText =
        isTruncated && index === displayedLines.length - 1 ? `${line.replace(/[.,;:!?-]*$/, "")}…` : line;

      svgLines.push(
        `<text x="${contentX}" y="${currentY}" fill="${fill}" font-family="Georgia, 'Times New Roman', serif" font-size="${fontSize}" font-weight="${fontWeight}"${typeof letterSpacing === "number" ? ` letter-spacing="${letterSpacing}"` : ""}>${escapeSvgText(lineText)}</text>`,
      );
      currentY += lineHeight;
    });
  };

  const pushDivider = () => {
    currentY += 6;
    svgLines.push(
      `<line x1="${contentX}" y1="${currentY}" x2="${contentX + contentWidth}" y2="${currentY}" stroke="#d7d7d7" stroke-width="1" />`,
    );
    currentY += 28;
  };

  pushTextBlock({
    text: "agentArXiv manuscript preview",
    fill: "#7d7d7d",
    fontSize: 15,
    fontWeight: 600,
    lineHeight: 20,
    maxChars: 40,
    maxLines: 1,
    letterSpacing: 1.3,
  });

  currentY += 10;

  pushTextBlock({
    text: title,
    fill: "#121212",
    fontSize: 36,
    fontWeight: 700,
    lineHeight: 44,
    maxChars: 28,
    maxLines: 4,
  });

  currentY += 6;

  pushTextBlock({
    text: authors.join(", "),
    fill: "#484848",
    fontSize: 18,
    fontWeight: 500,
    lineHeight: 24,
    maxChars: 56,
    maxLines: 2,
  });

  currentY += 10;
  pushDivider();

  pushTextBlock({
    text: "Abstract",
    fill: "#161616",
    fontSize: 20,
    fontWeight: 700,
    lineHeight: 24,
    maxChars: 18,
    maxLines: 1,
  });

  currentY += 4;

  pushTextBlock({
    text: summary,
    fill: "#343434",
    fontSize: 18,
    fontWeight: 400,
    lineHeight: 27,
    maxChars: 64,
    maxLines: 6,
  });

  currentY += 4;
  pushDivider();

  for (const block of manuscriptBlocks) {
    if (currentY > maxY) {
      break;
    }

    if (block.type === "heading" && block.level >= 2) {
      pushTextBlock({
        text: block.text,
        fill: "#151515",
        fontSize: block.level === 2 ? 22 : 18,
        fontWeight: 700,
        lineHeight: block.level === 2 ? 28 : 24,
        maxChars: block.level === 2 ? 36 : 42,
        maxLines: 2,
      });
      currentY += 4;
      continue;
    }

    if (block.type === "paragraph") {
      pushTextBlock({
        text: block.text,
        fill: "#353535",
        fontSize: 17,
        fontWeight: 400,
        lineHeight: 25,
        maxChars: 66,
        maxLines: 4,
      });
      currentY += 6;
      continue;
    }

    if (block.type === "list") {
      const previewList = block.items.slice(0, 3).map((item) => `• ${item}`).join(" ");

      pushTextBlock({
        text: previewList,
        fill: "#353535",
        fontSize: 17,
        fontWeight: 400,
        lineHeight: 25,
        maxChars: 62,
        maxLines: 3,
      });
      currentY += 6;
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeSvgText(`Preview of the first page of ${title}`)}">
  <rect width="${width}" height="${height}" rx="20" fill="#f1f1f1" />
  <rect x="${pageInset}" y="${pageInset}" width="${width - pageInset * 2}" height="${height - pageInset * 2}" rx="10" fill="#ffffff" stroke="#dadada" stroke-width="2" />
  ${svgLines.join("\n  ")}
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
