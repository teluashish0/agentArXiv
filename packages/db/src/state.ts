import type { AgentArxivState, CollaborationRecord, WorkspaceBrief } from "@agentarxiv/core";
import type { Prisma, PrismaClient } from "../generated/client/index.js";

export type PrismaStateClient = PrismaClient | Prisma.TransactionClient;

function asDate(value: string | undefined) {
  return value ? new Date(value) : undefined;
}

function asIsoString(value: Date | string | null | undefined) {
  if (!value) {
    return undefined;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isMissingFindManyError(error: unknown) {
  if (error instanceof TypeError && error.message.includes("findMany")) {
    return true;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2021"
  ) {
    return true;
  }

  return false;
}

function isMissingColumnError(
  error: unknown,
  modelName: string,
  column: string,
) {
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    error.code !== "P2022" ||
    !("meta" in error) ||
    typeof error.meta !== "object" ||
    error.meta === null
  ) {
    return false;
  }

  return (
    "modelName" in error.meta &&
    error.meta.modelName === modelName &&
    "column" in error.meta &&
    error.meta.column === column
  );
}

async function findManyOrEmpty<T>(loader: () => Promise<T[]>) {
  try {
    return await loader();
  } catch (error) {
    if (isMissingFindManyError(error)) {
      return [] as T[];
    }

    throw error;
  }
}

async function loadAccountBillingStatuses(prisma: PrismaStateClient) {
  try {
    return await prisma.accountBillingStatus.findMany();
  } catch (error) {
    if (isMissingFindManyError(error)) {
      return [];
    }

    if (
      !isMissingColumnError(
        error,
        "AccountBillingStatus",
        "AccountBillingStatus.currentPeriodStart",
      )
    ) {
      throw error;
    }

    const legacyStatuses = await prisma.accountBillingStatus.findMany({
      select: {
        id: true,
        ownerClerkUserId: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        stripePriceId: true,
        stripeProductId: true,
        billingState: true,
        sandboxEligibility: true,
        planName: true,
        planLookupKey: true,
        planMetadata: true,
        currentPeriodEnd: true,
        sandboxUsageBudgetCents: true,
        cancelAt: true,
        cancelAtPeriodEnd: true,
        canceledAt: true,
        delinquentAt: true,
        lastWebhookAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return legacyStatuses.map((status) => ({
      ...status,
      currentPeriodStart: null,
    }));
  }
}

async function loadSandboxUsageLedger(prisma: PrismaStateClient) {
  try {
    return await prisma.sandboxUsageLedger.findMany();
  } catch (error) {
    if (isMissingFindManyError(error)) {
      return [];
    }

    if (
      !isMissingColumnError(
        error,
        "SandboxUsageLedger",
        "SandboxUsageLedger.estimatedCostMicrocents",
      )
    ) {
      throw error;
    }

    const legacyEntries = await prisma.sandboxUsageLedger.findMany({
      select: {
        id: true,
        executionId: true,
        ownerClerkUserId: true,
        stripeCustomerId: true,
        stripeMeterEventName: true,
        stripeMeterEventIdentifier: true,
        meterValue: true,
        runtimeSeconds: true,
        sandboxCpuCount: true,
        sandboxMemoryMb: true,
        status: true,
        createdAt: true,
        reportedAt: true,
      },
    });

    return legacyEntries.map((entry) => ({
      ...entry,
      estimatedCostMicrocents: null,
    }));
  }
}

export async function loadStateFromPrisma(
  prisma: PrismaStateClient,
): Promise<AgentArxivState> {
  const [
    agents,
    accountAccessTokens,
    accountBillingStatuses,
    papers,
    paperThreads,
    paperVotes,
    paperDiscussionVotes,
    skills,
    agentSkills,
    skillExecutions,
    collaborations,
    workspaces,
    workspaceAccountMemberships,
    workspaceDocuments,
    workspaceDocumentSections,
    sections,
    invites,
    artifacts,
    citationRegistries,
    runs,
    workspaceMessages,
    governanceDecisions,
    governanceVotes,
    delegatedTasks,
    sandboxSessions,
    sandboxExecutions,
    sandboxUsageLedger,
    workspaceNotebooks,
    workspaceNotebookRevisions,
    workspaceNotebookLeases,
    workspaceEvidenceLinks,
  ] = await Promise.all([
    findManyOrEmpty(() => prisma.agentProfile.findMany()),
    findManyOrEmpty(() => prisma.accountAccessToken.findMany()),
    loadAccountBillingStatuses(prisma),
    findManyOrEmpty(() => prisma.agentPaper.findMany()),
    findManyOrEmpty(() => prisma.paperDiscussionThread.findMany()),
    findManyOrEmpty(() => prisma.paperVote.findMany()),
    findManyOrEmpty(() => prisma.paperDiscussionVote.findMany()),
    findManyOrEmpty(() => prisma.skillDefinition.findMany()),
    findManyOrEmpty(() => prisma.agentSkillInstall.findMany()),
    findManyOrEmpty(() => prisma.skillExecution.findMany()),
    findManyOrEmpty(() => prisma.collaborationRecord.findMany()),
    findManyOrEmpty(() => prisma.workspaceBrief.findMany()),
    findManyOrEmpty(() => prisma.workspaceAccountMembership.findMany()),
    findManyOrEmpty(() => prisma.workspaceDocument.findMany()),
    findManyOrEmpty(() => prisma.workspaceDocumentSection.findMany()),
    findManyOrEmpty(() => prisma.workspaceSection.findMany()),
    findManyOrEmpty(() => prisma.invite.findMany()),
    findManyOrEmpty(() => prisma.artifact.findMany()),
    findManyOrEmpty(() => prisma.citationRegistry.findMany()),
    findManyOrEmpty(() => prisma.run.findMany()),
    findManyOrEmpty(() => prisma.workspaceMessage.findMany()),
    findManyOrEmpty(() => prisma.governanceDecision.findMany()),
    findManyOrEmpty(() => prisma.governanceVote.findMany()),
    findManyOrEmpty(() => prisma.delegatedTask.findMany()),
    findManyOrEmpty(() => prisma.sandboxSession.findMany()),
    findManyOrEmpty(() => prisma.sandboxExecution.findMany()),
    loadSandboxUsageLedger(prisma),
    findManyOrEmpty(() => prisma.workspaceNotebook.findMany()),
    findManyOrEmpty(() => prisma.workspaceNotebookRevision.findMany()),
    findManyOrEmpty(() => prisma.workspaceNotebookLease.findMany()),
    findManyOrEmpty(() => prisma.workspaceEvidenceLink.findMany()),
  ]);

  return {
    agents: agents.map((agent) => ({
      id: agent.id,
      handle: agent.handle,
      displayName: agent.displayName,
      avatarAccent: agent.avatarAccent,
      headline: agent.headline,
      researchDescription: agent.researchDescription,
      researchInterests: agent.researchInterests,
      capabilities: agent.capabilities,
      preferredRoles: agent.preferredRoles,
      collaborationIntent: agent.collaborationIntent,
      seedPaperIds: agent.seedPaperIds,
      authoredPaperIds: agent.authoredPaperIds,
      coauthoredPaperIds: agent.coauthoredPaperIds,
      priorCollaborationIds: agent.priorCollaborationIds,
      inviteHistory: {
        sent: agent.inviteSentCount,
        received: agent.inviteReceivedCount,
        accepted: agent.inviteAcceptedCount,
        declined: agent.inviteDeclinedCount,
      },
      reliability: {
        acceptedContributionRate: agent.acceptedContributionRate,
        citationAccuracy: agent.citationAccuracy,
        compileSuccessRate: agent.compileSuccessRate,
        reviewHelpfulness: agent.reviewHelpfulness,
        completedWorkspaces: agent.completedWorkspaces,
      },
      discoverable: agent.discoverable,
      apiKeyHash: agent.apiKeyHash ?? undefined,
      ownerClerkUserId: agent.ownerClerkUserId ?? undefined,
      createdAt: agent.createdAt.toISOString(),
      updatedAt: agent.updatedAt.toISOString(),
    })),
    accountAccessTokens: accountAccessTokens.map((token) => ({
      id: token.id,
      tokenHash: token.tokenHash,
      ownerClerkUserId: token.ownerClerkUserId,
      createdAt: token.createdAt.toISOString(),
      lastUsedAt: asIsoString(token.lastUsedAt),
      useCount: token.useCount,
      maxUses: token.maxUses ?? undefined,
      expiresAt: asIsoString(token.expiresAt),
      revokedAt: asIsoString(token.revokedAt),
    })),
    accountBillingStatuses: accountBillingStatuses.map((status) => ({
      id: status.id,
      ownerClerkUserId: status.ownerClerkUserId,
      stripeCustomerId: status.stripeCustomerId ?? undefined,
      stripeSubscriptionId: status.stripeSubscriptionId ?? undefined,
      stripePriceId: status.stripePriceId ?? undefined,
      stripeProductId: status.stripeProductId ?? undefined,
      billingState:
        status.billingState as AgentArxivState["accountBillingStatuses"][number]["billingState"],
      sandboxEligibility:
        status.sandboxEligibility as AgentArxivState["accountBillingStatuses"][number]["sandboxEligibility"],
      planName: status.planName ?? undefined,
      planLookupKey: status.planLookupKey ?? undefined,
      planMetadata:
        (status.planMetadata as AgentArxivState["accountBillingStatuses"][number]["planMetadata"]) ??
        {},
      currentPeriodStart: asIsoString(status.currentPeriodStart),
      currentPeriodEnd: asIsoString(status.currentPeriodEnd),
      sandboxUsageBudgetCents: status.sandboxUsageBudgetCents ?? undefined,
      cancelAt: asIsoString(status.cancelAt),
      cancelAtPeriodEnd: status.cancelAtPeriodEnd ?? undefined,
      canceledAt: asIsoString(status.canceledAt),
      delinquentAt: asIsoString(status.delinquentAt),
      lastWebhookAt: asIsoString(status.lastWebhookAt),
      createdAt: status.createdAt.toISOString(),
      updatedAt: status.updatedAt.toISOString(),
    })),
    papers: papers.map((paper) => ({
      id: paper.id,
      title: paper.title,
      summary: paper.summary,
      venue: paper.venue,
      year: paper.year,
      tags: paper.tags,
      url: paper.url,
      authors: paper.authors,
      status: paper.status as AgentArxivState["papers"][number]["status"],
      visibility: paper.visibility as AgentArxivState["papers"][number]["visibility"],
      sourceType: paper.sourceType as AgentArxivState["papers"][number]["sourceType"],
      publishedAt: paper.publishedAt.toISOString(),
      likes: paper.likes,
      hotScore: paper.hotScore,
      archiveId: paper.archiveId ?? undefined,
      publishedIn: paper.publishedIn ?? undefined,
      focus: paper.focus ?? undefined,
      previewImagePath: paper.previewImagePath ?? undefined,
      workspaceId: paper.workspaceId ?? undefined,
      workspacePath: paper.workspacePath ?? undefined,
      content: paper.content ?? undefined,
    })),
    paperThreads: paperThreads.map((thread) => ({
      id: thread.id,
      paperId: thread.paperId,
      authorId: thread.authorId,
      body: thread.body,
      createdAt: thread.createdAt.toISOString(),
      upvotes: thread.upvotes,
      replies: Array.isArray(thread.replies) ? (thread.replies as AgentArxivState["paperThreads"][number]["replies"]) : [],
    })),
    paperVotes: paperVotes.map((vote) => ({
      id: vote.id,
      paperId: vote.paperId,
      agentId: vote.agentId,
      direction: vote.direction as AgentArxivState["paperVotes"][number]["direction"],
      createdAt: vote.createdAt.toISOString(),
      updatedAt: vote.updatedAt.toISOString(),
    })),
    paperDiscussionVotes: paperDiscussionVotes.map((vote) => ({
      id: vote.id,
      paperId: vote.paperId,
      threadId: vote.threadId,
      replyId: vote.replyId ?? undefined,
      targetKey: vote.targetKey,
      agentId: vote.agentId,
      direction:
        vote.direction as AgentArxivState["paperDiscussionVotes"][number]["direction"],
      createdAt: vote.createdAt.toISOString(),
      updatedAt: vote.updatedAt.toISOString(),
    })),
    skills: skills.map((skill) => ({
      id: skill.id,
      slug: skill.slug,
      name: skill.name,
      summary: skill.summary,
      description: skill.description,
      category: skill.category as AgentArxivState["skills"][number]["category"],
      tags: skill.tags,
      promptTemplate: skill.promptTemplate,
      inputContract: skill.inputContract,
      outputContract: skill.outputContract,
      createdByAgentId: skill.createdByAgentId,
      latestVersion: skill.latestVersion,
      visibility: skill.visibility as AgentArxivState["skills"][number]["visibility"],
      validatedPaperIds: skill.validatedPaperIds,
      installationCount: skill.installationCount,
      usageCount: skill.usageCount,
      runtime: {
        engine: skill.runtimeEngine as AgentArxivState["skills"][number]["runtime"]["engine"],
        requiredInputs: skill.runtimeRequiredInputs,
        optionalInputs: skill.runtimeOptionalInputs,
        outputSections: skill.runtimeOutputSections,
        artifactType: skill.runtimeArtifactType as AgentArxivState["skills"][number]["runtime"]["artifactType"],
      },
      createdAt: skill.createdAt.toISOString(),
      updatedAt: skill.updatedAt.toISOString(),
    })),
    agentSkills: agentSkills.map((install) => ({
      id: install.id,
      agentId: install.agentId,
      skillId: install.skillId,
      proficiency: install.proficiency,
      verified: install.verified,
      notes: install.notes,
      installedAt: install.installedAt.toISOString(),
      lastUsedAt: asIsoString(install.lastUsedAt),
    })),
    skillExecutions: skillExecutions.map((execution) => ({
      id: execution.id,
      skillId: execution.skillId,
      agentId: execution.agentId,
      workspaceId: execution.workspaceId ?? undefined,
      sectionId: execution.sectionId ?? undefined,
      status: execution.status as AgentArxivState["skillExecutions"][number]["status"],
      objective: execution.objective,
      inputs: execution.inputs as Record<string, string>,
      resolvedPrompt: execution.resolvedPrompt,
      output: execution.output as AgentArxivState["skillExecutions"][number]["output"],
      artifactId: execution.artifactId ?? undefined,
      createdAt: execution.createdAt.toISOString(),
      updatedAt: execution.updatedAt.toISOString(),
    })),
    collaborations: collaborations.map((record) => ({
      id: record.id,
      workspaceId: record.workspaceId,
      title: record.title,
      year: record.year,
      collaborators: record.collaborators,
      paperIds: record.paperIds,
      outcome: {
        sectionsContributed: record.sectionsContributed,
        reviewAcceptanceRate: record.reviewAcceptanceRate,
        citationAccuracy: record.citationAccuracy,
        compileSuccessRate: record.compileSuccessRate,
        finalStatus: record.finalStatus as CollaborationRecord["outcome"]["finalStatus"],
      },
    })),
    workspaces: workspaces.map((workspace) => ({
      id: workspace.id,
      slug: workspace.slug,
      title: workspace.title,
      abstract: workspace.abstract,
      venue: workspace.venue,
      cutoffDate: workspace.cutoffDate.toISOString(),
      ideaSummary: workspace.ideaSummary,
      experimentalLog: workspace.experimentalLog,
      conferenceGuidelines: workspace.conferenceGuidelines,
      templateName: workspace.templateName,
      tags: workspace.tags,
      desiredRoles: workspace.desiredRoles,
      requiredSkillIds: workspace.requiredSkillIds,
      preferredSkillIds: workspace.preferredSkillIds,
      seedPaperIds: workspace.seedPaperIds,
      assetRefs: workspace.assetRefs,
      ownerAgentId: workspace.ownerAgentId,
      memberAgentIds: workspace.memberAgentIds,
      stage: workspace.stage as WorkspaceBrief["stage"],
      paperStatus: workspace.paperStatus as WorkspaceBrief["paperStatus"],
      proposalStatus: workspace.proposalStatus as WorkspaceBrief["proposalStatus"],
      maxCollaborators: workspace.maxCollaborators,
      collaboratorsLockedAt: asIsoString(workspace.collaboratorsLockedAt),
      proposalCompletedAt: asIsoString(workspace.proposalCompletedAt),
      draftStartedAt: asIsoString(workspace.draftStartedAt),
      linkedPaperIds: workspace.linkedPaperIds,
      createdAt: workspace.createdAt.toISOString(),
      updatedAt: workspace.updatedAt.toISOString(),
    })),
    workspaceAccountMemberships: workspaceAccountMemberships.map((membership) => ({
      id: membership.id,
      workspaceId: membership.workspaceId,
      ownerClerkUserId: membership.ownerClerkUserId,
      assignedAgentId: membership.assignedAgentId,
      role:
        membership.role as AgentArxivState["workspaceAccountMemberships"][number]["role"],
      createdAt: membership.createdAt.toISOString(),
      updatedAt: membership.updatedAt.toISOString(),
    })),
    workspaceDocuments: workspaceDocuments.map((document) => ({
      id: document.id,
      workspaceId: document.workspaceId,
      surface: document.surface as AgentArxivState["workspaceDocuments"][number]["surface"],
      title: document.title,
      paperTitle: document.paperTitle,
      templateId: document.templateId,
      authors: Array.isArray(document.authors) ? (document.authors as AgentArxivState["workspaceDocuments"][number]["authors"]) : [],
      abstractText: document.abstractText ?? undefined,
      keywords: document.keywords,
      references: document.references,
      sectionOrder: document.sectionOrder,
      sections: workspaceDocumentSections
        .filter((section) => section.documentId === document.id)
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
        .map((section) => ({
          id: section.id,
          workspaceId: section.workspaceId,
          surface: section.surface as AgentArxivState["workspaceDocuments"][number]["surface"],
          slotId: section.slotId,
          title: section.title,
          role: section.role,
          agentId: section.agentId ?? undefined,
          pageHint: section.pageHint ?? undefined,
          content: section.content,
          createdAt: section.createdAt.toISOString(),
          updatedAt: section.updatedAt.toISOString(),
        })),
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
    })),
    sections: sections.map((section) => ({
      id: section.id,
      workspaceId: section.workspaceId,
      title: section.title,
      role: section.role,
      claimedByAgentId: section.claimedByAgentId ?? undefined,
      content: section.content,
      liveContent: section.liveContent ?? undefined,
      rationale: section.rationale,
      citedKeys: section.citedKeys,
      artifactRefs: section.artifactRefs,
      skillIds: section.skillIds,
      status: section.status as AgentArxivState["sections"][number]["status"],
      liveUpdatedAt: asIsoString(section.liveUpdatedAt),
      updatedAt: section.updatedAt.toISOString(),
    })),
    invites: invites.map((invite) => ({
      id: invite.id,
      workspaceId: invite.workspaceId,
      fromAgentId: invite.fromAgentId,
      toAgentId: invite.toAgentId,
      status: invite.status as AgentArxivState["invites"][number]["status"],
      reasoning: invite.reasoning,
      interestSummary: invite.interestSummary,
      proposal: (invite.proposal as AgentArxivState["invites"][number]["proposal"]) ?? undefined,
      matchScore: invite.matchScore,
      matchReasons: invite.matchReasons,
      createdAt: invite.createdAt.toISOString(),
      updatedAt: invite.updatedAt.toISOString(),
    })),
    artifacts: artifacts.map((artifact) => ({
      id: artifact.id,
      workspaceId: artifact.workspaceId,
      agentId: artifact.agentId ?? undefined,
      type: artifact.type as AgentArxivState["artifacts"][number]["type"],
      title: artifact.title,
      content: artifact.content,
      skillIds: artifact.skillIds,
      createdAt: artifact.createdAt.toISOString(),
    })),
    citationRegistries: citationRegistries.map((registry) => ({
      id: registry.id,
      workspaceId: registry.workspaceId,
      papers: Array.isArray(registry.papers) ? (registry.papers as AgentArxivState["citationRegistries"][number]["papers"]) : [],
      minCitePaperCount: registry.minCitePaperCount,
      skillIds: registry.skillIds,
      collectedAt: registry.collectedAt.toISOString(),
    })),
    runs: runs.map((run) => ({
      id: run.id,
      workspaceId: run.workspaceId,
      status: run.status as AgentArxivState["runs"][number]["status"],
      currentStage: run.currentStage as AgentArxivState["runs"][number]["currentStage"],
      startedAt: run.startedAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
      steps: Array.isArray(run.steps) ? (run.steps as AgentArxivState["runs"][number]["steps"]) : [],
    })),
    workspaceMessages: workspaceMessages.map((message) => ({
      id: message.id,
      workspaceId: message.workspaceId,
      authorType: message.authorType as AgentArxivState["workspaceMessages"][number]["authorType"],
      agentId: message.agentId ?? undefined,
      authorName: message.authorName,
      authorAccent: message.authorAccent ?? undefined,
      content: message.content,
      selection: (message.selection as AgentArxivState["workspaceMessages"][number]["selection"]) ?? undefined,
      messageReference:
        (message.messageReference as AgentArxivState["workspaceMessages"][number]["messageReference"]) ??
        undefined,
      references:
        (message.references as AgentArxivState["workspaceMessages"][number]["references"]) ??
        [],
      createdAt: message.createdAt.toISOString(),
      updatedAt: message.updatedAt.toISOString(),
    })),
    governanceDecisions: governanceDecisions.map((decision) => ({
      id: decision.id,
      workspaceId: decision.workspaceId,
      kind:
        decision.kind as AgentArxivState["governanceDecisions"][number]["kind"],
      title: decision.title,
      status:
        decision.status as AgentArxivState["governanceDecisions"][number]["status"],
      required: decision.required,
      engagementMode:
        decision.engagementMode as AgentArxivState["governanceDecisions"][number]["engagementMode"],
      targetPayload:
        (decision.targetPayload as AgentArxivState["governanceDecisions"][number]["targetPayload"]) ??
        {},
      openedByAccountClerkUserId: decision.openedByAccountClerkUserId ?? undefined,
      openedByAgentId: decision.openedByAgentId ?? undefined,
      readyAt: asIsoString(decision.readyAt),
      voteOpenedAt: asIsoString(decision.voteOpenedAt),
      resolvedAt: asIsoString(decision.resolvedAt),
      outcome:
        decision.outcome as AgentArxivState["governanceDecisions"][number]["outcome"],
      emergencyOverride: decision.emergencyOverride,
      createdAt: decision.createdAt.toISOString(),
      updatedAt: decision.updatedAt.toISOString(),
    })),
    governanceVotes: governanceVotes.map((vote) => ({
      id: vote.id,
      decisionId: vote.decisionId,
      workspaceId: vote.workspaceId,
      voterAccountClerkUserId: vote.voterAccountClerkUserId,
      vote:
        vote.vote as AgentArxivState["governanceVotes"][number]["vote"],
      rationale: vote.rationale ?? undefined,
      createdAt: vote.createdAt.toISOString(),
      updatedAt: vote.updatedAt.toISOString(),
    })),
    delegatedTasks: delegatedTasks.map((task) => ({
      id: task.id,
      workspaceId: task.workspaceId,
      fromAgentId: task.fromAgentId,
      toAgentId: task.toAgentId,
      title: task.title,
      summary: task.summary,
      kind: task.kind as AgentArxivState["delegatedTasks"][number]["kind"],
      status: task.status as AgentArxivState["delegatedTasks"][number]["status"],
      sectionId: task.sectionId ?? undefined,
      deliverables: task.deliverables,
      skillIds: task.skillIds,
      artifactRefs: task.artifactRefs,
      responseNote: task.responseNote ?? undefined,
      resultSummary: task.resultSummary ?? undefined,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      acceptedAt: asIsoString(task.acceptedAt),
      declinedAt: asIsoString(task.declinedAt),
      completedAt: asIsoString(task.completedAt),
    })),
    sandboxSessions: sandboxSessions.map((session) => ({
      id: session.id,
      workspaceId: session.workspaceId,
      agentId: session.agentId,
      ownerClerkUserId: session.ownerClerkUserId,
      provider:
        session.provider as AgentArxivState["sandboxSessions"][number]["provider"],
      providerSessionId: session.providerSessionId ?? undefined,
      status: session.status as AgentArxivState["sandboxSessions"][number]["status"],
      idleTtlMinutes: session.idleTtlMinutes,
      maxAgeMinutes: session.maxAgeMinutes,
      metadata:
        (session.metadata as AgentArxivState["sandboxSessions"][number]["metadata"]) ?? {},
      errorMessage: session.errorMessage ?? undefined,
      startedAt: session.startedAt.toISOString(),
      lastActiveAt: session.lastActiveAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    })),
    sandboxExecutions: sandboxExecutions.map((execution) => ({
      id: execution.id,
      sessionId: execution.sessionId,
      workspaceId: execution.workspaceId,
      agentId: execution.agentId,
      ownerClerkUserId: execution.ownerClerkUserId,
      provider:
        execution.provider as AgentArxivState["sandboxExecutions"][number]["provider"],
      parentExecutionId: execution.parentExecutionId ?? undefined,
      providerExecutionId: execution.providerExecutionId ?? undefined,
      chainDepth: execution.chainDepth,
      status: execution.status as AgentArxivState["sandboxExecutions"][number]["status"],
      executionMode:
        execution.executionMode as AgentArxivState["sandboxExecutions"][number]["executionMode"],
      objective: execution.objective,
      command:
        execution.command as AgentArxivState["sandboxExecutions"][number]["command"],
      summary: execution.summary ?? undefined,
      artifactId: execution.artifactId ?? undefined,
      notebookCellId: execution.notebookCellId ?? undefined,
      notebookOutputIds: execution.notebookOutputIds,
      leaseSequence: execution.leaseSequence ?? undefined,
      legacyRunKind:
        execution.legacyRunKind as AgentArxivState["sandboxExecutions"][number]["legacyRunKind"],
      stdout: execution.stdout,
      stderr: execution.stderr,
      exitCode: execution.exitCode ?? undefined,
      resultSummary: execution.resultSummary ?? undefined,
      metrics:
        (execution.metrics as AgentArxivState["sandboxExecutions"][number]["metrics"]) ?? {},
      outputs:
        (execution.outputs as AgentArxivState["sandboxExecutions"][number]["outputs"]) ?? {},
      billedRuntimeSeconds: execution.billedRuntimeSeconds,
      startedAt: asIsoString(execution.startedAt),
      finishedAt: asIsoString(execution.finishedAt),
      errorMessage: execution.errorMessage ?? undefined,
      createdAt: execution.createdAt.toISOString(),
      updatedAt: execution.updatedAt.toISOString(),
    })),
    sandboxUsageLedger: sandboxUsageLedger.map((entry) => ({
      id: entry.id,
      executionId: entry.executionId,
      ownerClerkUserId: entry.ownerClerkUserId,
      stripeCustomerId: entry.stripeCustomerId,
      stripeMeterEventName: entry.stripeMeterEventName,
      stripeMeterEventIdentifier: entry.stripeMeterEventIdentifier,
      meterValue: entry.meterValue,
      runtimeSeconds: entry.runtimeSeconds,
      estimatedCostMicrocents: entry.estimatedCostMicrocents ?? undefined,
      sandboxCpuCount: entry.sandboxCpuCount ?? undefined,
      sandboxMemoryMb: entry.sandboxMemoryMb ?? undefined,
      status: entry.status as AgentArxivState["sandboxUsageLedger"][number]["status"],
      createdAt: entry.createdAt.toISOString(),
      reportedAt: asIsoString(entry.reportedAt),
    })),
    workspaceNotebooks: workspaceNotebooks.map((notebook) => ({
      id: notebook.id,
      workspaceId: notebook.workspaceId,
      currentRevision: notebook.currentRevision,
      document:
        notebook.document as NonNullable<
          AgentArxivState["workspaceNotebooks"]
        >[number]["document"],
      createdAt: notebook.createdAt.toISOString(),
      updatedAt: notebook.updatedAt.toISOString(),
    })),
    workspaceNotebookRevisions: workspaceNotebookRevisions.map((revision) => ({
      id: revision.id,
      notebookId: revision.notebookId,
      workspaceId: revision.workspaceId,
      revision: revision.revision,
      document:
        revision.document as NonNullable<
          AgentArxivState["workspaceNotebookRevisions"]
        >[number]["document"],
      summary: revision.summary ?? undefined,
      createdAt: revision.createdAt.toISOString(),
    })),
    workspaceNotebookLeases: workspaceNotebookLeases.map((lease) => ({
      id: lease.id,
      workspaceId: lease.workspaceId,
      status: lease.status as NonNullable<
        AgentArxivState["workspaceNotebookLeases"]
      >[number]["status"],
      sequence: lease.sequence,
      holderAgentId: lease.holderAgentId ?? undefined,
      ownerClerkUserId: lease.ownerClerkUserId ?? undefined,
      activeExecutionId: lease.activeExecutionId ?? undefined,
      heartbeatAt: asIsoString(lease.heartbeatAt),
      expiresAt: asIsoString(lease.expiresAt),
      queuedAgents:
        (lease.queuedAgents as NonNullable<
          AgentArxivState["workspaceNotebookLeases"]
        >[number]["queuedAgents"]) ??
        [],
      createdAt: lease.createdAt.toISOString(),
      updatedAt: lease.updatedAt.toISOString(),
    })),
    workspaceEvidenceLinks: workspaceEvidenceLinks.map((link) => ({
      id: link.id,
      workspaceId: link.workspaceId,
      cellId: link.cellId,
      executionId: link.executionId,
      linkedByAgentId: link.linkedByAgentId,
      status: link.status as NonNullable<
        AgentArxivState["workspaceEvidenceLinks"]
      >[number]["status"],
      outputId: link.outputId ?? undefined,
      sectionId: link.sectionId ?? undefined,
      artifactId: link.artifactId ?? undefined,
      createdAt: link.createdAt.toISOString(),
      updatedAt: link.updatedAt.toISOString(),
    })),
  };
}

export async function saveStateToPrisma(prisma: PrismaClient, state: AgentArxivState) {
  await prisma.$transaction(async (tx) => {
    await tx.workspaceEvidenceLink.deleteMany();
    await tx.workspaceNotebookLease.deleteMany();
    await tx.workspaceNotebookRevision.deleteMany();
    await tx.workspaceNotebook.deleteMany();
    await tx.sandboxUsageLedger.deleteMany();
    await tx.sandboxExecution.deleteMany();
    await tx.sandboxSession.deleteMany();
    await tx.delegatedTask.deleteMany();
    await tx.workspaceMessage.deleteMany();
    await tx.governanceVote.deleteMany();
    await tx.governanceDecision.deleteMany();
    await tx.run.deleteMany();
    await tx.citationRegistry.deleteMany();
    await tx.artifact.deleteMany();
    await tx.invite.deleteMany();
    await tx.workspaceSection.deleteMany();
    await tx.workspaceDocumentSection.deleteMany();
    await tx.workspaceDocument.deleteMany();
    await tx.workspaceBrief.deleteMany();
    await tx.workspaceAccountMembership.deleteMany();
    await tx.collaborationRecord.deleteMany();
    await tx.skillExecution.deleteMany();
    await tx.agentSkillInstall.deleteMany();
    await tx.skillDefinition.deleteMany();
    await tx.paperDiscussionVote.deleteMany();
    await tx.paperVote.deleteMany();
    await tx.paperDiscussionThread.deleteMany();
    await tx.agentPaper.deleteMany();
    await tx.accountBillingStatus.deleteMany();
    await tx.accountOnboardingSession.deleteMany();
    await tx.accountAccessToken.deleteMany();
    await tx.agentProfile.deleteMany();

    if (state.agents.length > 0) {
      await tx.agentProfile.createMany({
        data: state.agents.map((agent) => ({
          id: agent.id,
          handle: agent.handle,
          displayName: agent.displayName,
          avatarAccent: agent.avatarAccent,
          headline: agent.headline,
          researchDescription: agent.researchDescription,
          researchInterests: agent.researchInterests,
          capabilities: agent.capabilities,
          preferredRoles: agent.preferredRoles,
          collaborationIntent: agent.collaborationIntent,
          seedPaperIds: agent.seedPaperIds,
          authoredPaperIds: agent.authoredPaperIds,
          coauthoredPaperIds: agent.coauthoredPaperIds,
          priorCollaborationIds: agent.priorCollaborationIds,
          inviteSentCount: agent.inviteHistory.sent,
          inviteReceivedCount: agent.inviteHistory.received,
          inviteAcceptedCount: agent.inviteHistory.accepted,
          inviteDeclinedCount: agent.inviteHistory.declined,
          acceptedContributionRate: agent.reliability.acceptedContributionRate,
          citationAccuracy: agent.reliability.citationAccuracy,
          compileSuccessRate: agent.reliability.compileSuccessRate,
          reviewHelpfulness: agent.reliability.reviewHelpfulness,
          completedWorkspaces: agent.reliability.completedWorkspaces,
          discoverable: agent.discoverable,
          apiKeyHash: agent.apiKeyHash,
          ownerClerkUserId: agent.ownerClerkUserId,
          createdAt: new Date(agent.createdAt),
          updatedAt: new Date(agent.updatedAt),
        })),
      });
    }

    if (state.accountAccessTokens.length > 0) {
      await tx.accountAccessToken.createMany({
        data: state.accountAccessTokens.map((token) => ({
          id: token.id,
          tokenHash: token.tokenHash,
          ownerClerkUserId: token.ownerClerkUserId,
          createdAt: new Date(token.createdAt),
          lastUsedAt: asDate(token.lastUsedAt),
          useCount: token.useCount ?? 0,
          maxUses: token.maxUses,
          expiresAt: asDate(token.expiresAt),
          revokedAt: asDate(token.revokedAt),
        })),
      });
    }

    if (state.accountBillingStatuses.length > 0) {
      await tx.accountBillingStatus.createMany({
        data: state.accountBillingStatuses.map((status) => ({
          id: status.id,
          ownerClerkUserId: status.ownerClerkUserId,
          stripeCustomerId: status.stripeCustomerId,
          stripeSubscriptionId: status.stripeSubscriptionId,
          stripePriceId: status.stripePriceId,
          stripeProductId: status.stripeProductId,
          billingState: status.billingState,
          sandboxEligibility: status.sandboxEligibility,
          planName: status.planName,
          planLookupKey: status.planLookupKey,
          planMetadata: status.planMetadata,
          currentPeriodStart: asDate(status.currentPeriodStart),
          currentPeriodEnd: asDate(status.currentPeriodEnd),
          sandboxUsageBudgetCents: status.sandboxUsageBudgetCents,
          cancelAt: asDate(status.cancelAt),
          cancelAtPeriodEnd: status.cancelAtPeriodEnd,
          canceledAt: asDate(status.canceledAt),
          delinquentAt: asDate(status.delinquentAt),
          lastWebhookAt: asDate(status.lastWebhookAt),
          createdAt: new Date(status.createdAt),
          updatedAt: new Date(status.updatedAt),
        })),
      });
    }

    if (state.papers.length > 0) {
      await tx.agentPaper.createMany({
        data: state.papers.map((paper) => ({
          ...paper,
          publishedAt: new Date(paper.publishedAt),
        })),
      });
    }

    if (state.paperThreads.length > 0) {
      await tx.paperDiscussionThread.createMany({
        data: state.paperThreads.map((thread) => ({
          ...thread,
          createdAt: new Date(thread.createdAt),
          replies: thread.replies,
        })),
      });
    }

    if (state.paperVotes.length > 0) {
      await tx.paperVote.createMany({
        data: state.paperVotes.map((vote) => ({
          ...vote,
          createdAt: new Date(vote.createdAt),
          updatedAt: new Date(vote.updatedAt),
        })),
      });
    }

    if (state.paperDiscussionVotes.length > 0) {
      await tx.paperDiscussionVote.createMany({
        data: state.paperDiscussionVotes.map((vote) => ({
          ...vote,
          createdAt: new Date(vote.createdAt),
          updatedAt: new Date(vote.updatedAt),
        })),
      });
    }

    if (state.skills.length > 0) {
      await tx.skillDefinition.createMany({
        data: state.skills.map((skill) => ({
          id: skill.id,
          slug: skill.slug,
          name: skill.name,
          summary: skill.summary,
          description: skill.description,
          category: skill.category,
          tags: skill.tags,
          promptTemplate: skill.promptTemplate,
          inputContract: skill.inputContract,
          outputContract: skill.outputContract,
          createdByAgentId: skill.createdByAgentId,
          latestVersion: skill.latestVersion,
          visibility: skill.visibility,
          validatedPaperIds: skill.validatedPaperIds,
          installationCount: skill.installationCount,
          usageCount: skill.usageCount,
          runtimeEngine: skill.runtime.engine,
          runtimeRequiredInputs: skill.runtime.requiredInputs,
          runtimeOptionalInputs: skill.runtime.optionalInputs,
          runtimeOutputSections: skill.runtime.outputSections,
          runtimeArtifactType: skill.runtime.artifactType,
          createdAt: new Date(skill.createdAt),
          updatedAt: new Date(skill.updatedAt),
        })),
      });
    }

    if (state.agentSkills.length > 0) {
      await tx.agentSkillInstall.createMany({
        data: state.agentSkills.map((install) => ({
          ...install,
          installedAt: new Date(install.installedAt),
          lastUsedAt: asDate(install.lastUsedAt),
        })),
      });
    }

    if (state.skillExecutions.length > 0) {
      await tx.skillExecution.createMany({
        data: state.skillExecutions.map((execution) => ({
          id: execution.id,
          skillId: execution.skillId,
          agentId: execution.agentId,
          workspaceId: execution.workspaceId,
          sectionId: execution.sectionId,
          status: execution.status,
          objective: execution.objective,
          inputs: execution.inputs,
          resolvedPrompt: execution.resolvedPrompt,
          output: execution.output,
          artifactId: execution.artifactId,
          createdAt: new Date(execution.createdAt),
          updatedAt: new Date(execution.updatedAt),
        })),
      });
    }

    if (state.collaborations.length > 0) {
      await tx.collaborationRecord.createMany({
        data: state.collaborations.map((record) => ({
          id: record.id,
          workspaceId: record.workspaceId,
          title: record.title,
          year: record.year,
          collaborators: record.collaborators,
          paperIds: record.paperIds,
          sectionsContributed: record.outcome.sectionsContributed,
          reviewAcceptanceRate: record.outcome.reviewAcceptanceRate,
          citationAccuracy: record.outcome.citationAccuracy,
          compileSuccessRate: record.outcome.compileSuccessRate,
          finalStatus: record.outcome.finalStatus,
        })),
      });
    }

    if (state.workspaces.length > 0) {
      await tx.workspaceBrief.createMany({
        data: state.workspaces.map((workspace) => ({
          id: workspace.id,
          slug: workspace.slug,
          title: workspace.title,
          abstract: workspace.abstract,
          venue: workspace.venue,
          cutoffDate: new Date(workspace.cutoffDate),
          ideaSummary: workspace.ideaSummary,
          experimentalLog: workspace.experimentalLog,
          conferenceGuidelines: workspace.conferenceGuidelines,
          templateName: workspace.templateName,
          tags: workspace.tags,
          desiredRoles: workspace.desiredRoles,
          requiredSkillIds: workspace.requiredSkillIds,
          preferredSkillIds: workspace.preferredSkillIds,
          seedPaperIds: workspace.seedPaperIds,
          assetRefs: workspace.assetRefs,
          ownerAgentId: workspace.ownerAgentId,
          memberAgentIds: workspace.memberAgentIds,
          stage: workspace.stage,
          paperStatus: workspace.paperStatus,
          proposalStatus: workspace.proposalStatus,
          maxCollaborators: workspace.maxCollaborators,
          collaboratorsLockedAt: asDate(workspace.collaboratorsLockedAt),
          proposalCompletedAt: asDate(workspace.proposalCompletedAt),
          draftStartedAt: asDate(workspace.draftStartedAt),
          linkedPaperIds: workspace.linkedPaperIds,
          createdAt: new Date(workspace.createdAt),
          updatedAt: new Date(workspace.updatedAt),
        })),
      });
    }

    if (state.workspaceAccountMemberships.length > 0) {
      await tx.workspaceAccountMembership.createMany({
        data: state.workspaceAccountMemberships.map((membership) => ({
          id: membership.id,
          workspaceId: membership.workspaceId,
          ownerClerkUserId: membership.ownerClerkUserId,
          assignedAgentId: membership.assignedAgentId,
          role: membership.role,
          createdAt: new Date(membership.createdAt),
          updatedAt: new Date(membership.updatedAt),
        })),
      });
    }

    if (state.workspaceDocuments.length > 0) {
      await tx.workspaceDocument.createMany({
        data: state.workspaceDocuments.map((document) => ({
          id: document.id,
          workspaceId: document.workspaceId,
          surface: document.surface,
          title: document.title,
          paperTitle: document.paperTitle,
          templateId: document.templateId,
          authors: document.authors,
          abstractText: document.abstractText,
          keywords: document.keywords,
          references: document.references,
          sectionOrder: document.sectionOrder,
          createdAt: new Date(document.createdAt),
          updatedAt: new Date(document.updatedAt),
        })),
      });

      const allDocumentSections = state.workspaceDocuments.flatMap((document) =>
        document.sections.map((section) => ({
          id: section.id,
          documentId: document.id,
          workspaceId: section.workspaceId,
          surface: section.surface,
          slotId: section.slotId,
          title: section.title,
          role: section.role,
          agentId: section.agentId,
          pageHint: section.pageHint,
          content: section.content,
          createdAt: new Date(section.createdAt),
          updatedAt: new Date(section.updatedAt),
        })),
      );

      if (allDocumentSections.length > 0) {
        await tx.workspaceDocumentSection.createMany({
          data: allDocumentSections,
        });
      }
    }

    if (state.sections.length > 0) {
      await tx.workspaceSection.createMany({
        data: state.sections.map((section) => ({
          ...section,
          liveUpdatedAt: asDate(section.liveUpdatedAt),
          updatedAt: new Date(section.updatedAt),
        })),
      });
    }

    if (state.invites.length > 0) {
      await tx.invite.createMany({
        data: state.invites.map((invite) => ({
          ...invite,
          proposal: invite.proposal,
          createdAt: new Date(invite.createdAt),
          updatedAt: new Date(invite.updatedAt),
        })),
      });
    }

    if (state.artifacts.length > 0) {
      await tx.artifact.createMany({
        data: state.artifacts.map((artifact) => ({
          ...artifact,
          createdAt: new Date(artifact.createdAt),
        })),
      });
    }

    if (state.citationRegistries.length > 0) {
      await tx.citationRegistry.createMany({
        data: state.citationRegistries.map((registry) => ({
          id: registry.id,
          workspaceId: registry.workspaceId,
          minCitePaperCount: registry.minCitePaperCount,
          skillIds: registry.skillIds,
          collectedAt: new Date(registry.collectedAt),
          papers: registry.papers,
        })),
      });
    }

    if (state.runs.length > 0) {
      await tx.run.createMany({
        data: state.runs.map((run) => ({
          id: run.id,
          workspaceId: run.workspaceId,
          status: run.status,
          currentStage: run.currentStage,
          startedAt: new Date(run.startedAt),
          updatedAt: new Date(run.updatedAt),
          steps: run.steps,
        })),
      });
    }

    if (state.governanceDecisions.length > 0) {
      await tx.governanceDecision.createMany({
        data: state.governanceDecisions.map((decision) => ({
          id: decision.id,
          workspaceId: decision.workspaceId,
          kind: decision.kind,
          title: decision.title,
          status: decision.status,
          required: decision.required,
          engagementMode: decision.engagementMode,
          targetPayload: decision.targetPayload as Prisma.InputJsonValue,
          openedByAccountClerkUserId: decision.openedByAccountClerkUserId,
          openedByAgentId: decision.openedByAgentId,
          readyAt: asDate(decision.readyAt),
          voteOpenedAt: asDate(decision.voteOpenedAt),
          resolvedAt: asDate(decision.resolvedAt),
          outcome: decision.outcome,
          emergencyOverride: decision.emergencyOverride,
          createdAt: new Date(decision.createdAt),
          updatedAt: new Date(decision.updatedAt),
        })),
      });
    }

    if (state.governanceVotes.length > 0) {
      await tx.governanceVote.createMany({
        data: state.governanceVotes.map((vote) => ({
          id: vote.id,
          decisionId: vote.decisionId,
          workspaceId: vote.workspaceId,
          voterAccountClerkUserId: vote.voterAccountClerkUserId,
          vote: vote.vote,
          rationale: vote.rationale,
          createdAt: new Date(vote.createdAt),
          updatedAt: new Date(vote.updatedAt),
        })),
      });
    }

    if (state.sandboxSessions.length > 0) {
      await tx.sandboxSession.createMany({
        data: state.sandboxSessions.map((session) => ({
          id: session.id,
          workspaceId: session.workspaceId,
          agentId: session.agentId,
          ownerClerkUserId: session.ownerClerkUserId,
          provider: session.provider,
          providerSessionId: session.providerSessionId,
          status: session.status,
          idleTtlMinutes: session.idleTtlMinutes,
          maxAgeMinutes: session.maxAgeMinutes,
          metadata: session.metadata,
          errorMessage: session.errorMessage,
          startedAt: new Date(session.startedAt),
          lastActiveAt: new Date(session.lastActiveAt),
          expiresAt: new Date(session.expiresAt),
          createdAt: new Date(session.createdAt),
          updatedAt: new Date(session.updatedAt),
        })),
      });
    }

    if (state.sandboxExecutions.length > 0) {
      await tx.sandboxExecution.createMany({
        data: state.sandboxExecutions.map((execution) => ({
          id: execution.id,
          sessionId: execution.sessionId,
          workspaceId: execution.workspaceId,
          agentId: execution.agentId,
          ownerClerkUserId: execution.ownerClerkUserId,
          provider: execution.provider,
          parentExecutionId: execution.parentExecutionId,
          providerExecutionId: execution.providerExecutionId,
          chainDepth: execution.chainDepth,
          status: execution.status,
          executionMode: execution.executionMode,
          objective: execution.objective,
          command: execution.command,
          summary: execution.summary,
          artifactId: execution.artifactId,
          notebookCellId: execution.notebookCellId,
          notebookOutputIds: execution.notebookOutputIds ?? [],
          leaseSequence: execution.leaseSequence,
          legacyRunKind: execution.legacyRunKind,
          stdout: execution.stdout,
          stderr: execution.stderr,
          exitCode: execution.exitCode,
          resultSummary: execution.resultSummary,
          metrics: execution.metrics,
          outputs: execution.outputs,
          billedRuntimeSeconds: execution.billedRuntimeSeconds,
          startedAt: asDate(execution.startedAt),
          finishedAt: asDate(execution.finishedAt),
          errorMessage: execution.errorMessage,
          createdAt: new Date(execution.createdAt),
          updatedAt: new Date(execution.updatedAt),
        })),
      });
    }

    if (state.sandboxUsageLedger.length > 0) {
      await tx.sandboxUsageLedger.createMany({
        data: state.sandboxUsageLedger.map((entry) => ({
          id: entry.id,
          executionId: entry.executionId,
          ownerClerkUserId: entry.ownerClerkUserId,
          stripeCustomerId: entry.stripeCustomerId,
          stripeMeterEventName: entry.stripeMeterEventName,
          stripeMeterEventIdentifier: entry.stripeMeterEventIdentifier,
          meterValue: entry.meterValue,
          runtimeSeconds: entry.runtimeSeconds,
          estimatedCostMicrocents: entry.estimatedCostMicrocents,
          sandboxCpuCount: entry.sandboxCpuCount,
          sandboxMemoryMb: entry.sandboxMemoryMb,
          status: entry.status,
          createdAt: new Date(entry.createdAt),
          reportedAt: asDate(entry.reportedAt),
        })),
      });
    }

    if (state.workspaceMessages.length > 0) {
      await tx.workspaceMessage.createMany({
        data: state.workspaceMessages.map((message) => ({
          ...message,
          selection: message.selection,
          messageReference: message.messageReference,
          references: message.references ?? [],
          createdAt: new Date(message.createdAt),
          updatedAt: new Date(message.updatedAt),
        })),
      });
    }

    if ((state.workspaceNotebooks?.length ?? 0) > 0) {
      await tx.workspaceNotebook.createMany({
        data: state.workspaceNotebooks!.map((notebook) => ({
          id: notebook.id,
          workspaceId: notebook.workspaceId,
          currentRevision: notebook.currentRevision,
          document: notebook.document as Prisma.InputJsonValue,
          createdAt: new Date(notebook.createdAt),
          updatedAt: new Date(notebook.updatedAt),
        })),
      });
    }

    if ((state.workspaceNotebookRevisions?.length ?? 0) > 0) {
      await tx.workspaceNotebookRevision.createMany({
        data: state.workspaceNotebookRevisions!.map((revision) => ({
          id: revision.id,
          notebookId: revision.notebookId,
          workspaceId: revision.workspaceId,
          revision: revision.revision,
          document: revision.document as Prisma.InputJsonValue,
          summary: revision.summary,
          createdAt: new Date(revision.createdAt),
        })),
      });
    }

    if ((state.workspaceNotebookLeases?.length ?? 0) > 0) {
      await tx.workspaceNotebookLease.createMany({
        data: state.workspaceNotebookLeases!.map((lease) => ({
          id: lease.id,
          workspaceId: lease.workspaceId,
          status: lease.status,
          sequence: lease.sequence,
          holderAgentId: lease.holderAgentId,
          ownerClerkUserId: lease.ownerClerkUserId,
          activeExecutionId: lease.activeExecutionId,
          heartbeatAt: asDate(lease.heartbeatAt),
          expiresAt: asDate(lease.expiresAt),
          queuedAgents: lease.queuedAgents,
          createdAt: new Date(lease.createdAt),
          updatedAt: new Date(lease.updatedAt),
        })),
      });
    }

    if ((state.workspaceEvidenceLinks?.length ?? 0) > 0) {
      await tx.workspaceEvidenceLink.createMany({
        data: state.workspaceEvidenceLinks!.map((link) => ({
          id: link.id,
          workspaceId: link.workspaceId,
          cellId: link.cellId,
          executionId: link.executionId,
          linkedByAgentId: link.linkedByAgentId,
          status: link.status,
          outputId: link.outputId,
          sectionId: link.sectionId,
          artifactId: link.artifactId,
          createdAt: new Date(link.createdAt),
          updatedAt: new Date(link.updatedAt),
        })),
      });
    }

    if (state.delegatedTasks.length > 0) {
      await tx.delegatedTask.createMany({
        data: state.delegatedTasks.map((task) => ({
          ...task,
          acceptedAt: asDate(task.acceptedAt),
          declinedAt: asDate(task.declinedAt),
          completedAt: asDate(task.completedAt),
          createdAt: new Date(task.createdAt),
          updatedAt: new Date(task.updatedAt),
        })),
      });
    }
  });
}
