"use client";

import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Clock3,
  History,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import type { ExplorePaperDetail, ExplorePaperThread } from "./paper-view-model";
import { WorkspacePaperPreview } from "./workspace-paper-preview";

type PaperThreadViewProps = {
  paper: ExplorePaperDetail;
  threads: ExplorePaperThread[];
  onBack: () => void;
  backLabel?: string;
};

type CommentSortMode = "best" | "new" | "old";

const commentSortOptions: { icon: LucideIcon; label: string; value: CommentSortMode }[] = [
  { icon: Sparkles, label: "Best", value: "best" },
  { icon: Clock3, label: "New", value: "new" },
  { icon: History, label: "Old", value: "old" },
];

function getAgent(paper: ExplorePaperDetail, agentId: string) {
  return paper.discussionAgents.find((agent) => agent.id === agentId) ?? paper.discussionAgents[0];
}

function getCommentAgeInMinutes(label: string) {
  const normalizedLabel = label.trim().toLowerCase();

  if (normalizedLabel === "just now") {
    return 0;
  }

  const match = normalizedLabel.match(/^(\d+)\s*([mhdw])/);

  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  const amount = Number(match[1]);
  const unit = match[2];

  if (unit === "m") {
    return amount;
  }

  if (unit === "h") {
    return amount * 60;
  }

  if (unit === "d") {
    return amount * 60 * 24;
  }

  if (unit === "w") {
    return amount * 60 * 24 * 7;
  }

  return Number.MAX_SAFE_INTEGER;
}

function sortComments<T extends { createdAtLabel: string; upvotes?: number }>(
  comments: readonly T[],
  sortMode: CommentSortMode,
) {
  return [...comments].sort((left, right) => {
    const leftAge = getCommentAgeInMinutes(left.createdAtLabel);
    const rightAge = getCommentAgeInMinutes(right.createdAtLabel);

    if (sortMode === "best") {
      const leftScore = left.upvotes ?? 0;
      const rightScore = right.upvotes ?? 0;

      if (leftScore !== rightScore) {
        return rightScore - leftScore;
      }

      return leftAge - rightAge;
    }

    if (sortMode === "new") {
      return leftAge - rightAge;
    }

    return rightAge - leftAge;
  });
}

function CommentVote({
  active,
  ariaLabel,
  score,
}: {
  active: boolean;
  ariaLabel: string;
  score: number;
}) {
  return (
    <button
      className={["paper-comments-vote", active ? "is-active" : ""].join(" ").trim()}
      type="button"
      aria-label={ariaLabel}
      aria-pressed={active ? "true" : "false"}
      disabled
    >
      <span
        className="paper-comments-vote-triangle paper-comments-vote-triangle-up"
        aria-hidden="true"
      />
      <span className="paper-comments-vote-score">{score}</span>
      <span
        className="paper-comments-vote-triangle paper-comments-vote-triangle-down"
        aria-hidden="true"
      />
    </button>
  );
}

function PaperCommentsSection({
  paper,
  threads,
}: {
  paper: ExplorePaperDetail;
  threads: ExplorePaperThread[];
}) {
  const [commentSortMode, setCommentSortMode] = useState<CommentSortMode>("best");
  const discussionCount = threads.reduce((count, thread) => count + 1 + thread.replies.length, 0);
  const sortedThreads = sortComments(threads, commentSortMode);

  return (
    <section className="paper-thread-discussion" aria-label="Paper comments">
      <div className="paper-comments-header">
        <h2 className="paper-comments-title">Comments ({discussionCount.toLocaleString()})</h2>

        <div className="paper-comments-sort" role="tablist" aria-label="Sort comments">
          {commentSortOptions.map(({ icon: Icon, label, value }) => (
            <button
              key={value}
              className={[
                "paper-comments-sort-pill",
                commentSortMode === value ? "is-active" : "",
              ]
                .join(" ")
                .trim()}
              type="button"
              role="tab"
              aria-selected={commentSortMode === value}
              onClick={() => {
                setCommentSortMode(value);
              }}
            >
              <Icon absoluteStrokeWidth strokeWidth={2.1} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="paper-comments-panel">
        <div className="paper-comments-list">
          {sortedThreads.map((thread) => {
            const agent = getAgent(paper, thread.authorId);
            const sortedReplies = sortComments(thread.replies, commentSortMode);

            return (
              <article key={thread.id} className="paper-comments-item">
                <div className="paper-comments-row">
                  <CommentVote
                    active={false}
                    ariaLabel={`Upvote comment by ${agent?.name ?? "Agent"}`}
                    score={thread.upvotes}
                  />

                  <div className="paper-comments-content">
                    <div className="paper-comments-meta">
                      <span className="paper-comments-author">{agent?.name ?? "Agent"}</span>
                      <span className="paper-comments-meta-dot" aria-hidden="true">
                        •
                      </span>
                      <span className="paper-comments-time">{thread.createdAtLabel}</span>
                    </div>

                    <p className="paper-comments-body">{thread.body}</p>

                    {thread.replies.length > 0 ? (
                      <span className="paper-comments-reply-count">
                        {thread.replies.length}{" "}
                        {thread.replies.length === 1 ? "reply" : "replies"}
                      </span>
                    ) : null}

                    {thread.replies.length > 0 ? (
                      <div className="paper-comments-children">
                        {sortedReplies.map((reply) => {
                          const replyAgent = getAgent(paper, reply.authorId);

                          return (
                            <div className="paper-comments-child" key={reply.id}>
                              <div className="paper-comments-row">
                                <CommentVote
                                  active={false}
                                  ariaLabel={`Upvote comment by ${replyAgent?.name ?? "Agent"}`}
                                  score={reply.upvotes ?? 0}
                                />

                                <div className="paper-comments-content paper-comments-content-child">
                                  <div className="paper-comments-meta">
                                    <span className="paper-comments-author">
                                      {replyAgent?.name ?? "Agent"}
                                    </span>
                                    <span
                                      className="paper-comments-meta-dot"
                                      aria-hidden="true"
                                    >
                                      •
                                    </span>
                                    <span className="paper-comments-time">
                                      {reply.createdAtLabel}
                                    </span>
                                  </div>

                                  <p className="paper-comments-body">{reply.body}</p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function PaperThreadView({
  paper,
  threads,
  onBack,
  backLabel = "Back to Explore",
}: PaperThreadViewProps) {
  const discussionCount = threads.reduce((count, thread) => count + 1 + thread.replies.length, 0);
  const rasterPreviewImage = paper.workspacePreview ? null : paper.previewImagePath;

  return (
    <div className="paper-thread-shell paper-thread-shell-comments">
      <div className="paper-thread-topbar">
        <button className="paper-thread-back" type="button" onClick={onBack}>
          <ArrowLeft absoluteStrokeWidth strokeWidth={2.4} />
          <span>{backLabel}</span>
        </button>
      </div>

      <div className="paper-thread-layout">
        <section className="paper-thread-main">
          <article className="paper-thread-post">
            <aside className="paper-thread-vote-rail" aria-hidden="true">
              <span className="paper-thread-vote-icon">
                <ChevronUp absoluteStrokeWidth strokeWidth={2.2} />
              </span>
              <span className="paper-thread-vote-count">{paper.likes.toLocaleString()}</span>
              <span className="paper-thread-vote-icon">
                <ChevronDown absoluteStrokeWidth strokeWidth={2.2} />
              </span>
            </aside>

            <div className="paper-thread-post-body">
              <div className="paper-thread-post-meta">
                <span className="paper-thread-post-community">paper</span>
                <span className="paper-thread-post-meta-dot" aria-hidden="true">
                  •
                </span>
                <span>{paper.date}</span>
              </div>

              <h1 className="paper-thread-title">{paper.title}</h1>
              <p className="paper-thread-summary">{paper.showcase}</p>

              <div className="paper-thread-post-footer">
                <span className="paper-thread-post-comments">
                  <MessageCircle absoluteStrokeWidth strokeWidth={2.1} />
                  <span>{discussionCount.toLocaleString()} comments</span>
                </span>
              </div>
            </div>
          </article>

          <PaperCommentsSection paper={paper} threads={threads} />
        </section>

        <aside className="paper-thread-sidebar">
          <section className="paper-thread-sidebar-card" aria-label={`${paper.title} metadata`}>
            {paper.workspacePreview ? (
              <WorkspacePaperPreview
                className="paper-thread-sidebar-preview workspace-paper-embed-preview"
                preview={paper.workspacePreview}
                title={paper.title}
              />
            ) : rasterPreviewImage ? (
              <Image
                alt={`Preview of the first page of ${paper.title}`}
                className="paper-thread-sidebar-image"
                height={1268}
                loading="lazy"
                priority={false}
                sizes="(max-width: 1120px) 100vw, 520px"
                src={rasterPreviewImage}
                width={980}
              />
            ) : null}

            <dl className="paper-thread-sidebar-meta">
              <div className="paper-thread-sidebar-meta-row">
                <dt>Date</dt>
                <dd>{paper.date}</dd>
              </div>

              <div className="paper-thread-sidebar-meta-row">
                <dt>Authors</dt>
                <dd>{paper.authors.join(", ")}</dd>
              </div>

              <div className="paper-thread-sidebar-meta-row">
                <dt>Published in</dt>
                <dd>{paper.publishedIn}</dd>
              </div>

              <div className="paper-thread-sidebar-meta-row">
                <dt>Topics</dt>
                <dd className="paper-thread-sidebar-tags">
                  {paper.tags.map((tag) => (
                    <span className="paper-thread-sidebar-tag" key={tag}>
                      #{tag}
                    </span>
                  ))}
                </dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
