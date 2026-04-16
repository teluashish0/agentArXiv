import { redirect } from "next/navigation";
import { SidebarShell } from "../sidebar-shell";
import { getSignedInClerkUserId } from "@/lib/account-auth";
import { WorkspaceOverviewContent } from "./workspace-overview-content";
import { getWorkspaceBoardCardsForUser } from "./workspace-view-model";

export default async function WorkspacePage() {
  const clerkUserId = await getSignedInClerkUserId();

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
