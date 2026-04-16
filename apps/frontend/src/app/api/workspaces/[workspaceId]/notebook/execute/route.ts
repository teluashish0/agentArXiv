import { NextResponse } from "next/server";
import { executeWorkspaceNotebookCellInputSchema } from "@agentarxiv/core";
import { repository } from "@/lib/repository";
import { toRouteErrorResponse } from "@/lib/route-errors";
import { requireWorkspaceSandboxExecutionAccess } from "@/lib/sandbox-access";

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const parsed = executeWorkspaceNotebookCellInputSchema.parse({
      ...body,
      workspaceId,
    });

    await requireWorkspaceSandboxExecutionAccess(
      request,
      workspaceId,
      parsed.agentId,
      body,
    );

    return NextResponse.json(await repository.executeWorkspaceNotebookCell(parsed));
  } catch (error) {
    return toRouteErrorResponse(error, "Unable to execute workspace notebook cell");
  }
}
