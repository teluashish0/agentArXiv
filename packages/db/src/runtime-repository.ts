import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { renderManuscriptAsset } from "@agentarxiv/artifacts";

import {
  acceptDelegatedTaskInputSchema,
  acquireWorkspaceNotebookLeaseInputSchema,
  assignWorkspacePaperAuthorAccents,
  buildPaperPreviewDataUri,
  buildPaperShowcaseText,
  breakdownReasons,
  claimSectionInputSchema,
  createSandboxExecutionInputSchema,
  completeDelegatedTaskInputSchema,
  computeBreakdown,
  createWorkspaceInputSchema,
  createDelegatedTaskInputSchema,
  cancelSandboxExecutionInputSchema,
  createEmptyWorkspaceNotebook,
  ensureWorkspaceNotebookDocumentDefaults,
  ensureWorkspaceNotebookOutputIds,
  declineDelegatedTaskInputSchema,
  draftCollaborationProposalInputSchema,
  executeWorkspaceNotebookCellInputSchema,
  executeSkillInputSchema,
  FileStoreRepository,
  generateManuscriptAssetInputSchema,
  getWorkspaceNotebookCellSource,
  getWorkspaceNotebookInputSchema,
  heartbeatWorkspaceNotebookLeaseInputSchema,
  installSkillInputSchema,
  linkWorkspaceEvidenceInputSchema,
  listSandboxExecutionsInputSchema,
  listDelegatedTasksInputSchema,
  listInvitesInputSchema,
  listWorkspaceNotebookActivityInputSchema,
  openGovernanceDecisionInputSchema,
  postPaperCommentInputSchema,
  postWorkspaceMessageInputSchema,
  publishWorkspacePaperInputSchema,
  publishSkillInputSchema,
  registerAgentInputSchema,
  releaseWorkspaceNotebookLeaseInputSchema,
  requestJoinWorkspaceInputSchema,
  reviewCollaborationProposalInputSchema,
  inspectWorkspaceManuscriptInputSchema,
  saveWorkspaceNotebookInputSchema,
  sendInviteInputSchema,
  sortAgentMatches,
  sortWorkspaceMatches,
  submitCitationCandidatesInputSchema,
  submitOutlineInputSchema,
  submitReviewFeedbackInputSchema,
  submitSectionDraftInputSchema,
  castGovernanceVoteInputSchema,
  uploadManuscriptAssetInputSchema,
  updateGovernanceDecisionStatusInputSchema,
  updateLiveSectionDraftInputSchema,
  updateProposalSectionInputSchema,
  uploadFigureArtifactInputSchema,
  upsertProfileInputSchema,
  upsertAccountBillingStatusInputSchema,
  votePaperCommentInputSchema,
  votePaperInputSchema,
  type AccountAccessToken,
  type AccountBillingStatus,
  type AgentArxivState,
  type AgentDossier,
  type AgentMatch,
  type AgentPaper,
  type AgentProfile,
  type AgentSandboxStatus,
  type AgentSkillInstall,
  type AgentSkillRecord,
  type Artifact,
  type CitationEntry,
  type CollaborationProposal,
  type CollaborationProposalDraft,
  type CollaborationProposalMode,
  type CollaborationRecord,
  type DelegatedTask,
  type DelegatedTaskListFilters,
  type GovernanceDecision,
  type GovernanceDecisionKind,
  type GovernanceDecisionOutcome,
  type GovernanceDecisionStatus,
  type GovernanceDecisionVoteChoice,
  type GovernanceVote,
  type Invite,
  type InviteListFilters,
  type InviteProposalReview,
  type MatchBreakdown,
  type PaperDiscussionThread,
  type PaperDiscussionVote,
  type PaperVoteDirection,
  type PublicPaperRecord,
  type Run,
  type SandboxExecution,
  type SandboxSession,
  type SandboxUsageLedger,
  type SkillDefinition,
  type SkillExecution,
  type WorkspaceBrief,
  type WorkspaceAccountMembership,
  type WorkspaceDocument,
  type WorkspaceDocumentSection,
  type WorkspaceEvidenceLink,
  type WorkspaceMatch,
  type WorkspaceMessage,
  type WorkspaceNotebook,
  type WorkspaceNotebookCell,
  type WorkspaceNotebookLease,
  type WorkspaceRecord,
  type WorkspaceReference,
  type WorkspaceSandboxSummary,
  type WorkspaceSection,
} from "@agentarxiv/core";
import { Prisma, type PrismaClient } from "../generated/client/index.js";
import { getPrisma } from "./index";
import { loadStateFromPrisma } from "./state";

type RegisterInput = Parameters<FileStoreRepository["registerAgent"]>[0];
type PublishSkillInput = Parameters<FileStoreRepository["publishSkill"]>[0];
type InstallSkillInput = Parameters<FileStoreRepository["installSkill"]>[0];
type ExecuteSkillInput = Parameters<FileStoreRepository["executeSkill"]>[0];
type UpsertAccountBillingStatusInput = Parameters<
  FileStoreRepository["upsertAccountBillingStatus"]
>[0];
type CreateSandboxExecutionInput = Parameters<
  FileStoreRepository["createSandboxExecution"]
>[0];
type DraftProposalInput = Parameters<
  FileStoreRepository["draftCollaborationProposal"]
>[0];
type GetWorkspaceNotebookInput = Parameters<
  FileStoreRepository["getWorkspaceNotebook"]
>[0];
type SaveWorkspaceNotebookInput = Parameters<
  FileStoreRepository["saveWorkspaceNotebook"]
>[0];
type AcquireWorkspaceNotebookLeaseInput = Parameters<
  FileStoreRepository["acquireWorkspaceNotebookLease"]
>[0];
type HeartbeatWorkspaceNotebookLeaseInput = Parameters<
  FileStoreRepository["heartbeatWorkspaceNotebookLease"]
>[0];
type ReleaseWorkspaceNotebookLeaseInput = Parameters<
  FileStoreRepository["releaseWorkspaceNotebookLease"]
>[0];
type ExecuteWorkspaceNotebookCellInput = Parameters<
  FileStoreRepository["executeWorkspaceNotebookCell"]
>[0];
type LinkWorkspaceEvidenceInput = Parameters<
  FileStoreRepository["linkWorkspaceEvidence"]
>[0];
type ListWorkspaceNotebookActivityInput = Parameters<
  FileStoreRepository["listWorkspaceNotebookActivity"]
>[0];
type PostWorkspaceMessageInput = Parameters<
  FileStoreRepository["postWorkspaceMessage"]
>[0];
type CreateDelegatedTaskInput = Parameters<
  FileStoreRepository["createDelegatedTask"]
>[0];
type PaperListFilters = {
  query?: string;
  tag?: string;
  limit?: number;
  sourceType?: AgentPaper["sourceType"];
};

const DEFAULT_ACCOUNT_TOKEN_TTL_DAYS = 30;
const ONBOARDING_ACCOUNT_TOKEN_TTL_HOURS = 1;
const GOVERNANCE_SUPERMAJORITY_FRACTION = 2 / 3;

type CreateAccountAccessTokenOptions = {
  expiresAt?: Date;
  maxUses?: number;
};

const INTERNAL_AGENT_GUIDANCE_URL = new URL(
  "../../../AGENTS.md",
  import.meta.url,
);
const INTERNAL_RESEARCH_REFERENCES_URL = new URL(
  "../../../docs/internal/research-references.md",
  import.meta.url,
);
const DEFAULT_INTERNAL_AGENT_GUIDANCE = [
  "Prefer novelty, evidence, and manuscript quality over speed.",
  "Use multi-pass research loops instead of one-shot answers.",
  "Turn visuals, tables, equations, and linked evidence into section-level value when they sharpen the paper.",
].join("\n");
const DEFAULT_INTERNAL_RESEARCH_REFERENCES = [
  "Use this optional pack only for workflows that need explicit research-method guidance.",
  "Focus on contribution clarity, evidence appraisal, reviewer-style critique, and manuscript auditability.",
].join("\n");

let cachedInternalAgentGuidance: string | undefined;
let cachedInternalResearchReferences: string | undefined;

function getInternalAgentGuidance() {
  if (cachedInternalAgentGuidance !== undefined) {
    return cachedInternalAgentGuidance;
  }

  try {
    const guidance = readFileSync(INTERNAL_AGENT_GUIDANCE_URL, "utf8").trim();
    cachedInternalAgentGuidance = guidance || DEFAULT_INTERNAL_AGENT_GUIDANCE;
  } catch {
    cachedInternalAgentGuidance = DEFAULT_INTERNAL_AGENT_GUIDANCE;
  }

  return cachedInternalAgentGuidance;
}

function getInternalResearchReferences() {
  if (cachedInternalResearchReferences !== undefined) {
    return cachedInternalResearchReferences;
  }

  try {
    const references = readFileSync(
      INTERNAL_RESEARCH_REFERENCES_URL,
      "utf8",
    ).trim();
    cachedInternalResearchReferences =
      references || DEFAULT_INTERNAL_RESEARCH_REFERENCES;
  } catch {
    cachedInternalResearchReferences = DEFAULT_INTERNAL_RESEARCH_REFERENCES;
  }

  return cachedInternalResearchReferences;
}

export class GovernanceDecisionRequiredError extends Error {
  status = 409;
  workspaceId: string;
  decisionId: string;

  constructor(message: string, workspaceId: string, decisionId: string) {
    super(message);
    this.name = "GovernanceDecisionRequiredError";
    this.workspaceId = workspaceId;
    this.decisionId = decisionId;
  }
}

function createId(prefix: string, length = 10) {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, length)}`;
}

function addHours(value: Date, hours: number) {
  return new Date(value.getTime() + hours * 60 * 60 * 1000);
}

function arrayOrEmpty<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

type WorkspaceDocumentSectionTemplate = {
  id?: string;
  slotId?: string;
  title: string;
  role: string;
  pageHint?: number;
  content?: string;
};

const defaultProposalSectionTemplates: WorkspaceDocumentSectionTemplate[] = [
  {
    slotId: "problem",
    title: "Problem",
    role: "coordination",
    content: "",
  },
  {
    slotId: "approach",
    title: "Approach",
    role: "research",
    content: "",
  },
  {
    slotId: "collaboration-plan",
    title: "Collaboration Plan",
    role: "coordination",
    content: "",
  },
];

const defaultDraftSectionTemplates: WorkspaceDocumentSectionTemplate[] = [
  {
    slotId: "introduction",
    title: "Introduction",
    role: "writing",
  },
  {
    slotId: "related_work",
    title: "Related Work",
    role: "literature",
  },
  {
    slotId: "methodology",
    title: "Methodology",
    role: "research",
  },
  {
    slotId: "experimental_setup",
    title: "Experimental Setup",
    role: "research",
  },
  {
    slotId: "results",
    title: "Results",
    role: "review",
  },
  {
    slotId: "evaluation",
    title: "Evaluation and Discussion",
    role: "review",
  },
  {
    slotId: "conclusion",
    title: "Conclusion",
    role: "writing",
  },
];

const draftSectionTemplatesByTemplate: Record<
  "arxiv-labs-template" | "ieee-conference" | "acm-sigconf",
  WorkspaceDocumentSectionTemplate[]
> = {
  "arxiv-labs-template": [
    {
      slotId: "introduction",
      title: "Introduction",
      role: "writing",
    },
    {
      slotId: "related_work",
      title: "Related Work",
      role: "literature",
    },
    {
      slotId: "methodology",
      title: "Methodology",
      role: "research",
    },
    {
      slotId: "experimental_setup",
      title: "Experimental Setup",
      role: "research",
    },
    {
      slotId: "results_discussion",
      title: "Results and Discussion",
      role: "review",
    },
    {
      slotId: "conclusion",
      title: "Conclusion",
      role: "writing",
    },
  ],
  "ieee-conference": [
    {
      slotId: "introduction",
      title: "Introduction",
      role: "writing",
    },
    {
      slotId: "related_work",
      title: "Related Work",
      role: "literature",
    },
    {
      slotId: "methodology",
      title: "Methodology",
      role: "research",
    },
    {
      slotId: "experimental_setup",
      title: "Experimental Setup",
      role: "research",
    },
    {
      slotId: "results",
      title: "Results",
      role: "review",
    },
    {
      slotId: "conclusion",
      title: "Conclusion",
      role: "writing",
    },
  ],
  "acm-sigconf": [
    {
      slotId: "introduction",
      title: "Introduction",
      role: "writing",
    },
    {
      slotId: "related_work",
      title: "Related Work",
      role: "literature",
    },
    {
      slotId: "methodology",
      title: "Methodology",
      role: "research",
    },
    {
      slotId: "evaluation",
      title: "Evaluation",
      role: "review",
    },
    {
      slotId: "discussion",
      title: "Discussion",
      role: "review",
    },
    {
      slotId: "conclusion",
      title: "Conclusion",
      role: "writing",
    },
  ],
};

const SANDBOX_PROVIDER = "e2b-managed";
const SANDBOX_IDLE_TTL_MINUTES = 15;
const SANDBOX_MAX_AGE_MINUTES = 120;
const SANDBOX_MAX_ACTIVE_EXECUTIONS_PER_WORKSPACE = 3;
const SANDBOX_MAX_CHAIN_DEPTH = 6;
const SANDBOX_MAX_RUNTIME_MINUTES_PER_PROFILE_PER_WORKSPACE_PER_DAY = 120;
const sandboxBlockingStatuses = new Set<SandboxExecution["status"]>([
  "queued",
  "provisioning",
  "running",
]);

function getDefaultSectionTemplates(
  surface: WorkspaceDocument["surface"],
  templateId?: string,
) {
  if (surface === "proposal") {
    return defaultProposalSectionTemplates;
  }

  if (
    templateId === "arxiv-labs-template" ||
    templateId === "ieee-conference" ||
    templateId === "acm-sigconf"
  ) {
    return draftSectionTemplatesByTemplate[templateId];
  }

  return defaultDraftSectionTemplates;
}

function isImageLikeArtifactContent(value: string) {
  return /^(https?:\/\/\S+|\/\S+|data:image\/[a-zA-Z0-9.+-]+;base64,\S+)$/i.test(
    value.trim(),
  );
}

function formatCitationEntry(entry: CitationEntry) {
  const authors = entry.authors.join(", ");
  const venueLine = [entry.venue, String(entry.year)].filter(Boolean).join(", ");
  const source = entry.sourceUrl?.trim() ? ` ${entry.sourceUrl.trim()}` : "";

  return `${authors} (${entry.year}). ${entry.title}. ${venueLine}.${source}`.trim();
}

function escapeSvgText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function svgToDataUri(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

type DiagramTemplate = "architecture" | "pipeline" | "comparison";
type ChartTemplate = "benchmark_bar" | "ablation_bar";
type TableTemplate = "benchmark" | "dataset_summary" | "ablation" | "taxonomy";

const paperFigurePalette = {
  background: "#fffdfa",
  panel: "#f5efe6",
  border: "#d8cdbf",
  text: "#201a15",
  muted: "#6d655c",
  grid: "#d8d0c5",
  blue: "#4c72b0",
  teal: "#55a868",
  orange: "#dd8452",
  red: "#c44e52",
  purple: "#8172b2",
  gold: "#ccb974",
} as const;

const paperChartColors = [
  paperFigurePalette.blue,
  paperFigurePalette.teal,
  paperFigurePalette.orange,
  paperFigurePalette.red,
  paperFigurePalette.purple,
  paperFigurePalette.gold,
];

function inferDiagramTemplate(title: string): DiagramTemplate {
  const normalized = title.toLowerCase();

  if (/(comparison|versus|vs\.?)/.test(normalized)) {
    return "comparison";
  }

  if (/(pipeline|loop|workflow)/.test(normalized)) {
    return "pipeline";
  }

  return "architecture";
}

function inferChartTemplate(title: string): ChartTemplate {
  return /(ablation|failure|breakdown)/i.test(title) ? "ablation_bar" : "benchmark_bar";
}

function inferTableTemplate(title: string): TableTemplate {
  const normalized = title.toLowerCase();

  if (/(dataset|setup|materials|protocol)/.test(normalized)) {
    return "dataset_summary";
  }

  if (/(ablation|failure|sensitivity)/.test(normalized)) {
    return "ablation";
  }

  if (/(related work|motivation|taxonomy|comparison)/.test(normalized)) {
    return "taxonomy";
  }

  return "benchmark";
}

function wrapSvgLabel(value: string, maxLineLength = 18) {
  const words = value.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return [""];
  }

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length <= maxLineLength || !current) {
      current = candidate;
      continue;
    }

    lines.push(current);

    if (lines.length === 2) {
      current = `${word}${words.at(-1) === word ? "" : "..."}`;
      break;
    }

    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines.slice(0, 3);
}

function renderSvgMultilineLabel(input: {
  lines: string[];
  x: number;
  y: number;
  fontSize?: number;
  fontWeight?: number;
  fill?: string;
  lineHeight?: number;
}) {
  const lineHeight = input.lineHeight ?? 18;
  const firstY = input.y - ((input.lines.length - 1) * lineHeight) / 2;

  return `
    <text x="${input.x}" y="${firstY}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${input.fontSize ?? 15}" font-weight="${input.fontWeight ?? 600}" fill="${input.fill ?? paperFigurePalette.text}">
      ${input.lines
        .map(
          (line, index) =>
            `<tspan x="${input.x}" dy="${index === 0 ? 0 : lineHeight}">${escapeSvgText(line)}</tspan>`,
        )
        .join("")}
    </text>
  `;
}

function formatChartValue(value: number) {
  if (Number.isInteger(value)) {
    return String(value);
  }

  if (Math.abs(value) >= 10) {
    return value.toFixed(1).replace(/\.0$/, "");
  }

  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function estimateSvgLabelWidth(value: string) {
  return clampNumber(18 + value.trim().length * 6.4, 38, 140);
}

function renderSvgPillLabel(input: {
  text: string;
  centerX: number;
  centerY: number;
  accent: string;
}) {
  const width = estimateSvgLabelWidth(input.text);
  const height = 20;
  const x = Math.round(input.centerX - width / 2);
  const y = Math.round(input.centerY - height / 2);

  return `
    <g>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="10" fill="${paperFigurePalette.background}" stroke="${input.accent}" stroke-opacity="0.36" stroke-width="1" />
      <text x="${Math.round(input.centerX)}" y="${Math.round(input.centerY + 4)}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="11.5" font-weight="500" fill="${paperFigurePalette.muted}">${escapeSvgText(input.text)}</text>
    </g>
  `;
}

type DiagramLayout = {
  width: number;
  height: number;
  nodeWidth: number;
  nodeHeight: number;
  positions: Map<string, { x: number; y: number }>;
};

function buildLinearDiagramLayout(input: {
  nodes: string[];
  template: DiagramTemplate;
}) {
  const width = 860;
  const padding = input.template === "pipeline" ? 34 : 40;
  const gap = input.template === "pipeline" ? 16 : 18;
  const nodeWidth = clampNumber(
    Math.floor((width - padding * 2 - gap * (input.nodes.length - 1)) / input.nodes.length),
    118,
    146,
  );
  const nodeHeight = input.template === "pipeline" ? 62 : 64;
  const totalWidth =
    input.nodes.length * nodeWidth + (input.nodes.length - 1) * gap;
  const startX = Math.round((width - totalWidth) / 2);
  const y = input.template === "pipeline" ? 78 : 84;
  const height = input.template === "pipeline" ? 220 : 228;

  return {
    width,
    height,
    nodeWidth,
    nodeHeight,
    positions: new Map(
      input.nodes.map((node, index) => [
        node,
        {
          x: startX + index * (nodeWidth + gap),
          y,
        },
      ]),
    ),
  } satisfies DiagramLayout;
}

function buildArchitectureDiagramLayout(nodes: string[]) {
  if (nodes.length !== 5) {
    return buildLinearDiagramLayout({
      nodes,
      template: "architecture",
    });
  }

  const width = 860;
  const height = 316;
  const nodeWidth = 150;
  const nodeHeight = 62;

  return {
    width,
    height,
    nodeWidth,
    nodeHeight,
    positions: new Map([
      [nodes[0]!, { x: 46, y: 126 }],
      [nodes[1]!, { x: 236, y: 126 }],
      [nodes[2]!, { x: 500, y: 44 }],
      [nodes[3]!, { x: 500, y: 126 }],
      [nodes[4]!, { x: 500, y: 208 }],
    ]),
  } satisfies DiagramLayout;
}

function resolveDiagramLayout(input: {
  nodes: string[];
  template: DiagramTemplate;
}) {
  if (input.template === "architecture") {
    return buildArchitectureDiagramLayout(input.nodes);
  }

  return buildLinearDiagramLayout(input);
}

function buildDiagramEdge(input: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  nodeWidth: number;
  nodeHeight: number;
  accent: string;
  label?: string;
  index: number;
  dash?: string;
}) {
  const forward = input.to.x >= input.from.x;
  const fromAnchor = {
    x: forward ? input.from.x + input.nodeWidth : input.from.x,
    y: input.from.y + input.nodeHeight / 2,
  };
  const toAnchor = {
    x: forward ? input.to.x : input.to.x + input.nodeWidth,
    y: input.to.y + input.nodeHeight / 2,
  };

  let path = "";
  let labelX = Math.round((fromAnchor.x + toAnchor.x) / 2);
  let labelY = Math.round((fromAnchor.y + toAnchor.y) / 2) - 18;

  if (Math.abs(input.from.x - input.to.x) <= 4 && Math.abs(input.from.y - input.to.y) > 4) {
    const downward = input.to.y > input.from.y;
    const start = {
      x: input.from.x + input.nodeWidth / 2,
      y: downward ? input.from.y + input.nodeHeight : input.from.y,
    };
    const end = {
      x: input.to.x + input.nodeWidth / 2,
      y: downward ? input.to.y : input.to.y + input.nodeHeight,
    };
    path = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
    labelX = start.x + 38;
    labelY = Math.round((start.y + end.y) / 2);
  } else if (Math.abs(fromAnchor.y - toAnchor.y) <= 4) {
    path = `M ${fromAnchor.x} ${fromAnchor.y} L ${toAnchor.x} ${toAnchor.y}`;
    labelY = fromAnchor.y - 18 - (input.index % 2) * 16;
  } else if (forward) {
    const bendX = Math.round((fromAnchor.x + toAnchor.x) / 2);
    path = `M ${fromAnchor.x} ${fromAnchor.y} L ${bendX} ${fromAnchor.y} L ${bendX} ${toAnchor.y} L ${toAnchor.x} ${toAnchor.y}`;
    labelX = bendX;
    labelY = Math.min(fromAnchor.y, toAnchor.y) - 18;
  } else {
    const loopY = Math.max(fromAnchor.y, toAnchor.y) + 46;
    const startX = fromAnchor.x - 22;
    const endX = toAnchor.x + 22;
    path = `M ${fromAnchor.x} ${fromAnchor.y} L ${startX} ${fromAnchor.y} L ${startX} ${loopY} L ${endX} ${loopY} L ${endX} ${toAnchor.y} L ${toAnchor.x} ${toAnchor.y}`;
    labelX = Math.round((startX + endX) / 2);
    labelY = loopY - 12;
  }

  return {
    path: `<path d="${path}" fill="none" stroke="${input.accent}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" ${
      input.dash ? `stroke-dasharray="${input.dash}"` : ""
    } marker-end="url(#arrow)" />`,
    label: input.label
      ? renderSvgPillLabel({
          text: input.label,
          centerX: labelX,
          centerY: labelY,
          accent: input.accent,
        })
      : "",
  };
}

function normalizeTableCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function isNumericTableCell(value: string) {
  return /^[-+]?[\d.,]+(?:%|x)?$/i.test(value.trim());
}

function buildSectionArtifactRecommendation(title: string) {
  const normalized = title.toLowerCase();

  if (/(architecture|method|system)/.test(normalized)) {
    return {
      shouldHaveVisual: true,
      recommendedAssetType: "diagram" as const,
      recommendedAssetTemplate: "architecture" as const,
      artifactGuidance:
        "Use a caption-ready architecture diagram with 3-6 components, short node labels, and no large title embedded inside the figure.",
    };
  }

  if (/(pipeline|workflow|learning loop|feedback loop)/.test(normalized)) {
    return {
      shouldHaveVisual: true,
      recommendedAssetType: "diagram" as const,
      recommendedAssetTemplate: "pipeline" as const,
      artifactGuidance:
        "Use a left-to-right pipeline diagram that makes the feedback loop explicit and keeps labels short enough to scan at paper scale.",
    };
  }

  if (/(evaluation|results|experiment|benchmark)/.test(normalized)) {
    return {
      shouldHaveVisual: true,
      recommendedAssetType: "chart" as const,
      recommendedAssetTemplate: "benchmark_bar" as const,
      artifactGuidance:
        "Use a benchmark bar chart with a shared numeric axis, 3-6 conditions, muted colors, and caption-owned interpretation.",
    };
  }

  if (/(ablation|failure mode|sensitivity)/.test(normalized)) {
    return {
      shouldHaveVisual: true,
      recommendedAssetType: "chart" as const,
      recommendedAssetTemplate: "ablation_bar" as const,
      artifactGuidance:
        "Use an ablation chart that isolates one intervention per bar and makes the metric and baseline easy to compare.",
    };
  }

  if (/(related work|motivation|taxonomy|comparison)/.test(normalized)) {
    return {
      shouldHaveVisual: true,
      recommendedAssetType: "table" as const,
      recommendedAssetTemplate: "taxonomy" as const,
      artifactGuidance:
        "Use a compact taxonomy table comparing representative prior approaches across mechanism, evidence source, and limitation.",
    };
  }

  if (/(dataset|setup|materials|protocol)/.test(normalized)) {
    return {
      shouldHaveVisual: true,
      recommendedAssetType: "table" as const,
      recommendedAssetTemplate: "dataset_summary" as const,
      artifactGuidance:
        "Use a setup or dataset summary table with booktabs-style rules, sentence-case headers, and right-aligned numeric columns.",
    };
  }

  return {
    shouldHaveVisual: false,
    recommendedAssetType: undefined,
    recommendedAssetTemplate: undefined,
    artifactGuidance: undefined,
  };
}

function buildDiagramSvg(input: {
  title: string;
  template?: DiagramTemplate;
  nodes: string[];
  edges: Array<{ from: string; to: string; label?: string }>;
}) {
  const template = input.template ?? inferDiagramTemplate(input.title);
  const accent =
    template === "pipeline"
      ? paperFigurePalette.teal
      : template === "comparison"
        ? paperFigurePalette.purple
        : paperFigurePalette.blue;
  const layout = resolveDiagramLayout({
    nodes: input.nodes,
    template,
  });
  const edges = input.edges
    .map((edge, index) => {
      const from = layout.positions.get(edge.from);
      const to = layout.positions.get(edge.to);

      if (!from || !to) {
        return null;
      }

      return buildDiagramEdge({
        from,
        to,
        nodeWidth: layout.nodeWidth,
        nodeHeight: layout.nodeHeight,
        accent,
        label: edge.label,
        index,
        dash: template === "comparison" ? "7 5" : undefined,
      });
    })
    .filter(
      (edge): edge is { path: string; label: string } => edge !== null,
    );
  const edgePaths = edges.map((edge) => edge.path).join("");
  const edgeLabels = edges.map((edge) => edge.label).join("");
  const nodes = input.nodes
    .map((node, index) => {
      const position = layout.positions.get(node);

      if (!position) {
        return "";
      }

      const nodeLines = wrapSvgLabel(
        node,
        layout.nodeWidth < 130 ? 11 : layout.nodeWidth < 140 ? 13 : 15,
      );
      const fill =
        template === "comparison"
          ? index < Math.ceil(input.nodes.length / 2)
            ? "#eef3ff"
            : "#f4effa"
          : template === "pipeline"
            ? "#edf7f1"
            : "#eef3ff";

      return `
        <rect x="${position.x}" y="${position.y}" width="${layout.nodeWidth}" height="${layout.nodeHeight}" rx="14" fill="${fill}" stroke="${accent}" stroke-width="1.7" />
        ${renderSvgMultilineLabel({
          lines: nodeLines,
          x: position.x + layout.nodeWidth / 2,
          y: position.y + layout.nodeHeight / 2,
          fontSize: layout.nodeWidth < 130 ? 13 : 14,
          fontWeight: 600,
        })}
      `;
    })
    .join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="${escapeSvgText(input.title)}">
      <defs>
        <marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto">
          <path d="M0,0 L12,6 L0,12 z" fill="${accent}" />
        </marker>
      </defs>
      <rect x="1" y="1" width="${layout.width - 2}" height="${layout.height - 2}" fill="${paperFigurePalette.background}" stroke="${paperFigurePalette.border}" stroke-width="1.5" rx="18" />
      ${edgePaths}
      ${nodes}
      ${edgeLabels}
    </svg>
  `.trim();
}

function buildBarChartSvg(input: {
  title: string;
  template?: ChartTemplate;
  data: Array<{ label: string; value: number }>;
  xLabel?: string;
  yLabel?: string;
}) {
  const template = input.template ?? inferChartTemplate(input.title);
  const width = 840;
  const height = 430;
  const margin = { top: 28, right: 28, bottom: 104, left: 74 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(...input.data.map((datum) => datum.value), 1);
  const barGap = 16;
  const barWidth = Math.max(
    36,
    Math.floor((chartWidth - barGap * (input.data.length - 1)) / input.data.length),
  );
  const colors =
    template === "ablation_bar"
      ? [
          paperFigurePalette.orange,
          paperFigurePalette.red,
          paperFigurePalette.gold,
          paperFigurePalette.purple,
          paperFigurePalette.blue,
        ]
      : paperChartColors;
  const bars = input.data
    .map((datum, index) => {
      const barHeight = Math.round((datum.value / maxValue) * chartHeight);
      const x = margin.left + index * (barWidth + barGap);
      const y = margin.top + chartHeight - barHeight;
      const labelX = x + barWidth / 2;
      const labelLines = wrapSvgLabel(datum.label, 14);

      return `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="5" fill="${colors[index % colors.length]}" />
        <text x="${labelX}" y="${y - 8}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="${paperFigurePalette.text}">${formatChartValue(datum.value)}</text>
        ${renderSvgMultilineLabel({
          lines: labelLines,
          x: labelX,
          y: margin.top + chartHeight + 30,
          fontSize: 12,
          fontWeight: 500,
          fill: paperFigurePalette.muted,
          lineHeight: 15,
        })}
      `;
    })
    .join("");
  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = Math.round((maxValue / 4) * (4 - index));
    const y = margin.top + (chartHeight / 4) * index;

    return `
      <line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="${paperFigurePalette.grid}" stroke-width="1" />
      <text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="${paperFigurePalette.muted}">${formatChartValue(value)}</text>
    `;
  }).join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeSvgText(input.title)}">
      <rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="${paperFigurePalette.background}" stroke="${paperFigurePalette.border}" stroke-width="1.5" rx="18" />
      ${grid}
      <line x1="${margin.left}" y1="${margin.top + chartHeight}" x2="${width - margin.right}" y2="${margin.top + chartHeight}" stroke="${paperFigurePalette.text}" stroke-width="1.6" />
      <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + chartHeight}" stroke="${paperFigurePalette.text}" stroke-width="1.6" />
      ${bars}
      ${
        input.xLabel
          ? `<text x="${width / 2}" y="${height - 22}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="13" fill="${paperFigurePalette.muted}">${escapeSvgText(input.xLabel)}</text>`
          : ""
      }
      ${
        input.yLabel
          ? `<text x="22" y="${height / 2}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="13" fill="${paperFigurePalette.muted}" transform="rotate(-90 22 ${height / 2})">${escapeSvgText(input.yLabel)}</text>`
          : ""
      }
    </svg>
  `.trim();
}

function buildMarkdownTable(
  headers: string[],
  rows: string[][],
  template?: TableTemplate,
) {
  const resolvedTemplate = template ?? inferTableTemplate(headers.join(" "));
  const normalizedHeaders = headers.map((header) => normalizeTableCell(header));
  const normalizedRows = rows.map((row) =>
    normalizedHeaders.map((_, index) => normalizeTableCell(row[index] ?? "")),
  );
  const separatorLine = `| ${normalizedHeaders
    .map((_, index) => {
      const columnValues = normalizedRows
        .map((row) => row[index])
        .filter((value): value is string => Boolean(value && value.length > 0));
      const numericColumn =
        columnValues.length > 0 && columnValues.every((value) => isNumericTableCell(value));

      if (resolvedTemplate === "taxonomy") {
        return ":---";
      }

      return numericColumn ? "---:" : ":---";
    })
    .join(" | ")} |`;
  const headerLine = `| ${normalizedHeaders.join(" | ")} |`;
  const rowLines = rows.map((row) => {
    const padded = normalizedHeaders.map((_, index) =>
      normalizeTableCell(row[index] ?? ""),
    );
    return `| ${padded.join(" | ")} |`;
  });

  return [headerLine, separatorLine, ...rowLines].join("\n");
}

function isPublicPublishedPaper(paper: AgentPaper) {
  return paper.status === "published" && paper.visibility === "public";
}

class PrismaRuntimeRepository {
  private readonly prisma = getPrisma();

  getRegistrationEndpoint() {
    return process.env.AGENTARXIV_MCP_ENDPOINT ?? "http://localhost:4001/mcp";
  }

  private hashSecret(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }

  private createApiKey() {
    const plain = `agentarxiv_${randomUUID().replace(/-/g, "")}`;
    const hash = this.hashSecret(plain);
    return { plain, hash };
  }

  private createRecoveryKey() {
    const plain = `agentarxiv_recovery_${randomUUID().replace(/-/g, "")}`;
    const hash = this.hashSecret(plain);
    return { plain, hash };
  }

  private createAccountAccessTokenValue() {
    const plain = `agentarxiv_account_${randomUUID().replace(/-/g, "")}`;
    const hash = this.hashSecret(plain);
    return { plain, hash };
  }

  private formatCreatedAccountAccessToken(input: {
    token: string;
    createdAt: Date;
    expiresAt?: Date;
    maxUses?: number;
  }) {
    return {
      token: input.token,
      endpoint: this.getRegistrationEndpoint(),
      createdAt: input.createdAt.toISOString(),
      expiresAt: input.expiresAt?.toISOString(),
      maxUses: input.maxUses,
    };
  }

  private createAccountOnboardingTokenValue() {
    const plain = randomUUID().replace(/-/g, "");
    const hash = this.hashSecret(plain);
    return { plain, hash };
  }

  private createAccountOnboardingVerificationCode() {
    return randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  }

  private async findAccountOnboardingSessionByClaim(
    tx: Prisma.TransactionClient,
    sessionId: string,
    claimToken: string,
  ) {
    const session = await tx.accountOnboardingSession.findUnique({
      where: {
        id: sessionId,
      },
    });

    if (!session || session.claimTokenHash !== this.hashSecret(claimToken)) {
      throw new Error("Invalid account onboarding session");
    }

    return session;
  }

  private async findAccountOnboardingSessionByPoll(
    tx: Prisma.TransactionClient,
    sessionId: string,
    pollToken: string,
  ) {
    const session = await tx.accountOnboardingSession.findUnique({
      where: {
        id: sessionId,
      },
    });

    if (!session || session.pollTokenHash !== this.hashSecret(pollToken)) {
      throw new Error("Invalid account onboarding session");
    }

    return session;
  }

  private async expireAccountOnboardingSessionIfNeeded(
    tx: Prisma.TransactionClient,
    session: Awaited<
      ReturnType<Prisma.TransactionClient["accountOnboardingSession"]["findUnique"]>
    >,
  ) {
    if (!session) {
      throw new Error("Invalid account onboarding session");
    }

    if (session.status !== "pending") {
      return session;
    }

    if (session.expiresAt.getTime() > Date.now()) {
      return session;
    }

    return tx.accountOnboardingSession.update({
      where: {
        id: session.id,
      },
      data: {
        status: "expired",
      },
    });
  }

  private formatAccountOnboardingSession(
    session: {
      id: string;
      verificationCode: string;
      status: string;
      approvedAt: Date | null;
      completedAt: Date | null;
      createdAt: Date;
      expiresAt: Date;
    },
    extras?: {
      accountToken?: Awaited<ReturnType<PrismaRuntimeRepository["createAccountAccessToken"]>>;
      message?: string;
    },
  ) {
    return {
      sessionId: session.id,
      verificationCode: session.verificationCode,
      status: session.status as "pending" | "approved" | "completed" | "expired",
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      approvedAt: session.approvedAt?.toISOString(),
      completedAt: session.completedAt?.toISOString(),
      accountToken: extras?.accountToken,
      message: extras?.message,
    };
  }

  private async loadState() {
    return loadStateFromPrisma(this.prisma);
  }

  private async runWrite<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return this.prisma.$transaction(operation, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }

  private ensureWorkspaceNotebookState(
    state: AgentArxivState,
    workspaceId: string,
  ) {
    state.workspaceNotebooks ??= [];
    state.workspaceNotebookRevisions ??= [];
    state.workspaceNotebookLeases ??= [];
    state.workspaceEvidenceLinks ??= [];

    let changed = false;
    let notebook = state.workspaceNotebooks.find(
      (item) => item.workspaceId === workspaceId,
    );

    if (!notebook) {
      notebook = createEmptyWorkspaceNotebook(workspaceId);
      state.workspaceNotebooks.push(notebook);
      state.workspaceNotebookRevisions.push({
        id: createId("wnrev"),
        notebookId: notebook.id,
        workspaceId,
        revision: notebook.currentRevision,
        document: structuredClone(notebook.document),
        createdAt: notebook.createdAt,
      });
      changed = true;
    } else {
      const normalizedDocument = ensureWorkspaceNotebookDocumentDefaults(
        notebook.document,
        workspaceId,
      );

      if (normalizedDocument !== notebook.document) {
        notebook.document = normalizedDocument;
        notebook.updatedAt = new Date().toISOString();
        changed = true;
      }
    }

    let lease = state.workspaceNotebookLeases.find(
      (item) => item.workspaceId === workspaceId,
    );

    if (!lease) {
      lease = {
        id: createId("wnlease"),
        workspaceId,
        status: "idle",
        sequence: 0,
        queuedAgents: [],
        createdAt: notebook.createdAt,
        updatedAt: notebook.updatedAt,
      };
      state.workspaceNotebookLeases.push(lease);
      changed = true;
    }

    return {
      notebook,
      lease,
      evidence: state.workspaceEvidenceLinks.filter(
        (item) => item.workspaceId === workspaceId,
      ),
      changed,
    };
  }

  private async ensureWorkspaceNotebookTx(
    tx: Prisma.TransactionClient,
    state: AgentArxivState,
    workspaceId: string,
  ) {
    const existingNotebook = arrayOrEmpty(state.workspaceNotebooks).find(
      (item) => item.workspaceId === workspaceId,
    );
    const existingNotebookDocument = existingNotebook?.document;
    const existingNotebookUpdatedAt = existingNotebook?.updatedAt;
    const existingLease = arrayOrEmpty(state.workspaceNotebookLeases).find(
      (item) => item.workspaceId === workspaceId,
    );
    const ensured = this.ensureWorkspaceNotebookState(state, workspaceId);
    const notebookNeedsUpdate =
      Boolean(existingNotebook) &&
      (ensured.notebook.document !== existingNotebookDocument ||
        ensured.notebook.updatedAt !== existingNotebookUpdatedAt);

    if (!existingNotebook) {
      await tx.workspaceNotebook.create({
        data: {
          id: ensured.notebook.id,
          workspaceId: ensured.notebook.workspaceId,
          currentRevision: ensured.notebook.currentRevision,
          document: ensured.notebook.document as Prisma.InputJsonValue,
          createdAt: new Date(ensured.notebook.createdAt),
          updatedAt: new Date(ensured.notebook.updatedAt),
        },
      });
      await tx.workspaceNotebookRevision.create({
        data: {
          id: arrayOrEmpty(state.workspaceNotebookRevisions).find(
            (item) =>
              item.workspaceId === workspaceId &&
              item.notebookId === ensured.notebook.id &&
              item.revision === ensured.notebook.currentRevision,
          )!.id,
          notebookId: ensured.notebook.id,
          workspaceId,
          revision: ensured.notebook.currentRevision,
          document: ensured.notebook.document as Prisma.InputJsonValue,
          createdAt: new Date(ensured.notebook.createdAt),
        },
      });
    }

    if (notebookNeedsUpdate) {
      await this.updateWorkspaceNotebookTx(tx, ensured.notebook);
    }

    if (!existingLease) {
      await tx.workspaceNotebookLease.create({
        data: {
          id: ensured.lease.id,
          workspaceId: ensured.lease.workspaceId,
          status: ensured.lease.status,
          sequence: ensured.lease.sequence,
          holderAgentId: ensured.lease.holderAgentId,
          ownerClerkUserId: ensured.lease.ownerClerkUserId,
          activeExecutionId: ensured.lease.activeExecutionId,
          heartbeatAt: ensured.lease.heartbeatAt
            ? new Date(ensured.lease.heartbeatAt)
            : null,
          expiresAt: ensured.lease.expiresAt
            ? new Date(ensured.lease.expiresAt)
            : null,
          queuedAgents: ensured.lease.queuedAgents as Prisma.InputJsonValue,
          createdAt: new Date(ensured.lease.createdAt),
          updatedAt: new Date(ensured.lease.updatedAt),
        },
      });
    }

    return ensured;
  }

  private async updateWorkspaceNotebookTx(
    tx: Prisma.TransactionClient,
    notebook: WorkspaceNotebook,
  ) {
    await tx.workspaceNotebook.update({
      where: { id: notebook.id },
      data: {
        currentRevision: notebook.currentRevision,
        document: notebook.document as Prisma.InputJsonValue,
        updatedAt: new Date(notebook.updatedAt),
      },
    });
  }

  private async updateWorkspaceNotebookLeaseTx(
    tx: Prisma.TransactionClient,
    lease: WorkspaceNotebookLease,
  ) {
    await tx.workspaceNotebookLease.update({
      where: { id: lease.id },
      data: {
        status: lease.status,
        sequence: lease.sequence,
        holderAgentId: lease.holderAgentId,
        ownerClerkUserId: lease.ownerClerkUserId,
        activeExecutionId: lease.activeExecutionId,
        heartbeatAt: lease.heartbeatAt ? new Date(lease.heartbeatAt) : null,
        expiresAt: lease.expiresAt ? new Date(lease.expiresAt) : null,
        queuedAgents: lease.queuedAgents as Prisma.InputJsonValue,
        updatedAt: new Date(lease.updatedAt),
      },
    });
  }

  private getWorkspaceNotebookCell(
    notebook: WorkspaceNotebook,
    cellId: string,
  ) {
    const cell = notebook.document.cells.find((item) => item.id === cellId);

    if (!cell) {
      throw new Error(`Notebook cell ${cellId} not found`);
    }

    return cell;
  }

  private hasActiveNotebookExecution(
    state: AgentArxivState,
    lease: WorkspaceNotebookLease,
  ) {
    if (!lease.activeExecutionId) {
      return false;
    }

    const execution = state.sandboxExecutions.find(
      (item) => item.id === lease.activeExecutionId,
    );

    return Boolean(execution && sandboxBlockingStatuses.has(execution.status));
  }

  private getNotebookLeaseExpiryAt(now: string) {
    return new Date(new Date(now).getTime() + 2 * 60_000).toISOString();
  }

  private assignNotebookLeaseHolder(
    state: AgentArxivState,
    workspaceId: string,
    agentId: string,
    now: string,
  ) {
    const { lease } = this.ensureWorkspaceNotebookState(state, workspaceId);
    const { ownerClerkUserId } = this.assertSandboxEligibleAgent(state, agentId);

    lease.status = "held";
    lease.holderAgentId = agentId;
    lease.ownerClerkUserId = ownerClerkUserId;
    lease.activeExecutionId = undefined;
    lease.heartbeatAt = now;
    lease.expiresAt = this.getNotebookLeaseExpiryAt(now);
    lease.sequence += 1;
    lease.queuedAgents = lease.queuedAgents.filter((item) => item.agentId !== agentId);
    lease.updatedAt = now;

    return lease;
  }

  private releaseNotebookLeaseHolder(
    state: AgentArxivState,
    workspaceId: string,
    now: string,
  ) {
    const { lease } = this.ensureWorkspaceNotebookState(state, workspaceId);

    if (lease.queuedAgents.length > 0) {
      const nextAgent = lease.queuedAgents.shift();

      if (nextAgent) {
        return this.assignNotebookLeaseHolder(
          state,
          workspaceId,
          nextAgent.agentId,
          now,
        );
      }
    }

    lease.status = "idle";
    lease.holderAgentId = undefined;
    lease.ownerClerkUserId = undefined;
    lease.activeExecutionId = undefined;
    lease.heartbeatAt = undefined;
    lease.expiresAt = undefined;
    lease.updatedAt = now;
    return lease;
  }

  private normalizeWorkspaceNotebookLease(
    state: AgentArxivState,
    workspaceId: string,
    now: string,
  ) {
    const { lease } = this.ensureWorkspaceNotebookState(state, workspaceId);

    if (this.hasActiveNotebookExecution(state, lease)) {
      return lease;
    }

    if (lease.expiresAt && lease.expiresAt.localeCompare(now) <= 0) {
      return this.releaseNotebookLeaseHolder(state, workspaceId, now);
    }

    return lease;
  }

  private assertNotebookLeaseHolder(
    state: AgentArxivState,
    workspaceId: string,
    agentId: string,
    action: string,
  ) {
    const lease = this.normalizeWorkspaceNotebookLease(
      state,
      workspaceId,
      new Date().toISOString(),
    );

    if (lease.holderAgentId !== agentId) {
      throw new Error(
        `Agent ${agentId} does not hold the workspace notebook lease required to ${action}.`,
      );
    }

    return lease;
  }

  private validateNotebookDocumentMutation(
    currentDocument: WorkspaceNotebook["document"],
    nextDocument: WorkspaceNotebook["document"],
  ) {
    const nextCellsById = new Map(nextDocument.cells.map((cell) => [cell.id, cell]));

    for (const currentCell of currentDocument.cells) {
      if (currentCell.cell_type !== "code") {
        continue;
      }

      const wasExecuted =
        currentCell.execution_count !== null &&
        currentCell.execution_count !== undefined;
      const hasOutputs = (currentCell.outputs?.length ?? 0) > 0;

      if (!wasExecuted && !hasOutputs) {
        continue;
      }

      const nextCell = nextCellsById.get(currentCell.id);

      if (!nextCell) {
        throw new Error(
          `Executed notebook cell ${currentCell.id} is append-only and cannot be removed.`,
        );
      }

      if (
        nextCell.cell_type !== "code" ||
        getWorkspaceNotebookCellSource(nextCell) !==
          getWorkspaceNotebookCellSource(currentCell)
      ) {
        throw new Error(
          `Executed notebook cell ${currentCell.id} is append-only. Create a successor cell instead of editing prior code.`,
        );
      }
    }
  }

  private syncNotebookExecutionResultToState(
    state: AgentArxivState,
    execution: SandboxExecution,
    now: string,
    notebookCellOutputs?: WorkspaceNotebookCell["outputs"],
    notebookExecutionCount?: number | null,
  ) {
    if (!execution.notebookCellId) {
      return;
    }

    const { notebook, lease } = this.ensureWorkspaceNotebookState(
      state,
      execution.workspaceId,
    );
    const cell = notebook.document.cells.find(
      (item) => item.id === execution.notebookCellId,
    );

    if (!cell || cell.cell_type !== "code") {
      return;
    }

    const agentarxivMetadata =
      typeof cell.metadata.agentarxiv === "object" &&
      cell.metadata.agentarxiv !== null
        ? (cell.metadata.agentarxiv as Record<string, unknown>)
        : {};
    const previousExecutionId =
      typeof agentarxivMetadata.lastExecutionId === "string"
        ? agentarxivMetadata.lastExecutionId
        : undefined;
    const nextExecutionCount =
      previousExecutionId === execution.id
        ? cell.execution_count ?? 1
        : (cell.execution_count ?? 0) + 1;
    const normalizedOutputs =
      notebookCellOutputs && notebookCellOutputs.length > 0
        ? ensureWorkspaceNotebookOutputIds(
            notebookCellOutputs,
            execution.id,
            now,
          )
        : (() => {
            const fallbackOutputs: NonNullable<WorkspaceNotebookCell["outputs"]> = [];

            if (execution.stdout.trim()) {
              fallbackOutputs.push({
                id: `nout_${execution.id}_stdout`,
                output_type: "stream",
                name: "stdout",
                text: [execution.stdout],
                metadata: {
                  agentarxiv: {
                    executionId: execution.id,
                    persistedAt: now,
                  },
                },
              });
            }

            if (execution.stderr.trim()) {
              fallbackOutputs.push({
                id: `nout_${execution.id}_stderr`,
                output_type: "stream",
                name: "stderr",
                text: [execution.stderr],
                metadata: {
                  agentarxiv: {
                    executionId: execution.id,
                    persistedAt: now,
                  },
                },
              });
            }

            return fallbackOutputs;
          })();
    const outputIds = normalizedOutputs.map((output) => output.id);

    cell.execution_count = notebookExecutionCount ?? nextExecutionCount;
    cell.outputs = normalizedOutputs;
    cell.metadata = {
      ...cell.metadata,
      agentarxiv: {
        ...agentarxivMetadata,
        lastExecutionId: execution.id,
        lastExecutionStatus: execution.status,
        lastExecutedAt: execution.finishedAt ?? execution.updatedAt,
        lastExecutingAgentId: execution.agentId,
        outputIds,
      },
    };
    execution.notebookOutputIds = outputIds;
    notebook.updatedAt = now;

    if (
      lease.activeExecutionId === execution.id &&
      !sandboxBlockingStatuses.has(execution.status)
    ) {
      lease.activeExecutionId = undefined;
      lease.updatedAt = now;
    }
  }

  private findAccountAccessToken(state: AgentArxivState, token: string) {
    const tokenHash = this.hashSecret(token);
    const accessToken = state.accountAccessTokens.find(
      (item) => item.tokenHash === tokenHash,
    );

    if (!accessToken) {
      throw new Error("Invalid account token");
    }

    if (accessToken.revokedAt) {
      throw new Error("Invalid account token");
    }

    if (
      accessToken.expiresAt &&
      new Date(accessToken.expiresAt).getTime() <= Date.now()
    ) {
      throw new Error("Invalid account token");
    }

    if (
      accessToken.maxUses !== undefined &&
      accessToken.maxUses !== null &&
      (accessToken.useCount ?? 0) >= accessToken.maxUses
    ) {
      throw new Error("Invalid account token");
    }

    return accessToken;
  }

  private findAgent(state: AgentArxivState, agentId: string) {
    const agent = state.agents.find((item) => item.id === agentId);

    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    return agent;
  }

  private assertAccountOwnsAgent(
    state: AgentArxivState,
    ownerClerkUserId: string,
    agentId: string,
  ) {
    const agent = this.findAgent(state, agentId);

    if (agent.ownerClerkUserId !== ownerClerkUserId) {
      throw new Error(
        `Agent ${agentId} does not belong to the authenticated account`,
      );
    }

    return agent;
  }

  private findWorkspace(state: AgentArxivState, workspaceId: string) {
    const workspace = state.workspaces.find((item) => item.id === workspaceId);

    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    return workspace;
  }

  private findAccountBillingStatus(
    state: AgentArxivState,
    ownerClerkUserId: string,
  ) {
    return state.accountBillingStatuses.find(
      (item) => item.ownerClerkUserId === ownerClerkUserId,
    );
  }

  private buildAgentSandboxStatus(
    state: AgentArxivState,
    agent: AgentProfile,
  ): AgentSandboxStatus {
    if (!agent.ownerClerkUserId) {
      return {
        agentId: agent.id,
        sandboxEligibility: "unverified",
        verifiedProfile: false,
        ineligibilityReason:
          "This agent is not linked to a paid account profile.",
      };
    }

    const billingStatus = this.findAccountBillingStatus(
      state,
      agent.ownerClerkUserId,
    );

    if (!billingStatus) {
      return {
        agentId: agent.id,
        billingOwnerClerkUserId: agent.ownerClerkUserId,
        sandboxEligibility: "unverified",
        verifiedProfile: false,
        ineligibilityReason:
          "The owning profile does not have sandbox billing enabled.",
      };
    }

    const verified =
      billingStatus.billingState === "active" &&
      billingStatus.sandboxEligibility === "verified";
    const blocked =
      billingStatus.billingState === "past_due" ||
      billingStatus.billingState === "unpaid" ||
      billingStatus.sandboxEligibility === "blocked";

    return {
      agentId: agent.id,
      billingOwnerClerkUserId: agent.ownerClerkUserId,
      sandboxEligibility: verified
        ? "verified"
        : blocked
          ? "blocked"
          : "unverified",
      verifiedProfile: verified,
      ineligibilityReason: verified
        ? undefined
        : blocked
          ? "The owning profile is delinquent or blocked from sandbox usage."
          : "The owning profile does not have an active sandbox subscription.",
      billingStatus: {
        billingState: billingStatus.billingState,
        sandboxEligibility: billingStatus.sandboxEligibility,
        planName: billingStatus.planName,
        planLookupKey: billingStatus.planLookupKey,
        delinquentAt: billingStatus.delinquentAt,
      },
    };
  }

  private assertSandboxEligibleAgent(state: AgentArxivState, agentId: string) {
    const agent = this.findAgent(state, agentId);
    const sandboxStatus = this.buildAgentSandboxStatus(state, agent);

    if (!sandboxStatus.verifiedProfile || !sandboxStatus.billingOwnerClerkUserId) {
      throw new Error(
        sandboxStatus.ineligibilityReason ??
          `Agent ${agentId} is not eligible for sandbox execution`,
      );
    }

    return {
      agent,
      sandboxStatus,
      ownerClerkUserId: sandboxStatus.billingOwnerClerkUserId,
    };
  }

  private buildWorkspaceSandboxSummary(
    state: AgentArxivState,
    workspace: WorkspaceBrief,
  ): WorkspaceSandboxSummary {
    const sessions = state.sandboxSessions
      .filter((session) => session.workspaceId === workspace.id)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const recentExecutions = state.sandboxExecutions
      .filter((execution) => execution.workspaceId === workspace.id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 25);
    const linkedExecutionIds = new Set(
      arrayOrEmpty(state.workspaceEvidenceLinks)
        .filter((link) => link.workspaceId === workspace.id && link.status === "linked")
        .map((link) => link.executionId),
    );
    const blockingExecutionCount = recentExecutions.filter(
      (execution) =>
        sandboxBlockingStatuses.has(execution.status) &&
        linkedExecutionIds.has(execution.id),
    ).length;
    const memberEligibility = Object.fromEntries(
      workspace.memberAgentIds.map((agentId) => {
        const agent = this.findAgent(state, agentId);
        return [agentId, this.buildAgentSandboxStatus(state, agent)];
      }),
    ) as Record<string, AgentSandboxStatus>;
    const linkedEvidenceCount = arrayOrEmpty(state.workspaceEvidenceLinks).filter(
      (link) => link.workspaceId === workspace.id && link.status === "linked",
    ).length;
    const verifiedMemberCount = Object.values(memberEligibility).filter(
      (status) => status.verifiedProfile,
    ).length;
    const totalBilledRuntimeSeconds = state.sandboxExecutions
      .filter((execution) => execution.workspaceId === workspace.id)
      .reduce((total, execution) => total + execution.billedRuntimeSeconds, 0);
    const guidance: string[] = [];

    if (verifiedMemberCount === 0) {
      guidance.push(
        "No workspace member currently has verified sandbox access. If the paper depends on experiments or benchmarks, bring in at least one verified agent profile before finalizing the evaluation plan.",
      );
    } else {
      guidance.push(
        "Verified workspace members can use the shared sandbox and notebook to run experiments, collect benchmark outputs, and turn those runs into manuscript evidence.",
      );
    }

    if (linkedEvidenceCount === 0) {
      guidance.push(
        "No sandbox evidence is linked yet. Prefer linking notebook outputs or execution artifacts to the sections that cite the results.",
      );
    }

    if (blockingExecutionCount > 0) {
      guidance.push(
        "Linked sandbox jobs are still running. Wait for them to finish before advancing the workspace run or locking the final claims.",
      );
    }

    return {
      workspaceId: workspace.id,
      activeSessionCount: sessions.filter((session) => session.status === "ready")
        .length,
      activeExecutionCount: recentExecutions.filter((execution) =>
        sandboxBlockingStatuses.has(execution.status),
      ).length,
      blockingExecutionCount,
      hasBlockingJobs: blockingExecutionCount > 0,
      totalBilledRuntimeSeconds,
      sessions,
      recentExecutions,
      memberEligibility,
      guidance,
    };
  }

  private assertWorkspaceSandboxCapacity(state: AgentArxivState, workspaceId: string) {
    const activeExecutionCount = state.sandboxExecutions.filter(
      (execution) =>
        execution.workspaceId === workspaceId &&
        sandboxBlockingStatuses.has(execution.status),
    ).length;

    if (activeExecutionCount >= SANDBOX_MAX_ACTIVE_EXECUTIONS_PER_WORKSPACE) {
      throw new Error(
        `Workspace ${workspaceId} already has the maximum number of active sandbox executions.`,
      );
    }
  }

  private assertSandboxExecutionCaps(
    state: AgentArxivState,
    input: CreateSandboxExecutionInput,
    ownerClerkUserId: string,
  ) {
    this.assertWorkspaceSandboxCapacity(state, input.workspaceId);

    if (input.parentExecutionId) {
      const parent = state.sandboxExecutions.find(
        (execution) => execution.id === input.parentExecutionId,
      );

      if (!parent) {
        throw new Error(`Sandbox execution ${input.parentExecutionId} not found`);
      }

      if (parent.workspaceId !== input.workspaceId || parent.agentId !== input.agentId) {
        throw new Error(
          "Follow-up executions must stay within the same workspace and agent session.",
        );
      }

      if (parent.chainDepth + 1 >= SANDBOX_MAX_CHAIN_DEPTH) {
        throw new Error("Sandbox follow-up limit reached for this execution chain.");
      }
    }

    const recentRuntimeSeconds = state.sandboxExecutions
      .filter(
        (execution) =>
          execution.workspaceId === input.workspaceId &&
          execution.ownerClerkUserId === ownerClerkUserId,
      )
      .filter(
        (execution) =>
          new Date(execution.createdAt).getTime() >=
          Date.now() - 24 * 60 * 60 * 1000,
      )
      .reduce((total, execution) => total + execution.billedRuntimeSeconds, 0);

    if (
      recentRuntimeSeconds >=
      SANDBOX_MAX_RUNTIME_MINUTES_PER_PROFILE_PER_WORKSPACE_PER_DAY * 60
    ) {
      throw new Error(
        "The paid profile has reached its sandbox runtime cap for this workspace.",
      );
    }
  }

  private maybeFindWorkspaceDocument(
    state: AgentArxivState,
    workspaceId: string,
    surface: WorkspaceDocument["surface"],
  ) {
    return state.workspaceDocuments.find(
      (item) => item.workspaceId === workspaceId && item.surface === surface,
    );
  }

  private findWorkspaceDocument(
    state: AgentArxivState,
    workspaceId: string,
    surface: WorkspaceDocument["surface"],
  ) {
    const document = this.maybeFindWorkspaceDocument(
      state,
      workspaceId,
      surface,
    );

    if (!document) {
      throw new Error(
        `Workspace ${workspaceId} is missing its ${surface} document`,
      );
    }

    return document;
  }

  private findSection(
    state: AgentArxivState,
    workspaceId: string,
    sectionId: string,
  ) {
    const section = state.sections.find(
      (item) => item.workspaceId === workspaceId && item.id === sectionId,
    );

    if (!section) {
      throw new Error(`Section ${sectionId} not found`);
    }

    return section;
  }

  private normalizeWorkspaceSlug(value: string) {
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return (
      normalized ||
      `workspace-${randomUUID().replace(/-/g, "").slice(0, 6).toLowerCase()}`
    );
  }

  private createUniqueWorkspaceSlug(state: AgentArxivState, value: string) {
    const baseSlug = this.normalizeWorkspaceSlug(value);

    if (!state.workspaces.some((workspace) => workspace.slug === baseSlug)) {
      return baseSlug;
    }

    let suffix = 2;

    while (
      state.workspaces.some(
        (workspace) => workspace.slug === `${baseSlug}-${suffix}`,
      )
    ) {
      suffix += 1;
    }

    return `${baseSlug}-${suffix}`;
  }

  private createWorkspaceDocumentSections(input: {
    workspaceId: string;
    surface: WorkspaceDocument["surface"];
    templateId?: string;
    sectionSpecs?: Array<{
      id?: string;
      slotId?: string;
      title: string;
      role: string;
      pageHint?: number;
      content?: string;
    }>;
    now: string;
  }): WorkspaceDocumentSection[] {
    const defaultSpecs = getDefaultSectionTemplates(
      input.surface,
      input.templateId,
    );
    const sectionSpecs =
      input.sectionSpecs && input.sectionSpecs.length > 0
        ? input.sectionSpecs
        : defaultSpecs;

    return sectionSpecs.map((section, index) => {
      const slotId =
        section.slotId?.trim() ||
        this.normalizeWorkspaceSlug(section.title).replace(/-/g, "_") ||
        `section_${index + 1}`;
      const sectionId =
        section.id?.trim() ||
        `${input.workspaceId}_${input.surface}_${slotId}`.replace(/-/g, "_");

      return {
        id: sectionId,
        workspaceId: input.workspaceId,
        surface: input.surface,
        slotId,
        title: section.title.trim(),
        role: section.role.trim(),
        pageHint: section.pageHint,
        content: section.content?.trim() ?? "",
        createdAt: input.now,
        updatedAt: input.now,
      };
    });
  }

  private buildWorkspaceDocumentAuthors(
    state: AgentArxivState,
    workspaceId: string,
    memberAgentIds: string[],
    seededAuthors: WorkspaceDocument["authors"] = [],
  ) {
    const authors =
      seededAuthors.length > 0
        ? seededAuthors
        : memberAgentIds
            .flatMap((agentId) => {
              const author = this.buildWorkspaceDocumentAuthor(state, agentId);
              return author ? [author] : [];
            });

    return assignWorkspacePaperAuthorAccents(workspaceId, authors);
  }

  private resolveWorkspaceScopedAgentAccent(
    state: AgentArxivState,
    workspaceId: string,
    agentId: string,
    fallbackAccent: string,
  ) {
    const sourceDocument =
      state.workspaceDocuments.find(
        (document) =>
          document.workspaceId === workspaceId && document.surface === "draft",
      ) ??
      state.workspaceDocuments.find(
        (document) =>
          document.workspaceId === workspaceId && document.surface === "proposal",
      ) ??
      state.workspaceDocuments.find(
        (document) => document.workspaceId === workspaceId,
      );

    if (!sourceDocument) {
      return fallbackAccent;
    }

    const normalizedAuthors = assignWorkspacePaperAuthorAccents(
      workspaceId,
      sourceDocument.authors,
    );
    const matchingAuthor = normalizedAuthors.find(
      (author) => author.id === agentId,
    );

    return matchingAuthor?.accent?.trim() || fallbackAccent;
  }

  private buildWorkspaceDocumentAuthor(
    state: AgentArxivState,
    agentId: string,
  ): WorkspaceDocument["authors"][number] | undefined {
    const agent = state.agents.find((candidate) => candidate.id === agentId);

    if (!agent) {
      return undefined;
    }

    return {
      id: agent.id,
      name: agent.displayName,
      affiliation: "AgentArXiv",
      location: "Remote",
      email: `${agent.handle}@agentarxiv.local`,
    } satisfies WorkspaceDocument["authors"][number];
  }

  private reconcileWorkspaceDocumentAuthors(
    state: AgentArxivState,
    workspaceId: string,
    memberAgentIds: string[],
    authors: WorkspaceDocument["authors"],
  ): WorkspaceDocument["authors"] {
    const nextAuthors = [...authors];
    const authorIds = new Set(
      nextAuthors
        .map((author) => author.id)
        .filter((authorId): authorId is string => Boolean(authorId)),
    );

    for (const memberAgentId of memberAgentIds) {
      if (authorIds.has(memberAgentId)) {
        continue;
      }

      const author = this.buildWorkspaceDocumentAuthor(state, memberAgentId);

      if (!author) {
        continue;
      }

      nextAuthors.push(author);
      authorIds.add(memberAgentId);
    }

    return assignWorkspacePaperAuthorAccents(workspaceId, nextAuthors);
  }

  private workspaceDocumentAuthorsNeedSync(
    state: AgentArxivState,
    workspace: WorkspaceBrief,
  ) {
    return state.workspaceDocuments
      .filter((document) => document.workspaceId === workspace.id)
      .some((document) => {
        const nextAuthors = this.reconcileWorkspaceDocumentAuthors(
          state,
          workspace.id,
          workspace.memberAgentIds,
          document.authors,
        );

        return JSON.stringify(document.authors) !== JSON.stringify(nextAuthors);
      });
  }

  private async syncWorkspaceDocumentAuthorsTx(
    tx: Prisma.TransactionClient,
    state: AgentArxivState,
    workspace: WorkspaceBrief,
    now: string,
  ) {
    for (const document of state.workspaceDocuments.filter(
      (candidate) => candidate.workspaceId === workspace.id,
    )) {
      const nextAuthors = this.reconcileWorkspaceDocumentAuthors(
        state,
        workspace.id,
        workspace.memberAgentIds,
        document.authors,
      );

      if (JSON.stringify(document.authors) === JSON.stringify(nextAuthors)) {
        continue;
      }

      await tx.workspaceDocument.update({
        where: {
          id: document.id,
        },
        data: {
          authors: nextAuthors as Prisma.InputJsonValue,
          updatedAt: new Date(now),
        },
      });
    }
  }

  private async ensureWorkspaceProposalDocumentTx(
    tx: Prisma.TransactionClient,
    state: AgentArxivState,
    workspace: WorkspaceBrief,
    now: string,
  ) {
    if (this.maybeFindWorkspaceDocument(state, workspace.id, "proposal")) {
      return false;
    }

    const primaryPaperTitle =
      this.maybeFindWorkspaceDocument(state, workspace.id, "draft")?.paperTitle ??
      workspace.title;
    const proposalDocument = this.buildWorkspaceDocument({
      state,
      workspaceId: workspace.id,
      surface: "proposal",
      title: "Proposal",
      paperTitle: primaryPaperTitle,
      templateId: workspace.templateName,
      memberAgentIds: workspace.memberAgentIds,
      now,
    });

    await tx.workspaceDocument.create({
      data: {
        id: proposalDocument.id,
        workspaceId: proposalDocument.workspaceId,
        surface: proposalDocument.surface,
        title: proposalDocument.title,
        paperTitle: proposalDocument.paperTitle,
        templateId: proposalDocument.templateId,
        authors: proposalDocument.authors as Prisma.InputJsonValue,
        abstractText: proposalDocument.abstractText,
        keywords: proposalDocument.keywords,
        references: proposalDocument.references,
        sectionOrder: proposalDocument.sectionOrder,
        createdAt: new Date(proposalDocument.createdAt),
        updatedAt: new Date(proposalDocument.updatedAt),
      },
    });
    await tx.workspaceDocumentSection.createMany({
      data: proposalDocument.sections.map((section) => ({
        id: section.id,
        documentId: proposalDocument.id,
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
    });

    return true;
  }

  private buildWorkspaceDocument(input: {
    state: AgentArxivState;
    workspaceId: string;
    surface: WorkspaceDocument["surface"];
    title: string;
    paperTitle: string;
    templateId: string;
    memberAgentIds: string[];
    now: string;
    seed?: {
      paperTitle?: string;
      abstractText?: string;
      keywords?: string[];
      references?: string[];
      authors?: WorkspaceDocument["authors"];
      sections?: Array<{
        id?: string;
        slotId?: string;
        title: string;
        role: string;
        pageHint?: number;
        content?: string;
      }>;
    };
  }): WorkspaceDocument {
    const sections = this.createWorkspaceDocumentSections({
      workspaceId: input.workspaceId,
      surface: input.surface,
      templateId: input.templateId,
      sectionSpecs: input.seed?.sections,
      now: input.now,
    });

    return {
      id: `doc_${input.workspaceId}_${input.surface}`.replace(/-/g, "_"),
      workspaceId: input.workspaceId,
      surface: input.surface,
      title: input.title,
      paperTitle: input.seed?.paperTitle?.trim() || input.paperTitle,
      templateId: input.templateId,
      authors: this.buildWorkspaceDocumentAuthors(
        input.state,
        input.workspaceId,
        input.memberAgentIds,
        input.seed?.authors,
      ),
      abstractText: input.seed?.abstractText?.trim() || undefined,
      keywords: arrayOrEmpty(input.seed?.keywords),
      references: arrayOrEmpty(input.seed?.references),
      sectionOrder: sections.map((section) => section.id),
      sections,
      createdAt: input.now,
      updatedAt: input.now,
    };
  }

  private buildWorkspaceDraftSections(
    document: WorkspaceDocument,
  ): WorkspaceSection[] {
    return document.sections.map((section) => ({
      id: section.id,
      workspaceId: document.workspaceId,
      title: section.title,
      role: section.role,
      claimedByAgentId: section.agentId,
      content: section.content,
      rationale: "",
      citedKeys: [],
      artifactRefs: [],
      skillIds: [],
      status: section.content.trim() ? "draft" : "unclaimed",
      updatedAt: section.updatedAt,
    }));
  }

  private buildDraftRun(workspace: WorkspaceBrief, now: string): Run {
    const runId = createId("run");

    return {
      id: runId,
      workspaceId: workspace.id,
      status: "running",
      currentStage: "drafting",
      startedAt: now,
      updatedAt: now,
      steps: [
        {
          id: createId("step", 8),
          runId,
          stage: "section_writing",
          agentRole: "writing",
          status: "running",
          summary:
            "Drafting has started and workspace members are filling manuscript sections.",
          startedAt: now,
        },
      ],
    };
  }

  private draftDocumentIsComplete(
    state: AgentArxivState,
    workspaceId: string,
  ) {
    const draftDocument = this.findWorkspaceDocument(state, workspaceId, "draft");
    const sectionsById = new Map(
      state.sections
        .filter((section) => section.workspaceId === workspaceId)
        .map((section) => [section.id, section]),
    );

    return (
      Boolean(draftDocument.abstractText?.trim()) &&
      draftDocument.sections.length > 0 &&
      draftDocument.sections.every((section) => {
        const workspaceSection = sectionsById.get(section.id);

        return (
          section.content.trim().length > 0 &&
          workspaceSection?.status === "accepted"
        );
      })
    );
  }

  private buildDraftDocumentReferences(
    state: AgentArxivState,
    workspaceId: string,
    citedKeyOverrides = new Map<string, string[]>(),
  ) {
    const registry = state.citationRegistries.find(
      (item) => item.workspaceId === workspaceId,
    );

    if (!registry) {
      return [];
    }

    const draftDocument = this.findWorkspaceDocument(state, workspaceId, "draft");
    const sectionStateById = new Map(
      state.sections
        .filter((section) => section.workspaceId === workspaceId)
        .map((section) => [section.id, section]),
    );
    const citedKeys: string[] = [];
    const seenKeys = new Set<string>();

    for (const sectionId of draftDocument.sectionOrder) {
      const keys =
        citedKeyOverrides.get(sectionId) ??
        sectionStateById.get(sectionId)?.citedKeys ??
        [];

      for (const key of keys) {
        const normalized = key.trim();

        if (!normalized || seenKeys.has(normalized)) {
          continue;
        }

        seenKeys.add(normalized);
        citedKeys.push(normalized);
      }
    }

    const papersByKey = new Map(registry.papers.map((paper) => [paper.key, paper]));

    return citedKeys
      .map((key) => papersByKey.get(key))
      .filter((entry): entry is CitationEntry => Boolean(entry))
      .map(formatCitationEntry);
  }

  private renderWorkspaceSectionArtifacts(
    state: AgentArxivState,
    workspaceSection?: WorkspaceSection,
  ) {
    if (!workspaceSection) {
      return "";
    }

    const artifactsById = new Map(
      state.artifacts
        .filter((artifact) => artifact.workspaceId === workspaceSection.workspaceId)
        .map((artifact) => [artifact.id, artifact]),
    );

    return workspaceSection.artifactRefs
      .map((artifactId) => artifactsById.get(artifactId))
      .filter((artifact): artifact is Artifact => Boolean(artifact))
      .map((artifact) => {
        const content = artifact.content.trim();

        if (
          (artifact.type === "figure" ||
            artifact.type === "diagram" ||
            artifact.type === "chart") &&
          isImageLikeArtifactContent(content)
        ) {
          const label =
            artifact.type === "diagram"
              ? "Diagram"
              : artifact.type === "chart"
                ? "Chart"
                : "Figure";

          return `![${artifact.title}](${content})\n\n${label}: ${artifact.title}`;
        }

        if (
          artifact.type === "figure" ||
          artifact.type === "diagram" ||
          artifact.type === "chart"
        ) {
          const label =
            artifact.type === "diagram"
              ? "Diagram"
              : artifact.type === "chart"
                ? "Chart"
                : "Figure";

          return `### ${label}: ${artifact.title}\n\n${content}`;
        }

        if (artifact.type === "table") {
          return `### Table: ${artifact.title}\n\n${content}`;
        }

        return `### ${artifact.title}\n\n${content}`;
      })
      .filter(Boolean)
      .join("\n\n");
  }

  private resolveWorkspacePaperPreviewImagePath(
    state: AgentArxivState,
    workspaceId: string,
  ) {
    const draftDocument = this.findWorkspaceDocument(state, workspaceId, "draft");
    const sectionsById = new Map(
      state.sections
        .filter((section) => section.workspaceId === workspaceId)
        .map((section) => [section.id, section]),
    );
    const artifactsById = new Map(
      state.artifacts
        .filter((artifact) => artifact.workspaceId === workspaceId)
        .map((artifact) => [artifact.id, artifact]),
    );

    for (const sectionId of draftDocument.sectionOrder) {
      const section = sectionsById.get(sectionId);

      if (!section) {
        continue;
      }

      for (const artifactRef of section.artifactRefs) {
        const artifact = artifactsById.get(artifactRef);
        const content = artifact?.content.trim() ?? "";

        if (
          (artifact?.type === "figure" ||
            artifact?.type === "diagram" ||
            artifact?.type === "chart") &&
          isImageLikeArtifactContent(content)
        ) {
          return content;
        }
      }
    }

    return undefined;
  }

  private buildWorkspaceManuscriptReport(
    state: AgentArxivState,
    workspaceId: string,
  ) {
    const workspace = this.findWorkspace(state, workspaceId);
    const draftDocument = this.findWorkspaceDocument(state, workspaceId, "draft");
    const workspaceSections = state.sections.filter(
      (section) => section.workspaceId === workspaceId,
    );
    const artifacts = state.artifacts.filter(
      (artifact) => artifact.workspaceId === workspaceId,
    );
    const sectionIds = new Set(draftDocument.sectionOrder);
    const sectionArtifacts = workspaceSections.flatMap((section) => section.artifactRefs);
    const linkedArtifactIds = new Set(sectionArtifacts);
    const sandbox = this.buildWorkspaceSandboxSummary(state, workspace);
    const linkedEvidenceCount = arrayOrEmpty(state.workspaceEvidenceLinks).filter(
      (link) => link.workspaceId === workspaceId && link.status === "linked",
    ).length;
    const verifiedMemberCount = Object.values(sandbox.memberEligibility).filter(
      (status) => status.verifiedProfile,
    ).length;
    const figureCount = artifacts.filter((artifact) => artifact.type === "figure").length;
    const diagramCount = artifacts.filter((artifact) => artifact.type === "diagram").length;
    const chartCount = artifacts.filter((artifact) => artifact.type === "chart").length;
    const tableCount = artifacts.filter((artifact) => artifact.type === "table").length;
    const acceptedSectionCount = workspaceSections.filter(
      (section) => section.status === "accepted" && section.content.trim().length > 0,
    ).length;
    const linkedAssetCount = artifacts.filter((artifact) =>
      linkedArtifactIds.has(artifact.id),
    ).length;
    const orphanAssetCount = Math.max(0, artifacts.length - linkedAssetCount);
    const referenceCount = draftDocument.references.length;
    const sectionCoverage =
      draftDocument.sections.length > 0
        ? acceptedSectionCount / draftDocument.sections.length
        : 0;
    const assetCoverage =
      Math.min(linkedAssetCount, Math.max(1, draftDocument.sections.length / 2)) /
      Math.max(1, Math.max(1, draftDocument.sections.length / 2));
    const visualCoverage = Math.min(1, (figureCount + diagramCount + chartCount) / 2);
    const evidenceCoverage = Math.min(1, referenceCount / 6);
    const score = Number(
      (
        (draftDocument.abstractText?.trim() ? 0.15 : 0) +
        sectionCoverage * 0.35 +
        evidenceCoverage * 0.2 +
        visualCoverage * 0.15 +
        Math.min(1, tableCount) * 0.05 +
        assetCoverage * 0.1
      ).toFixed(2)
    );
    const recommendedActions: string[] = [];
    const rewardSignals: string[] = [];

    if (!draftDocument.abstractText?.trim()) {
      recommendedActions.push("Add a concrete abstract before publish.");
    }

    if (acceptedSectionCount < draftDocument.sections.length) {
      recommendedActions.push("Get every draft section accepted before publish.");
    }

    if (referenceCount < 4) {
      recommendedActions.push(
        "Attach more cited papers so the manuscript carries a stronger references section.",
      );
    }

    const titles = draftDocument.sections.map((section) => section.title.toLowerCase());
    const hasArchitectureSection = titles.some((title) =>
      /(architecture|method|system|pipeline)/.test(title),
    );
    const hasEvaluationSection = titles.some((title) =>
      /(evaluation|results|experiment|benchmark)/.test(title),
    );
    const technicalSections = draftDocument.sections.filter((section) =>
      /(method|analysis|objective|loss|derivation|model|theory|algorithm)/.test(
        section.title.toLowerCase(),
      ),
    );
    const technicalSectionWithFormulaCount = technicalSections.filter((section) =>
      /(\$\$[\s\S]+?\$\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]|\\begin\{(?:equation\*?|align\*?|alignat\*?|gather\*?|CD)\}[\s\S]+?\\end\{(?:equation\*?|align\*?|alignat\*?|gather\*?|CD)\})/.test(
        section.content ?? "",
      ),
    ).length;

    if (technicalSections.length > 0 && technicalSectionWithFormulaCount === 0) {
      recommendedActions.push(
        "If the method or analysis depends on an objective, update rule, likelihood, or scaling relation, add at least one rendered equation and verify it against sources or sandbox/notebook checks.",
      );
    } else if (technicalSectionWithFormulaCount > 0) {
      rewardSignals.push(
        "Well-explained equations rendered in the manuscript make technical claims easier to audit, especially when the notation matches linked evidence or notebook checks.",
      );
    }

    if (hasArchitectureSection && figureCount + diagramCount === 0) {
      recommendedActions.push(
        "Add at least one architecture or pipeline diagram for the system or method sections.",
      );
      rewardSignals.push(
        "Paper-style architecture diagrams with short labels and caption-owned titles raise manuscript readiness and make the public preview stronger.",
      );
    }

    if (hasEvaluationSection && chartCount + tableCount === 0) {
      recommendedActions.push(
        "Add at least one benchmark chart or results table for evaluation/results sections.",
      );
      rewardSignals.push(
        "Evaluation charts and booktabs-style tables improve evidence quality and review readiness.",
      );
    }

    if (hasEvaluationSection && verifiedMemberCount === 0) {
      recommendedActions.push(
        "If the paper depends on benchmark or experiment claims, bring in at least one verified agent profile so the team can run sandbox-backed evaluations.",
      );
    }

    if (hasEvaluationSection && verifiedMemberCount > 0 && linkedEvidenceCount === 0) {
      recommendedActions.push(
        "Run at least one sandbox-backed benchmark or notebook experiment and link the resulting evidence to the evaluation/results sections.",
      );
      rewardSignals.push(
        "Sandbox-backed benchmarks and linked notebook evidence make evaluation claims more credible than text-only summaries.",
      );
    } else if (linkedEvidenceCount > 0) {
      rewardSignals.push(
        "Linked sandbox evidence gives reviewers a concrete trace from experiment output to manuscript claim.",
      );
    }

    if (linkedAssetCount === 0) {
      recommendedActions.push(
        "Link generated manuscript assets to the relevant sections through artifactRefs.",
      );
    }

    if (!rewardSignals.length) {
      rewardSignals.push(
        "Linked paper-style diagrams, charts, and tables improve manuscript readiness score and public paper quality.",
      );
    }

    rewardSignals.push(
      "Use caption-ready assets: no oversized titles inside figures, consistent typography, and numeric tables aligned for scanning.",
    );

    return {
      workspaceId,
      paperTitle: draftDocument.paperTitle,
      stage: workspace.stage,
      score,
      checklist: {
        hasAbstract: Boolean(draftDocument.abstractText?.trim()),
        acceptedSectionCount,
        totalSectionCount: draftDocument.sections.length,
        referenceCount,
        figureCount,
        diagramCount,
        chartCount,
        tableCount,
        linkedAssetCount,
        orphanAssetCount,
        hasPreviewImage: Boolean(
          this.resolveWorkspacePaperPreviewImagePath(state, workspaceId),
        ),
      },
      recommendedActions,
      rewardSignals,
      sections: draftDocument.sections.map((section) => {
        const workspaceSection = workspaceSections.find((item) => item.id === section.id);
        const artifactCount = workspaceSection?.artifactRefs.length ?? 0;
        const recommendation = buildSectionArtifactRecommendation(section.title);

        return {
          id: section.id,
          title: section.title,
          status: workspaceSection?.status ?? "unclaimed",
          artifactCount,
          shouldHaveVisual: recommendation.shouldHaveVisual,
          recommendedAssetType: recommendation.recommendedAssetType,
          recommendedAssetTemplate: recommendation.recommendedAssetTemplate,
          artifactGuidance: recommendation.artifactGuidance,
        };
      }),
      availableAssets: artifacts.map((artifact) => ({
        id: artifact.id,
        type: artifact.type,
        title: artifact.title,
        linked: linkedArtifactIds.has(artifact.id),
      })),
    };
  }

  private renderWorkspacePaperContent(
    state: AgentArxivState,
    workspace: WorkspaceBrief,
    document: WorkspaceDocument,
  ) {
    const authorLine =
      document.authors.length > 0
        ? document.authors.map((author) => author.name).join(", ")
        : "";
    const abstractBlock = document.abstractText?.trim()
      ? `## Abstract\n\n${document.abstractText.trim()}`
      : "";
    const workspaceSectionsById = new Map(
      state.sections
        .filter((section) => section.workspaceId === workspace.id)
        .map((section) => [section.id, section]),
    );
    const sections = document.sectionOrder
      .map((sectionId) => document.sections.find((section) => section.id === sectionId))
      .filter((section): section is WorkspaceDocumentSection => Boolean(section))
      .map((section) => {
        const artifactBlock = this.renderWorkspaceSectionArtifacts(
          state,
          workspaceSectionsById.get(section.id),
        );

        return [`## ${section.title}`, section.content.trim(), artifactBlock]
          .filter(Boolean)
          .join("\n\n");
      })
      .join("\n\n");
    const referencesBlock =
      document.references.length > 0
        ? `## References\n\n${document.references.join("\n\n")}`
        : "";

    return [
      `# ${document.paperTitle}`,
      authorLine,
      workspace.venue.trim() ? `Published in ${workspace.venue.trim()}` : "",
      abstractBlock,
      sections,
      referencesBlock,
    ]
      .filter(Boolean)
      .join("\n\n")
      .trim();
  }

  private findSkill(state: AgentArxivState, skillId: string) {
    const skill = state.skills.find((item) => item.id === skillId);

    if (!skill) {
      throw new Error(`Skill ${skillId} not found`);
    }

    return skill;
  }

  private findPaper(state: AgentArxivState, paperId: string) {
    const paper = state.papers.find((item) => item.id === paperId);

    if (!paper) {
      throw new Error(`Paper ${paperId} not found`);
    }

    return paper;
  }

  private findPublicPaper(state: AgentArxivState, paperId: string) {
    const paper = this.findPaper(state, paperId);

    if (!isPublicPublishedPaper(paper)) {
      throw new Error(`Paper ${paperId} is not publicly accessible`);
    }

    return paper;
  }

  private findPaperThread(
    state: AgentArxivState,
    paperId: string,
    threadId: string,
  ) {
    const thread = state.paperThreads.find(
      (item) => item.paperId === paperId && item.id === threadId,
    );

    if (!thread) {
      throw new Error(`Paper thread ${threadId} not found on ${paperId}`);
    }

    return thread;
  }

  private findPaperReply(
    thread: PaperDiscussionThread,
    replyId: string,
  ) {
    const reply = thread.replies.find((item) => item.id === replyId);

    if (!reply) {
      throw new Error(`Paper reply ${replyId} not found on ${thread.id}`);
    }

    return reply;
  }

  private buildPaperDiscussionTargetKey(threadId: string, replyId?: string) {
    return replyId ? `reply:${replyId}` : `thread:${threadId}`;
  }

  private scoreDeltaForDirectionChange(
    previousDirection: PaperVoteDirection | undefined,
    nextDirection: PaperVoteDirection,
  ) {
    const previousValue =
      previousDirection === "up" ? 1 : previousDirection === "down" ? -1 : 0;
    const nextValue = nextDirection === "up" ? 1 : -1;

    return nextValue - previousValue;
  }

  private findDelegatedTask(state: AgentArxivState, taskId: string) {
    const task = state.delegatedTasks.find((item) => item.id === taskId);

    if (!task) {
      throw new Error(`Delegated task ${taskId} not found`);
    }

    return task;
  }

  private sanitizeSkillDefinition(
    state: AgentArxivState,
    skill: SkillDefinition,
  ): SkillDefinition {
    return {
      ...skill,
      validatedPaperIds: skill.validatedPaperIds.filter((paperId) => {
        const paper = state.papers.find((item) => item.id === paperId);
        return Boolean(paper && isPublicPublishedPaper(paper));
      }),
    };
  }

  private buildDefaultCollaborationIntent(input: {
    displayName: string;
    preferredRoles: string[];
    capabilities: string[];
    researchDescription: string;
  }) {
    const roleSummary = arrayOrEmpty(input.preferredRoles)
      .slice(0, 2)
      .join(" and ");
    const capabilitySummary = arrayOrEmpty(input.capabilities)
      .slice(0, 3)
      .join(", ");

    return [
      `${input.displayName} collaborates best on threads that need ${roleSummary || "a clearly bounded contribution"}.`,
      capabilitySummary
        ? `It typically contributes through ${capabilitySummary}.`
        : "It prefers concrete, scoped work with explicit deliverables.",
      input.researchDescription.trim(),
    ].join(" ");
  }

  private buildInviteInterestSummary(
    state: AgentArxivState,
    input: {
      workspaceId: string;
      fromAgentId: string;
      toAgentId: string;
      reasoning: string;
      proposal?: CollaborationProposal;
      interestSummary?: string;
    },
  ) {
    const providedSummary = input.interestSummary?.trim();

    if (providedSummary) {
      return providedSummary;
    }

    const workspace = this.findWorkspace(state, input.workspaceId);
    const fromAgent = this.findAgent(state, input.fromAgentId);
    const toAgent = this.findAgent(state, input.toAgentId);
    const roleFocus = fromAgent.preferredRoles.slice(0, 2).join(" and ");
    const deliverableFocus = input.proposal?.deliverables[0]?.trim();

    return [
      `${fromAgent.displayName} wants to collaborate with ${toAgent.displayName} on ${workspace.title}.`,
      roleFocus
        ? `It expects to contribute through ${roleFocus} during the ${workspace.stage} stage.`
        : `It wants to make a bounded contribution during the ${workspace.stage} stage.`,
      deliverableFocus
        ? `Initial focus: ${deliverableFocus}`
        : `Current reason for joining: ${input.reasoning.trim()}`,
    ].join(" ");
  }

  private assertWorkspaceMember(
    workspace: WorkspaceBrief,
    agentId: string,
    action: string,
  ) {
    if (!workspace.memberAgentIds.includes(agentId)) {
      throw new Error(
        `Agent ${agentId} must join workspace ${workspace.id} before it can ${action}`,
      );
    }
  }

  private renderSkillPrompt(
    skill: SkillDefinition,
    objective: string,
    inputs: Record<string, string>,
    contextLines: string[] = [],
  ) {
    const substituted = skill.promptTemplate
      .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) =>
        inputs[key] ?? `{{${key}}}`,
      )
      .replaceAll(
        "{{agentarxiv_research_references}}",
        getInternalResearchReferences(),
      );

    return [
      `Skill: ${skill.name} (${skill.slug})`,
      `Objective: ${objective}`,
      `Engine: ${skill.runtime.engine}`,
      "",
      "Internal platform guidance (AGENTS.md):",
      getInternalAgentGuidance(),
      ...(contextLines.length > 0 ? ["", ...contextLines] : []),
      "",
      "Skill template:",
      substituted,
      "",
      "Inputs:",
      ...Object.entries(inputs).map(([key, value]) => `- ${key}: ${value}`),
      "",
      `Expected output sections: ${skill.runtime.outputSections.join(", ")}`,
    ].join("\n");
  }

  private buildSkillExecutionContext(
    state: AgentArxivState,
    input: {
      workspaceId?: string;
      sectionId?: string;
    },
  ) {
    if (!input.workspaceId) {
      return [];
    }

    const report = this.buildWorkspaceManuscriptReport(state, input.workspaceId);
    const lines = [
      "Workspace manuscript context:",
      `- Paper title: ${report.paperTitle}`,
      `- Workflow stage: ${report.stage}`,
      `- Manuscript readiness score: ${report.score}`,
      `- Accepted sections: ${report.checklist.acceptedSectionCount}/${report.checklist.totalSectionCount}`,
      `- References: ${report.checklist.referenceCount}`,
      `- Linked assets: ${report.checklist.linkedAssetCount}`,
      "",
      "Current manuscript reward signals:",
      ...report.rewardSignals.map((signal) => `- ${signal}`),
      "",
      "Current manuscript gaps to close:",
      ...(report.recommendedActions.length > 0
        ? report.recommendedActions.map((action) => `- ${action}`)
        : ["- Maintain the current quality bar while deepening novelty, evidence, or clarity."]),
    ];

    if (!input.sectionId) {
      return lines;
    }

    const sectionGuidance = report.sections.find(
      (section) => section.id === input.sectionId,
    );

    if (!sectionGuidance) {
      return lines;
    }

    return [
      ...lines,
      "",
      "Section-specific artifact guidance:",
      `- Section: ${sectionGuidance.title}`,
      `- Status: ${sectionGuidance.status}`,
      `- Existing linked artifacts: ${sectionGuidance.artifactCount}`,
      `- Should have visual: ${sectionGuidance.shouldHaveVisual ? "yes" : "no"}`,
      ...(sectionGuidance.recommendedAssetType
        ? [`- Recommended asset type: ${sectionGuidance.recommendedAssetType}`]
        : []),
      ...(sectionGuidance.recommendedAssetTemplate
        ? [`- Recommended asset template: ${sectionGuidance.recommendedAssetTemplate}`]
        : []),
      `- Guidance: ${sectionGuidance.artifactGuidance}`,
    ];
  }

  private listInstalledSkillsFromState(
    state: AgentArxivState,
    agentId: string,
  ): AgentSkillRecord[] {
    return state.agentSkills
      .filter((install) => install.agentId === agentId)
      .map((install) => {
        const skill = state.skills.find((item) => item.id === install.skillId);

        if (!skill) {
          return undefined;
        }

        return {
          ...install,
          skill: this.sanitizeSkillDefinition(state, skill),
        };
      })
      .filter((record): record is AgentSkillRecord => Boolean(record))
      .sort((left, right) => {
        if (left.verified !== right.verified) {
          return Number(right.verified) - Number(left.verified);
        }

        if (left.proficiency !== right.proficiency) {
          return right.proficiency - left.proficiency;
        }

        return right.skill.installationCount - left.skill.installationCount;
      });
  }

  private assertAgentHasSkills(
    state: AgentArxivState,
    agentId: string,
    skillIds: string[],
  ) {
    if (skillIds.length === 0) {
      return;
    }

    const installedSkillIds = new Set(
      this.listInstalledSkillsFromState(state, agentId).map(
        (record) => record.skillId,
      ),
    );
    const missingSkillIds = [...new Set(skillIds)].filter(
      (skillId) => !installedSkillIds.has(skillId),
    );

    if (missingSkillIds.length > 0) {
      throw new Error(
        `Agent ${agentId} is missing required delegated-task skills: ${missingSkillIds.join(", ")}`,
      );
    }
  }

  private skillFitScore(
    state: AgentArxivState,
    agentId: string,
    workspace: WorkspaceBrief,
  ) {
    const installedSkillIds = new Set(
      this.listInstalledSkillsFromState(state, agentId).map(
        (record) => record.skillId,
      ),
    );

    if (
      workspace.requiredSkillIds.length === 0 &&
      workspace.preferredSkillIds.length === 0
    ) {
      return 0.5;
    }

    const requiredCoverage =
      workspace.requiredSkillIds.length === 0
        ? 1
        : workspace.requiredSkillIds.filter((skillId) =>
            installedSkillIds.has(skillId),
          ).length / workspace.requiredSkillIds.length;
    const preferredCoverage =
      workspace.preferredSkillIds.length === 0
        ? requiredCoverage
        : workspace.preferredSkillIds.filter((skillId) =>
            installedSkillIds.has(skillId),
          ).length / workspace.preferredSkillIds.length;

    return requiredCoverage * 0.7 + preferredCoverage * 0.3;
  }

  private collaboratorOverlap(
    state: AgentArxivState,
    agentId: string,
    workspace: WorkspaceBrief,
  ) {
    const agent = this.findAgent(state, agentId);
    const collaboratorSet = new Set<string>();

    for (const collaborationId of agent.priorCollaborationIds) {
      const collaboration = state.collaborations.find(
        (item) => item.id === collaborationId,
      );
      collaboration?.collaborators.forEach((collaboratorId) =>
        collaboratorSet.add(collaboratorId),
      );
    }

    if (collaboratorSet.size === 0) {
      return 0;
    }

    const overlap = workspace.memberAgentIds.filter((memberId) =>
      collaboratorSet.has(memberId),
    ).length;
    return overlap / collaboratorSet.size;
  }

  private paperHistoryScore(
    state: AgentArxivState,
    agent: AgentProfile,
    workspace: WorkspaceBrief,
  ) {
    const authored = [...agent.authoredPaperIds, ...agent.coauthoredPaperIds]
      .map((paperId) => state.papers.find((paper) => paper.id === paperId))
      .filter(Boolean) as AgentPaper[];

    if (authored.length === 0) {
      return 0;
    }

    const relevant = authored.filter((paper) =>
      paper.tags.some((tag) => workspace.tags.includes(tag)),
    ).length;

    return relevant / authored.length;
  }

  private assessAgentForWorkspace(
    state: AgentArxivState,
    workspaceId: string,
    agentId: string,
  ) {
    const workspace = this.findWorkspace(state, workspaceId);
    const agent = this.findAgent(state, agentId);
    const graphProximity = this.collaboratorOverlap(state, agentId, workspace);
    const paperHistory = this.paperHistoryScore(state, agent, workspace);
    const skillFit = this.skillFitScore(state, agentId, workspace);
    const breakdown = computeBreakdown(
      agent,
      workspace,
      graphProximity,
      paperHistory,
      skillFit,
    );

    return {
      workspace,
      agent,
      breakdown,
      matchReasons: breakdownReasons(breakdown, workspace, agent),
    };
  }

  private buildProposalDeliverables(
    workspace: WorkspaceBrief,
    mode: CollaborationProposalMode,
  ) {
    const stageDeliverable = {
      intake: "Refine the brief into a collaboration-ready paper scope.",
      outline: "Turn the brief into an outline and ownership plan.",
      literature: "Strengthen the citation map and related-work coverage.",
      drafting: "Contribute draft text or manuscript-ready revisions.",
      review: "Review claims, citations, and revision risk before acceptance.",
      compiled:
        "Help polish the compiled manuscript and final submission notes.",
    } satisfies Record<WorkspaceBrief["stage"], string>;

    if (mode === "explore") {
      return [
        `Assess whether ${workspace.title} is a strong collaboration fit.`,
        `Map where your role could help during the ${workspace.stage} stage.`,
        "List blockers, missing evidence, or scope questions before joining.",
      ];
    }

    return [
      stageDeliverable[workspace.stage],
      "Confirm role ownership and the first concrete contribution.",
      "Flag any risks around citations, review, or compilation early.",
    ];
  }

  private buildProposalQuestions(
    workspace: WorkspaceBrief,
    requestedRoles: string[],
    mode: CollaborationProposalMode,
  ) {
    if (mode === "explore") {
      return [
        "Which section, experiment, or review task would you own if you joined?",
        "Which prior papers best ground your contribution to this thread?",
        "What should the workspace validate before a full collaboration starts?",
      ];
    }

    return [
      `Can you cover ${requestedRoles.slice(0, 2).join(" and ") || "the requested role"} during the ${workspace.stage} stage?`,
      "Which paper history or installed skills should the thread rely on first?",
      "What dependency could block your first contribution?",
    ];
  }

  private createCollaborationProposal(
    state: AgentArxivState,
    input: {
      workspaceId: string;
      fromAgentId: string;
      toAgentId: string;
      mode: CollaborationProposalMode;
      linkedPaperIds?: string[];
      extraContext?: string;
    },
  ): CollaborationProposal {
    const fromAgent = this.findAgent(state, input.fromAgentId);
    const { workspace, agent, matchReasons } = this.assessAgentForWorkspace(
      state,
      input.workspaceId,
      input.toAgentId,
    );
    const candidateRoles = [...agent.preferredRoles, ...agent.capabilities].map(
      (value) => value.toLowerCase(),
    );
    const requestedRoles =
      workspace.desiredRoles.filter((role) =>
        candidateRoles.some(
          (value) =>
            value.includes(role.toLowerCase()) ||
            role.toLowerCase().includes(value),
        ),
      ) || [];
    const selectedRoles =
      requestedRoles.length > 0
        ? requestedRoles
        : (agent.preferredRoles.length > 0
            ? agent.preferredRoles
            : workspace.desiredRoles
          ).slice(0, 2);
    const sharedPaperIds = [
      ...agent.seedPaperIds,
      ...agent.authoredPaperIds,
      ...agent.coauthoredPaperIds,
    ].filter((paperId) => workspace.seedPaperIds.includes(paperId));
    const linkedPaperIds = [
      ...new Set([
        ...(input.linkedPaperIds ?? []),
        ...sharedPaperIds,
        ...workspace.seedPaperIds,
      ]),
    ].slice(0, 4);
    const contributionAreas =
      matchReasons.length > 0
        ? matchReasons.slice(0, 3)
        : workspace.tags.slice(0, 3);
    const summaryParts = [
      `${fromAgent.displayName} is asking ${agent.displayName} to ${
        input.mode === "explore"
          ? "explore collaboration fit"
          : "join the research thread"
      } for ${workspace.title}.`,
      `Current stage: ${workspace.stage}.`,
    ];

    if (matchReasons[0]) {
      summaryParts.push(
        `Best fit signals: ${matchReasons.slice(0, 2).join("; ")}.`,
      );
    }

    if (input.extraContext) {
      summaryParts.push(input.extraContext.trim());
    }

    return {
      mode: input.mode,
      title:
        input.mode === "explore"
          ? `Exploration request for ${workspace.title}`
          : `Collaboration proposal for ${workspace.title}`,
      summary: summaryParts.join(" "),
      requestedRoles: selectedRoles,
      contributionAreas,
      deliverables: this.buildProposalDeliverables(workspace, input.mode),
      linkedPaperIds,
      questions: this.buildProposalQuestions(
        workspace,
        selectedRoles,
        input.mode,
      ),
    };
  }

  private hydrateInvite(state: AgentArxivState, invite: Invite): Invite {
    return {
      ...invite,
      interestSummary:
        invite.interestSummary ??
        this.buildInviteInterestSummary(state, {
          workspaceId: invite.workspaceId,
          fromAgentId: invite.fromAgentId,
          toAgentId: invite.toAgentId,
          reasoning: invite.reasoning,
          proposal: invite.proposal,
        }),
    };
  }

  private proposalRoleAlignment(
    agent: AgentProfile,
    proposal: CollaborationProposal,
  ) {
    if (proposal.requestedRoles.length === 0) {
      return 0.5;
    }

    const candidateRoles = [...agent.preferredRoles, ...agent.capabilities].map(
      (value) => value.toLowerCase(),
    );
    const aligned = proposal.requestedRoles.filter((role) =>
      candidateRoles.some(
        (value) =>
          value.includes(role.toLowerCase()) ||
          role.toLowerCase().includes(value),
      ),
    ).length;

    return aligned / proposal.requestedRoles.length;
  }

  private inviteInterestAlignment(
    state: AgentArxivState,
    invite: Pick<Invite, "workspaceId" | "fromAgentId" | "interestSummary">,
  ) {
    const workspace = this.findWorkspace(state, invite.workspaceId);
    const fromAgent = this.findAgent(state, invite.fromAgentId);
    const tokens = [
      invite.interestSummary,
      fromAgent.collaborationIntent,
      ...fromAgent.preferredRoles,
      ...fromAgent.capabilities,
    ]
      .join(" ")
      .toLowerCase();
    const matchedSignals = [
      ...workspace.tags,
      ...workspace.desiredRoles,
    ].filter((signal) => tokens.includes(signal.toLowerCase())).length;

    if (matchedSignals === 0) {
      return 0.5;
    }

    return Math.min(
      1,
      matchedSignals /
        Math.max(2, workspace.tags.length + workspace.desiredRoles.length),
    );
  }

  private getWorkspaceInvites(
    state: AgentArxivState,
    workspaceId: string,
    statuses: Invite["status"][] = ["pending", "requested"],
  ) {
    return state.invites.filter(
      (invite) =>
        invite.workspaceId === workspaceId && statuses.includes(invite.status),
    );
  }

  private getReservedWorkspaceCollaboratorCount(
    state: AgentArxivState,
    workspace: WorkspaceBrief,
  ) {
    const reservedCollaborators = new Set(workspace.memberAgentIds);

    for (const invite of this.getWorkspaceInvites(state, workspace.id)) {
      const reservedAgentId =
        invite.status === "requested" ? invite.fromAgentId : invite.toAgentId;

      reservedCollaborators.add(reservedAgentId);
    }

    return reservedCollaborators.size;
  }

  private proposalDocumentIsComplete(
    state: AgentArxivState,
    workspaceId: string,
  ) {
    const proposalDocument = this.maybeFindWorkspaceDocument(
      state,
      workspaceId,
      "proposal",
    );

    if (!proposalDocument) {
      return false;
    }

    return (
      proposalDocument.sections.length > 0 &&
      proposalDocument.sections.every(
        (section) => section.content.trim().length > 0,
      )
    );
  }

  private buildDraftLockedReason(
    state: AgentArxivState,
    workspace: WorkspaceBrief,
  ) {
    const openInviteCount = this.getWorkspaceInvites(state, workspace.id).length;

    if (openInviteCount > 0) {
      return `Resolve the ${openInviteCount} open invitation${openInviteCount === 1 ? "" : "s"} before opening draft work.`;
    }

    if (!this.proposalDocumentIsComplete(state, workspace.id)) {
      return "Complete every proposal section before opening the draft.";
    }

    if (!workspace.collaboratorsLockedAt) {
      return "Lock the collaborator roster before opening the draft.";
    }

    return "Draft work is still locked for this ticket.";
  }

  private canWorkspaceAccessDraft(
    state: AgentArxivState,
    workspace: WorkspaceBrief,
  ) {
    if (workspace.paperStatus === "published") {
      return true;
    }

    return (
      workspace.paperStatus === "draft" &&
      Boolean(workspace.collaboratorsLockedAt) &&
      workspace.proposalStatus === "completed"
    );
  }

  private canWorkspaceActivateDraft(
    state: AgentArxivState,
    workspace: WorkspaceBrief,
  ) {
    if (
      workspace.paperStatus !== "proposal" ||
      workspace.proposalStatus === "completed"
    ) {
      return false;
    }

    if (this.getWorkspaceInvites(state, workspace.id).length > 0) {
      return false;
    }

    return this.proposalDocumentIsComplete(state, workspace.id);
  }

  private assertCollaboratorRosterOpen(
    state: AgentArxivState,
    workspace: WorkspaceBrief,
    action: string,
  ) {
    if (workspace.collaboratorsLockedAt || workspace.paperStatus !== "proposal") {
      throw new Error(
        `Workspace ${workspace.id} has locked its collaborator roster and can no longer ${action}.`,
      );
    }

    if (workspace.proposalStatus === "completed") {
      throw new Error(
        `Workspace ${workspace.id} has already completed its proposal and can no longer ${action}.`,
      );
    }
  }

  private assertWorkspaceHasCollaboratorCapacity(
    state: AgentArxivState,
    workspace: WorkspaceBrief,
    nextReservedCount = this.getReservedWorkspaceCollaboratorCount(
      state,
      workspace,
    ),
  ) {
    if (nextReservedCount > workspace.maxCollaborators) {
      throw new Error(
        `Workspace ${workspace.id} supports at most ${workspace.maxCollaborators} collaborators.`,
      );
    }
  }

  private assertDraftWorkspace(
    state: AgentArxivState,
    workspace: WorkspaceBrief,
    action: string,
  ) {
    if (!this.canWorkspaceAccessDraft(state, workspace)) {
      throw new Error(this.buildDraftLockedReason(state, workspace));
    }

    if (workspace.paperStatus === "proposal") {
      throw new Error(
        `Workspace ${workspace.id} must finish its proposal before it can ${action}.`,
      );
    }
  }

  private buildWorkspaceRecord(
    state: AgentArxivState,
    workspace: WorkspaceBrief,
  ): WorkspaceRecord {
    const notebookState = this.ensureWorkspaceNotebookState(state, workspace.id);
    const members = workspace.memberAgentIds
      .map((memberAgentId) =>
        state.agents.find((agent) => agent.id === memberAgentId),
      )
      .filter((agent): agent is AgentProfile => Boolean(agent));
    const accountMembers = this.listWorkspaceAccountMemberships(state, workspace);
    const linkedPapers = workspace.linkedPaperIds
      .map((paperId) => state.papers.find((paper) => paper.id === paperId))
      .filter((paper): paper is AgentPaper => Boolean(paper));
    const documents = state.workspaceDocuments
      .filter((document) => document.workspaceId === workspace.id)
      .sort((left, right) => left.surface.localeCompare(right.surface));
    const sections = state.sections.filter(
      (section) => section.workspaceId === workspace.id,
    );
    const artifacts = state.artifacts
      .filter((artifact) => artifact.workspaceId === workspace.id)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    const invites = state.invites
      .filter((invite) => invite.workspaceId === workspace.id)
      .map((invite) => this.hydrateInvite(state, invite))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const messages = state.workspaceMessages
      .filter((message) => message.workspaceId === workspace.id)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    const governanceDecisions = this.listWorkspaceGovernanceDecisions(
      state,
      workspace.id,
    );
    const governanceVotes = state.governanceVotes
      .filter((vote) => vote.workspaceId === workspace.id)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    const run = state.runs.find((item) => item.workspaceId === workspace.id);
    const openInviteCount = this.getWorkspaceInvites(state, workspace.id).length;
    const reservedCollaborators = this.getReservedWorkspaceCollaboratorCount(
      state,
      workspace,
    );
    const remainingCollaboratorSlots = Math.max(
      0,
      workspace.maxCollaborators - reservedCollaborators,
    );
    const draftAvailable = this.canWorkspaceAccessDraft(state, workspace);
    const sandbox = this.buildWorkspaceSandboxSummary(state, workspace);

    return {
      workspace,
      members,
      accountMembers,
      linkedPapers,
      documents,
      sections,
      artifacts,
      invites,
      messages,
      governanceDecisions,
      governanceVotes,
      notebook: notebookState.notebook,
      notebookLease: notebookState.lease,
      notebookEvidence: notebookState.evidence,
      run,
      openInviteCount,
      remainingCollaboratorSlots,
      collaboratorsLocked: Boolean(workspace.collaboratorsLockedAt),
      canActivateDraft: this.canWorkspaceActivateDraft(state, workspace),
      surfaceAccess: {
        proposal: {
          surface: "proposal",
          available: true,
        },
        draft: {
          surface: "draft",
          available: draftAvailable,
          reason: draftAvailable
            ? undefined
            : this.buildDraftLockedReason(state, workspace),
        },
      },
      sandbox,
    };
  }

  private listWorkspaceAccountMemberships(
    state: AgentArxivState,
    workspace: WorkspaceBrief,
  ): WorkspaceAccountMembership[] {
    const persisted = state.workspaceAccountMemberships
      .filter((membership) => membership.workspaceId === workspace.id)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

    if (persisted.length > 0) {
      return persisted;
    }

    const now = workspace.updatedAt;
    const accountMembershipsByUserId = new Map<string, WorkspaceAccountMembership>();

    for (const memberAgentId of workspace.memberAgentIds) {
      const agent = state.agents.find((item) => item.id === memberAgentId);

      if (!agent?.ownerClerkUserId || accountMembershipsByUserId.has(agent.ownerClerkUserId)) {
        continue;
      }

      accountMembershipsByUserId.set(agent.ownerClerkUserId, {
        id: `wmem_${workspace.id}_${agent.ownerClerkUserId}`.replace(/[^a-zA-Z0-9_]/g, "_"),
        workspaceId: workspace.id,
        ownerClerkUserId: agent.ownerClerkUserId,
        assignedAgentId: agent.id,
        role:
          agent.id === workspace.ownerAgentId ? "owner" : "editor",
        createdAt: workspace.createdAt,
        updatedAt: now,
      });
    }

    return [...accountMembershipsByUserId.values()].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    );
  }

  private listWorkspaceGovernanceDecisions(
    state: AgentArxivState,
    workspaceId: string,
  ) {
    return state.governanceDecisions
      .filter((decision) => decision.workspaceId === workspaceId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  private countGovernanceVotes(
    state: AgentArxivState,
    decisionId: string,
    vote: GovernanceVote["vote"],
  ) {
    return state.governanceVotes.filter(
      (item) => item.decisionId === decisionId && item.vote === vote,
    ).length;
  }

  private getWorkspaceSupermajorityThreshold(accountCount: number) {
    return Math.max(1, Math.ceil(accountCount * GOVERNANCE_SUPERMAJORITY_FRACTION));
  }

  private buildGovernanceDecisionThreadId(workspaceId: string, decisionId: string) {
    return `workspace-${workspaceId}-decision-${decisionId}`;
  }

  private buildGovernanceDecisionTitle(
    workspace: WorkspaceBrief,
    kind: GovernanceDecisionKind,
    targetPayload: Record<string, unknown>,
  ) {
    const targetLabel =
      typeof targetPayload.title === "string" && targetPayload.title.trim()
        ? targetPayload.title.trim()
        : kind === "stage_transition"
          ? "Stage transition"
          : kind === "publish"
            ? "Publish decision"
            : kind === "workspace_settings"
              ? "Workspace settings change"
              : "Collaborator decision";

    return `${workspace.title} · ${targetLabel}`;
  }

  private buildGovernanceDecisionOpenMessage(decision: GovernanceDecision) {
    return `Decision opened. [decision:${decision.id}] ${decision.title}`;
  }

  private buildGovernanceDecisionResolvedMessage(decision: GovernanceDecision) {
    const outcomeLabel =
      decision.outcome === "approved"
        ? "approved"
        : decision.outcome === "rejected"
          ? "rejected"
          : "resolved by emergency override";

    return `Decision resolved. [decision:${decision.id}] ${decision.title} was ${outcomeLabel}.`;
  }

  private findOpenGovernanceDecision(
    state: AgentArxivState,
    workspaceId: string,
    kind: GovernanceDecisionKind,
    targetPayload: Record<string, unknown>,
  ) {
    const targetSignature = JSON.stringify(targetPayload);

    return state.governanceDecisions.find(
      (decision) =>
        decision.workspaceId === workspaceId &&
        decision.kind === kind &&
        decision.status !== "resolved" &&
        JSON.stringify(decision.targetPayload) === targetSignature,
    );
  }

  private assertWorkspaceAccountSeatAvailable(
    state: AgentArxivState,
    workspace: WorkspaceBrief,
    agentId: string,
  ) {
    const agent = this.findAgent(state, agentId);

    if (!agent.ownerClerkUserId) {
      return;
    }

    const existingMembership = this.listWorkspaceAccountMemberships(
      state,
      workspace,
    ).find(
      (membership) => membership.ownerClerkUserId === agent.ownerClerkUserId,
    );

    if (
      existingMembership &&
      existingMembership.assignedAgentId !== agentId
    ) {
      throw new Error(
        `Workspace ${workspace.id} already has an assigned collaborator for account ${agent.ownerClerkUserId}.`,
      );
    }
  }

  private async upsertWorkspaceAccountMembershipTx(
    tx: Prisma.TransactionClient,
    state: AgentArxivState,
    workspace: WorkspaceBrief,
    agentId: string,
    role: WorkspaceAccountMembership["role"],
    now: string,
  ) {
    const agent = this.findAgent(state, agentId);

    if (!agent.ownerClerkUserId) {
      return;
    }

    await tx.workspaceAccountMembership.upsert({
      where: {
        workspaceId_ownerClerkUserId: {
          workspaceId: workspace.id,
          ownerClerkUserId: agent.ownerClerkUserId,
        },
      },
      update: {
        assignedAgentId: agentId,
        role,
        updatedAt: new Date(now),
      },
      create: {
        id: createId("wmem"),
        workspaceId: workspace.id,
        ownerClerkUserId: agent.ownerClerkUserId,
        assignedAgentId: agentId,
        role,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      },
    });
  }

  private findGovernanceDecision(state: AgentArxivState, decisionId: string) {
    const decision = state.governanceDecisions.find(
      (item) => item.id === decisionId,
    );

    if (!decision) {
      throw new Error(`Governance decision ${decisionId} not found`);
    }

    return decision;
  }

  private async ensureGovernanceDecisionTx(
    tx: Prisma.TransactionClient,
    state: AgentArxivState,
    workspace: WorkspaceBrief,
    input: {
      kind: GovernanceDecisionKind;
      title?: string;
      required: boolean;
      engagementMode?: GovernanceDecision["engagementMode"];
      targetPayload: Record<string, unknown>;
      openedByAccountClerkUserId?: string;
      openedByAgentId?: string;
    },
    now: string,
  ) {
    const existingDecision = this.findOpenGovernanceDecision(
      state,
      workspace.id,
      input.kind,
      input.targetPayload,
    );

    if (existingDecision) {
      return existingDecision;
    }

    const decision: GovernanceDecision = {
      id: createId("gdec"),
      workspaceId: workspace.id,
      kind: input.kind,
      title:
        input.title?.trim() ||
        this.buildGovernanceDecisionTitle(
          workspace,
          input.kind,
          input.targetPayload,
        ),
      status: "discussion",
      required: input.required,
      engagementMode: input.engagementMode ?? "async",
      targetPayload: input.targetPayload,
      openedByAccountClerkUserId: input.openedByAccountClerkUserId,
      openedByAgentId: input.openedByAgentId,
      emergencyOverride: false,
      createdAt: now,
      updatedAt: now,
    };

    await tx.governanceDecision.create({
      data: {
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
        emergencyOverride: decision.emergencyOverride,
        createdAt: new Date(decision.createdAt),
        updatedAt: new Date(decision.updatedAt),
      },
    });
    await this.createSystemWorkspaceMessageTx(
      tx,
      workspace.id,
      this.buildGovernanceDecisionOpenMessage(decision),
      now,
    );

    return decision;
  }

  private hasApprovedGovernanceDecision(
    state: AgentArxivState,
    workspaceId: string,
    kind: GovernanceDecisionKind,
    targetPayload: Record<string, unknown>,
  ) {
    const targetSignature = JSON.stringify(targetPayload);

    return state.governanceDecisions.some(
      (decision) =>
        decision.workspaceId === workspaceId &&
        decision.kind === kind &&
        decision.status === "resolved" &&
        decision.outcome === "approved" &&
        JSON.stringify(decision.targetPayload) === targetSignature,
    );
  }

  private async recordSkillUsageTx(
    tx: Prisma.TransactionClient,
    agentId: string,
    skillIds: string[],
    now: string,
  ) {
    const uniqueSkillIds = [...new Set(skillIds)];

    if (uniqueSkillIds.length === 0) {
      return;
    }

    const installs = await tx.agentSkillInstall.findMany({
      where: {
        agentId,
        skillId: {
          in: uniqueSkillIds,
        },
      },
    });
    const installedSkillIds = new Set(installs.map((install) => install.skillId));
    const missingSkillIds = uniqueSkillIds.filter(
      (skillId) => !installedSkillIds.has(skillId),
    );

    if (missingSkillIds.length > 0) {
      throw new Error(
        `Agent ${agentId} must install skill ${missingSkillIds.join(", ")} before using it`,
      );
    }

    await Promise.all(
      uniqueSkillIds.flatMap((skillId) => [
        tx.agentSkillInstall.updateMany({
          where: {
            agentId,
            skillId,
          },
          data: {
            lastUsedAt: new Date(now),
          },
        }),
        tx.skillDefinition.update({
          where: {
            id: skillId,
          },
          data: {
            usageCount: {
              increment: 1,
            },
            updatedAt: new Date(now),
          },
        }),
      ]),
    );
  }

  private async createSystemWorkspaceMessageTx(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    content: string,
    now: string,
  ) {
    const messageId = createId("wmsg");

    await tx.workspaceMessage.create({
      data: {
        id: messageId,
        workspaceId,
        authorType: "system",
        authorName: "Workspace Context",
        authorAccent: "#7b8794",
        content: content.trim(),
        createdAt: new Date(now),
        updatedAt: new Date(now),
      },
    });
    await tx.workspaceBrief.update({
      where: {
        id: workspaceId,
      },
      data: {
        updatedAt: new Date(now),
      },
    });

    return messageId;
  }

  private async acceptInviteDirectTx(
    tx: Prisma.TransactionClient,
    state: AgentArxivState,
    inviteId: string,
    agentId: string,
    now: string,
    options?: {
      emitWorkspaceMessage?: boolean;
    },
  ) {
    const invite = state.invites.find(
      (item) => item.id === inviteId && item.toAgentId === agentId,
    );

    if (!invite) {
      throw new Error(`Invite ${inviteId} not found for ${agentId}`);
    }

    const workspace = this.findWorkspace(state, invite.workspaceId);
    const recipientAgent = this.findAgent(state, agentId);
    const isJoinRequest = invite.status === "requested";
    const invitedAgentId = isJoinRequest ? invite.fromAgentId : invite.toAgentId;
    const invitedAgent = this.findAgent(state, invitedAgentId);

    if (invite.status !== "pending" && invite.status !== "requested") {
      throw new Error(`Invite ${inviteId} is not open`);
    }

    this.assertCollaboratorRosterOpen(state, workspace, "accept invites");
    this.assertWorkspaceHasCollaboratorCapacity(
      state,
      workspace,
      workspace.memberAgentIds.includes(invitedAgentId)
        ? workspace.memberAgentIds.length
        : workspace.memberAgentIds.length + 1,
    );
    this.assertWorkspaceAccountSeatAvailable(state, workspace, invitedAgentId);

    const nextMemberAgentIds = workspace.memberAgentIds.includes(invitedAgentId)
      ? workspace.memberAgentIds
      : [...workspace.memberAgentIds, invitedAgentId];

    await tx.invite.update({
      where: {
        id: invite.id,
      },
      data: {
        status: "accepted",
        updatedAt: new Date(now),
      },
    });
    await tx.agentProfile.update({
      where: {
        id: agentId,
      },
      data: {
        inviteAcceptedCount: {
          increment: 1,
        },
        updatedAt: new Date(now),
      },
    });
    await tx.workspaceBrief.update({
      where: {
        id: workspace.id,
      },
      data: {
        memberAgentIds: nextMemberAgentIds,
        updatedAt: new Date(now),
      },
    });
    await this.upsertWorkspaceAccountMembershipTx(
      tx,
      state,
      {
        ...workspace,
        memberAgentIds: nextMemberAgentIds,
      },
      invitedAgentId,
      invitedAgentId === workspace.ownerAgentId ? "owner" : "editor",
      now,
    );
    await this.syncWorkspaceDocumentAuthorsTx(
      tx,
      {
        ...state,
        workspaces: state.workspaces.map((candidate) =>
          candidate.id === workspace.id
            ? {
                ...candidate,
                memberAgentIds: nextMemberAgentIds,
              }
            : candidate,
        ),
      },
      {
        ...workspace,
        memberAgentIds: nextMemberAgentIds,
      },
      now,
    );

    if (options?.emitWorkspaceMessage !== false) {
      await this.createSystemWorkspaceMessageTx(
        tx,
        workspace.id,
        isJoinRequest
          ? `${recipientAgent.displayName} approved ${invitedAgent.displayName}'s request to join the workspace.`
          : `${invitedAgent.displayName} accepted the collaboration invite.`,
        now,
      );
    }
  }

  private async activateWorkspaceDraftDirectTx(
    tx: Prisma.TransactionClient,
    state: AgentArxivState,
    workspaceId: string,
    now: string,
    options?: {
      emitWorkspaceMessage?: boolean;
    },
  ) {
    const workspace = this.findWorkspace(state, workspaceId);

    if (!this.canWorkspaceActivateDraft(state, workspace)) {
      throw new Error(this.buildDraftLockedReason(state, workspace));
    }

    await tx.workspaceBrief.update({
      where: {
        id: workspaceId,
      },
      data: {
        paperStatus: "draft",
        proposalStatus: "completed",
        proposalCompletedAt: workspace.proposalCompletedAt
          ? new Date(workspace.proposalCompletedAt)
          : new Date(now),
        collaboratorsLockedAt: new Date(now),
        draftStartedAt: workspace.draftStartedAt
          ? new Date(workspace.draftStartedAt)
          : new Date(now),
        stage: "drafting",
        updatedAt: new Date(now),
      },
    });
    await this.ensureWorkspaceRunTx(tx, state, workspace, now);

    if (options?.emitWorkspaceMessage !== false) {
      await this.createSystemWorkspaceMessageTx(
        tx,
        workspaceId,
        `Proposal completed. Collaborators are now locked at ${workspace.memberAgentIds.length}/${workspace.maxCollaborators} and the draft is open.`,
        now,
      );
    }
  }

  private async resolveGovernanceDecisionTx(
    tx: Prisma.TransactionClient,
    state: AgentArxivState,
    decisionId: string,
    outcome: GovernanceDecisionOutcome,
    now: string,
    options?: {
      emergencyOverride?: boolean;
    },
  ) {
    const decision = this.findGovernanceDecision(state, decisionId);

    if (decision.status === "resolved") {
      return decision;
    }

    if (outcome === "approved") {
      if (
        decision.kind === "collaborator_change" &&
        typeof decision.targetPayload.inviteId === "string" &&
        typeof decision.targetPayload.agentId === "string"
      ) {
        await this.acceptInviteDirectTx(
          tx,
          state,
          decision.targetPayload.inviteId,
          decision.targetPayload.agentId,
          now,
          { emitWorkspaceMessage: false },
        );
      } else if (
        decision.kind === "stage_transition" &&
        decision.targetPayload.targetPaperStatus === "draft"
      ) {
        await this.activateWorkspaceDraftDirectTx(
          tx,
          state,
          decision.workspaceId,
          now,
          { emitWorkspaceMessage: false },
        );
      } else if (decision.kind === "publish") {
        // Publishing still requires the existing publish endpoint to be re-attempted
        // after approval so the caller can provide the final publication payload.
      }
    } else if (
      outcome === "rejected" &&
      decision.kind === "collaborator_change" &&
      typeof decision.targetPayload.inviteId === "string"
    ) {
      await tx.invite.updateMany({
        where: {
          id: decision.targetPayload.inviteId,
          status: {
            in: ["pending", "requested"],
          },
        },
        data: {
          status: "declined",
          updatedAt: new Date(now),
        },
      });
    }

    await tx.governanceDecision.update({
      where: {
        id: decision.id,
      },
      data: {
        status: "resolved",
        outcome,
        resolvedAt: new Date(now),
        emergencyOverride: Boolean(options?.emergencyOverride),
        updatedAt: new Date(now),
      },
    });
    await this.createSystemWorkspaceMessageTx(
      tx,
      decision.workspaceId,
      this.buildGovernanceDecisionResolvedMessage({
        ...decision,
        status: "resolved",
        outcome,
        resolvedAt: now,
        emergencyOverride: Boolean(options?.emergencyOverride),
        updatedAt: now,
      }),
      now,
    );

    return {
      ...decision,
      status: "resolved" as GovernanceDecisionStatus,
      outcome,
      resolvedAt: now,
      emergencyOverride: Boolean(options?.emergencyOverride),
      updatedAt: now,
    };
  }

  private async syncWorkspaceDocumentSectionTx(
    tx: Prisma.TransactionClient,
    state: AgentArxivState,
    input: {
      workspaceId: string;
      surface: WorkspaceDocument["surface"];
      sectionId: string;
      now: string;
      agentId?: string;
      content?: string;
      references?: string[];
    },
  ) {
    const document = this.findWorkspaceDocument(
      state,
      input.workspaceId,
      input.surface,
    );
    const section = document.sections.find((item) => item.id === input.sectionId);

    if (!section) {
      throw new Error(
        `Document section ${input.sectionId} not found on ${input.surface} for workspace ${input.workspaceId}`,
      );
    }

    await tx.workspaceDocumentSection.update({
      where: {
        id: section.id,
      },
      data: {
        agentId:
          typeof input.agentId === "string" ? input.agentId : section.agentId,
        content:
          typeof input.content === "string" ? input.content : section.content,
        updatedAt: new Date(input.now),
      },
    });
    await tx.workspaceDocument.update({
      where: {
        id: document.id,
      },
      data: {
        references: Array.isArray(input.references)
          ? input.references
          : document.references,
        updatedAt: new Date(input.now),
      },
    });
  }

  private async ensureWorkspaceRunTx(
    tx: Prisma.TransactionClient,
    state: AgentArxivState,
    workspace: WorkspaceBrief,
    now: string,
  ) {
    const existingRun = state.runs.find((run) => run.workspaceId === workspace.id);

    if (existingRun) {
      return existingRun.id;
    }

    const run = this.buildDraftRun(workspace, now);
    await tx.run.create({
      data: {
        id: run.id,
        workspaceId: run.workspaceId,
        status: run.status,
        currentStage: run.currentStage,
        startedAt: new Date(run.startedAt),
        updatedAt: new Date(run.updatedAt),
        steps: run.steps,
      },
    });

    return run.id;
  }

  async getState() {
    return this.loadState();
  }

  async listAgents() {
    const state = await this.loadState();
    return state.agents.filter((agent) => agent.discoverable);
  }

  async listAccountAgents(ownerClerkUserId: string) {
    const state = await this.loadState();

    return state.agents
      .filter((agent) => agent.ownerClerkUserId === ownerClerkUserId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async createAccountAccessToken(
    ownerClerkUserId: string,
    options?: CreateAccountAccessTokenOptions,
  ) {
    const token = this.createAccountAccessTokenValue();
    const now = new Date();
    const expiresAt =
      options?.expiresAt ?? addDays(now, DEFAULT_ACCOUNT_TOKEN_TTL_DAYS);
    const maxUses = options?.maxUses;

    if (expiresAt.getTime() <= now.getTime()) {
      throw new Error("Account token expiry must be in the future");
    }

    if (
      maxUses !== undefined &&
      (!Number.isInteger(maxUses) || maxUses <= 0)
    ) {
      throw new Error("Account token usage limit must be a positive integer");
    }

    await this.runWrite(async (tx) => {
      await tx.accountAccessToken.create({
        data: {
          id: createId("acctok"),
          tokenHash: token.hash,
          ownerClerkUserId,
          createdAt: now,
          useCount: 0,
          maxUses: maxUses ?? null,
          expiresAt,
        },
      });
    });

    return this.formatCreatedAccountAccessToken({
      token: token.plain,
      createdAt: now,
      expiresAt,
      maxUses,
    });
  }

  async createAccountOnboardingSession() {
    const claimToken = this.createAccountOnboardingTokenValue();
    const pollToken = this.createAccountOnboardingTokenValue();
    const verificationCode = this.createAccountOnboardingVerificationCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60_000);
    const sessionId = createId("acctonb");

    await this.runWrite(async (tx) => {
      await tx.accountOnboardingSession.create({
        data: {
          id: sessionId,
          claimTokenHash: claimToken.hash,
          pollTokenHash: pollToken.hash,
          verificationCode,
          status: "pending",
          createdAt: now,
          expiresAt,
        },
      });
    });

    return {
      sessionId,
      claimToken: claimToken.plain,
      pollToken: pollToken.plain,
      verificationCode,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  }

  async readAccountOnboardingSessionForClaim(
    sessionId: string,
    claimToken: string,
  ) {
    return this.runWrite(async (tx) => {
      const session = await this.findAccountOnboardingSessionByClaim(
        tx,
        sessionId,
        claimToken,
      );
      const resolvedSession = await this.expireAccountOnboardingSessionIfNeeded(
        tx,
        session,
      );

      return this.formatAccountOnboardingSession(resolvedSession);
    });
  }

  async approveAccountOnboardingSession(
    sessionId: string,
    claimToken: string,
    ownerClerkUserId: string,
  ) {
    return this.runWrite(async (tx) => {
      const session = await this.findAccountOnboardingSessionByClaim(
        tx,
        sessionId,
        claimToken,
      );
      const resolvedSession = await this.expireAccountOnboardingSessionIfNeeded(
        tx,
        session,
      );

      if (resolvedSession.status === "expired") {
        throw new Error("This account onboarding request has expired");
      }

      if (resolvedSession.status === "completed") {
        return this.formatAccountOnboardingSession(resolvedSession, {
          message:
            "This account onboarding request has already been completed.",
        });
      }

      if (
        resolvedSession.status === "approved" &&
        resolvedSession.ownerClerkUserId &&
        resolvedSession.ownerClerkUserId !== ownerClerkUserId
      ) {
        throw new Error(
          "This account onboarding request has already been approved by another account",
        );
      }

      const approvedAt =
        resolvedSession.approvedAt ?? new Date();

      const approvedSession =
        resolvedSession.status === "approved"
          ? resolvedSession
          : await tx.accountOnboardingSession.update({
              where: {
                id: resolvedSession.id,
              },
              data: {
                status: "approved",
                ownerClerkUserId,
                approvedAt,
              },
            });

      return this.formatAccountOnboardingSession(approvedSession, {
        message:
          "Approval recorded. Return to your agent so it can finish registration.",
      });
    });
  }

  async pollAccountOnboardingSession(sessionId: string, pollToken: string) {
    return this.runWrite(async (tx) => {
      const session = await this.findAccountOnboardingSessionByPoll(
        tx,
        sessionId,
        pollToken,
      );
      const resolvedSession = await this.expireAccountOnboardingSessionIfNeeded(
        tx,
        session,
      );

      if (resolvedSession.status === "pending") {
        return this.formatAccountOnboardingSession(resolvedSession, {
          message:
            "Waiting for the user to complete Clerk sign-in and approve this onboarding request.",
        });
      }

      if (resolvedSession.status === "expired") {
        return this.formatAccountOnboardingSession(resolvedSession, {
          message:
            "This onboarding request expired before the user approved it.",
        });
      }

      if (resolvedSession.status === "completed") {
        return this.formatAccountOnboardingSession(resolvedSession, {
          message:
            "The account token for this onboarding request has already been issued. Start a new onboarding request if you need another token.",
        });
      }

      if (!resolvedSession.ownerClerkUserId) {
        throw new Error(
          "Approved onboarding request is missing its Clerk owner binding",
        );
      }

      const token = this.createAccountAccessTokenValue();
      const now = new Date();
      const expiresAt = addHours(now, ONBOARDING_ACCOUNT_TOKEN_TTL_HOURS);

      await tx.accountAccessToken.create({
        data: {
          id: createId("acctok"),
          tokenHash: token.hash,
          ownerClerkUserId: resolvedSession.ownerClerkUserId,
          createdAt: now,
          useCount: 0,
          maxUses: 1,
          expiresAt,
        },
      });

      const completedSession = await tx.accountOnboardingSession.update({
        where: {
          id: resolvedSession.id,
        },
        data: {
          status: "completed",
          completedAt: now,
        },
      });

      return this.formatAccountOnboardingSession(completedSession, {
        accountToken: this.formatCreatedAccountAccessToken({
          token: token.plain,
          createdAt: now,
          expiresAt,
          maxUses: 1,
        }),
        message:
          "Account token issued. Reconnect with Authorization: Bearer <account_token> and call register_agent.",
      });
    });
  }

  async listPapers(filters?: PaperListFilters) {
    const state = await this.loadState();
    const query = filters?.query?.trim().toLowerCase();
    const tag = filters?.tag?.trim().toLowerCase();
    const limit =
      filters?.limit && filters.limit > 0 ? filters.limit : undefined;
    const sourceType = filters?.sourceType;

    const papers = state.papers
      .filter((paper) => isPublicPublishedPaper(paper))
      .filter((paper) => !sourceType || paper.sourceType === sourceType)
      .filter(
        (paper) =>
          !tag || paper.tags.some((paperTag) => paperTag.toLowerCase() === tag),
      )
      .filter((paper) => {
        if (!query) {
          return true;
        }

        const haystack = [
          paper.title,
          paper.summary,
          paper.focus ?? "",
          paper.venue,
          paper.authors.join(" "),
          paper.tags.join(" "),
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(query);
      })
      .sort((left, right) => {
        if (left.hotScore !== right.hotScore) {
          return right.hotScore - left.hotScore;
        }

        return right.publishedAt.localeCompare(left.publishedAt);
      });

    return typeof limit === "number" ? papers.slice(0, limit) : papers;
  }

  async getPaper(paperId: string) {
    const state = await this.loadState();
    return this.findPublicPaper(state, paperId);
  }

  async getPublicPaperRecord(paperId: string): Promise<PublicPaperRecord> {
    const state = await this.loadState();
    const paper = this.findPublicPaper(state, paperId);
    const threads = state.paperThreads
      .filter((thread) => thread.paperId === paperId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const discussionAgentIds = new Set<string>();

    for (const thread of threads) {
      discussionAgentIds.add(thread.authorId);
      thread.replies.forEach((reply) => discussionAgentIds.add(reply.authorId));
    }

    return {
      paper,
      threads,
      discussionAgents: state.agents.filter((agent) =>
        discussionAgentIds.has(agent.id),
      ),
    };
  }

  async postPaperComment(input: unknown) {
    const parsed = postPaperCommentInputSchema.parse(input);
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const paper = this.findPublicPaper(state, parsed.paperId);
      this.findAgent(state, parsed.agentId);

      if (parsed.threadId) {
        const thread = this.findPaperThread(state, parsed.paperId, parsed.threadId);
        const reply = {
          id: createId("reply"),
          authorId: parsed.agentId,
          body: parsed.body.trim(),
          createdAt: now,
          upvotes: 0,
        };

        await tx.paperDiscussionThread.update({
          where: {
            id: thread.id,
          },
          data: {
            replies: [...thread.replies, reply],
          },
        });
        await tx.agentPaper.update({
          where: {
            id: paper.id,
          },
          data: {
            hotScore: {
              increment: 1,
            },
          },
        });

        return;
      }

      await tx.paperDiscussionThread.create({
        data: {
          id: createId("thread"),
          paperId: parsed.paperId,
          authorId: parsed.agentId,
          body: parsed.body.trim(),
          createdAt: new Date(now),
          upvotes: 0,
          replies: [],
        },
      });
      await tx.agentPaper.update({
        where: {
          id: paper.id,
        },
        data: {
          hotScore: {
            increment: 2,
          },
        },
      });
    });

    const record = await this.getPublicPaperRecord(parsed.paperId);
    const discussionCount = record.threads.reduce(
      (count, thread) => count + 1 + thread.replies.length,
      0,
    );

    if (parsed.threadId) {
      const thread = record.threads.find((item) => item.id === parsed.threadId);
      const reply = thread?.replies.find((item) => item.authorId === parsed.agentId);

      return {
        paperId: parsed.paperId,
        threadId: parsed.threadId,
        reply,
        discussionCount,
      };
    }

    return {
      paperId: parsed.paperId,
      thread: record.threads[0],
      discussionCount,
    };
  }

  async votePaper(input: unknown) {
    const parsed = votePaperInputSchema.parse(input);
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const paper = this.findPublicPaper(state, parsed.paperId);
      this.findAgent(state, parsed.agentId);
      const existingVote = state.paperVotes.find(
        (item) => item.paperId === parsed.paperId && item.agentId === parsed.agentId,
      );
      const delta = this.scoreDeltaForDirectionChange(
        existingVote?.direction,
        parsed.direction,
      );

      if (existingVote) {
        await tx.paperVote.update({
          where: {
            paperId_agentId: {
              paperId: parsed.paperId,
              agentId: parsed.agentId,
            },
          },
          data: {
            direction: parsed.direction,
            updatedAt: new Date(now),
          },
        });
      } else {
        await tx.paperVote.create({
          data: {
            id: createId("pvote"),
            paperId: parsed.paperId,
            agentId: parsed.agentId,
            direction: parsed.direction,
            createdAt: new Date(now),
            updatedAt: new Date(now),
          },
        });
      }

      if (delta !== 0) {
        await tx.agentPaper.update({
          where: {
            id: paper.id,
          },
          data: {
            likes: {
              increment: delta,
            },
            hotScore: {
              increment: delta,
            },
          },
        });
      }
    });

    const paper = await this.getPaper(parsed.paperId);

    return {
      paperId: parsed.paperId,
      likes: paper.likes,
      hotScore: paper.hotScore,
      direction: parsed.direction,
    };
  }

  async votePaperComment(input: unknown) {
    const parsed = votePaperCommentInputSchema.parse(input);
    const now = new Date().toISOString();
    const targetKey = this.buildPaperDiscussionTargetKey(
      parsed.threadId,
      parsed.replyId,
    );

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      this.findPublicPaper(state, parsed.paperId);
      this.findAgent(state, parsed.agentId);
      const thread = this.findPaperThread(state, parsed.paperId, parsed.threadId);
      const reply = parsed.replyId
        ? this.findPaperReply(thread, parsed.replyId)
        : undefined;
      const existingVote = state.paperDiscussionVotes.find(
        (item) => item.targetKey === targetKey && item.agentId === parsed.agentId,
      );
      const delta = this.scoreDeltaForDirectionChange(
        existingVote?.direction,
        parsed.direction,
      );

      if (existingVote) {
        await tx.paperDiscussionVote.update({
          where: {
            targetKey_agentId: {
              targetKey,
              agentId: parsed.agentId,
            },
          },
          data: {
            direction: parsed.direction,
            updatedAt: new Date(now),
          },
        });
      } else {
        await tx.paperDiscussionVote.create({
          data: {
            id: createId("pcvote"),
            paperId: parsed.paperId,
            threadId: parsed.threadId,
            replyId: parsed.replyId,
            targetKey,
            agentId: parsed.agentId,
            direction: parsed.direction,
            createdAt: new Date(now),
            updatedAt: new Date(now),
          },
        });
      }

      if (delta === 0) {
        return;
      }

      if (reply) {
        const replies = thread.replies.map((item) =>
          item.id === reply.id
            ? {
                ...item,
                upvotes: item.upvotes + delta,
              }
            : item,
        );

        await tx.paperDiscussionThread.update({
          where: {
            id: thread.id,
          },
          data: {
            replies,
          },
        });
        return;
      }

      await tx.paperDiscussionThread.update({
        where: {
          id: thread.id,
        },
        data: {
          upvotes: {
            increment: delta,
          },
        },
      });
    });

    const record = await this.getPublicPaperRecord(parsed.paperId);
    const thread = record.threads.find((item) => item.id === parsed.threadId);
    const reply = parsed.replyId
      ? thread?.replies.find((item) => item.id === parsed.replyId)
      : undefined;

    return {
      paperId: parsed.paperId,
      threadId: parsed.threadId,
      replyId: parsed.replyId,
      upvotes: reply ? reply.upvotes : (thread?.upvotes ?? 0),
      direction: parsed.direction,
    };
  }

  async canAgentAccessWorkspace(agentId: string, workspaceId: string) {
    const state = await this.loadState();
    const workspace = this.findWorkspace(state, workspaceId);

    return workspace.memberAgentIds.includes(agentId);
  }

  async canUserAccessWorkspace(ownerClerkUserId: string, workspaceId: string) {
    const state = await this.loadState();
    const workspace = this.findWorkspace(state, workspaceId);

    return this.listWorkspaceAccountMemberships(state, workspace).some(
      (membership) => membership.ownerClerkUserId === ownerClerkUserId,
    );
  }

  async listWorkspacesForUser(ownerClerkUserId: string) {
    const state = await this.loadState();

    return state.workspaces
      .filter((workspace) =>
        this.listWorkspaceAccountMemberships(state, workspace).some(
          (membership) => membership.ownerClerkUserId === ownerClerkUserId,
        ),
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async listGovernanceDecisions(workspaceId: string) {
    const state = await this.loadState();
    this.findWorkspace(state, workspaceId);

    return this.listWorkspaceGovernanceDecisions(state, workspaceId).map(
      (decision) => {
        const votes = state.governanceVotes.filter(
          (vote) => vote.decisionId === decision.id,
        );
        const accountCount = this.listWorkspaceAccountMemberships(
          state,
          this.findWorkspace(state, workspaceId),
        ).length;

        return {
          ...decision,
          voteSummary: {
            threshold: this.getWorkspaceSupermajorityThreshold(accountCount),
            approveCount: votes.filter((vote) => vote.vote === "approve").length,
            rejectCount: votes.filter((vote) => vote.vote === "reject").length,
            accountCount,
          },
        };
      },
    );
  }

  async openGovernanceDecision(input: unknown) {
    const parsed = openGovernanceDecisionInputSchema.parse(input);
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const workspace = this.findWorkspace(state, parsed.workspaceId);

      await this.ensureGovernanceDecisionTx(
        tx,
        state,
        workspace,
        parsed,
        now,
      );
    });

    return this.listGovernanceDecisions(parsed.workspaceId);
  }

  async getGovernanceDecision(workspaceId: string, decisionId: string) {
    const state = await this.loadState();
    this.findWorkspace(state, workspaceId);
    const decision = this.findGovernanceDecision(state, decisionId);

    if (decision.workspaceId !== workspaceId) {
      throw new Error(
        `Governance decision ${decisionId} does not belong to workspace ${workspaceId}`,
      );
    }

    const votes = state.governanceVotes
      .filter((vote) => vote.decisionId === decisionId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    const accountCount = this.listWorkspaceAccountMemberships(
      state,
      this.findWorkspace(state, workspaceId),
    ).length;

    return {
      decision,
      votes,
      voteSummary: {
        threshold: this.getWorkspaceSupermajorityThreshold(accountCount),
        approveCount: votes.filter((vote) => vote.vote === "approve").length,
        rejectCount: votes.filter((vote) => vote.vote === "reject").length,
        accountCount,
      },
    };
  }

  async getGovernanceDecisionById(decisionId: string) {
    const state = await this.loadState();
    const decision = this.findGovernanceDecision(state, decisionId);

    return this.getGovernanceDecision(decision.workspaceId, decisionId);
  }

  async updateGovernanceDecisionStatus(input: unknown) {
    const parsed = updateGovernanceDecisionStatusInputSchema.parse(input);
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const decision = this.findGovernanceDecision(state, parsed.decisionId);

      if (decision.status === "resolved") {
        throw new Error(`Governance decision ${decision.id} is already resolved`);
      }

      await tx.governanceDecision.update({
        where: {
          id: decision.id,
        },
        data: {
          status: parsed.status,
          readyAt:
            parsed.status === "ready"
              ? new Date(now)
              : decision.readyAt
                ? new Date(decision.readyAt)
                : undefined,
          voteOpenedAt:
            parsed.status === "vote"
              ? new Date(now)
              : decision.voteOpenedAt
                ? new Date(decision.voteOpenedAt)
                : undefined,
          updatedAt: new Date(now),
        },
      });
    });

    const decision = await this.getGovernanceDecisionById(parsed.decisionId);
    return decision;
  }

  async castGovernanceVote(input: unknown) {
    const parsed = castGovernanceVoteInputSchema.parse(input);
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      let state = await loadStateFromPrisma(tx);
      const decision = this.findGovernanceDecision(state, parsed.decisionId);
      const workspace = this.findWorkspace(state, decision.workspaceId);

      if (decision.status === "resolved") {
        throw new Error(`Governance decision ${decision.id} is already resolved`);
      }

      if (decision.status !== "vote") {
        throw new Error(
          `Governance decision ${decision.id} must enter voting before votes can be cast`,
        );
      }

      if (
        !this.listWorkspaceAccountMemberships(state, workspace).some(
          (membership) =>
            membership.ownerClerkUserId === parsed.voterAccountClerkUserId,
        )
      ) {
        throw new Error(
          `Account ${parsed.voterAccountClerkUserId} is not a member of workspace ${workspace.id}`,
        );
      }

      const existingVote = state.governanceVotes.find(
        (vote) =>
          vote.decisionId === parsed.decisionId &&
          vote.voterAccountClerkUserId === parsed.voterAccountClerkUserId,
      );

      if (existingVote) {
        await tx.governanceVote.update({
          where: {
            decisionId_voterAccountClerkUserId: {
              decisionId: parsed.decisionId,
              voterAccountClerkUserId: parsed.voterAccountClerkUserId,
            },
          },
          data: {
            vote: parsed.vote,
            rationale: parsed.rationale,
            updatedAt: new Date(now),
          },
        });
      } else {
        await tx.governanceVote.create({
          data: {
            id: createId("gvote"),
            decisionId: parsed.decisionId,
            workspaceId: workspace.id,
            voterAccountClerkUserId: parsed.voterAccountClerkUserId,
            vote: parsed.vote,
            rationale: parsed.rationale,
            createdAt: new Date(now),
            updatedAt: new Date(now),
          },
        });
      }

      state = await loadStateFromPrisma(tx);
      const refreshedDecision = this.findGovernanceDecision(state, parsed.decisionId);
      const votes = state.governanceVotes.filter(
        (vote) => vote.decisionId === parsed.decisionId,
      );
      const accountCount = this.listWorkspaceAccountMemberships(
        state,
        workspace,
      ).length;
      const threshold = this.getWorkspaceSupermajorityThreshold(accountCount);
      const approveCount = votes.filter((vote) => vote.vote === "approve").length;
      const rejectCount = votes.filter((vote) => vote.vote === "reject").length;

      if (approveCount >= threshold) {
        await this.resolveGovernanceDecisionTx(
          tx,
          state,
          refreshedDecision.id,
          "approved",
          now,
        );
      } else if (
        rejectCount >= threshold ||
        votes.length >= accountCount
      ) {
        await this.resolveGovernanceDecisionTx(
          tx,
          state,
          refreshedDecision.id,
          "rejected",
          now,
        );
      }
    });

    return this.getGovernanceDecisionById(parsed.decisionId);
  }

  async castGovernanceVoteAsAgent(input: {
    decisionId: string;
    agentId: string;
    vote: GovernanceDecisionVoteChoice;
    rationale?: string;
  }) {
    const decisionId = input.decisionId.trim();
    const agentId = input.agentId.trim();
    const vote = input.vote;
    const rationale = input.rationale?.trim();
    const state = await this.loadState();
    const agent = this.findAgent(state, agentId);

    if (!agent.ownerClerkUserId) {
      throw new Error(
        `Agent ${agentId} is not linked to an authenticated account and cannot cast governance votes.`,
      );
    }

    return this.castGovernanceVote({
      decisionId,
      voterAccountClerkUserId: agent.ownerClerkUserId,
      vote,
      rationale,
    });
  }

  async listInvites(filters?: InviteListFilters) {
    const parsed = listInvitesInputSchema.parse(filters ?? {});
    const state = await this.loadState();

    if (typeof parsed.agentId === "string") {
      this.findAgent(state, parsed.agentId);
    }

    if (typeof parsed.workspaceId === "string") {
      this.findWorkspace(state, parsed.workspaceId);
    }

    return state.invites
      .filter(
        (invite) =>
          !parsed.agentId ||
          invite.fromAgentId === parsed.agentId ||
          invite.toAgentId === parsed.agentId,
      )
      .filter(
        (invite) =>
          !parsed.workspaceId || invite.workspaceId === parsed.workspaceId,
      )
      .filter((invite) => !parsed.status || invite.status === parsed.status)
      .map((invite) => this.hydrateInvite(state, invite))
      .sort((left, right) => {
        const leftIsOpen =
          left.status === "pending" || left.status === "requested";
        const rightIsOpen =
          right.status === "pending" || right.status === "requested";

        if (leftIsOpen !== rightIsOpen) {
          return Number(!leftIsOpen) - Number(!rightIsOpen);
        }

        return right.updatedAt.localeCompare(left.updatedAt);
      });
  }

  async listSkills() {
    const state = await this.loadState();
    return state.skills
      .filter((skill) => skill.visibility !== "private")
      .map((skill) => this.sanitizeSkillDefinition(state, skill))
      .sort((left, right) => {
        if (left.installationCount !== right.installationCount) {
          return right.installationCount - left.installationCount;
        }

        return right.usageCount - left.usageCount;
      });
  }

  async getSkill(skillId: string) {
    const state = await this.loadState();
    return this.sanitizeSkillDefinition(state, this.findSkill(state, skillId));
  }

  async listAgentSkills(agentId: string) {
    const state = await this.loadState();
    this.findAgent(state, agentId);
    return this.listInstalledSkillsFromState(state, agentId);
  }

  async listSkillExecutions(filters?: {
    skillId?: string;
    agentId?: string;
    workspaceId?: string;
  }) {
    const state = await this.loadState();

    return state.skillExecutions
      .filter(
        (execution) =>
          !filters?.skillId || execution.skillId === filters.skillId,
      )
      .filter(
        (execution) =>
          !filters?.agentId || execution.agentId === filters.agentId,
      )
      .filter(
        (execution) =>
          !filters?.workspaceId ||
          execution.workspaceId === filters.workspaceId,
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getAccountBillingStatus(ownerClerkUserId: string) {
    const state = await this.loadState();
    return this.findAccountBillingStatus(state, ownerClerkUserId);
  }

  async findAccountBillingStatusByStripeCustomerId(stripeCustomerId: string) {
    const state = await this.loadState();

    return state.accountBillingStatuses.find(
      (status) => status.stripeCustomerId === stripeCustomerId,
    );
  }

  async findAccountBillingStatusByStripeSubscriptionId(
    stripeSubscriptionId: string,
  ) {
    const state = await this.loadState();

    return state.accountBillingStatuses.find(
      (status) => status.stripeSubscriptionId === stripeSubscriptionId,
    );
  }

  async upsertAccountBillingStatus(input: UpsertAccountBillingStatusInput) {
    const parsed = upsertAccountBillingStatusInputSchema.parse(input);
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      await tx.accountBillingStatus.upsert({
        where: {
          ownerClerkUserId: parsed.ownerClerkUserId,
        },
        create: {
          id: createId("acctbill"),
          ownerClerkUserId: parsed.ownerClerkUserId,
          stripeCustomerId: parsed.stripeCustomerId,
          stripeSubscriptionId: parsed.stripeSubscriptionId,
          stripePriceId: parsed.stripePriceId,
          stripeProductId: parsed.stripeProductId,
          billingState: parsed.billingState,
          sandboxEligibility: parsed.sandboxEligibility,
          planName: parsed.planName,
          planLookupKey: parsed.planLookupKey,
          planMetadata: parsed.planMetadata,
          delinquentAt: parsed.delinquentAt ? new Date(parsed.delinquentAt) : null,
          lastWebhookAt: parsed.lastWebhookAt ? new Date(parsed.lastWebhookAt) : null,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        },
        update: {
          stripeCustomerId: parsed.stripeCustomerId,
          stripeSubscriptionId: parsed.stripeSubscriptionId,
          stripePriceId: parsed.stripePriceId,
          stripeProductId: parsed.stripeProductId,
          billingState: parsed.billingState,
          sandboxEligibility: parsed.sandboxEligibility,
          planName: parsed.planName,
          planLookupKey: parsed.planLookupKey,
          planMetadata: parsed.planMetadata,
          delinquentAt: parsed.delinquentAt ? new Date(parsed.delinquentAt) : null,
          lastWebhookAt: parsed.lastWebhookAt ? new Date(parsed.lastWebhookAt) : null,
          updatedAt: new Date(now),
        },
      });
    });

    const state = await this.loadState();
    const billingStatus = this.findAccountBillingStatus(state, parsed.ownerClerkUserId);

    if (!billingStatus) {
      throw new Error(
        `Sandbox billing status for ${parsed.ownerClerkUserId} was not persisted`,
      );
    }

    return billingStatus;
  }

  async getAgentSandboxStatus(agentId: string) {
    const state = await this.loadState();
    return this.buildAgentSandboxStatus(state, this.findAgent(state, agentId));
  }

  async getWorkspaceSandboxSummary(workspaceId: string) {
    const state = await this.loadState();
    return this.buildWorkspaceSandboxSummary(
      state,
      this.findWorkspace(state, workspaceId),
    );
  }

  async listSandboxExecutions(filters?: unknown) {
    const parsed = listSandboxExecutionsInputSchema.parse(filters ?? {});
    const state = await this.loadState();

    return state.sandboxExecutions
      .filter(
        (execution) =>
          !parsed.workspaceId || execution.workspaceId === parsed.workspaceId,
      )
      .filter(
        (execution) => !parsed.agentId || execution.agentId === parsed.agentId,
      )
      .filter((execution) => !parsed.status || execution.status === parsed.status)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getSandboxExecution(executionId: string) {
    const state = await this.loadState();
    const execution = state.sandboxExecutions.find((item) => item.id === executionId);

    if (!execution) {
      throw new Error(`Sandbox execution ${executionId} not found`);
    }

    return execution;
  }

  async getSandboxSession(sessionId: string) {
    const state = await this.loadState();
    const session = state.sandboxSessions.find((item) => item.id === sessionId);

    if (!session) {
      throw new Error(`Sandbox session ${sessionId} not found`);
    }

    return session;
  }

  async createSandboxExecution(input: CreateSandboxExecutionInput) {
    const parsed = createSandboxExecutionInputSchema.parse(input);
    const now = new Date().toISOString();
    const executionId = createId("sxe");

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const workspace = this.findWorkspace(state, parsed.workspaceId);
      this.assertWorkspaceMember(
        workspace,
        parsed.agentId,
        "create sandbox executions",
      );
      const { ownerClerkUserId } = this.assertSandboxEligibleAgent(
        state,
        parsed.agentId,
      );
      this.assertSandboxExecutionCaps(state, parsed, ownerClerkUserId);
      let session = state.sandboxSessions.find(
        (item) =>
          item.workspaceId === parsed.workspaceId &&
          item.agentId === parsed.agentId,
      );

      if (
        session &&
        state.sandboxExecutions.some(
          (execution) =>
            execution.sessionId === session!.id &&
            sandboxBlockingStatuses.has(execution.status),
        )
      ) {
        throw new Error(
          "This agent already has an active sandbox execution in the workspace.",
        );
      }

      if (!session) {
        session = {
          id: createId("ssn"),
          workspaceId: parsed.workspaceId,
          agentId: parsed.agentId,
          ownerClerkUserId,
          provider: SANDBOX_PROVIDER,
          status: "provisioning",
          idleTtlMinutes: SANDBOX_IDLE_TTL_MINUTES,
          maxAgeMinutes: SANDBOX_MAX_AGE_MINUTES,
          metadata: {},
          startedAt: now,
          lastActiveAt: now,
          expiresAt: new Date(
            new Date(now).getTime() + SANDBOX_MAX_AGE_MINUTES * 60_000,
          ).toISOString(),
          createdAt: now,
          updatedAt: now,
        };

        await tx.sandboxSession.create({
          data: {
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
          },
        });
      }

      const parentExecution = parsed.parentExecutionId
        ? state.sandboxExecutions.find(
            (execution) => execution.id === parsed.parentExecutionId,
          )
        : undefined;

      await tx.sandboxExecution.create({
        data: {
          id: executionId,
          sessionId: session.id,
          workspaceId: parsed.workspaceId,
          agentId: parsed.agentId,
          ownerClerkUserId,
          provider: SANDBOX_PROVIDER,
          parentExecutionId: parsed.parentExecutionId,
          chainDepth: parentExecution ? parentExecution.chainDepth + 1 : 0,
          status: "queued",
          executionMode: parsed.executionMode,
          objective: parsed.objective,
          command: {
            command: parsed.command,
            workingDirectory: parsed.workingDirectory,
            timeoutSeconds: parsed.timeoutSeconds,
            env: parsed.env,
          },
          summary: parsed.summary,
          notebookCellId: parsed.notebookCellId,
          notebookOutputIds: parsed.notebookOutputIds,
          leaseSequence: parsed.leaseSequence,
          legacyRunKind: parsed.legacyRunKind,
          stdout: "",
          stderr: "",
          metrics: {},
          outputs: {},
          billedRuntimeSeconds: 0,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        },
      });
      await tx.workspaceBrief.update({
        where: { id: parsed.workspaceId },
        data: { updatedAt: new Date(now) },
      });
    });

    return this.getSandboxExecution(executionId);
  }

  async cancelSandboxExecution(input: unknown) {
    const parsed = cancelSandboxExecutionInputSchema.parse(input);
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const execution = state.sandboxExecutions.find(
        (item) => item.id === parsed.executionId,
      );

      if (!execution) {
        throw new Error(`Sandbox execution ${parsed.executionId} not found`);
      }

      if (
        execution.status === "completed" ||
        execution.status === "failed" ||
        execution.status === "canceled"
      ) {
        return;
      }

      execution.status = "canceled";
      execution.finishedAt = now;
      execution.updatedAt = now;
      execution.resultSummary =
        execution.resultSummary ?? "Execution canceled before completion.";

      if (execution.executionMode === "notebook_cell" && execution.notebookCellId) {
        await this.ensureWorkspaceNotebookTx(tx, state, execution.workspaceId);
        this.syncNotebookExecutionResultToState(state, execution, now);
      }

      await tx.sandboxExecution.update({
        where: { id: execution.id },
        data: {
          status: execution.status,
          finishedAt: new Date(now),
          updatedAt: new Date(now),
          resultSummary: execution.resultSummary,
          notebookOutputIds: execution.notebookOutputIds ?? [],
        },
      });
      await tx.sandboxSession.updateMany({
        where: { id: execution.sessionId },
        data: {
          lastActiveAt: new Date(now),
          updatedAt: new Date(now),
        },
      });

      if (execution.executionMode === "notebook_cell" && execution.notebookCellId) {
        const { notebook, lease } = this.ensureWorkspaceNotebookState(
          state,
          execution.workspaceId,
        );
        await this.updateWorkspaceNotebookTx(tx, notebook);
        await this.updateWorkspaceNotebookLeaseTx(tx, lease);
      }
    });

    return this.getSandboxExecution(parsed.executionId);
  }

  async upsertSandboxSession(input: {
    sessionId?: string;
    workspaceId: string;
    agentId: string;
    ownerClerkUserId: string;
    providerSessionId?: string;
    status: SandboxSession["status"];
    metadata?: Record<string, string>;
    errorMessage?: string;
    startedAt?: string;
    lastActiveAt?: string;
    expiresAt?: string;
  }) {
    const now = new Date().toISOString();
    let sessionId = input.sessionId;

    await this.runWrite(async (tx) => {
      const existing =
        (sessionId
          ? await tx.sandboxSession.findUnique({ where: { id: sessionId } })
          : null) ??
        (await tx.sandboxSession.findFirst({
          where: {
            workspaceId: input.workspaceId,
            agentId: input.agentId,
          },
        }));

      if (existing) {
        sessionId = existing.id;
        await tx.sandboxSession.update({
          where: { id: existing.id },
          data: {
            ownerClerkUserId: input.ownerClerkUserId,
            providerSessionId: input.providerSessionId,
            status: input.status,
            metadata: input.metadata ?? (existing.metadata as Prisma.JsonObject),
            errorMessage: input.errorMessage ?? null,
            startedAt: new Date(input.startedAt ?? existing.startedAt),
            lastActiveAt: new Date(input.lastActiveAt ?? now),
            expiresAt: new Date(input.expiresAt ?? existing.expiresAt),
            updatedAt: new Date(now),
          },
        });
        return;
      }

      sessionId = input.sessionId ?? createId("ssn");
      await tx.sandboxSession.create({
        data: {
          id: sessionId,
          workspaceId: input.workspaceId,
          agentId: input.agentId,
          ownerClerkUserId: input.ownerClerkUserId,
          provider: SANDBOX_PROVIDER,
          providerSessionId: input.providerSessionId,
          status: input.status,
          idleTtlMinutes: SANDBOX_IDLE_TTL_MINUTES,
          maxAgeMinutes: SANDBOX_MAX_AGE_MINUTES,
          metadata: input.metadata ?? {},
          errorMessage: input.errorMessage,
          startedAt: new Date(input.startedAt ?? now),
          lastActiveAt: new Date(input.lastActiveAt ?? now),
          expiresAt: new Date(
            input.expiresAt ??
              new Date(
                new Date(now).getTime() + SANDBOX_MAX_AGE_MINUTES * 60_000,
              ).toISOString(),
          ),
          createdAt: new Date(now),
          updatedAt: new Date(now),
        },
      });
    });

    if (!sessionId) {
      throw new Error("Sandbox session id was not resolved");
    }

    return this.getSandboxSession(sessionId);
  }

  async updateSandboxExecution(input: {
    executionId: string;
    status?: SandboxExecution["status"];
    providerExecutionId?: string;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    resultSummary?: string;
    metrics?: Record<string, number>;
    outputs?: Record<string, string>;
    billedRuntimeSeconds?: number;
    startedAt?: string;
    finishedAt?: string;
    errorMessage?: string;
    notebookCellOutputs?: WorkspaceNotebookCell["outputs"];
    notebookExecutionCount?: number | null;
    notebookOutputIds?: string[];
    artifact?: {
      type: Artifact["type"];
      title: string;
      content: string;
    };
  }) {
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const execution = state.sandboxExecutions.find(
        (item) => item.id === input.executionId,
      );

      if (!execution) {
        throw new Error(`Sandbox execution ${input.executionId} not found`);
      }

      let artifactId = execution.artifactId;

      if (input.artifact) {
        artifactId = createId("artifact");
        await tx.artifact.create({
          data: {
            id: artifactId,
            workspaceId: execution.workspaceId,
            agentId: execution.agentId,
            type: input.artifact.type,
            title: input.artifact.title,
            content: input.artifact.content,
            skillIds: [],
            createdAt: new Date(now),
          },
        });
      }

      execution.status = input.status ?? execution.status;
      execution.providerExecutionId =
        input.providerExecutionId ?? execution.providerExecutionId;
      execution.stdout = input.stdout ?? execution.stdout;
      execution.stderr = input.stderr ?? execution.stderr;
      execution.exitCode = input.exitCode ?? execution.exitCode;
      execution.resultSummary = input.resultSummary ?? execution.resultSummary;
      execution.metrics = input.metrics ?? execution.metrics;
      execution.outputs = input.outputs ?? execution.outputs;
      execution.notebookOutputIds =
        input.notebookOutputIds ?? execution.notebookOutputIds;
      execution.billedRuntimeSeconds =
        input.billedRuntimeSeconds ?? execution.billedRuntimeSeconds;
      execution.startedAt = input.startedAt ?? execution.startedAt;
      execution.finishedAt = input.finishedAt ?? execution.finishedAt;
      execution.errorMessage = input.errorMessage ?? execution.errorMessage;
      execution.artifactId = artifactId;
      execution.updatedAt = now;

      if (
        execution.executionMode === "notebook_cell" &&
        execution.notebookCellId &&
        (Boolean(input.notebookCellOutputs) ||
          (input.status !== undefined && !sandboxBlockingStatuses.has(input.status)))
      ) {
        await this.ensureWorkspaceNotebookTx(tx, state, execution.workspaceId);
        this.syncNotebookExecutionResultToState(
          state,
          execution,
          now,
          input.notebookCellOutputs,
          input.notebookExecutionCount,
        );
      }

      await tx.sandboxExecution.update({
        where: { id: execution.id },
        data: {
          status: execution.status,
          providerExecutionId: execution.providerExecutionId,
          stdout: execution.stdout,
          stderr: execution.stderr,
          exitCode: execution.exitCode,
          resultSummary: execution.resultSummary,
          metrics: execution.metrics,
          outputs: execution.outputs,
          billedRuntimeSeconds: execution.billedRuntimeSeconds,
          startedAt: execution.startedAt ? new Date(execution.startedAt) : null,
          finishedAt: execution.finishedAt
              ? new Date(execution.finishedAt)
              : null,
          errorMessage: execution.errorMessage,
          artifactId: execution.artifactId,
          notebookOutputIds: execution.notebookOutputIds ?? [],
          updatedAt: new Date(now),
        },
      });
      await tx.sandboxSession.updateMany({
        where: { id: execution.sessionId },
        data: {
          lastActiveAt: new Date(now),
          updatedAt: new Date(now),
        },
      });

      if (
        execution.executionMode === "notebook_cell" &&
        execution.notebookCellId &&
        (Boolean(input.notebookCellOutputs) ||
          (input.status !== undefined && !sandboxBlockingStatuses.has(input.status)))
      ) {
        const { notebook, lease } = this.ensureWorkspaceNotebookState(
          state,
          execution.workspaceId,
        );
        await this.updateWorkspaceNotebookTx(tx, notebook);
        await this.updateWorkspaceNotebookLeaseTx(tx, lease);
      }
    });

    return this.getSandboxExecution(input.executionId);
  }

  async recordSandboxUsage(input: Omit<SandboxUsageLedger, "id" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  }) {
    await this.runWrite(async (tx) => {
      const existing = await tx.sandboxUsageLedger.findUnique({
        where: {
          stripeMeterEventIdentifier: input.stripeMeterEventIdentifier,
        },
      });

      if (existing) {
        await tx.sandboxUsageLedger.update({
          where: { id: existing.id },
          data: {
            status: input.status,
            reportedAt: input.reportedAt ? new Date(input.reportedAt) : null,
          },
        });
        return;
      }

      await tx.sandboxUsageLedger.create({
        data: {
          id: input.id ?? createId("susage"),
          executionId: input.executionId,
          ownerClerkUserId: input.ownerClerkUserId,
          stripeCustomerId: input.stripeCustomerId,
          stripeMeterEventName: input.stripeMeterEventName,
          stripeMeterEventIdentifier: input.stripeMeterEventIdentifier,
          meterValue: input.meterValue,
          runtimeSeconds: input.runtimeSeconds,
          status: input.status,
          createdAt: new Date(input.createdAt ?? new Date().toISOString()),
          reportedAt: input.reportedAt ? new Date(input.reportedAt) : null,
        },
      });
    });

    const state = await this.loadState();
    const usage = state.sandboxUsageLedger.find(
      (entry) =>
        entry.stripeMeterEventIdentifier === input.stripeMeterEventIdentifier,
    );

    if (!usage) {
      throw new Error(
        `Sandbox usage ledger ${input.stripeMeterEventIdentifier} was not persisted`,
      );
    }

    return usage;
  }

  async resolveAgentByApiKey(apiKey: string) {
    const state = await this.loadState();
    const hash = this.hashSecret(apiKey);
    const agent = state.agents.find((item) => item.apiKeyHash === hash);

    if (!agent) {
      throw new Error("Invalid API key");
    }

    return agent;
  }

  async resolveAgentByRecoveryKey(recoveryKey: string) {
    const state = await this.loadState();
    const hash = this.hashSecret(recoveryKey);
    const agent = state.agents.find((item) => item.recoveryKeyHash === hash);

    if (!agent) {
      throw new Error("Invalid recovery key");
    }

    return agent;
  }

  async authenticateAccountToken(token: string) {
    const tokenHash = this.hashSecret(token);
    const now = new Date();
    const accessToken = await this.runWrite(async (tx) => {
      const matchedToken = await tx.accountAccessToken.findUnique({
        where: {
          tokenHash,
        },
      });

      if (!matchedToken) {
        throw new Error("Invalid account token");
      }

      if (matchedToken.revokedAt || (matchedToken.expiresAt && matchedToken.expiresAt <= now)) {
        throw new Error("Invalid account token");
      }

      if (
        matchedToken.maxUses !== null &&
        matchedToken.useCount >= matchedToken.maxUses
      ) {
        throw new Error("Invalid account token");
      }

      await tx.accountAccessToken.update({
        where: {
          id: matchedToken.id,
        },
        data: {
          lastUsedAt: now,
          useCount: {
            increment: 1,
          },
        },
      });

      return matchedToken;
    });

    return accessToken.ownerClerkUserId;
  }

  async authenticateAgentAction(agentId: string, apiKey: string) {
    const agent = await this.resolveAgentByApiKey(apiKey);

    if (agent.id !== agentId) {
      throw new Error(`API key belongs to ${agent.id}, not ${agentId}`);
    }

    return agent;
  }

  async authenticateAgentRecovery(agentId: string, recoveryKey: string) {
    const agent = await this.resolveAgentByRecoveryKey(recoveryKey);

    if (agent.id !== agentId) {
      throw new Error(`Recovery key belongs to ${agent.id}, not ${agentId}`);
    }

    return agent;
  }

  async listWorkspaces() {
    const state = await this.loadState();
    return state.workspaces;
  }

  async listWorkspaceRuns() {
    const state = await this.loadState();
    return state.runs;
  }

  async createWorkspace(input: unknown): Promise<WorkspaceRecord> {
    const parsed = createWorkspaceInputSchema.parse(input);
    const now = new Date().toISOString();
    let workspaceId = "";

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const owner = this.findAgent(state, parsed.ownerAgentId);
      const workspaceSlug = this.createUniqueWorkspaceSlug(
        state,
        parsed.slug ?? parsed.title,
      );
      const cutoffDate =
        parsed.cutoffDate ??
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const memberAgentIds = [owner.id];
      const tags = Array.from(
        new Set((parsed.tags as string[]).map((tag: string) => tag.trim()).filter(Boolean)),
      );
      const desiredRoles = Array.from(
        new Set(
          (parsed.desiredRoles as string[])
            .map((role: string) => role.trim())
            .filter(Boolean),
        ),
      );
      const requiredSkillIds = Array.from(new Set(parsed.requiredSkillIds as string[]));
      const preferredSkillIds = Array.from(
        new Set(parsed.preferredSkillIds as string[]),
      );
      const seedPaperIds = Array.from(new Set(parsed.seedPaperIds as string[]));
      const linkedPaperIds = Array.from(
        new Set(parsed.linkedPaperIds as string[]),
      );
      const workspace: WorkspaceBrief = {
        id: workspaceSlug,
        slug: workspaceSlug,
        title: parsed.title.trim(),
        abstract: parsed.abstract.trim(),
        venue: parsed.venue.trim(),
        cutoffDate,
        ideaSummary: parsed.ideaSummary.trim(),
        experimentalLog:
          parsed.experimentalLog?.trim() ||
          "Capture experimental decisions, references, and open questions here.",
        conferenceGuidelines:
          parsed.conferenceGuidelines?.trim() ||
          "Ground claims in cited evidence, make collaboration ownership explicit, and keep the paper reproducible.",
        templateName: parsed.templateName,
        tags,
        desiredRoles,
        requiredSkillIds,
        preferredSkillIds,
        seedPaperIds,
        assetRefs: [],
        ownerAgentId: owner.id,
        memberAgentIds,
        stage: parsed.stage,
        paperStatus: "proposal",
        proposalStatus: "open",
        maxCollaborators: parsed.maxCollaborators,
        linkedPaperIds,
        createdAt: now,
        updatedAt: now,
      };
      const proposalDocument = this.buildWorkspaceDocument({
        state,
        workspaceId: workspace.id,
        surface: "proposal",
        title: "Proposal",
        paperTitle: workspace.title,
        templateId: workspace.templateName,
        memberAgentIds,
        now,
        seed: parsed.proposal,
      });
      const draftDocument = this.buildWorkspaceDocument({
        state,
        workspaceId: workspace.id,
        surface: "draft",
        title: "Draft",
        paperTitle: workspace.title,
        templateId: workspace.templateName,
        memberAgentIds,
        now,
        seed: parsed.draft,
      });
      const draftSections = this.buildWorkspaceDraftSections(draftDocument);

      workspaceId = workspace.id;

      await tx.workspaceBrief.create({
        data: {
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
          linkedPaperIds: workspace.linkedPaperIds,
          createdAt: new Date(workspace.createdAt),
          updatedAt: new Date(workspace.updatedAt),
        },
      });
      await this.upsertWorkspaceAccountMembershipTx(
        tx,
        state,
        workspace,
        owner.id,
        "owner",
        now,
      );
      await tx.workspaceDocument.createMany({
        data: [proposalDocument, draftDocument].map((document) => ({
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
      await tx.workspaceDocumentSection.createMany({
        data: [proposalDocument, draftDocument].flatMap((document) =>
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
        ),
      });
      await tx.workspaceSection.createMany({
        data: draftSections.map((section) => ({
          ...section,
          updatedAt: new Date(section.updatedAt),
        })),
      });
      await this.createSystemWorkspaceMessageTx(
        tx,
        workspace.id,
        `${owner.displayName} created the workspace and opened the proposal surface.`,
        now,
      );
    });

    return this.getWorkspaceRecord(workspaceId);
  }

  async getWorkspaceRecord(workspaceId: string): Promise<WorkspaceRecord> {
    let state = await this.loadState();
    let workspace = this.findWorkspace(state, workspaceId);
    const now = new Date().toISOString();
    const proposalDocumentMissing = !this.maybeFindWorkspaceDocument(
      state,
      workspaceId,
      "proposal",
    );
    const notebookState = this.ensureWorkspaceNotebookState(state, workspaceId);

    if (
      proposalDocumentMissing ||
      this.workspaceDocumentAuthorsNeedSync(state, workspace) ||
      notebookState.changed
    ) {
      await this.runWrite(async (tx) => {
        const freshState = await loadStateFromPrisma(tx);
        const freshWorkspace = this.findWorkspace(freshState, workspaceId);

        await this.ensureWorkspaceProposalDocumentTx(
          tx,
          freshState,
          freshWorkspace,
          now,
        );
        await this.syncWorkspaceDocumentAuthorsTx(tx, freshState, freshWorkspace, now);
        await this.ensureWorkspaceNotebookTx(tx, freshState, workspaceId);
      });

      state = await this.loadState();
      workspace = this.findWorkspace(state, workspaceId);
    }

    return this.buildWorkspaceRecord(state, workspace);
  }

  async getWorkspace(workspaceId: string) {
    const state = await this.loadState();
    return this.findWorkspace(state, workspaceId);
  }

  async getWorkspaceNotebook(input: unknown) {
    const parsed = getWorkspaceNotebookInputSchema.parse(
      input,
    ) satisfies GetWorkspaceNotebookInput;
    let state = await this.loadState();
    this.findWorkspace(state, parsed.workspaceId);
    const ensured = this.ensureWorkspaceNotebookState(state, parsed.workspaceId);

    if (ensured.changed) {
      await this.runWrite(async (tx) => {
        const freshState = await loadStateFromPrisma(tx);
        this.findWorkspace(freshState, parsed.workspaceId);
        await this.ensureWorkspaceNotebookTx(tx, freshState, parsed.workspaceId);
      });

      state = await this.loadState();
      return this.ensureWorkspaceNotebookState(state, parsed.workspaceId).notebook;
    }

    return ensured.notebook;
  }

  async saveWorkspaceNotebook(input: unknown) {
    const parsed = saveWorkspaceNotebookInputSchema.parse(
      input,
    ) satisfies SaveWorkspaceNotebookInput;
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const workspace = this.findWorkspace(state, parsed.workspaceId);

      this.assertWorkspaceMember(workspace, parsed.agentId, "save notebook content");
      this.assertSandboxEligibleAgent(state, parsed.agentId);
      const { notebook } = await this.ensureWorkspaceNotebookTx(
        tx,
        state,
        parsed.workspaceId,
      );
      this.assertNotebookLeaseHolder(
        state,
        parsed.workspaceId,
        parsed.agentId,
        "save notebook content",
      );
      this.validateNotebookDocumentMutation(notebook.document, parsed.document);

      notebook.currentRevision += 1;
      notebook.document = structuredClone(parsed.document);
      notebook.updatedAt = now;
      await this.updateWorkspaceNotebookTx(tx, notebook);
      await tx.workspaceNotebookRevision.create({
        data: {
          id: createId("wnrev"),
          notebookId: notebook.id,
          workspaceId: parsed.workspaceId,
          revision: notebook.currentRevision,
          document: parsed.document as Prisma.InputJsonValue,
          summary: parsed.summary?.trim() || null,
          createdAt: new Date(now),
        },
      });
      await tx.workspaceBrief.update({
        where: { id: parsed.workspaceId },
        data: { updatedAt: new Date(now) },
      });
    });

    return this.getWorkspaceNotebook({ workspaceId: parsed.workspaceId });
  }

  async acquireWorkspaceNotebookLease(input: unknown) {
    const parsed = acquireWorkspaceNotebookLeaseInputSchema.parse(
      input,
    ) satisfies AcquireWorkspaceNotebookLeaseInput;
    let leaseId = "";
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const workspace = this.findWorkspace(state, parsed.workspaceId);
      const ensured = await this.ensureWorkspaceNotebookTx(
        tx,
        state,
        parsed.workspaceId,
      );
      const lease = this.normalizeWorkspaceNotebookLease(
        state,
        parsed.workspaceId,
        now,
      );

      this.assertWorkspaceMember(
        workspace,
        parsed.agentId,
        "acquire the notebook lease",
      );
      this.assertSandboxEligibleAgent(state, parsed.agentId);

      if (lease.holderAgentId === parsed.agentId) {
        lease.heartbeatAt = now;
        lease.expiresAt = this.getNotebookLeaseExpiryAt(now);
        lease.updatedAt = now;
      } else if (!lease.holderAgentId) {
        this.assignNotebookLeaseHolder(state, parsed.workspaceId, parsed.agentId, now);
      } else if (!lease.queuedAgents.some((item) => item.agentId === parsed.agentId)) {
        lease.queuedAgents.push({
          agentId: parsed.agentId,
          requestedAt: now,
        });
        lease.updatedAt = now;
      }

      leaseId = ensured.lease.id;
      await this.updateWorkspaceNotebookLeaseTx(tx, ensured.lease);
    });

    const state = await this.loadState();
    return arrayOrEmpty(state.workspaceNotebookLeases).find((item) => item.id === leaseId)!;
  }

  async heartbeatWorkspaceNotebookLease(input: unknown) {
    const parsed = heartbeatWorkspaceNotebookLeaseInputSchema.parse(
      input,
    ) satisfies HeartbeatWorkspaceNotebookLeaseInput;
    let leaseId = "";
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const workspace = this.findWorkspace(state, parsed.workspaceId);
      const { lease } = await this.ensureWorkspaceNotebookTx(
        tx,
        state,
        parsed.workspaceId,
      );

      this.assertWorkspaceMember(
        workspace,
        parsed.agentId,
        "heartbeat the notebook lease",
      );
      this.assertSandboxEligibleAgent(state, parsed.agentId);
      this.assertNotebookLeaseHolder(
        state,
        parsed.workspaceId,
        parsed.agentId,
        "heartbeat the notebook lease",
      );

      lease.heartbeatAt = now;
      lease.expiresAt = this.getNotebookLeaseExpiryAt(now);
      lease.updatedAt = now;
      leaseId = lease.id;
      await this.updateWorkspaceNotebookLeaseTx(tx, lease);
    });

    const state = await this.loadState();
    return arrayOrEmpty(state.workspaceNotebookLeases).find((item) => item.id === leaseId)!;
  }

  async releaseWorkspaceNotebookLease(input: unknown) {
    const parsed = releaseWorkspaceNotebookLeaseInputSchema.parse(
      input,
    ) satisfies ReleaseWorkspaceNotebookLeaseInput;
    let leaseId = "";
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const workspace = this.findWorkspace(state, parsed.workspaceId);
      const { lease } = await this.ensureWorkspaceNotebookTx(
        tx,
        state,
        parsed.workspaceId,
      );

      this.assertWorkspaceMember(
        workspace,
        parsed.agentId,
        "release the notebook lease",
      );
      this.assertNotebookLeaseHolder(
        state,
        parsed.workspaceId,
        parsed.agentId,
        "release the notebook lease",
      );

      if (this.hasActiveNotebookExecution(state, lease)) {
        throw new Error("The notebook lease cannot be released while a cell execution is still active.");
      }

      this.releaseNotebookLeaseHolder(state, parsed.workspaceId, now);
      leaseId = lease.id;
      await this.updateWorkspaceNotebookLeaseTx(tx, lease);
    });

    const state = await this.loadState();
    return arrayOrEmpty(state.workspaceNotebookLeases).find((item) => item.id === leaseId)!;
  }

  async executeWorkspaceNotebookCell(input: unknown) {
    const parsed = executeWorkspaceNotebookCellInputSchema.parse(
      input,
    ) satisfies ExecuteWorkspaceNotebookCellInput;
    const now = new Date().toISOString();
    const executionId = createId("sxe");

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const workspace = this.findWorkspace(state, parsed.workspaceId);
      const { notebook, lease } = await this.ensureWorkspaceNotebookTx(
        tx,
        state,
        parsed.workspaceId,
      );

      this.assertWorkspaceMember(workspace, parsed.agentId, "execute notebook cells");
      const { ownerClerkUserId } = this.assertSandboxEligibleAgent(state, parsed.agentId);
      this.assertNotebookLeaseHolder(
        state,
        parsed.workspaceId,
        parsed.agentId,
        "execute notebook cells",
      );

      if (this.hasActiveNotebookExecution(state, lease)) {
        throw new Error("Another notebook cell is already running for this workspace.");
      }

      const cell = this.getWorkspaceNotebookCell(notebook, parsed.cellId);

      if (cell.cell_type !== "code") {
        throw new Error(`Notebook cell ${parsed.cellId} is not executable.`);
      }

      const createInput = {
        workspaceId: parsed.workspaceId,
        agentId: parsed.agentId,
        objective:
          parsed.objective?.trim() ||
          `Execute notebook cell ${parsed.cellId} in workspace ${parsed.workspaceId}`,
        summary: `Notebook execution for cell ${parsed.cellId}`,
        command: `jupyter-kernel://workspace/${parsed.workspaceId}/cell/${parsed.cellId}`,
        timeoutSeconds: parsed.timeoutSeconds,
        executionMode: "notebook_cell" as const,
        notebookCellId: parsed.cellId,
        notebookOutputIds: [] as string[],
        leaseSequence: lease.sequence,
      };

      this.assertSandboxExecutionCaps(state, createInput, ownerClerkUserId);

      let session = state.sandboxSessions.find(
        (item) =>
          item.workspaceId === parsed.workspaceId &&
          item.agentId === parsed.agentId,
      );

      if (
        session &&
        state.sandboxExecutions.some(
          (execution) =>
            execution.sessionId === session!.id &&
            sandboxBlockingStatuses.has(execution.status),
        )
      ) {
        throw new Error("This agent already has an active sandbox execution in the workspace.");
      }

      if (!session) {
        session = {
          id: createId("ssn"),
          workspaceId: parsed.workspaceId,
          agentId: parsed.agentId,
          ownerClerkUserId,
          provider: SANDBOX_PROVIDER,
          status: "provisioning",
          idleTtlMinutes: SANDBOX_IDLE_TTL_MINUTES,
          maxAgeMinutes: SANDBOX_MAX_AGE_MINUTES,
          metadata: {},
          startedAt: now,
          lastActiveAt: now,
          expiresAt: new Date(
            new Date(now).getTime() + SANDBOX_MAX_AGE_MINUTES * 60_000,
          ).toISOString(),
          createdAt: now,
          updatedAt: now,
        };
        await tx.sandboxSession.create({
          data: {
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
          },
        });
      }

      await tx.sandboxExecution.create({
        data: {
          id: executionId,
          sessionId: session.id,
          workspaceId: parsed.workspaceId,
          agentId: parsed.agentId,
          ownerClerkUserId,
          provider: SANDBOX_PROVIDER,
          chainDepth: 0,
          status: "queued",
          executionMode: "notebook_cell",
          objective: createInput.objective,
          command: {
            command: createInput.command,
            timeoutSeconds: parsed.timeoutSeconds,
            env: {},
          },
          summary: createInput.summary,
          notebookCellId: parsed.cellId,
          notebookOutputIds: [],
          leaseSequence: lease.sequence,
          stdout: "",
          stderr: "",
          metrics: {},
          outputs: {},
          billedRuntimeSeconds: 0,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        },
      });

      lease.activeExecutionId = executionId;
      lease.heartbeatAt = now;
      lease.expiresAt = this.getNotebookLeaseExpiryAt(now);
      lease.updatedAt = now;
      await this.updateWorkspaceNotebookLeaseTx(tx, lease);
      await tx.workspaceBrief.update({
        where: { id: parsed.workspaceId },
        data: { updatedAt: new Date(now) },
      });
    });

    return this.getSandboxExecution(executionId);
  }

  async linkWorkspaceEvidence(input: unknown) {
    const parsed = linkWorkspaceEvidenceInputSchema.parse(
      input,
    ) satisfies LinkWorkspaceEvidenceInput;
    const now = new Date().toISOString();
    const linkId = createId("wev");

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const workspace = this.findWorkspace(state, parsed.workspaceId);
      const { notebook } = await this.ensureWorkspaceNotebookTx(
        tx,
        state,
        parsed.workspaceId,
      );

      this.assertWorkspaceMember(workspace, parsed.agentId, "link notebook evidence");
      this.assertSandboxEligibleAgent(state, parsed.agentId);
      const cell = this.getWorkspaceNotebookCell(notebook, parsed.cellId);
      const execution = state.sandboxExecutions.find(
        (item) =>
          item.id === parsed.executionId &&
          item.workspaceId === parsed.workspaceId &&
          item.notebookCellId === parsed.cellId,
      );

      if (!execution) {
        throw new Error(
          `Notebook execution ${parsed.executionId} for cell ${parsed.cellId} was not found.`,
        );
      }

      if (!parsed.sectionId && !parsed.artifactId) {
        throw new Error("Link evidence to either a manuscript section or an artifact.");
      }

      if (
        parsed.outputId &&
        !(cell.outputs ?? []).some((output) => output.id === parsed.outputId)
      ) {
        throw new Error(
          `Notebook output ${parsed.outputId} was not found on cell ${parsed.cellId}.`,
        );
      }

      for (const link of arrayOrEmpty(state.workspaceEvidenceLinks).filter(
        (item) =>
          item.workspaceId === parsed.workspaceId &&
          item.status === "linked" &&
          ((parsed.sectionId && item.sectionId === parsed.sectionId) ||
            (parsed.artifactId && item.artifactId === parsed.artifactId)),
      )) {
        await tx.workspaceEvidenceLink.update({
          where: { id: link.id },
          data: {
            status: "superseded",
            updatedAt: new Date(now),
          },
        });
      }

      await tx.workspaceEvidenceLink.create({
        data: {
          id: linkId,
          workspaceId: parsed.workspaceId,
          cellId: parsed.cellId,
          executionId: parsed.executionId,
          linkedByAgentId: parsed.agentId,
          status: "linked",
          outputId: parsed.outputId,
          sectionId: parsed.sectionId,
          artifactId: parsed.artifactId,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        },
      });
      await tx.workspaceBrief.update({
        where: { id: parsed.workspaceId },
        data: { updatedAt: new Date(now) },
      });
    });

    const state = await this.loadState();
    return arrayOrEmpty(state.workspaceEvidenceLinks).find((item) => item.id === linkId)!;
  }

  async listWorkspaceNotebookActivity(input: unknown) {
    const parsed = listWorkspaceNotebookActivityInputSchema.parse(
      input,
    ) satisfies ListWorkspaceNotebookActivityInput;
    const state = await this.loadState();
    this.findWorkspace(state, parsed.workspaceId);
    const ensured = this.ensureWorkspaceNotebookState(state, parsed.workspaceId);

    return {
      notebook: ensured.notebook,
      lease: ensured.lease,
      evidence: ensured.evidence
        .slice()
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, parsed.limit),
      executions: state.sandboxExecutions
        .filter((execution) => execution.workspaceId === parsed.workspaceId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, parsed.limit),
    };
  }

  async updateProposalSection(input: unknown) {
    const parsed = updateProposalSectionInputSchema.parse(input);
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const workspace = this.findWorkspace(state, parsed.workspaceId);

      this.assertWorkspaceMember(
        workspace,
        parsed.agentId,
        "edit proposal sections",
      );
      this.assertCollaboratorRosterOpen(
        state,
        workspace,
        "edit proposal sections",
      );
      await this.syncWorkspaceDocumentSectionTx(tx, state, {
        workspaceId: parsed.workspaceId,
        surface: "proposal",
        sectionId: parsed.sectionId,
        agentId: parsed.agentId,
        content: parsed.content.trim(),
        now,
      });
      await tx.workspaceBrief.update({
        where: {
          id: parsed.workspaceId,
        },
        data: {
          updatedAt: new Date(now),
        },
      });
    });

    const state = await this.loadState();
    const workspace = this.findWorkspace(state, parsed.workspaceId);
    const proposalDocument = this.findWorkspaceDocument(
      state,
      parsed.workspaceId,
      "proposal",
    );
    const section = proposalDocument.sections.find(
      (item) => item.id === parsed.sectionId,
    );

    if (!section) {
      throw new Error(
        `Document section ${parsed.sectionId} not found on proposal for workspace ${parsed.workspaceId}`,
      );
    }

    return {
      section,
      canActivateDraft: this.canWorkspaceActivateDraft(state, workspace),
    };
  }

  async activateWorkspaceDraft(
    workspaceId: string,
    actorClerkUserId?: string,
  ): Promise<WorkspaceRecord> {
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const workspace = this.findWorkspace(state, workspaceId);

      if (!this.canWorkspaceActivateDraft(state, workspace)) {
        throw new Error(this.buildDraftLockedReason(state, workspace));
      }

      await this.activateWorkspaceDraftDirectTx(tx, state, workspaceId, now, {
        emitWorkspaceMessage: false,
      });
    });

    return this.getWorkspaceRecord(workspaceId);
  }

  async publishWorkspacePaper(input: unknown) {
    const parsed = publishWorkspacePaperInputSchema.parse(input);
    const now = new Date().toISOString();
    const paperId = `paper_${parsed.workspaceId}`;

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const workspace = this.findWorkspace(state, parsed.workspaceId);

      this.assertWorkspaceMember(
        workspace,
        parsed.agentId,
        "publish workspace papers",
      );
      this.assertDraftWorkspace(state, workspace, "publish workspace papers");

      if (this.buildWorkspaceSandboxSummary(state, workspace).hasBlockingJobs) {
        throw new Error(
          `Workspace ${workspace.id} still has active sandbox executions and cannot be completed yet.`,
        );
      }

      if (!this.draftDocumentIsComplete(state, workspace.id)) {
        throw new Error(
          `Workspace ${workspace.id} must have an abstract and accepted content for every draft section before publishing.`,
        );
      }

      const draftDocument = this.findWorkspaceDocument(state, workspace.id, "draft");
      const references = this.buildDraftDocumentReferences(state, workspace.id);
      const draftDocumentWithReferences: WorkspaceDocument = {
        ...draftDocument,
        references,
      };
      const existingPaper = state.papers.find((paper) => paper.workspaceId === workspace.id);
      const authors =
        draftDocumentWithReferences.authors.length > 0
          ? draftDocumentWithReferences.authors.map((author) => author.name)
          : workspace.memberAgentIds
              .map((agentId) => state.agents.find((agent) => agent.id === agentId))
              .filter((agent): agent is AgentProfile => Boolean(agent))
              .map((agent) => agent.displayName);
      const summary =
        parsed.summary?.trim() ||
        draftDocumentWithReferences.abstractText?.trim() ||
        workspace.abstract.trim();
      const renderedContent = this.renderWorkspacePaperContent(
        state,
        workspace,
        draftDocumentWithReferences,
      );
      const showcase =
        parsed.showcase?.trim() ||
        buildPaperShowcaseText({
          summary,
          abstractText: draftDocumentWithReferences.abstractText?.trim(),
          ideaSummary: workspace.ideaSummary.trim(),
          content: renderedContent,
        });
      const previewImagePath =
        this.resolveWorkspacePaperPreviewImagePath(state, workspace.id) ??
        existingPaper?.previewImagePath ??
        buildPaperPreviewDataUri({
          title: draftDocumentWithReferences.paperTitle.trim() || workspace.title.trim(),
          authors,
          summary,
          content: renderedContent,
        });
      const paper: AgentPaper = {
        id: existingPaper?.id ?? paperId,
        title: draftDocumentWithReferences.paperTitle.trim() || workspace.title.trim(),
        summary,
        venue: workspace.venue,
        year: new Date(now).getUTCFullYear(),
        tags: workspace.tags,
        url: `/workspace/${workspace.id}`,
        authors,
        status: "published",
        visibility: parsed.visibility,
        sourceType: "agentarxiv",
        publishedAt: now,
        likes: existingPaper?.likes ?? 0,
        hotScore: existingPaper?.hotScore ?? 0,
        archiveId: existingPaper?.archiveId ?? `AgentArxiv:${workspace.slug}`,
        publishedIn: parsed.publishedIn?.trim() || workspace.venue,
        focus: showcase || existingPaper?.focus || workspace.ideaSummary,
        previewImagePath,
        workspaceId: workspace.id,
        workspacePath: `/workspace/${workspace.id}`,
        content: renderedContent,
      };

      await tx.workspaceBrief.update({
        where: {
          id: workspace.id,
        },
        data: {
          paperStatus: "published",
          proposalStatus: "completed",
          stage: "compiled",
          collaboratorsLockedAt: workspace.collaboratorsLockedAt
            ? new Date(workspace.collaboratorsLockedAt)
            : new Date(now),
          proposalCompletedAt: workspace.proposalCompletedAt
            ? new Date(workspace.proposalCompletedAt)
            : new Date(now),
          draftStartedAt: workspace.draftStartedAt
            ? new Date(workspace.draftStartedAt)
            : new Date(now),
          updatedAt: new Date(now),
        },
      });
      await tx.agentPaper.upsert({
        where: {
          id: paper.id,
        },
        create: {
          ...paper,
          publishedAt: new Date(paper.publishedAt),
        },
        update: {
          title: paper.title,
          summary: paper.summary,
          venue: paper.venue,
          year: paper.year,
          tags: paper.tags,
          url: paper.url,
          authors: paper.authors,
          status: paper.status,
          visibility: paper.visibility,
          sourceType: paper.sourceType,
          publishedAt: new Date(paper.publishedAt),
          archiveId: paper.archiveId,
          publishedIn: paper.publishedIn,
          focus: paper.focus,
          previewImagePath: paper.previewImagePath,
          workspaceId: paper.workspaceId,
          workspacePath: paper.workspacePath,
          content: paper.content,
        },
      });

      const run = state.runs.find((item) => item.workspaceId === workspace.id);

      if (run) {
        const runningStep = run.steps.find((step) => step.status === "running");

        if (runningStep) {
          runningStep.status = "completed";
          runningStep.finishedAt = now;
        }

        run.currentStage = "compiled";
        run.status = "completed";
        run.updatedAt = now;
        run.steps.push({
          id: createId("step", 8),
          runId: run.id,
          stage: "compile",
          agentRole: "compile",
          status: "completed",
          summary:
            "The manuscript was finalized and published to the public library.",
          startedAt: now,
          finishedAt: now,
        });

        await tx.run.update({
          where: {
            id: run.id,
          },
          data: {
            currentStage: run.currentStage,
            status: run.status,
            updatedAt: new Date(now),
            steps: run.steps,
          },
        });
      } else {
        const publishRunId = createId("run");

        await tx.run.create({
          data: {
            id: publishRunId,
            workspaceId: workspace.id,
            currentStage: "compiled",
            status: "completed",
            startedAt: new Date(now),
            updatedAt: new Date(now),
            steps: [
              {
                id: createId("step", 8),
                runId: publishRunId,
                stage: "compile",
                agentRole: "compile",
                status: "completed",
                summary:
                  "The manuscript was finalized and published to the public library.",
                startedAt: now,
                finishedAt: now,
              },
            ],
          },
        });
      }

      await tx.artifact.deleteMany({
        where: {
          workspaceId: workspace.id,
          type: "pdf",
        },
      });
      await tx.artifact.create({
        data: {
          id: createId("artifact"),
          workspaceId: workspace.id,
          agentId: parsed.agentId,
          type: "pdf",
          title: `${workspace.slug}.pdf`,
          content: `/workspace/${workspace.id}`,
          skillIds: [],
          createdAt: new Date(now),
        },
      });

      for (const [index, memberAgentId] of workspace.memberAgentIds.entries()) {
        const agent = state.agents.find((item) => item.id === memberAgentId);

        if (!agent) {
          continue;
        }

        await tx.agentProfile.update({
          where: {
            id: memberAgentId,
          },
          data: {
            authoredPaperIds:
              index === 0 || memberAgentId === workspace.ownerAgentId
                ? [...new Set([...agent.authoredPaperIds, paper.id])]
                : agent.authoredPaperIds,
            coauthoredPaperIds:
              index === 0 || memberAgentId === workspace.ownerAgentId
                ? agent.coauthoredPaperIds
                : [...new Set([...agent.coauthoredPaperIds, paper.id])],
            updatedAt: new Date(now),
          },
        });
      }

      await this.createSystemWorkspaceMessageTx(
        tx,
        workspace.id,
        parsed.visibility === "public"
          ? "The workspace paper was published publicly and is now available in Explore."
          : `The workspace paper was published with ${parsed.visibility} visibility.`,
        now,
      );
    });

    const state = await this.loadState();
    const paper = state.papers.find((item) => item.workspaceId === parsed.workspaceId);

    if (!paper) {
      throw new Error(`Published paper for workspace ${parsed.workspaceId} was not persisted`);
    }

    return paper;
  }

  async listWorkspaceDocuments(workspaceId: string) {
    const state = await this.loadState();
    this.findWorkspace(state, workspaceId);
    return state.workspaceDocuments.filter(
      (document) => document.workspaceId === workspaceId,
    );
  }

  async getWorkspaceRun(workspaceId: string) {
    const state = await this.loadState();
    return state.runs.find((run) => run.workspaceId === workspaceId);
  }

  async listWorkspaceSections(workspaceId: string) {
    const state = await this.loadState();
    return state.sections.filter(
      (section) => section.workspaceId === workspaceId,
    );
  }

  async listWorkspaceMessages(workspaceId: string) {
    const state = await this.loadState();
    this.findWorkspace(state, workspaceId);

    return [...state.workspaceMessages]
      .filter((message) => message.workspaceId === workspaceId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async postWorkspaceMessage(input: unknown): Promise<WorkspaceMessage> {
    const parsed = postWorkspaceMessageInputSchema.parse(
      input,
    ) satisfies PostWorkspaceMessageInput;
    const messageId = createId("wmsg");
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const workspace = this.findWorkspace(state, parsed.workspaceId);
      let authorName = parsed.authorName?.trim();
      let authorAccent = parsed.authorAccent?.trim();

      if (parsed.authorType === "agent") {
        if (!parsed.agentId) {
          throw new Error("Provide agentId when authorType is agent");
        }

        const agent = this.findAgent(state, parsed.agentId);

        if (!workspace.memberAgentIds.includes(agent.id)) {
          throw new Error(
            `Agent ${agent.id} is not a member of workspace ${workspace.id}`,
          );
        }

        authorName = authorName || agent.displayName;
        authorAccent =
          authorAccent ||
          this.resolveWorkspaceScopedAgentAccent(
            state,
            workspace.id,
            agent.id,
            agent.avatarAccent,
          );
      } else if (parsed.agentId) {
        throw new Error("Only agent messages can include agentId");
      } else if (parsed.authorType === "system") {
        authorName = authorName || "Workspace Context";
        authorAccent = authorAccent || "#7b8794";
      } else {
        authorName = authorName || "You";
        authorAccent = authorAccent || "#fa7315";
      }

      await tx.workspaceMessage.create({
        data: {
          id: messageId,
          workspaceId: parsed.workspaceId,
          authorType: parsed.authorType,
          agentId: parsed.agentId,
          authorName,
          authorAccent,
          content: parsed.content.trim(),
          selection: parsed.selection
            ? {
                ...parsed.selection,
                text: parsed.selection.text.trim(),
              }
            : undefined,
          messageReference: parsed.messageReference
            ? {
                ...parsed.messageReference,
                excerpt: parsed.messageReference.excerpt.trim(),
              }
            : undefined,
          references: parsed.references.map((reference) =>
            reference.kind === "manuscript_selection"
              ? {
                  ...reference,
                  text: reference.text.trim(),
                  contextText: reference.contextText?.trim() || undefined,
                }
              : "excerpt" in reference && typeof reference.excerpt === "string"
                ? {
                    ...reference,
                    excerpt: reference.excerpt.trim(),
                  }
                : reference,
          ) as Prisma.InputJsonValue,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        },
      });
      await tx.workspaceBrief.update({
        where: {
          id: parsed.workspaceId,
        },
        data: {
          updatedAt: new Date(now),
        },
      });
    });

    const nextState = await this.loadState();
    const message = nextState.workspaceMessages.find(
      (item) => item.id === messageId,
    );

    if (!message) {
      throw new Error(`Workspace message ${messageId} was not persisted`);
    }

    return message;
  }

  async getAgentDossier(agentId: string): Promise<AgentDossier> {
    const state = await this.loadState();
    const profile = this.findAgent(state, agentId);
    const authoredPapers = profile.authoredPaperIds
      .map((paperId) => state.papers.find((paper) => paper.id === paperId))
      .filter(
        (paper): paper is AgentPaper =>
          paper !== undefined && isPublicPublishedPaper(paper),
      );
    const coauthoredPapers = profile.coauthoredPaperIds
      .map((paperId) => state.papers.find((paper) => paper.id === paperId))
      .filter(
        (paper): paper is AgentPaper =>
          paper !== undefined && isPublicPublishedPaper(paper),
      );
    const pastCollaborations = profile.priorCollaborationIds
      .map((collaborationId) =>
        state.collaborations.find((item) => item.id === collaborationId),
      )
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map((collaboration) => ({
        ...collaboration,
        paperIds: collaboration.paperIds.filter((paperId) => {
          const paper = state.papers.find((item) => item.id === paperId);
          return Boolean(paper && isPublicPublishedPaper(paper));
        }),
      }));
    const priorCollaboratorIds = new Set<string>();

    for (const collaboration of pastCollaborations) {
      collaboration.collaborators.forEach((collaboratorId) => {
        if (collaboratorId !== agentId) {
          priorCollaboratorIds.add(collaboratorId);
        }
      });
    }

    const priorCollaborators = [...priorCollaboratorIds]
      .map((collaboratorId) =>
        state.agents.find((agent) => agent.id === collaboratorId),
      )
      .filter(Boolean) as AgentProfile[];
    const installedSkills = this.listInstalledSkillsFromState(state, agentId);

    return {
      profile,
      sandboxStatus: this.buildAgentSandboxStatus(state, profile),
      authoredPapers,
      coauthoredPapers,
      pastCollaborations,
      priorCollaborators,
      installedSkills,
      graphSummary: {
        agentId,
        collaboratorCount: priorCollaborators.length,
        sharedWorkspaceCount: pastCollaborations.length,
      },
    };
  }

  async listPastCollaborations(agentId: string) {
    return (await this.getAgentDossier(agentId)).pastCollaborations;
  }

  async listCollaboratorGraph(agentId: string) {
    const dossier = await this.getAgentDossier(agentId);
    return {
      node: dossier.graphSummary,
      collaborators: dossier.priorCollaborators.map((profile) => ({
        agentId: profile.id,
        displayName: profile.displayName,
        sharedCollaborations: dossier.pastCollaborations.filter(
          (collaboration) => collaboration.collaborators.includes(profile.id),
        ).length,
      })),
    };
  }

  async publishSkill(input: PublishSkillInput) {
    const parsed = publishSkillInputSchema.parse(input);
    const now = new Date().toISOString();
    const skillId = createId("skill");
    const installId = createId("askill");

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      this.findAgent(state, parsed.createdByAgentId);

      if (
        state.skills.some(
          (skill) => skill.slug.toLowerCase() === parsed.slug.toLowerCase(),
        )
      ) {
        throw new Error(`Skill slug ${parsed.slug} already exists`);
      }

      await tx.skillDefinition.create({
        data: {
          id: skillId,
          slug: parsed.slug,
          name: parsed.name,
          summary: parsed.summary,
          description: parsed.description,
          category: parsed.category,
          tags: parsed.tags,
          promptTemplate: parsed.promptTemplate,
          inputContract: parsed.inputContract,
          outputContract: parsed.outputContract,
          createdByAgentId: parsed.createdByAgentId,
          latestVersion: parsed.latestVersion,
          visibility: parsed.visibility,
          validatedPaperIds: parsed.validatedPaperIds,
          installationCount: 1,
          usageCount: 0,
          runtimeEngine: parsed.runtime.engine,
          runtimeRequiredInputs: parsed.runtime.requiredInputs,
          runtimeOptionalInputs: parsed.runtime.optionalInputs,
          runtimeOutputSections: parsed.runtime.outputSections,
          runtimeArtifactType: parsed.runtime.artifactType,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        },
      });
      await tx.agentSkillInstall.create({
        data: {
          id: installId,
          agentId: parsed.createdByAgentId,
          skillId,
          proficiency: 1,
          verified: true,
          notes: "Published by the skill creator.",
          installedAt: new Date(now),
          lastUsedAt: new Date(now),
        },
      });
    });

    const state = await this.loadState();
    const skill = this.findSkill(state, skillId);
    const install = this.listInstalledSkillsFromState(
      state,
      parsed.createdByAgentId,
    ).find((item) => item.id === installId);

    if (!install) {
      throw new Error(`Installed skill record ${installId} was not persisted`);
    }

    return {
      skill,
      install,
    };
  }

  async installSkill(input: InstallSkillInput) {
    const parsed = installSkillInputSchema.parse(input);
    const now = new Date().toISOString();
    let installId = "";

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      this.findAgent(state, parsed.agentId);
      this.findSkill(state, parsed.skillId);
      const install = state.agentSkills.find(
        (item) =>
          item.agentId === parsed.agentId && item.skillId === parsed.skillId,
      );

      if (!install) {
        installId = createId("askill");
        await tx.agentSkillInstall.create({
          data: {
            id: installId,
            agentId: parsed.agentId,
            skillId: parsed.skillId,
            proficiency: parsed.proficiency ?? 0.75,
            verified: parsed.verified ?? false,
            notes: parsed.notes ?? "",
            installedAt: new Date(now),
          },
        });
        await tx.skillDefinition.update({
          where: {
            id: parsed.skillId,
          },
          data: {
            installationCount: {
              increment: 1,
            },
            updatedAt: new Date(now),
          },
        });
      } else {
        installId = install.id;
        await tx.agentSkillInstall.update({
          where: {
            id: install.id,
          },
          data: {
            proficiency: parsed.proficiency ?? install.proficiency,
            verified: parsed.verified ?? install.verified,
            notes: parsed.notes ?? install.notes,
          },
        });
        await tx.skillDefinition.update({
          where: {
            id: parsed.skillId,
          },
          data: {
            updatedAt: new Date(now),
          },
        });
      }
    });

    const state = await this.loadState();
    const install = this.listInstalledSkillsFromState(state, parsed.agentId).find(
      (item) => item.id === installId,
    );

    if (!install) {
      throw new Error(`Installed skill record ${installId} was not persisted`);
    }

    return install;
  }

  async executeSkill(input: ExecuteSkillInput) {
    const parsed = executeSkillInputSchema.parse(input);
    const now = new Date().toISOString();
    const executionId = createId("sexec");
    let artifactId: string | undefined;

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      this.findAgent(state, parsed.agentId);
      const skill = this.findSkill(state, parsed.skillId);
      const install = state.agentSkills.find(
        (item) =>
          item.agentId === parsed.agentId && item.skillId === parsed.skillId,
      );

      if (!install) {
        throw new Error(
          `Agent ${parsed.agentId} has not installed skill ${parsed.skillId}`,
        );
      }

      if (parsed.sectionId && !parsed.workspaceId) {
        throw new Error("Provide workspaceId when sectionId is set");
      }

      if (parsed.workspaceId) {
        const workspace = this.findWorkspace(state, parsed.workspaceId);
        this.assertWorkspaceMember(
          workspace,
          parsed.agentId,
          "run workspace-scoped skills",
        );
      }

      if (parsed.workspaceId && parsed.sectionId) {
        this.findSection(state, parsed.workspaceId, parsed.sectionId);
      }

      for (const key of skill.runtime.requiredInputs) {
        if (!(key in parsed.inputs) || !parsed.inputs[key]?.trim()) {
          throw new Error(`Missing required skill input: ${key}`);
        }
      }

      const resolvedPrompt = this.renderSkillPrompt(
        skill,
        parsed.objective,
        parsed.inputs,
        this.buildSkillExecutionContext(state, {
          workspaceId: parsed.workspaceId,
          sectionId: parsed.sectionId,
        }),
      );
      const output = {
        summary: `Prepared ${skill.name} execution bundle for ${parsed.objective}.`,
        sections: skill.runtime.outputSections.map((label) => ({
          label,
          content: `Prepared ${label} scaffold using ${skill.name}.`,
        })),
      };

      await this.recordSkillUsageTx(tx, parsed.agentId, [parsed.skillId], now);

      if (parsed.workspaceId && skill.runtime.artifactType !== "none") {
        artifactId = createId("artifact");
        await tx.artifact.create({
          data: {
            id: artifactId,
            workspaceId: parsed.workspaceId,
            agentId: parsed.agentId,
            type: skill.runtime.artifactType,
            title: `${skill.name} execution bundle`,
            content: JSON.stringify(
              {
                objective: parsed.objective,
                inputs: parsed.inputs,
                resolvedPrompt,
                output,
              },
              null,
              2,
            ),
            skillIds: [parsed.skillId],
            createdAt: new Date(now),
          },
        });
      }

      await tx.skillExecution.create({
        data: {
          id: executionId,
          skillId: parsed.skillId,
          agentId: parsed.agentId,
          workspaceId: parsed.workspaceId,
          sectionId: parsed.sectionId,
          status: "completed",
          objective: parsed.objective,
          inputs: parsed.inputs,
          resolvedPrompt,
          output,
          artifactId,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        },
      });
    });

    const state = await this.loadState();
    const execution = state.skillExecutions.find(
      (item) => item.id === executionId,
    );

    if (!execution) {
      throw new Error(`Skill execution ${executionId} was not persisted`);
    }

    return execution;
  }

  async registerAgent(
    input: RegisterInput,
    options?: {
      ownerClerkUserId?: string;
    },
  ) {
    const parsed = registerAgentInputSchema.parse(input);

    if (!options?.ownerClerkUserId) {
      throw new Error(
        "Account authentication is required to register an agent",
      );
    }

    const agentId = createId("agent");
    const apiKey = this.createApiKey();
    const recoveryKey = this.createRecoveryKey();
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      await tx.agentProfile.create({
        data: {
          id: agentId,
          handle: parsed.handle,
          displayName: parsed.displayName,
          avatarAccent: "#d94a4a",
          headline: parsed.headline,
          researchDescription: parsed.researchDescription,
          researchInterests: parsed.researchInterests,
          capabilities: parsed.capabilities,
          preferredRoles: parsed.preferredRoles,
          collaborationIntent:
            parsed.collaborationIntent ??
            this.buildDefaultCollaborationIntent({
              displayName: parsed.displayName,
              preferredRoles: parsed.preferredRoles,
              capabilities: parsed.capabilities,
              researchDescription: parsed.researchDescription,
            }),
          seedPaperIds: parsed.seedPaperIds,
          authoredPaperIds: [],
          coauthoredPaperIds: [],
          priorCollaborationIds: [],
          inviteSentCount: 0,
          inviteReceivedCount: 0,
          inviteAcceptedCount: 0,
          inviteDeclinedCount: 0,
          acceptedContributionRate: 0.5,
          citationAccuracy: 0.5,
          compileSuccessRate: 0.5,
          reviewHelpfulness: 0.5,
          completedWorkspaces: 0,
          discoverable: true,
          apiKeyHash: apiKey.hash,
          recoveryKeyHash: recoveryKey.hash,
          ownerClerkUserId: options.ownerClerkUserId,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        },
      });
    });

    const state = await this.loadState();
    const agent = this.findAgent(state, agentId);

    return {
      agent,
      apiKey: apiKey.plain,
      recoveryKey: recoveryKey.plain,
      endpoint: this.getRegistrationEndpoint(),
    };
  }

  async upsertProfile(agentId: string, input: RegisterInput) {
    const parsed = upsertProfileInputSchema.parse(input);
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      this.findAgent(state, agentId);

      await tx.agentProfile.update({
        where: {
          id: agentId,
        },
        data: {
          handle: parsed.handle,
          displayName: parsed.displayName,
          headline: parsed.headline,
          researchDescription: parsed.researchDescription,
          researchInterests: parsed.researchInterests,
          capabilities: parsed.capabilities,
          preferredRoles: parsed.preferredRoles,
          collaborationIntent:
            parsed.collaborationIntent ??
            this.buildDefaultCollaborationIntent({
              displayName: parsed.displayName,
              preferredRoles: parsed.preferredRoles,
              capabilities: parsed.capabilities,
              researchDescription: parsed.researchDescription,
            }),
          seedPaperIds: parsed.seedPaperIds,
          authoredPaperIds: parsed.authoredPaperIds,
          coauthoredPaperIds: parsed.coauthoredPaperIds,
          discoverable: parsed.discoverable,
          updatedAt: new Date(now),
        },
      });
    });

    const state = await this.loadState();
    return this.findAgent(state, agentId);
  }

  async rotateKey(agentId: string) {
    const apiKey = this.createApiKey();
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      this.findAgent(state, agentId);

      await tx.agentProfile.update({
        where: {
          id: agentId,
        },
        data: {
          apiKeyHash: apiKey.hash,
          updatedAt: new Date(now),
        },
      });
    });

    return { agentId, apiKey: apiKey.plain };
  }

  async reissueAgentKey(agentId: string, ownerClerkUserId: string) {
    const apiKey = this.createApiKey();
    const recoveryKey = this.createRecoveryKey();
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      this.assertAccountOwnsAgent(state, ownerClerkUserId, agentId);

      await tx.agentProfile.update({
        where: {
          id: agentId,
        },
        data: {
          apiKeyHash: apiKey.hash,
          recoveryKeyHash: recoveryKey.hash,
          updatedAt: new Date(now),
        },
      });
    });

    return { agentId, apiKey: apiKey.plain, recoveryKey: recoveryKey.plain };
  }

  async reissueAgentKeyFromRecovery(agentId: string) {
    const apiKey = this.createApiKey();
    const recoveryKey = this.createRecoveryKey();
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      this.findAgent(state, agentId);

      await tx.agentProfile.update({
        where: {
          id: agentId,
        },
        data: {
          apiKeyHash: apiKey.hash,
          recoveryKeyHash: recoveryKey.hash,
          updatedAt: new Date(now),
        },
      });
    });

    return { agentId, apiKey: apiKey.plain, recoveryKey: recoveryKey.plain };
  }

  async listWorkspaceMatches(agentId: string) {
    const state = await this.loadState();
    const agent = this.findAgent(state, agentId);
    const matches: WorkspaceMatch[] = state.workspaces.map((workspace) => {
      const graphProximity = this.collaboratorOverlap(
        state,
        agentId,
        workspace,
      );
      const paperHistory = this.paperHistoryScore(state, agent, workspace);
      const skillFit = this.skillFitScore(state, agentId, workspace);
      const breakdown = computeBreakdown(
        agent,
        workspace,
        graphProximity,
        paperHistory,
        skillFit,
      );

      return {
        workspace,
        breakdown,
        reasons: breakdownReasons(breakdown, workspace, agent),
      };
    });

    return sortWorkspaceMatches(matches);
  }

  async listAgentMatches(workspaceId: string) {
    const state = await this.loadState();
    const workspace = this.findWorkspace(state, workspaceId);
    const matches: AgentMatch[] = state.agents
      .filter(
        (agent) =>
          agent.discoverable && !workspace.memberAgentIds.includes(agent.id),
      )
      .map((agent) => {
        const graphProximity = this.collaboratorOverlap(
          state,
          agent.id,
          workspace,
        );
        const paperHistory = this.paperHistoryScore(state, agent, workspace);
        const skillFit = this.skillFitScore(state, agent.id, workspace);
        const breakdown = computeBreakdown(
          agent,
          workspace,
          graphProximity,
          paperHistory,
          skillFit,
        );

        return {
          agent,
          breakdown,
          reasons: breakdownReasons(breakdown, workspace, agent),
        };
      });

    return sortAgentMatches(matches);
  }

  async draftCollaborationProposal(
    input: unknown,
  ): Promise<CollaborationProposalDraft> {
    const parsed = draftCollaborationProposalInputSchema.parse(
      input,
    ) satisfies DraftProposalInput;
    const state = await this.loadState();
    const assessment = this.assessAgentForWorkspace(
      state,
      parsed.workspaceId,
      parsed.toAgentId,
    );

    return {
      workspaceId: parsed.workspaceId,
      fromAgentId: parsed.fromAgentId,
      toAgentId: parsed.toAgentId,
      proposal: this.createCollaborationProposal(state, parsed),
      matchScore: assessment.breakdown.total,
      matchReasons: assessment.matchReasons,
    };
  }

  async reviewCollaborationProposal(
    input: unknown,
  ): Promise<InviteProposalReview> {
    const parsed = reviewCollaborationProposalInputSchema.parse(input);
    const state = await this.loadState();
    const invite = state.invites.find(
      (item) =>
        item.id === parsed.inviteId && item.toAgentId === parsed.agentId,
    );

    if (!invite) {
      throw new Error(
        `Invite ${parsed.inviteId} not found for ${parsed.agentId}`,
      );
    }

    const hydratedInvite = this.hydrateInvite(state, invite);
    const { workspace, agent, breakdown, matchReasons } =
      this.assessAgentForWorkspace(
        state,
        hydratedInvite.workspaceId,
        hydratedInvite.toAgentId,
      );
    const proposal = hydratedInvite.proposal;
    const roleAlignment = proposal
      ? this.proposalRoleAlignment(agent, proposal)
      : breakdown.capabilityFit;
    const linkedPaperIds = new Set([
      ...agent.seedPaperIds,
      ...agent.authoredPaperIds,
      ...agent.coauthoredPaperIds,
    ]);
    const paperAlignment = proposal
      ? proposal.linkedPaperIds.length === 0
        ? 0.5
        : proposal.linkedPaperIds.filter((paperId) =>
            linkedPaperIds.has(paperId),
          ).length / proposal.linkedPaperIds.length
      : breakdown.paperHistory;
    const interestAlignment = this.inviteInterestAlignment(
      state,
      hydratedInvite,
    );
    const compositeScore = proposal
      ? breakdown.total * 0.5 +
        roleAlignment * 0.2 +
        paperAlignment * 0.15 +
        interestAlignment * 0.15
      : breakdown.total * 0.65 + roleAlignment * 0.15 + interestAlignment * 0.2;
    const concerns: string[] = [];
    let recommendation: InviteProposalReview["recommendation"];

    if (workspace.memberAgentIds.includes(agent.id)) {
      concerns.push("Recipient is already on the workspace roster.");
      recommendation = "decline";
    } else if (
      compositeScore >= 0.72 &&
      (breakdown.total >= 0.65 || roleAlignment >= 0.67)
    ) {
      recommendation = proposal?.mode === "explore" ? "explore" : "accept";
    } else if (compositeScore >= 0.5) {
      recommendation = "explore";
    } else {
      recommendation = "decline";
    }

    if (roleAlignment < 0.5) {
      concerns.push(
        proposal
          ? "Requested roles only partially match the recipient's profile."
          : "The sender's intended contribution only partially matches the recipient's profile.",
      );
    }

    if (paperAlignment < 0.34) {
      concerns.push(
        proposal
          ? "Proposal links are weakly grounded in the recipient's paper history."
          : "Invite intent is weakly grounded in the recipient's paper history.",
      );
    }

    if (proposal && proposal.questions.length === 0) {
      concerns.push(
        "Proposal does not ask for any concrete scope confirmation.",
      );
    }

    if (!proposal) {
      concerns.push(
        "Invite is lightweight and does not include a scoped proposal yet.",
      );
    }

    if (interestAlignment < 0.45) {
      concerns.push(
        "Interest summary does not clearly anchor the sender's intended contribution.",
      );
    }

    const reasons = [
      ...new Set([
        ...hydratedInvite.matchReasons,
        ...matchReasons,
        ...(interestAlignment >= 0.6
          ? ["Sender provided a clear collaboration intent for this workspace."]
          : []),
      ]),
    ].slice(0, 4);
    const confidence = Number(
      Math.max(0.35, Math.min(0.96, compositeScore)).toFixed(2),
    );
    const suggestedResponse =
      recommendation === "accept"
        ? proposal
          ? `Accept the invite and start with ${proposal.deliverables[0]?.toLowerCase() ?? "the requested deliverable"}.`
          : "Accept the invite and ask the sender to open with a bounded first task inside the workspace."
        : recommendation === "explore"
          ? proposal
            ? "Reply with the proposal questions first, then decide whether to join."
            : "Reply asking for a bounded first task or a scoped proposal before you commit."
          : proposal
            ? "Decline for now and ask the sender to tighten the role fit or proposal grounding."
            : "Decline for now and ask the sender for a clearer collaboration intent or tighter fit.";

    return {
      inviteId: hydratedInvite.id,
      workspaceId: hydratedInvite.workspaceId,
      agentId: parsed.agentId,
      recommendation,
      confidence,
      reasons,
      concerns,
      suggestedResponse,
    };
  }

  async sendInvite(input: unknown) {
    const parsed = sendInviteInputSchema.parse(input);
    const inviteId = createId("invite");
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const workspace = this.findWorkspace(state, parsed.workspaceId);
      const fromAgent = this.findAgent(state, parsed.fromAgentId);
      const toAgent = this.findAgent(state, parsed.toAgentId);

      if (parsed.fromAgentId === parsed.toAgentId) {
        throw new Error("Agents cannot invite themselves");
      }

      this.assertCollaboratorRosterOpen(state, workspace, "send invites");
      this.assertWorkspaceMember(workspace, parsed.fromAgentId, "send invites");
      this.assertWorkspaceHasCollaboratorCapacity(
        state,
        workspace,
        this.getReservedWorkspaceCollaboratorCount(state, workspace) + 1,
      );

      if (workspace.memberAgentIds.includes(parsed.toAgentId)) {
        throw new Error(
          `Agent ${parsed.toAgentId} is already a member of workspace ${workspace.id}`,
        );
      }

      if (
        state.invites.some(
          (invite) =>
            invite.workspaceId === parsed.workspaceId &&
            invite.toAgentId === parsed.toAgentId &&
            (invite.status === "pending" || invite.status === "requested"),
        )
      ) {
        throw new Error(
          `Agent ${parsed.toAgentId} already has an open collaboration request for workspace ${workspace.id}.`,
        );
      }

      const assessment = this.assessAgentForWorkspace(
        state,
        parsed.workspaceId,
        parsed.toAgentId,
      );
      const interestSummary = this.buildInviteInterestSummary(state, parsed);

      await tx.invite.create({
        data: {
          id: inviteId,
          workspaceId: parsed.workspaceId,
          fromAgentId: parsed.fromAgentId,
          toAgentId: parsed.toAgentId,
          status: "pending",
          reasoning: parsed.reasoning,
          interestSummary,
          proposal: parsed.proposal,
          matchScore: assessment.breakdown.total,
          matchReasons: assessment.matchReasons,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        },
      });
      await tx.agentProfile.update({
        where: {
          id: fromAgent.id,
        },
        data: {
          inviteSentCount: {
            increment: 1,
          },
          updatedAt: new Date(now),
        },
      });
      await tx.agentProfile.update({
        where: {
          id: toAgent.id,
        },
        data: {
          inviteReceivedCount: {
            increment: 1,
          },
          updatedAt: new Date(now),
        },
      });
      await this.createSystemWorkspaceMessageTx(
        tx,
        workspace.id,
        `${fromAgent.displayName} invited ${toAgent.displayName} to collaborate. Intent: ${interestSummary}`,
        now,
      );
    });

    const state = await this.loadState();
    const invite = state.invites.find((item) => item.id === inviteId);

    if (!invite) {
      throw new Error(`Invite ${inviteId} was not persisted`);
    }

    return this.hydrateInvite(state, invite);
  }

  async acceptInvite(inviteId: string, agentId: string) {
    const now = new Date().toISOString();
    let pendingWorkspaceId: string | undefined;
    let pendingDecisionId: string | undefined;

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const invite = state.invites.find(
        (item) => item.id === inviteId && item.toAgentId === agentId,
      );

      if (!invite) {
        throw new Error(`Invite ${inviteId} not found for ${agentId}`);
      }

      const workspace = this.findWorkspace(state, invite.workspaceId);
      const targetPayload = {
        inviteId: invite.id,
        agentId,
        invitedAgentId:
          invite.status === "requested" ? invite.fromAgentId : invite.toAgentId,
      } satisfies Record<string, unknown>;

      if (
        !this.hasApprovedGovernanceDecision(
          state,
          workspace.id,
          "collaborator_change",
          targetPayload,
        )
      ) {
        const decision = await this.ensureGovernanceDecisionTx(
          tx,
          state,
          workspace,
          {
            kind: "collaborator_change",
            required: true,
            title: "Review collaborator change",
            targetPayload,
            openedByAgentId: agentId,
          },
          now,
        );

        pendingWorkspaceId = workspace.id;
        pendingDecisionId = decision.id;
        return;
      }

      await this.acceptInviteDirectTx(tx, state, inviteId, agentId, now, {
        emitWorkspaceMessage: false,
      });
    });

    if (pendingWorkspaceId && pendingDecisionId) {
      throw new GovernanceDecisionRequiredError(
        "Consensus is required before collaborators can be changed.",
        pendingWorkspaceId,
        pendingDecisionId,
      );
    }

    const state = await this.loadState();
    const invite = state.invites.find((item) => item.id === inviteId);

    if (!invite) {
      throw new Error(`Invite ${inviteId} was not persisted`);
    }

    return this.hydrateInvite(state, invite);
  }

  async declineInvite(inviteId: string, agentId: string) {
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const invite = state.invites.find(
        (item) => item.id === inviteId && item.toAgentId === agentId,
      );

      if (!invite) {
        throw new Error(`Invite ${inviteId} not found for ${agentId}`);
      }

      if (invite.status !== "pending" && invite.status !== "requested") {
        throw new Error(`Invite ${inviteId} is not open`);
      }

      const agent = this.findAgent(state, agentId);
      const workspace = this.findWorkspace(state, invite.workspaceId);

      await tx.invite.update({
        where: {
          id: invite.id,
        },
        data: {
          status: "declined",
          updatedAt: new Date(now),
        },
      });
      await tx.agentProfile.update({
        where: {
          id: agentId,
        },
        data: {
          inviteDeclinedCount: {
            increment: 1,
          },
          updatedAt: new Date(now),
        },
      });
      await this.createSystemWorkspaceMessageTx(
        tx,
        workspace.id,
        `${agent.displayName} declined the collaboration invite.`,
        now,
      );
    });

    const state = await this.loadState();
    const invite = state.invites.find((item) => item.id === inviteId);

    if (!invite) {
      throw new Error(`Invite ${inviteId} was not persisted`);
    }

    return this.hydrateInvite(state, invite);
  }

  async requestJoinWorkspace(input: unknown) {
    const parsed = requestJoinWorkspaceInputSchema.parse(input);
    const inviteId = createId("invite");
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const workspace = this.findWorkspace(state, parsed.workspaceId);
      const fromAgent = this.findAgent(state, parsed.fromAgentId);
      const toAgent = this.findAgent(state, parsed.toAgentId);

      if (parsed.fromAgentId === parsed.toAgentId) {
        throw new Error("Agents cannot request access from themselves");
      }

      this.assertCollaboratorRosterOpen(state, workspace, "request to join");
      this.assertWorkspaceHasCollaboratorCapacity(
        state,
        workspace,
        this.getReservedWorkspaceCollaboratorCount(state, workspace) + 1,
      );

      if (workspace.memberAgentIds.includes(parsed.fromAgentId)) {
        throw new Error(
          `Agent ${parsed.fromAgentId} is already a member of workspace ${workspace.id}`,
        );
      }

      if (
        state.invites.some(
          (invite) =>
            invite.workspaceId === parsed.workspaceId &&
            ((invite.status === "requested" &&
              invite.fromAgentId === parsed.fromAgentId) ||
              (invite.status === "pending" &&
                invite.toAgentId === parsed.fromAgentId)),
        )
      ) {
        throw new Error(
          `Agent ${parsed.fromAgentId} already has an open collaboration request for workspace ${workspace.id}.`,
        );
      }

      this.assertWorkspaceMember(
        workspace,
        parsed.toAgentId,
        "review join requests",
      );

      const assessment = this.assessAgentForWorkspace(
        state,
        parsed.workspaceId,
        parsed.fromAgentId,
      );
      const interestSummary = this.buildInviteInterestSummary(state, parsed);

      await tx.invite.create({
        data: {
          id: inviteId,
          workspaceId: parsed.workspaceId,
          fromAgentId: parsed.fromAgentId,
          toAgentId: parsed.toAgentId,
          status: "requested",
          reasoning: parsed.reasoning,
          interestSummary,
          proposal: parsed.proposal,
          matchScore: assessment.breakdown.total,
          matchReasons: assessment.matchReasons,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        },
      });
      await tx.agentProfile.update({
        where: {
          id: fromAgent.id,
        },
        data: {
          inviteSentCount: {
            increment: 1,
          },
          updatedAt: new Date(now),
        },
      });
      await tx.agentProfile.update({
        where: {
          id: toAgent.id,
        },
        data: {
          inviteReceivedCount: {
            increment: 1,
          },
          updatedAt: new Date(now),
        },
      });
      await this.createSystemWorkspaceMessageTx(
        tx,
        workspace.id,
        `${fromAgent.displayName} requested to join the workspace. Intent: ${interestSummary}`,
        now,
      );
    });

    const state = await this.loadState();
    const invite = state.invites.find((item) => item.id === inviteId);

    if (!invite) {
      throw new Error(`Invite ${inviteId} was not persisted`);
    }

    return this.hydrateInvite(state, invite);
  }

  async listDelegatedTasks(filters?: DelegatedTaskListFilters) {
    const parsed = listDelegatedTasksInputSchema.parse(filters ?? {});
    const state = await this.loadState();

    if (parsed.agentId) {
      this.findAgent(state, parsed.agentId);
    }

    if (parsed.workspaceId) {
      this.findWorkspace(state, parsed.workspaceId);
    }

    return state.delegatedTasks
      .filter(
        (task) =>
          !parsed.agentId ||
          task.fromAgentId === parsed.agentId ||
          task.toAgentId === parsed.agentId,
      )
      .filter(
        (task) =>
          !parsed.workspaceId || task.workspaceId === parsed.workspaceId,
      )
      .filter((task) => !parsed.status || task.status === parsed.status)
      .sort((left, right) => {
        if (left.status !== right.status) {
          return (
            Number(left.status !== "pending") -
            Number(right.status !== "pending")
          );
        }

        return right.updatedAt.localeCompare(left.updatedAt);
      });
  }

  async createDelegatedTask(input: CreateDelegatedTaskInput) {
    const parsed = createDelegatedTaskInputSchema.parse(input);
    const taskId = createId("task");
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const workspace = this.findWorkspace(state, parsed.workspaceId);
      const fromAgent = this.findAgent(state, parsed.fromAgentId);
      const toAgent = this.findAgent(state, parsed.toAgentId);

      if (parsed.fromAgentId === parsed.toAgentId) {
        throw new Error("Agents cannot delegate tasks to themselves");
      }

      this.assertWorkspaceMember(workspace, parsed.fromAgentId, "delegate tasks");
      this.assertWorkspaceMember(
        workspace,
        parsed.toAgentId,
        "receive delegated tasks",
      );
      this.assertAgentHasSkills(state, parsed.toAgentId, parsed.skillIds);

      if (parsed.sectionId) {
        this.findSection(state, parsed.workspaceId, parsed.sectionId);
      }

      await tx.delegatedTask.create({
        data: {
          id: taskId,
          workspaceId: parsed.workspaceId,
          fromAgentId: parsed.fromAgentId,
          toAgentId: parsed.toAgentId,
          title: parsed.title.trim(),
          summary: parsed.summary.trim(),
          kind: parsed.kind,
          status: "pending",
          sectionId: parsed.sectionId,
          deliverables: [
            ...new Set(
              parsed.deliverables.map((item) => item.trim()).filter(Boolean),
            ),
          ],
          skillIds: [...new Set(parsed.skillIds)],
          artifactRefs: [],
          createdAt: new Date(now),
          updatedAt: new Date(now),
        },
      });
      await this.createSystemWorkspaceMessageTx(
        tx,
        workspace.id,
        `${fromAgent.displayName} delegated "${parsed.title.trim()}" to ${toAgent.displayName}.`,
        now,
      );
    });

    const state = await this.loadState();
    const task = state.delegatedTasks.find((item) => item.id === taskId);

    if (!task) {
      throw new Error(`Delegated task ${taskId} was not persisted`);
    }

    return task;
  }

  async acceptDelegatedTask(input: unknown) {
    const parsed = acceptDelegatedTaskInputSchema.parse(input);
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const task = this.findDelegatedTask(state, parsed.taskId);

      if (task.toAgentId !== parsed.agentId) {
        throw new Error(`Task ${task.id} is not assigned to ${parsed.agentId}`);
      }

      if (task.status !== "pending") {
        throw new Error(`Task ${task.id} is already ${task.status}`);
      }

      const workspace = this.findWorkspace(state, task.workspaceId);
      const agent = this.findAgent(state, parsed.agentId);

      await tx.delegatedTask.update({
        where: {
          id: task.id,
        },
        data: {
          status: "accepted",
          responseNote: parsed.responseNote?.trim() || undefined,
          acceptedAt: new Date(now),
          updatedAt: new Date(now),
        },
      });
      await this.createSystemWorkspaceMessageTx(
        tx,
        workspace.id,
        `${agent.displayName} accepted delegated task "${task.title}".`,
        now,
      );
    });

    const state = await this.loadState();
    const task = state.delegatedTasks.find((item) => item.id === parsed.taskId);

    if (!task) {
      throw new Error(`Delegated task ${parsed.taskId} was not persisted`);
    }

    return task;
  }

  async declineDelegatedTask(input: unknown) {
    const parsed = declineDelegatedTaskInputSchema.parse(input);
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const task = this.findDelegatedTask(state, parsed.taskId);

      if (task.toAgentId !== parsed.agentId) {
        throw new Error(`Task ${task.id} is not assigned to ${parsed.agentId}`);
      }

      if (task.status !== "pending") {
        throw new Error(`Task ${task.id} is already ${task.status}`);
      }

      const workspace = this.findWorkspace(state, task.workspaceId);
      const agent = this.findAgent(state, parsed.agentId);

      await tx.delegatedTask.update({
        where: {
          id: task.id,
        },
        data: {
          status: "declined",
          responseNote: parsed.responseNote?.trim() || undefined,
          declinedAt: new Date(now),
          updatedAt: new Date(now),
        },
      });
      await this.createSystemWorkspaceMessageTx(
        tx,
        workspace.id,
        `${agent.displayName} declined delegated task "${task.title}".`,
        now,
      );
    });

    const state = await this.loadState();
    const task = state.delegatedTasks.find((item) => item.id === parsed.taskId);

    if (!task) {
      throw new Error(`Delegated task ${parsed.taskId} was not persisted`);
    }

    return task;
  }

  async completeDelegatedTask(input: unknown) {
    const parsed = completeDelegatedTaskInputSchema.parse(input);
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const task = this.findDelegatedTask(state, parsed.taskId);

      if (task.toAgentId !== parsed.agentId) {
        throw new Error(`Task ${task.id} is not assigned to ${parsed.agentId}`);
      }

      if (task.status !== "accepted") {
        throw new Error(`Task ${task.id} must be accepted before completion`);
      }

      const workspace = this.findWorkspace(state, task.workspaceId);
      const agent = this.findAgent(state, parsed.agentId);

      for (const artifactRef of parsed.artifactRefs) {
        const artifact = state.artifacts.find((item) => item.id === artifactRef);

        if (!artifact || artifact.workspaceId !== task.workspaceId) {
          throw new Error(
            `Artifact ${artifactRef} is not available on workspace ${task.workspaceId}`,
          );
        }
      }

      await tx.delegatedTask.update({
        where: {
          id: task.id,
        },
        data: {
          status: "completed",
          artifactRefs: [...new Set(parsed.artifactRefs)],
          resultSummary: parsed.resultSummary.trim(),
          completedAt: new Date(now),
          updatedAt: new Date(now),
        },
      });
      await this.createSystemWorkspaceMessageTx(
        tx,
        workspace.id,
        `${agent.displayName} completed delegated task "${task.title}". Result: ${parsed.resultSummary.trim()}`,
        now,
      );
    });

    const state = await this.loadState();
    const task = state.delegatedTasks.find((item) => item.id === parsed.taskId);

    if (!task) {
      throw new Error(`Delegated task ${parsed.taskId} was not persisted`);
    }

    return task;
  }

  async claimSection(input: unknown) {
    const parsed = claimSectionInputSchema.parse(input);
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const workspace = this.findWorkspace(state, parsed.workspaceId);
      this.assertDraftWorkspace(state, workspace, "claim sections");
      this.assertWorkspaceMember(workspace, parsed.agentId, "claim sections");
      const section = this.findSection(state, parsed.workspaceId, parsed.sectionId);

      if (
        section.claimedByAgentId &&
        section.claimedByAgentId !== parsed.agentId &&
        section.status !== "changes_requested"
      ) {
        throw new Error(
          `Section ${section.id} is already claimed by ${section.claimedByAgentId}.`,
        );
      }

      await tx.workspaceSection.update({
        where: {
          id: parsed.sectionId,
        },
        data: {
          claimedByAgentId: parsed.agentId,
          status: "claimed",
          updatedAt: new Date(now),
        },
      });
      await this.syncWorkspaceDocumentSectionTx(tx, state, {
        workspaceId: parsed.workspaceId,
        surface: "draft",
        sectionId: parsed.sectionId,
        agentId: parsed.agentId,
        now,
      });
      await tx.workspaceBrief.update({
        where: {
          id: parsed.workspaceId,
        },
        data: {
          updatedAt: new Date(now),
        },
      });
    });

    const state = await this.loadState();
    return this.findSection(state, parsed.workspaceId, parsed.sectionId);
  }

  async submitOutlineArtifact(input: unknown) {
    const parsed = submitOutlineInputSchema.parse(input);
    const artifactId = createId("artifact");
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const workspace = this.findWorkspace(state, parsed.workspaceId);
      this.assertWorkspaceMember(
        workspace,
        parsed.agentId,
        "submit outline artifacts",
      );

      await this.recordSkillUsageTx(tx, parsed.agentId, parsed.skillIds, now);
      await tx.artifact.create({
        data: {
          id: artifactId,
          workspaceId: parsed.workspaceId,
          agentId: parsed.agentId,
          type: "outline",
          title: "Generated outline.json",
          content: JSON.stringify(parsed.outline),
          skillIds: parsed.skillIds,
          createdAt: new Date(now),
        },
      });
      await tx.workspaceBrief.update({
        where: {
          id: parsed.workspaceId,
        },
        data: {
          stage: "outline",
          updatedAt: new Date(now),
        },
      });
    });

    const state = await this.loadState();
    const artifact = state.artifacts.find((item) => item.id === artifactId);

    if (!artifact) {
      throw new Error(`Artifact ${artifactId} was not persisted`);
    }

    return artifact;
  }

  async submitCitationCandidates(input: unknown) {
    const parsed = submitCitationCandidatesInputSchema.parse(input);
    const registryId = createId("registry");
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const workspace = this.findWorkspace(state, parsed.workspaceId);
      this.assertWorkspaceMember(
        workspace,
        parsed.agentId,
        "submit citation candidates",
      );

      await this.recordSkillUsageTx(tx, parsed.agentId, parsed.skillIds, now);
      await tx.citationRegistry.deleteMany({
        where: {
          workspaceId: parsed.workspaceId,
        },
      });
      await tx.citationRegistry.create({
        data: {
          id: registryId,
          workspaceId: parsed.workspaceId,
          papers: parsed.papers.map((paper) => ({
            ...paper,
            id: createId("cite", 8),
          })),
          minCitePaperCount: Math.max(2, Math.floor(parsed.papers.length * 0.6)),
          skillIds: parsed.skillIds,
          collectedAt: new Date(now),
        },
      });
      await tx.workspaceBrief.update({
        where: {
          id: parsed.workspaceId,
        },
        data: {
          stage: "literature",
          updatedAt: new Date(now),
        },
      });
    });

    const state = await this.loadState();
    const registry = state.citationRegistries.find((item) => item.id === registryId);

    if (!registry) {
      throw new Error(`Citation registry ${registryId} was not persisted`);
    }

    return registry;
  }

  async submitSectionDraft(input: unknown) {
    const parsed = submitSectionDraftInputSchema.parse(input);
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const workspace = this.findWorkspace(state, parsed.workspaceId);
      this.assertDraftWorkspace(state, workspace, "submit section drafts");
      this.assertWorkspaceMember(
        workspace,
        parsed.agentId,
        "submit section drafts",
      );
      const section = this.findSection(state, parsed.workspaceId, parsed.sectionId);

      if (
        section.claimedByAgentId &&
        section.claimedByAgentId !== parsed.agentId &&
        section.status !== "changes_requested"
      ) {
        throw new Error(
          `Section ${section.id} is currently owned by ${section.claimedByAgentId}.`,
        );
      }

      await this.recordSkillUsageTx(tx, parsed.agentId, parsed.skillIds, now);
      const references = this.buildDraftDocumentReferences(
        state,
        parsed.workspaceId,
        new Map([[parsed.sectionId, parsed.citedKeys]]),
      );
      await tx.workspaceSection.update({
        where: {
          id: parsed.sectionId,
        },
        data: {
          claimedByAgentId: parsed.agentId,
          content: parsed.content,
          liveContent: null,
          rationale: parsed.rationale,
          citedKeys: parsed.citedKeys,
          artifactRefs: [...new Set([...section.artifactRefs, ...parsed.artifactRefs])],
          skillIds: parsed.skillIds,
          status: "review",
          liveUpdatedAt: null,
          updatedAt: new Date(now),
        },
      });
      await this.syncWorkspaceDocumentSectionTx(tx, state, {
        workspaceId: parsed.workspaceId,
        surface: "draft",
        sectionId: parsed.sectionId,
        agentId: parsed.agentId,
        content: parsed.content.trim(),
        references,
        now,
      });
      await tx.workspaceBrief.update({
        where: {
          id: parsed.workspaceId,
        },
        data: {
          stage: "drafting",
          updatedAt: new Date(now),
        },
      });
    });

    const state = await this.loadState();
    return this.findSection(state, parsed.workspaceId, parsed.sectionId);
  }

  async updateLiveSectionDraft(input: unknown) {
    const parsed = updateLiveSectionDraftInputSchema.parse(input);
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const workspace = this.findWorkspace(state, parsed.workspaceId);
      this.assertDraftWorkspace(state, workspace, "update live section drafts");
      this.assertWorkspaceMember(
        workspace,
        parsed.agentId,
        "update live section drafts",
      );
      const section = this.findSection(state, parsed.workspaceId, parsed.sectionId);

      if (
        section.claimedByAgentId &&
        section.claimedByAgentId !== parsed.agentId &&
        section.status !== "changes_requested"
      ) {
        throw new Error(
          `Section ${section.id} is currently owned by ${section.claimedByAgentId}.`,
        );
      }

      await tx.workspaceSection.update({
        where: {
          id: parsed.sectionId,
        },
        data: {
          claimedByAgentId: parsed.agentId,
          liveContent: parsed.content,
          liveUpdatedAt: new Date(now),
          status: "claimed",
          updatedAt: new Date(now),
        },
      });
      await this.syncWorkspaceDocumentSectionTx(tx, state, {
        workspaceId: parsed.workspaceId,
        surface: "draft",
        sectionId: parsed.sectionId,
        agentId: parsed.agentId,
        now,
      });
      await tx.workspaceBrief.update({
        where: {
          id: parsed.workspaceId,
        },
        data: {
          stage: "drafting",
          updatedAt: new Date(now),
        },
      });
    });

    const state = await this.loadState();
    return this.findSection(state, parsed.workspaceId, parsed.sectionId);
  }

  async submitReviewFeedback(input: unknown) {
    const parsed = submitReviewFeedbackInputSchema.parse(input);
    const now = new Date().toISOString();
    const artifactId = createId("artifact");

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const workspace = this.findWorkspace(state, parsed.workspaceId);
      this.assertDraftWorkspace(state, workspace, "review draft sections");
      this.assertWorkspaceMember(
        workspace,
        parsed.agentId,
        "submit review feedback",
      );
      const section = this.findSection(
        state,
        parsed.workspaceId,
        parsed.sectionId,
      );

      await this.recordSkillUsageTx(tx, parsed.agentId, parsed.skillIds, now);
      await tx.workspaceSection.update({
        where: {
          id: parsed.sectionId,
        },
        data: {
          status:
            parsed.decision === "accept" ? "accepted" : "changes_requested",
          skillIds: [...new Set([...section.skillIds, ...parsed.skillIds])],
          updatedAt: new Date(now),
        },
      });
      await tx.artifact.create({
        data: {
          id: artifactId,
          workspaceId: parsed.workspaceId,
          agentId: parsed.agentId,
          type: "review",
          title: `Review for ${section.title}`,
          content: parsed.summary,
          skillIds: parsed.skillIds,
          createdAt: new Date(now),
        },
      });
      await tx.workspaceBrief.update({
        where: {
          id: parsed.workspaceId,
        },
        data: {
          stage: "review",
          updatedAt: new Date(now),
        },
      });
    });

    const state = await this.loadState();
    return this.findSection(state, parsed.workspaceId, parsed.sectionId);
  }

  async uploadFigureArtifact(input: unknown) {
    const parsed = uploadFigureArtifactInputSchema.parse(input);
    return this.uploadManuscriptAsset({
      workspaceId: parsed.workspaceId,
      agentId: parsed.agentId,
      assetType: "figure",
      title: parsed.title,
      content: parsed.content,
      skillIds: parsed.skillIds,
    });
  }

  async generateManuscriptAsset(input: unknown) {
    const parsed = generateManuscriptAssetInputSchema.parse(input);
    const content = await renderManuscriptAsset(parsed);

    return this.uploadManuscriptAsset({
      workspaceId: parsed.workspaceId,
      agentId: parsed.agentId,
      assetType: parsed.assetType,
      title: parsed.title,
      content,
      sectionId: parsed.sectionId,
      skillIds: parsed.skillIds,
    });
  }

  async uploadManuscriptAsset(input: unknown) {
    const parsed = uploadManuscriptAssetInputSchema.parse(input);
    const artifactId = createId("artifact");
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const workspace = this.findWorkspace(state, parsed.workspaceId);
      this.assertWorkspaceMember(
        workspace,
        parsed.agentId,
        "upload figure artifacts",
      );

      await this.recordSkillUsageTx(tx, parsed.agentId, parsed.skillIds, now);
      await tx.artifact.create({
        data: {
          id: artifactId,
          workspaceId: parsed.workspaceId,
          agentId: parsed.agentId,
          type: parsed.assetType,
          title: parsed.title,
          content: parsed.content,
          skillIds: parsed.skillIds,
          createdAt: new Date(now),
        },
      });

      if (parsed.sectionId) {
        const section = this.findSection(state, parsed.workspaceId, parsed.sectionId);

        await tx.workspaceSection.update({
          where: {
            id: section.id,
          },
          data: {
            artifactRefs: [...new Set([...section.artifactRefs, artifactId])],
            updatedAt: new Date(now),
          },
        });
      }

      await tx.workspaceBrief.update({
        where: {
          id: parsed.workspaceId,
        },
        data: {
          updatedAt: new Date(now),
        },
      });
    });

    const state = await this.loadState();
    const artifact = state.artifacts.find((item) => item.id === artifactId);

    if (!artifact) {
      throw new Error(`Artifact ${artifactId} was not persisted`);
    }

    return artifact;
  }

  async inspectWorkspaceManuscript(input: unknown) {
    const parsed = inspectWorkspaceManuscriptInputSchema.parse(input);
    const state = await this.loadState();

    return this.buildWorkspaceManuscriptReport(state, parsed.workspaceId);
  }

  async streamRunStatus(workspaceId: string): Promise<Run | undefined> {
    const state = await this.loadState();
    return state.runs.find((run) => run.workspaceId === workspaceId);
  }

  async advanceWorkspaceRun(workspaceId: string) {
    const now = new Date().toISOString();

    await this.runWrite(async (tx) => {
      const state = await loadStateFromPrisma(tx);
      const run = state.runs.find((item) => item.workspaceId === workspaceId);
      const workspace = this.findWorkspace(state, workspaceId);

      if (!run) {
        throw new Error(`Run not found for ${workspaceId}`);
      }

      if (this.buildWorkspaceSandboxSummary(state, workspace).hasBlockingJobs) {
        throw new Error(
          `Workspace ${workspaceId} is waiting on active sandbox executions before the run can advance.`,
        );
      }

      const runningStep = run.steps.find((step) => step.status === "running");

      if (runningStep) {
        runningStep.status = "completed";
        runningStep.finishedAt = now;
      }

      let nextCurrentStage = run.currentStage;
      let nextRunStatus = run.status;
      const nextSteps = [...run.steps];
      let createPdfArtifact = false;

      if (run.currentStage === "literature") {
        nextCurrentStage = "drafting";
        nextSteps.push({
          id: createId("step", 8),
          runId: run.id,
          stage: "section_writing",
          agentRole: "writing",
          status: "running",
          summary:
            "Delta is drafting the remaining methods, experiments, and conclusion sections.",
          startedAt: now,
        });
      } else if (run.currentStage === "drafting") {
        nextCurrentStage = "review";
        nextSteps.push({
          id: createId("step", 8),
          runId: run.id,
          stage: "refinement",
          agentRole: "refinement",
          status: "running",
          summary:
            "The refinement agent is folding reviewer feedback back into the manuscript.",
          startedAt: now,
        });
      } else if (run.currentStage === "review") {
        nextCurrentStage = "compiled";
        nextRunStatus = "completed";
        nextSteps.push({
          id: createId("step", 8),
          runId: run.id,
          stage: "compile",
          agentRole: "compile",
          status: "completed",
          summary:
            "LaTeX compile completed and the PDF artifact was published to the workspace.",
          startedAt: now,
          finishedAt: now,
        });
        createPdfArtifact = true;
      }

      await tx.run.update({
        where: {
          id: run.id,
        },
        data: {
          currentStage: nextCurrentStage,
          status: nextRunStatus,
          updatedAt: new Date(now),
          steps: nextSteps,
        },
      });
      await tx.workspaceBrief.update({
        where: {
          id: workspaceId,
        },
        data: {
          stage: nextCurrentStage,
          updatedAt: new Date(now),
        },
      });

      if (createPdfArtifact) {
        await tx.artifact.create({
          data: {
            id: createId("artifact"),
            workspaceId,
            agentId: workspace.ownerAgentId,
            type: "pdf",
            title: `${workspace.slug}.pdf`,
            content: `https://example.com/${workspace.slug}.pdf`,
            skillIds: [],
            createdAt: new Date(now),
          },
        });
      }
    });

    const state = await this.loadState();
    const run = state.runs.find((item) => item.workspaceId === workspaceId);

    if (!run) {
      throw new Error(`Run not found for ${workspaceId}`);
    }

    return run;
  }
}

let runtimeRepository: FileStoreRepository | undefined;

export function getRuntimeRepository() {
  if (runtimeRepository) {
    return runtimeRepository;
  }

  runtimeRepository = new PrismaRuntimeRepository() as unknown as FileStoreRepository;
  return runtimeRepository;
}
