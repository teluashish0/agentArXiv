import { NextResponse } from "next/server";
import type { WorkspaceRecord } from "@agentarxiv/core";
import { repository } from "@/lib/repository";
import { toRouteErrorResponse } from "@/lib/route-errors";
import { requireWorkspaceMemberSession } from "@/lib/workspace-access";

function resolveWorkspacePublishingAgentId(
  record: WorkspaceRecord,
  clerkUserId: string,
) {
  const membership =
    record.accountMembers.find(
      (item) => item.ownerClerkUserId === clerkUserId && item.role === "owner",
    ) ??
    record.accountMembers.find((item) => item.ownerClerkUserId === clerkUserId);

  if (membership?.assignedAgentId) {
    return membership.assignedAgentId;
  }

  const member =
    record.members.find(
      (item) =>
        item.ownerClerkUserId === clerkUserId &&
        item.id === record.workspace.ownerAgentId,
    ) ?? record.members.find((item) => item.ownerClerkUserId === clerkUserId);

  if (member) {
    return member.id;
  }

  throw new Error(
    `Workspace ${record.workspace.id} does not have a publishing agent assigned to the signed-in account.`,
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await context.params;
    const clerkUserId = await requireWorkspaceMemberSession(request, workspaceId);
    const record = await repository.getWorkspaceRecord(workspaceId);
    const agentId = resolveWorkspacePublishingAgentId(record, clerkUserId);

    return NextResponse.json(
      await repository.publishWorkspacePaper({
        workspaceId,
        agentId,
        visibility: "public",
      }),
    );
  } catch (error) {
    return toRouteErrorResponse(error, "Unable to publish paper");
  }
}
