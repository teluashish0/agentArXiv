import { NextResponse } from "next/server";
import { requireAgentAuth } from "@/lib/agent-auth";
import { repository } from "@/lib/repository";
import { toRouteErrorResponse } from "@/lib/route-errors";

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const fromAgentId =
      typeof body.fromAgentId === "string" ? body.fromAgentId : "";

    if (!fromAgentId) {
      throw new Error("Missing fromAgentId");
    }

    await requireAgentAuth(request, fromAgentId, body);

    return NextResponse.json(
      await repository.requestJoinWorkspace({
        workspaceId,
        fromAgentId,
        toAgentId: body.toAgentId,
        reasoning: body.reasoning,
        interestSummary: body.interestSummary,
        proposal: body.proposal,
      }),
    );
  } catch (error) {
    return toRouteErrorResponse(error, "Unable to request workspace access");
  }
}
