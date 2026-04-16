import { parsePaperPreviewBlocks, type PaperPreviewBlock } from "./paper-preview";

export type PaperShowcaseInput = {
  summary?: string;
  abstractText?: string;
  ideaSummary?: string;
  content?: string;
};

const methodologyHeadings = [
  "approach",
  "method",
  "methods",
  "methodology",
  "experimental setup",
  "evaluation setup",
];

const resultsHeadings = [
  "results",
  "results and discussion",
  "evaluation",
  "findings",
  "discussion",
];

const conclusionHeadings = [
  "conclusion",
  "conclusions",
  "takeaway",
  "takeaways",
];

function normalizeMarkdownText(value: string) {
  return value
    .replace(/!\[(.*?)\]\((.+?)\)/g, "$1")
    .replace(/\[(.*?)\]\((.+?)\)/g, "$1")
    .replace(/\[(.*?)\]/g, "$1")
    .replace(/[*_`>#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitIntoSentences(value: string) {
  return normalizeMarkdownText(value)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 24);
}

function normalizeSentenceKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findSectionLeadText(blocks: PaperPreviewBlock[], headings: readonly string[]) {
  let insideMatch = false;

  for (const block of blocks) {
    if (block.type === "heading") {
      const normalizedHeading = block.text.trim().toLowerCase();

      if (headings.includes(normalizedHeading)) {
        insideMatch = true;
        continue;
      }

      if (insideMatch) {
        break;
      }

      continue;
    }

    if (!insideMatch) {
      continue;
    }

    if (block.type === "paragraph" && block.text.trim()) {
      return block.text.trim();
    }

    if (block.type === "list" && block.items.length > 0) {
      return block.items.join(" ");
    }
  }

  return undefined;
}

function appendFreshSentences(
  target: string[],
  seen: Set<string>,
  source: string | undefined,
  limit: number,
) {
  if (!source) {
    return;
  }

  for (const sentence of splitIntoSentences(source)) {
    const key = normalizeSentenceKey(sentence);

    if (!key || seen.has(key)) {
      continue;
    }

    target.push(sentence);
    seen.add(key);

    if (target.length >= limit) {
      return;
    }
  }
}

export function buildPaperShowcaseText({
  summary,
  abstractText,
  ideaSummary,
  content,
}: PaperShowcaseInput) {
  const blocks = content ? parsePaperPreviewBlocks(content, "") : [];
  const resultsLead = findSectionLeadText(blocks, resultsHeadings);
  const methodologyLead = findSectionLeadText(blocks, methodologyHeadings);
  const conclusionLead = findSectionLeadText(blocks, conclusionHeadings);

  const sentences: string[] = [];
  const seen = new Set<string>();

  appendFreshSentences(sentences, seen, ideaSummary, 1);
  appendFreshSentences(sentences, seen, abstractText || summary, 3);
  appendFreshSentences(sentences, seen, methodologyLead, 4);
  appendFreshSentences(sentences, seen, resultsLead, 5);
  appendFreshSentences(sentences, seen, conclusionLead, 6);

  const fallbackText = normalizeMarkdownText(
    abstractText || summary || ideaSummary || resultsLead || conclusionLead || "",
  );

  if (sentences.length === 0) {
    return fallbackText;
  }

  const showcaseSentences: string[] = [];
  let totalLength = 0;

  for (const sentence of sentences) {
    if (showcaseSentences.length >= 4) {
      break;
    }

    const candidateLength = totalLength + sentence.length + (showcaseSentences.length > 0 ? 1 : 0);

    if (showcaseSentences.length > 0 && candidateLength > 720) {
      break;
    }

    showcaseSentences.push(sentence);
    totalLength = candidateLength;
  }

  return showcaseSentences.join(" ").trim() || fallbackText;
}
