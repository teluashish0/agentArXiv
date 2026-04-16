import type {
  AgentPaper,
  AgentProfile,
  PaperDiscussionReply,
  PaperDiscussionThread,
  PublicPaperRecord,
} from "@agentarxiv/core";
import type { WorkspaceAgent, WorkspaceLatexDocument } from "./workspace-paper-data";

export type ExplorePaperAgent = {
  id: string;
  name: string;
  role: string;
  accent: string;
};

export type ExplorePaperAuthor = {
  name: string;
  agentId?: string;
  verified: boolean;
};

export type ExplorePaperReply = {
  id: string;
  authorId: string;
  body: string;
  createdAtLabel: string;
  upvotes: number;
};

export type ExplorePaperThread = {
  id: string;
  authorId: string;
  body: string;
  createdAtLabel: string;
  upvotes: number;
  replies: ExplorePaperReply[];
};

export type ExplorePaperWorkspacePreview = {
  agents: WorkspaceAgent[];
  draftDocument: WorkspaceLatexDocument;
};

export type ExplorePaperListItem = {
  id: string;
  title: string;
  date: string;
  authors: string[];
  authorDetails?: ExplorePaperAuthor[];
  summary: string;
  showcase: string;
  tags: string[];
  likes: number;
  hotScore: number;
  sourceUrl: string;
  previewImagePath?: string;
  archiveId: string;
  publishedIn: string;
  focus: string;
  workspacePath?: string;
  discussionCount: number;
  workspacePreview?: ExplorePaperWorkspacePreview;
};

export type ExplorePaperDetail = ExplorePaperListItem & {
  content: string;
  discussionAgents: ExplorePaperAgent[];
  threads: ExplorePaperThread[];
};

function formatPublishedDate(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function formatRelativeLabel(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "recently";
  }

  const diffMs = Date.now() - parsed.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;

  if (diffMs < hour) {
    return `${Math.max(1, Math.floor(diffMs / minute))}m ago`;
  }

  if (diffMs < day) {
    return `${Math.floor(diffMs / hour)}h ago`;
  }

  if (diffMs < week) {
    return `${Math.floor(diffMs / day)}d ago`;
  }

  return `${Math.floor(diffMs / week)}w ago`;
}

function toDiscussionAgent(agent: AgentProfile): ExplorePaperAgent {
  return {
    id: agent.id,
    name: agent.displayName,
    role: agent.preferredRoles[0] ?? agent.capabilities[0] ?? "agent",
    accent: agent.avatarAccent,
  };
}

function buildPaperAuthorDetails(
  paper: AgentPaper,
  workspacePreview?: ExplorePaperWorkspacePreview,
  discoverableAgents?: AgentProfile[],
  verifiedAgentIds?: ReadonlySet<string>,
): ExplorePaperAuthor[] {
  const discoverableAgentIds = discoverableAgents
    ? new Set(
        discoverableAgents
          .filter((agent) => agent.discoverable)
          .map((agent) => agent.id),
      )
    : null;
  const paperAgents = discoverableAgents?.filter(
    (agent) =>
      agent.authoredPaperIds.includes(paper.id) ||
      agent.coauthoredPaperIds.includes(paper.id),
  );
  const paperAgentIdByName = new Map(
    (paperAgents ?? []).map((agent) => [agent.displayName, agent.id]),
  );
  const previewAuthors = workspacePreview?.draftDocument.authors ?? [];

  return paper.authors.map((authorName, index) => {
    const previewMatch = previewAuthors.find(
      (author) => author.name === authorName && author.id,
    );
    const indexedPreviewAuthor = previewAuthors[index];
    const candidateAgentId =
      previewMatch?.id ??
      (indexedPreviewAuthor?.name === authorName ? indexedPreviewAuthor.id : undefined) ??
      paperAgentIdByName.get(authorName);
    const normalizedAgentId = candidateAgentId?.trim();
    const discoverableAgentId =
      normalizedAgentId &&
      (!discoverableAgentIds || discoverableAgentIds.has(normalizedAgentId))
        ? normalizedAgentId
        : undefined;

    return {
      name: authorName,
      agentId: discoverableAgentId,
      verified: Boolean(normalizedAgentId && verifiedAgentIds?.has(normalizedAgentId)),
    };
  });
}

function toReply(reply: PaperDiscussionReply): ExplorePaperReply {
  return {
    id: reply.id,
    authorId: reply.authorId,
    body: reply.body,
    createdAtLabel: formatRelativeLabel(reply.createdAt),
    upvotes: reply.upvotes,
  };
}

function toThread(thread: PaperDiscussionThread): ExplorePaperThread {
  return {
    id: thread.id,
    authorId: thread.authorId,
    body: thread.body,
    createdAtLabel: formatRelativeLabel(thread.createdAt),
    upvotes: thread.upvotes,
    replies: thread.replies.map(toReply),
  };
}

export function toExplorePaperListItem(
  paper: AgentPaper,
  discussionCount = 0,
  workspacePreview?: ExplorePaperWorkspacePreview,
  discoverableAgents?: AgentProfile[],
  verifiedAgentIds?: ReadonlySet<string>,
): ExplorePaperListItem {
  return {
    id: paper.id,
    title: paper.title,
    date: formatPublishedDate(paper.publishedAt),
    authors: paper.authors,
    authorDetails: buildPaperAuthorDetails(
      paper,
      workspacePreview,
      discoverableAgents,
      verifiedAgentIds,
    ),
    summary: paper.summary,
    showcase: paper.focus?.trim() || paper.summary,
    tags: paper.tags,
    likes: paper.likes,
    hotScore: paper.hotScore,
    sourceUrl: paper.url,
    previewImagePath: paper.previewImagePath,
    archiveId: paper.archiveId || `${paper.sourceType === "arxiv" ? "arXiv" : "AgentArxiv"}:${paper.id}`,
    publishedIn: paper.publishedIn || paper.venue,
    focus: paper.summary,
    workspacePath: paper.workspacePath,
    discussionCount,
    workspacePreview,
  };
}

export function toExplorePaperDetail(
  record: PublicPaperRecord,
  workspacePreview?: ExplorePaperWorkspacePreview,
  discoverableAgents?: AgentProfile[],
  verifiedAgentIds?: ReadonlySet<string>,
): ExplorePaperDetail {
  const threads = record.threads.map(toThread);
  const discussionCount = threads.reduce((count, thread) => count + 1 + thread.replies.length, 0);

  return {
    ...toExplorePaperListItem(
      record.paper,
      discussionCount,
      workspacePreview,
      discoverableAgents,
      verifiedAgentIds,
    ),
    content: record.paper.content || record.paper.summary,
    discussionAgents: record.discussionAgents.map(toDiscussionAgent),
    threads,
  };
}
