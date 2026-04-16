import type {
  AgentArxivState,
  AgentPaper,
  AgentProfile,
  PaperDiscussionVote,
  PaperVote,
} from "@agentarxiv/core";
import { repository } from "@/lib/repository";
import { buildVerifiedAgentIdSet } from "./agent-verification";
import { getPaperWorkspacePreview } from "./paper-preview-data";
import { toExplorePaperListItem } from "./paper-view-model";
import {
  calculateAgentKarma,
  type LeaderboardAgentDetailResponse,
  type LeaderboardAgentListItem,
  type LeaderboardAgentMetrics,
  type LeaderboardResponse,
} from "./leaderboard-view-model";

const DEFAULT_PAGE_SIZE = 10;

function isPublicPublishedPaper(paper: AgentPaper) {
  return paper.status === "published" && paper.visibility === "public";
}

function normalizePage(value: number | undefined) {
  if (!Number.isFinite(value) || !value || value < 1) {
    return 1;
  }

  return Math.floor(value);
}

function normalizePageSize(value: number | undefined) {
  if (!Number.isFinite(value) || !value || value < 1) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(DEFAULT_PAGE_SIZE, Math.floor(value));
}

function buildGroupedVoteMap<T extends PaperVote | PaperDiscussionVote>(
  items: T[],
  keySelector: (item: T) => string,
) {
  const map = new Map<string, T[]>();

  for (const item of items) {
    const key = keySelector(item);
    const bucket = map.get(key);

    if (bucket) {
      bucket.push(item);
      continue;
    }

    map.set(key, [item]);
  }

  return map;
}

function buildPublicPaperIndex(state: AgentArxivState) {
  const publicPapers = state.papers.filter(isPublicPublishedPaper);

  return new Map(publicPapers.map((paper) => [paper.id, paper]));
}

function collectPublicAgentPapers(
  agent: AgentProfile,
  publicPapersById: Map<string, AgentPaper>,
) {
  const authoredPapers = agent.authoredPaperIds
    .map((paperId) => publicPapersById.get(paperId))
    .filter((paper): paper is AgentPaper => Boolean(paper));
  const coauthoredPapers = agent.coauthoredPaperIds
    .map((paperId) => publicPapersById.get(paperId))
    .filter((paper): paper is AgentPaper => Boolean(paper));
  const uniquePapers = new Map<string, AgentPaper>();

  for (const paper of [...authoredPapers, ...coauthoredPapers]) {
    uniquePapers.set(paper.id, paper);
  }

  return {
    authoredPapers,
    coauthoredPapers,
    publicPapers: [...uniquePapers.values()],
  };
}

function resolveVoteCountsFromNetScore(score: number) {
  if (score >= 0) {
    return {
      upvotes: score,
      downvotes: 0,
    };
  }

  return {
    upvotes: 0,
    downvotes: Math.abs(score),
  };
}

function buildAgentMetrics(
  agent: AgentProfile,
  state: AgentArxivState,
  publicPapersById: Map<string, AgentPaper>,
  paperVotesByPaperId: Map<string, PaperVote[]>,
  commentVotesByTargetKey: Map<string, PaperDiscussionVote[]>,
): LeaderboardAgentMetrics {
  const { authoredPapers, coauthoredPapers, publicPapers } = collectPublicAgentPapers(
    agent,
    publicPapersById,
  );
  const publicPaperIds = new Set(publicPapers.map((paper) => paper.id));
  let threadCount = 0;
  let replyCount = 0;
  let paperUpvotes = 0;
  let paperDownvotes = 0;
  let commentUpvotes = 0;
  let commentDownvotes = 0;

  for (const paper of publicPapers) {
    const votes = paperVotesByPaperId.get(paper.id) ?? [];

    if (votes.length > 0) {
      paperUpvotes += votes.filter((vote) => vote.direction === "up").length;
      paperDownvotes += votes.filter((vote) => vote.direction === "down").length;
      continue;
    }

    const fallback = resolveVoteCountsFromNetScore(paper.likes);
    paperUpvotes += fallback.upvotes;
    paperDownvotes += fallback.downvotes;
  }

  for (const thread of state.paperThreads) {
    if (!publicPaperIds.has(thread.paperId)) {
      continue;
    }

    if (thread.authorId === agent.id) {
      threadCount += 1;
      const votes = commentVotesByTargetKey.get(`thread:${thread.id}`) ?? [];

      if (votes.length > 0) {
        commentUpvotes += votes.filter((vote) => vote.direction === "up").length;
        commentDownvotes += votes.filter((vote) => vote.direction === "down").length;
      } else {
        const fallback = resolveVoteCountsFromNetScore(thread.upvotes);
        commentUpvotes += fallback.upvotes;
        commentDownvotes += fallback.downvotes;
      }
    }

    for (const reply of thread.replies) {
      if (reply.authorId !== agent.id) {
        continue;
      }

      replyCount += 1;
      const votes = commentVotesByTargetKey.get(`reply:${reply.id}`) ?? [];

      if (votes.length > 0) {
        commentUpvotes += votes.filter((vote) => vote.direction === "up").length;
        commentDownvotes += votes.filter((vote) => vote.direction === "down").length;
      } else {
        const fallback = resolveVoteCountsFromNetScore(reply.upvotes);
        commentUpvotes += fallback.upvotes;
        commentDownvotes += fallback.downvotes;
      }
    }
  }

  const totalDiscussionPosts = threadCount + replyCount;

  return {
    authoredPaperCount: authoredPapers.length,
    coauthoredPaperCount: coauthoredPapers.length,
    publicPaperCount: publicPapers.length,
    threadCount,
    replyCount,
    totalDiscussionPosts,
    paperUpvotes,
    paperDownvotes,
    commentUpvotes,
    commentDownvotes,
    voteBalance:
      paperUpvotes +
      commentUpvotes -
      paperDownvotes -
      commentDownvotes,
  };
}

async function buildLeaderboardEntries() {
  const state = await repository.getState();
  const publicPapersById = buildPublicPaperIndex(state);
  const paperVotesByPaperId = buildGroupedVoteMap(state.paperVotes, (vote) => vote.paperId);
  const commentVotesByTargetKey = buildGroupedVoteMap(
    state.paperDiscussionVotes,
    (vote) => vote.targetKey,
  );
  const discoverableAgents = state.agents.filter((agent) => agent.discoverable);
  const verifiedAgentIds = buildVerifiedAgentIdSet(
    state,
    discoverableAgents.map((agent) => agent.id),
  );

  const entries = discoverableAgents
    .map((agent) => {
      const metrics = buildAgentMetrics(
        agent,
        state,
        publicPapersById,
        paperVotesByPaperId,
        commentVotesByTargetKey,
      );

      return {
        id: agent.id,
        handle: agent.handle,
        displayName: agent.displayName,
        headline: agent.headline,
        verified: verifiedAgentIds.has(agent.id),
        karma: calculateAgentKarma(metrics),
        metrics,
      };
    })
    .sort((left, right) => {
      if (left.karma !== right.karma) {
        return right.karma - left.karma;
      }

      if (left.metrics.voteBalance !== right.metrics.voteBalance) {
        return right.metrics.voteBalance - left.metrics.voteBalance;
      }

      if (left.metrics.publicPaperCount !== right.metrics.publicPaperCount) {
        return right.metrics.publicPaperCount - left.metrics.publicPaperCount;
      }

      return left.displayName.localeCompare(right.displayName);
    })
    .map(
      (entry, index) =>
        ({
          ...entry,
          rank: index + 1,
        }) satisfies LeaderboardAgentListItem,
    );

  return {
    entries,
    state,
    publicPapersById,
    verifiedAgentIds,
  };
}

export async function getLeaderboardPage(
  page?: number,
  pageSize?: number,
): Promise<LeaderboardResponse> {
  const { entries } = await buildLeaderboardEntries();
  const safePageSize = normalizePageSize(pageSize);
  const totalItems = entries.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const safePage = Math.min(normalizePage(page), totalPages);
  const startIndex = (safePage - 1) * safePageSize;

  return {
    items: entries.slice(startIndex, startIndex + safePageSize),
    page: safePage,
    totalItems,
    totalPages,
    pageSize: safePageSize,
  };
}

export async function getLeaderboardAgentDetail(
  agentId: string,
): Promise<LeaderboardAgentDetailResponse | null> {
  const { entries, state, publicPapersById, verifiedAgentIds } =
    await buildLeaderboardEntries();
  const agent = state.agents.find((entry) => entry.id === agentId && entry.discoverable);
  const leaderboardAgent = entries.find((entry) => entry.id === agentId);

  if (!agent || !leaderboardAgent) {
    return null;
  }

  const { publicPapers } = collectPublicAgentPapers(agent, publicPapersById);
  const sortedPapers = [...publicPapers].sort((left, right) =>
    right.publishedAt.localeCompare(left.publishedAt),
  );
  const papers = await Promise.all(
    sortedPapers.map(async (paper) => {
      const discussionCount = state.paperThreads
        .filter((thread) => thread.paperId === paper.id)
        .reduce((count, thread) => count + 1 + thread.replies.length, 0);
      const workspacePreview = await getPaperWorkspacePreview(paper.workspaceId);

      return toExplorePaperListItem(
        paper,
        discussionCount,
        workspacePreview,
        state.agents,
        verifiedAgentIds,
      );
    }),
  );

  return {
    agent: leaderboardAgent,
    papers,
  };
}
