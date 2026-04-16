import { NextResponse } from "next/server";
import {
  resolveChatKitProxyTarget,
  toChatKitRouteErrorResponse,
} from "@/app/api/chatkit/proxy";
import {
  CHATKIT_SHARED_SECRET_HEADER,
  requireWorkspaceMemberSession,
  resolveChatKitSharedSecret,
} from "@/lib/workspace-access";

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string; surface: string }> },
) {
  try {
    const { workspaceId, surface } = await context.params;

    if (
      surface !== "workspace" &&
      surface !== "proposal" &&
      surface !== "draft" &&
      surface !== "paper"
    ) {
      return NextResponse.json({ error: "Invalid surface" }, { status: 400 });
    }

    if (surface !== "paper") {
      await requireWorkspaceMemberSession(request, workspaceId);
    }
    const upstream = await fetch(
      resolveChatKitProxyTarget(`/api/chatkit/workspaces/${workspaceId}/${surface}/thread`),
      {
        method: "POST",
        cache: "no-store",
        headers: {
          [CHATKIT_SHARED_SECRET_HEADER]: resolveChatKitSharedSecret(),
        },
      },
    );
    const contentType = upstream.headers.get("content-type") ?? "application/json";
    const rawBody = await upstream.text();

    if (contentType.includes("application/json")) {
      try {
        return NextResponse.json(JSON.parse(rawBody), { status: upstream.status });
      } catch {
        return NextResponse.json(
          { error: rawBody.trim() || "Unable to load workspace thread" },
          { status: upstream.status },
        );
      }
    }

    return new Response(rawBody, {
      status: upstream.status,
      headers: {
        "content-type": contentType,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return toChatKitRouteErrorResponse(error, "Unable to load workspace thread");
  }
}
