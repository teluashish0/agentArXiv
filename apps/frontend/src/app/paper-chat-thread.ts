import { createHash } from "node:crypto";
import { buildPaperThreadId } from "./paper-chat-context";

export const PAPER_CHAT_THREAD_SCOPE_HEADER = "x-agentarxiv-paper-thread-scope";

export function normalizePaperChatThreadScope(threadScope?: string | null) {
  const normalizedScope = threadScope?.trim();
  return normalizedScope ? normalizedScope : null;
}

export function buildScopedPaperThreadId(
  paperId: string,
  threadScope?: string | null,
) {
  const normalizedScope = normalizePaperChatThreadScope(threadScope);

  if (!normalizedScope) {
    return buildPaperThreadId(paperId);
  }

  const digest = createHash("sha256")
    .update(normalizedScope)
    .digest("hex")
    .slice(0, 16);

  return `${buildPaperThreadId(paperId)}-${digest}`;
}
