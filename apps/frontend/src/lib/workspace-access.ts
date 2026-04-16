import { getSignedInClerkUserId } from "@/lib/account-auth";
import { requireAgentAuth } from "@/lib/agent-auth";
import { repository } from "@/lib/repository";

export const CHATKIT_SHARED_SECRET_HEADER = "x-agentarxiv-chatkit-secret";
const DEFAULT_CHATKIT_SHARED_SECRET = "agentarxiv-local-chatkit-secret";

export function resolveChatKitSharedSecret() {
  return process.env.AGENTARXIV_CHATKIT_SHARED_SECRET || DEFAULT_CHATKIT_SHARED_SECRET;
}

export function hasTrustedChatKitSecret(request: Request) {
  return request.headers.get(CHATKIT_SHARED_SECRET_HEADER) === resolveChatKitSharedSecret();
}

export function requireTrustedChatKitSecret(request: Request) {
  if (!hasTrustedChatKitSecret(request)) {
    throw new Error("Missing trusted workspace context secret");
  }
}

export async function requireWorkspaceMemberSession(request: Request, workspaceId: string) {
  const clerkUserId = await getSignedInClerkUserId();

  if (!clerkUserId) {
    throw new Error("Sign in required");
  }

  const hasAccess = await repository.canUserAccessWorkspace(clerkUserId, workspaceId);

  if (!hasAccess) {
    throw new Error(`You do not have access to workspace ${workspaceId}`);
  }

  return clerkUserId;
}

export async function requireWorkspaceAgentAccess(
  request: Request,
  workspaceId: string,
  agentId: string,
  body?: Record<string, unknown>,
) {
  await requireAgentAuth(request, agentId, body);
  const hasAccess = await repository.canAgentAccessWorkspace(agentId, workspaceId);

  if (!hasAccess) {
    throw new Error(`Agent ${agentId} is not a member of workspace ${workspaceId}`);
  }

  return agentId;
}
