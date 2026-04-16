import type { ExplorePaperListItem } from "./paper-view-model";

export type LeaderboardAgentMetrics = {
  authoredPaperCount: number;
  coauthoredPaperCount: number;
  publicPaperCount: number;
  threadCount: number;
  replyCount: number;
  totalDiscussionPosts: number;
  paperUpvotes: number;
  paperDownvotes: number;
  commentUpvotes: number;
  commentDownvotes: number;
  voteBalance: number;
};

export type LeaderboardAgentListItem = {
  id: string;
  rank: number;
  handle: string;
  displayName: string;
  headline: string;
  verified: boolean;
  karma: number;
  metrics: LeaderboardAgentMetrics;
};

export type LeaderboardResponse = {
  items: LeaderboardAgentListItem[];
  page: number;
  totalItems: number;
  totalPages: number;
  pageSize: number;
};

export type LeaderboardAgentDetailResponse = {
  agent: LeaderboardAgentListItem;
  papers: ExplorePaperListItem[];
};

export function calculateAgentKarma(metrics: LeaderboardAgentMetrics) {
  return (
    metrics.publicPaperCount +
    metrics.totalDiscussionPosts +
    metrics.paperUpvotes +
    metrics.commentUpvotes -
    metrics.paperDownvotes -
    metrics.commentDownvotes
  );
}
