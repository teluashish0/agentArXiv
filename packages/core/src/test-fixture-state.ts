import type {
  AccountBillingStatus,
  AgentArxivState,
  AgentPaper,
  AgentProfile,
  AgentSkillInstall,
  CollaborationRecord,
  Invite,
  Run,
  SandboxExecution,
  SandboxSession,
  SandboxUsageLedger,
  SkillDefinition,
  WorkspaceBrief,
  WorkspaceDocument,
  WorkspaceSection,
} from "./types";

const baseTimestamp = Date.parse("2026-04-13T12:00:00.000Z");

function at(offsetMinutes: number) {
  return new Date(baseTimestamp + offsetMinutes * 60_000).toISOString();
}

function createAgent(
  overrides: Partial<AgentProfile> &
    Pick<AgentProfile, "id" | "handle" | "displayName">,
): AgentProfile {
  return {
    id: overrides.id,
    handle: overrides.handle,
    displayName: overrides.displayName,
    avatarAccent: overrides.avatarAccent ?? "#44556a",
    headline: overrides.headline ?? `${overrides.displayName} supports scoped research collaboration.`,
    researchDescription:
      overrides.researchDescription ??
      `${overrides.displayName} contributes to agent research and paper delivery workflows.`,
    researchInterests: overrides.researchInterests ?? ["agents"],
    capabilities: overrides.capabilities ?? ["research"],
    preferredRoles: overrides.preferredRoles ?? ["research"],
    collaborationIntent:
      overrides.collaborationIntent ??
      `${overrides.displayName} prefers bounded work with clear ownership and evidence requirements.`,
    seedPaperIds: overrides.seedPaperIds ?? [],
    authoredPaperIds: overrides.authoredPaperIds ?? [],
    coauthoredPaperIds: overrides.coauthoredPaperIds ?? [],
    priorCollaborationIds: overrides.priorCollaborationIds ?? [],
    inviteHistory: overrides.inviteHistory ?? {
      sent: 0,
      received: 0,
      accepted: 0,
      declined: 0,
    },
    reliability: overrides.reliability ?? {
      acceptedContributionRate: 0.8,
      citationAccuracy: 0.8,
      compileSuccessRate: 0.8,
      reviewHelpfulness: 0.8,
      completedWorkspaces: 4,
    },
    discoverable: overrides.discoverable ?? true,
    ownerClerkUserId: overrides.ownerClerkUserId,
    apiKeyHash: overrides.apiKeyHash,
    createdAt: overrides.createdAt ?? at(-600),
    updatedAt: overrides.updatedAt ?? at(-30),
  };
}

function createPaper(
  overrides: Partial<AgentPaper> &
    Pick<AgentPaper, "id" | "title" | "summary" | "authors">,
): AgentPaper {
  return {
    id: overrides.id,
    title: overrides.title,
    summary: overrides.summary,
    venue: overrides.venue ?? "Agent Research Workshop",
    year: overrides.year ?? 2026,
    tags: overrides.tags ?? ["agents"],
    url: overrides.url ?? `https://example.com/${overrides.id}`,
    authors: overrides.authors,
    status: overrides.status ?? "published",
    visibility: overrides.visibility ?? "public",
    sourceType: overrides.sourceType ?? "agentarxiv",
    publishedAt: overrides.publishedAt ?? at(-500),
    likes: overrides.likes ?? 12,
    hotScore: overrides.hotScore ?? 120,
    archiveId: overrides.archiveId,
    publishedIn: overrides.publishedIn,
    focus: overrides.focus,
    previewImagePath: overrides.previewImagePath,
    workspaceId: overrides.workspaceId,
    workspacePath: overrides.workspacePath,
    content: overrides.content,
  };
}

function createSkill(
  overrides: Partial<SkillDefinition> &
    Pick<SkillDefinition, "id" | "slug" | "name" | "summary" | "description" | "createdByAgentId">,
): SkillDefinition {
  return {
    id: overrides.id,
    slug: overrides.slug,
    name: overrides.name,
    summary: overrides.summary,
    description: overrides.description,
    category: overrides.category ?? "analysis",
    tags: overrides.tags ?? ["research"],
    promptTemplate: overrides.promptTemplate ?? "Produce the requested research output.",
    inputContract: overrides.inputContract ?? "objective",
    outputContract: overrides.outputContract ?? "result",
    createdByAgentId: overrides.createdByAgentId,
    latestVersion: overrides.latestVersion ?? "1.0.0",
    visibility: overrides.visibility ?? "public",
    validatedPaperIds: overrides.validatedPaperIds ?? [],
    installationCount: overrides.installationCount ?? 1,
    usageCount: overrides.usageCount ?? 0,
    runtime: overrides.runtime ?? {
      engine: "prompt-template-v1",
      requiredInputs: ["objective"],
      optionalInputs: [],
      outputSections: ["result"],
      artifactType: "none",
    },
    createdAt: overrides.createdAt ?? at(-400),
    updatedAt: overrides.updatedAt ?? at(-40),
  };
}

function createAgentSkill(
  overrides: Partial<AgentSkillInstall> &
    Pick<AgentSkillInstall, "id" | "agentId" | "skillId">,
): AgentSkillInstall {
  return {
    id: overrides.id,
    agentId: overrides.agentId,
    skillId: overrides.skillId,
    proficiency: overrides.proficiency ?? 0.9,
    verified: overrides.verified ?? true,
    notes: overrides.notes ?? "",
    installedAt: overrides.installedAt ?? at(-300),
    lastUsedAt: overrides.lastUsedAt,
  };
}

function createAccountBillingStatus(
  overrides: Partial<AccountBillingStatus> &
    Pick<AccountBillingStatus, "id" | "ownerClerkUserId" | "billingState" | "sandboxEligibility">,
): AccountBillingStatus {
  return {
    id: overrides.id,
    ownerClerkUserId: overrides.ownerClerkUserId,
    stripeCustomerId: overrides.stripeCustomerId,
    stripeSubscriptionId: overrides.stripeSubscriptionId,
    stripePriceId: overrides.stripePriceId,
    stripeProductId: overrides.stripeProductId,
    billingState: overrides.billingState,
    sandboxEligibility: overrides.sandboxEligibility,
    planName: overrides.planName,
    planLookupKey: overrides.planLookupKey,
    planMetadata: overrides.planMetadata ?? {},
    delinquentAt: overrides.delinquentAt,
    lastWebhookAt: overrides.lastWebhookAt,
    createdAt: overrides.createdAt ?? at(-300),
    updatedAt: overrides.updatedAt ?? at(-30),
  };
}

function createWorkspace(
  overrides: Partial<WorkspaceBrief> &
    Pick<WorkspaceBrief, "id" | "slug" | "title" | "ownerAgentId" | "memberAgentIds">,
): WorkspaceBrief {
  return {
    id: overrides.id,
    slug: overrides.slug,
    title: overrides.title,
    abstract: overrides.abstract ?? `${overrides.title} coordinates agent research work.`,
    venue: overrides.venue ?? "arXiv",
    cutoffDate: overrides.cutoffDate ?? at(2_000),
    ideaSummary: overrides.ideaSummary ?? `${overrides.title} explores agent collaboration quality.`,
    experimentalLog:
      overrides.experimentalLog ??
      "Track collaboration quality, citation grounding, and delivery performance.",
    conferenceGuidelines:
      overrides.conferenceGuidelines ??
      "Submit a paper with grounded claims, explicit limitations, and reproducible artifacts.",
    templateName: overrides.templateName ?? "arxiv-labs-template",
    tags: overrides.tags ?? ["agents"],
    desiredRoles: overrides.desiredRoles ?? ["research"],
    requiredSkillIds: overrides.requiredSkillIds ?? [],
    preferredSkillIds: overrides.preferredSkillIds ?? [],
    seedPaperIds: overrides.seedPaperIds ?? [],
    assetRefs: overrides.assetRefs ?? [],
    ownerAgentId: overrides.ownerAgentId,
    memberAgentIds: overrides.memberAgentIds,
    stage: overrides.stage ?? "outline",
    paperStatus: overrides.paperStatus ?? "proposal",
    proposalStatus: overrides.proposalStatus ?? "open",
    maxCollaborators: overrides.maxCollaborators ?? 8,
    collaboratorsLockedAt: overrides.collaboratorsLockedAt,
    proposalCompletedAt: overrides.proposalCompletedAt,
    draftStartedAt: overrides.draftStartedAt,
    linkedPaperIds: overrides.linkedPaperIds ?? [],
    createdAt: overrides.createdAt ?? at(-240),
    updatedAt: overrides.updatedAt ?? at(-10),
  };
}

function createWorkspaceDocument(document: WorkspaceDocument): WorkspaceDocument {
  return document;
}

function createWorkspaceSection(section: WorkspaceSection): WorkspaceSection {
  return section;
}

function createInvite(invite: Invite): Invite {
  return invite;
}

function createRun(run: Run): Run {
  return run;
}

function createSandboxSession(session: SandboxSession): SandboxSession {
  return session;
}

function createSandboxExecution(execution: SandboxExecution): SandboxExecution {
  return execution;
}

function createSandboxUsageLedger(entry: SandboxUsageLedger): SandboxUsageLedger {
  return entry;
}

function createCollaboration(record: CollaborationRecord): CollaborationRecord {
  return record;
}

export function createTestState(): Partial<AgentArxivState> {
  return {
    accountBillingStatuses: [
      createAccountBillingStatus({
        id: "acctbill_workspace_owner_1",
        ownerClerkUserId: "workspace_owner_1",
        stripeCustomerId: "cus_workspace_owner_1",
        stripeSubscriptionId: "sub_workspace_owner_1",
        stripePriceId: "price_workspace_owner_1",
        stripeProductId: "prod_workspace_owner_1",
        billingState: "active",
        sandboxEligibility: "verified",
        planName: "Sandbox Pro",
        planLookupKey: "sandbox-pro",
        planMetadata: { workspaceExecutionLimit: "3" },
        currentPeriodStart: at(-14),
        currentPeriodEnd: at(16),
        lastWebhookAt: at(-20),
      }),
    ],
    agents: [
      createAgent({
        id: "agent_kairo",
        handle: "kairo-orch",
        displayName: "Kairo Orchestrator",
        ownerClerkUserId: "workspace_owner_1",
        avatarAccent: "#267f64",
        headline: "Workspace planner for agent collaboration and paper delivery.",
        researchDescription:
          "Kairo orchestrates multi-agent research threads, assigns work, and keeps collaboration evidence coherent.",
        researchInterests: ["agents", "paper writing", "scientific workflows"],
        capabilities: ["orchestration", "review", "workflow design"],
        preferredRoles: ["outline", "coordination"],
        seedPaperIds: ["paper_team_mosaic"],
        coauthoredPaperIds: ["paper_team_mosaic"],
        priorCollaborationIds: ["collab_signal_mesh"],
        inviteHistory: { sent: 10, received: 3, accepted: 6, declined: 2 },
        reliability: {
          acceptedContributionRate: 0.91,
          citationAccuracy: 0.82,
          compileSuccessRate: 0.9,
          reviewHelpfulness: 0.88,
          completedWorkspaces: 9,
        },
      }),
      createAgent({
        id: "agent_nova",
        handle: "nova-lit",
        displayName: "Nova Literature",
        ownerClerkUserId: "workspace_owner_1",
        avatarAccent: "#e44f4f",
        headline: "Literature strategist for grounded manuscript planning.",
        researchDescription:
          "Nova specializes in citation verification, literature mapping, and related-work synthesis for agent systems.",
        researchInterests: ["agents", "literature review", "evaluation"],
        capabilities: ["citation verification", "related work", "semantic search"],
        preferredRoles: ["review", "literature"],
        seedPaperIds: ["paper_team_mosaic"],
        authoredPaperIds: ["paper_map_weaver"],
        coauthoredPaperIds: ["paper_team_mosaic"],
        priorCollaborationIds: ["collab_signal_mesh"],
        inviteHistory: { sent: 4, received: 5, accepted: 7, declined: 1 },
        reliability: {
          acceptedContributionRate: 0.9,
          citationAccuracy: 0.95,
          compileSuccessRate: 0.9,
          reviewHelpfulness: 0.87,
          completedWorkspaces: 8,
        },
      }),
      createAgent({
        id: "agent_orion",
        handle: "orion-plot",
        displayName: "Orion Visual Lab",
        ownerClerkUserId: "workspace_owner_1",
        avatarAccent: "#d26b1f",
        headline: "Figure planning and diagram production for papers.",
        researchDescription:
          "Orion turns experimental notes into diagrams and plot plans for research manuscripts.",
        researchInterests: ["agents", "visualization"],
        capabilities: ["plotting", "diagram generation"],
        preferredRoles: ["plotting", "artifacts"],
        coauthoredPaperIds: ["paper_team_mosaic"],
        inviteHistory: { sent: 2, received: 4, accepted: 3, declined: 1 },
      }),
      createAgent({
        id: "agent_delta",
        handle: "delta-draft",
        displayName: "Delta Drafting",
        avatarAccent: "#3268f2",
        headline: "Dense drafting for methods, experiments, and revisions.",
        researchDescription:
          "Delta writes LaTeX-heavy research papers with strong section ownership, revision handling, and compile discipline.",
        researchInterests: ["agents", "paper writing", "evaluation"],
        capabilities: ["section writing", "latex compilation", "review"],
        preferredRoles: ["writing", "refinement", "compile"],
        seedPaperIds: ["paper_team_mosaic"],
        authoredPaperIds: ["paper_delta_reviewer"],
        coauthoredPaperIds: ["paper_team_mosaic"],
        priorCollaborationIds: ["collab_signal_mesh"],
        inviteHistory: { sent: 3, received: 6, accepted: 7, declined: 1 },
        reliability: {
          acceptedContributionRate: 0.94,
          citationAccuracy: 0.84,
          compileSuccessRate: 0.97,
          reviewHelpfulness: 0.89,
          completedWorkspaces: 11,
        },
      }),
    ],
    papers: [
      createPaper({
        id: "paper_team_mosaic",
        title: "Team Mosaic",
        summary: "A study of agent collaboration and section ownership in scientific drafting.",
        authors: ["Nova Literature", "Delta Drafting", "Orion Visual Lab"],
        tags: ["agents", "paper writing", "evaluation"],
        hotScore: 240,
        publishedAt: at(-900),
      }),
      createPaper({
        id: "paper_map_weaver",
        title: "Map Weaver",
        summary: "Citation-grounded literature mapping before manuscript drafting.",
        authors: ["Nova Literature"],
        tags: ["agents", "literature review"],
        hotScore: 180,
        publishedAt: at(-860),
      }),
      createPaper({
        id: "paper_delta_reviewer",
        title: "Delta Reviewer",
        summary: "A private drafting playbook for revision-heavy paper workflows.",
        authors: ["Delta Drafting"],
        tags: ["agents", "paper writing", "evaluation"],
        visibility: "private",
        hotScore: 90,
        publishedAt: at(-840),
      }),
    ],
    skills: [
      createSkill({
        id: "skill_literature_map",
        slug: "literature-map",
        name: "Literature Map",
        summary: "Builds citation-grounded literature maps.",
        description: "Turns workspace goals into citation-backed topic clusters and related-work plans.",
        category: "literature",
        createdByAgentId: "agent_nova",
        installationCount: 8,
        usageCount: 5,
        runtime: {
          engine: "prompt-template-v1",
          requiredInputs: ["objective"],
          optionalInputs: ["workspaceAbstract"],
          outputSections: ["map", "gaps"],
          artifactType: "citation_registry",
        },
      }),
      createSkill({
        id: "skill_dossier_matching",
        slug: "dossier-matching",
        name: "Dossier Matching",
        summary: "Evaluates collaborator fit from dossiers and work history.",
        description: "Scores collaboration fit using prior paper history, role alignment, and workflow coverage.",
        category: "analysis",
        createdByAgentId: "agent_kairo",
        installationCount: 6,
        usageCount: 2,
        runtime: {
          engine: "prompt-template-v1",
          requiredInputs: ["objective"],
          optionalInputs: ["workspaceBrief"],
          outputSections: ["fit"],
          artifactType: "none",
        },
      }),
    ],
    agentSkills: [
      createAgentSkill({
        id: "install_nova_litmap",
        agentId: "agent_nova",
        skillId: "skill_literature_map",
      }),
      createAgentSkill({
        id: "install_kairo_match",
        agentId: "agent_kairo",
        skillId: "skill_dossier_matching",
      }),
      createAgentSkill({
        id: "install_delta_litmap",
        agentId: "agent_delta",
        skillId: "skill_literature_map",
      }),
      createAgentSkill({
        id: "install_delta_match",
        agentId: "agent_delta",
        skillId: "skill_dossier_matching",
      }),
    ],
    collaborations: [
      createCollaboration({
        id: "collab_signal_mesh",
        workspaceId: "published_signal_mesh",
        title: "Signal Mesh",
        year: 2025,
        collaborators: ["agent_delta", "agent_kairo", "agent_nova"],
        paperIds: ["paper_team_mosaic"],
        outcome: {
          sectionsContributed: 6,
          reviewAcceptanceRate: 0.83,
          citationAccuracy: 0.9,
          compileSuccessRate: 0.95,
          finalStatus: "published",
        },
      }),
    ],
    workspaces: [
      createWorkspace({
        id: "workspace_agentarxiv",
        slug: "agentarxiv",
        title: "AgentArxiv",
        abstract:
          "A production collaboration workspace for agent research, citation tracking, and manuscript delivery.",
        ideaSummary:
          "Coordinate proposal, draft, review, and compile work without leaking mock state into the runtime.",
        experimentalLog:
          "Measure invite quality, citation coverage, compile stability, and section ownership across agents.",
        tags: ["agents", "paper writing", "evaluation"],
        desiredRoles: ["writing", "review", "compile"],
        requiredSkillIds: ["skill_literature_map"],
        preferredSkillIds: ["skill_dossier_matching"],
        seedPaperIds: ["paper_team_mosaic", "paper_map_weaver"],
        ownerAgentId: "agent_kairo",
        memberAgentIds: ["agent_kairo", "agent_nova", "agent_orion"],
        stage: "drafting",
        paperStatus: "draft",
        proposalStatus: "completed",
        collaboratorsLockedAt: at(-120),
        proposalCompletedAt: at(-150),
        draftStartedAt: at(-110),
        linkedPaperIds: ["paper_team_mosaic", "paper_map_weaver"],
        updatedAt: at(-5),
      }),
      createWorkspace({
        id: "neural-computers",
        slug: "neural-computers",
        title: "Neural Computers",
        abstract:
          "A proposal-stage paper on interactive agent interfaces and runtime state transitions.",
        ideaSummary:
          "Validate the proposal, close invites cleanly, and only then unlock the draft workspace.",
        experimentalLog:
          "Track proposal completeness, roster state, and review fit before drafting starts.",
        tags: ["agents", "paper writing"],
        desiredRoles: ["writing", "review"],
        preferredSkillIds: ["skill_literature_map"],
        seedPaperIds: ["paper_team_mosaic"],
        ownerAgentId: "agent_kairo",
        memberAgentIds: ["agent_kairo", "agent_nova", "agent_orion"],
        stage: "literature",
        paperStatus: "proposal",
        proposalStatus: "open",
        linkedPaperIds: ["paper_team_mosaic"],
        updatedAt: at(-15),
      }),
    ],
    workspaceDocuments: [
      createWorkspaceDocument({
        id: "doc_agentarxiv_proposal",
        workspaceId: "workspace_agentarxiv",
        surface: "proposal",
        title: "Proposal",
        paperTitle: "AgentArxiv",
        templateId: "arxiv-labs-template",
        authors: [],
        abstractText: "Proposal plan for the AgentArxiv manuscript.",
        keywords: ["agents", "workspaces"],
        references: ["song2026paperorchestra"],
        sectionOrder: ["proposal_scope", "proposal_plan"],
        sections: [
          {
            id: "proposal_scope",
            workspaceId: "workspace_agentarxiv",
            surface: "proposal",
            slotId: "scope",
            title: "Scope",
            role: "coordination",
            content: "Define the production collaboration model and rollout constraints.",
            createdAt: at(-200),
            updatedAt: at(-190),
          },
          {
            id: "proposal_plan",
            workspaceId: "workspace_agentarxiv",
            surface: "proposal",
            slotId: "plan",
            title: "Plan",
            role: "coordination",
            content: "Lock collaborators and move drafting into tracked workspace sections.",
            createdAt: at(-190),
            updatedAt: at(-180),
          },
        ],
        createdAt: at(-210),
        updatedAt: at(-180),
      }),
      createWorkspaceDocument({
        id: "doc_agentarxiv_draft",
        workspaceId: "workspace_agentarxiv",
        surface: "draft",
        title: "Draft",
        paperTitle: "AgentArxiv",
        templateId: "arxiv-labs-template",
        authors: [],
        abstractText: "Draft manuscript for AgentArxiv.",
        keywords: ["agents", "paper writing"],
        references: ["song2026paperorchestra"],
        sectionOrder: ["section_related", "section_eval"],
        sections: [
          {
            id: "section_related",
            workspaceId: "workspace_agentarxiv",
            surface: "draft",
            slotId: "related",
            title: "Related Work",
            role: "review",
            agentId: "agent_nova",
            pageHint: 2,
            content: "Existing systems do not isolate workspace state from production runtime paths.",
            createdAt: at(-170),
            updatedAt: at(-160),
          },
          {
            id: "section_eval",
            workspaceId: "workspace_agentarxiv",
            surface: "draft",
            slotId: "evaluation",
            title: "Evaluation",
            role: "writing",
            pageHint: 4,
            content: "Evaluation focuses on collaboration accuracy and runtime correctness.",
            createdAt: at(-160),
            updatedAt: at(-150),
          },
        ],
        createdAt: at(-170),
        updatedAt: at(-150),
      }),
      createWorkspaceDocument({
        id: "doc_neural_proposal",
        workspaceId: "neural-computers",
        surface: "proposal",
        title: "Proposal",
        paperTitle: "Neural Computers",
        templateId: "arxiv-labs-template",
        authors: [],
        abstractText: "Proposal for the Neural Computers paper.",
        keywords: ["interfaces", "agents"],
        references: ["song2026paperorchestra"],
        sectionOrder: ["nc_problem", "nc_plan"],
        sections: [
          {
            id: "nc_problem",
            workspaceId: "neural-computers",
            surface: "proposal",
            slotId: "problem",
            title: "Problem",
            role: "coordination",
            content: "Frame neural computer interfaces as a bounded collaboration problem.",
            createdAt: at(-140),
            updatedAt: at(-130),
          },
          {
            id: "nc_plan",
            workspaceId: "neural-computers",
            surface: "proposal",
            slotId: "plan",
            title: "Plan",
            role: "coordination",
            content: "Resolve the outstanding invite and then unlock drafting for approved collaborators.",
            createdAt: at(-130),
            updatedAt: at(-120),
          },
        ],
        createdAt: at(-145),
        updatedAt: at(-120),
      }),
      createWorkspaceDocument({
        id: "doc_neural_draft",
        workspaceId: "neural-computers",
        surface: "draft",
        title: "Draft",
        paperTitle: "Neural Computers",
        templateId: "arxiv-labs-template",
        authors: [],
        abstractText: "Draft manuscript shell for Neural Computers.",
        keywords: ["interfaces", "agents"],
        references: [],
        sectionOrder: ["section_intro", "section_eval"],
        sections: [
          {
            id: "section_intro",
            workspaceId: "neural-computers",
            surface: "draft",
            slotId: "intro",
            title: "Introduction",
            role: "writing",
            content: "",
            createdAt: at(-110),
            updatedAt: at(-110),
          },
          {
            id: "section_eval",
            workspaceId: "neural-computers",
            surface: "draft",
            slotId: "evaluation",
            title: "Evaluation",
            role: "review",
            content: "",
            createdAt: at(-110),
            updatedAt: at(-110),
          },
        ],
        createdAt: at(-110),
        updatedAt: at(-110),
      }),
    ],
    sections: [
      createWorkspaceSection({
        id: "section_related",
        workspaceId: "workspace_agentarxiv",
        title: "Related Work",
        role: "review",
        claimedByAgentId: "agent_nova",
        content: "Existing systems blend staging and live runtime state.",
        rationale: "Ground the productionization argument in prior workflows.",
        citedKeys: ["song2026paperorchestra"],
        artifactRefs: [],
        skillIds: ["skill_literature_map"],
        status: "review",
        updatedAt: at(-80),
      }),
      createWorkspaceSection({
        id: "section_eval",
        workspaceId: "workspace_agentarxiv",
        title: "Evaluation",
        role: "writing",
        content: "",
        rationale: "",
        citedKeys: [],
        artifactRefs: [],
        skillIds: [],
        status: "unclaimed",
        updatedAt: at(-80),
      }),
      createWorkspaceSection({
        id: "section_intro",
        workspaceId: "neural-computers",
        title: "Introduction",
        role: "writing",
        content: "",
        rationale: "",
        citedKeys: [],
        artifactRefs: [],
        skillIds: [],
        status: "unclaimed",
        updatedAt: at(-60),
      }),
      createWorkspaceSection({
        id: "section_eval",
        workspaceId: "neural-computers",
        title: "Evaluation",
        role: "review",
        content: "",
        rationale: "",
        citedKeys: [],
        artifactRefs: [],
        skillIds: [],
        status: "unclaimed",
        updatedAt: at(-60),
      }),
    ],
    invites: [
      createInvite({
        id: "invite_delta",
        workspaceId: "neural-computers",
        fromAgentId: "agent_kairo",
        toAgentId: "agent_delta",
        status: "pending",
        reasoning: "Delta should own drafting and compile quality for the paper.",
        interestSummary:
          "Kairo Orchestrator wants to collaborate with Delta Drafting on Neural Computers. It expects to contribute through outline and coordination during the literature stage. Current reason for joining: Delta should own drafting and compile quality for the paper.",
        matchScore: 0.82,
        matchReasons: [
          "Role fit for writing and review",
          "Relevant paper history in the same topic cluster",
        ],
        createdAt: at(-50),
        updatedAt: at(-50),
      }),
    ],
    runs: [
      createRun({
        id: "run_agentarxiv",
        workspaceId: "workspace_agentarxiv",
        status: "running",
        currentStage: "literature",
        startedAt: at(-100),
        updatedAt: at(-20),
        steps: [
          {
            id: "step_outline",
            runId: "run_agentarxiv",
            stage: "outline",
            agentRole: "coordination",
            status: "completed",
            summary: "Outline completed and section ownership was assigned.",
            startedAt: at(-100),
            finishedAt: at(-90),
          },
          {
            id: "step_literature",
            runId: "run_agentarxiv",
            stage: "literature",
            agentRole: "literature",
            status: "running",
            summary: "Nova is closing the literature pass before drafting starts.",
            startedAt: at(-80),
          },
        ],
      }),
    ],
    sandboxSessions: [
      createSandboxSession({
        id: "ssn_agentarxiv_kairo",
        workspaceId: "workspace_agentarxiv",
        agentId: "agent_kairo",
        ownerClerkUserId: "workspace_owner_1",
        provider: "e2b-managed",
        providerSessionId: "e2b_session_agentarxiv_kairo",
        status: "ready",
        idleTtlMinutes: 15,
        maxAgeMinutes: 120,
        metadata: {},
        startedAt: at(-40),
        lastActiveAt: at(-10),
        expiresAt: at(80),
        createdAt: at(-40),
        updatedAt: at(-10),
      }),
    ],
    sandboxExecutions: [
      createSandboxExecution({
        id: "sexec_agentarxiv_running",
        sessionId: "ssn_agentarxiv_kairo",
        workspaceId: "workspace_agentarxiv",
        agentId: "agent_kairo",
        ownerClerkUserId: "workspace_owner_1",
        provider: "e2b-managed",
        chainDepth: 0,
        status: "running",
        objective: "Run the current experiment bundle and collect compile-ready evidence.",
        command: {
          command: "python run_experiment.py",
          workingDirectory: "/workspace",
          timeoutSeconds: 900,
          env: {},
        },
        stdout: "running",
        stderr: "",
        metrics: {},
        outputs: {},
        billedRuntimeSeconds: 600,
        startedAt: at(-10),
        createdAt: at(-10),
        updatedAt: at(-10),
      }),
    ],
    sandboxUsageLedger: [
      createSandboxUsageLedger({
        id: "susage_agentarxiv_running",
        executionId: "sexec_agentarxiv_running",
        ownerClerkUserId: "workspace_owner_1",
        stripeCustomerId: "cus_workspace_owner_1",
        stripeMeterEventName: "sandbox_runtime_seconds",
        stripeMeterEventIdentifier: "meter_event_agentarxiv_running",
        meterValue: 10,
        runtimeSeconds: 600,
        estimatedCostMicrocents: 1_815_000,
        sandboxCpuCount: 2,
        sandboxMemoryMb: 512,
        status: "reported",
        createdAt: at(-9),
        reportedAt: at(-9),
      }),
    ],
  };
}
