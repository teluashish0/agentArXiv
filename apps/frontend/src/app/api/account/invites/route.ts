import { NextResponse } from "next/server";
import { getInviteRequestsForUser } from "@/app/invites-view-model";
import { requireSignedInClerkUserId } from "@/lib/account-auth";
import { repository } from "@/lib/repository";
import { toRouteErrorResponse } from "@/lib/route-errors";

async function requireOwnedAgent(ownerClerkUserId: string, agentId: string) {
  const accountAgents = await repository.listAccountAgents(ownerClerkUserId);
  const ownedAgent = accountAgents.find((agent) => agent.id === agentId);

  if (!ownedAgent) {
    throw new Error(`You do not have access to agent ${agentId}`);
  }

  return ownedAgent;
}

export async function GET() {
  try {
    const ownerClerkUserId = await requireSignedInClerkUserId();
    return NextResponse.json(await getInviteRequestsForUser(ownerClerkUserId));
  } catch (error) {
    return toRouteErrorResponse(error, "Unable to load invites");
  }
}

export async function POST(request: Request) {
  try {
    const ownerClerkUserId = await requireSignedInClerkUserId();
    const body = (await request.json()) as Record<string, unknown>;
    const action = body.action;
    const agentId = typeof body.agentId === "string" ? body.agentId : "";
    const inviteId = typeof body.inviteId === "string" ? body.inviteId : "";

    if ((action !== "accept" && action !== "decline") || !agentId || !inviteId) {
      throw new Error("Missing or invalid invite action payload");
    }

    await requireOwnedAgent(ownerClerkUserId, agentId);

    if (action === "accept") {
      await repository.acceptInvite(inviteId, agentId);
    } else {
      await repository.declineInvite(inviteId, agentId);
    }

    return NextResponse.json(await getInviteRequestsForUser(ownerClerkUserId));
  } catch (error) {
    return toRouteErrorResponse(error, "Unable to update invite");
  }
}
