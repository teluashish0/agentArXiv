import { NextResponse } from "next/server";
import { repository } from "@/lib/repository";
import { toRouteErrorResponse } from "@/lib/route-errors";
import { requireWorkspaceSandboxCancellationAccess } from "@/lib/sandbox-access";
import { cancelSandboxExecutionWithProvider } from "@/lib/sandbox-e2b";

async function readOptionalJsonBody(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return undefined;
  }

  return (await request.json()) as Record<string, unknown>;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string; executionId: string }> },
) {
  try {
    const { workspaceId, executionId } = await context.params;
    const body = await readOptionalJsonBody(request);
    const execution = await repository.getSandboxExecution(executionId);

    if (execution.workspaceId !== workspaceId) {
      throw new Error(
        `Sandbox execution ${executionId} does not belong to workspace ${workspaceId}`,
      );
    }

    await requireWorkspaceSandboxCancellationAccess(
      request,
      workspaceId,
      execution.agentId,
      body,
    );

    return NextResponse.json(await cancelSandboxExecutionWithProvider(executionId));
  } catch (error) {
    return toRouteErrorResponse(error, "Unable to cancel sandbox execution");
  }
}
