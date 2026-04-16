import { unstable_noStore as noStore } from "next/cache";
import type {
  Artifact,
  AgentSandboxStatus,
  WorkspacePaperStatus,
  WorkspaceRecord,
  WorkspaceDocument,
  AgentProfile,
} from "@agentarxiv/core";
import { assignWorkspacePaperAuthorAccents } from "@agentarxiv/core";
import { repository } from "@/lib/repository";
import { buildVerifiedAgentIdSet } from "../agent-verification";
import {
  buildWorkspaceDecisionThreadId,
  buildWorkspaceSurfaceThreadId,
  type WorkspaceChatDecisionDigest,
  type WorkspaceChatDecisionSummary,
  type WorkspaceChatSeedMessage,
  type WorkspaceChatSurface,
  type WorkspaceChatSurfaceContext,
} from "../workspace-chat-context";
import {
  workspacePaperTemplates,
  type WorkspaceAgent,
  type WorkspaceLatexDocument,
  type WorkspaceLatexDocumentSection,
  type WorkspacePaperTemplateId,
} from "../workspace-paper-data";

export type WorkspaceBoardParticipant = {
  id: string;
  label: string;
  verified: boolean;
};

export type WorkspaceBoardCard = {
  id: string;
  paperId: string;
  title: string;
  summary: string;
  participants: WorkspaceBoardParticipant[];
  href: string;
  stage: WorkspacePaperStatus;
  createdAt: string;
  stageEnteredAt: string;
};

function formatWorkspaceBoardPaperId(sequence: number) {
  return `P-${String(sequence).padStart(2, "0")}`;
}

export type WorkspaceClientModel = {
  id: string;
  title: string;
  abstract: string;
  venue: string;
  paperStatus: WorkspacePaperStatus;
  proposalStatus: "open" | "completed";
  maxCollaborators: number;
  memberCount: number;
  remainingCollaboratorSlots: number;
  collaboratorsLocked: boolean;
  openInviteCount: number;
  canActivateDraft: boolean;
  surfaceAccess: WorkspaceRecord["surfaceAccess"];
  linkedPapers: Array<{
    id: string;
    title: string;
    status: string;
  }>;
  sandbox: {
    hasBlockingJobs: boolean;
    blockingExecutionCount: number;
    activeExecutionCount: number;
    activeSessionCount: number;
    totalBilledRuntimeSeconds: number;
    sessions: Array<{
      id: string;
      agentId: string;
      agentName: string;
      status: string;
      providerSessionId?: string;
      startedAt: string;
      lastActiveAt: string;
      expiresAt: string;
      errorMessage?: string;
    }>;
    recentExecutions: Array<{
      id: string;
      agentId: string;
      agentName: string;
      status: string;
      executionMode?: string;
      objective: string;
      summary?: string;
      command: string;
      workingDirectory?: string;
      timeoutSeconds?: number;
      parentExecutionId?: string;
      chainDepth: number;
      notebookCellId?: string;
      notebookOutputIds?: string[];
      leaseSequence?: number;
      legacyRunKind?: string;
      billedRuntimeSeconds: number;
      createdAt: string;
      startedAt?: string;
      finishedAt?: string;
      resultSummary?: string;
      errorMessage?: string;
      stdout: string;
      stderr: string;
      artifact?: {
        id: string;
        title: string;
        type: Artifact["type"];
      };
    }>;
  };
  notebook: WorkspaceRecord["notebook"];
  notebookLease?: WorkspaceRecord["notebookLease"];
  notebookEvidence: WorkspaceRecord["notebookEvidence"];
  agents: WorkspaceAgent[];
  proposalDocument: WorkspaceLatexDocument;
  draftDocument: WorkspaceLatexDocument;
  chatContext: WorkspaceChatSurfaceContext;
};

function toUsername(value: string) {
  return `@${value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
}

function resolveTemplateId(templateId: string): WorkspacePaperTemplateId {
  if (
    templateId !== "arxiv-labs-template" &&
    templateId !== "ieee-conference" &&
    templateId !== "acm-sigconf"
  ) {
    throw new Error(`Unsupported workspace template ${templateId}`);
  }

  return templateId;
}

function buildPaperAccentByAgentId(
  workspaceId: string,
  documents: WorkspaceDocument[],
) {
  const sourceDocument =
    documents.find((document) => document.surface === "draft") ??
    documents.find((document) => document.surface === "proposal");

  if (!sourceDocument) {
    return new Map<string, string>();
  }

  return new Map(
    assignWorkspacePaperAuthorAccents(workspaceId, sourceDocument.authors)
      .filter((author) => Boolean(author.id))
      .map((author) => [author.id!, author.accent]),
  );
}

function toWorkspaceAgent(
  agent: AgentProfile,
  accentByAgentId: Map<string, string>,
  sandboxStatus: AgentSandboxStatus,
  currentViewerClerkUserId?: string,
): WorkspaceAgent {
  return {
    id: agent.id,
    name: agent.displayName,
    role: agent.preferredRoles[0] ?? "collaborator",
    description: agent.headline,
    focus: [...new Set([...agent.capabilities, ...agent.researchInterests])].slice(0, 4),
    accent: accentByAgentId.get(agent.id) ?? agent.avatarAccent,
    sandboxEligibility: sandboxStatus.sandboxEligibility,
    verifiedProfile: sandboxStatus.verifiedProfile,
    billingOwnerClerkUserId: sandboxStatus.billingOwnerClerkUserId,
    ineligibilityReason: sandboxStatus.ineligibilityReason,
    isOwnedByCurrentAccount:
      Boolean(currentViewerClerkUserId) &&
      sandboxStatus.billingOwnerClerkUserId === currentViewerClerkUserId,
  };
}

function getSectionHeading(
  templateId: WorkspacePaperTemplateId,
  surface: WorkspaceDocument["surface"],
  slotId: string,
  title: string,
) {
  const slot = workspacePaperTemplates[templateId].structures[surface].find(
    (item) => item.slotId === slotId,
  );

  return slot?.heading ?? `\\section{${title}}`;
}

function toLatexDocumentWithSectionState(
  document: WorkspaceDocument,
  sectionStateById: Map<
    string,
    {
      claimedByAgentId?: string;
      liveContent?: string;
      liveUpdatedAt?: string;
      status: string;
    }
  >,
  sectionAssetsById: Map<string, Artifact[]>,
): WorkspaceLatexDocument {
  const templateId = resolveTemplateId(document.templateId);
  const normalizedAuthors = assignWorkspacePaperAuthorAccents(
    document.workspaceId,
    document.authors,
  );
  const sections: WorkspaceLatexDocumentSection[] = document.sections.map((section) => {
    const sectionState = sectionStateById.get(section.id);
    const assets = sectionAssetsById.get(section.id) ?? [];
    const liveText =
      document.surface === "draft" && typeof sectionState?.liveContent === "string"
        ? sectionState.liveContent
        : undefined;

    return {
      id: section.id,
      slotId: section.slotId,
      title: section.title,
      role: section.role,
      agentId: sectionState?.claimedByAgentId ?? section.agentId,
      pageHint: section.pageHint,
      heading: getSectionHeading(templateId, document.surface, section.slotId, section.title),
      initialText: liveText !== undefined ? "" : section.content.trim(),
      liveText,
      isTyping:
        document.surface === "draft" &&
        typeof liveText === "string" &&
        Boolean(sectionState?.claimedByAgentId),
      assets: assets.map((asset) => ({
        id: asset.id,
        title: asset.title,
        type: asset.type,
        content: asset.content,
      })),
      targetText: "",
      startDelay: 0,
      stepEvery: 1,
    };
  });

  return {
    id: document.surface,
    title: document.title,
    templateId,
    paperTitle: document.paperTitle,
    authors: normalizedAuthors.map((author) => ({
      id: author.id ?? author.name,
      name: author.name,
      affiliation: author.affiliation,
      location: author.location,
      email: author.email,
      accent: author.accent,
    })),
    abstractText: document.abstractText,
    keywords: document.keywords,
    references: document.references,
    sectionOrder: document.sectionOrder,
    preambleLines: [],
    sections,
    closingLines: [],
  };
}

function buildSectionAssetsById(record: WorkspaceRecord) {
  const artifactsById = new Map(record.artifacts.map((artifact) => [artifact.id, artifact]));

  return new Map(
    record.sections.map((section) => [
      section.id,
      section.artifactRefs
        .map((artifactId) => artifactsById.get(artifactId))
        .filter((artifact): artifact is Artifact => Boolean(artifact)),
    ]),
  );
}

function buildManuscriptText(
  document: WorkspaceDocument,
  membersById: Map<string, AgentProfile>,
  sectionAssetsById: Map<string, Artifact[]>,
) {
  const lines: string[] = [];

  lines.push(`# ${document.paperTitle}`);

  if (document.abstractText) {
    lines.push("");
    lines.push("## Abstract");
    lines.push(document.abstractText.trim());
  }

  if (document.keywords.length > 0) {
    lines.push("");
    lines.push(`Keywords: ${document.keywords.join(", ")}`);
  }

  for (const sectionId of document.sectionOrder) {
    const section = document.sections.find((item) => item.id === sectionId);

    if (!section) {
      continue;
    }

    lines.push("");
    lines.push(`## ${section.title}`);
    lines.push(`Page: ${section.pageHint ?? 1}`);

    if (section.agentId) {
      const agent = membersById.get(section.agentId);

      if (agent) {
        lines.push(
          `Assigned agent: ${agent.displayName} (${agent.preferredRoles[0] ?? "collaborator"})`,
        );
      }
    }

    lines.push(section.content.trim() || "No drafted text yet.");

    const linkedAssets = sectionAssetsById.get(section.id) ?? [];

    for (const asset of linkedAssets) {
      lines.push("");

      if (asset.type === "table") {
        lines.push(`Table: ${asset.title}`);
        lines.push(asset.content.trim());
        continue;
      }

      if (
        asset.type === "figure" ||
        asset.type === "diagram" ||
        asset.type === "chart"
      ) {
        lines.push(`[${asset.type}] ${asset.title}`);
        lines.push("Linked visual asset attached to this section.");
        continue;
      }

      lines.push(`[${asset.type}] ${asset.title}`);

      if (asset.content.trim()) {
        lines.push(asset.content.trim());
      }
    }
  }

  if (document.references.length > 0) {
    lines.push("");
    lines.push("## References");
    lines.push(document.references.join("\n"));
  }

  return lines.join("\n");
}

function buildChatSeedMessages(
  record: WorkspaceRecord,
  accentByAgentId: Map<string, string>,
): WorkspaceChatSeedMessage[] {
  return record.messages
    .filter((message) => message.authorType !== "human")
    .map((message) => ({
      id: message.id,
      agentId: message.agentId ?? "workspace_context",
      agentName: message.authorName,
      agentAccent:
        (message.agentId ? accentByAgentId.get(message.agentId) : undefined) ??
        message.authorAccent ??
        "#7b8794",
      content: message.content,
      selection: message.selection
        ? {
            text: message.selection.text,
            pageNumber: message.selection.pageNumber,
            sectionId: message.selection.sectionId,
            sectionTitle: message.selection.sectionTitle,
            agentId: message.agentId,
            agentName: record.members.find((member) => member.id === message.agentId)?.displayName,
            surface: message.selection.surface,
            contextText: message.selection.contextText,
          }
        : undefined,
      messageReference: message.messageReference,
      references: message.references ?? [],
    }));
}

function buildGovernanceVoteSummary(
  record: WorkspaceRecord,
  decisionId: string,
): WorkspaceChatDecisionSummary["voteSummary"] {
  const votes = record.governanceVotes.filter((vote) => vote.decisionId === decisionId);
  const accountCount = Math.max(1, record.accountMembers.length);

  return {
    threshold: Math.max(1, Math.ceil(accountCount * (2 / 3))),
    approveCount: votes.filter((vote) => vote.vote === "approve").length,
    rejectCount: votes.filter((vote) => vote.vote === "reject").length,
    accountCount,
  };
}

function toGovernanceDecisionSummary(
  record: WorkspaceRecord,
  decision: WorkspaceRecord["governanceDecisions"][number],
): WorkspaceChatDecisionSummary {
  return {
    id: decision.id,
    title: decision.title,
    kind: decision.kind,
    status: decision.status,
    required: decision.required,
    engagementMode: decision.engagementMode,
    outcome: decision.outcome,
    voteSummary: buildGovernanceVoteSummary(record, decision.id),
    createdAt: decision.createdAt,
    updatedAt: decision.updatedAt,
  };
}

function toGovernanceDecisionDigest(
  record: WorkspaceRecord,
  decision: WorkspaceRecord["governanceDecisions"][number],
): WorkspaceChatDecisionDigest {
  const voteSummary = buildGovernanceVoteSummary(record, decision.id);
  const statusCopy =
    decision.status === "vote"
      ? `${voteSummary.approveCount}/${voteSummary.threshold} approvals`
      : decision.status === "ready"
        ? "Ready for vote"
        : decision.status === "resolved"
          ? decision.outcome === "approved"
            ? "Resolved approved"
            : decision.outcome === "emergency_override"
              ? "Resolved by override"
              : "Resolved rejected"
          : "In discussion";

  return {
    id: decision.id,
    title: decision.title,
    status: decision.status,
    required: decision.required,
    summary: statusCopy,
  };
}

function buildGovernanceDecisionSeedMessages(
  record: WorkspaceRecord,
  decision: WorkspaceRecord["governanceDecisions"][number],
): WorkspaceChatSeedMessage[] {
  const voteSummary = buildGovernanceVoteSummary(record, decision.id);
  const messages: WorkspaceChatSeedMessage[] = [
    {
      id: `${decision.id}:opened`,
      agentId: "workspace_context",
      agentName: "Workspace Context",
      agentAccent: "#7b8794",
      content: `Decision opened for "${decision.title}". This decision is ${decision.required ? "required" : "optional"} and begins in discussion mode.`,
    },
  ];

  if (decision.status === "ready" || decision.status === "vote" || decision.status === "resolved") {
    messages.push({
      id: `${decision.id}:ready`,
      agentId: "workspace_context",
      agentName: "Workspace Context",
      agentAccent: "#7b8794",
      content: `Decision "${decision.title}" is ready for structured voting.`,
    });
  }

  if (decision.status === "vote" || decision.status === "resolved") {
    messages.push({
      id: `${decision.id}:vote`,
      agentId: "workspace_context",
      agentName: "Workspace Context",
      agentAccent: "#7b8794",
      content: `Voting opened for "${decision.title}". Approvals: ${voteSummary.approveCount}/${voteSummary.threshold}. Rejections: ${voteSummary.rejectCount}.`,
    });
  }

  if (decision.status === "resolved" && decision.outcome) {
    messages.push({
      id: `${decision.id}:resolved`,
      agentId: "workspace_context",
      agentName: "Workspace Context",
      agentAccent: "#7b8794",
      content: `Decision "${decision.title}" resolved with outcome: ${decision.outcome.replace(/_/g, " ")}.`,
    });
  }

  return messages;
}

function buildNotebookSummary(record: WorkspaceRecord, membersById: Map<string, AgentProfile>) {
  const notebook = record.notebook;
  const linkedEvidence = record.notebookEvidence.filter((item) => item.status === "linked");
  const latestCodeCells = notebook.document.cells
    .filter((cell) => cell.cell_type === "code")
    .slice(-6)
    .map((cell) => {
      const agentarxivMetadata =
        typeof cell.metadata.agentarxiv === "object" && cell.metadata.agentarxiv !== null
          ? (cell.metadata.agentarxiv as Record<string, unknown>)
          : {};
      const agentName =
        typeof agentarxivMetadata.lastExecutingAgentId === "string"
          ? membersById.get(agentarxivMetadata.lastExecutingAgentId)?.displayName
          : undefined;
      const status =
        typeof agentarxivMetadata.lastExecutionStatus === "string"
          ? agentarxivMetadata.lastExecutionStatus
          : "not-run";

      return `- ${cell.id}: ${status}${agentName ? ` by ${agentName}` : ""}`;
    });

  return [
    `Notebook revision: ${notebook.currentRevision}`,
    `Cells: ${notebook.document.cells.length}`,
    `Linked evidence items: ${linkedEvidence.length}`,
    latestCodeCells.length > 0 ? "Recent executable cells:" : undefined,
    ...latestCodeCells,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildWorkspaceChatContextFromRecord(
  record: WorkspaceRecord,
  accentByAgentId: Map<string, string>,
  currentViewerClerkUserId?: string,
): WorkspaceChatSurfaceContext {
  const membersById = new Map(record.members.map((member) => [member.id, member]));
  const sectionAssetsById = buildSectionAssetsById(record);
  const proposalDocument = record.documents.find((item) => item.surface === "proposal");
  const draftDocument = record.documents.find((item) => item.surface === "draft");
  const primaryDocument = draftDocument ?? proposalDocument;

  if (!proposalDocument || !draftDocument || !primaryDocument) {
    throw new Error(`Workspace ${record.workspace.id} is missing one or more manuscript surfaces`);
  }

  const documents = [proposalDocument, draftDocument];
  const governanceDecisions = record.governanceDecisions.map((decision) =>
    toGovernanceDecisionSummary(record, decision),
  );

  return {
    workspaceId: record.workspace.id,
    surface: "workspace",
    mode: "workspace",
    threadId: buildWorkspaceSurfaceThreadId(record.workspace.id, "workspace"),
    threadTitle: "Workspace collaboration",
    paperTitle: primaryDocument.paperTitle,
    surfaceTitle: record.workspace.paperStatus === "proposal" ? "Proposal + experiments" : "Draft + experiments",
    manuscriptText: documents
      .map(
        (document) =>
          `# ${document.surface === "proposal" ? "Proposal manuscript" : "Draft manuscript"}\n\n${buildManuscriptText(
            document,
            membersById,
            sectionAssetsById,
          )}`,
      )
      .join("\n\n"),
    notebookSummary: buildNotebookSummary(record, membersById),
    viewerOwnedAgentIds: currentViewerClerkUserId
      ? record.members
          .filter((member) => member.ownerClerkUserId === currentViewerClerkUserId)
          .map((member) => member.id)
      : [],
    collaborators: record.members.map((member) => ({
      id: member.id,
      name: member.displayName,
      role: member.preferredRoles[0] ?? "collaborator",
      accent: accentByAgentId.get(member.id) ?? member.avatarAccent,
    })),
    sections: documents
      .flatMap((document) =>
        document.sectionOrder.map((sectionId) => {
          const section = document.sections.find((item) => item.id === sectionId);

          if (!section) {
            return undefined;
          }

          return {
            id: `${document.surface}:${section.id}`,
            title: `${document.surface === "proposal" ? "Proposal" : "Draft"} · ${section.title}`,
            pageNumber: section.pageHint ?? 1,
            agentId: section.agentId,
            agentName: section.agentId
              ? membersById.get(section.agentId)?.displayName
              : undefined,
            text: section.content.trim(),
          };
        }),
      )
      .filter((section): section is NonNullable<typeof section> => Boolean(section))
      .map((section) => ({
        id: section.id,
        title: section.title,
        pageNumber: section.pageNumber,
        agentId: section.agentId,
        agentName: section.agentName,
        text: section.text,
      })),
    seedMessages: buildChatSeedMessages(record, accentByAgentId),
    governanceDecisions,
    otherDecisionDigests: governanceDecisions
      .filter((decision) => decision.status !== "resolved")
      .map((decision) => ({
        id: decision.id,
        title: decision.title,
        status: decision.status,
        required: decision.required,
        summary:
          decision.status === "vote"
            ? `${decision.voteSummary.approveCount}/${decision.voteSummary.threshold} approvals`
            : decision.status === "ready"
              ? "Ready for vote"
              : "In discussion",
      })),
    evidenceLinks: record.notebookEvidence.map((link) => ({
      id: link.id,
      cellId: link.cellId,
      executionId: link.executionId,
      outputId: link.outputId,
      sectionId: link.sectionId,
      artifactId: link.artifactId,
      status: link.status,
    })),
  };
}

function buildWorkspaceDecisionChatContextFromRecord(
  record: WorkspaceRecord,
  accentByAgentId: Map<string, string>,
  decisionId: string,
  currentViewerClerkUserId?: string,
): WorkspaceChatSurfaceContext {
  const baseContext = buildWorkspaceChatContextFromRecord(
    record,
    accentByAgentId,
    currentViewerClerkUserId,
  );
  const decision = record.governanceDecisions.find((item) => item.id === decisionId);

  if (!decision) {
    throw new Error(`Governance decision ${decisionId} was not found for workspace ${record.workspace.id}`);
  }

  const activeDecision = toGovernanceDecisionSummary(record, decision);

  return {
    ...baseContext,
    mode: "decision",
    threadId: buildWorkspaceDecisionThreadId(record.workspace.id, decision.id),
    threadTitle: activeDecision.title,
    surfaceTitle: `Decision · ${activeDecision.title}`,
    navigation: {
      backLabel: "Back to workspace chat",
      backHref: `/workspace/${record.workspace.id}`,
    },
    seedMessages: buildGovernanceDecisionSeedMessages(record, decision),
    governanceDecisions: baseContext.governanceDecisions,
    activeDecision,
    otherDecisionDigests: record.governanceDecisions
      .filter((item) => item.id !== decision.id && item.status !== "resolved")
      .map((item) => toGovernanceDecisionDigest(record, item)),
  };
}

function getEarliestRunStepStartedAt(
  record: WorkspaceRecord,
  stage: NonNullable<WorkspaceRecord["run"]>["steps"][number]["stage"],
) {
  return record.run?.steps
    .filter((step) => step.stage === stage)
    .reduce<string | undefined>((earliest, step) => {
      if (!earliest || step.startedAt.localeCompare(earliest) < 0) {
        return step.startedAt;
      }

      return earliest;
    }, undefined);
}

function getWorkspaceBoardStageEnteredAt(record: WorkspaceRecord) {
  switch (record.workspace.paperStatus) {
    case "proposal":
      return record.workspace.createdAt;
    case "draft":
      return (
        record.workspace.draftStartedAt ??
        record.workspace.proposalCompletedAt ??
        getEarliestRunStepStartedAt(record, "section_writing") ??
        record.workspace.updatedAt
      );
    case "published":
      return (
        getEarliestRunStepStartedAt(record, "compile") ??
        record.workspace.updatedAt
      );
  }
}

export async function getWorkspaceClientModel(
  workspaceId: string,
  currentViewerClerkUserId?: string,
): Promise<WorkspaceClientModel> {
  noStore();

  const record = await repository.getWorkspaceRecord(workspaceId);
  const proposalDocument = record.documents.find((document) => document.surface === "proposal");
  const draftDocument = record.documents.find((document) => document.surface === "draft");

  if (!proposalDocument || !draftDocument) {
    throw new Error(`Workspace ${workspaceId} is missing one or more surface documents`);
  }

  const sectionStateById = new Map(
    record.sections.map((section) => [
      section.id,
      {
        claimedByAgentId: section.claimedByAgentId,
        liveContent: section.liveContent,
        liveUpdatedAt: section.liveUpdatedAt,
        status: section.status,
      },
    ]),
  );
  const sectionAssetsById = buildSectionAssetsById(record);
  const accentByAgentId = buildPaperAccentByAgentId(record.workspace.id, record.documents);
  const membersById = new Map(record.members.map((member) => [member.id, member]));
  const artifactsById = new Map(record.artifacts.map((artifact) => [artifact.id, artifact]));
  const fallbackSandboxStatus: AgentSandboxStatus = {
    agentId: "",
    sandboxEligibility: "unverified",
    verifiedProfile: false,
    ineligibilityReason: "Sandbox billing is not configured for this agent.",
  };

  return {
    id: record.workspace.id,
    title: record.workspace.title,
    abstract: record.workspace.abstract,
    venue: record.workspace.venue,
    paperStatus: record.workspace.paperStatus,
    proposalStatus: record.workspace.proposalStatus,
    maxCollaborators: record.workspace.maxCollaborators,
    memberCount: record.members.length,
    remainingCollaboratorSlots: record.remainingCollaboratorSlots,
    collaboratorsLocked: record.collaboratorsLocked,
    openInviteCount: record.openInviteCount,
    canActivateDraft: record.canActivateDraft,
    surfaceAccess: record.surfaceAccess,
    linkedPapers: record.linkedPapers.map((paper) => ({
      id: paper.id,
      title: paper.title,
      status: paper.status,
    })),
    sandbox: {
      hasBlockingJobs: record.sandbox.hasBlockingJobs,
      blockingExecutionCount: record.sandbox.blockingExecutionCount,
      activeExecutionCount: record.sandbox.activeExecutionCount,
      activeSessionCount: record.sandbox.activeSessionCount,
      totalBilledRuntimeSeconds: record.sandbox.totalBilledRuntimeSeconds,
      sessions: record.sandbox.sessions.map((session) => ({
        id: session.id,
        agentId: session.agentId,
        agentName: membersById.get(session.agentId)?.displayName ?? session.agentId,
        status: session.status,
        providerSessionId: session.providerSessionId,
        startedAt: session.startedAt,
        lastActiveAt: session.lastActiveAt,
        expiresAt: session.expiresAt,
        errorMessage: session.errorMessage,
      })),
      recentExecutions: record.sandbox.recentExecutions.map((execution) => ({
        id: execution.id,
        agentId: execution.agentId,
        agentName: membersById.get(execution.agentId)?.displayName ?? execution.agentId,
        status: execution.status,
        executionMode: execution.executionMode,
        objective: execution.objective,
        summary: execution.summary,
        command: execution.command.command,
        workingDirectory: execution.command.workingDirectory,
        timeoutSeconds: execution.command.timeoutSeconds,
        parentExecutionId: execution.parentExecutionId,
        chainDepth: execution.chainDepth,
        notebookCellId: execution.notebookCellId,
        notebookOutputIds: execution.notebookOutputIds,
        leaseSequence: execution.leaseSequence,
        legacyRunKind: execution.legacyRunKind,
        billedRuntimeSeconds: execution.billedRuntimeSeconds,
        createdAt: execution.createdAt,
        startedAt: execution.startedAt,
        finishedAt: execution.finishedAt,
        resultSummary: execution.resultSummary,
        errorMessage: execution.errorMessage,
        stdout: execution.stdout,
        stderr: execution.stderr,
        artifact: execution.artifactId
          ? (() => {
              const artifact = artifactsById.get(execution.artifactId);

              return artifact
                ? {
                    id: artifact.id,
                    title: artifact.title,
                    type: artifact.type,
                  }
                : undefined;
            })()
          : undefined,
      })),
    },
    notebook: record.notebook,
    notebookLease: record.notebookLease,
    notebookEvidence: record.notebookEvidence,
    agents: record.members.map((member) =>
      toWorkspaceAgent(
        member,
        accentByAgentId,
        record.sandbox.memberEligibility[member.id] ?? {
          ...fallbackSandboxStatus,
          agentId: member.id,
        },
        currentViewerClerkUserId,
      ),
    ),
    proposalDocument: toLatexDocumentWithSectionState(
      proposalDocument,
      sectionStateById,
      sectionAssetsById,
    ),
    draftDocument: toLatexDocumentWithSectionState(
      draftDocument,
      sectionStateById,
      sectionAssetsById,
    ),
    chatContext: buildWorkspaceChatContextFromRecord(
      record,
      accentByAgentId,
      currentViewerClerkUserId,
    ),
  };
}

export async function getWorkspaceChatSurfaceContext(
  workspaceId: string,
  surface: WorkspaceChatSurface,
  decisionId?: string,
  currentViewerClerkUserId?: string,
) {
  const workspace = await getWorkspaceClientModel(workspaceId, currentViewerClerkUserId);

  if (surface !== "workspace") {
    throw new Error(`Unsupported workspace chat surface ${surface}`);
  }

  if (decisionId) {
    const record = await repository.getWorkspaceRecord(workspaceId);
    const accentByAgentId = buildPaperAccentByAgentId(workspaceId, record.documents);

    return buildWorkspaceDecisionChatContextFromRecord(
      record,
      accentByAgentId,
      decisionId,
      currentViewerClerkUserId,
    );
  }

  return workspace.chatContext;
}

export async function getWorkspaceBoardCardsForUser(ownerClerkUserId: string) {
  const workspaces = await repository.listWorkspacesForUser(ownerClerkUserId);
  const records = [];

  for (const workspace of workspaces) {
    records.push(await repository.getWorkspaceRecord(workspace.id));
  }

  const state = await repository.getState();
  const participantIds = [
    ...new Set(records.flatMap((record) => record.members.map((member) => member.id))),
  ];
  const verifiedParticipantIds = buildVerifiedAgentIdSet(state, participantIds);
  const paperIdsByWorkspaceId = new Map(
    [...records]
      .sort((left, right) => {
        const createdAtComparison = left.workspace.createdAt.localeCompare(
          right.workspace.createdAt,
        );

        if (createdAtComparison !== 0) {
          return createdAtComparison;
        }

        return left.workspace.id.localeCompare(right.workspace.id);
      })
      .map((record, index) => [
        record.workspace.id,
        formatWorkspaceBoardPaperId(index + 1),
      ]),
  );

  return records
    .map((record) => {
      return {
        id: record.workspace.id,
        paperId:
          paperIdsByWorkspaceId.get(record.workspace.id) ??
          formatWorkspaceBoardPaperId(0),
        title: record.workspace.title,
        summary: record.workspace.abstract,
        participants: record.members.map((member) => ({
          id: member.id,
          label: toUsername(member.handle),
          verified: verifiedParticipantIds.has(member.id),
        })),
        href: `/workspace/${record.workspace.id}`,
        stage: record.workspace.paperStatus,
        createdAt: record.workspace.createdAt,
        stageEnteredAt: getWorkspaceBoardStageEnteredAt(record),
      } satisfies WorkspaceBoardCard;
    })
    .sort((left, right) => {
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
