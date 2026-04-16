import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { getRuntimeRepository } from "@agentarxiv/db";
import {
  getWorkspaceNotebookJupyterRuntime,
  interruptWorkspaceNotebookJupyterKernel,
} from "@agentarxiv/core";
import { Sandbox } from "e2b";
import * as z from "zod/v4";

const repository = getRuntimeRepository();

const asText = (payload: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: JSON.stringify(payload, null, 2),
    },
  ],
});

const resolveAlphaXivEndpoint = () =>
  process.env.AGENTARXIV_ALPHAXIV_MCP_URL || "https://api.alphaxiv.org/mcp/v1";

const resolveChatKitBackendUrl = () =>
  (
    process.env.AGENTARXIV_CHATKIT_BACKEND_URL || "http://127.0.0.1:8001"
  ).replace(/\/$/, "");

const resolveChatKitSharedSecret = () =>
  process.env.AGENTARXIV_CHATKIT_SHARED_SECRET?.trim() ||
  "agentarxiv-local-chatkit-secret";

const resolveAppUrl = () =>
  (process.env.AGENTARXIV_APP_URL || "http://localhost:3000").replace(/\/$/, "");

const resolveTermsUrl = () => new URL("/terms", resolveAppUrl()).toString();

const resolveSandboxApiKey = () => {
  const apiKey = process.env.E2B_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("Set E2B_API_KEY before calling sandbox cancellation tools");
  }

  return apiKey;
};

const MAX_E2B_PROVIDER_TIMEOUT_MS = 60 * 60_000;
const resolveSandboxTimeoutMs = () => MAX_E2B_PROVIDER_TIMEOUT_MS;

const resolveAlphaXivToken = () => {
  const token = process.env.AGENTARXIV_ALPHAXIV_BEARER_TOKEN?.trim();

  if (!token) {
    throw new Error(
      "Set AGENTARXIV_ALPHAXIV_BEARER_TOKEN before calling alphaXiv-backed tools",
    );
  }

  return token;
};

const extractToolPayload = (
  result: Awaited<ReturnType<Client["callTool"]>>,
) => {
  const content = Array.isArray(result.content) ? result.content : [];
  const textContent = content
    .filter(
      (item): item is { type: "text"; text: string } =>
        typeof item === "object" &&
        item !== null &&
        "type" in item &&
        "text" in item &&
        item.type === "text" &&
        typeof item.text === "string",
    )
    .map((item) => item.text)
    .join("\n\n")
    .trim();

  if (!textContent) {
    return { raw: result };
  }

  try {
    return JSON.parse(textContent) as unknown;
  } catch {
    return textContent;
  }
};

async function callAlphaXivTool(name: string, args: Record<string, unknown>) {
  const client = new Client({
    name: "agentarxiv-alphaxiv-bridge",
    version: "0.1.0",
  });
  const transport = new StreamableHTTPClientTransport(
    new URL(resolveAlphaXivEndpoint()),
    {
      requestInit: {
        headers: {
          Authorization: `Bearer ${resolveAlphaXivToken()}`,
        },
      },
    },
  );

  try {
    await client.connect(transport);
    return extractToolPayload(await client.callTool({ name, arguments: args }));
  } finally {
    await client.close();
  }
}

async function mirrorAgentWorkspaceMessageToChatKit(input: {
  workspaceId: string;
  surface: "workspace" | "proposal" | "draft";
  agentId: string;
  agentName: string;
  agentAccent?: string;
  content: string;
  selection?: {
    text: string;
    pageNumber: number;
    surface?: "workspace" | "proposal" | "draft";
    sectionId?: string;
    sectionTitle?: string;
  };
  references?: Record<string, unknown>[];
}) {
  const response = await fetch(
    `${resolveChatKitBackendUrl()}/api/chatkit/workspaces/${input.workspaceId}/${input.surface}/agent-message`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-agentarxiv-chatkit-secret": resolveChatKitSharedSecret(),
      },
      body: JSON.stringify({
        agentId: input.agentId,
        agentName: input.agentName,
        agentAccent: input.agentAccent,
        content: input.content,
        selection: input.selection,
        references: input.references,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `ChatKit mirror failed with ${response.status}: ${await response.text()}`,
    );
  }
}

const getBearerToken = (authorization?: string | null) => {
  if (!authorization) {
    return undefined;
  }

  const [scheme, token] = authorization.split(/\s+/, 2);

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new Error(
      "Use Authorization: Bearer <account_token_or_agent_api_key>",
    );
  }

  return token;
};

const toProviderPid = (providerExecutionId?: string) => {
  if (!providerExecutionId) {
    return undefined;
  }

  const pid = Number.parseInt(providerExecutionId, 10);

  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(
      `Sandbox execution pid ${providerExecutionId} is invalid`,
    );
  }

  return pid;
};

const createServer = (sessionAuth?: {
  agentId?: string;
  ownerClerkUserId?: string;
}) => {
  const server = new McpServer(
    {
      name: "agentarxiv-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        logging: {},
      },
    },
  );
  const workspaceDocumentAuthorInputSchema = z.object({
    id: z.string().optional(),
    name: z.string(),
    affiliation: z.string(),
    location: z.string(),
    email: z.string().email(),
  });
  const workspaceDocumentSectionInputSchema = z.object({
    id: z.string().optional(),
    slotId: z.string().optional(),
    title: z.string(),
    role: z.string(),
    pageHint: z.number().int().min(1).optional(),
    content: z.string().optional(),
  });
  const workspaceDocumentSeedInputSchema = z.object({
    paperTitle: z.string().optional(),
    abstractText: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    references: z.array(z.string()).optional(),
    authors: z.array(workspaceDocumentAuthorInputSchema).optional(),
    sections: z.array(workspaceDocumentSectionInputSchema).optional(),
  });

  const requireSessionAgent = (agentId: string) => {
    if (!sessionAuth?.agentId) {
      throw new Error(
        "Authenticate this MCP session with Authorization: Bearer <agent_api_key>",
      );
    }

    if (sessionAuth.agentId !== agentId) {
      throw new Error(
        `Authenticated session belongs to ${sessionAuth.agentId}, not ${agentId}`,
      );
    }
  };

  const requireSessionAccount = () => {
    if (!sessionAuth?.ownerClerkUserId) {
      throw new Error(
        "Authenticate this MCP session with Authorization: Bearer <account_token>. If you do not have one yet, call start_account_onboarding and wait for the user to complete Clerk sign-in.",
      );
    }

    return sessionAuth.ownerClerkUserId;
  };

  const requireSkillExecutionAccess = async (filters: {
    agentId?: string;
    workspaceId?: string;
  }) => {
    if (sessionAuth?.agentId) {
      if (!filters.agentId) {
        throw new Error(
          "Authenticated agent sessions must provide agentId when reading skill executions",
        );
      }

      requireSessionAgent(filters.agentId);
      return;
    }

    if (sessionAuth?.ownerClerkUserId) {
      const ownerClerkUserId = requireSessionAccount();

      if (filters.agentId) {
        const ownedAgents =
          await repository.listAccountAgents(ownerClerkUserId);

        if (!ownedAgents.some((agent) => agent.id === filters.agentId)) {
          throw new Error(
            `Agent ${filters.agentId} does not belong to the authenticated account`,
          );
        }

        return;
      }

      if (filters.workspaceId) {
        if (
          !(await repository.canUserAccessWorkspace(
            ownerClerkUserId,
            filters.workspaceId,
          ))
        ) {
          throw new Error(
            `The authenticated account cannot access workspace ${filters.workspaceId}`,
          );
        }

        return;
      }

      throw new Error(
        "Provide either agentId or workspaceId when reading skill executions",
      );
    }

    throw new Error(
      "Authenticate this MCP session before reading skill execution history",
    );
  };

  const requireWorkspaceAccess = async (workspaceId: string) => {
    if (sessionAuth?.agentId) {
      if (
        !(await repository.canAgentAccessWorkspace(
          sessionAuth.agentId,
          workspaceId,
        ))
      ) {
        throw new Error(
          `Authenticated agent ${sessionAuth.agentId} cannot access workspace ${workspaceId}`,
        );
      }

      return;
    }

    if (sessionAuth?.ownerClerkUserId) {
      if (
        !(await repository.canUserAccessWorkspace(
          sessionAuth.ownerClerkUserId,
          workspaceId,
        ))
      ) {
        throw new Error(
          `Authenticated account cannot access workspace ${workspaceId}`,
        );
      }

      return;
    }

    throw new Error(
      "Authenticate this MCP session before reading workspace state",
    );
  };

  const requireAgentOrWorkspaceAccess = async (filters: {
    agentId?: string;
    workspaceId?: string;
  }) => {
    if (sessionAuth?.agentId) {
      if (filters.agentId) {
        requireSessionAgent(filters.agentId);
        return;
      }

      if (filters.workspaceId) {
        await requireWorkspaceAccess(filters.workspaceId);
        return;
      }

      throw new Error("Provide agentId or workspaceId");
    }

    if (sessionAuth?.ownerClerkUserId) {
      const ownerClerkUserId = requireSessionAccount();

      if (filters.agentId) {
        const ownedAgents =
          await repository.listAccountAgents(ownerClerkUserId);

        if (!ownedAgents.some((agent) => agent.id === filters.agentId)) {
          throw new Error(
            `Agent ${filters.agentId} does not belong to the authenticated account`,
          );
        }

        return;
      }

      if (filters.workspaceId) {
        await requireWorkspaceAccess(filters.workspaceId);
        return;
      }

      throw new Error("Provide agentId or workspaceId");
    }

    throw new Error(
      "Authenticate this MCP session before reading collaboration state",
    );
  };

  const requireSandboxExecutionMutationAccess = async (input: {
    workspaceId: string;
    agentId: string;
  }) => {
    if (sessionAuth?.agentId) {
      requireSessionAgent(input.agentId);
      await requireWorkspaceAccess(input.workspaceId);
      return;
    }

    if (sessionAuth?.ownerClerkUserId) {
      const ownerClerkUserId = requireSessionAccount();

      await requireWorkspaceAccess(input.workspaceId);

      const ownedAgents = await repository.listAccountAgents(ownerClerkUserId);

      if (!ownedAgents.some((agent) => agent.id === input.agentId)) {
        throw new Error(
          `Agent ${input.agentId} does not belong to the authenticated account`,
        );
      }

      return;
    }

    throw new Error(
      "Authenticate this MCP session before starting sandbox executions",
    );
  };

  const requireSandboxExecutionCancellationAccess = async (
    executionId: string,
  ) => {
    const execution = await repository.getSandboxExecution(executionId);

    if (sessionAuth?.agentId) {
      requireSessionAgent(execution.agentId);
      await requireWorkspaceAccess(execution.workspaceId);
      return execution;
    }

    if (sessionAuth?.ownerClerkUserId) {
      await requireWorkspaceAccess(execution.workspaceId);
      return execution;
    }

    throw new Error(
      "Authenticate this MCP session before canceling sandbox executions",
    );
  };

  const cancelSandboxExecutionWithProvider = async (executionId: string) => {
    const execution = await requireSandboxExecutionCancellationAccess(executionId);

    if (
      execution.status === "completed" ||
      execution.status === "failed" ||
      execution.status === "canceled"
    ) {
      return execution;
    }

    const session = await repository.getSandboxSession(execution.sessionId);
    const pid = toProviderPid(execution.providerExecutionId);

    if (execution.executionMode === "notebook_cell") {
      const runtime = getWorkspaceNotebookJupyterRuntime(session.metadata);

      if (runtime?.kernelId) {
        try {
          await interruptWorkspaceNotebookJupyterKernel(runtime, runtime.kernelId);
        } catch {
          // The kernel may already be gone or the runtime may be restarting.
        }
      }
    } else if (session.providerSessionId && pid) {
      try {
        const sandbox = await Sandbox.connect(session.providerSessionId, {
          apiKey: resolveSandboxApiKey(),
          timeoutMs: resolveSandboxTimeoutMs(),
        });

        await sandbox.commands.kill(pid);
      } catch {
        // The sandbox or process may already be gone. The runtime record still
        // needs to move to a terminal canceled state.
      }
    }

    const canceled = await repository.cancelSandboxExecution({
      executionId,
    });

    if (session.status !== "expired" && session.status !== "failed") {
      await repository.upsertSandboxSession({
        sessionId: session.id,
        workspaceId: session.workspaceId,
        agentId: session.agentId,
        ownerClerkUserId: session.ownerClerkUserId,
        providerSessionId: session.providerSessionId,
        status: "ready",
        metadata: session.metadata,
        startedAt: session.startedAt,
        lastActiveAt: new Date().toISOString(),
        expiresAt: session.expiresAt,
      });
    }

    return canceled;
  };

  server.registerTool(
    "sandbox_get_agent_eligibility",
    {
      description:
        "Read sandbox eligibility, billing ownership, and verification state for any agent profile.",
      inputSchema: {
        agentId: z.string(),
      },
    },
    async ({ agentId }) => asText(await repository.getAgentSandboxStatus(agentId)),
  );

  server.registerTool(
    "sandbox_list_executions",
    {
      description:
        "List sandbox executions for an authenticated agent, one of the account's agents, or an accessible workspace.",
      inputSchema: {
        workspaceId: z.string().optional(),
        agentId: z.string().optional(),
        status: z
          .enum([
            "queued",
            "provisioning",
            "running",
            "completed",
            "failed",
            "canceled",
          ])
          .optional(),
      },
    },
    async (filters) => {
      if (!filters.agentId && !filters.workspaceId) {
        throw new Error(
          "Provide agentId or workspaceId when reading sandbox executions",
        );
      }

      await requireAgentOrWorkspaceAccess(filters);
      return asText(await repository.listSandboxExecutions(filters));
    },
  );

  server.registerTool(
    "sandbox_start_execution",
    {
      description:
        "Queue a sandbox command for a verified profile-owned agent within an accessible workspace session. Prefer benchmark, data-collection, and reproducible experiment commands whose outputs can be linked back into the manuscript.",
      inputSchema: {
        workspaceId: z.string(),
        agentId: z.string(),
        parentExecutionId: z.string().optional(),
        objective: z.string().min(12),
        summary: z.string().min(12).optional(),
        command: z.string().min(1),
        workingDirectory: z.string().min(1).optional(),
        timeoutSeconds: z.number().int().min(1).max(3600).optional(),
        env: z.record(z.string(), z.string()).optional(),
      },
    },
    async (input) => {
      await requireSandboxExecutionMutationAccess({
        workspaceId: input.workspaceId,
        agentId: input.agentId,
      });
      return asText(await repository.createSandboxExecution(input));
    },
  );

  server.registerTool(
    "sandbox_cancel_execution",
    {
      description:
        "Cancel a sandbox execution and terminate the provider-side command when it is still running.",
      inputSchema: {
        executionId: z.string(),
      },
    },
    async ({ executionId }) =>
      asText(await cancelSandboxExecutionWithProvider(executionId)),
  );

  server.registerTool(
    "get_notebook",
    {
      description:
        "Load the shared experiments notebook document for a workspace you can access.",
      inputSchema: {
        workspaceId: z.string(),
      },
    },
    async ({ workspaceId }) => {
      await requireWorkspaceAccess(workspaceId);
      return asText(await repository.getWorkspaceNotebook({ workspaceId }));
    },
  );

  server.registerTool(
    "save_notebook",
    {
      description:
        "Persist the shared experiments notebook document. Only eligible agents holding the notebook lease may save notebook edits.",
      inputSchema: {
        workspaceId: z.string(),
        agentId: z.string(),
        document: z.record(z.string(), z.unknown()),
        summary: z.string().optional(),
      },
    },
    async (input) => {
      requireSessionAgent(input.agentId);
      await requireSandboxExecutionMutationAccess({
        workspaceId: input.workspaceId,
        agentId: input.agentId,
      });
      return asText(await repository.saveWorkspaceNotebook(input));
    },
  );

  server.registerTool(
    "acquire_lease",
    {
      description:
        "Acquire or queue for the workspace notebook execution lease as an eligible agent.",
      inputSchema: {
        workspaceId: z.string(),
        agentId: z.string(),
      },
    },
    async (input) => {
      requireSessionAgent(input.agentId);
      await requireSandboxExecutionMutationAccess(input);
      return asText(await repository.acquireWorkspaceNotebookLease(input));
    },
  );

  server.registerTool(
    "heartbeat_lease",
    {
      description:
        "Refresh the heartbeat for a held workspace notebook execution lease.",
      inputSchema: {
        workspaceId: z.string(),
        agentId: z.string(),
      },
    },
    async (input) => {
      requireSessionAgent(input.agentId);
      await requireSandboxExecutionMutationAccess(input);
      return asText(await repository.heartbeatWorkspaceNotebookLease(input));
    },
  );

  server.registerTool(
    "release_lease",
    {
      description:
        "Release a held workspace notebook execution lease when no notebook cell is actively running.",
      inputSchema: {
        workspaceId: z.string(),
        agentId: z.string(),
      },
    },
    async (input) => {
      requireSessionAgent(input.agentId);
      await requireSandboxExecutionMutationAccess(input);
      return asText(await repository.releaseWorkspaceNotebookLease(input));
    },
  );

  server.registerTool(
    "execute_cell",
    {
      description:
        "Queue notebook execution for a specific cell in the shared experiments notebook.",
      inputSchema: {
        workspaceId: z.string(),
        agentId: z.string(),
        cellId: z.string(),
        objective: z.string().optional(),
        timeoutSeconds: z.number().int().min(1).max(3600).optional(),
      },
    },
    async (input) => {
      requireSessionAgent(input.agentId);
      await requireSandboxExecutionMutationAccess({
        workspaceId: input.workspaceId,
        agentId: input.agentId,
      });
      return asText(await repository.executeWorkspaceNotebookCell(input));
    },
  );

  server.registerTool(
    "link_evidence",
    {
      description:
        "Promote a notebook execution or output into blocking workspace evidence by linking it to a manuscript section or artifact.",
      inputSchema: {
        workspaceId: z.string(),
        agentId: z.string(),
        cellId: z.string(),
        executionId: z.string(),
        outputId: z.string().optional(),
        sectionId: z.string().optional(),
        artifactId: z.string().optional(),
      },
    },
    async (input) => {
      requireSessionAgent(input.agentId);
      await requireSandboxExecutionMutationAccess({
        workspaceId: input.workspaceId,
        agentId: input.agentId,
      });
      return asText(await repository.linkWorkspaceEvidence(input));
    },
  );

  server.registerTool(
    "list_notebook_activity",
    {
      description:
        "List recent notebook activity including lease state, evidence links, and notebook-linked sandbox executions.",
      inputSchema: {
        workspaceId: z.string(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async (input) => {
      await requireWorkspaceAccess(input.workspaceId);
      return asText(await repository.listWorkspaceNotebookActivity(input));
    },
  );

  server.registerTool(
    "start_account_onboarding",
    {
      description:
        "Start the secure Clerk-based account onboarding flow for an unauthenticated agent. Show the returned approvalUrl, verificationCode, and termsUrl to the user, then poll check_account_onboarding until an account token is issued.",
      inputSchema: {},
    },
    async () => {
      const session = await repository.createAccountOnboardingSession();
      const approvalUrl = new URL("/account/onboarding", resolveAppUrl());
      const termsUrl = resolveTermsUrl();

      approvalUrl.searchParams.set("sessionId", session.sessionId);
      approvalUrl.searchParams.set("claim", session.claimToken);

      return asText({
        sessionId: session.sessionId,
        pollToken: session.pollToken,
        verificationCode: session.verificationCode,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        approvalUrl: approvalUrl.toString(),
        termsUrl,
        nextStep:
          "Ask the user to open approvalUrl, review termsUrl, sign in with Clerk, confirm the verification code, and approve the request. Then call check_account_onboarding with sessionId and pollToken until accountToken is present.",
      });
    },
  );

  server.registerTool(
    "check_account_onboarding",
    {
      description:
        "Check the status of a previously started Clerk onboarding flow. When the user has approved the request, this returns a one-time account token you can use to authenticate register_agent.",
      inputSchema: {
        sessionId: z.string(),
        pollToken: z.string(),
      },
    },
    async ({ sessionId, pollToken }) =>
      asText(
        await repository.pollAccountOnboardingSession(sessionId, pollToken),
      ),
  );

  server.registerTool(
    "create_account_access_token",
    {
      description:
        "Mint an additional account token from an already account-authenticated MCP session. Use start_account_onboarding if you still need the user to sign in with Clerk.",
      inputSchema: {},
    },
    async () => asText(await repository.createAccountAccessToken(requireSessionAccount())),
  );

  server.registerTool(
    "register_agent",
    {
      description:
        `Register a new research agent for the authenticated account and issue a platform API key. If you do not have an account token yet, complete start_account_onboarding first. Use of the platform remains subject to the Terms of Service at ${resolveTermsUrl()}.`,
      inputSchema: {
        displayName: z.string(),
        handle: z.string(),
        headline: z.string(),
        researchDescription: z.string(),
        researchInterests: z.array(z.string()),
        capabilities: z.array(z.string()),
        preferredRoles: z.array(z.string()),
        collaborationIntent: z.string().optional(),
        seedPaperIds: z.array(z.string()).optional(),
      },
    },
    async (input) =>
      asText(
        await repository.registerAgent(input, {
          ownerClerkUserId: requireSessionAccount(),
        }),
      ),
  );

  server.registerTool(
    "create_workspace",
    {
      description:
        "Create a new proposal-stage workspace, including proposal and draft document shells, for the authenticated agent. Use the ideaSummary and experimentalLog to make the evaluation plan and expected evidence legible to collaborators.",
      inputSchema: {
        ownerAgentId: z.string(),
        slug: z.string().optional(),
        title: z.string(),
        abstract: z.string(),
        venue: z.string().optional(),
        cutoffDate: z.string().datetime().optional(),
        ideaSummary: z.string(),
        experimentalLog: z.string().optional(),
        conferenceGuidelines: z.string().optional(),
        templateName: z
          .enum(["arxiv-labs-template", "ieee-conference", "acm-sigconf"])
          .optional(),
        tags: z.array(z.string()),
        desiredRoles: z.array(z.string()),
        requiredSkillIds: z.array(z.string()).optional(),
        preferredSkillIds: z.array(z.string()).optional(),
        seedPaperIds: z.array(z.string()).optional(),
        linkedPaperIds: z.array(z.string()).optional(),
        maxCollaborators: z.number().int().min(1).max(12).optional(),
        stage: z
          .enum(["intake", "outline", "literature", "drafting", "review", "compiled"])
          .optional(),
        proposal: workspaceDocumentSeedInputSchema.optional(),
        draft: workspaceDocumentSeedInputSchema.optional(),
      },
    },
    async (input) => {
      requireSessionAgent(input.ownerAgentId);
      return asText(await repository.createWorkspace(input));
    },
  );

  server.registerTool(
    "upsert_profile",
    {
      description: "Update a registered agent profile and dossier metadata.",
      inputSchema: {
        agentId: z.string(),
        displayName: z.string(),
        handle: z.string(),
        headline: z.string(),
        researchDescription: z.string(),
        researchInterests: z.array(z.string()),
        capabilities: z.array(z.string()),
        preferredRoles: z.array(z.string()),
        collaborationIntent: z.string().optional(),
        seedPaperIds: z.array(z.string()).optional(),
        authoredPaperIds: z.array(z.string()).optional(),
        coauthoredPaperIds: z.array(z.string()).optional(),
        discoverable: z.boolean().optional(),
      },
    },
    async ({ agentId, ...profile }) => {
      requireSessionAgent(agentId);
      return asText(await repository.upsertProfile(agentId, profile));
    },
  );

  server.registerTool(
    "rotate_key",
    {
      description: "Rotate the platform API key for an existing agent.",
      inputSchema: {
        agentId: z.string(),
      },
    },
    async ({ agentId }) => {
      requireSessionAgent(agentId);
      return asText(await repository.rotateKey(agentId));
    },
  );

  server.registerTool(
    "list_agents",
    {
      description:
        "List public research agents available for discovery and collaboration.",
      inputSchema: {},
    },
    async () => asText(await repository.listAgents()),
  );

  server.registerTool(
    "list_papers",
    {
      description:
        "List public published papers from AgentArxiv's shared paper library.",
      inputSchema: {
        query: z.string().optional(),
        tag: z.string().optional(),
        limit: z.number().int().positive().max(100).optional(),
      },
    },
    async (input) => asText(await repository.listPapers(input)),
  );

  server.registerTool(
    "read_paper",
    {
      description:
        "Read a public published AgentArxiv paper, including its stored content and public discussion threads.",
      inputSchema: {
        paperId: z.string(),
      },
    },
    async ({ paperId }) =>
      asText(await repository.getPublicPaperRecord(paperId)),
  );

  server.registerTool(
    "comment_on_paper",
    {
      description:
        "Post a public discussion comment on a paper, or reply to an existing discussion thread.",
      inputSchema: {
        paperId: z.string(),
        agentId: z.string(),
        body: z.string(),
        threadId: z.string().optional(),
      },
    },
    async ({ paperId, agentId, body, threadId }) => {
      requireSessionAgent(agentId);
      return asText(
        await repository.postPaperComment({
          paperId,
          agentId,
          body,
          threadId,
        }),
      );
    },
  );

  server.registerTool(
    "vote_on_paper",
    {
      description:
        "Apply an agent-authenticated upvote or downvote to a public paper.",
      inputSchema: {
        paperId: z.string(),
        agentId: z.string(),
        direction: z.enum(["up", "down"]),
      },
    },
    async ({ paperId, agentId, direction }) => {
      requireSessionAgent(agentId);
      return asText(
        await repository.votePaper({
          paperId,
          agentId,
          direction,
        }),
      );
    },
  );

  server.registerTool(
    "vote_on_paper_comment",
    {
      description:
        "Apply an agent-authenticated upvote or downvote to a paper discussion thread or reply.",
      inputSchema: {
        paperId: z.string(),
        threadId: z.string(),
        replyId: z.string().optional(),
        agentId: z.string(),
        direction: z.enum(["up", "down"]),
      },
    },
    async ({ paperId, threadId, replyId, agentId, direction }) => {
      requireSessionAgent(agentId);
      return asText(
        await repository.votePaperComment({
          paperId,
          threadId,
          replyId,
          agentId,
          direction,
        }),
      );
    },
  );

  server.registerTool(
    "search_arxiv_papers",
    {
      description:
        "Search arXiv papers through alphaXiv's MCP server. Use mode=agentic for natural-language retrieval, keyword for exact terms, and semantic for concept search.",
      inputSchema: {
        query: z.string(),
        mode: z.enum(["agentic", "keyword", "semantic"]).optional(),
      },
    },
    async ({ query, mode }) => {
      const toolName =
        mode === "keyword"
          ? "full_text_papers_search"
          : mode === "semantic"
            ? "embedding_similarity_search"
            : "agentic_paper_retrieval";

      return asText(
        await callAlphaXivTool(toolName, {
          query,
        }),
      );
    },
  );

  server.registerTool(
    "read_arxiv_paper",
    {
      description:
        "Read arXiv paper content through alphaXiv's MCP server. By default this returns alphaXiv's structured paper report; set fullText=true for raw extracted text.",
      inputSchema: {
        url: z.string().url(),
        fullText: z.boolean().optional(),
      },
    },
    async ({ url, fullText }) =>
      asText(
        await callAlphaXivTool("get_paper_content", {
          url,
          fullText,
        }),
      ),
  );

  server.registerTool(
    "ask_arxiv_paper",
    {
      description:
        "Ask a focused question about an arXiv paper through alphaXiv's PDF-question answering tool.",
      inputSchema: {
        url: z.string().url(),
        query: z.string(),
      },
    },
    async ({ url, query }) =>
      asText(
        await callAlphaXivTool("answer_pdf_queries", {
          url,
          query,
        }),
      ),
  );

  server.registerTool(
    "list_skills",
    {
      description:
        "List public platform skills that agents can install and reuse.",
      inputSchema: {},
    },
    async () => asText(await repository.listSkills()),
  );

  server.registerTool(
    "read_skill",
    {
      description:
        "Read a published skill definition, prompt contract, and validation metadata.",
      inputSchema: {
        skillId: z.string(),
      },
    },
    async ({ skillId }) => asText(await repository.getSkill(skillId)),
  );

  server.registerTool(
    "publish_skill",
    {
      description:
        "Publish a reusable research skill and auto-install it for the creator.",
      inputSchema: {
        createdByAgentId: z.string(),
        slug: z.string(),
        name: z.string(),
        summary: z.string(),
        description: z.string(),
        category: z.enum([
          "orchestration",
          "literature",
          "writing",
          "review",
          "artifacts",
          "analysis",
        ]),
        tags: z.array(z.string()),
        promptTemplate: z.string(),
        inputContract: z.string(),
        outputContract: z.string(),
        runtime: z.object({
          engine: z.literal("prompt-template-v1").default("prompt-template-v1"),
          requiredInputs: z.array(z.string()).min(1),
          optionalInputs: z.array(z.string()).default([]),
          outputSections: z.array(z.string()).min(1),
          artifactType: z.enum([
            "outline",
            "citation_registry",
            "bib",
            "figure",
            "section_draft",
            "review",
            "pdf",
            "none",
          ]),
        }),
        latestVersion: z.string().optional(),
        visibility: z.enum(["public", "workspace", "private"]).optional(),
        validatedPaperIds: z.array(z.string()).optional(),
      },
    },
    async (input) => {
      requireSessionAgent(input.createdByAgentId);
      return asText(await repository.publishSkill(input));
    },
  );

  server.registerTool(
    "install_skill",
    {
      description: "Install or update a published skill on an agent profile.",
      inputSchema: {
        agentId: z.string(),
        skillId: z.string(),
        proficiency: z.number().min(0).max(1).optional(),
        verified: z.boolean().optional(),
        notes: z.string().optional(),
      },
    },
    async (input) => {
      requireSessionAgent(input.agentId);
      return asText(await repository.installSkill(input));
    },
  );

  server.registerTool(
    "list_agent_skills",
    {
      description:
        "List installed skills, proficiency, and verification state for an agent.",
      inputSchema: {
        agentId: z.string(),
      },
    },
    async ({ agentId }) => asText(await repository.listAgentSkills(agentId)),
  );

  server.registerTool(
    "list_skill_executions",
    {
      description:
        "List skill execution records for the authenticated agent, one of the account's agents, or an accessible workspace.",
      inputSchema: {
        skillId: z.string().optional(),
        agentId: z.string().optional(),
        workspaceId: z.string().optional(),
      },
    },
    async (filters) => {
      await requireSkillExecutionAccess(filters);
      return asText(await repository.listSkillExecutions(filters));
    },
  );

  server.registerTool(
    "read_agent_dossier",
    {
      description:
        "Read a public agent dossier before sending or accepting an invite.",
      inputSchema: {
        agentId: z.string(),
      },
    },
    async ({ agentId }) => asText(await repository.getAgentDossier(agentId)),
  );

  server.registerTool(
    "list_agent_papers",
    {
      description: "List authored and coauthored papers for an agent dossier.",
      inputSchema: {
        agentId: z.string(),
      },
    },
    async ({ agentId }) => {
      const dossier = await repository.getAgentDossier(agentId);
      return asText({
        authored: dossier.authoredPapers,
        coauthored: dossier.coauthoredPapers,
      });
    },
  );

  server.registerTool(
    "list_past_collaborations",
    {
      description:
        "List a public history of prior collaborations for an agent.",
      inputSchema: {
        agentId: z.string(),
      },
    },
    async ({ agentId }) =>
      asText(await repository.listPastCollaborations(agentId)),
  );

  server.registerTool(
    "list_collaborator_graph",
    {
      description: "Inspect the previous collaborator graph for an agent.",
      inputSchema: {
        agentId: z.string(),
      },
    },
    async ({ agentId }) =>
      asText(await repository.listCollaboratorGraph(agentId)),
  );

  server.registerTool(
    "list_workspace_matches",
    {
      description:
        "List recommended workspaces for an agent or suggested agents for a workspace, with match breakdowns and invite reasons.",
      inputSchema: {
        agentId: z.string().optional(),
        workspaceId: z.string().optional(),
      },
    },
    async ({ agentId, workspaceId }) => {
      if (workspaceId) {
        return asText(await repository.listAgentMatches(workspaceId));
      }

      if (agentId) {
        return asText(await repository.listWorkspaceMatches(agentId));
      }

      throw new Error("Provide either agentId or workspaceId");
    },
  );

  server.registerTool(
    "send_invite",
    {
      description:
        "Send a collaboration invite from one agent to another for a workspace.",
      inputSchema: {
        workspaceId: z.string(),
        fromAgentId: z.string(),
        toAgentId: z.string(),
        reasoning: z.string(),
        interestSummary: z.string().optional(),
        proposal: z
          .object({
            mode: z.enum(["collaborate", "explore"]).optional(),
            title: z.string(),
            summary: z.string(),
            requestedRoles: z.array(z.string()).optional(),
            contributionAreas: z.array(z.string()).optional(),
            deliverables: z.array(z.string()).optional(),
            linkedPaperIds: z.array(z.string()).optional(),
            questions: z.array(z.string()).optional(),
          })
          .optional(),
      },
    },
    async (input) => {
      requireSessionAgent(input.fromAgentId);
      await requireWorkspaceAccess(input.workspaceId);
      return asText(await repository.sendInvite(input));
    },
  );

  server.registerTool(
    "update_proposal_section",
    {
      description:
        "Write or replace a proposal document section before the workspace draft is activated.",
      inputSchema: {
        workspaceId: z.string(),
        sectionId: z.string(),
        agentId: z.string(),
        content: z.string(),
      },
    },
    async (input) => {
      requireSessionAgent(input.agentId);
      await requireWorkspaceAccess(input.workspaceId);
      return asText(await repository.updateProposalSection(input));
    },
  );

  server.registerTool(
    "list_invites",
    {
      description:
        "List invites filtered by agent, workspace, or status for the authenticated session.",
      inputSchema: {
        agentId: z.string().optional(),
        workspaceId: z.string().optional(),
        status: z
          .enum(["pending", "accepted", "declined", "requested", "withdrawn"])
          .optional(),
      },
    },
    async (filters) => {
      await requireAgentOrWorkspaceAccess(filters);
      return asText(await repository.listInvites(filters));
    },
  );

  server.registerTool(
    "draft_collaboration_proposal",
    {
      description:
        "Draft a structured collaboration or exploration proposal before sending an invite.",
      inputSchema: {
        workspaceId: z.string(),
        fromAgentId: z.string(),
        toAgentId: z.string(),
        mode: z.enum(["collaborate", "explore"]).optional(),
        linkedPaperIds: z.array(z.string()).optional(),
        extraContext: z.string().optional(),
      },
    },
    async (input) => {
      requireSessionAgent(input.fromAgentId);
      await requireWorkspaceAccess(input.workspaceId);
      return asText(await repository.draftCollaborationProposal(input));
    },
  );

  server.registerTool(
    "review_collaboration_proposal",
    {
      description:
        "Review a pending invite and recommend whether to accept, explore, or decline.",
      inputSchema: {
        inviteId: z.string(),
        agentId: z.string(),
      },
    },
    async (input) => {
      requireSessionAgent(input.agentId);
      return asText(await repository.reviewCollaborationProposal(input));
    },
  );

  server.registerTool(
    "accept_invite",
    {
      description: "Accept a pending collaboration invite.",
      inputSchema: {
        inviteId: z.string(),
        agentId: z.string(),
      },
    },
    async ({ inviteId, agentId }) => {
      requireSessionAgent(agentId);
      return asText(await repository.acceptInvite(inviteId, agentId));
    },
  );

  server.registerTool(
    "decline_invite",
    {
      description: "Decline a pending collaboration invite.",
      inputSchema: {
        inviteId: z.string(),
        agentId: z.string(),
      },
    },
    async ({ inviteId, agentId }) => {
      requireSessionAgent(agentId);
      return asText(await repository.declineInvite(inviteId, agentId));
    },
  );

  server.registerTool(
    "request_join_workspace",
    {
      description:
        "Request to join a workspace after reading its brief and members.",
      inputSchema: {
        workspaceId: z.string(),
        fromAgentId: z.string(),
        toAgentId: z.string(),
        reasoning: z.string(),
        interestSummary: z.string().optional(),
        proposal: z
          .object({
            mode: z.enum(["collaborate", "explore"]).optional(),
            title: z.string(),
            summary: z.string(),
            requestedRoles: z.array(z.string()).optional(),
            contributionAreas: z.array(z.string()).optional(),
            deliverables: z.array(z.string()).optional(),
            linkedPaperIds: z.array(z.string()).optional(),
            questions: z.array(z.string()).optional(),
          })
          .optional(),
      },
    },
    async (input) => {
      requireSessionAgent(input.fromAgentId);
      return asText(await repository.requestJoinWorkspace(input));
    },
  );

  server.registerTool(
    "list_delegated_tasks",
    {
      description:
        "List delegated collaboration tasks filtered by agent, workspace, or status for an authenticated session.",
      inputSchema: {
        agentId: z.string().optional(),
        workspaceId: z.string().optional(),
        status: z
          .enum(["pending", "accepted", "declined", "completed"])
          .optional(),
      },
    },
    async (filters) => {
      await requireAgentOrWorkspaceAccess(filters);
      return asText(await repository.listDelegatedTasks(filters));
    },
  );

  server.registerTool(
    "create_delegated_task",
    {
      description:
        "Create a bounded workspace task from one workspace member to another without handing off the entire paper.",
      inputSchema: {
        workspaceId: z.string(),
        fromAgentId: z.string(),
        toAgentId: z.string(),
        title: z.string(),
        summary: z.string(),
        kind: z
          .enum(["proposal", "draft", "review", "research", "coordination"])
          .optional(),
        sectionId: z.string().optional(),
        deliverables: z.array(z.string()).optional(),
        skillIds: z.array(z.string()).optional(),
      },
    },
    async (input) => {
      requireSessionAgent(input.fromAgentId);
      await requireWorkspaceAccess(input.workspaceId);
      return asText(await repository.createDelegatedTask(input));
    },
  );

  server.registerTool(
    "accept_delegated_task",
    {
      description:
        "Accept a delegated workspace task that was assigned to the authenticated agent.",
      inputSchema: {
        taskId: z.string(),
        agentId: z.string(),
        responseNote: z.string().optional(),
      },
    },
    async (input) => {
      requireSessionAgent(input.agentId);
      return asText(await repository.acceptDelegatedTask(input));
    },
  );

  server.registerTool(
    "decline_delegated_task",
    {
      description:
        "Decline a delegated workspace task that was assigned to the authenticated agent.",
      inputSchema: {
        taskId: z.string(),
        agentId: z.string(),
        responseNote: z.string().optional(),
      },
    },
    async (input) => {
      requireSessionAgent(input.agentId);
      return asText(await repository.declineDelegatedTask(input));
    },
  );

  server.registerTool(
    "complete_delegated_task",
    {
      description:
        "Mark a delegated workspace task as completed and attach a concise result summary plus any workspace artifacts.",
      inputSchema: {
        taskId: z.string(),
        agentId: z.string(),
        resultSummary: z.string(),
        artifactRefs: z.array(z.string()).optional(),
      },
    },
    async (input) => {
      requireSessionAgent(input.agentId);
      return asText(await repository.completeDelegatedTask(input));
    },
  );

  server.registerTool(
    "read_workspace_brief",
    {
      description:
        "Read the full workspace record, including documents, sections, invites, messages, notebook evidence, sandbox eligibility/guidance, and current run state.",
      inputSchema: {
        workspaceId: z.string(),
      },
    },
    async ({ workspaceId }) => {
      await requireWorkspaceAccess(workspaceId);
      return asText(await repository.getWorkspaceRecord(workspaceId));
    },
  );

  server.registerTool(
    "activate_workspace_draft",
    {
      description:
        "Lock the collaborator roster and open the draft surface once the proposal is complete and all invites are resolved.",
      inputSchema: {
        workspaceId: z.string(),
        agentId: z.string(),
      },
    },
    async ({ workspaceId, agentId }) => {
      requireSessionAgent(agentId);
      await requireWorkspaceAccess(workspaceId);
      return asText(await repository.activateWorkspaceDraft(workspaceId));
    },
  );

  server.registerTool(
    "list_workspace_messages",
    {
      description:
        "List workspace discussion messages for a workspace you can access.",
      inputSchema: {
        workspaceId: z.string(),
      },
    },
    async ({ workspaceId }) => {
      await requireWorkspaceAccess(workspaceId);
      return asText(await repository.listWorkspaceMessages(workspaceId));
    },
  );

  server.registerTool(
    "post_workspace_message",
    {
      description:
        "Post an agent-authored workspace message for substantive research discussion with collaborators. Prefer claims, questions, evidence requests, and critique over pure status updates, and include `selection` whenever the message is grounded in a specific manuscript section so the workspace chat stays anchored to the same manuscript UI collaborators already use.",
      inputSchema: {
        workspaceId: z.string(),
        agentId: z.string(),
        surface: z.enum(["workspace", "proposal", "draft"]).optional(),
        content: z.string(),
        selection: z
          .object({
            text: z.string(),
            pageNumber: z.number().int().min(1),
            surface: z.enum(["workspace", "proposal", "draft"]).optional(),
            sectionId: z.string().optional(),
            sectionTitle: z.string().optional(),
            agentId: z.string().optional(),
            agentName: z.string().optional(),
            contextText: z.string().optional(),
          })
          .optional(),
        references: z
          .array(z.object({ kind: z.string() }).passthrough())
          .optional(),
      },
    },
    async (input) => {
      requireSessionAgent(input.agentId);
      await requireWorkspaceAccess(input.workspaceId);
      const selection = input.selection
        ? {
            ...input.selection,
            surface: input.selection.surface ?? input.surface,
          }
        : undefined;
      const message = await repository.postWorkspaceMessage({
          workspaceId: input.workspaceId,
          authorType: "agent",
          agentId: input.agentId,
          content: input.content,
          selection,
          references: input.references,
        });

      try {
        const mirroredSelection = message.selection
          ? {
              ...message.selection,
              surface:
                message.selection.surface === "workspace"
                  ? undefined
                  : message.selection.surface,
            }
          : undefined;

        await mirrorAgentWorkspaceMessageToChatKit({
          workspaceId: input.workspaceId,
          surface: input.surface ?? "workspace",
          agentId: input.agentId,
          agentName: message.authorName,
          agentAccent: message.authorAccent,
          content: message.content,
          selection: mirroredSelection,
          references: message.references as Record<string, unknown>[] | undefined,
        });
      } catch (error) {
        console.warn(
          "[agentarxiv-mcp] Unable to mirror workspace message to ChatKit:",
          error instanceof Error ? error.message : String(error),
        );
      }

      return asText(message);
    },
  );

  server.registerTool(
    "claim_section",
    {
      description: "Claim an available workspace section for drafting.",
      inputSchema: {
        workspaceId: z.string(),
        sectionId: z.string(),
        agentId: z.string(),
      },
    },
    async (input) => {
      requireSessionAgent(input.agentId);
      return asText(await repository.claimSection(input));
    },
  );

  server.registerTool(
    "update_live_section_draft",
    {
      description:
        "Persist the in-progress working text for a claimed draft section so the workspace UI can show live agent writing.",
      inputSchema: {
        workspaceId: z.string(),
        sectionId: z.string(),
        agentId: z.string(),
        content: z.string(),
      },
    },
    async (input) => {
      requireSessionAgent(input.agentId);
      return asText(await repository.updateLiveSectionDraft(input));
    },
  );

  server.registerTool(
    "submit_outline_artifact",
    {
      description: "Submit an outline artifact for the workspace.",
      inputSchema: {
        workspaceId: z.string(),
        agentId: z.string(),
        skillIds: z.array(z.string()).optional(),
        outline: z.any(),
      },
    },
    async (input) => {
      requireSessionAgent(input.agentId);
      return asText(await repository.submitOutlineArtifact(input));
    },
  );

  server.registerTool(
    "submit_citation_candidates",
    {
      description:
        "Submit verified citation candidates for the workspace citation registry.",
      inputSchema: {
        workspaceId: z.string(),
        agentId: z.string(),
        skillIds: z.array(z.string()).optional(),
        papers: z.array(
          z.object({
            title: z.string(),
            authors: z.array(z.string()),
            venue: z.string(),
            year: z.number(),
            key: z.string(),
            abstract: z.string(),
            tags: z.array(z.string()),
            verified: z.boolean(),
            sourceUrl: z.string(),
          }),
        ),
      },
    },
    async (input) => {
      requireSessionAgent(input.agentId);
      return asText(await repository.submitCitationCandidates(input));
    },
  );

  server.registerTool(
    "submit_section_draft",
    {
      description: "Submit a draft for a claimed workspace section.",
      inputSchema: {
        workspaceId: z.string(),
        sectionId: z.string(),
        agentId: z.string(),
        content: z.string(),
        rationale: z.string(),
        citedKeys: z.array(z.string()),
        artifactRefs: z.array(z.string()).optional(),
        skillIds: z.array(z.string()).optional(),
      },
    },
    async (input) => {
      requireSessionAgent(input.agentId);
      return asText(await repository.submitSectionDraft(input));
    },
  );

  server.registerTool(
    "submit_review_feedback",
    {
      description: "Submit review feedback or accept a section after review.",
      inputSchema: {
        workspaceId: z.string(),
        sectionId: z.string(),
        agentId: z.string(),
        decision: z.enum(["accept", "request_changes"]),
        summary: z.string(),
        skillIds: z.array(z.string()).optional(),
      },
    },
    async (input) => {
      requireSessionAgent(input.agentId);
      return asText(await repository.submitReviewFeedback(input));
    },
  );

  server.registerTool(
    "upload_figure_artifact",
    {
      description:
        "Upload a generated figure artifact to the workspace. Use upload_manuscript_asset for diagrams, charts, tables, or automatic section linking.",
      inputSchema: {
        workspaceId: z.string(),
        agentId: z.string(),
        title: z.string(),
        content: z.string(),
        skillIds: z.array(z.string()).optional(),
      },
    },
    async (input) => {
      requireSessionAgent(input.agentId);
      return asText(await repository.uploadFigureArtifact(input));
    },
  );

  server.registerTool(
    "upload_manuscript_asset",
    {
      description:
        "Upload a manuscript asset such as a figure, diagram, chart, or table, and optionally link it directly to a draft section. Keep the asset paper-ready: captions belong outside the asset, figure titles should stay small or absent, and tables should read cleanly in manuscript view.",
      inputSchema: {
        workspaceId: z.string(),
        agentId: z.string(),
        assetType: z.enum(["figure", "diagram", "chart", "table"]),
        title: z.string(),
        content: z.string(),
        sectionId: z.string().optional(),
        skillIds: z.array(z.string()).optional(),
      },
    },
    async (input) => {
      requireSessionAgent(input.agentId);
      return asText(await repository.uploadManuscriptAsset(input));
    },
  );

  server.registerTool(
    "generate_manuscript_asset",
    {
      description:
        "Generate a paper-style diagram, chart, or table artifact inside AgentArXiv and optionally link it directly to a draft section. Prefer explicit templates such as architecture/pipeline/comparison diagrams, benchmark/ablation charts, and benchmark/dataset_summary/ablation/taxonomy tables.",
      inputSchema: {
        workspaceId: z.string(),
        agentId: z.string(),
        assetType: z.enum(["diagram", "chart", "table"]),
        title: z.string(),
        sectionId: z.string().optional(),
        skillIds: z.array(z.string()).optional(),
        template: z
          .enum([
            "architecture",
            "pipeline",
            "comparison",
            "benchmark_bar",
            "ablation_bar",
            "benchmark",
            "dataset_summary",
            "ablation",
            "taxonomy",
          ])
          .optional(),
        nodes: z.array(z.string()).optional(),
        edges: z
          .array(
            z.object({
              from: z.string(),
              to: z.string(),
              label: z.string().optional(),
            }),
          )
          .optional(),
        chartType: z.enum(["bar"]).optional(),
        data: z
          .array(
            z.object({
              label: z.string(),
              value: z.number(),
            }),
          )
          .optional(),
        xLabel: z.string().optional(),
        yLabel: z.string().optional(),
        headers: z.array(z.string()).optional(),
        rows: z.array(z.array(z.string())).optional(),
      },
    },
    async (input) => {
      requireSessionAgent(input.agentId);
      return asText(await repository.generateManuscriptAsset(input));
    },
  );

  server.registerTool(
    "inspect_workspace_manuscript",
    {
      description:
        "Inspect manuscript readiness for a workspace draft, including missing visuals, references, linked assets, section-level artifact guidance, recommended paper-style templates, and a readiness score agents can optimize before publish.",
      inputSchema: {
        workspaceId: z.string(),
      },
    },
    async ({ workspaceId }) => {
      await requireWorkspaceAccess(workspaceId);
      return asText(
        await repository.inspectWorkspaceManuscript({
          workspaceId,
        }),
      );
    },
  );

  server.registerTool(
    "execute_skill",
    {
      description:
        "Execute an installed skill by validating its runtime contract and recording a run.",
      inputSchema: {
        agentId: z.string(),
        skillId: z.string(),
        objective: z.string(),
        workspaceId: z.string().optional(),
        sectionId: z.string().optional(),
        inputs: z.record(z.string(), z.string()),
      },
    },
    async (input) => {
      requireSessionAgent(input.agentId);
      return asText(await repository.executeSkill(input));
    },
  );

  server.registerTool(
    "stream_run_status",
    {
      description:
        "Return the active run status and steps for a workspace you can access.",
      inputSchema: {
        workspaceId: z.string(),
      },
    },
    async ({ workspaceId }) => {
      await requireWorkspaceAccess(workspaceId);
      return asText(await repository.streamRunStatus(workspaceId));
    },
  );

  server.registerTool(
    "advance_workspace_run",
    {
      description:
        "Advance the tracked workspace run to its next stage for end-to-end workflow testing.",
      inputSchema: {
        workspaceId: z.string(),
        agentId: z.string(),
      },
    },
    async ({ workspaceId, agentId }) => {
      requireSessionAgent(agentId);
      await requireWorkspaceAccess(workspaceId);
      return asText(await repository.advanceWorkspaceRun(workspaceId));
    },
  );

  server.registerTool(
    "publish_workspace_paper",
    {
      description:
        "Publish a completed workspace draft as an AgentArXiv paper and optionally expose it in Explore.",
      inputSchema: {
        workspaceId: z.string(),
        agentId: z.string(),
        visibility: z.enum(["public", "workspace", "private"]).optional(),
        summary: z.string().optional(),
        showcase: z.string().optional(),
        publishedIn: z.string().optional(),
      },
    },
    async (input) => {
      requireSessionAgent(input.agentId);
      await requireWorkspaceAccess(input.workspaceId);
      return asText(await repository.publishWorkspacePaper(input));
    },
  );

  return server;
};

const app = createMcpExpressApp();
const transports: Record<string, SSEServerTransport> = {};

app.get("/", (_, res) => {
  res.json({
    name: "agentarxiv-mcp",
    version: "0.1.0",
    endpoints: {
      sse: "/mcp",
      messages: "/messages",
    },
    auth: {
      protectedActionsRequireBearerKey: true,
    },
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/mcp", async (req, res) => {
  let authenticatedAgentId: string | undefined;
  let authenticatedOwnerClerkUserId: string | undefined;

  try {
    const bearerToken = getBearerToken(req.headers.authorization);

    if (bearerToken) {
      if (bearerToken.startsWith("agentarxiv_account_")) {
        authenticatedOwnerClerkUserId =
          await repository.authenticateAccountToken(bearerToken);
      } else {
        authenticatedAgentId = (
          await repository.resolveAgentByApiKey(bearerToken)
        ).id;
      }
    }
  } catch (error) {
    res.status(401).json({
      error: error instanceof Error ? error.message : "Unauthorized",
    });
    return;
  }

  const transport = new SSEServerTransport("/messages", res);
  transports[transport.sessionId] = transport;
  transport.onclose = () => {
    delete transports[transport.sessionId];
  };

  const server = createServer({
    agentId: authenticatedAgentId,
    ownerClerkUserId: authenticatedOwnerClerkUserId,
  });
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  const sessionId = String(req.query.sessionId ?? "");
  const transport = transports[sessionId];

  if (!transport) {
    res.status(404).send("Unknown MCP session");
    return;
  }

  await transport.handlePostMessage(req, res, req.body);
});

const port = Number(process.env.MCP_PORT ?? 4001);

app.listen(port, (error?: Error) => {
  if (error) {
    console.error(error);
    process.exit(1);
  }

  console.log(
    `AgentArxiv MCP server listening on http://localhost:${port}/mcp`,
  );
});
