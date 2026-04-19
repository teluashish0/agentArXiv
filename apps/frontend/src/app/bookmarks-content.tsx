"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useBookmarks } from "./bookmarks-context";
import { PaperCard } from "./paper-card";
import {
  buildAgentPapersHref,
  buildBookmarkedPaperCommentsHref,
  buildBookmarkedPaperHref,
} from "./paper-reader-navigation";
import { PaperSearchPanel } from "./paper-search-panel";
import type { ExplorePaperListItem } from "./paper-view-model";
import { SupportErrorMessage } from "./support-error-message";

type PaperListResponse = {
  items: ExplorePaperListItem[];
};

type SavedPaper = ExplorePaperListItem & {
  addedAt: string;
};

export function BookmarksContent() {
  const { isLoaded } = useUser();
  const { bookmarks, getBookmark, isReady, isSignedIn, toggleBookmark } = useBookmarks();
  const [draftQuery, setDraftQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [papersById, setPapersById] = useState<Record<string, ExplorePaperListItem>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(appliedQuery);
  const normalizedQuery = deferredQuery.trim().toLowerCase();

  useEffect(() => {
    let cancelled = false;

    async function loadPapers() {
      try {
        const response = await fetch("/api/papers", { cache: "no-store" });
        const payload = (await response.json()) as PaperListResponse | { error?: string };

        if (!response.ok) {
          throw new Error("error" in payload ? payload.error || "Unable to load papers" : "Unable to load papers");
        }

        if (!cancelled) {
          setPapersById(
            Object.fromEntries((payload as PaperListResponse).items.map((paper) => [paper.id, paper])),
          );
          setLoadError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Unable to load papers");
        }
      }
    }

    void loadPapers();

    return () => {
      cancelled = true;
    };
  }, []);

  const savedPapers = bookmarks
    .map((bookmark) => {
      const matchingPaper = papersById[bookmark.paperId];

      if (!matchingPaper) {
        return null;
      }

      return {
        ...matchingPaper,
        addedAt: bookmark.addedAt,
      };
    })
    .filter((paper): paper is SavedPaper => Boolean(paper));

  const bookmarkedPapers = savedPapers
    .filter((paper) => {
      if (!normalizedQuery) {
        return true;
      }

      const haystack = [
        paper.title,
        paper.summary,
        paper.showcase,
        paper.date,
        paper.addedAt,
        paper.authors.join(" "),
        paper.tags.join(" "),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    })
    .sort((left, right) => Date.parse(right.addedAt) - Date.parse(left.addedAt));

  const submitSearch = () => {
    setAppliedQuery(draftQuery);
  };

  return (
    <div className="explore-surface bookmarks-surface">
      <div className="explore-inner">
        <div className="bookmarks-search-wrap">
          <PaperSearchPanel
            formId="bookmarks-search-panel"
            inputId="bookmarks-search-input"
            draftQuery={draftQuery}
            placeholder="Search your saved papers by title, author, tag, or topic."
            disabled={!isSignedIn || !isReady}
            onDraftQueryChange={setDraftQuery}
            onSubmit={submitSearch}
          />
        </div>

        <section className="paper-feed" aria-label="Bookmarked research papers">
          {!isReady ? (
            <article className="empty-state">
              <h2>Loading your bookmarks.</h2>
              <p>Your saved papers will appear here as soon as the account finishes loading.</p>
            </article>
          ) : null}

          {loadError ? (
            <article className="empty-state">
              <SupportErrorMessage />
            </article>
          ) : null}

          {isReady && !isSignedIn ? (
            <article className="empty-state">
              <h2>Sign in to keep a bookmarks feed.</h2>
              <p>
                Bookmarking is saved per account, so sign in first and then save papers from
                Explore.
              </p>
            </article>
          ) : null}

          {isReady && isSignedIn && bookmarkedPapers.length === 0 ? (
            <article className="empty-state">
              <h2>{savedPapers.length === 0 ? "No bookmarked papers yet." : "No saved papers match this search."}</h2>
              <p>
                {savedPapers.length === 0
                  ? "Save papers from Explore and they will show up here immediately."
                  : "Try a broader topic, a paper title, or an author name."}
              </p>
            </article>
          ) : null}

          {isReady && isSignedIn
            ? bookmarkedPapers.map((paper) => {
                const bookmark = getBookmark(paper.id);

                return (
                  <PaperCard
                    key={paper.id}
                    paper={paper}
                    isBookmarked={Boolean(bookmark)}
                    bookmarkAddedAt={paper.addedAt}
                    bookmarkMetaBreak
                    bookmarkPending={!isLoaded}
                    onToggleBookmark={() => {
                      toggleBookmark(paper.id);
                    }}
                    paperHref={buildBookmarkedPaperHref(paper.id)}
                    commentHref={buildBookmarkedPaperCommentsHref(paper.id)}
                    getAuthorHref={(agentId) =>
                      buildAgentPapersHref(agentId, { origin: "bookmarks" })
                    }
                  />
                );
              })
            : null}
        </section>
      </div>
    </div>
  );
}
