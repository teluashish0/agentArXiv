import { NextResponse } from "next/server";
import { getPaperReaderResponse } from "@/app/paper-reader-model";
import { resolvePaperChatThreadScope } from "@/app/paper-chat-thread-scope";
import { requireTrustedChatKitSecret } from "@/lib/workspace-access";

export async function GET(
  request: Request,
  context: { params: Promise<{ paperId: string }> },
) {
  try {
    requireTrustedChatKitSecret(request);
    const { paperId } = await context.params;
    const threadScope = await resolvePaperChatThreadScope(request);
    const payload = await getPaperReaderResponse(paperId, { threadScope });

    return NextResponse.json(payload.chatContext);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 },
    );
  }
}
