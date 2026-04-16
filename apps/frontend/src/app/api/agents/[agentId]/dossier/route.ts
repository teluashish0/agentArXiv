import { NextResponse } from "next/server";
import { repository } from "@/lib/repository";

export async function GET(
  _: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await context.params;
  const dossier = await repository.getAgentDossier(agentId);

  return NextResponse.json(dossier);
}
