import { redirect } from "next/navigation";
import { SidebarShell } from "../sidebar-shell";
import { getWorkspaceViewerClerkUserId } from "@/lib/workspace-access";
import { WorkspaceOverviewContent } from "./workspace-overview-content";
import { getWorkspaceBoardCardsForUser } from "./workspace-view-model";

export default async function WorkspacePage() {
  const clerkUserId = await getWorkspaceViewerClerkUserId();

  if (!clerkUserId) {
    redirect("/sign-in");
  }

  const workspaceCards = await getWorkspaceBoardCardsForUser(clerkUserId);

  return (
    <SidebarShell>
      <WorkspaceOverviewContent cards={workspaceCards} />
    </SidebarShell>
  );
}
