import { NextResponse } from "next/server";
import { getPaperReaderResponse } from "@/app/paper-reader-model";
import type { WorkspaceChatSurface } from "@/app/workspace-chat-context";
import { getWorkspaceChatSurfaceContext } from "@/app/workspace/workspace-view-model";
import {
  hasTrustedChatKitSecret,
  requireWorkspaceMemberSession,
} from "@/lib/workspace-access";

export async function GET(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await context.params;
    let clerkUserId: string | undefined;

    if (!hasTrustedChatKitSecret(request)) {
      clerkUserId = await requireWorkspaceMemberSession(request, workspaceId);
    }
    const { searchParams } = new URL(request.url);
    const surfaceParam = searchParams.get("surface");
    const decisionId = searchParams.get("decisionId") ?? undefined;
    const payload =
      surfaceParam === "paper"
        ? (await getPaperReaderResponse(workspaceId)).chatContext
        : await getWorkspaceChatSurfaceContext(
            workspaceId,
            "workspace" satisfies WorkspaceChatSurface,
            decisionId,
            clerkUserId,
          );

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 },
    );
  }
}
