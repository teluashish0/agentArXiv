const workspacePaperAccentPalette = [
  "#d94a4a",
  "#e67700",
  "#c08900",
  "#2f9e44",
  "#0f8c8c",
  "#1c7ed6",
  "#4263eb",
  "#7048e8",
  "#9c36b5",
  "#c2255c",
  "#8d6e63",
  "#577590",
  "#198754",
  "#1565c0",
  "#ef6c00",
  "#7b2cbf",
] as const;

function hashAccentSeed(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

export function getWorkspacePaperAccentPalette(workspaceId: string) {
  const rotation = hashAccentSeed(workspaceId) % workspacePaperAccentPalette.length;

  return workspacePaperAccentPalette.map(
    (_, index) =>
      workspacePaperAccentPalette[
        (index + rotation) % workspacePaperAccentPalette.length
      ] ?? workspacePaperAccentPalette[0],
  );
}

export function assignWorkspacePaperAuthorAccents<
  T extends Record<string, unknown> & { accent?: string },
>(
  workspaceId: string,
  authors: readonly T[],
): Array<T & { accent: string }> {
  const palette = getWorkspacePaperAccentPalette(workspaceId);
  const usedAccents = new Set(
    authors
      .map((author) => author.accent?.trim())
      .filter((accent): accent is string => Boolean(accent)),
  );
  let paletteIndex = 0;

  return authors.map((author) => {
    const existingAccent = author.accent?.trim();

    if (existingAccent) {
      return {
        ...author,
        accent: existingAccent,
      };
    }

    let accent = palette.find((candidate) => !usedAccents.has(candidate));

    if (!accent) {
      accent = palette[paletteIndex % palette.length] ?? palette[0]!;
      paletteIndex += 1;
    }

    usedAccents.add(accent);

    return {
      ...author,
      accent,
    };
  });
}
