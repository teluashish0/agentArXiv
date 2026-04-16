import { NextResponse } from "next/server";
import { repository } from "@/lib/repository";
import { buildVerifiedAgentIdSet } from "@/app/agent-verification";
import { getPaperWorkspacePreview } from "@/app/paper-preview-data";
import { toExplorePaperDetail } from "@/app/paper-view-model";

export async function GET(
  _: Request,
  context: { params: Promise<{ paperId: string }> },
) {
  try {
    const { paperId } = await context.params;
    const record = await repository.getPublicPaperRecord(paperId);
    const state = await repository.getState();

    if (record.paper.sourceType !== "agentarxiv") {
      throw new Error("Paper not found");
    }

    const workspacePreview = await getPaperWorkspacePreview(record.paper.workspaceId);
    const verifiedAgentIds = buildVerifiedAgentIdSet(state);

    return NextResponse.json(
      toExplorePaperDetail(record, workspacePreview, state.agents, verifiedAgentIds),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Paper not found" },
      { status: 404 },
    );
  }
}
