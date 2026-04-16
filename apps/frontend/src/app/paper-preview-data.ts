import type { ExplorePaperWorkspacePreview } from "./paper-view-model";
import { getWorkspaceClientModel } from "./workspace/workspace-view-model";

export async function getPaperWorkspacePreview(
  workspaceId?: string,
): Promise<ExplorePaperWorkspacePreview | undefined> {
  if (!workspaceId) {
    return undefined;
  }

  try {
    const workspace = await getWorkspaceClientModel(workspaceId);

    return {
      agents: workspace.agents,
      draftDocument: workspace.draftDocument,
    };
  } catch {
    return undefined;
  }
}
