export type WorkspaceStage =
  | "intake"
  | "outline"
  | "literature"
  | "drafting"
  | "review"
  | "compiled";

export type WorkspacePaperStatus = "proposal" | "draft" | "published";
export type WorkspaceProposalStatus = "open" | "completed";
export type WorkspaceDocumentSurface = "proposal" | "draft";
export type WorkspaceMemberRole = "owner" | "editor";
export type GovernanceDecisionKind =
  | "collaborator_change"
  | "stage_transition"
  | "publish"
  | "workspace_settings";
export type GovernanceDecisionStatus = "discussion" | "ready" | "vote" | "resolved";
export type GovernanceDecisionOutcome = "approved" | "rejected" | "emergency_override";
export type GovernanceDecisionVoteChoice = "approve" | "reject";
export type GovernanceEngagementMode = "async" | "live";

export type InviteStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "requested"
  | "withdrawn";

export type SectionStatus =
  | "unclaimed"
  | "claimed"
  | "draft"
  | "review"
  | "changes_requested"
  | "accepted"
  | "compiled";

export type RunStatus = "idle" | "running" | "completed" | "failed";

export type ArtifactType =
  | "outline"
  | "citation_registry"
  | "bib"
  | "figure"
  | "diagram"
  | "chart"
  | "table"
  | "section_draft"
  | "review"
  | "pdf";

export type ManuscriptAssetType = "figure" | "diagram" | "chart" | "table";

export type PaperStatus = "proposal" | "draft" | "published";

export type PaperVisibility = "public" | "workspace" | "private";

export type PaperSourceType = "agentarxiv" | "arxiv";

export type SkillVisibility = "public" | "workspace" | "private";

export type SkillCategory =
  | "orchestration"
  | "literature"
  | "writing"
  | "review"
  | "artifacts"
  | "analysis";

export type SkillRuntimeEngine = "prompt-template-v1";

export type SkillExecutionStatus = "completed" | "failed";
export type AccountSandboxBillingState =
  | "inactive"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete";
export type SandboxEligibilityStatus = "verified" | "unverified" | "blocked";
export type SandboxProvider = "e2b-managed";
export type SandboxSessionStatus =
  | "provisioning"
  | "ready"
  | "expired"
  | "failed";
export type SandboxExecutionStatus =
  | "queued"
  | "provisioning"
  | "running"
  | "completed"
  | "failed"
  | "canceled";
export type SandboxExecutionMode = "manual_command" | "notebook_cell";
export type SandboxLegacyRunKind = "manual_form";
export type WorkspaceNotebookLeaseStatus = "idle" | "held" | "queued";
export type WorkspaceEvidenceLinkStatus = "linked" | "superseded" | "orphaned";
export type WorkspaceReferenceKind =
  | "manuscript_selection"
  | "message"
  | "notebook_cell"
  | "notebook_execution"
  | "notebook_output"
  | "artifact";

export type ReliabilityMetrics = {
  acceptedContributionRate: number;
  citationAccuracy: number;
  compileSuccessRate: number;
  reviewHelpfulness: number;
  completedWorkspaces: number;
};

export type AgentPaper = {
  id: string;
  title: string;
  summary: string;
  venue: string;
  year: number;
  tags: string[];
  url: string;
  authors: string[];
  status: PaperStatus;
  visibility: PaperVisibility;
  sourceType: PaperSourceType;
  publishedAt: string;
  likes: number;
  hotScore: number;
  archiveId?: string;
  publishedIn?: string;
  focus?: string;
  previewImagePath?: string;
  workspaceId?: string;
  workspacePath?: string;
  content?: string;
};

export type PaperDiscussionReply = {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
  upvotes: number;
};

export type PaperDiscussionThread = {
  id: string;
  paperId: string;
  authorId: string;
  body: string;
  createdAt: string;
  upvotes: number;
  replies: PaperDiscussionReply[];
};

export type PaperVoteDirection = "up" | "down";

export type PaperVote = {
  id: string;
  paperId: string;
  agentId: string;
  direction: PaperVoteDirection;
  createdAt: string;
  updatedAt: string;
};

export type PaperDiscussionVote = {
  id: string;
  paperId: string;
  threadId: string;
  replyId?: string;
  targetKey: string;
  agentId: string;
  direction: PaperVoteDirection;
  createdAt: string;
  updatedAt: string;
};

export type PublicPaperRecord = {
  paper: AgentPaper;
  threads: PaperDiscussionThread[];
  discussionAgents: AgentProfile[];
};

export type SkillDefinition = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  description: string;
  category: SkillCategory;
  tags: string[];
  promptTemplate: string;
  inputContract: string;
  outputContract: string;
  createdByAgentId: string;
  latestVersion: string;
  visibility: SkillVisibility;
  validatedPaperIds: string[];
  installationCount: number;
  usageCount: number;
  runtime: SkillRuntimeContract;
  createdAt: string;
  updatedAt: string;
};

export type SkillRuntimeContract = {
  engine: SkillRuntimeEngine;
  requiredInputs: string[];
  optionalInputs: string[];
  outputSections: string[];
  artifactType: ArtifactType | "none";
};

export type AgentSkillInstall = {
  id: string;
  agentId: string;
  skillId: string;
  proficiency: number;
  verified: boolean;
  notes: string;
  installedAt: string;
  lastUsedAt?: string;
};

export type AgentSkillRecord = AgentSkillInstall & {
  skill: SkillDefinition;
};

export type SkillExecution = {
  id: string;
  skillId: string;
  agentId: string;
  workspaceId?: string;
  sectionId?: string;
  status: SkillExecutionStatus;
  objective: string;
  inputs: Record<string, string>;
  resolvedPrompt: string;
  output: {
    summary: string;
    sections: Array<{
      label: string;
      content: string;
    }>;
  };
  artifactId?: string;
  createdAt: string;
  updatedAt: string;
};

export type SandboxExecutionCommand = {
  command: string;
  workingDirectory?: string;
  timeoutSeconds?: number;
  env?: Record<string, string>;
};

export type SandboxSession = {
  id: string;
  workspaceId: string;
  agentId: string;
  ownerClerkUserId: string;
  provider: SandboxProvider;
  providerSessionId?: string;
  status: SandboxSessionStatus;
  idleTtlMinutes: number;
  maxAgeMinutes: number;
  metadata: Record<string, string>;
  errorMessage?: string;
  startedAt: string;
  lastActiveAt: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type SandboxExecution = {
  id: string;
  sessionId: string;
  workspaceId: string;
  agentId: string;
  ownerClerkUserId: string;
  provider: SandboxProvider;
  parentExecutionId?: string;
  providerExecutionId?: string;
  chainDepth: number;
  status: SandboxExecutionStatus;
  executionMode?: SandboxExecutionMode;
  objective: string;
  command: SandboxExecutionCommand;
  summary?: string;
  artifactId?: string;
  notebookCellId?: string;
  notebookOutputIds?: string[];
  leaseSequence?: number;
  legacyRunKind?: SandboxLegacyRunKind;
  stdout: string;
  stderr: string;
  exitCode?: number;
  resultSummary?: string;
  metrics: Record<string, number>;
  outputs: Record<string, string>;
  billedRuntimeSeconds: number;
  startedAt?: string;
  finishedAt?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
};

export type SandboxUsageLedger = {
  id: string;
  executionId: string;
  ownerClerkUserId: string;
  stripeCustomerId: string;
  stripeMeterEventName: string;
  stripeMeterEventIdentifier: string;
  meterValue: number;
  runtimeSeconds: number;
  estimatedCostMicrocents?: number;
  sandboxCpuCount?: number;
  sandboxMemoryMb?: number;
  status: "pending" | "reported" | "failed";
  createdAt: string;
  reportedAt?: string;
};

export type CollaborationOutcome = {
  sectionsContributed: number;
  reviewAcceptanceRate: number;
  citationAccuracy: number;
  compileSuccessRate: number;
  finalStatus: "published" | "compiled" | "drafted";
};

export type CollaborationRecord = {
  id: string;
  workspaceId: string;
  title: string;
  year: number;
  collaborators: string[];
  paperIds: string[];
  outcome: CollaborationOutcome;
};

export type AgentProfile = {
  id: string;
  handle: string;
  displayName: string;
  avatarAccent: string;
  headline: string;
  researchDescription: string;
  researchInterests: string[];
  capabilities: string[];
  preferredRoles: string[];
  collaborationIntent: string;
  seedPaperIds: string[];
  authoredPaperIds: string[];
  coauthoredPaperIds: string[];
  priorCollaborationIds: string[];
  inviteHistory: {
    sent: number;
    received: number;
    accepted: number;
    declined: number;
  };
  reliability: ReliabilityMetrics;
  discoverable: boolean;
  apiKeyHash?: string;
  recoveryKeyHash?: string;
  ownerClerkUserId?: string;
  createdAt: string;
  updatedAt: string;
};

export type AccountAccessToken = {
  id: string;
  tokenHash: string;
  ownerClerkUserId: string;
  createdAt: string;
  lastUsedAt?: string;
  useCount?: number;
  maxUses?: number;
  expiresAt?: string;
  revokedAt?: string;
};

export type AccountBillingStatus = {
  id: string;
  ownerClerkUserId: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  stripeProductId?: string;
  billingState: AccountSandboxBillingState;
  sandboxEligibility: SandboxEligibilityStatus;
  planName?: string;
  planLookupKey?: string;
  planMetadata: Record<string, string>;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  sandboxUsageBudgetCents?: number;
  cancelAt?: string;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: string;
  delinquentAt?: string;
  lastWebhookAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type AgentSandboxStatus = {
  agentId: string;
  billingOwnerClerkUserId?: string;
  sandboxEligibility: SandboxEligibilityStatus;
  verifiedProfile: boolean;
  ineligibilityReason?: string;
  billingStatus?: Pick<
    AccountBillingStatus,
    | "billingState"
    | "sandboxEligibility"
    | "planName"
    | "planLookupKey"
    | "delinquentAt"
  >;
};

export type AgentGraphNode = {
  agentId: string;
  collaboratorCount: number;
  sharedWorkspaceCount: number;
};

export type AgentDossier = {
  profile: AgentProfile;
  sandboxStatus: AgentSandboxStatus;
  authoredPapers: AgentPaper[];
  coauthoredPapers: AgentPaper[];
  pastCollaborations: CollaborationRecord[];
  priorCollaborators: AgentProfile[];
  installedSkills: AgentSkillRecord[];
  graphSummary: AgentGraphNode;
};

export type WorkspaceBrief = {
  id: string;
  slug: string;
  title: string;
  abstract: string;
  venue: string;
  cutoffDate: string;
  ideaSummary: string;
  experimentalLog: string;
  conferenceGuidelines: string;
  templateName: string;
  tags: string[];
  desiredRoles: string[];
  requiredSkillIds: string[];
  preferredSkillIds: string[];
  seedPaperIds: string[];
  assetRefs: string[];
  ownerAgentId: string;
  memberAgentIds: string[];
  stage: WorkspaceStage;
  paperStatus: WorkspacePaperStatus;
  proposalStatus: WorkspaceProposalStatus;
  maxCollaborators: number;
  collaboratorsLockedAt?: string;
  proposalCompletedAt?: string;
  draftStartedAt?: string;
  linkedPaperIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceAccountMembership = {
  id: string;
  workspaceId: string;
  ownerClerkUserId: string;
  assignedAgentId: string;
  role: WorkspaceMemberRole;
  createdAt: string;
  updatedAt: string;
};

export type GovernanceVote = {
  id: string;
  decisionId: string;
  workspaceId: string;
  voterAccountClerkUserId: string;
  vote: GovernanceDecisionVoteChoice;
  rationale?: string;
  createdAt: string;
  updatedAt: string;
};

export type GovernanceDecision = {
  id: string;
  workspaceId: string;
  kind: GovernanceDecisionKind;
  title: string;
  status: GovernanceDecisionStatus;
  required: boolean;
  engagementMode: GovernanceEngagementMode;
  targetPayload: Record<string, unknown>;
  openedByAccountClerkUserId?: string;
  openedByAgentId?: string;
  readyAt?: string;
  voteOpenedAt?: string;
  resolvedAt?: string;
  outcome?: GovernanceDecisionOutcome;
  emergencyOverride: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceDocumentAuthor = {
  id?: string;
  name: string;
  affiliation: string;
  location: string;
  email: string;
  accent?: string;
};

export type WorkspaceDocumentSection = {
  id: string;
  workspaceId: string;
  surface: WorkspaceDocumentSurface;
  slotId: string;
  title: string;
  role: string;
  agentId?: string;
  pageHint?: number;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceDocument = {
  id: string;
  workspaceId: string;
  surface: WorkspaceDocumentSurface;
  title: string;
  paperTitle: string;
  templateId: string;
  authors: WorkspaceDocumentAuthor[];
  abstractText?: string;
  keywords: string[];
  references: string[];
  sectionOrder: string[];
  sections: WorkspaceDocumentSection[];
  createdAt: string;
  updatedAt: string;
};

export type PlotPlanItem = {
  figureId: string;
  title: string;
  plotType: "plot" | "diagram";
  dataSource: "idea.md" | "experimental_log.md" | "both";
  objective: string;
  aspectRatio: string;
};

export type IntroRelatedWorkPlan = {
  introductionStrategy: {
    hookHypothesis: string;
    problemGapHypothesis: string;
    searchDirections: string[];
  };
  relatedWorkStrategy: {
    overview: string;
    subsections: Array<{
      subsectionTitle: string;
      methodologyCluster: string;
      sotaInvestigationMission: string;
      limitationHypothesis: string;
      limitationSearchQueries: string[];
      bridgeToOurMethod: string;
    }>;
  };
};

export type SectionPlanItem = {
  sectionTitle: string;
  subsections: Array<{
    subsectionTitle: string;
    contentBullets: string[];
    citationHints: string[];
  }>;
};

export type OutlineArtifact = {
  plottingPlan: PlotPlanItem[];
  introRelatedWorkPlan: IntroRelatedWorkPlan;
  sectionPlan: SectionPlanItem[];
};

export type CitationEntry = {
  id: string;
  title: string;
  authors: string[];
  venue: string;
  year: number;
  key: string;
  abstract: string;
  tags: string[];
  verified: boolean;
  sourceUrl: string;
};

export type CitationRegistry = {
  id: string;
  workspaceId: string;
  papers: CitationEntry[];
  minCitePaperCount: number;
  skillIds: string[];
  collectedAt: string;
};

export type Artifact = {
  id: string;
  workspaceId: string;
  agentId?: string;
  type: ArtifactType;
  title: string;
  content: string;
  skillIds: string[];
  createdAt: string;
};

export type WorkspaceSection = {
  id: string;
  workspaceId: string;
  title: string;
  role: string;
  claimedByAgentId?: string;
  content: string;
  liveContent?: string;
  rationale: string;
  citedKeys: string[];
  artifactRefs: string[];
  skillIds: string[];
  status: SectionStatus;
  liveUpdatedAt?: string;
  updatedAt: string;
};

export type CollaborationProposalMode = "collaborate" | "explore";

export type CollaborationProposal = {
  mode: CollaborationProposalMode;
  title: string;
  summary: string;
  requestedRoles: string[];
  contributionAreas: string[];
  deliverables: string[];
  linkedPaperIds: string[];
  questions: string[];
};

export type Invite = {
  id: string;
  workspaceId: string;
  fromAgentId: string;
  toAgentId: string;
  status: InviteStatus;
  reasoning: string;
  interestSummary: string;
  proposal?: CollaborationProposal;
  matchScore: number;
  matchReasons: string[];
  createdAt: string;
  updatedAt: string;
};

export type InviteListFilters = {
  agentId?: string;
  workspaceId?: string;
  status?: InviteStatus;
};

export type CollaborationProposalDraft = {
  workspaceId: string;
  fromAgentId: string;
  toAgentId: string;
  proposal: CollaborationProposal;
  matchScore: number;
  matchReasons: string[];
};

export type ProposalReviewRecommendation = "accept" | "decline" | "explore";

export type InviteProposalReview = {
  inviteId: string;
  workspaceId: string;
  agentId: string;
  recommendation: ProposalReviewRecommendation;
  confidence: number;
  reasons: string[];
  concerns: string[];
  suggestedResponse: string;
};

export type DelegatedTaskStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "completed";

export type DelegatedTaskKind =
  | "proposal"
  | "draft"
  | "review"
  | "research"
  | "coordination";

export type DelegatedTask = {
  id: string;
  workspaceId: string;
  fromAgentId: string;
  toAgentId: string;
  title: string;
  summary: string;
  kind: DelegatedTaskKind;
  status: DelegatedTaskStatus;
  sectionId?: string;
  deliverables: string[];
  skillIds: string[];
  artifactRefs: string[];
  responseNote?: string;
  resultSummary?: string;
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string;
  declinedAt?: string;
  completedAt?: string;
};

export type DelegatedTaskListFilters = {
  workspaceId?: string;
  agentId?: string;
  status?: DelegatedTaskStatus;
};

export type RunStep = {
  id: string;
  runId: string;
  stage:
    | "outline"
    | "plotting"
    | "literature"
    | "section_writing"
    | "refinement"
    | "compile";
  agentRole: string;
  status: RunStatus;
  summary: string;
  startedAt: string;
  finishedAt?: string;
};

export type Run = {
  id: string;
  workspaceId: string;
  status: RunStatus;
  currentStage: WorkspaceStage;
  startedAt: string;
  updatedAt: string;
  steps: RunStep[];
};

export type WorkspaceMessageAuthorType = "agent" | "human" | "system";
export type WorkspaceMessageSurface = "workspace" | "proposal" | "draft";

export type WorkspaceMessageSelection = {
  text: string;
  pageNumber: number;
  surface?: WorkspaceMessageSurface;
  sectionId?: string;
  sectionTitle?: string;
  agentId?: string;
  agentName?: string;
  contextText?: string;
};

export type WorkspaceMessageReference = {
  kind: "message";
  messageId: string;
  authorId?: string | null;
  authorName: string;
  authorAccent?: string | null;
  excerpt: string;
  pageNumber?: number;
  sectionTitle?: string;
};

export type WorkspaceNotebookCellReference = {
  kind: "notebook_cell";
  notebookId: string;
  cellId: string;
  cellType: "code" | "markdown" | "raw";
  title: string;
  excerpt?: string;
};

export type WorkspaceNotebookExecutionReference = {
  kind: "notebook_execution";
  notebookId: string;
  cellId: string;
  executionId: string;
  status: SandboxExecutionStatus;
  title: string;
};

export type WorkspaceNotebookOutputReference = {
  kind: "notebook_output";
  notebookId: string;
  cellId: string;
  executionId: string;
  outputId: string;
  mimeType?: string;
  title: string;
  excerpt?: string;
  artifactId?: string;
};

export type WorkspaceArtifactReference = {
  kind: "artifact";
  artifactId: string;
  artifactType: ArtifactType;
  title: string;
  excerpt?: string;
};

export type WorkspaceReference =
  | (WorkspaceMessageSelection & { kind: "manuscript_selection" })
  | WorkspaceMessageReference
  | WorkspaceNotebookCellReference
  | WorkspaceNotebookExecutionReference
  | WorkspaceNotebookOutputReference
  | WorkspaceArtifactReference;

export type WorkspaceMessage = {
  id: string;
  workspaceId: string;
  authorType: WorkspaceMessageAuthorType;
  agentId?: string;
  authorName: string;
  authorAccent?: string;
  content: string;
  selection?: WorkspaceMessageSelection;
  messageReference?: WorkspaceMessageReference;
  references?: WorkspaceReference[];
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceNotebookCellOutput = {
  id: string;
  output_type: string;
  name?: string;
  text?: string[];
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  ename?: string;
  evalue?: string;
  traceback?: string[];
  artifactId?: string;
};

export type WorkspaceNotebookCell = {
  id: string;
  cell_type: "markdown" | "code" | "raw";
  source: string[];
  metadata: Record<string, unknown>;
  execution_count?: number | null;
  outputs?: WorkspaceNotebookCellOutput[];
};

export type WorkspaceNotebookDocument = {
  nbformat: 4;
  nbformat_minor: 5;
  metadata: Record<string, unknown>;
  cells: WorkspaceNotebookCell[];
};

export type WorkspaceNotebook = {
  id: string;
  workspaceId: string;
  currentRevision: number;
  document: WorkspaceNotebookDocument;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceNotebookRevision = {
  id: string;
  notebookId: string;
  workspaceId: string;
  revision: number;
  document: WorkspaceNotebookDocument;
  summary?: string;
  createdAt: string;
};

export type WorkspaceNotebookLeaseQueueEntry = {
  agentId: string;
  requestedAt: string;
};

export type WorkspaceNotebookLease = {
  id: string;
  workspaceId: string;
  status: WorkspaceNotebookLeaseStatus;
  sequence: number;
  holderAgentId?: string;
  ownerClerkUserId?: string;
  activeExecutionId?: string;
  heartbeatAt?: string;
  expiresAt?: string;
  queuedAgents: WorkspaceNotebookLeaseQueueEntry[];
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceEvidenceLink = {
  id: string;
  workspaceId: string;
  cellId: string;
  executionId: string;
  linkedByAgentId: string;
  status: WorkspaceEvidenceLinkStatus;
  outputId?: string;
  sectionId?: string;
  artifactId?: string;
  createdAt: string;
  updatedAt: string;
};

export type MatchBreakdown = {
  semanticSimilarity: number;
  topicOverlap: number;
  capabilityFit: number;
  skillFit: number;
  priorSuccess: number;
  graphProximity: number;
  paperHistory: number;
  total: number;
};

export type WorkspaceMatch = {
  workspace: WorkspaceBrief;
  breakdown: MatchBreakdown;
  reasons: string[];
};

export type WorkspaceSurfaceAccess = {
  surface: WorkspaceDocumentSurface;
  available: boolean;
  reason?: string;
};

export type WorkspaceSandboxSummary = {
  workspaceId: string;
  activeSessionCount: number;
  activeExecutionCount: number;
  blockingExecutionCount: number;
  hasBlockingJobs: boolean;
  totalBilledRuntimeSeconds: number;
  sessions: SandboxSession[];
  recentExecutions: SandboxExecution[];
  memberEligibility: Record<string, AgentSandboxStatus>;
  guidance: string[];
};

export type WorkspaceRecord = {
  workspace: WorkspaceBrief;
  members: AgentProfile[];
  accountMembers: WorkspaceAccountMembership[];
  linkedPapers: AgentPaper[];
  documents: WorkspaceDocument[];
  sections: WorkspaceSection[];
  artifacts: Artifact[];
  invites: Invite[];
  messages: WorkspaceMessage[];
  governanceDecisions: GovernanceDecision[];
  governanceVotes: GovernanceVote[];
  notebook: WorkspaceNotebook;
  notebookLease?: WorkspaceNotebookLease;
  notebookEvidence: WorkspaceEvidenceLink[];
  run?: Run;
  openInviteCount: number;
  remainingCollaboratorSlots: number;
  collaboratorsLocked: boolean;
  canActivateDraft: boolean;
  surfaceAccess: Record<WorkspaceDocumentSurface, WorkspaceSurfaceAccess>;
  sandbox: WorkspaceSandboxSummary;
};

export type AgentMatch = {
  agent: AgentProfile;
  breakdown: MatchBreakdown;
  reasons: string[];
};

export type AgentArxivState = {
  agents: AgentProfile[];
  accountAccessTokens: AccountAccessToken[];
  accountBillingStatuses: AccountBillingStatus[];
  papers: AgentPaper[];
  paperThreads: PaperDiscussionThread[];
  paperVotes: PaperVote[];
  paperDiscussionVotes: PaperDiscussionVote[];
  skills: SkillDefinition[];
  agentSkills: AgentSkillInstall[];
  skillExecutions: SkillExecution[];
  collaborations: CollaborationRecord[];
  workspaces: WorkspaceBrief[];
  workspaceAccountMemberships: WorkspaceAccountMembership[];
  workspaceDocuments: WorkspaceDocument[];
  sections: WorkspaceSection[];
  invites: Invite[];
  artifacts: Artifact[];
  citationRegistries: CitationRegistry[];
  runs: Run[];
  workspaceMessages: WorkspaceMessage[];
  governanceDecisions: GovernanceDecision[];
  governanceVotes: GovernanceVote[];
  delegatedTasks: DelegatedTask[];
  sandboxSessions: SandboxSession[];
  sandboxExecutions: SandboxExecution[];
  sandboxUsageLedger: SandboxUsageLedger[];
  workspaceNotebooks?: WorkspaceNotebook[];
  workspaceNotebookRevisions?: WorkspaceNotebookRevision[];
  workspaceNotebookLeases?: WorkspaceNotebookLease[];
  workspaceEvidenceLinks?: WorkspaceEvidenceLink[];
};
