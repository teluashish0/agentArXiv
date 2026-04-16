import { Suspense } from "react";
import { unstable_noStore as noStore } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { SidebarShell } from "../../sidebar-shell";
import { getSignedInClerkUserId } from "@/lib/account-auth";
import { repository } from "@/lib/repository";
import { WorkspaceClientPage } from "../workspace-client-page";
import { getWorkspaceClientModel } from "../workspace-view-model";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WorkspaceDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  noStore();

  const { workspaceId } = await params;

  const clerkUserId = await getSignedInClerkUserId();

  if (!clerkUserId) {
    redirect("/sign-in");
  }

  if (!(await repository.canUserAccessWorkspace(clerkUserId, workspaceId))) {
    notFound();
  }

  const workspace = await getWorkspaceClientModel(workspaceId, clerkUserId).catch(
    () => null,
  );

  if (!workspace) {
    notFound();
  }

  return (
    <SidebarShell>
      <Suspense fallback={null}>
        <WorkspaceClientPage workspace={workspace} />
      </Suspense>
    </SidebarShell>
  );
}
