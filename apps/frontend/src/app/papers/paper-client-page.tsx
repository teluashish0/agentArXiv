"use client";

import { useEffect, useState } from "react";
import { PaperReaderContent } from "../paper-reader-content";
import type { PaperReaderResponse } from "../paper-reader-model";
import type { ExplorePaperDetail } from "../paper-view-model";

export function PaperClientPage({
  backHref,
  backLabel,
  paperId,
  view,
}: {
  backHref: string;
  backLabel: string;
  paperId: string;
  view: "paper" | "comments";
}) {
  const [reader, setReader] = useState<PaperReaderResponse | null>(null);
  const [paperDetail, setPaperDetail] = useState<ExplorePaperDetail | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadContent() {
      try {
        const readerRequest = fetch(`/api/papers/${paperId}/reader`, {
          cache: "no-store",
        });
        const detailRequest =
          view === "comments"
            ? fetch(`/api/papers/${paperId}`, {
                cache: "no-store",
              })
            : null;

        const [readerResponse, detailResponse] = await Promise.all([
          readerRequest,
          detailRequest,
        ]);
        const readerPayload = (await readerResponse.json()) as
          | PaperReaderResponse
          | { error?: string };

        if (!readerResponse.ok) {
          throw new Error(
            "error" in readerPayload
              ? readerPayload.error || "Unable to load paper"
              : "Unable to load paper",
          );
        }

        let detailPayload: ExplorePaperDetail | null = null;

        if (detailResponse) {
          const rawDetailPayload = (await detailResponse.json()) as
            | ExplorePaperDetail
            | { error?: string };

          if (!detailResponse.ok) {
            throw new Error(
              "error" in rawDetailPayload
                ? rawDetailPayload.error || "Unable to load comments"
                : "Unable to load comments",
            );
          }

          detailPayload = rawDetailPayload as ExplorePaperDetail;
        }

        if (!cancelled) {
          setReader(readerPayload as PaperReaderResponse);
          setPaperDetail(detailPayload);
          setErrorMessage(null);
        }
      } catch (error) {
        if (!cancelled) {
          setReader(null);
          setPaperDetail(null);
          setErrorMessage(error instanceof Error ? error.message : "Unable to load paper");
        }
      }
    }

    void loadContent();

    return () => {
      cancelled = true;
    };
  }, [paperId, view]);

  if (reader) {
    return (
      <PaperReaderContent
        backHref={backHref}
        backLabel={backLabel}
        reader={reader}
        view={view}
        paperDetail={paperDetail}
      />
    );
  }

  if (errorMessage) {
    return (
      <div className="workspace-loading-page paper-reader-feedback-shell">
        <article className="empty-state">
          <h2>{view === "comments" ? "Unable to load comments." : "Unable to load paper."}</h2>
          <p>{errorMessage}</p>
        </article>
      </div>
    );
  }

  return (
    <div className="workspace-loading-card workspace-loading-page">
      {view === "comments" ? "Loading paper comments…" : "Loading published paper…"}
    </div>
  );
}
