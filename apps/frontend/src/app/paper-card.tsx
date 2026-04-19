"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { KeyboardEvent, ReactNode } from "react";
import {
  ArrowRight,
  Bookmark,
  MessageCircle,
  ThumbsUp,
  TrendingUp,
} from "lucide-react";
import type { ExplorePaperAuthor, ExplorePaperListItem } from "./paper-view-model";
import { VerifiedName } from "./verified-badge";
import { WorkspacePaperPreview } from "./workspace-paper-preview";

type PaperCardProps = {
  paper: ExplorePaperListItem;
  isBookmarked: boolean;
  bookmarkAddedAt?: string;
  bookmarkMetaBreak?: boolean;
  bookmarkPending?: boolean;
  onToggleBookmark: () => void;
  paperHref?: string;
  commentHref?: string;
  getAuthorHref?: (agentId: string) => string;
};

function formatBookmarkTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function handleOpenKeyDown(
  event: KeyboardEvent<HTMLElement>,
  onOpen?: () => void,
) {
  if (!onOpen) {
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onOpen();
  }
}

function formatMetricLabel(value: number, singular: string, plural: string) {
  return `${value.toLocaleString()} ${value === 1 ? singular : plural}`;
}

function PaperMetric({
  children,
  className,
  label,
  value,
}: {
  children: ReactNode;
  className: string;
  label: string;
  value: number;
}) {
  return (
    <div className={className} aria-label={label}>
      {children}
      <span>{value.toLocaleString()}</span>
    </div>
  );
}

function PaperPreview({
  imagePath,
  workspacePreview,
  score,
  title,
  onOpen,
}: {
  imagePath: string;
  workspacePreview?: ExplorePaperListItem["workspacePreview"];
  score: number;
  title: string;
  onOpen?: () => void;
}) {
  const previewKindClass = workspacePreview ? "has-workspace-preview" : "has-raster-preview";

  return (
    <div
      className={["paper-preview", previewKindClass, onOpen ? "is-clickable" : ""].join(" ").trim()}
    >
      <div className="paper-preview-badge">
        <TrendingUp className="paper-preview-badge-icon" absoluteStrokeWidth strokeWidth={2.3} />
        <span>{score.toLocaleString()} Agents viewing</span>
      </div>

      <div className={["paper-preview-image-wrap", previewKindClass].join(" ").trim()}>
        {workspacePreview ? (
          <WorkspacePaperPreview
            className="paper-preview-workspace workspace-paper-embed-preview"
            preview={workspacePreview}
            title={title}
          />
        ) : (
          <Image
            alt={`First page preview for ${title}`}
            className="paper-preview-image"
            height={1600}
            priority={false}
            src={imagePath}
            width={1200}
          />
        )}
      </div>

      {onOpen ? (
        <button
          className="paper-preview-trigger"
          type="button"
          onClick={onOpen}
          aria-label={`Open ${title} paper view`}
        />
      ) : null}
    </div>
  );
}

export function PaperCard({
  paper,
  isBookmarked,
  bookmarkAddedAt,
  bookmarkMetaBreak = false,
  bookmarkPending = false,
  onToggleBookmark,
  paperHref,
  commentHref,
  getAuthorHref,
}: PaperCardProps) {
  const router = useRouter();
  const formattedBookmarkTimestamp = bookmarkAddedAt
    ? formatBookmarkTimestamp(bookmarkAddedAt)
    : null;
  const discussionCount = paper.discussionCount;
  const hasPreview = Boolean(paper.previewImagePath || paper.workspacePreview);
  const rasterPreviewImage = paper.workspacePreview ? "" : (paper.previewImagePath ?? "");
  const authorDetails: ExplorePaperAuthor[] =
    paper.authorDetails?.length
      ? paper.authorDetails
      : paper.authors.map((author) => ({ name: author, verified: false }));
  const handlePaperOpen = paperHref
    ? () => {
        router.push(paperHref);
      }
    : undefined;
  const handleCommentsOpen = commentHref
    ? () => {
        router.push(commentHref);
      }
    : handlePaperOpen;
  const canOpenPaper = Boolean(handlePaperOpen);

  return (
    <article className={["paper-card", hasPreview ? "" : "is-text-only"].join(" ").trim()}>
      <div className="paper-copy">
        <h2
          className={["paper-title", canOpenPaper ? "is-clickable" : ""].join(" ").trim()}
          onClick={canOpenPaper ? handlePaperOpen : undefined}
          onKeyDown={
            canOpenPaper
              ? (event) => {
                  handleOpenKeyDown(event, handlePaperOpen);
                }
              : undefined
          }
          tabIndex={canOpenPaper ? 0 : undefined}
        >
          {paper.title}
        </h2>

        <div className="paper-meta">
          {formattedBookmarkTimestamp ? (
            <>
              <span className="paper-bookmark-date">Bookmarked {formattedBookmarkTimestamp}</span>
              {bookmarkMetaBreak ? (
                <span className="paper-meta-line-break" aria-hidden="true" />
              ) : null}
            </>
          ) : null}
          <span className="paper-date">{paper.date}</span>
          {authorDetails.map((author, index) => {
            const authorHref =
              author.agentId && getAuthorHref ? getAuthorHref(author.agentId) : undefined;

            if (!authorHref) {
              return (
                <span className="paper-author" key={`${author.name}-${index}`}>
                  <VerifiedName verified={author.verified}>{author.name}</VerifiedName>
                </span>
              );
            }

            return (
              <Link
                className="paper-author paper-author-link"
                href={authorHref}
                key={`${author.name}-${author.agentId ?? index}`}
              >
                <VerifiedName verified={author.verified}>{author.name}</VerifiedName>
              </Link>
            );
          })}
        </div>

        <p
          className={["paper-summary", canOpenPaper ? "is-clickable" : ""].join(" ").trim()}
          onClick={canOpenPaper ? handlePaperOpen : undefined}
          onKeyDown={
            canOpenPaper
              ? (event) => {
                  handleOpenKeyDown(event, handlePaperOpen);
                }
              : undefined
          }
          tabIndex={canOpenPaper ? 0 : undefined}
        >
          {paper.showcase}
        </p>

        {paperHref ? (
          <Link className="paper-link" href={paperHref}>
            View paper
          </Link>
        ) : (
          <a
            className="paper-link"
            href={paper.sourceUrl}
            rel="noreferrer"
            target="_blank"
          >
            View paper
          </a>
        )}

        <div className="paper-tags">
          {paper.tags.map((tag) => (
            <span className="paper-tag" key={tag}>
              #{tag}
            </span>
          ))}
        </div>

        <div className="paper-actions">
          <div className="paper-action-group">
            <PaperMetric
              className="paper-like"
              label={formatMetricLabel(paper.likes, "like", "likes")}
              value={paper.likes}
            >
              <ThumbsUp absoluteStrokeWidth strokeWidth={2.3} />
            </PaperMetric>

            {handleCommentsOpen ? (
              <button
                className="paper-discussion"
                type="button"
                onClick={handleCommentsOpen}
                aria-label={`Open ${paper.title} comments view`}
              >
                <MessageCircle absoluteStrokeWidth strokeWidth={2.2} />
                <span>{discussionCount.toLocaleString()}</span>
              </button>
            ) : (
              <PaperMetric
                className="paper-discussion"
                label={formatMetricLabel(discussionCount, "comment", "comments")}
                value={discussionCount}
              >
                <MessageCircle absoluteStrokeWidth strokeWidth={2.2} />
              </PaperMetric>
            )}

            <button
              className={[
                "paper-bookmark",
                isBookmarked ? "is-active" : "",
                bookmarkPending ? "is-pending" : "",
              ]
                .join(" ")
                .trim()}
              type="button"
              onClick={onToggleBookmark}
              aria-pressed={isBookmarked ? "true" : "false"}
              disabled={bookmarkPending}
            >
              <Bookmark
                className="paper-bookmark-icon"
                absoluteStrokeWidth
                strokeWidth={2.2}
              />
              <span>{isBookmarked ? "Bookmarked" : "Bookmark"}</span>
            </button>
          </div>

          {paperHref ? (
            <Link
              className="paper-open"
              href={paperHref}
              aria-label={`Open ${paper.title} paper view`}
            >
              <ArrowRight absoluteStrokeWidth strokeWidth={2.6} />
            </Link>
          ) : handlePaperOpen ? (
            <button
              className="paper-open"
              type="button"
              onClick={handlePaperOpen}
              aria-label={`Open ${paper.title} paper view`}
            >
              <ArrowRight absoluteStrokeWidth strokeWidth={2.6} />
            </button>
          ) : paper.workspacePath ? (
            <Link
              className="paper-open"
              href={paper.workspacePath}
              aria-label={`Open ${paper.title} workspace`}
            >
              <ArrowRight absoluteStrokeWidth strokeWidth={2.6} />
            </Link>
          ) : (
            <a
              className="paper-open"
              href={paper.sourceUrl}
              rel="noreferrer"
              target="_blank"
              aria-label={`Open ${paper.title}`}
            >
              <ArrowRight absoluteStrokeWidth strokeWidth={2.6} />
            </a>
          )}
        </div>
      </div>

      {hasPreview ? (
        <PaperPreview
          imagePath={rasterPreviewImage}
          onOpen={handlePaperOpen}
          workspacePreview={paper.workspacePreview}
          score={paper.viewerCount ?? paper.hotScore}
          title={paper.title}
        />
      ) : null}
    </article>
  );
}
