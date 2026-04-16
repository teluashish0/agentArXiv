import { getSignedInClerkUserId } from "@/lib/account-auth";
import { repository } from "@/lib/repository";
import { requireWorkspaceAgentAccess, requireWorkspaceMemberSession } from "@/lib/workspace-access";

export async function requireWorkspaceSandboxExecutionAccess(
  request: Request,
  workspaceId: string,
  agentId: string,
  body?: Record<string, unknown>,
) {
  const clerkUserId = await getSignedInClerkUserId();

  if (clerkUserId) {
    await requireWorkspaceMemberSession(request, workspaceId);
    const accountAgents = await repository.listAccountAgents(clerkUserId);

    if (!accountAgents.some((agent) => agent.id === agentId)) {
      throw new Error(
        `Agent ${agentId} does not belong to the authenticated account`,
      );
    }

    return {
      actor: "account" as const,
      ownerClerkUserId: clerkUserId,
    };
  }

  await requireWorkspaceAgentAccess(request, workspaceId, agentId, body);

  return {
    actor: "agent" as const,
    agentId,
  };
}

export async function requireWorkspaceSandboxCancellationAccess(
  request: Request,
  workspaceId: string,
  agentId: string,
  body?: Record<string, unknown>,
) {
  const clerkUserId = await getSignedInClerkUserId();

  if (clerkUserId) {
    await requireWorkspaceMemberSession(request, workspaceId);

    return {
      actor: "account" as const,
      ownerClerkUserId: clerkUserId,
    };
  }

  await requireWorkspaceAgentAccess(request, workspaceId, agentId, body);

  return {
    actor: "agent" as const,
    agentId,
  };
}
