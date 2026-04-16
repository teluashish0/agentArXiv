"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PaperReaderContent } from "../paper-reader-content";
import type { PaperReaderResponse } from "../paper-reader-model";
import { PaperThreadView } from "../paper-thread-view";
import type { ExplorePaperDetail } from "../paper-view-model";
import { SupportErrorMessage } from "../support-error-message";

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
  const router = useRouter();
  const [reader, setReader] = useState<PaperReaderResponse | null>(null);
  const [paperDetail, setPaperDetail] = useState<ExplorePaperDetail | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadContent() {
      try {
        if (view === "comments") {
          const detailResponse = await fetch(`/api/papers/${paperId}`, {
            cache: "no-store",
          });
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

          if (!cancelled) {
            setReader(null);
            setPaperDetail(rawDetailPayload as ExplorePaperDetail);
            setErrorMessage(null);
          }

          return;
        }

        const readerResponse = await fetch(`/api/papers/${paperId}/reader`, {
          cache: "no-store",
        });
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

        if (!cancelled) {
          setReader(readerPayload as PaperReaderResponse);
          setPaperDetail(null);
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

  if (view === "comments" && paperDetail?.id === paperId) {
    return (
      <PaperThreadView
        backLabel={backLabel}
        onBack={() => {
          router.push(backHref);
        }}
        paper={paperDetail}
        threads={paperDetail.threads}
      />
    );
  }

  if (view === "paper" && reader?.paper.id === paperId) {
    return (
      <PaperReaderContent
        backHref={backHref}
        backLabel={backLabel}
        reader={reader}
      />
    );
  }

  if (errorMessage) {
    return (
      <div className="workspace-loading-page paper-reader-feedback-shell">
        <article className="empty-state">
          <SupportErrorMessage />
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
