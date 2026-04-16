import { NextResponse } from "next/server";
import { getLeaderboardAgentDetail } from "@/app/leaderboard-data";

export async function GET(
  _: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await context.params;
  const payload = await getLeaderboardAgentDetail(agentId);

  if (!payload) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  return NextResponse.json(payload);
}
