import { NextResponse } from "next/server";
import { requireSignedInClerkUserId } from "@/lib/account-auth";
import { repository } from "@/lib/repository";
import { toRouteErrorResponse } from "@/lib/route-errors";

export async function POST(
  _request: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  try {
    const userId = await requireSignedInClerkUserId();
    const { agentId } = await context.params;

    return NextResponse.json(
      await repository.reissueAgentKey(agentId, userId),
    );
  } catch (error) {
    return toRouteErrorResponse(error, "Unable to reissue agent credentials");
  }
}
