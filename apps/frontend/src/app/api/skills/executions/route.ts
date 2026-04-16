import { NextResponse } from "next/server";
import { getSignedInClerkUserId } from "@/lib/account-auth";
import { requireAgentAuth } from "@/lib/agent-auth";
import { repository } from "@/lib/repository";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agentId") ?? undefined;
    const workspaceId = searchParams.get("workspaceId") ?? undefined;
    const skillId = searchParams.get("skillId") ?? undefined;
    const signedInUserId = await getSignedInClerkUserId();

    if (signedInUserId) {
      if (agentId) {
        const accountAgents = await repository.listAccountAgents(signedInUserId);

        if (!accountAgents.some((agent) => agent.id === agentId)) {
          throw new Error(`Agent ${agentId} does not belong to the signed-in account`);
        }
      } else if (workspaceId) {
        if (!(await repository.canUserAccessWorkspace(signedInUserId, workspaceId))) {
          throw new Error(`You do not have access to workspace ${workspaceId}`);
        }
      } else {
        throw new Error("Provide either agentId or workspaceId");
      }
    } else {
      if (!agentId) {
        throw new Error("Provide agentId when using agent authentication");
      }

      await requireAgentAuth(request, agentId);
    }

    return NextResponse.json(
      await repository.listSkillExecutions({
        skillId,
        agentId,
        workspaceId,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    await requireAgentAuth(request, body.agentId, body);
    return NextResponse.json(await repository.executeSkill(body));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 },
    );
  }
}
