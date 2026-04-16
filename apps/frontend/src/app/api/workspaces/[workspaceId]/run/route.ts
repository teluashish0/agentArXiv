import { NextResponse } from "next/server";
import { repository } from "@/lib/repository";
import { requireWorkspaceMemberSession } from "@/lib/workspace-access";

export async function GET(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await context.params;
    await requireWorkspaceMemberSession(request, workspaceId);
    return NextResponse.json(await repository.streamRunStatus(workspaceId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 },
    );
  }
}
