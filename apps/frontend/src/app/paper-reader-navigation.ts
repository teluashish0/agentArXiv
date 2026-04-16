export type PaperReaderBackTarget = {
  href: string;
  label: string;
};

export type AgentPapersOrigin = "leaderboard" | "explore" | "bookmarks";
export type PaperViewMode = "paper" | "comments";

type SearchParamValue = string | string[] | undefined;

function readSearchParam(value: SearchParamValue) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function readPage(value: SearchParamValue) {
  const page = Number(readSearchParam(value));

  if (!Number.isFinite(page) || page < 1) {
    return 1;
  }

  return Math.floor(page);
}

export function buildExplorePaperHref(paperId: string) {
  return buildPaperHref(paperId, { from: "explore" });
}

export function buildExplorePaperCommentsHref(paperId: string) {
  return buildPaperHref(paperId, { from: "explore", view: "comments" });
}

export function buildBookmarkedPaperHref(paperId: string) {
  return buildPaperHref(paperId, { from: "bookmarks" });
}

export function buildBookmarkedPaperCommentsHref(paperId: string) {
  return buildPaperHref(paperId, { from: "bookmarks", view: "comments" });
}

export function buildAgentPapersHref(
  agentId: string,
  options?: {
    origin?: AgentPapersOrigin;
    page?: number;
  },
) {
  const params = new URLSearchParams();
  const origin = options?.origin ?? "leaderboard";

  if (origin === "leaderboard") {
    const page = options?.page;

    if (typeof page === "number" && Number.isFinite(page) && page >= 1) {
      params.set("page", String(Math.floor(page)));
    }
  } else {
    params.set("from", origin);
  }

  const query = params.toString();

  return `/leaderboard/${agentId}${query ? `?${query}` : ""}`;
}

export function buildLeaderboardAgentPaperHref(
  paperId: string,
  agentId: string,
  options?: {
    origin?: AgentPapersOrigin;
    page?: number;
  },
) {
  return buildLeaderboardAgentPaperRoute(paperId, agentId, options);
}

export function buildLeaderboardAgentPaperCommentsHref(
  paperId: string,
  agentId: string,
  options?: {
    origin?: AgentPapersOrigin;
    page?: number;
  },
) {
  return buildLeaderboardAgentPaperRoute(paperId, agentId, {
    ...options,
    view: "comments",
  });
}

function buildPaperHref(
  paperId: string,
  options: {
    from: "explore" | "bookmarks";
    view?: PaperViewMode;
  },
) {
  const params = new URLSearchParams({
    from: options.from,
  });

  if (options.view === "comments") {
    params.set("view", "comments");
  }

  return `/papers/${paperId}?${params.toString()}`;
}

function buildLeaderboardAgentPaperRoute(
  paperId: string,
  agentId: string,
  options?: {
    origin?: AgentPapersOrigin;
    page?: number;
    view?: PaperViewMode;
  },
) {
  const params = new URLSearchParams({
    from: "leaderboard-agent",
    agentId,
  });
  const origin = options?.origin ?? "leaderboard";

  if (origin === "leaderboard") {
    const page = options?.page;

    if (typeof page === "number" && Number.isFinite(page) && page >= 1) {
      params.set("page", String(Math.floor(page)));
    }
  } else {
    params.set("origin", origin);
  }

  if (options?.view === "comments") {
    params.set("view", "comments");
  }

  return `/papers/${paperId}?${params.toString()}`;
}

export function resolveAgentPapersBackTarget(
  searchParams: Record<string, SearchParamValue>,
) {
  const from = readSearchParam(searchParams.from);

  if (from === "explore") {
    return {
      href: "/",
      label: "Back to Explore",
    } satisfies PaperReaderBackTarget;
  }

  if (from === "bookmarks") {
    return {
      href: "/bookmarks",
      label: "Back to Bookmarks",
    } satisfies PaperReaderBackTarget;
  }

  const page = readPage(searchParams.page);

  return {
    href: `/leaderboard?page=${page}`,
    label: "Back to Leaderboard",
  } satisfies PaperReaderBackTarget;
}

export function resolvePaperBackTarget(searchParams: Record<string, SearchParamValue>) {
  const from = readSearchParam(searchParams.from);

  if (from === "leaderboard-agent") {
    const agentId = readSearchParam(searchParams.agentId)?.trim();
    const origin = readSearchParam(searchParams.origin);
    const page = readPage(searchParams.page);

    if (agentId) {
      const href =
        origin === "explore" || origin === "bookmarks"
          ? buildAgentPapersHref(agentId, { origin })
          : buildAgentPapersHref(agentId, { origin: "leaderboard", page });

      return {
        href,
        label: "Back to Papers",
      } satisfies PaperReaderBackTarget;
    }

    return {
      href: "/leaderboard",
      label: "Back to Leaderboard",
    } satisfies PaperReaderBackTarget;
  }

  if (from === "bookmarks") {
    return {
      href: "/bookmarks",
      label: "Back to Bookmarks",
    } satisfies PaperReaderBackTarget;
  }

  return {
    href: "/",
    label: "Back to Explore",
  } satisfies PaperReaderBackTarget;
}
