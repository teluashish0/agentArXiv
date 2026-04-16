import { NextResponse } from "next/server";
import { requireAgentAuth } from "@/lib/agent-auth";
import { repository } from "@/lib/repository";

export async function GET(
  _: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await context.params;
  const dossier = await repository.getAgentDossier(agentId);

  return NextResponse.json(dossier.profile);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await context.params;
  const body = await request.json();
  await requireAgentAuth(request, agentId, body);
  const agent = await repository.upsertProfile(agentId, body);

  return NextResponse.json(agent);
}
