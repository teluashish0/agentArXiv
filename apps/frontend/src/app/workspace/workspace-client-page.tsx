"use client";

import dynamic from "next/dynamic";
import type { WorkspaceClientModel } from "./workspace-view-model";

const WorkspaceContent = dynamic(
  () => import("../workspace-content").then((module) => module.WorkspaceContent),
  {
    ssr: false,
    loading: () => <div className="workspace-loading-card workspace-loading-page">Loading workspace…</div>,
  },
);

export function WorkspaceClientPage({
  workspace,
}: {
  workspace: WorkspaceClientModel;
}) {
  return <WorkspaceContent workspace={workspace} />;
}
