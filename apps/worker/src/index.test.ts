import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FileStoreRepository } from "@agentarxiv/core";
import { createTestState } from "../../../packages/core/src/test-fixture-state";
import { advanceActiveWorkspaceRuns } from "./index";
import {
  getBilledRuntimeSeconds,
  getMeterValueMinutes,
  getSessionExpiryAt,
} from "./sandbox-runtime";

describe("worker stage advancement", () => {
  let tempDirectory = "";
  let repository: FileStoreRepository;

  beforeEach(async () => {
    tempDirectory = await mkdtemp(path.join(tmpdir(), "agentarxiv-worker-"));
    repository = new FileStoreRepository(path.join(tempDirectory, "state.json"), {
      initialState: createTestState(),
    });
  });

  afterEach(async () => {
    await rm(tempDirectory, { recursive: true, force: true });
  });

  it("advances the active run from literature to drafting", async () => {
    await repository.cancelSandboxExecution({
      executionId: "sexec_agentarxiv_running",
    });

    const [result] = await advanceActiveWorkspaceRuns(repository as never);
    const run = await repository.getWorkspaceRun("workspace_agentarxiv");

    expect(run).toBeDefined();
    expect(result).toMatchObject({
      workspaceId: "workspace_agentarxiv",
      status: "advanced",
      currentStage: "drafting",
    });
    expect(run?.currentStage).toBe("drafting");
    expect(run?.steps.at(-1)?.stage).toBe("section_writing");
  });

  it("advances every active workspace run in the same cycle", async () => {
    const state = structuredClone(createTestState());
    const primaryWorkspace = state.workspaces?.[0];
    const primaryRun = state.runs?.[0];

    if (!primaryWorkspace || !primaryRun) {
      throw new Error("Expected base workspace fixture");
    }

    state.sandboxExecutions = [];
    state.sandboxUsageLedger = [];
    state.sandboxSessions = [];
    state.workspaces = [
      ...(state.workspaces ?? []),
      {
        ...primaryWorkspace,
        id: "workspace_agentarxiv_2",
        slug: "workspace-agentarxiv-2",
        title: "AgentArXiv Worker Replica",
      },
    ];
    state.runs = [
      ...(state.runs ?? []),
      {
        ...primaryRun,
        id: "run_agentarxiv_2",
        workspaceId: "workspace_agentarxiv_2",
        steps: primaryRun.steps.map((step, index) => ({
          ...step,
          id: `step_worker_replica_${index}`,
          runId: "run_agentarxiv_2",
        })),
      },
    ];

    const multiRepository = new FileStoreRepository(path.join(tempDirectory, "state-multi.json"), {
      initialState: state,
    });

    const results = await advanceActiveWorkspaceRuns(multiRepository as never);
    const advanced = results.filter(
      (item): item is Extract<(typeof results)[number], { status: "advanced" }> =>
        item.status === "advanced",
    );

    expect(advanced.map((item) => item.workspaceId).sort()).toEqual([
      "workspace_agentarxiv",
      "workspace_agentarxiv_2",
    ]);
    expect(
      advanced.every(
        (item) => item.currentStage === "drafting" && item.runStatus === "running",
      ),
    ).toBe(true);
  });

  it("rounds billed runtime up to Stripe meter minutes without changing raw seconds", () => {
    expect(getBilledRuntimeSeconds("2026-04-13T12:00:00.000Z", "2026-04-13T12:01:59.100Z")).toBe(
      120,
    );
    expect(getMeterValueMinutes(120)).toBe(2);
    expect(getMeterValueMinutes(121)).toBe(3);
  });

  it("expires sandbox sessions at the earlier of idle ttl and hard max age", () => {
    expect(
      getSessionExpiryAt({
        startedAt: "2026-04-13T12:00:00.000Z",
        lastActiveAt: "2026-04-13T12:10:00.000Z",
        idleTtlMinutes: 15,
        maxAgeMinutes: 120,
      }),
    ).toBe("2026-04-13T12:25:00.000Z");

    expect(
      getSessionExpiryAt({
        startedAt: "2026-04-13T12:00:00.000Z",
        lastActiveAt: "2026-04-13T13:58:00.000Z",
        idleTtlMinutes: 15,
        maxAgeMinutes: 120,
      }),
    ).toBe("2026-04-13T14:00:00.000Z");
  });
});
