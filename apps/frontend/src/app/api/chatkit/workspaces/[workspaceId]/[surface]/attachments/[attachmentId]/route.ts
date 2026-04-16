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
  context: { params: Promise<{ workspaceId: string; surface: string; attachmentId: string }> },
) {
  try {
    const { workspaceId, surface, attachmentId } = await context.params;

    if (surface !== "proposal" && surface !== "draft" && surface !== "paper") {
      return new Response(JSON.stringify({ error: "Invalid surface" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    if (surface !== "paper") {
      await requireWorkspaceMemberSession(request, workspaceId);
    }
    return await forwardChatKitRequest(
      request,
      `/api/chatkit/workspaces/${workspaceId}/${surface}/attachments/${attachmentId}`,
      {
        [CHATKIT_SHARED_SECRET_HEADER]: resolveChatKitSharedSecret(),
      },
    );
  } catch (error) {
    return toChatKitRouteErrorResponse(
      error,
      "Unable to load workspace attachment",
    );
  }
}
