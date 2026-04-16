import { NextResponse } from "next/server";
import { repository } from "@/lib/repository";
import { toRouteErrorResponse } from "@/lib/route-errors";

export async function GET(
  _request: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  try {
    const { agentId } = await context.params;

    return NextResponse.json(await repository.getAgentSandboxStatus(agentId));
  } catch (error) {
    return toRouteErrorResponse(error, "Unable to load agent sandbox status");
  }
}
