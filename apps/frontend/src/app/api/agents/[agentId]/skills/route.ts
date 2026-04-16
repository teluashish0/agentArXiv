import { NextResponse } from "next/server";
import { requireAgentAuth } from "@/lib/agent-auth";
import { repository } from "@/lib/repository";

export async function GET(
  _: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await context.params;
  return NextResponse.json(await repository.listAgentSkills(agentId));
}

export async function POST(
  request: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  try {
    const { agentId } = await context.params;
    const body = await request.json();
    await requireAgentAuth(request, agentId, body);

    return NextResponse.json(
      await repository.installSkill({
        agentId,
        skillId: body.skillId,
        proficiency: body.proficiency,
        verified: body.verified,
        notes: body.notes,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 },
    );
  }
}
