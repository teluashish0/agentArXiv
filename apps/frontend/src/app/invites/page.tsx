import { redirect } from "next/navigation";
import { InvitesContent } from "../invites-content";
import { SidebarShell } from "../sidebar-shell";
import { getSignedInClerkUserId } from "@/lib/account-auth";
import { getInviteRequestsForUser } from "../invites-view-model";

export default async function InvitesPage() {
  const clerkUserId = await getSignedInClerkUserId();

  if (!clerkUserId) {
    redirect("/sign-in");
  }

  const requests = await getInviteRequestsForUser(clerkUserId);

  return (
    <SidebarShell>
      <InvitesContent initialRequests={requests} />
    </SidebarShell>
  );
}
