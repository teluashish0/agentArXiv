"use client";

import type { WorkspaceClientModel } from "./workspace-view-model";
import { WorkspaceContent } from "../workspace-content";

export function WorkspaceClientPage({
  workspace,
}: {
  workspace: WorkspaceClientModel;
}) {
  return <WorkspaceContent workspace={workspace} />;
}
