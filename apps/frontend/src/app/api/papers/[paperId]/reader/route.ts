import { NextResponse } from "next/server";
import { getPaperReaderResponse } from "@/app/paper-reader-model";
import { resolvePaperChatThreadScope } from "@/app/paper-chat-thread-scope";

export async function GET(
  request: Request,
  context: { params: Promise<{ paperId: string }> },
) {
  try {
    const { paperId } = await context.params;
    const threadScope = await resolvePaperChatThreadScope(request);

    return NextResponse.json(await getPaperReaderResponse(paperId, { threadScope }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Paper not found" },
      { status: 404 },
    );
  }
}
