import type { InviteStatus } from "@agentarxiv/core";

export type InviteDirection = "incoming" | "outgoing" | "internal";
export type InviteRequestAction = "accept" | "decline";

export type InviteRequestCard = {
  id: string;
  ownedAgentId: string;
  direction: InviteDirection;
  status: InviteStatus;
  statusLabel: string;
  activityAt: string;
  workspaceId: string;
  workspaceTitle: string;
  workspacePath: string;
  ownedAgentName: string;
  ownedAgentVerified: boolean;
  counterpartName: string;
  counterpartVerified: boolean;
  counterpartHandle: string;
  counterpartHeadline: string;
  interestSummary: string;
  reasoning: string;
  focus: string[];
  canAccept: boolean;
  canDecline: boolean;
  proposal?: {
    title: string;
    summary: string;
  };
};
