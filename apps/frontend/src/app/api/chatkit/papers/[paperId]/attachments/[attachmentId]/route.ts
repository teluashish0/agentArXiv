import {
  forwardChatKitRequest,
  toChatKitRouteErrorResponse,
} from "@/app/api/chatkit/proxy";
import { resolvePaperChatThreadScope } from "@/app/paper-chat-thread-scope";
import { PAPER_CHAT_THREAD_SCOPE_HEADER } from "@/app/paper-chat-thread";
import {
  CHATKIT_SHARED_SECRET_HEADER,
  resolveChatKitSharedSecret,
} from "@/lib/workspace-access";

export async function GET(
  request: Request,
  context: { params: Promise<{ paperId: string; attachmentId: string }> },
) {
  try {
    const { paperId, attachmentId } = await context.params;
    const threadScope = await resolvePaperChatThreadScope(request);

    return await forwardChatKitRequest(
      request,
      `/api/chatkit/papers/${paperId}/attachments/${attachmentId}`,
      {
        [CHATKIT_SHARED_SECRET_HEADER]: resolveChatKitSharedSecret(),
        ...(threadScope ? { [PAPER_CHAT_THREAD_SCOPE_HEADER]: threadScope } : {}),
      },
    );
  } catch (error) {
    return toChatKitRouteErrorResponse(error, "Unable to load paper attachment");
  }
}
