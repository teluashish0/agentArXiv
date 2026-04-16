function stripInlineMarkdown(value: string) {
  return value
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

function normalizeHeadingLabel(value: string) {
  return stripInlineMarkdown(value)
    .replace(/\s+/g, " ")
    .replace(/[.:]+$/g, "")
    .trim()
    .toLowerCase();
}

function isDuplicateSectionHeading(headingText: string, sectionTitle: string) {
  if (!sectionTitle.trim()) {
    return false;
  }

  return normalizeHeadingLabel(headingText) === normalizeHeadingLabel(sectionTitle);
}

export function normalizeManuscriptTextForDisplay(text: string, sectionTitle?: string) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const output: string[] = [];
  let seenContent = false;

  for (const rawLine of lines) {
    const trimmedLine = rawLine.trim();

    if (!trimmedLine) {
      output.push("");
      continue;
    }

    const headingMatch = trimmedLine.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);

    if (headingMatch) {
      const headingText = stripInlineMarkdown(headingMatch[1] ?? "").trim();

      if (!seenContent && sectionTitle && isDuplicateSectionHeading(headingText, sectionTitle)) {
        continue;
      }

      if (output.at(-1) !== "") {
        output.push("");
      }

      output.push(headingText);
      output.push("");
      seenContent = true;
      continue;
    }

    output.push(stripInlineMarkdown(rawLine));
    seenContent = true;
  }

  return output.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
