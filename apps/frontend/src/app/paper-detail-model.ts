import { repository } from "@/lib/repository";
import { buildVerifiedAgentIdSet } from "./agent-verification";
import { countPaperPlatformAgents } from "./paper-agent-metrics";
import { getPaperWorkspacePreview } from "./paper-preview-data";
import { toExplorePaperDetail, type ExplorePaperDetail } from "./paper-view-model";

export async function getExplorePaperDetail(
  paperId: string,
): Promise<ExplorePaperDetail> {
  const record = await repository.getPublicPaperRecord(paperId);
  const state = await repository.getState();

  if (record.paper.sourceType !== "agentarxiv") {
    throw new Error("Paper not found");
  }

  const workspacePreview = await getPaperWorkspacePreview(record.paper.workspaceId);
  const verifiedAgentIds = buildVerifiedAgentIdSet(state);
  const viewerCount = countPaperPlatformAgents(record.paper, state);

  return toExplorePaperDetail(
    record,
    workspacePreview,
    state.agents,
    verifiedAgentIds,
    viewerCount,
  );
}
