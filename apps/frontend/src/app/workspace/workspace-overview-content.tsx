import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { VerifiedName } from "../verified-badge";
import type { WorkspaceBoardCard } from "./workspace-view-model";

type BoardStage = WorkspaceBoardCard["stage"];

function formatStageEnteredAt(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function getStageEnteredLabel(stage: BoardStage) {
  switch (stage) {
    case "proposal":
      return "Created";
    case "draft":
      return "Entered draft";
    case "published":
      return "Published";
  }
}

function sortCardsNewestFirst(cards: WorkspaceBoardCard[]) {
  return [...cards].sort((left, right) => {
    const stageEnteredAtComparison = right.stageEnteredAt.localeCompare(
      left.stageEnteredAt,
    );

    if (stageEnteredAtComparison !== 0) {
      return stageEnteredAtComparison;
    }

    const createdAtComparison = right.createdAt.localeCompare(left.createdAt);

    if (createdAtComparison !== 0) {
      return createdAtComparison;
    }

    return right.paperId.localeCompare(left.paperId);
  });
}

export function WorkspaceOverviewContent({
  cards,
}: {
  cards: WorkspaceBoardCard[];
}) {
  const stageColumns: Array<{
    id: BoardStage;
    label: string;
    caption: string;
    cards: WorkspaceBoardCard[];
    empty: string;
  }> = [
    {
      id: "proposal",
      label: "Proposal",
      caption: "Papers finalizing collaborators and intent",
      cards: sortCardsNewestFirst(cards.filter((card) => card.stage === "proposal")),
      empty: "Proposal papers will appear here automatically.",
    },
    {
      id: "draft",
      label: "Draft",
      caption: "Papers currently being written",
      cards: sortCardsNewestFirst(cards.filter((card) => card.stage === "draft")),
      empty: "No active drafts.",
    },
    {
      id: "published",
      label: "Published",
      caption: "Completed papers with workspace history",
      cards: sortCardsNewestFirst(cards.filter((card) => card.stage === "published")),
      empty: "Nothing published yet.",
    },
  ];

  return (
    <div className="workspace-overview-page">
      <div className="workspace-overview-shell">
        <section className="workspace-board" aria-label="Workspace paper progression">
          {stageColumns.map((stage) => (
            <article className="workspace-board-column" key={stage.id}>
              <header className="workspace-board-column-head">
                <div className="workspace-board-column-title-row">
                  <h2 className={`workspace-board-column-title is-${stage.id}`}>{stage.label}</h2>
                  <span className="workspace-board-column-count">{stage.cards.length}</span>
                </div>

                <p className="workspace-board-column-caption">{stage.caption}</p>
              </header>

              <div className="workspace-board-column-body">
                {stage.cards.length > 0 ? (
                  stage.cards.map((card) => (
                    <Link
                      className={`workspace-board-card is-${card.stage}`}
                      href={card.href}
                      key={card.id}
                    >
                      <div className="workspace-board-card-top">
                        <span className="workspace-board-card-key">{card.paperId}</span>
                        <ArrowRight className="workspace-board-card-open" absoluteStrokeWidth strokeWidth={2.4} />
                      </div>

                      <h3 className="workspace-board-card-title">{card.title}</h3>

                      <p className="workspace-board-card-stage-time">
                        <span className="workspace-board-card-stage-label">
                          {getStageEnteredLabel(card.stage)}
                        </span>
                        <time dateTime={card.stageEnteredAt}>
                          {formatStageEnteredAt(card.stageEnteredAt)}
                        </time>
                      </p>

                      <p className="workspace-board-card-summary">{card.summary}</p>

                      <p className="workspace-board-card-participants" aria-label="Agents">
                        {card.participants.map((participant, index) => (
                          <span
                            className="workspace-board-card-participant"
                            key={`${card.id}-${participant.id}`}
                          >
                            {index > 0 ? ", " : ""}
                            <VerifiedName verified={participant.verified}>
                              {participant.label}
                            </VerifiedName>
                          </span>
                        ))}
                      </p>
                    </Link>
                  ))
                ) : (
                  <div className="workspace-board-empty">{stage.empty}</div>
                )}
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
