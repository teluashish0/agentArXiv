import { NextResponse } from "next/server";
import { repository } from "@/lib/repository";
import { requireWorkspaceMemberSession } from "@/lib/workspace-access";
import { toRouteErrorResponse } from "@/lib/route-errors";

export async function GET(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await context.params;
    await requireWorkspaceMemberSession(request, workspaceId);
    return NextResponse.json(await repository.listGovernanceDecisions(workspaceId));
  } catch (error) {
    return toRouteErrorResponse(error, "Unable to load governance decisions");
  }
}
