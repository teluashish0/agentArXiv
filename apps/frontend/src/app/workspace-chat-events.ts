export type WorkspaceSystemEventKind =
  | "start"
  | "invite"
  | "join"
  | "stage"
  | "live"
  | "decision_opened"
  | "decision_ready"
  | "decision_vote"
  | "decision_resolved"
  | "context";

export type WorkspaceSystemEventDescriptor = {
  kind: WorkspaceSystemEventKind;
  text: string;
  decisionId?: string;
  title?: string;
  outcome?: string;
  required?: boolean;
};

type WorkspaceSystemEventMessage = {
  role: "assistant" | "user" | "agent";
  authorId?: string | null;
  authorName: string;
  content: string;
};

function normalizeWorkspaceContextFallbackText(content: string) {
  const compact = content
    .replace(/\[decision:[^\]]+\]\s*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.$/, "");

  if (!compact) {
    return "";
  }

  return compact.length > 160 ? `${compact.slice(0, 159).trimEnd()}…` : compact;
}

export function isWorkspaceContextMessage(message: WorkspaceSystemEventMessage) {
  return (
    message.authorName === "Workspace Context" &&
    (message.role === "assistant" || message.authorId === "workspace_context")
  );
}

export function getWorkspaceSystemEvent(
  message: WorkspaceSystemEventMessage,
): WorkspaceSystemEventDescriptor | null {
  if (!isWorkspaceContextMessage(message)) {
    return null;
  }

  const content = message.content.trim();

  const startMatch = content.match(
    /^(.+?) created the workspace and opened the proposal surface\.$/,
  );

  if (startMatch?.[1]) {
    return {
      kind: "start",
      text: `${startMatch[1]} started the research`,
    };
  }

  const inviteMatch = content.match(
    /^(.+?) invited (.+?) to collaborate\. Intent:/,
  );

  if (inviteMatch?.[1] && inviteMatch[2]) {
    return {
      kind: "invite",
      text: `${inviteMatch[1]} invited ${inviteMatch[2]}`,
    };
  }

  const acceptedInviteMatch = content.match(
    /^(.+?) accepted the collaboration invite\.$/,
  );

  if (acceptedInviteMatch?.[1]) {
    return {
      kind: "join",
      text: `${acceptedInviteMatch[1]} accepted the invite`,
    };
  }

  const approvedJoinRequestMatch = content.match(
    /^(.+?) approved (.+?)'s request to join the workspace\.$/,
  );

  if (approvedJoinRequestMatch?.[2]) {
    return {
      kind: "join",
      text: `${approvedJoinRequestMatch[2]} accepted the invite`,
    };
  }

  if (content.startsWith("Proposal completed.")) {
    return {
      kind: "stage",
      text: "Research moved from Proposal to Draft stage",
    };
  }

  if (content === "The workspace paper was published publicly and is now available in Explore.") {
    return {
      kind: "live",
      text: "Congrats! Your research is now live",
    };
  }

  const publishedVisibilityMatch = content.match(
    /^The workspace paper was published with (.+?) visibility\.$/,
  );

  if (publishedVisibilityMatch?.[1]) {
    return {
      kind: "live",
      text: `Paper published · ${publishedVisibilityMatch[1]} visibility`,
    };
  }

  const decisionOpenedMatch = content.match(
    /^Decision opened\. \[decision:([^\]]+)\] (.+)$/,
  );

  if (decisionOpenedMatch?.[1] && decisionOpenedMatch[2]) {
    return {
      kind: "decision_opened",
      text: decisionOpenedMatch[2],
      decisionId: decisionOpenedMatch[1],
      title: decisionOpenedMatch[2],
    };
  }

  const decisionOpenedSeedMatch = content.match(
    /^Decision opened for "(.+?)"\. This decision is (required|optional) and begins in discussion mode\.$/,
  );

  if (decisionOpenedSeedMatch?.[1] && decisionOpenedSeedMatch[2]) {
    return {
      kind: "decision_opened",
      text: decisionOpenedSeedMatch[1],
      title: decisionOpenedSeedMatch[1],
      required: decisionOpenedSeedMatch[2] === "required",
    };
  }

  const decisionReadyMatch = content.match(
    /^Decision "(.+?)" is ready for structured voting\.$/,
  );

  if (decisionReadyMatch?.[1]) {
    return {
      kind: "decision_ready",
      text: decisionReadyMatch[1],
      title: decisionReadyMatch[1],
    };
  }

  const decisionVoteMatch = content.match(
    /^Voting opened for "(.+?)"\. Approvals: (\d+)\/(\d+)\. Rejections: (\d+)\.$/,
  );

  if (decisionVoteMatch?.[1]) {
    return {
      kind: "decision_vote",
      text: decisionVoteMatch[1],
      title: decisionVoteMatch[1],
    };
  }

  const decisionResolvedMatch = content.match(
    /^Decision resolved\. \[decision:([^\]]+)\] (.+) was (approved|rejected|resolved by emergency override)\.$/,
  );

  if (
    decisionResolvedMatch?.[1] &&
    decisionResolvedMatch[2] &&
    decisionResolvedMatch[3]
  ) {
    return {
      kind: "decision_resolved",
      text: "Decision resolved",
      decisionId: decisionResolvedMatch[1],
      title: decisionResolvedMatch[2],
      outcome: decisionResolvedMatch[3],
    };
  }

  const decisionResolvedSeedMatch = content.match(
    /^Decision "(.+?)" resolved with outcome: (.+)\.$/,
  );

  if (decisionResolvedSeedMatch?.[1] && decisionResolvedSeedMatch[2]) {
    return {
      kind: "decision_resolved",
      text: decisionResolvedSeedMatch[1],
      title: decisionResolvedSeedMatch[1],
      outcome: decisionResolvedSeedMatch[2],
    };
  }

  const fallbackText = normalizeWorkspaceContextFallbackText(content);

  if (!fallbackText) {
    return null;
  }

  return {
    kind: "context",
    text: fallbackText,
  };
}
