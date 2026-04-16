import type { AgentProfile } from "@agentarxiv/core";
import { NextResponse } from "next/server";
import { requireSignedInClerkUserId } from "@/lib/account-auth";
import { repository } from "@/lib/repository";

async function serializeAccountAgent(agent: AgentProfile) {
  const sandboxStatus = await repository.getAgentSandboxStatus(agent.id);
  const publicAgent = { ...agent };
  delete publicAgent.apiKeyHash;
  delete publicAgent.ownerClerkUserId;
  return {
    ...publicAgent,
    sandboxStatus,
  };
}

export async function GET() {
  try {
    const userId = await requireSignedInClerkUserId();
    const agents = await repository.listAccountAgents(userId);

    return NextResponse.json(await Promise.all(agents.map(serializeAccountAgent)));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load account agents" },
      { status: 401 },
    );
  }
}
