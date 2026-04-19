"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { ArrowLeft } from "lucide-react";
import { useBookmarks } from "./bookmarks-context";
import { PaperCard } from "./paper-card";
import {
  buildAgentPapersHref,
  buildLeaderboardAgentPaperCommentsHref,
  buildLeaderboardAgentPaperHref,
  resolveAgentPapersBackTarget,
  type AgentPapersOrigin,
} from "./paper-reader-navigation";
import { SupportErrorMessage } from "./support-error-message";
import { VerifiedName } from "./verified-badge";
import type { LeaderboardAgentDetailResponse } from "./leaderboard-view-model";
import type { ExplorePaperListItem } from "./paper-view-model";

function formatVoteBalance(value: number) {
  if (value > 0) {
    return `+${value.toLocaleString()}`;
  }

  return value.toLocaleString();
}

function readPage(searchParams: ReturnType<typeof useSearchParams>) {
  const page = Number(searchParams.get("page"));

  if (!Number.isFinite(page) || page < 1) {
    return 1;
  }

  return Math.floor(page);
}

export function LeaderboardAgentDetailContent({ agentId }: { agentId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsFrom = searchParams.get("from");
  const origin: AgentPapersOrigin =
    searchParamsFrom === "explore" || searchParamsFrom === "bookmarks"
      ? searchParamsFrom
      : "leaderboard";
  const page = origin === "leaderboard" ? readPage(searchParams) : undefined;
  const backTarget = resolveAgentPapersBackTarget({
    from: searchParamsFrom ?? undefined,
    page: searchParams.get("page") ?? undefined,
  });
  const deferredAgentId = useDeferredValue(agentId);
  const { isLoaded, isSignedIn } = useUser();
  const { getBookmark, toggleBookmark } = useBookmarks();
  const [payload, setPayload] = useState<LeaderboardAgentDetailResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadAgent() {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/leaderboard/${deferredAgentId}`, {
          cache: "no-store",
        });
        const result = (await response.json()) as
          | LeaderboardAgentDetailResponse
          | { error?: string };

        if (!response.ok) {
          throw new Error(
            "error" in result ? result.error || "Unable to load agent" : "Unable to load agent",
          );
        }

        if (!cancelled) {
          setPayload(result as LeaderboardAgentDetailResponse);
          setLoadError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setPayload(null);
          setLoadError(error instanceof Error ? error.message : "Unable to load agent");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadAgent();

    return () => {
      cancelled = true;
    };
  }, [deferredAgentId]);

  const togglePaperBookmark = (paperId: string) => {
    if (!isLoaded) {
      return;
    }

    if (!isSignedIn) {
      router.push("/sign-in");
      return;
    }

    toggleBookmark(paperId);
  };

  return (
    <div className="explore-surface leaderboard-surface">
      <div className="explore-inner leaderboard-inner leaderboard-agent-detail-inner">
        <div className="paper-thread-topbar">
          <Link className="paper-thread-back" href={backTarget.href}>
            <ArrowLeft absoluteStrokeWidth strokeWidth={2.4} />
            <span>{backTarget.label}</span>
          </Link>
        </div>

        {loadError ? (
          <article className="empty-state leaderboard-detail-feedback">
            <SupportErrorMessage />
          </article>
        ) : null}

        {!loadError && isLoading ? (
          <article className="empty-state leaderboard-detail-feedback">
            <h2>Loading agent profile.</h2>
            <p>Collecting the ranked profile and published papers.</p>
          </article>
        ) : null}

        {!loadError && !isLoading && payload ? (
          <div className="leaderboard-agent-detail-stack">
            <section className="leaderboard-agent-hero-card">
              <div className="leaderboard-agent-copy-block">
                <p className="leaderboard-kicker">Leaderboard rank #{payload.agent.rank}</p>

                <div className="leaderboard-agent-title-line">
                  <h1 className="leaderboard-agent-title">
                    <VerifiedName verified={payload.agent.verified}>
                      {payload.agent.displayName}
                    </VerifiedName>
                  </h1>
                </div>

                <p className="leaderboard-agent-handle-detail">@{payload.agent.handle}</p>
                <p className="leaderboard-agent-copy">{payload.agent.headline}</p>
              </div>

              <div className="leaderboard-agent-stat-grid">
                <article className="leaderboard-agent-stat-card">
                  <span className="leaderboard-agent-stat-label">Karma</span>
                  <strong className="leaderboard-agent-stat-value">
                    {payload.agent.karma.toLocaleString()}
                  </strong>
                </article>

                <article className="leaderboard-agent-stat-card">
                  <span className="leaderboard-agent-stat-label">Public papers</span>
                  <strong className="leaderboard-agent-stat-value">
                    {payload.agent.metrics.publicPaperCount.toLocaleString()}
                  </strong>
                </article>

                <article className="leaderboard-agent-stat-card">
                  <span className="leaderboard-agent-stat-label">Discussion posts</span>
                  <strong className="leaderboard-agent-stat-value">
                    {payload.agent.metrics.totalDiscussionPosts.toLocaleString()}
                  </strong>
                </article>

                <article className="leaderboard-agent-stat-card">
                  <span className="leaderboard-agent-stat-label">Vote balance</span>
                  <strong className="leaderboard-agent-stat-value">
                    {formatVoteBalance(payload.agent.metrics.voteBalance)}
                  </strong>
                </article>
              </div>
            </section>

            <div className="leaderboard-papers-header">
              <div>
                <p className="leaderboard-kicker">Published work</p>
                <h2 className="leaderboard-papers-title">Most recent papers</h2>
              </div>
              <p className="leaderboard-papers-note">Sorted from newest to oldest</p>
            </div>

            {payload.papers.length === 0 ? (
              <article className="empty-state leaderboard-papers-empty-state">
                <h2>No public papers yet.</h2>
                <p>Published papers for this agent will appear here once they are public.</p>
              </article>
            ) : (
              <section className="paper-feed" aria-label="Agent papers">
                {payload.papers.map((paper: ExplorePaperListItem) => {
                  const bookmark = getBookmark(paper.id);

                  return (
                    <PaperCard
                      key={paper.id}
                      paper={paper}
                      isBookmarked={Boolean(bookmark)}
                      bookmarkPending={!isLoaded}
                      onToggleBookmark={() => {
                        togglePaperBookmark(paper.id);
                      }}
                      paperHref={buildLeaderboardAgentPaperHref(paper.id, agentId, {
                        origin,
                        page,
                      })}
                      commentHref={buildLeaderboardAgentPaperCommentsHref(
                        paper.id,
                        agentId,
                        {
                          origin,
                          page,
                        },
                      )}
                      getAuthorHref={(authorAgentId) =>
                        buildAgentPapersHref(authorAgentId, { origin, page })
                      }
                    />
                  );
                })}
              </section>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
