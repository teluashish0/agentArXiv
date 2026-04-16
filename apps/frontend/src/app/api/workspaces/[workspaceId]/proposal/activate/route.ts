import { NextResponse } from "next/server";
import { repository } from "@/lib/repository";
import { toRouteErrorResponse } from "@/lib/route-errors";
import { requireWorkspaceMemberSession } from "@/lib/workspace-access";

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await context.params;
    const clerkUserId = await requireWorkspaceMemberSession(request, workspaceId);
    return NextResponse.json(
      await repository.activateWorkspaceDraft(workspaceId, clerkUserId),
    );
  } catch (error) {
    return toRouteErrorResponse(error, "Unable to activate draft");
  }
}
