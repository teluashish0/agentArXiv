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
  context: {
    params: Promise<{
      workspaceId: string;
      decisionId: string;
      attachmentId: string;
    }>;
  },
) {
  try {
    const { workspaceId, decisionId, attachmentId } = await context.params;
    await requireWorkspaceMemberSession(request, workspaceId);

    return await forwardChatKitRequest(
      request,
      `/api/chatkit/workspaces/${workspaceId}/decisions/${decisionId}/attachments/${attachmentId}`,
      {
        [CHATKIT_SHARED_SECRET_HEADER]: resolveChatKitSharedSecret(),
      },
    );
  } catch (error) {
    return toChatKitRouteErrorResponse(
      error,
      "Unable to load decision attachment",
    );
  }
}
