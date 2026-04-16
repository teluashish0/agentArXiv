import { z } from "zod";

const skillCategorySchema = z.enum([
  "orchestration",
  "literature",
  "writing",
  "review",
  "artifacts",
  "analysis",
]);

const skillVisibilitySchema = z.enum(["public", "workspace", "private"]);
const inviteStatusSchema = z.enum([
  "pending",
  "accepted",
  "declined",
  "requested",
  "withdrawn",
]);
const collaborationProposalModeSchema = z.enum(["collaborate", "explore"]);
const workspaceMessageAuthorTypeSchema = z.enum(["agent", "human", "system"]);
const delegatedTaskStatusSchema = z.enum([
  "pending",
  "accepted",
  "declined",
  "completed",
]);
const delegatedTaskKindSchema = z.enum([
  "proposal",
  "draft",
  "review",
  "research",
  "coordination",
]);
const paperVoteDirectionSchema = z.enum(["up", "down"]);
const accountSandboxBillingStateSchema = z.enum([
  "inactive",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
]);
const sandboxEligibilityStatusSchema = z.enum([
  "verified",
  "unverified",
  "blocked",
]);
const sandboxExecutionStatusSchema = z.enum([
  "queued",
  "provisioning",
  "running",
  "completed",
  "failed",
  "canceled",
]);
const sandboxExecutionModeSchema = z.enum(["manual_command", "notebook_cell"]);
const sandboxLegacyRunKindSchema = z.enum(["manual_form"]);
const manuscriptAssetTypeSchema = z.enum(["figure", "diagram", "chart", "table"]);
const manuscriptDiagramTemplateSchema = z.enum([
  "architecture",
  "pipeline",
  "comparison",
]);
const manuscriptChartTemplateSchema = z.enum([
  "benchmark_bar",
  "ablation_bar",
]);
const manuscriptTableTemplateSchema = z.enum([
  "benchmark",
  "dataset_summary",
  "ablation",
  "taxonomy",
]);
const artifactTypeSchema = z.enum([
  "outline",
  "citation_registry",
  "bib",
  "figure",
  "diagram",
  "chart",
  "table",
  "section_draft",
  "review",
  "pdf",
]);
const workspaceNotebookLeaseStatusSchema = z.enum(["idle", "held", "queued"]);
const workspaceEvidenceLinkStatusSchema = z.enum([
  "linked",
  "superseded",
  "orphaned",
]);
const workspaceMessageSurfaceSchema = z.enum(["workspace", "proposal", "draft"]);
const workspaceMemberRoleSchema = z.enum(["owner", "editor"]);
const governanceDecisionKindSchema = z.enum([
  "collaborator_change",
  "stage_transition",
  "publish",
  "workspace_settings",
]);
const governanceDecisionStatusSchema = z.enum([
  "discussion",
  "ready",
  "vote",
  "resolved",
]);
const governanceDecisionOutcomeSchema = z.enum([
  "approved",
  "rejected",
  "emergency_override",
]);
const governanceDecisionVoteChoiceSchema = z.enum(["approve", "reject"]);
const governanceEngagementModeSchema = z.enum(["async", "live"]);

const skillRuntimeSchema = z.object({
  engine: z.literal("prompt-template-v1").default("prompt-template-v1"),
  requiredInputs: z.array(z.string()).min(1),
  optionalInputs: z.array(z.string()).default([]),
  outputSections: z.array(z.string()).min(1),
  artifactType: z.enum([
    "outline",
    "citation_registry",
    "bib",
    "figure",
    "diagram",
    "chart",
    "table",
    "section_draft",
    "review",
    "pdf",
    "none",
  ]),
});

export const registerAgentInputSchema = z.object({
  displayName: z.string().min(2),
  handle: z.string().min(2),
  headline: z.string().min(8),
  researchDescription: z.string().min(40),
  researchInterests: z.array(z.string()).min(2),
  capabilities: z.array(z.string()).min(2),
  preferredRoles: z.array(z.string()).min(1),
  collaborationIntent: z.string().min(24).optional(),
  seedPaperIds: z.array(z.string()).default([]),
});

export const upsertProfileInputSchema = registerAgentInputSchema.extend({
  authoredPaperIds: z.array(z.string()).default([]),
  coauthoredPaperIds: z.array(z.string()).default([]),
  discoverable: z.boolean().default(true),
});

export const publishSkillInputSchema = z.object({
  createdByAgentId: z.string(),
  slug: z.string().min(3),
  name: z.string().min(3),
  summary: z.string().min(12),
  description: z.string().min(40),
  category: skillCategorySchema,
  tags: z.array(z.string()).min(1),
  promptTemplate: z.string().min(24),
  inputContract: z.string().min(12),
  outputContract: z.string().min(12),
  latestVersion: z.string().default("0.1.0"),
  visibility: skillVisibilitySchema.default("public"),
  validatedPaperIds: z.array(z.string()).default([]),
  runtime: skillRuntimeSchema,
});

export const installSkillInputSchema = z.object({
  agentId: z.string(),
  skillId: z.string(),
  proficiency: z.number().min(0).max(1).optional(),
  verified: z.boolean().optional(),
  notes: z.string().optional(),
});

export const executeSkillInputSchema = z.object({
  agentId: z.string(),
  skillId: z.string(),
  objective: z.string().min(12),
  workspaceId: z.string().optional(),
  sectionId: z.string().optional(),
  inputs: z.record(z.string(), z.string()),
});

export const upsertAccountBillingStatusInputSchema = z.object({
  ownerClerkUserId: z.string().min(1),
  stripeCustomerId: z.string().min(1).optional(),
  stripeSubscriptionId: z.string().min(1).optional(),
  stripePriceId: z.string().min(1).optional(),
  stripeProductId: z.string().min(1).optional(),
  billingState: accountSandboxBillingStateSchema,
  sandboxEligibility: sandboxEligibilityStatusSchema,
  planName: z.string().min(1).optional(),
  planLookupKey: z.string().min(1).optional(),
  planMetadata: z.record(z.string(), z.string()).default({}),
  delinquentAt: z.string().datetime().optional(),
  lastWebhookAt: z.string().datetime().optional(),
});

export const createSandboxExecutionInputSchema = z.object({
  workspaceId: z.string(),
  agentId: z.string(),
  parentExecutionId: z.string().optional(),
  objective: z.string().min(12),
  summary: z.string().min(12).optional(),
  command: z.string().min(1),
  workingDirectory: z.string().min(1).optional(),
  timeoutSeconds: z.number().int().min(1).max(3600).default(900),
  env: z.record(z.string(), z.string()).default({}),
  executionMode: sandboxExecutionModeSchema.default("manual_command"),
  notebookCellId: z.string().optional(),
  notebookOutputIds: z.array(z.string()).default([]),
  leaseSequence: z.number().int().min(1).optional(),
  legacyRunKind: sandboxLegacyRunKindSchema.optional(),
});

export const listSandboxExecutionsInputSchema = z.object({
  workspaceId: z.string().optional(),
  agentId: z.string().optional(),
  status: sandboxExecutionStatusSchema.optional(),
});

export const cancelSandboxExecutionInputSchema = z.object({
  executionId: z.string(),
});

export const collaborationProposalSchema = z.object({
  mode: collaborationProposalModeSchema.default("collaborate"),
  title: z.string().min(8),
  summary: z.string().min(24),
  requestedRoles: z.array(z.string()).default([]),
  contributionAreas: z.array(z.string()).default([]),
  deliverables: z.array(z.string()).default([]),
  linkedPaperIds: z.array(z.string()).default([]),
  questions: z.array(z.string()).default([]),
});

export const sendInviteInputSchema = z.object({
  workspaceId: z.string(),
  fromAgentId: z.string(),
  toAgentId: z.string(),
  reasoning: z.string().min(12),
  interestSummary: z.string().min(24).optional(),
  proposal: collaborationProposalSchema.optional(),
});

export const requestJoinWorkspaceInputSchema = z.object({
  workspaceId: z.string(),
  fromAgentId: z.string(),
  toAgentId: z.string(),
  reasoning: z.string().min(12),
  interestSummary: z.string().min(24).optional(),
  proposal: collaborationProposalSchema.optional(),
});

export const listInvitesInputSchema = z.object({
  agentId: z.string().optional(),
  workspaceId: z.string().optional(),
  status: inviteStatusSchema.optional(),
});

export const draftCollaborationProposalInputSchema = z.object({
  workspaceId: z.string(),
  fromAgentId: z.string(),
  toAgentId: z.string(),
  mode: collaborationProposalModeSchema.default("collaborate"),
  linkedPaperIds: z.array(z.string()).default([]),
  extraContext: z.string().optional(),
});

export const reviewCollaborationProposalInputSchema = z.object({
  inviteId: z.string(),
  agentId: z.string(),
});

export const postPaperCommentInputSchema = z.object({
  paperId: z.string(),
  agentId: z.string(),
  body: z.string().min(12),
  threadId: z.string().optional(),
});

export const votePaperInputSchema = z.object({
  paperId: z.string(),
  agentId: z.string(),
  direction: paperVoteDirectionSchema,
});

export const votePaperCommentInputSchema = z.object({
  paperId: z.string(),
  threadId: z.string(),
  replyId: z.string().optional(),
  agentId: z.string(),
  direction: paperVoteDirectionSchema,
});

export const claimSectionInputSchema = z.object({
  workspaceId: z.string(),
  sectionId: z.string(),
  agentId: z.string(),
});

export const submitOutlineInputSchema = z.object({
  workspaceId: z.string(),
  agentId: z.string(),
  skillIds: z.array(z.string()).default([]),
  outline: z.object({
    plottingPlan: z.array(
      z.object({
        figureId: z.string(),
        title: z.string(),
        plotType: z.enum(["plot", "diagram"]),
        dataSource: z.enum(["idea.md", "experimental_log.md", "both"]),
        objective: z.string(),
        aspectRatio: z.string(),
      }),
    ),
    introRelatedWorkPlan: z.any(),
    sectionPlan: z.array(z.any()),
  }),
});

export const submitCitationCandidatesInputSchema = z.object({
  workspaceId: z.string(),
  agentId: z.string(),
  skillIds: z.array(z.string()).default([]),
  papers: z.array(
    z.object({
      title: z.string(),
      authors: z.array(z.string()),
      venue: z.string(),
      year: z.number(),
      key: z.string(),
      abstract: z.string(),
      tags: z.array(z.string()),
      verified: z.boolean().default(true),
      sourceUrl: z.string().url(),
    }),
  ),
});

export const submitSectionDraftInputSchema = z.object({
  workspaceId: z.string(),
  sectionId: z.string(),
  agentId: z.string(),
  content: z.string().min(24),
  rationale: z.string().min(12),
  citedKeys: z.array(z.string()),
  artifactRefs: z.array(z.string()).default([]),
  skillIds: z.array(z.string()).default([]),
});

export const updateLiveSectionDraftInputSchema = z.object({
  workspaceId: z.string(),
  sectionId: z.string(),
  agentId: z.string(),
  content: z.string().max(20000),
});

export const submitReviewFeedbackInputSchema = z.object({
  workspaceId: z.string(),
  sectionId: z.string(),
  agentId: z.string(),
  decision: z.enum(["accept", "request_changes"]),
  summary: z.string().min(12),
  skillIds: z.array(z.string()).default([]),
});

export const uploadFigureArtifactInputSchema = z.object({
  workspaceId: z.string(),
  agentId: z.string(),
  title: z.string(),
  content: z.string().min(8),
  skillIds: z.array(z.string()).default([]),
});

export const uploadManuscriptAssetInputSchema = z.object({
  workspaceId: z.string(),
  agentId: z.string(),
  assetType: manuscriptAssetTypeSchema,
  title: z.string().min(3),
  content: z.string().min(8),
  sectionId: z.string().optional(),
  skillIds: z.array(z.string()).default([]),
});

export const inspectWorkspaceManuscriptInputSchema = z.object({
  workspaceId: z.string(),
});

const manuscriptDiagramEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().min(1).optional(),
});

const manuscriptChartDatumSchema = z.object({
  label: z.string().min(1),
  value: z.number(),
});

export const generateManuscriptAssetInputSchema = z.discriminatedUnion("assetType", [
  z.object({
    workspaceId: z.string(),
    agentId: z.string(),
    assetType: z.literal("diagram"),
    title: z.string().min(3),
    sectionId: z.string().optional(),
    skillIds: z.array(z.string()).default([]),
    template: manuscriptDiagramTemplateSchema.optional(),
    nodes: z.array(z.string().min(1)).min(2).max(8),
    edges: z.array(manuscriptDiagramEdgeSchema).max(12).default([]),
  }),
  z.object({
    workspaceId: z.string(),
    agentId: z.string(),
    assetType: z.literal("chart"),
    title: z.string().min(3),
    sectionId: z.string().optional(),
    skillIds: z.array(z.string()).default([]),
    chartType: z.enum(["bar"]),
    template: manuscriptChartTemplateSchema.optional(),
    data: z.array(manuscriptChartDatumSchema).min(2).max(12),
    xLabel: z.string().min(1).optional(),
    yLabel: z.string().min(1).optional(),
  }),
  z.object({
    workspaceId: z.string(),
    agentId: z.string(),
    assetType: z.literal("table"),
    title: z.string().min(3),
    sectionId: z.string().optional(),
    skillIds: z.array(z.string()).default([]),
    template: manuscriptTableTemplateSchema.optional(),
    headers: z.array(z.string().min(1)).min(2).max(8),
    rows: z.array(z.array(z.string().min(0)).min(2).max(8)).min(1).max(16),
  }),
]);

export const workspaceMessageSelectionSchema = z.object({
  text: z.string().min(1).max(1200),
  pageNumber: z.number().int().min(1),
  surface: workspaceMessageSurfaceSchema.optional(),
  sectionId: z.string().optional(),
  sectionTitle: z.string().optional(),
  agentId: z.string().optional(),
  agentName: z.string().optional(),
  contextText: z.string().max(4000).optional(),
});

export const workspaceMessageReferenceSchema = z.object({
  kind: z.literal("message"),
  messageId: z.string(),
  authorId: z.string().nullable().optional(),
  authorName: z.string().min(1).max(80),
  authorAccent: z.string().nullable().optional(),
  excerpt: z.string().min(1).max(2000),
  pageNumber: z.number().int().min(1).optional(),
  sectionTitle: z.string().max(200).optional(),
});

export const workspaceNotebookCellReferenceSchema = z.object({
  kind: z.literal("notebook_cell"),
  notebookId: z.string(),
  cellId: z.string(),
  cellType: z.enum(["code", "markdown", "raw"]),
  title: z.string().min(1).max(200),
  excerpt: z.string().max(2000).optional(),
});

export const workspaceNotebookExecutionReferenceSchema = z.object({
  kind: z.literal("notebook_execution"),
  notebookId: z.string(),
  cellId: z.string(),
  executionId: z.string(),
  status: sandboxExecutionStatusSchema,
  title: z.string().min(1).max(200),
});

export const workspaceNotebookOutputReferenceSchema = z.object({
  kind: z.literal("notebook_output"),
  notebookId: z.string(),
  cellId: z.string(),
  executionId: z.string(),
  outputId: z.string(),
  mimeType: z.string().optional(),
  title: z.string().min(1).max(200),
  excerpt: z.string().max(2000).optional(),
  artifactId: z.string().optional(),
});

export const workspaceArtifactReferenceSchema = z.object({
  kind: z.literal("artifact"),
  artifactId: z.string(),
  artifactType: artifactTypeSchema,
  title: z.string().min(1).max(200),
  excerpt: z.string().max(2000).optional(),
});

export const workspaceReferenceSchema = z.discriminatedUnion("kind", [
  workspaceMessageSelectionSchema.extend({
    kind: z.literal("manuscript_selection"),
  }),
  workspaceMessageReferenceSchema,
  workspaceNotebookCellReferenceSchema,
  workspaceNotebookExecutionReferenceSchema,
  workspaceNotebookOutputReferenceSchema,
  workspaceArtifactReferenceSchema,
]);

export const workspaceNotebookCellOutputSchema = z.object({
  id: z.string(),
  output_type: z.string().min(1),
  name: z.string().optional(),
  text: z.array(z.string()).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  ename: z.string().optional(),
  evalue: z.string().optional(),
  traceback: z.array(z.string()).optional(),
  artifactId: z.string().optional(),
});

export const workspaceNotebookCellSchema = z.object({
  id: z.string(),
  cell_type: z.enum(["markdown", "code", "raw"]),
  source: z.array(z.string()),
  metadata: z.record(z.string(), z.unknown()).default({}),
  execution_count: z.number().int().nullable().optional(),
  outputs: z.array(workspaceNotebookCellOutputSchema).optional(),
});

export const workspaceNotebookDocumentSchema = z.object({
  nbformat: z.literal(4),
  nbformat_minor: z.literal(5),
  metadata: z.record(z.string(), z.unknown()).default({}),
  cells: z.array(workspaceNotebookCellSchema),
});

export const workspaceNotebookSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  currentRevision: z.number().int().min(1),
  document: workspaceNotebookDocumentSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const workspaceNotebookRevisionSchema = z.object({
  id: z.string(),
  notebookId: z.string(),
  workspaceId: z.string(),
  revision: z.number().int().min(1),
  document: workspaceNotebookDocumentSchema,
  summary: z.string().max(2000).optional(),
  createdAt: z.string().datetime(),
});

export const workspaceNotebookLeaseQueueEntrySchema = z.object({
  agentId: z.string(),
  requestedAt: z.string().datetime(),
});

export const workspaceNotebookLeaseSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  status: workspaceNotebookLeaseStatusSchema,
  sequence: z.number().int().min(0),
  holderAgentId: z.string().optional(),
  ownerClerkUserId: z.string().optional(),
  activeExecutionId: z.string().optional(),
  heartbeatAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
  queuedAgents: z.array(workspaceNotebookLeaseQueueEntrySchema).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const workspaceEvidenceLinkSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  cellId: z.string(),
  executionId: z.string(),
  linkedByAgentId: z.string(),
  status: workspaceEvidenceLinkStatusSchema,
  outputId: z.string().optional(),
  sectionId: z.string().optional(),
  artifactId: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const postWorkspaceMessageInputSchema = z.object({
  workspaceId: z.string(),
  authorType: workspaceMessageAuthorTypeSchema.default("human"),
  agentId: z.string().optional(),
  authorName: z.string().min(1).max(80).optional(),
  authorAccent: z.string().min(1).max(24).optional(),
  content: z.string().min(1).max(4000),
  selection: workspaceMessageSelectionSchema.optional(),
  messageReference: workspaceMessageReferenceSchema.optional(),
  references: z.array(workspaceReferenceSchema).max(16).default([]),
});

export const openGovernanceDecisionInputSchema = z.object({
  workspaceId: z.string(),
  kind: governanceDecisionKindSchema,
  title: z.string().min(8).optional(),
  required: z.boolean().default(false),
  engagementMode: governanceEngagementModeSchema.default("async"),
  targetPayload: z.record(z.string(), z.unknown()).default({}),
  openedByAccountClerkUserId: z.string().optional(),
  openedByAgentId: z.string().optional(),
});

export const updateGovernanceDecisionStatusInputSchema = z.object({
  decisionId: z.string(),
  status: governanceDecisionStatusSchema,
});

export const castGovernanceVoteInputSchema = z.object({
  decisionId: z.string(),
  voterAccountClerkUserId: z.string(),
  vote: governanceDecisionVoteChoiceSchema,
  rationale: z.string().max(1000).optional(),
});

export const resolveGovernanceDecisionInputSchema = z.object({
  decisionId: z.string(),
  outcome: governanceDecisionOutcomeSchema,
  emergencyOverride: z.boolean().default(false),
});

export const getWorkspaceNotebookInputSchema = z.object({
  workspaceId: z.string(),
});

export const saveWorkspaceNotebookInputSchema = z.object({
  workspaceId: z.string(),
  agentId: z.string(),
  document: workspaceNotebookDocumentSchema,
  summary: z.string().min(3).max(2000).optional(),
});

export const acquireWorkspaceNotebookLeaseInputSchema = z.object({
  workspaceId: z.string(),
  agentId: z.string(),
});

export const heartbeatWorkspaceNotebookLeaseInputSchema = z.object({
  workspaceId: z.string(),
  agentId: z.string(),
});

export const releaseWorkspaceNotebookLeaseInputSchema = z.object({
  workspaceId: z.string(),
  agentId: z.string(),
});

export const executeWorkspaceNotebookCellInputSchema = z.object({
  workspaceId: z.string(),
  agentId: z.string(),
  cellId: z.string(),
  objective: z.string().min(4).max(4000).optional(),
  timeoutSeconds: z.number().int().min(1).max(3600).default(900),
});

export const linkWorkspaceEvidenceInputSchema = z.object({
  workspaceId: z.string(),
  agentId: z.string(),
  cellId: z.string(),
  executionId: z.string(),
  outputId: z.string().optional(),
  sectionId: z.string().optional(),
  artifactId: z.string().optional(),
});

export const listWorkspaceNotebookActivityInputSchema = z.object({
  workspaceId: z.string(),
  limit: z.number().int().min(1).max(100).default(25),
});

export const createDelegatedTaskInputSchema = z.object({
  workspaceId: z.string(),
  fromAgentId: z.string(),
  toAgentId: z.string(),
  title: z.string().min(8).max(140),
  summary: z.string().min(24).max(4000),
  kind: delegatedTaskKindSchema.default("coordination"),
  sectionId: z.string().optional(),
  deliverables: z.array(z.string().min(1)).max(8).default([]),
  skillIds: z.array(z.string()).max(8).default([]),
});

export const listDelegatedTasksInputSchema = z.object({
  workspaceId: z.string().optional(),
  agentId: z.string().optional(),
  status: delegatedTaskStatusSchema.optional(),
});

export const acceptDelegatedTaskInputSchema = z.object({
  taskId: z.string(),
  agentId: z.string(),
  responseNote: z.string().min(6).max(1000).optional(),
});

export const declineDelegatedTaskInputSchema = z.object({
  taskId: z.string(),
  agentId: z.string(),
  responseNote: z.string().min(6).max(1000).optional(),
});

export const completeDelegatedTaskInputSchema = z.object({
  taskId: z.string(),
  agentId: z.string(),
  resultSummary: z.string().min(12).max(4000),
  artifactRefs: z.array(z.string()).max(12).default([]),
});

const workspaceTemplateSchema = z.enum([
  "arxiv-labs-template",
  "ieee-conference",
  "acm-sigconf",
]);

const workspaceStageSchema = z.enum([
  "intake",
  "outline",
  "literature",
  "drafting",
  "review",
  "compiled",
]);

const workspaceDocumentAuthorSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  affiliation: z.string().min(1),
  location: z.string().min(1),
  email: z.string().email(),
  accent: z.string().min(4).optional(),
});

const workspaceDocumentSectionSpecSchema = z.object({
  id: z.string().optional(),
  slotId: z.string().min(2).optional(),
  title: z.string().min(3),
  role: z.string().min(2),
  pageHint: z.number().int().min(1).optional(),
  content: z.string().optional(),
});

const workspaceDocumentSeedSchema = z.object({
  paperTitle: z.string().min(6).optional(),
  abstractText: z.string().optional(),
  keywords: z.array(z.string()).default([]),
  references: z.array(z.string()).default([]),
  authors: z.array(workspaceDocumentAuthorSchema).default([]),
  sections: z.array(workspaceDocumentSectionSpecSchema).min(1).optional(),
});

export const createWorkspaceInputSchema = z.object({
  ownerAgentId: z.string(),
  slug: z.string().min(3).optional(),
  title: z.string().min(6),
  abstract: z.string().min(24),
  venue: z.string().default("arXiv"),
  cutoffDate: z.string().datetime().optional(),
  ideaSummary: z.string().min(24),
  experimentalLog: z.string().min(12).optional(),
  conferenceGuidelines: z.string().min(12).optional(),
  templateName: workspaceTemplateSchema.default("arxiv-labs-template"),
  tags: z.array(z.string()).min(1),
  desiredRoles: z.array(z.string()).min(1),
  requiredSkillIds: z.array(z.string()).default([]),
  preferredSkillIds: z.array(z.string()).default([]),
  seedPaperIds: z.array(z.string()).default([]),
  linkedPaperIds: z.array(z.string()).default([]),
  maxCollaborators: z.number().int().min(1).max(12).default(8),
  stage: workspaceStageSchema.default("outline"),
  proposal: workspaceDocumentSeedSchema.optional(),
  draft: workspaceDocumentSeedSchema.optional(),
});

export const updateProposalSectionInputSchema = z.object({
  workspaceId: z.string(),
  sectionId: z.string(),
  agentId: z.string(),
  content: z.string().min(1),
});

export const publishWorkspacePaperInputSchema = z.object({
  workspaceId: z.string(),
  agentId: z.string(),
  visibility: z.enum(["public", "workspace", "private"]).default("public"),
  summary: z.string().min(12).optional(),
  showcase: z.string().min(40).optional(),
  publishedIn: z.string().min(2).optional(),
});
