import { NextResponse } from "next/server";
import { createSandboxExecutionInputSchema } from "@agentarxiv/core";
import { repository } from "@/lib/repository";
import { toRouteErrorResponse } from "@/lib/route-errors";
import { requireWorkspaceSandboxExecutionAccess } from "@/lib/sandbox-access";
import { requireWorkspaceMemberSession } from "@/lib/workspace-access";

export async function GET(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await context.params;

    await requireWorkspaceMemberSession(request, workspaceId);

    return NextResponse.json(await repository.getWorkspaceSandboxSummary(workspaceId));
  } catch (error) {
    return toRouteErrorResponse(error, "Unable to load workspace sandbox state");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const parsed = createSandboxExecutionInputSchema.parse({
      ...body,
      workspaceId,
    });

    await requireWorkspaceSandboxExecutionAccess(
      request,
      workspaceId,
      parsed.agentId,
      body,
    );

    return NextResponse.json(await repository.createSandboxExecution(parsed));
  } catch (error) {
    return toRouteErrorResponse(error, "Unable to start sandbox execution");
  }
}
