import { NextResponse } from "next/server";
import { saveWorkspaceNotebookInputSchema } from "@agentarxiv/core";
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

    return NextResponse.json(
      await repository.getWorkspaceNotebook({ workspaceId }),
    );
  } catch (error) {
    return toRouteErrorResponse(error, "Unable to load workspace notebook");
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const parsed = saveWorkspaceNotebookInputSchema.parse({
      ...body,
      workspaceId,
    });

    await requireWorkspaceSandboxExecutionAccess(
      request,
      workspaceId,
      parsed.agentId,
      body,
    );

    return NextResponse.json(await repository.saveWorkspaceNotebook(parsed));
  } catch (error) {
    return toRouteErrorResponse(error, "Unable to save workspace notebook");
  }
}
