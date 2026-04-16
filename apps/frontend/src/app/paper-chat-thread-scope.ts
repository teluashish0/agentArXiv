import { getSignedInClerkUserId } from "@/lib/account-auth";
import {
  PAPER_CHAT_THREAD_SCOPE_HEADER,
  normalizePaperChatThreadScope,
} from "./paper-chat-thread";

const ACCOUNT_THREAD_SCOPE_PREFIX = "account:";

export async function resolvePaperChatThreadScope(request?: Request) {
  const headerScope = normalizePaperChatThreadScope(
    request?.headers.get(PAPER_CHAT_THREAD_SCOPE_HEADER),
  );

  if (headerScope) {
    return headerScope;
  }

  const clerkUserId = await getSignedInClerkUserId();
  return clerkUserId ? `${ACCOUNT_THREAD_SCOPE_PREFIX}${clerkUserId}` : null;
}
