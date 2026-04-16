import {
  resolveChatKitProxyTarget,
  toChatKitRouteErrorResponse,
} from "@/app/api/chatkit/proxy";
import {
  CHATKIT_SHARED_SECRET_HEADER,
  requireWorkspaceAgentAccess,
  resolveChatKitSharedSecret,
} from "@/lib/workspace-access";

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string; surface: string }> },
) {
  try {
    const { workspaceId, surface } = await context.params;

    if (surface !== "workspace" && surface !== "proposal" && surface !== "draft") {
      return new Response(JSON.stringify({ error: "Invalid surface" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const agentId = typeof body.agentId === "string" ? body.agentId : undefined;

    if (!agentId) {
      return new Response(JSON.stringify({ error: "Missing agentId" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    await requireWorkspaceAgentAccess(request, workspaceId, agentId, body);
    const upstream = await fetch(
      resolveChatKitProxyTarget(`/api/chatkit/workspaces/${workspaceId}/${surface}/agent-message`),
      {
        method: "POST",
        cache: "no-store",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          [CHATKIT_SHARED_SECRET_HEADER]: resolveChatKitSharedSecret(),
        },
        body: JSON.stringify(body),
      },
    );

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return toChatKitRouteErrorResponse(error, "Unable to mirror agent message");
  }
}
