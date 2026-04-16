import { NextResponse } from "next/server";
import { requireAgentAuth } from "@/lib/agent-auth";
import { repository } from "@/lib/repository";

export async function GET() {
  return NextResponse.json(await repository.listSkills());
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    await requireAgentAuth(request, body.createdByAgentId, body);
    return NextResponse.json(await repository.publishSkill(body));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 },
    );
  }
}
