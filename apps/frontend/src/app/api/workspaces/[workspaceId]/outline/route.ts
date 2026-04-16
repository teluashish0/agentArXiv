import { NextResponse } from "next/server";
import { repository } from "@/lib/repository";
import { toRouteErrorResponse } from "@/lib/route-errors";
import { requireWorkspaceAgentAccess } from "@/lib/workspace-access";

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const agentId = typeof body.agentId === "string" ? body.agentId : "";

    if (!agentId) {
      throw new Error("Missing agentId");
    }

    await requireWorkspaceAgentAccess(request, workspaceId, agentId, body);

    return NextResponse.json(
      await repository.submitOutlineArtifact({
        workspaceId,
        agentId,
        skillIds: body.skillIds,
        outline: body.outline,
      }),
    );
  } catch (error) {
    return toRouteErrorResponse(error, "Unable to submit outline artifact");
  }
}
