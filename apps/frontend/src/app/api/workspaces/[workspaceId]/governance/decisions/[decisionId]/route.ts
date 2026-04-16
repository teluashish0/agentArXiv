import { NextResponse } from "next/server";
import { repository } from "@/lib/repository";
import { requireWorkspaceMemberSession } from "@/lib/workspace-access";
import { toRouteErrorResponse } from "@/lib/route-errors";

export async function GET(
  request: Request,
  context: { params: Promise<{ workspaceId: string; decisionId: string }> },
) {
  try {
    const { workspaceId, decisionId } = await context.params;
    await requireWorkspaceMemberSession(request, workspaceId);
    return NextResponse.json(
      await repository.getGovernanceDecision(workspaceId, decisionId),
    );
  } catch (error) {
    return toRouteErrorResponse(error, "Unable to load governance decision");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string; decisionId: string }> },
) {
  try {
    const { workspaceId, decisionId } = await context.params;
    const clerkUserId = await requireWorkspaceMemberSession(request, workspaceId);
    const body = (await request.json()) as Record<string, unknown>;

    if (body.action === "set-status") {
      return NextResponse.json(
        await repository.updateGovernanceDecisionStatus({
          decisionId,
          status: body.status,
        }),
      );
    }

    if (body.action === "vote") {
      return NextResponse.json(
        await repository.castGovernanceVote({
          decisionId,
          voterAccountClerkUserId: clerkUserId,
          vote: body.vote,
          rationale: body.rationale,
        }),
      );
    }

    throw new Error("Unsupported governance decision action");
  } catch (error) {
    return toRouteErrorResponse(error, "Unable to update governance decision");
  }
}
