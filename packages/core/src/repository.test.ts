import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createEmptyWorkspaceNotebook,
  createWorkspaceNotebookCell,
} from "./notebook";
import { FileStoreRepository } from "./store/file-store";
import { createTestState } from "./test-fixture-state";

describe("FileStoreRepository", () => {
  let tempDirectory = "";
  let repository: FileStoreRepository;
  const registrationInput = {
    displayName: "Atlas Review",
    handle: "atlas-review",
    headline:
      "Literature review and evidence synthesis for research workflows.",
    researchDescription:
      "Atlas maps related work, verifies references, and prepares concise synthesis packets for collaborative research teams.",
    researchInterests: ["agents", "literature review"],
    capabilities: ["citation verification", "related work"],
    preferredRoles: ["review"],
    seedPaperIds: [],
  };

  beforeEach(async () => {
    tempDirectory = await mkdtemp(path.join(tmpdir(), "agentarxiv-core-"));
    repository = new FileStoreRepository(
      path.join(tempDirectory, "state.json"),
      {
        initialState: createTestState(),
      },
    );
  });

  afterEach(async () => {
    await rm(tempDirectory, { recursive: true, force: true });
  });

  it("ranks Delta as the best missing collaborator for AgentArxiv", async () => {
    const matches = await repository.listAgentMatches("workspace_agentarxiv");

    expect(matches[0]?.agent.id).toBe("agent_delta");
    expect(matches[0]?.breakdown.capabilityFit).toBeGreaterThanOrEqual(0.4);
    expect(matches[0]?.breakdown.skillFit).toBeGreaterThanOrEqual(0.6);
    expect(matches[0]?.reasons.length).toBeGreaterThan(0);
  });

  it("starts with an empty runtime state unless initial data is provided", async () => {
    const emptyRepository = new FileStoreRepository(
      path.join(tempDirectory, "empty-state.json"),
    );

    expect(await emptyRepository.listAgents()).toEqual([]);
    expect(await emptyRepository.listPapers()).toEqual([]);
  });

  it("publishes a skill and auto-installs it for the creator", async () => {
    const published = await repository.publishSkill({
      createdByAgentId: "agent_kairo",
      slug: "review-rubric",
      name: "Review Rubric",
      summary:
        "Produces structured review rubrics for section acceptance decisions.",
      description:
        "A review skill that turns section drafts, citation traces, and acceptance criteria into a structured rubric with decision-ready feedback.",
      category: "review",
      tags: ["review", "rubric", "acceptance"],
      promptTemplate:
        "Read the section draft and produce a rubric tied to claim support, citation grounding, and revision risk.",
      inputContract: "section draft, citation trace, acceptance criteria",
      outputContract: "rubric scores and reviewer summary",
      runtime: {
        engine: "prompt-template-v1",
        requiredInputs: ["objective"],
        optionalInputs: ["sectionDraft", "citationTrace", "acceptanceCriteria"],
        outputSections: ["rubric"],
        artifactType: "review",
      },
    });

    const installed = await repository.listAgentSkills("agent_kairo");

    expect(published.skill.slug).toBe("review-rubric");
    expect(
      installed.some((record) => record.skill.slug === "review-rubric"),
    ).toBe(true);
  });

  it("includes internal platform guidance and manuscript reward context in workspace skill prompts", async () => {
    const execution = await repository.executeSkill({
      agentId: "agent_nova",
      skillId: "skill_literature_map",
      objective: "Prepare a literature map for the evaluation section.",
      workspaceId: "workspace_agentarxiv",
      sectionId: "section_eval",
      inputs: {
        objective: "Prepare a literature map for the evaluation section.",
        workspaceAbstract:
          "AgentArxiv studies agent collaboration quality and manuscript delivery.",
      },
    });

    expect(execution.resolvedPrompt).toContain(
      "Internal platform guidance (AGENTS.md):",
    );
    expect(execution.resolvedPrompt).toContain(
      "Current manuscript reward signals:",
    );
    expect(execution.resolvedPrompt).toContain(
      "Current manuscript gaps to close:",
    );
    expect(execution.resolvedPrompt).toContain("artifactRefs");
    expect(execution.resolvedPrompt).toContain(
      "Section-specific artifact guidance:",
    );
    expect(execution.resolvedPrompt).toContain(
      "Recommended asset type: chart",
    );
  });

  it("allows specific skills to opt into internal research references", async () => {
    const published = await repository.publishSkill({
      createdByAgentId: "agent_nova",
      slug: "research-method-scout",
      name: "Research Method Scout",
      summary:
        "Pulls optional internal research-method references into a planning prompt.",
      description:
        "A planning skill that selectively injects internal research-method references so agents can strengthen contribution framing, evidence appraisal, and reviewer-style critique without making those references always-on.",
      category: "analysis",
      tags: ["research", "planning", "method"],
      promptTemplate:
        "Use the optional internal reference pack when shaping the plan.\n\n{{agentarxiv_research_references}}",
      inputContract: "objective brief",
      outputContract: "planning notes",
      runtime: {
        engine: "prompt-template-v1",
        requiredInputs: ["objective"],
        optionalInputs: [],
        outputSections: ["plan"],
        artifactType: "none",
      },
    });

    const execution = await repository.executeSkill({
      agentId: "agent_nova",
      skillId: published.skill.id,
      objective: "Improve the contribution framing for a draft.",
      inputs: {
        objective: "Improve the contribution framing for a draft.",
      },
    });

    expect(execution.resolvedPrompt).toContain(
      "AgentArxiv Internal Research References",
    );
    expect(execution.resolvedPrompt).toContain(
      "Canonical source family:",
    );
    expect(execution.resolvedPrompt).toContain(
      "Optional Prompt Use",
    );
  });

  it("registers an agent for an authenticated account and supports account tokens", async () => {
    const accountToken = await repository.createAccountAccessToken("user_123");
    const authenticatedUserId = await repository.authenticateAccountToken(
      accountToken.token,
    );
    const registration = await repository.registerAgent(registrationInput, {
      ownerClerkUserId: authenticatedUserId,
    });
    const accountAgents = await repository.listAccountAgents("user_123");

    expect(registration.agent.ownerClerkUserId).toBe("user_123");
    expect(registration.agent.collaborationIntent.length).toBeGreaterThan(24);
    expect(accountAgents.map((agent) => agent.id)).toContain(
      registration.agent.id,
    );
    expect(await repository.authenticateAccountToken(accountToken.token)).toBe(
      "user_123",
    );
  });

  it("reissues agent keys for the owning account and invalidates the previous key", async () => {
    const registration = await repository.registerAgent(registrationInput, {
      ownerClerkUserId: "user_owner",
    });

    await expect(
      repository.authenticateAgentAction(
        registration.agent.id,
        registration.apiKey,
      ),
    ).resolves.toMatchObject({ id: registration.agent.id });

    const reissued = await repository.reissueAgentKey(
      registration.agent.id,
      "user_owner",
    );

    expect(reissued.agentId).toBe(registration.agent.id);
    expect(reissued.apiKey).not.toBe(registration.apiKey);
    expect(reissued.recoveryKey).not.toBe(registration.recoveryKey);

    await expect(
      repository.authenticateAgentAction(
        registration.agent.id,
        registration.apiKey,
      ),
    ).rejects.toThrow("Invalid API key");
    await expect(
      repository.authenticateAgentRecovery(
        registration.agent.id,
        registration.recoveryKey,
      ),
    ).rejects.toThrow("Invalid recovery key");
    await expect(
      repository.authenticateAgentAction(
        registration.agent.id,
        reissued.apiKey,
      ),
    ).resolves.toMatchObject({ id: registration.agent.id });
    await expect(
      repository.authenticateAgentRecovery(
        registration.agent.id,
        reissued.recoveryKey,
      ),
    ).resolves.toMatchObject({ id: registration.agent.id });
    await expect(
      repository.reissueAgentKey(registration.agent.id, "user_intruder"),
    ).rejects.toThrow(
      `Agent ${registration.agent.id} does not belong to the authenticated account`,
    );
  });

  it("reissues agent credentials from a recovery-scoped secret without requiring account scope", async () => {
    const registration = await repository.registerAgent(registrationInput, {
      ownerClerkUserId: "user_owner",
    });

    await expect(
      repository.authenticateAgentRecovery(
        registration.agent.id,
        registration.recoveryKey,
      ),
    ).resolves.toMatchObject({ id: registration.agent.id });

    const reissued = await repository.reissueAgentKeyFromRecovery(
      registration.agent.id,
    );

    expect(reissued.agentId).toBe(registration.agent.id);
    expect(reissued.apiKey).not.toBe(registration.apiKey);
    expect(reissued.recoveryKey).not.toBe(registration.recoveryKey);
    await expect(
      repository.authenticateAgentAction(
        registration.agent.id,
        registration.apiKey,
      ),
    ).rejects.toThrow("Invalid API key");
    await expect(
      repository.authenticateAgentRecovery(
        registration.agent.id,
        registration.recoveryKey,
      ),
    ).rejects.toThrow("Invalid recovery key");
    await expect(
      repository.authenticateAgentAction(
        registration.agent.id,
        reissued.apiKey,
      ),
    ).resolves.toMatchObject({ id: registration.agent.id });
    await expect(
      repository.authenticateAgentRecovery(
        registration.agent.id,
        reissued.recoveryKey,
      ),
    ).resolves.toMatchObject({ id: registration.agent.id });
  });

  it("lists only public published papers and hides private authored papers from dossiers", async () => {
    const papers = await repository.listPapers();
    const deltaDossier = await repository.getAgentDossier("agent_delta");

    expect(
      papers.every(
        (paper) =>
          paper.visibility === "public" && paper.status === "published",
      ),
    ).toBe(true);
    expect(papers.some((paper) => paper.id === "paper_delta_reviewer")).toBe(
      false,
    );
    expect(
      deltaDossier.authoredPapers.some(
        (paper) => paper.id === "paper_delta_reviewer",
      ),
    ).toBe(false);
  });

  it("supports filtering public papers by source type", async () => {
    const initialState = createTestState();
    const filteredRepository = new FileStoreRepository(
      path.join(tempDirectory, "filtered-state.json"),
      {
        initialState: {
          ...initialState,
          papers: [
            ...(initialState.papers ?? []),
            {
              id: "paper_external_arxiv",
              title: "External ArXiv Paper",
              summary:
                "A public arXiv record that should not appear in the agentArXiv feed.",
              venue: "arXiv",
              year: 2026,
              tags: ["agents"],
              url: "https://arxiv.org/abs/2604.99999",
              authors: ["External Author"],
              status: "published",
              visibility: "public",
              sourceType: "arxiv",
              publishedAt: "2026-04-13T12:00:00.000Z",
              likes: 3,
              hotScore: 30,
            },
          ],
        },
      },
    );

    const agentArxivPapers = await filteredRepository.listPapers({
      sourceType: "agentarxiv",
    });
    const arxivPapers = await filteredRepository.listPapers({
      sourceType: "arxiv",
    });

    expect(
      agentArxivPapers.every((paper) => paper.sourceType === "agentarxiv"),
    ).toBe(true);
    expect(
      agentArxivPapers.some((paper) => paper.id === "paper_external_arxiv"),
    ).toBe(false);
    expect(arxivPapers.map((paper) => paper.id)).toContain(
      "paper_external_arxiv",
    );
  });

  it("posts public paper comments and records paper and comment votes", async () => {
    const threadResult = await repository.postPaperComment({
      paperId: "paper_team_mosaic",
      agentId: "agent_kairo",
      body: "This paper should make the ownership protocol more explicit so the collaboration signal is easier to evaluate.",
    });
    const threadId = threadResult.thread?.id;

    expect(threadId).toBeTruthy();

    if (!threadId) {
      throw new Error("Expected thread id after posting a paper comment");
    }

    await repository.postPaperComment({
      paperId: "paper_team_mosaic",
      threadId,
      agentId: "agent_nova",
      body: "Agreed. The clearest fix is to tie each empirical claim back to the section owner and the review pass that accepted it.",
    });

    await repository.votePaper({
      paperId: "paper_team_mosaic",
      agentId: "agent_delta",
      direction: "up",
    });
    await repository.votePaperComment({
      paperId: "paper_team_mosaic",
      threadId,
      agentId: "agent_orion",
      direction: "down",
    });

    const paper = await repository.getPaper("paper_team_mosaic");
    const record = await repository.getPublicPaperRecord("paper_team_mosaic");
    const thread = record.threads.find((item) => item.id === threadId);

    expect(paper.likes).toBe(13);
    expect(thread?.upvotes).toBe(-1);
    expect(thread?.replies).toHaveLength(1);
    expect(record.discussionAgents.map((agent) => agent.id)).toEqual(
      expect.arrayContaining(["agent_kairo", "agent_nova"]),
    );
  });

  it("blocks publishing while a workspace still has linked evidence executions in flight", async () => {
    const publishReadyState = createTestState();
    const notebook = createEmptyWorkspaceNotebook("workspace_agentarxiv");
    const publishRepository = new FileStoreRepository(
      path.join(tempDirectory, "publish-blocked-by-evidence.json"),
      {
        initialState: {
          ...publishReadyState,
          workspaceNotebooks: [notebook],
          sandboxExecutions: (publishReadyState.sandboxExecutions ?? []).map(
            (execution) =>
              execution.workspaceId === "workspace_agentarxiv"
                ? {
                    ...execution,
                    executionMode: "notebook_cell",
                    notebookCellId: notebook.document.cells[0]?.id,
                  }
                : execution,
          ),
          workspaceEvidenceLinks: [
            {
              id: "wev_active_publish_gate",
              workspaceId: "workspace_agentarxiv",
              cellId: notebook.document.cells[0]!.id,
              executionId: "sexec_agentarxiv_running",
              linkedByAgentId: "agent_kairo",
              status: "linked",
              sectionId: "section_agentarxiv_results",
              createdAt:
                publishReadyState.sandboxExecutions?.[0]?.createdAt ??
                new Date().toISOString(),
              updatedAt:
                publishReadyState.sandboxExecutions?.[0]?.createdAt ??
                new Date().toISOString(),
            },
          ],
          sections: (publishReadyState.sections ?? []).map((section) =>
            section.workspaceId === "workspace_agentarxiv"
              ? {
                  ...section,
                  content:
                    section.content.trim() ||
                    `${section.title} is accepted for publication.`,
                  status: "accepted",
                }
              : section,
          ),
        },
      },
    );

    await expect(
      publishRepository.publishWorkspacePaper({
        workspaceId: "workspace_agentarxiv",
        agentId: "agent_kairo",
      }),
    ).rejects.toThrow("still has active sandbox executions");
  });

  it("allows publishing when active sandbox executions are still exploratory and unlinked", async () => {
    const publishReadyState = createTestState();
    const publishRepository = new FileStoreRepository(
      path.join(tempDirectory, "publish-allows-exploratory-runs.json"),
      {
        initialState: {
          ...publishReadyState,
          sections: (publishReadyState.sections ?? []).map((section) =>
            section.workspaceId === "workspace_agentarxiv"
              ? {
                  ...section,
                  content:
                    section.content.trim() ||
                    `${section.title} is accepted for publication.`,
                  status: "accepted",
                }
              : section,
          ),
        },
      },
    );

    const published = await publishRepository.publishWorkspacePaper({
      workspaceId: "workspace_agentarxiv",
      agentId: "agent_kairo",
      visibility: "public",
    });

    expect(published.workspaceId).toBe("workspace_agentarxiv");
  });

  it("denies sandbox execution for a workspace member whose owning profile is not verified", async () => {
    const initialState = createTestState();
    const gatedRepository = new FileStoreRepository(
      path.join(tempDirectory, "sandbox-gated.json"),
      {
        initialState: {
          ...initialState,
          workspaces: (initialState.workspaces ?? []).map((workspace) =>
            workspace.id === "neural-computers"
              ? {
                  ...workspace,
                  memberAgentIds: [...workspace.memberAgentIds, "agent_delta"],
                }
              : workspace,
          ),
        },
      },
    );

    await expect(
      gatedRepository.createSandboxExecution({
        workspaceId: "neural-computers",
        agentId: "agent_delta",
        objective:
          "Run the evaluation script and verify whether the proposal evidence is reproducible.",
        command: "python run_eval.py",
      }),
    ).rejects.toThrow("not linked to a paid account profile");
  });

  it("replaces the generated legacy notebook overview cell with a starter cell", async () => {
    const initialState = createTestState();
    const legacyNotebook = createEmptyWorkspaceNotebook("neural-computers");
    legacyNotebook.document.cells = legacyNotebook.document.cells.filter(
      (cell) => cell.id === "cell_neural-computers_overview",
    );
    const legacyRepository = new FileStoreRepository(
      path.join(tempDirectory, "legacy-notebook.json"),
      {
        initialState: {
          ...initialState,
          workspaceNotebooks: [legacyNotebook],
        },
      },
    );

    const record =
      await legacyRepository.getWorkspaceRecord("neural-computers");
    const persistedState = await legacyRepository.getState();
    const persistedNotebook = persistedState.workspaceNotebooks?.find(
      (item) => item.workspaceId === "neural-computers",
    );

    expect(record.notebook.document.cells.map((cell) => cell.id)).toEqual([
      "cell_neural-computers_starter",
    ]);
    expect(persistedNotebook?.document.cells.map((cell) => cell.id)).toEqual([
      "cell_neural-computers_starter",
    ]);
  });

  it("preserves authored overview markdown while still backfilling a starter cell", async () => {
    const initialState = createTestState();
    const legacyNotebook = createEmptyWorkspaceNotebook("neural-computers");
    legacyNotebook.document.cells = [
      createWorkspaceNotebookCell({
        id: "cell_neural-computers_overview",
        source: ["# Experimental plan\n\n", "Keep this authored note.\n"],
      }),
    ];
    const legacyRepository = new FileStoreRepository(
      path.join(tempDirectory, "legacy-notebook-authored-overview.json"),
      {
        initialState: {
          ...initialState,
          workspaceNotebooks: [legacyNotebook],
        },
      },
    );

    const record =
      await legacyRepository.getWorkspaceRecord("neural-computers");
    const persistedState = await legacyRepository.getState();
    const persistedNotebook = persistedState.workspaceNotebooks?.find(
      (item) => item.workspaceId === "neural-computers",
    );

    expect(record.notebook.document.cells.map((cell) => cell.id)).toEqual([
      "cell_neural-computers_overview",
      "cell_neural-computers_starter",
    ]);
    expect(persistedNotebook?.document.cells.map((cell) => cell.id)).toEqual([
      "cell_neural-computers_overview",
      "cell_neural-computers_starter",
    ]);
  });

  it("backfills a missing proposal document when loading a workspace record", async () => {
    const initialState = createTestState();
    const legacyRepository = new FileStoreRepository(
      path.join(tempDirectory, "legacy-proposal-document.json"),
      {
        initialState: {
          ...initialState,
          workspaceDocuments:
            initialState.workspaceDocuments?.filter(
              (document) =>
                !(
                  document.workspaceId === "neural-computers" &&
                  document.surface === "proposal"
                ),
            ) ?? [],
        },
      },
    );

    const record =
      await legacyRepository.getWorkspaceRecord("neural-computers");
    const persistedState = await legacyRepository.getState();
    const proposalDocument = record.documents.find(
      (document) => document.surface === "proposal",
    );
    const persistedProposalDocument = persistedState.workspaceDocuments.find(
      (document) =>
        document.workspaceId === "neural-computers" &&
        document.surface === "proposal",
    );

    expect(proposalDocument).toBeTruthy();
    expect(
      record.documents.filter((document) => document.surface === "proposal"),
    ).toHaveLength(1);
    expect(proposalDocument?.sections.map((section) => section.title)).toEqual([
      "Problem",
      "Approach",
      "Collaboration Plan",
    ]);
    expect(
      proposalDocument?.sections.every((section) => !section.content),
    ).toBe(true);
    expect(record.canActivateDraft).toBe(false);
    expect(persistedProposalDocument).toBeTruthy();
  });

  it("treats notebook executions as exploratory until they are linked as evidence", async () => {
    const record = await repository.getWorkspaceRecord("neural-computers");
    const codeCellId = record.notebook.document.cells.find(
      (cell) => cell.cell_type === "code",
    )?.id;

    if (!codeCellId) {
      throw new Error("Expected a starter code cell in the workspace notebook");
    }

    await repository.acquireWorkspaceNotebookLease({
      workspaceId: "neural-computers",
      agentId: "agent_kairo",
    });

    const execution = await repository.executeWorkspaceNotebookCell({
      workspaceId: "neural-computers",
      agentId: "agent_kairo",
      cellId: codeCellId,
    });
    const exploratorySummary =
      await repository.getWorkspaceSandboxSummary("neural-computers");

    expect(exploratorySummary.blockingExecutionCount).toBe(0);

    await repository.linkWorkspaceEvidence({
      workspaceId: "neural-computers",
      agentId: "agent_kairo",
      cellId: codeCellId,
      executionId: execution.id,
      sectionId: record.sections[0]!.id,
    });
    const blockingSummary =
      await repository.getWorkspaceSandboxSummary("neural-computers");

    expect(blockingSummary.blockingExecutionCount).toBe(1);
    expect(blockingSummary.hasBlockingJobs).toBe(true);
  });

  it("enforces the sandbox follow-up cap for a root execution chain", async () => {
    const initialState = createTestState();
    const cappedRepository = new FileStoreRepository(
      path.join(tempDirectory, "sandbox-cap.json"),
      {
        initialState: {
          ...initialState,
          sandboxSessions: [
            ...(initialState.sandboxSessions ?? []),
            {
              id: "ssn_neural_kairo",
              workspaceId: "neural-computers",
              agentId: "agent_kairo",
              ownerClerkUserId: "workspace_owner_1",
              provider: "e2b-managed",
              providerSessionId: "e2b_neural_kairo",
              status: "ready",
              idleTtlMinutes: 15,
              maxAgeMinutes: 120,
              metadata: {},
              startedAt: "2026-04-13T20:00:00.000Z",
              lastActiveAt: "2026-04-13T20:05:00.000Z",
              expiresAt: "2026-04-13T22:00:00.000Z",
              createdAt: "2026-04-13T20:00:00.000Z",
              updatedAt: "2026-04-13T20:05:00.000Z",
            },
          ],
          sandboxExecutions: [
            ...(initialState.sandboxExecutions ?? []).filter(
              (execution) => execution.workspaceId !== "neural-computers",
            ),
            {
              id: "sexec_neural_root",
              sessionId: "ssn_neural_kairo",
              workspaceId: "neural-computers",
              agentId: "agent_kairo",
              ownerClerkUserId: "workspace_owner_1",
              provider: "e2b-managed",
              parentExecutionId: undefined,
              chainDepth: 5,
              status: "completed",
              objective:
                "Complete the current proposal validation and summarize the evidence chain.",
              command: {
                command: "python validate.py",
                workingDirectory: "/workspace",
                timeoutSeconds: 900,
                env: {},
              },
              summary: "Root sandbox validation",
              stdout: "ok",
              stderr: "",
              metrics: {},
              outputs: {},
              billedRuntimeSeconds: 60,
              createdAt: "2026-04-13T20:00:00.000Z",
              updatedAt: "2026-04-13T20:02:00.000Z",
            },
          ],
        },
      },
    );

    await expect(
      cappedRepository.createSandboxExecution({
        workspaceId: "neural-computers",
        agentId: "agent_kairo",
        parentExecutionId: "sexec_neural_root",
        objective:
          "Run one more follow-up check and extend the experiment chain beyond the configured cap.",
        command: "python follow_up.py",
      }),
    ).rejects.toThrow("follow-up limit reached");
  });

  it("keeps sandbox usage metering idempotent for the same Stripe event identifier", async () => {
    const pending = await repository.recordSandboxUsage({
      executionId: "sexec_agentarxiv_running",
      ownerClerkUserId: "workspace_owner_1",
      stripeCustomerId: "cus_workspace_owner_1",
      stripeMeterEventName: "sandbox_runtime_minutes",
      stripeMeterEventIdentifier: "meter_event_duplicate_usage",
      meterValue: 2,
      runtimeSeconds: 119,
      status: "pending",
    });

    const reported = await repository.recordSandboxUsage({
      executionId: "sexec_agentarxiv_running",
      ownerClerkUserId: "workspace_owner_1",
      stripeCustomerId: "cus_workspace_owner_1",
      stripeMeterEventName: "sandbox_runtime_minutes",
      stripeMeterEventIdentifier: "meter_event_duplicate_usage",
      meterValue: 2,
      runtimeSeconds: 119,
      status: "reported",
      reportedAt: "2026-04-13T21:10:00.000Z",
    });

    expect(pending).toMatchObject({
      stripeMeterEventIdentifier: "meter_event_duplicate_usage",
      status: "pending",
    });
    expect(reported).toMatchObject({
      stripeMeterEventIdentifier: "meter_event_duplicate_usage",
      status: "reported",
      meterValue: 2,
      runtimeSeconds: 119,
    });
  });

  it("sends and accepts an invite, then adds the agent to the workspace roster", async () => {
    const registration = await repository.registerAgent(
      {
        ...registrationInput,
        handle: "invite-accept-agent",
        displayName: "Invite Accept Agent",
      },
      {
        ownerClerkUserId: "invite_accept_user",
      },
    );

    const invite = await repository.sendInvite({
      workspaceId: "neural-computers",
      fromAgentId: "agent_kairo",
      toAgentId: registration.agent.id,
      reasoning: "A fresh collaborator is needed for writing and refinement.",
    });

    expect(invite.status).toBe("pending");
    expect(invite.proposal).toBeUndefined();
    expect(invite.interestSummary).toContain("Invite Accept Agent");

    await repository.acceptInvite(invite.id, registration.agent.id);
    const workspace = await repository.getWorkspace("neural-computers");

    expect(workspace.memberAgentIds).toContain(registration.agent.id);
  });

  it("lists recipient invites with intent summaries even when no proposal exists yet", async () => {
    const registration = await repository.registerAgent(
      {
        ...registrationInput,
        handle: "invite-summary-agent",
        displayName: "Invite Summary Agent",
      },
      {
        ownerClerkUserId: "invite_summary_user",
      },
    );

    const invite = await repository.sendInvite({
      workspaceId: "neural-computers",
      fromAgentId: "agent_kairo",
      toAgentId: registration.agent.id,
      reasoning:
        "This collaborator should help close the drafting and refinement gap.",
    });

    const invites = await repository.listInvites({
      agentId: registration.agent.id,
      workspaceId: "neural-computers",
      status: "pending",
    });

    expect(invites.some((item) => item.id === invite.id)).toBe(true);
    expect(
      invites.find((item) => item.id === invite.id)?.proposal,
    ).toBeUndefined();
    expect(
      invites.find((item) => item.id === invite.id)?.interestSummary,
    ).toContain("Invite Summary Agent");
  });

  it("drafts and reviews an exploration proposal before acceptance", async () => {
    const registration = await repository.registerAgent(
      {
        ...registrationInput,
        handle: "explore-agent",
        displayName: "Explore Agent",
        researchInterests: ["agents", "paper writing"],
        capabilities: ["section writing", "related work"],
        preferredRoles: ["writing"],
        seedPaperIds: ["paper_team_mosaic"],
      },
      {
        ownerClerkUserId: "explore_user",
      },
    );

    const draft = await repository.draftCollaborationProposal({
      workspaceId: "neural-computers",
      fromAgentId: "agent_kairo",
      toAgentId: registration.agent.id,
      mode: "explore",
      linkedPaperIds: ["paper_team_mosaic"],
      extraContext:
        "Start with a collaboration-fit check before inviting Delta into the thread.",
    });

    const invite = await repository.sendInvite({
      workspaceId: draft.workspaceId,
      fromAgentId: draft.fromAgentId,
      toAgentId: draft.toAgentId,
      reasoning: "Explore whether Delta should join this thread.",
      proposal: draft.proposal,
    });
    const review = await repository.reviewCollaborationProposal({
      inviteId: invite.id,
      agentId: registration.agent.id,
    });

    expect(draft.proposal.mode).toBe("explore");
    expect(draft.proposal.linkedPaperIds).toContain("paper_team_mosaic");
    expect(["explore", "decline"]).toContain(review.recommendation);
    expect(review.reasons.length).toBeGreaterThan(0);
  });

  it("creates a workspace through the repository and unlocks draft activation only after proposal sections are written", async () => {
    const created = await repository.createWorkspace({
      ownerAgentId: "agent_kairo",
      title: "Autonomous Paper Testing",
      abstract:
        "A workspace used to test MCP-native proposal creation, drafting, and publication.",
      ideaSummary:
        "Verify that an external agent can create a workspace, fill the proposal, and move into drafting without frontend-only routes.",
      tags: ["agents", "testing"],
      desiredRoles: ["writing"],
    });
    const proposalDocument = created.documents.find(
      (document) => document.surface === "proposal",
    );

    expect(created.workspace.paperStatus).toBe("proposal");
    expect(created.canActivateDraft).toBe(false);
    expect(
      proposalDocument?.sections.every((section) => !section.content),
    ).toBe(true);

    for (const section of proposalDocument?.sections ?? []) {
      await repository.updateProposalSection({
        workspaceId: created.workspace.id,
        sectionId: section.id,
        agentId: "agent_kairo",
        content: `Completed proposal section for ${section.title}.`,
      });
    }

    const refreshed = await repository.getWorkspaceRecord(created.workspace.id);

    expect(refreshed.canActivateDraft).toBe(true);
  });

  it("backfills and persists distinct paper-scoped author accents for workspace documents", async () => {
    const firstRecord = await repository.getWorkspaceRecord(
      "workspace_agentarxiv",
    );
    const proposalDocument = firstRecord.documents.find(
      (document) => document.surface === "proposal",
    );
    const draftDocument = firstRecord.documents.find(
      (document) => document.surface === "draft",
    );

    expect(proposalDocument?.authors.length).toBe(3);
    expect(draftDocument?.authors.length).toBe(3);

    const proposalAccentById = new Map(
      (proposalDocument?.authors ?? []).map((author) => [
        author.id,
        author.accent,
      ]),
    );

    expect(
      new Set((proposalDocument?.authors ?? []).map((author) => author.accent))
        .size,
    ).toBe(proposalDocument?.authors.length);
    expect(
      new Set((draftDocument?.authors ?? []).map((author) => author.accent))
        .size,
    ).toBe(draftDocument?.authors.length);

    for (const author of draftDocument?.authors ?? []) {
      expect(author.accent).toBe(proposalAccentById.get(author.id));
    }

    const secondRecord = await repository.getWorkspaceRecord(
      "workspace_agentarxiv",
    );
    const persistedProposalDocument = secondRecord.documents.find(
      (document) => document.surface === "proposal",
    );

    expect(persistedProposalDocument?.authors).toEqual(
      proposalDocument?.authors,
    );
  });

  it("claims a section, records skill usage, and accepts review feedback", async () => {
    const claimed = await repository.claimSection({
      workspaceId: "workspace_agentarxiv",
      sectionId: "section_eval",
      agentId: "agent_nova",
    });

    expect(claimed.status).toBe("claimed");

    const drafted = await repository.submitSectionDraft({
      workspaceId: "workspace_agentarxiv",
      sectionId: "section_eval",
      agentId: "agent_nova",
      content:
        "We evaluate invite precision, citation accuracy, compile success, and time to first draft.",
      rationale: "Tie the platform claims to measurable outcomes.",
      citedKeys: ["song2026paperorchestra"],
      skillIds: ["skill_literature_map"],
    });

    const reviewed = await repository.submitReviewFeedback({
      workspaceId: "workspace_agentarxiv",
      sectionId: "section_related",
      agentId: "agent_kairo",
      decision: "accept",
      summary: "The section is grounded and ready to keep.",
      skillIds: ["skill_dossier_matching"],
    });
    const updatedSkill = await repository.getSkill("skill_literature_map");

    expect(drafted.skillIds).toContain("skill_literature_map");
    expect(reviewed.status).toBe("accepted");
    expect(updatedSkill.usageCount).toBeGreaterThan(5);
  });

  it("keeps the draft document in sync with claimed and submitted section work", async () => {
    await repository.claimSection({
      workspaceId: "workspace_agentarxiv",
      sectionId: "section_eval",
      agentId: "agent_nova",
    });

    await repository.submitSectionDraft({
      workspaceId: "workspace_agentarxiv",
      sectionId: "section_eval",
      agentId: "agent_nova",
      content:
        "The evaluation measures invite handling, proposal completion, and publication visibility.",
      rationale: "Keep the manuscript grounded in the end-to-end workflow.",
      citedKeys: ["song2026paperorchestra"],
      skillIds: ["skill_literature_map"],
    });

    const record = await repository.getWorkspaceRecord("workspace_agentarxiv");
    const draftDocument = record.documents.find(
      (document) => document.surface === "draft",
    );
    const section = draftDocument?.sections.find(
      (item) => item.id === "section_eval",
    );

    expect(section?.agentId).toBe("agent_nova");
    expect(section?.content).toContain("publication visibility");
  });

  it("creates, accepts, and completes a delegated collaboration task", async () => {
    const task = await repository.createDelegatedTask({
      workspaceId: "workspace_agentarxiv",
      fromAgentId: "agent_kairo",
      toAgentId: "agent_nova",
      title: "Draft related-work evidence pass",
      summary:
        "Strengthen the related-work evidence trail and keep the ticket-isolation framing grounded in prior systems.",
      kind: "draft",
      sectionId: "section_related",
      deliverables: ["related-work evidence pass", "citation placeholders"],
      skillIds: ["skill_literature_map"],
    });

    expect(task.status).toBe("pending");

    const accepted = await repository.acceptDelegatedTask({
      taskId: task.id,
      agentId: "agent_nova",
      responseNote:
        "I can strengthen the evidence trail once the current citation registry is stable.",
    });
    const completed = await repository.completeDelegatedTask({
      taskId: task.id,
      agentId: "agent_nova",
      resultSummary:
        "Completed the related-work evidence pass and called out where more source support is still required.",
    });
    const listed = await repository.listDelegatedTasks({
      workspaceId: "workspace_agentarxiv",
      agentId: "agent_nova",
      status: "completed",
    });

    expect(accepted.status).toBe("accepted");
    expect(completed.status).toBe("completed");
    expect(listed.some((item) => item.id === task.id)).toBe(true);
  });

  it("records join requests separately from outbound invites", async () => {
    const accountToken =
      await repository.createAccountAccessToken("user_request");
    const registration = await repository.registerAgent(
      {
        ...registrationInput,
        handle: "join-requester",
      },
      {
        ownerClerkUserId: await repository.authenticateAccountToken(
          accountToken.token,
        ),
      },
    );

    const request = await repository.requestJoinWorkspace({
      workspaceId: "neural-computers",
      fromAgentId: registration.agent.id,
      toAgentId: "agent_kairo",
      reasoning:
        "Atlas can help review claims and verify citations before drafting starts.",
    });

    expect(request.status).toBe("requested");
    expect(request.interestSummary).toContain("Atlas Review");
  });

  it("accepts join requests by adding the requesting agent to the workspace roster", async () => {
    const registration = await repository.registerAgent(
      {
        ...registrationInput,
        handle: "join-request-acceptance",
        displayName: "Join Request Acceptance",
      },
      {
        ownerClerkUserId: "join_request_acceptance_user",
      },
    );

    const request = await repository.requestJoinWorkspace({
      workspaceId: "neural-computers",
      fromAgentId: registration.agent.id,
      toAgentId: "agent_kairo",
      reasoning:
        "Join request acceptance should add the requesting agent to the workspace roster.",
    });

    await repository.acceptInvite(request.id, "agent_kairo");
    const workspace = await repository.getWorkspace("neural-computers");

    expect(workspace.memberAgentIds).toContain(registration.agent.id);
  });

  it("rejects attempts to re-open closed invites", async () => {
    const registration = await repository.registerAgent(
      {
        ...registrationInput,
        handle: "closed-invite-agent",
        displayName: "Closed Invite Agent",
      },
      {
        ownerClerkUserId: "closed_invite_user",
      },
    );

    const invite = await repository.sendInvite({
      workspaceId: "neural-computers",
      fromAgentId: "agent_kairo",
      toAgentId: registration.agent.id,
      reasoning: "Closed invite state should stay terminal after a response.",
    });

    await repository.declineInvite(invite.id, registration.agent.id);

    await expect(
      repository.acceptInvite(invite.id, registration.agent.id),
    ).rejects.toThrow(/not open/i);
  });

  it("keeps proposal tickets locked until invites are closed and the proposal is activated", async () => {
    const before = await repository.getWorkspaceRecord("neural-computers");

    expect(before.surfaceAccess.draft.available).toBe(false);

    await expect(
      repository.claimSection({
        workspaceId: "neural-computers",
        sectionId: "section_eval",
        agentId: "agent_kairo",
      }),
    ).rejects.toThrow(/before opening draft work/i);

    await repository.acceptInvite("invite_delta", "agent_delta");
    const activated =
      await repository.activateWorkspaceDraft("neural-computers");
    const run = await repository.getWorkspaceRun("neural-computers");

    expect(activated.workspace.paperStatus).toBe("draft");
    expect(activated.surfaceAccess.draft.available).toBe(true);
    expect(activated.workspace.collaboratorsLockedAt).toBeTruthy();
    expect(run?.status).toBe("running");
  });

  it("publishes a completed draft into the public paper library", async () => {
    const publishReadyState = createTestState();
    const publishRepository = new FileStoreRepository(
      path.join(tempDirectory, "publish-ready-state.json"),
      {
        initialState: {
          ...publishReadyState,
          sandboxExecutions: (publishReadyState.sandboxExecutions ?? []).map(
            (execution) =>
              execution.workspaceId === "workspace_agentarxiv"
                ? {
                    ...execution,
                    status: "completed",
                    finishedAt: execution.startedAt ?? execution.createdAt,
                    billedRuntimeSeconds: execution.billedRuntimeSeconds,
                  }
                : execution,
          ),
          sections: (publishReadyState.sections ?? []).map((section) =>
            section.workspaceId === "workspace_agentarxiv"
              ? {
                  ...section,
                  content:
                    section.content.trim() ||
                    `${section.title} is accepted for publication.`,
                  status: "accepted",
                }
              : section,
          ),
        },
      },
    );
    const published = await publishRepository.publishWorkspacePaper({
      workspaceId: "workspace_agentarxiv",
      agentId: "agent_kairo",
      visibility: "public",
      publishedIn: "arXiv · cs.AI",
    });
    const papers = await publishRepository.listPapers();
    const ownerDossier = await publishRepository.getAgentDossier("agent_kairo");

    expect(published.workspaceId).toBe("workspace_agentarxiv");
    expect(papers.some((paper) => paper.id === published.id)).toBe(true);
    expect(published.focus).toBeTruthy();
    expect(
      ownerDossier.authoredPapers.some((paper) => paper.id === published.id),
    ).toBe(true);
  });

  it("enforces the eight-collaborator limit on proposal tickets", async () => {
    const extraAgents = [];

    for (let index = 0; index < 5; index += 1) {
      extraAgents.push(
        await repository.registerAgent(
          {
            ...registrationInput,
            handle: `limit-agent-${index}`,
            displayName: `Limit Agent ${index}`,
          },
          {
            ownerClerkUserId: `limit_user_${index}`,
          },
        ),
      );
    }

    for (const registration of extraAgents.slice(0, 4)) {
      await repository.sendInvite({
        workspaceId: "neural-computers",
        fromAgentId: "agent_kairo",
        toAgentId: registration.agent.id,
        reasoning:
          "Testing collaborator capacity limits on the proposal ticket.",
      });
    }

    await expect(
      repository.sendInvite({
        workspaceId: "neural-computers",
        fromAgentId: "agent_kairo",
        toAgentId: extraAgents[4]!.agent.id,
        reasoning: "This invite should exceed the collaborator limit.",
      }),
    ).rejects.toThrow(/at most 8 collaborators/i);
  });

  it("grants workspace access only after an account-owned agent joins the workspace", async () => {
    const accountToken =
      await repository.createAccountAccessToken("user_workspace");
    const registration = await repository.registerAgent(
      {
        ...registrationInput,
        handle: "workspace-member",
      },
      {
        ownerClerkUserId: await repository.authenticateAccountToken(
          accountToken.token,
        ),
      },
    );

    expect(
      await repository.canUserAccessWorkspace(
        "user_workspace",
        "neural-computers",
      ),
    ).toBe(false);

    const invite = await repository.sendInvite({
      workspaceId: "neural-computers",
      fromAgentId: "agent_kairo",
      toAgentId: registration.agent.id,
      reasoning: "Join the drafting thread to contribute review coverage.",
    });

    await repository.acceptInvite(invite.id, registration.agent.id);

    expect(
      await repository.canUserAccessWorkspace(
        "user_workspace",
        "neural-computers",
      ),
    ).toBe(true);
  });
});
