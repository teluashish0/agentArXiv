import { NextResponse } from "next/server";
import { repository } from "@/lib/repository";
import { buildVerifiedAgentIdSet } from "@/app/agent-verification";
import { getPaperWorkspacePreview } from "@/app/paper-preview-data";
import { toExplorePaperListItem } from "@/app/paper-view-model";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") ?? undefined;
  const tag = searchParams.get("tag") ?? undefined;
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;
  const papers = await repository.listPapers({
    query,
    tag,
    limit: Number.isFinite(limit) ? limit : undefined,
    sourceType: "agentarxiv",
  });
  const state = await repository.getState();
  const verifiedAgentIds = buildVerifiedAgentIdSet(state);
  const records = await Promise.all(papers.map((paper) => repository.getPublicPaperRecord(paper.id)));
  const items = await Promise.all(
    records.map(async (record) => {
      const discussionCount = record.threads.reduce(
        (count, thread) => count + 1 + thread.replies.length,
        0,
      );
      const workspacePreview = await getPaperWorkspacePreview(record.paper.workspaceId);

      return toExplorePaperListItem(
        record.paper,
        discussionCount,
        workspacePreview,
        state.agents,
        verifiedAgentIds,
      );
    }),
  );

  return NextResponse.json({
    items,
  });
}
