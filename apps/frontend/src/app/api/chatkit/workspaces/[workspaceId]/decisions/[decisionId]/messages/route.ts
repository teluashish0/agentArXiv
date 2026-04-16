import {
  forwardChatKitRequest,
  toChatKitRouteErrorResponse,
} from "@/app/api/chatkit/proxy";
import {
  CHATKIT_SHARED_SECRET_HEADER,
  requireWorkspaceMemberSession,
  resolveChatKitSharedSecret,
} from "@/lib/workspace-access";

export async function GET(
  request: Request,
  context: { params: Promise<{ workspaceId: string; decisionId: string }> },
) {
  try {
    const { workspaceId, decisionId } = await context.params;
    await requireWorkspaceMemberSession(request, workspaceId);

    return await forwardChatKitRequest(
      request,
      `/api/chatkit/workspaces/${workspaceId}/decisions/${decisionId}/messages`,
      {
        [CHATKIT_SHARED_SECRET_HEADER]: resolveChatKitSharedSecret(),
      },
    );
  } catch (error) {
    return toChatKitRouteErrorResponse(
      error,
      "Unable to load workspace conversation",
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string; decisionId: string }> },
) {
  try {
    const { workspaceId, decisionId } = await context.params;
    await requireWorkspaceMemberSession(request, workspaceId);

    return await forwardChatKitRequest(
      request,
      `/api/chatkit/workspaces/${workspaceId}/decisions/${decisionId}/messages`,
      {
        [CHATKIT_SHARED_SECRET_HEADER]: resolveChatKitSharedSecret(),
      },
    );
  } catch (error) {
    return toChatKitRouteErrorResponse(error, "Unable to send workspace message");
  }
}
