"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { workspacePaperTemplates } from "./workspace-paper-data";
import type {
  WorkspaceAgent,
  WorkspaceLatexDocument,
  WorkspaceLatexDocumentAsset,
  WorkspacePaperAuthor,
} from "./workspace-paper-data";

export type RenderedLatexCaret = {
  agentId: string;
  agentName: string;
  agentAccent: string;
  sectionId: string;
  sectionTitle: string;
  surface: "proposal" | "draft" | "paper";
  pageNumber: number;
  lineNumber: number;
  column: number;
  activity: "editing" | "complete";
  isTyping: boolean;
};

type RenderedPaperSection = {
  id: string;
  fragmentId: string;
  slotId: string;
  title: string;
  sectionNumber: number;
  pageNumber: number;
  lineNumber: number;
  paragraphs: string[];
  paragraphOffset: number;
  assets: RenderedPaperAsset[];
  showHeading: boolean;
  isContinuation: boolean;
  isActive: boolean;
  activeParagraphIndex?: number;
  highlightStart?: number;
  highlightEnd?: number;
  caret?: RenderedLatexCaret;
};

type RenderedPaperAsset =
  | {
      id: string;
      title: string;
      type: "figure" | "diagram" | "chart";
      kind: "image";
      src: string;
    }
  | {
      id: string;
      title: string;
      type: "table";
      kind: "table";
      headers: string[];
      rows: string[][];
    }
  | {
      id: string;
      title: string;
      type: string;
      kind: "text";
      text: string;
    };

export type RenderedLatexDocument = {
  surface: "proposal" | "draft" | "paper";
  title: string;
  paperTitle: string;
  authors: WorkspacePaperAuthor[];
  abstractText?: string;
  keywords?: string[];
  references?: string[];
  layoutMode: "single" | "double";
  templateId: WorkspaceLatexDocument["templateId"];
  sections: RenderedPaperSection[];
  carets: RenderedLatexCaret[];
  sectionCount: number;
  pages: Array<{
    number: number;
    sections: RenderedPaperSection[];
    includeHeader: boolean;
    includeFrontmatter: boolean;
    includeReferences: boolean;
  }>;
};

export type WorkspaceCapturedSelection = {
  surface: "proposal" | "draft" | "paper";
  text: string;
  pageNumber: number;
  sectionId?: string;
  sectionTitle?: string;
  agentId?: string;
  agentName?: string;
  contextText?: string;
};

type RenderedAffiliation = {
  index: number;
  label: string;
};

type PaperPresenceEntry = {
  agentId: string;
  agentName: string;
  agentAccent: string;
  status: "editing" | "viewing";
  sectionTitle: string;
};

function getAgentInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function normalizeSelectedText(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 900);
}

function buildPaperPresenceEntries(carets: RenderedLatexCaret[]) {
  const entryByAgent = new Map<string, PaperPresenceEntry>();

  for (const caret of carets) {
    if (caret.isTyping) {
      entryByAgent.set(caret.agentId, {
        agentId: caret.agentId,
        agentName: caret.agentName,
        agentAccent: caret.agentAccent,
        status: "editing",
        sectionTitle: caret.sectionTitle,
      });
      continue;
    }

    if (!entryByAgent.has(caret.agentId)) {
      entryByAgent.set(caret.agentId, {
        agentId: caret.agentId,
        agentName: caret.agentName,
        agentAccent: caret.agentAccent,
        status: "viewing",
        sectionTitle: caret.sectionTitle,
      });
    }
  }

  return [...entryByAgent.values()];
}

function getVisibleText(document: WorkspaceLatexDocument, sectionId: string, simulationTick: number) {
  const section = document.sections.find((item) => item.id === sectionId);

  if (!section) {
    return {
      text: "",
      elapsedTick: 0,
      progress: 0,
      isTyping: false,
    };
  }

  if (typeof section.liveText === "string") {
    return {
      text: section.liveText,
      elapsedTick: 0,
      progress: section.liveText.length,
      isTyping: section.isTyping ?? true,
    };
  }

  const elapsedTick = Math.max(simulationTick - section.startDelay, 0);
  const progress =
    simulationTick < section.startDelay
      ? 0
      : Math.min(section.targetText.length, Math.floor(elapsedTick / section.stepEvery));

  return {
    text: `${section.initialText}${section.targetText.slice(0, progress)}`,
    elapsedTick,
    progress,
    isTyping: progress > 0 && progress < section.targetText.length,
  };
}

function splitParagraphs(text: string) {
  const paragraphs = text
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.replace(/\n/g, " ").trim())
    .filter(Boolean);

  return paragraphs.length > 0 ? paragraphs : [""];
}

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

function parseMarkdownTable(content: string) {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2 || !lines[0]?.includes("|") || !isMarkdownTableSeparator(lines[1] ?? "")) {
    return null;
  }

  return {
    headers: splitMarkdownTableRow(lines[0] ?? ""),
    rows: lines
      .slice(2)
      .filter((line) => line.includes("|"))
      .map((line) => splitMarkdownTableRow(line)),
  };
}

function renderAssetFromDocument(asset: WorkspaceLatexDocumentAsset): RenderedPaperAsset {
  if (
    (asset.type === "figure" || asset.type === "diagram" || asset.type === "chart") &&
    asset.content.trim()
  ) {
    return {
      id: asset.id,
      title: asset.title,
      type: asset.type,
      kind: "image",
      src: asset.content.trim(),
    };
  }

  if (asset.type === "table") {
    const parsedTable = parseMarkdownTable(asset.content);

    if (parsedTable) {
      return {
        id: asset.id,
        title: asset.title,
        type: asset.type,
        kind: "table",
        headers: parsedTable.headers,
        rows: parsedTable.rows,
      };
    }
  }

  return {
    id: asset.id,
    title: asset.title,
    type: asset.type,
    kind: "text",
    text: asset.content.trim(),
  };
}

function orderSections(document: WorkspaceLatexDocument) {
  const orderIndex = new Map(document.sectionOrder.map((sectionId, index) => [sectionId, index]));

  return [...document.sections].sort((left, right) => {
    const leftIndex = orderIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = orderIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER;

    return leftIndex - rightIndex;
  });
}

function buildAffiliations(authors: WorkspacePaperAuthor[]) {
  const affiliationIndex = new Map<string, number>();
  const affiliations: RenderedAffiliation[] = [];

  for (const author of authors) {
    const label = [author.affiliation, author.location].filter(Boolean).join(", ");

    if (!affiliationIndex.has(label)) {
      const nextIndex = affiliations.length + 1;
      affiliationIndex.set(label, nextIndex);
      affiliations.push({
        index: nextIndex,
        label,
      });
    }
  }

  return {
    affiliations,
    getAuthorAffiliationIndex(author: WorkspacePaperAuthor) {
      const label = [author.affiliation, author.location].filter(Boolean).join(", ");
      return affiliationIndex.get(label) ?? 1;
    },
  };
}

function expandToWordBoundary(text: string, start: number, end: number) {
  if (!text) {
    return {
      start: 0,
      end: 0,
    };
  }

  let nextStart = Math.max(0, Math.min(start, text.length));
  let nextEnd = Math.max(nextStart, Math.min(end, text.length));

  while (nextStart > 0 && !/\s/.test(text.charAt(nextStart - 1))) {
    nextStart -= 1;
  }

  while (nextEnd < text.length && !/\s/.test(text.charAt(nextEnd))) {
    nextEnd += 1;
  }

  while (nextStart < nextEnd && /\s/.test(text.charAt(nextStart))) {
    nextStart += 1;
  }

  while (nextEnd > nextStart && /\s/.test(text.charAt(nextEnd - 1))) {
    nextEnd -= 1;
  }

  if (nextStart === nextEnd) {
    nextEnd = Math.min(text.length, nextEnd + 1);
  }

  return {
    start: nextStart,
    end: nextEnd,
  };
}

function getParagraphAnnotation(
  paragraphs: string[],
  isTyping: boolean,
) {
  if (!isTyping) {
    return undefined;
  }

  const populatedParagraphs = paragraphs
    .map((paragraph, index) => ({
      paragraph,
      index,
    }))
    .filter((entry) => entry.paragraph.trim().length > 0);

  const paragraphEntry = populatedParagraphs[populatedParagraphs.length - 1] ?? {
    paragraph: paragraphs.at(-1) ?? "",
    index: Math.max(0, paragraphs.length - 1),
  };
  const resolvedParagraphEntry = paragraphEntry ?? {
    paragraph: paragraphs[0] ?? "",
    index: 0,
  };
  const paragraph = resolvedParagraphEntry.paragraph;

  if (!paragraph) {
    return {
      activeParagraphIndex: resolvedParagraphEntry.index,
      highlightStart: 0,
      highlightEnd: 0,
    };
  }

  const trimmedEnd = paragraph.replace(/\s+$/g, "").length;
  const wordMatches = [...paragraph.slice(0, trimmedEnd).matchAll(/\S+/g)];
  const tailWords = wordMatches.slice(-2);
  const start = tailWords[0]?.index ?? Math.max(0, trimmedEnd - 10);
  const end = trimmedEnd;
  const expanded = expandToWordBoundary(paragraph, start, end);

  return {
    activeParagraphIndex: resolvedParagraphEntry.index,
    highlightStart: expanded.start,
    highlightEnd: expanded.end,
  };
}

function normalizeHighlightRange(paragraph: string, start: number, end: number) {
  if (!paragraph || !paragraph.trim()) {
    return {
      start: 0,
      end: 0,
    };
  }

  let nextStart = Math.max(0, Math.min(start, paragraph.length));
  let nextEnd = Math.max(nextStart, Math.min(end, paragraph.length));

  while (nextStart < nextEnd && /\s/.test(paragraph.charAt(nextStart))) {
    nextStart += 1;
  }

  while (nextEnd > nextStart && /\s/.test(paragraph.charAt(nextEnd - 1))) {
    nextEnd -= 1;
  }

  if (nextStart < nextEnd) {
    return {
      start: nextStart,
      end: nextEnd,
    };
  }

  const rightMatch = paragraph.slice(Math.min(end, paragraph.length)).search(/\S/);

  if (rightMatch >= 0) {
    return expandToWordBoundary(paragraph, end + rightMatch, end + rightMatch + 1);
  }

  for (let index = Math.max(0, start - 1); index >= 0; index -= 1) {
    if (/\S/.test(paragraph.charAt(index))) {
      return expandToWordBoundary(paragraph, index, index + 1);
    }
  }

  return {
    start: 0,
    end: 0,
  };
}

function estimateAssetUnits(
  asset: RenderedPaperAsset,
  layoutMode: "single" | "double",
) {
  if (asset.kind === "image") {
    return layoutMode === "double" ? 1.35 : 1.7;
  }

  if (asset.kind === "table") {
    return 0.85 + asset.rows.length * (layoutMode === "double" ? 0.12 : 0.15);
  }

  const textLength = asset.text.length;
  return 0.38 + textLength / (layoutMode === "double" ? 1600 : 1100);
}

function estimateParagraphUnits(
  paragraph: string,
  layoutMode: "single" | "double",
  isFirstParagraphInSection: boolean,
) {
  const base =
    layoutMode === "double"
      ? isFirstParagraphInSection
        ? 0.24
        : 0.18
      : isFirstParagraphInSection
        ? 0.3
        : 0.22;
  const textWeight = paragraph.length / (layoutMode === "double" ? 2600 : 1850);

  return base + textWeight;
}

function estimateHeadingUnits(layoutMode: "single" | "double") {
  return layoutMode === "double" ? 0.24 : 0.32;
}

function buildSectionFragment(
  section: RenderedPaperSection,
  pageNumber: number,
  fragmentIndex: number,
  paragraphStart: number,
  paragraphs: string[],
  assets: RenderedPaperAsset[],
): RenderedPaperSection {
  const hasActiveParagraph =
    section.activeParagraphIndex !== undefined &&
    section.activeParagraphIndex >= paragraphStart &&
    section.activeParagraphIndex < paragraphStart + paragraphs.length;

  return {
    ...section,
    fragmentId: `${section.id}__fragment_${fragmentIndex}`,
    pageNumber,
    paragraphs,
    paragraphOffset: paragraphStart,
    assets,
    showHeading: fragmentIndex === 0,
    isContinuation: fragmentIndex > 0,
    isActive: hasActiveParagraph,
    activeParagraphIndex:
      section.activeParagraphIndex !== undefined && hasActiveParagraph
        ? section.activeParagraphIndex - paragraphStart
        : undefined,
    highlightStart: hasActiveParagraph ? section.highlightStart : undefined,
    highlightEnd: hasActiveParagraph ? section.highlightEnd : undefined,
    caret: hasActiveParagraph ? section.caret : undefined,
  };
}

function paginateDocument(
  sections: RenderedPaperSection[],
  references: string[] | undefined,
  layoutMode: "single" | "double",
  hasFrontMatter: boolean,
) {
  const pages: RenderedLatexDocument["pages"] = [];
  const firstPageCapacity = layoutMode === "double" ? 4.45 : 4.75;
  const pageCapacity = layoutMode === "double" ? 5.8 : 6.25;
  const frontMatterUnits = hasFrontMatter ? (layoutMode === "double" ? 2.0 : 2.3) : 1.2;
  const referencesUnits = references?.length ? 1 + references.length * (layoutMode === "double" ? 0.2 : 0.26) : 0;
  const headingUnits = estimateHeadingUnits(layoutMode);

  let currentPage: RenderedLatexDocument["pages"][number] = {
    number: 1,
    sections: [],
    includeHeader: true,
    includeFrontmatter: hasFrontMatter,
    includeReferences: false,
  };
  let currentUnits = frontMatterUnits;
  let currentCapacity = firstPageCapacity;

  const pushNewPage = () => {
    pages.push(currentPage);
    currentPage = {
      number: pages.length + 1,
      sections: [],
      includeHeader: false,
      includeFrontmatter: false,
      includeReferences: false,
    };
    currentUnits = 0;
    currentCapacity = pageCapacity;
  };

  for (const section of sections) {
    let paragraphIndex = 0;
    let assetIndex = 0;
    let fragmentIndex = 0;

    const hasContent = section.paragraphs.length > 0 || section.assets.length > 0;

    if (!hasContent) {
      currentPage.sections.push(
        buildSectionFragment(section, currentPage.number, fragmentIndex, 0, [""], []),
      );
      currentUnits += headingUnits;
      continue;
    }

    while (paragraphIndex < section.paragraphs.length || assetIndex < section.assets.length) {
      let fragmentParagraphs: string[] = [];
      let fragmentAssets: RenderedPaperAsset[] = [];
      let fragmentUnits = fragmentIndex === 0 ? headingUnits : 0;
      const paragraphStart = paragraphIndex;

      if (
        currentPage.sections.length > 0 &&
        currentUnits + fragmentUnits > currentCapacity
      ) {
        pushNewPage();
      }

      while (paragraphIndex < section.paragraphs.length) {
        const paragraph = section.paragraphs[paragraphIndex] ?? "";
        const paragraphUnits = estimateParagraphUnits(
          paragraph,
          layoutMode,
          paragraphIndex === 0,
        );
        const wouldOverflow = currentUnits + fragmentUnits + paragraphUnits > currentCapacity;

        if (wouldOverflow && fragmentParagraphs.length + fragmentAssets.length > 0) {
          break;
        }

        if (wouldOverflow && currentPage.sections.length > 0) {
          pushNewPage();
          fragmentUnits = fragmentIndex === 0 ? headingUnits : 0;
          fragmentParagraphs = [];
          fragmentAssets = [];
          continue;
        }

        fragmentParagraphs.push(paragraph);
        fragmentUnits += paragraphUnits;
        paragraphIndex += 1;
      }

      while (
        paragraphIndex >= section.paragraphs.length &&
        assetIndex < section.assets.length
      ) {
        const asset = section.assets[assetIndex]!;
        const assetUnits = estimateAssetUnits(asset, layoutMode);
        const wouldOverflow = currentUnits + fragmentUnits + assetUnits > currentCapacity;

        if (wouldOverflow && fragmentParagraphs.length + fragmentAssets.length > 0) {
          break;
        }

        if (wouldOverflow && currentPage.sections.length > 0) {
          pushNewPage();
          fragmentUnits = fragmentIndex === 0 ? headingUnits : 0;
          fragmentParagraphs = [];
          fragmentAssets = [];
          continue;
        }

        fragmentAssets.push(asset);
        fragmentUnits += assetUnits;
        assetIndex += 1;
      }

      currentPage.sections.push(
        buildSectionFragment(
          section,
          currentPage.number,
          fragmentIndex,
          paragraphStart,
          fragmentParagraphs,
          fragmentAssets,
        ),
      );
      currentUnits += fragmentUnits;
      fragmentIndex += 1;

      if (paragraphIndex < section.paragraphs.length || assetIndex < section.assets.length) {
        pushNewPage();
      }
    }
  }

  if (references?.length) {
    if (currentPage.sections.length > 0 && currentUnits + referencesUnits > currentCapacity) {
      pushNewPage();
      currentPage.includeReferences = true;
    } else {
      currentPage.includeReferences = true;
    }
  }

  pages.push(currentPage);

  return pages;
}

export function buildRenderedLatexDocument(
  document: WorkspaceLatexDocument,
  agents: WorkspaceAgent[],
  surface: "proposal" | "draft" | "paper",
  simulationTick: number,
) {
  const template = workspacePaperTemplates[document.templateId];
  const structuredSlots = template.structures[document.id === "proposal" ? "proposal" : "draft"];
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  const sections: RenderedPaperSection[] = [];
  const carets: RenderedLatexCaret[] = [];
  const sourceLines = [...document.preambleLines];
  const orderedSections = orderSections(document);
  const renderEntries =
    orderedSections.length > 0
      ? orderedSections.map((section) => ({
          id: section.id,
          slotId: section.slotId,
          title: section.title,
          heading: section.heading,
          section,
        }))
      : structuredSlots.map((slot) => ({
          id: `${document.id}_${slot.slotId}`,
          slotId: slot.slotId,
          title: slot.title,
          heading: slot.heading,
          section: undefined,
        }));

  if (document.abstractText) {
    sourceLines.push("\\begin{abstract}");
    sourceLines.push(document.abstractText);
    sourceLines.push("\\end{abstract}");
    sourceLines.push("");
  }

  if (document.keywords?.length) {
    sourceLines.push(`\\noindent\\textbf{Keywords:} ${document.keywords.join(", ")}`);
    sourceLines.push("");
  }

  for (const [slotIndex, renderEntry] of renderEntries.entries()) {
    const resolvedSection = renderEntry.section ?? {
      id: renderEntry.id,
      slotId: renderEntry.slotId,
      title: renderEntry.title,
      role: "template",
      heading: renderEntry.heading,
      initialText: "",
      liveText: undefined,
      isTyping: false,
      assets: [],
      targetText: "",
      startDelay: 0,
      stepEvery: 2,
    };
    const agent = resolvedSection.agentId ? agentById.get(resolvedSection.agentId) : undefined;
    const { text, isTyping } = getVisibleText(document, resolvedSection.id, simulationTick);
    const paragraphs = splitParagraphs(text);
    const assets = (resolvedSection.assets ?? []).map((asset) => renderAssetFromDocument(asset));
    const contentLines = text.length > 0 ? text.split("\n") : [""];
    const headingLine = sourceLines.length + 1;
    const finalLineIndex = Math.max(0, contentLines.length - 1);
    const caretLineText = contentLines[finalLineIndex] ?? "";

    sourceLines.push(resolvedSection.heading);

    for (const line of contentLines) {
      sourceLines.push(line);
    }

    const caret =
      agent
        ? ({
            agentId: agent.id,
            agentName: agent.name,
            agentAccent: agent.accent,
            sectionId: resolvedSection.id,
            sectionTitle: resolvedSection.title,
            surface,
            pageNumber: resolvedSection.pageHint ?? 1,
            lineNumber: headingLine + 1 + finalLineIndex,
            column: caretLineText.length,
            activity: isTyping ? "editing" : "complete",
            isTyping,
          } satisfies RenderedLatexCaret)
        : undefined;

    const paragraphAnnotation = caret ? getParagraphAnnotation(paragraphs, caret.isTyping) : undefined;

    if (caret) {
      carets.push(caret);
    }

    sections.push({
      id: resolvedSection.id,
      fragmentId: `${resolvedSection.id}__fragment_0`,
      slotId: resolvedSection.slotId,
      title: resolvedSection.title,
      sectionNumber: slotIndex + 1,
      pageNumber: resolvedSection.pageHint ?? 1,
      lineNumber: headingLine,
      paragraphs,
      paragraphOffset: 0,
      assets,
      showHeading: true,
      isContinuation: false,
      isActive: isTyping,
      activeParagraphIndex: paragraphAnnotation?.activeParagraphIndex,
      highlightStart: paragraphAnnotation?.highlightStart,
      highlightEnd: paragraphAnnotation?.highlightEnd,
      caret,
    });

    sourceLines.push("");
  }

  sourceLines.push(...document.closingLines);
  const pages = paginateDocument(sections, document.references, document.layoutMode ?? template.layoutMode, Boolean(document.abstractText));
  const firstPageNumberBySectionId = new Map<string, number>();
  const caretPageNumberBySectionId = new Map<string, number>();

  for (const page of pages) {
    for (const section of page.sections) {
      if (!firstPageNumberBySectionId.has(section.id)) {
        firstPageNumberBySectionId.set(section.id, page.number);
      }

      if (section.caret) {
        caretPageNumberBySectionId.set(section.id, page.number);
      }
    }
  }

  return {
    surface,
    title: document.title,
    paperTitle: document.paperTitle,
    authors: document.authors,
    abstractText: document.abstractText,
    keywords: document.keywords,
    references: document.references,
    layoutMode: document.layoutMode ?? template.layoutMode,
    templateId: document.templateId,
    sections: sections.map((section) => ({
      ...section,
      pageNumber: firstPageNumberBySectionId.get(section.id) ?? section.pageNumber,
    })),
    carets: carets.map((caret) => ({
      ...caret,
      pageNumber:
        caretPageNumberBySectionId.get(caret.sectionId) ??
        firstPageNumberBySectionId.get(caret.sectionId) ??
        caret.pageNumber,
    })),
    sectionCount: document.sections.length,
    pages,
  } satisfies RenderedLatexDocument;
}

export function WorkspaceLatexSurface({
  hidden,
  renderedDocument,
  onSelectionCapture,
}: {
  hidden: boolean;
  renderedDocument: RenderedLatexDocument;
  onSelectionCapture: (selection: WorkspaceCapturedSelection | null) => void;
}) {
  const template = workspacePaperTemplates[renderedDocument.templateId];
  const { affiliations, getAuthorAffiliationIndex } = buildAffiliations(renderedDocument.authors);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Array<HTMLElement | null>>([]);
  const [zoom, setZoom] = useState(1.44);
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = renderedDocument.pages.length;
  const paperPresenceEntries = buildPaperPresenceEntries(renderedDocument.carets);
  const displayedPresenceEntries = paperPresenceEntries.slice(0, 5);
  const overflowPresenceCount = Math.max(0, paperPresenceEntries.length - displayedPresenceEntries.length);
  const clampedZoom = Math.max(0.6, Math.min(2, zoom));
  const zoomPercentage = Math.round(clampedZoom * 100);
  const paperStyle = {
    "--workspace-paper-page-width": template.typography.pageWidth,
    "--workspace-paper-header-padding": template.typography.headerPadding,
    "--workspace-paper-header-gap": template.typography.headerGap,
    "--workspace-paper-title-size": template.typography.titleSize,
    "--workspace-paper-title-line-height": template.typography.titleLineHeight,
    "--workspace-paper-author-name-size": template.typography.authorNameSize,
    "--workspace-paper-author-meta-size": template.typography.authorMetaSize,
    "--workspace-paper-author-block-gap": template.typography.authorBlockGap,
    "--workspace-paper-affiliation-gap": template.typography.affiliationGap,
    "--workspace-paper-correspondence-spacing": template.typography.correspondenceSpacing,
    "--workspace-paper-frontmatter-padding": template.typography.frontMatterPadding,
    "--workspace-paper-abstract-padding": template.typography.abstractPadding,
    "--workspace-paper-abstract-heading-size": template.typography.abstractHeadingSize,
    "--workspace-paper-abstract-heading-spacing": template.typography.abstractHeadingSpacing,
    "--workspace-paper-abstract-text-size": template.typography.abstractTextSize,
    "--workspace-paper-abstract-text-line-height": template.typography.abstractTextLineHeight,
    "--workspace-paper-keywords-size": template.typography.keywordsSize,
    "--workspace-paper-keywords-spacing": template.typography.keywordsSpacing,
    "--workspace-paper-body-padding": template.typography.bodyPadding,
    "--workspace-paper-continuation-body-padding": template.typography.continuationBodyPadding,
    "--workspace-paper-section-spacing": template.typography.sectionSpacing,
    "--workspace-paper-section-title-size": template.typography.sectionTitleSize,
    "--workspace-paper-section-title-line-height": template.typography.sectionTitleLineHeight,
    "--workspace-paper-section-title-spacing": template.typography.sectionTitleSpacing,
    "--workspace-paper-paragraph-size": template.typography.paragraphSize,
    "--workspace-paper-paragraph-line-height": template.typography.paragraphLineHeight,
    "--workspace-paper-paragraph-spacing": template.typography.paragraphSpacing,
    "--workspace-paper-reference-size": template.typography.referenceSize,
    "--workspace-paper-reference-line-height": template.typography.referenceLineHeight,
    "--workspace-paper-reference-spacing": template.typography.referenceSpacing,
    "--workspace-paper-page-number-offset": template.typography.pageNumberOffset,
    "--workspace-paper-scale": String(clampedZoom),
  } as CSSProperties;
  useEffect(() => {
    const container = scrollRef.current;

    if (!container) {
      return;
    }

    const handleScroll = () => {
      const containerRect = container.getBoundingClientRect();
      let nextPage = 1;
      let smallestDistance = Number.POSITIVE_INFINITY;

      for (const page of pageRefs.current) {
        if (!page) {
          continue;
        }

        const rect = page.getBoundingClientRect();
        const distance = Math.abs(rect.top - containerRect.top - 48);

        if (distance < smallestDistance) {
          smallestDistance = distance;
          nextPage = Number(page.dataset.pageNumber ?? 1);
        }
      }

      setCurrentPage(nextPage);
    };

    handleScroll();
    container.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [clampedZoom, renderedDocument.pages]);

  const scaleDown = () => {
    setZoom((currentZoom) => Math.max(0.6, Number((currentZoom - 0.08).toFixed(2))));
  };

  const scaleUp = () => {
    setZoom((currentZoom) => Math.min(2, Number((currentZoom + 0.08).toFixed(2))));
  };

  const captureSelection = () => {
    const domSelection = window.getSelection();
    const selectedText = normalizeSelectedText(domSelection?.toString() ?? "");

    if (!domSelection || domSelection.isCollapsed || !selectedText) {
      onSelectionCapture(null);
      return;
    }

    const range = domSelection.rangeCount > 0 ? domSelection.getRangeAt(0) : null;
    const anchorElement =
      range?.commonAncestorContainer instanceof Element
        ? range.commonAncestorContainer
        : range?.commonAncestorContainer.parentElement ??
          (domSelection.anchorNode instanceof Element
            ? domSelection.anchorNode
            : domSelection.anchorNode?.parentElement ?? null);
    const sectionElement = anchorElement?.closest<HTMLElement>("[data-section-id]");
    const pageElement = anchorElement?.closest<HTMLElement>("[data-page-number]");
    const sectionId = sectionElement?.dataset.sectionId;
    const section = renderedDocument.sections.find((item) => item.id === sectionId);
    const pageNumber = Number(sectionElement?.dataset.pageNumber ?? pageElement?.dataset.pageNumber ?? 1);

    onSelectionCapture({
      surface: renderedDocument.surface,
      text: selectedText,
      pageNumber,
      sectionId,
      sectionTitle: sectionElement?.dataset.sectionTitle,
      agentId: sectionElement?.dataset.agentId,
      agentName: sectionElement?.dataset.agentName,
      contextText: section?.paragraphs.join("\n\n").trim(),
    });
  };

  const renderParagraphWithAgentOverlay = (
    section: RenderedPaperSection,
    paragraph: string,
    paragraphIndex: number,
  ) => {
    const isActiveParagraph = Boolean(section.caret) && section.activeParagraphIndex === paragraphIndex;

    if (!isActiveParagraph || !section.caret) {
      return paragraph || <span className="workspace-paper-empty-text">&nbsp;</span>;
    }
    const content = paragraph || <span className="workspace-paper-empty-text">&nbsp;</span>;

    return (
      <>
        {content}
        <span className="workspace-paper-caret-host">
          <span
            className={[
              "workspace-paper-caret-anchor",
              section.caret.isTyping ? "is-typing" : "",
            ]
              .join(" ")
              .trim()}
            style={
              {
                "--workspace-agent-accent": section.caret.agentAccent,
              } as CSSProperties
            }
          >
            <span className="workspace-paper-caret-pill">{section.caret.agentName}</span>
            <span className="workspace-paper-caret-stem" />
          </span>
        </span>
      </>
    );
  };

  const renderSectionAsset = (
    section: RenderedPaperSection,
    asset: RenderedPaperAsset,
    assetIndex: number,
  ) => {
    const labelPrefix = asset.kind === "table" ? "Table" : "Figure";
    const label = `${labelPrefix} ${section.sectionNumber}.${assetIndex + 1}`;

    if (asset.kind === "image") {
      return (
        <figure className="workspace-paper-figure" key={asset.id}>
          <img
            alt={asset.title}
            className="workspace-paper-figure-image"
            loading="lazy"
            src={asset.src}
          />
          <figcaption className="workspace-paper-asset-caption">
            <strong>{label}.</strong> {asset.title}
          </figcaption>
        </figure>
      );
    }

    if (asset.kind === "table") {
      return (
        <div className="workspace-paper-table-block" key={asset.id}>
          <p className="workspace-paper-asset-caption">
            <strong>{label}.</strong> {asset.title}
          </p>
          <table className="workspace-paper-table">
            <thead>
              <tr>
                {asset.headers.map((header, headerIndex) => (
                  <th key={`${asset.id}-header-${headerIndex}`} scope="col">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {asset.rows.map((row, rowIndex) => (
                <tr key={`${asset.id}-row-${rowIndex}`}>
                  {asset.headers.map((_, cellIndex) => (
                    <td key={`${asset.id}-cell-${rowIndex}-${cellIndex}`}>
                      {row[cellIndex] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return (
      <div className="workspace-paper-text-asset" key={asset.id}>
        <p className="workspace-paper-asset-caption">
          <strong>{label}.</strong> {asset.title}
        </p>
        <pre>{asset.text || `${asset.type} asset`}</pre>
      </div>
    );
  };

  return (
    <div className="workspace-editor-surface" hidden={hidden} aria-hidden={hidden} style={paperStyle}>
      <header className="workspace-toolbar">
        <div className="workspace-toolbar-spacer" aria-hidden="true" />

        <div className="workspace-toolbar-group workspace-toolbar-group-centered">
          <div className="workspace-page-indicator-field" aria-label={`Page ${currentPage} of ${totalPages}`}>
            <div className="workspace-page-indicator workspace-page-indicator-detail">
              {currentPage} / {totalPages}
            </div>
          </div>
        </div>

        <div className="workspace-toolbar-group workspace-toolbar-group-right">
          <div className="workspace-toolbar-zoom-value" aria-label={`Zoom ${zoomPercentage}%`}>
            {zoomPercentage}%
          </div>
          <button
            aria-label="Zoom out"
            className="workspace-toolbar-icon-button workspace-toolbar-icon-button-light"
            onClick={scaleDown}
            type="button"
          >
            <ZoomOut className="workspace-toolbar-icon" absoluteStrokeWidth strokeWidth={2.1} />
          </button>
          <button
            aria-label="Zoom in"
            className="workspace-toolbar-icon-button workspace-toolbar-icon-button-light"
            onClick={scaleUp}
            type="button"
          >
            <ZoomIn className="workspace-toolbar-icon" absoluteStrokeWidth strokeWidth={2.1} />
          </button>
        </div>
      </header>

      {displayedPresenceEntries.length > 0 || overflowPresenceCount > 0 ? (
        <div className="workspace-paper-utility-row">
          <div className="workspace-paper-presence" aria-label={`Agents on ${renderedDocument.title}`}>
            {displayedPresenceEntries.map((entry) => (
              <button
                aria-label={`${entry.agentName}. ${entry.status === "editing" ? "Editing" : "Viewing"} ${entry.sectionTitle}.`}
                className="workspace-presence-avatar workspace-paper-presence-avatar"
                key={`${renderedDocument.title}-${entry.agentId}`}
                style={
                  {
                    "--workspace-agent-accent": entry.agentAccent,
                  } as CSSProperties
                }
                type="button"
              >
                <span className="workspace-presence-avatar-label workspace-paper-presence-avatar-label">
                  {getAgentInitials(entry.agentName)}
                </span>
                <span className="workspace-presence-tooltip">
                  <strong>{entry.agentName}</strong>
                  <span>{entry.status === "editing" ? "Editing" : "Viewing"} · {entry.sectionTitle}</span>
                  <span>{renderedDocument.title}</span>
                </span>
              </button>
            ))}
            {overflowPresenceCount > 0 ? (
              <span className="workspace-presence-avatar workspace-presence-avatar-overflow workspace-paper-presence-avatar">
                +{overflowPresenceCount}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div
        className="workspace-paper-preview-scroll"
        onMouseUp={captureSelection}
        onKeyUp={captureSelection}
        ref={scrollRef}
      >
        <div className="workspace-paper-stage">
          {renderedDocument.pages.map((page, pageIndex) => (
            <div className="workspace-paper-page-shell" key={`${renderedDocument.title}-page-${page.number}`}>
              <article
                className="workspace-paper-page"
                data-page-number={page.number}
                ref={(node) => {
                  pageRefs.current[pageIndex] = node;
                }}
              >
                {page.includeHeader ? (
                  <header className="workspace-paper-header" data-page-number={page.number} data-line-number={1}>
                    <h1 className="workspace-paper-title">{renderedDocument.paperTitle}</h1>

                    <div className="workspace-paper-authors">
                      <p className="workspace-paper-author-line">
                        {renderedDocument.authors.map((author, authorIndex) => (
                          <span key={author.id}>
                            {authorIndex > 0 ? ", " : ""}
                            <span>{author.name}</span>
                            <sup>{getAuthorAffiliationIndex(author)}</sup>
                          </span>
                        ))}
                      </p>

                      <div className="workspace-paper-affiliations">
                        {affiliations.map((affiliation) => (
                          <p className="workspace-paper-affiliation-line" key={affiliation.index}>
                            <sup>{affiliation.index}</sup>
                            <span>{affiliation.label}</span>
                          </p>
                        ))}
                      </div>

                      {renderedDocument.authors.some((author) => author.email) ? (
                        <p className="workspace-paper-correspondence">
                          Correspondence: {renderedDocument.authors.map((author) => author.email).join(", ")}
                        </p>
                      ) : null}
                    </div>
                  </header>
                ) : null}

                {page.includeFrontmatter && renderedDocument.abstractText ? (
                  <section className="workspace-paper-frontmatter" data-page-number={page.number} data-line-number={1}>
                    {template.frontMatterStyle === "ieee" ? (
                      <p className="workspace-paper-abstract workspace-paper-abstract-inline">
                        <strong>Abstract</strong>
                        <span>&mdash;</span>
                        <span>{renderedDocument.abstractText}</span>
                      </p>
                    ) : (
                      <div className="workspace-paper-abstract">
                        <h2>Abstract</h2>
                        <p>{renderedDocument.abstractText}</p>
                      </div>
                    )}

                    {renderedDocument.keywords?.length ? (
                      <p className="workspace-paper-keywords">
                        <strong>Keywords:</strong> {renderedDocument.keywords.join(", ")}
                      </p>
                    ) : null}
                  </section>
                ) : null}

                <div
                  className={[
                    "workspace-paper-body",
                    !page.includeHeader && !page.includeFrontmatter ? "is-continuation-page" : "",
                    renderedDocument.layoutMode === "single" ? "is-single-column" : "is-double-column",
                  ]
                    .join(" ")
                    .trim()}
                >
                  {page.sections.map((section) => (
                    <section
                      className={[
                        "workspace-paper-section",
                        section.isContinuation ? "is-continuation" : "",
                      ]
                        .join(" ")
                        .trim()}
                      data-agent-id={section.caret?.agentId}
                      data-agent-name={section.caret?.agentName}
                      data-page-number={page.number}
                      data-section-id={section.id}
                      data-section-title={section.title}
                      data-line-number={section.lineNumber}
                      key={section.fragmentId}
                    >
                      {section.showHeading ? (
                        <h2 className="workspace-paper-section-title">
                          <span className="workspace-paper-section-number">{section.sectionNumber}.</span>
                          <span>{section.title}</span>
                        </h2>
                      ) : null}

                      {section.paragraphs.map((paragraph, paragraphIndex) => {
                        return (
                          <p className="workspace-paper-paragraph" key={`${section.id}-${paragraphIndex}`}>
                            {renderParagraphWithAgentOverlay(section, paragraph, paragraphIndex)}
                          </p>
                        );
                      })}

                      {section.assets.map((asset, assetIndex) =>
                        renderSectionAsset(section, asset, assetIndex),
                      )}
                    </section>
                  ))}

                  {page.includeReferences && renderedDocument.references?.length ? (
                    <section
                      className="workspace-paper-section workspace-paper-references"
                      data-page-number={page.number}
                      data-line-number={1}
                    >
                      <h2 className="workspace-paper-section-title">
                        <span className="workspace-paper-section-number">{renderedDocument.sections.length + 1}.</span>
                        <span>References</span>
                      </h2>

                      <ol className="workspace-paper-reference-list">
                        {renderedDocument.references.map((reference, referenceIndex) => (
                          <li className="workspace-paper-reference-item" key={`${renderedDocument.title}-ref-${referenceIndex}`}>
                            {reference}
                          </li>
                        ))}
                      </ol>
                    </section>
                  ) : null}
                </div>

                <footer className="workspace-paper-page-number" aria-hidden="true">
                  {page.number}
                </footer>
              </article>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
