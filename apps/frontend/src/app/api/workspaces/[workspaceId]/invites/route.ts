import type { InviteStatus } from "@agentarxiv/core";
import { NextResponse } from "next/server";
import { getSignedInClerkUserId } from "@/lib/account-auth";
import { requireAgentAuth } from "@/lib/agent-auth";
import { repository } from "@/lib/repository";
import { toRouteErrorResponse } from "@/lib/route-errors";

export async function GET(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await context.params;
    const { searchParams } = new URL(request.url);
    const rawStatus = searchParams.get("status");
    const agentId = searchParams.get("agentId") ?? undefined;
    const signedInUserId = await getSignedInClerkUserId();
    const status =
      rawStatus &&
      ["pending", "accepted", "declined", "requested", "withdrawn"].includes(
        rawStatus,
      )
        ? (rawStatus as InviteStatus)
        : undefined;

    if (agentId) {
      await requireAgentAuth(request, agentId);
    } else if (signedInUserId) {
      if (
        !(await repository.canUserAccessWorkspace(signedInUserId, workspaceId))
      ) {
        throw new Error(`You do not have access to workspace ${workspaceId}`);
      }
    } else {
      throw new Error("Sign in or provide an agent API key to read invites");
    }

    return NextResponse.json(
      await repository.listInvites({
        workspaceId,
        agentId,
        status,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 },
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;

    if (body.action === "accept") {
      const agentId = typeof body.agentId === "string" ? body.agentId : "";
      const inviteId = typeof body.inviteId === "string" ? body.inviteId : "";

      if (!agentId || !inviteId) {
        throw new Error("Missing inviteId or agentId");
      }

      await requireAgentAuth(request, agentId, body);
      return NextResponse.json(
        await repository.acceptInvite(inviteId, agentId),
      );
    }

    if (body.action === "decline") {
      const agentId = typeof body.agentId === "string" ? body.agentId : "";
      const inviteId = typeof body.inviteId === "string" ? body.inviteId : "";

      if (!agentId || !inviteId) {
        throw new Error("Missing inviteId or agentId");
      }

      await requireAgentAuth(request, agentId, body);
      return NextResponse.json(
        await repository.declineInvite(inviteId, agentId),
      );
    }

    const fromAgentId =
      typeof body.fromAgentId === "string" ? body.fromAgentId : "";

    if (!fromAgentId) {
      throw new Error("Missing fromAgentId");
    }

    await requireAgentAuth(request, fromAgentId, body);

    return NextResponse.json(
      await repository.sendInvite({
        workspaceId,
        fromAgentId,
        toAgentId: body.toAgentId,
        reasoning: body.reasoning,
        interestSummary: body.interestSummary,
        proposal: body.proposal,
      }),
    );
  } catch (error) {
    return toRouteErrorResponse(error, "Unable to update workspace invite");
  }
}
