import "server-only";

import type { AgentProfile, Invite, InviteStatus, WorkspaceBrief } from "@agentarxiv/core";
import { repository } from "@/lib/repository";
import type { InviteDirection, InviteRequestCard } from "./invites-types";

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

function formatInviteStatus(status: InviteStatus) {
  switch (status) {
    case "pending":
      return "Pending";
    case "requested":
      return "Requested";
    case "accepted":
      return "Accepted";
    case "declined":
      return "Declined";
    case "withdrawn":
      return "Withdrawn";
  }
}

function formatRelativeTime(timestamp: string) {
  const deltaMs = new Date(timestamp).getTime() - Date.now();
  const deltaMinutes = Math.round(deltaMs / 60_000);

  if (Math.abs(deltaMinutes) < 60) {
    return relativeTimeFormatter.format(deltaMinutes, "minute");
  }

  const deltaHours = Math.round(deltaMinutes / 60);

  if (Math.abs(deltaHours) < 24) {
    return relativeTimeFormatter.format(deltaHours, "hour");
  }

  const deltaDays = Math.round(deltaHours / 24);

  if (Math.abs(deltaDays) < 30) {
    return relativeTimeFormatter.format(deltaDays, "day");
  }

  const deltaMonths = Math.round(deltaDays / 30);

  if (Math.abs(deltaMonths) < 12) {
    return relativeTimeFormatter.format(deltaMonths, "month");
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
}

function resolveInviteDirection(
  invite: Invite,
  ownedAgentIds: Set<string>,
): InviteDirection {
  const ownsFromAgent = ownedAgentIds.has(invite.fromAgentId);
  const ownsToAgent = ownedAgentIds.has(invite.toAgentId);

  if (ownsFromAgent && ownsToAgent) {
    return "internal";
  }

  return ownsFromAgent ? "outgoing" : "incoming";
}

function canRespondToInvite(invite: Invite, direction: InviteDirection) {
  return (
    direction === "incoming" &&
    (invite.status === "pending" || invite.status === "requested")
  );
}

function buildFocus(invite: Invite) {
  const proposalFocus = invite.proposal
    ? [
        ...invite.proposal.requestedRoles,
        ...invite.proposal.contributionAreas,
        ...invite.proposal.deliverables,
      ]
    : [];

  const focus = proposalFocus.length > 0 ? proposalFocus : invite.matchReasons;

  return [...new Set(focus.map((item) => item.trim()).filter(Boolean))].slice(
    0,
    4,
  );
}

function requireRecord<T>(value: T | undefined, description: string): T {
  if (!value) {
    throw new Error(`Missing invite relation: ${description}`);
  }

  return value;
}

export async function getInviteRequestsForUser(
  ownerClerkUserId: string,
): Promise<InviteRequestCard[]> {
  const ownedAgents = await repository.listAccountAgents(ownerClerkUserId);

  if (ownedAgents.length === 0) {
    return [];
  }

  const ownedAgentIds = new Set(ownedAgents.map((agent) => agent.id));
  const ownedAgentsById = new Map(
    ownedAgents.map((agent) => [agent.id, agent]),
  );
  const inviteMap = new Map<string, Invite>();

  await Promise.all(
    ownedAgents.map(async (agent) => {
      const invites = await repository.listInvites({ agentId: agent.id });

      for (const invite of invites) {
        inviteMap.set(invite.id, invite);
      }
    }),
  );

  const invites = [...inviteMap.values()].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );

  if (invites.length === 0) {
    return [];
  }

  const counterpartIds = [
    ...new Set(
      invites
        .flatMap((invite) => [invite.fromAgentId, invite.toAgentId])
        .filter((agentId) => !ownedAgentIds.has(agentId)),
    ),
  ];
  const participantIds = [
    ...new Set(invites.flatMap((invite) => [invite.fromAgentId, invite.toAgentId])),
  ];
  const workspaceIds = [
    ...new Set(invites.map((invite) => invite.workspaceId)),
  ];

  const [counterpartProfiles, workspaces, sandboxStatuses] = await Promise.all([
    Promise.all(
      counterpartIds.map(async (agentId) => {
        const profile = (await repository.getAgentDossier(agentId)).profile;
        return [agentId, profile] as const;
      }),
    ),
    Promise.all(
      workspaceIds.map(async (workspaceId) => {
        const workspace = await repository.getWorkspace(workspaceId);
        return [workspaceId, workspace] as const;
      }),
    ),
    Promise.all(
      participantIds.map(async (agentId) => {
        const sandboxStatus = await repository.getAgentSandboxStatus(agentId);
        return [agentId, sandboxStatus] as const;
      }),
    ),
  ]);

  const agentProfilesById = new Map<string, AgentProfile>([
    ...ownedAgentsById,
    ...counterpartProfiles,
  ]);
  const workspacesById = new Map<string, WorkspaceBrief>(workspaces);
  const sandboxStatusByAgentId = new Map(sandboxStatuses);

  return invites.map((invite) => {
    const direction = resolveInviteDirection(invite, ownedAgentIds);
    const ownedAgentId =
      direction === "incoming"
        ? invite.toAgentId
        : direction === "outgoing"
          ? invite.fromAgentId
          : invite.fromAgentId;
    const counterpartId =
      direction === "incoming"
        ? invite.fromAgentId
        : direction === "outgoing"
          ? invite.toAgentId
          : invite.toAgentId;
    const ownedAgent = requireRecord(
      agentProfilesById.get(ownedAgentId),
      `owned agent ${ownedAgentId} for invite ${invite.id}`,
    );
    const counterpart = requireRecord(
      agentProfilesById.get(counterpartId),
      `counterpart agent ${counterpartId} for invite ${invite.id}`,
    );
    const workspace = requireRecord(
      workspacesById.get(invite.workspaceId),
      `workspace ${invite.workspaceId} for invite ${invite.id}`,
    );
    const canRespond = canRespondToInvite(invite, direction);

    return {
      id: invite.id,
      ownedAgentId,
      direction,
      status: invite.status,
      statusLabel: formatInviteStatus(invite.status),
      activityAt: formatRelativeTime(invite.updatedAt),
      workspaceId: invite.workspaceId,
      workspaceTitle: workspace.title,
      workspacePath: `/workspace/${invite.workspaceId}`,
      ownedAgentName: ownedAgent.displayName,
      ownedAgentVerified: Boolean(
        sandboxStatusByAgentId.get(ownedAgentId)?.verifiedProfile,
      ),
      counterpartName: counterpart.displayName,
      counterpartVerified: Boolean(
        sandboxStatusByAgentId.get(counterpartId)?.verifiedProfile,
      ),
      counterpartHandle: counterpart.handle,
      counterpartHeadline: counterpart.headline,
      interestSummary: invite.interestSummary,
      reasoning: invite.reasoning,
      focus: buildFocus(invite),
      canAccept: canRespond,
      canDecline: canRespond,
      proposal: invite.proposal
        ? {
            title: invite.proposal.title,
            summary: invite.proposal.summary,
          }
        : undefined,
    } satisfies InviteRequestCard;
  });
}
