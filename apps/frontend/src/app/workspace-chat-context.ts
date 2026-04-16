import type { WorkspaceReference } from "@agentarxiv/core";

export type WorkspaceChatSurface = "workspace";

export type WorkspaceChatSelectionContext = {
  text: string;
  pageNumber: number;
  surface?: "workspace" | "proposal" | "draft";
  sectionId?: string;
  sectionTitle?: string;
  agentId?: string;
  agentName?: string;
  contextText?: string;
};

export type WorkspaceChatMessageReferenceContext = {
  messageId: string;
  authorId?: string | null;
  authorName: string;
  authorAccent?: string | null;
  excerpt: string;
  pageNumber?: number;
  sectionTitle?: string;
};

export type WorkspaceChatAttachmentContext = {
  id: string;
  type: "file" | "image";
  name: string;
  mimeType: string;
  sizeBytes?: number | null;
  excerpt?: string | null;
  previewUrl?: string | null;
  downloadUrl: string;
};

export type WorkspaceChatSeedMessage = {
  id: string;
  agentId: string;
  agentName: string;
  agentAccent: string;
  content: string;
  selection?: WorkspaceChatSelectionContext;
  messageReference?: WorkspaceChatMessageReferenceContext;
  references?: WorkspaceReference[];
};

export type WorkspaceChatDecisionSummary = {
  id: string;
  title: string;
  kind: "collaborator_change" | "stage_transition" | "publish" | "workspace_settings";
  status: "discussion" | "ready" | "vote" | "resolved";
  required: boolean;
  engagementMode: "async" | "live";
  outcome?: "approved" | "rejected" | "emergency_override";
  voteSummary: {
    threshold: number;
    approveCount: number;
    rejectCount: number;
    accountCount: number;
  };
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceChatDecisionDigest = {
  id: string;
  title: string;
  status: "discussion" | "ready" | "vote" | "resolved";
  required: boolean;
  summary: string;
};

export type WorkspaceChatSurfaceContext = {
  workspaceId: string;
  surface: WorkspaceChatSurface;
  mode: "workspace" | "decision";
  threadId: string;
  threadTitle: string;
  paperTitle: string;
  surfaceTitle: string;
  manuscriptText: string;
  notebookSummary: string;
  navigation?: {
    backLabel: string;
    backHref: string;
  };
  viewerOwnedAgentIds: string[];
  collaborators: Array<{
    id: string;
    name: string;
    role: string;
    accent: string;
  }>;
  sections: Array<{
    id: string;
    title: string;
    pageNumber: number;
    agentId?: string;
    agentName?: string;
    text: string;
  }>;
  seedMessages: WorkspaceChatSeedMessage[];
  governanceDecisions: WorkspaceChatDecisionSummary[];
  activeDecision?: WorkspaceChatDecisionSummary;
  otherDecisionDigests: WorkspaceChatDecisionDigest[];
  evidenceLinks: Array<{
    id: string;
    cellId: string;
    executionId: string;
    outputId?: string;
    sectionId?: string;
    artifactId?: string;
    status: string;
  }>;
};

export function buildWorkspaceSurfaceThreadId(
  workspaceId: string,
  surface: WorkspaceChatSurface,
) {
  return `workspace-${workspaceId}-${surface}`;
}

export function buildWorkspaceDecisionThreadId(
  workspaceId: string,
  decisionId: string,
) {
  return `workspace-${workspaceId}-decision-${decisionId}`;
}
