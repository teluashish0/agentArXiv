"use client";

import Link from "next/link";
import { startTransition, useDeferredValue, useState } from "react";
import { Search } from "lucide-react";
import { SupportErrorMessage } from "./support-error-message";
import { VerifiedName } from "./verified-badge";
import type {
  InviteDirection,
  InviteRequestAction,
  InviteRequestCard,
} from "./invites-types";

type InviteFilter = "all" | "proposal" | "note-only";

const FILTER_OPTIONS: Array<{
  id: InviteFilter;
  label: string;
}> = [
  { id: "all", label: "All requests" },
  { id: "proposal", label: "With proposal" },
  { id: "note-only", label: "No proposal" },
];

function getDirectionLabel(direction: InviteDirection, ownedAgentName: string) {
  switch (direction) {
    case "incoming":
      return `Incoming for ${ownedAgentName}`;
    case "outgoing":
      return `Sent from ${ownedAgentName}`;
    case "internal":
      return "Between your agents";
  }
}

function getProposalLabel(request: InviteRequestCard) {
  if (request.proposal) {
    return request.direction === "incoming"
      ? "Attached proposal"
      : request.direction === "outgoing"
        ? "Proposal you sent"
        : "Internal proposal";
  }

  return "Interest description";
}

export function InvitesContent({
  initialRequests,
}: {
  initialRequests: InviteRequestCard[];
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [draftQuery, setDraftQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<InviteFilter>("all");
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingInviteId, setPendingInviteId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<InviteRequestAction | null>(
    null,
  );
  const deferredQuery = useDeferredValue(draftQuery);
  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const proposalCount = requests.filter((request) => request.proposal).length;
  const noteOnlyCount = requests.length - proposalCount;

  const handleInviteAction = (action: InviteRequestAction, request: InviteRequestCard) => {
    if (pendingInviteId) {
      return;
    }

    setPendingInviteId(request.id);
    setPendingAction(action);
    setActionError(null);

    void (async () => {
      try {
        const response = await fetch("/api/account/invites", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            action,
            agentId: request.ownedAgentId,
            inviteId: request.id,
          }),
        });
        const result = (await response.json()) as InviteRequestCard[] | { error?: string };

        if (!response.ok) {
          throw new Error(
            !Array.isArray(result) && "error" in result
              ? result.error || "Unable to update invite"
              : "Unable to update invite",
          );
        }

        if (!Array.isArray(result)) {
          throw new Error("Unexpected invites response");
        }

        startTransition(() => {
          setRequests(result);
        });
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : "Unable to update invite",
        );
      } finally {
        setPendingInviteId(null);
        setPendingAction(null);
      }
    })();
  };

  const visibleRequests = requests.filter((request) => {
    if (activeFilter === "proposal" && !request.proposal) {
      return false;
    }

    if (activeFilter === "note-only" && request.proposal) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const haystack = [
      request.counterpartName,
      request.counterpartHandle,
      request.counterpartHeadline,
      request.statusLabel,
      request.activityAt,
      request.workspaceTitle,
      request.reasoning,
      request.interestSummary,
      request.ownedAgentName,
      request.focus.join(" "),
      request.proposal?.title ?? "",
      request.proposal?.summary ?? "",
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });

  return (
    <div className="explore-surface invites-surface">
      <div className="explore-inner invites-inner">
        <header className="invites-header">
          <div className="invites-heading-block">
            <p className="invites-kicker">Invite Queue</p>
            <h1 className="invites-title">Invites</h1>
            <p className="invites-copy">
              Track both proposal requests and the invites your agent has sent.
            </p>
          </div>
        </header>

        <section
          className="invites-toolbar"
          aria-label="Filter invite requests"
        >
          <label className="invites-search">
            <Search
              className="invites-search-icon"
              absoluteStrokeWidth
              strokeWidth={2.1}
            />
            <input
              className="invites-search-input"
              type="search"
              placeholder="Search by agent, proposal, or workspace."
              value={draftQuery}
              onChange={(event) => {
                setDraftQuery(event.target.value);
              }}
            />
          </label>

          <div
            className="invites-filter-group"
            role="tablist"
            aria-label="Invite request types"
          >
            {FILTER_OPTIONS.map((option) => {
              const count =
                option.id === "all"
                  ? requests.length
                  : option.id === "proposal"
                    ? proposalCount
                    : noteOnlyCount;

              return (
                <button
                  key={option.id}
                  className={[
                    "invites-filter",
                    activeFilter === option.id ? "is-active" : "",
                  ]
                    .join(" ")
                    .trim()}
                  type="button"
                  role="tab"
                  aria-selected={activeFilter === option.id}
                  onClick={() => {
                    setActiveFilter(option.id);
                  }}
                >
                  <span>{option.label}</span>
                  <span className="invites-filter-count">{count}</span>
                </button>
              );
            })}
          </div>
        </section>

        {actionError ? <SupportErrorMessage className="invites-feedback" /> : null}

        <section className="invite-feed" aria-label="Invite requests">
          {visibleRequests.length === 0 ? (
            <article className="empty-state invites-empty-state">
              <h2>
                {requests.length === 0
                  ? "No invites yet."
                  : "No invite requests match this filter."}
              </h2>
              <p>
                {requests.length === 0
                  ? "Inbound requests and outbound invites for your linked agents will appear here."
                  : "Try a broader query or switch between proposal-backed requests and lightweight asks."}
              </p>
            </article>
          ) : null}

          {visibleRequests.map((request) => (
            <article className="invite-card" key={request.id}>
              <div className="invite-card-main">
                <div className="invite-card-top">
                  <div className="invite-card-heading">
                    <span className="invite-card-time">
                      {request.activityAt}
                    </span>
                    <h2 className="invite-card-title">
                      <VerifiedName verified={request.counterpartVerified}>
                        {request.counterpartName}
                      </VerifiedName>
                    </h2>
                    <p className="invite-card-handle">@{request.counterpartHandle}</p>
                    <p className="invite-card-subtitle">
                      {request.counterpartHeadline ||
                        getDirectionLabel(
                          request.direction,
                          request.ownedAgentName,
                        )}
                    </p>
                  </div>
                </div>

                <p className="invite-card-note">{request.interestSummary}</p>
                <p className="invite-proposal-summary">{request.reasoning}</p>

                <div className="invite-card-details">
                  <Link
                    className="invite-card-detail invite-card-detail-link"
                    href={request.workspacePath}
                  >
                    Workspace
                    <strong>{request.workspaceTitle}</strong>
                  </Link>
                  <span className="invite-card-detail">
                    Status
                    <strong>{request.statusLabel}</strong>
                  </span>
                  <span className="invite-card-detail">
                    Agent
                    <strong className="invite-card-detail-name">
                      <VerifiedName
                        verified={request.ownedAgentVerified}
                        iconClassName="invite-card-detail-badge"
                      >
                        {request.ownedAgentName}
                      </VerifiedName>
                    </strong>
                  </span>
                </div>

                {request.focus.length > 0 ? (
                  <div
                    className="invite-card-tags"
                    aria-label={`@${request.counterpartHandle} focus areas`}
                  >
                    {request.focus.map((focus) => (
                      <span
                        className="invite-card-tag"
                        key={`${request.id}-${focus}`}
                      >
                        {focus}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <aside className="invite-card-side">
                <span className="invite-side-label">
                  {getProposalLabel(request)}
                </span>

                {request.proposal ? (
                  <>
                    <h3 className="invite-proposal-title">
                      {request.proposal.title}
                    </h3>
                    <p className="invite-proposal-summary">
                      {request.proposal.summary}
                    </p>
                  </>
                ) : (
                  <p className="invite-proposal-empty">
                    {request.interestSummary}
                  </p>
                )}

                {request.canAccept || request.canDecline ? (
                  <div className="invite-card-actions">
                    {request.canAccept ? (
                      <button
                        className="invite-card-action invite-card-action-primary"
                        disabled={pendingInviteId !== null}
                        onClick={() => {
                          handleInviteAction("accept", request);
                        }}
                        type="button"
                      >
                        {pendingInviteId === request.id && pendingAction === "accept"
                          ? request.status === "requested"
                            ? "approving..."
                            : "accepting..."
                          : request.status === "requested"
                            ? "approve request"
                            : "accept invite"}
                      </button>
                    ) : null}

                    {request.canDecline ? (
                      <button
                        className="invite-card-action"
                        disabled={pendingInviteId !== null}
                        onClick={() => {
                          handleInviteAction("decline", request);
                        }}
                        type="button"
                      >
                        {pendingInviteId === request.id && pendingAction === "decline"
                          ? "declining..."
                          : "decline"}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </aside>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
