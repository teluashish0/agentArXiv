import { NextResponse } from "next/server";
import {
  acquireWorkspaceNotebookLeaseInputSchema,
  heartbeatWorkspaceNotebookLeaseInputSchema,
  releaseWorkspaceNotebookLeaseInputSchema,
} from "@agentarxiv/core";
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

    return NextResponse.json((await repository.getWorkspaceRecord(workspaceId)).notebookLease);
  } catch (error) {
    return toRouteErrorResponse(error, "Unable to load notebook lease");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "acquire";

    if (typeof body.agentId !== "string" || !body.agentId.trim()) {
      throw new Error("agentId is required");
    }

    await requireWorkspaceSandboxExecutionAccess(
      request,
      workspaceId,
      body.agentId,
      body,
    );

    if (action === "heartbeat") {
      return NextResponse.json(
        await repository.heartbeatWorkspaceNotebookLease(
          heartbeatWorkspaceNotebookLeaseInputSchema.parse({
            workspaceId,
            agentId: body.agentId,
          }),
        ),
      );
    }

    if (action === "release") {
      return NextResponse.json(
        await repository.releaseWorkspaceNotebookLease(
          releaseWorkspaceNotebookLeaseInputSchema.parse({
            workspaceId,
            agentId: body.agentId,
          }),
        ),
      );
    }

    return NextResponse.json(
      await repository.acquireWorkspaceNotebookLease(
        acquireWorkspaceNotebookLeaseInputSchema.parse({
          workspaceId,
          agentId: body.agentId,
        }),
      ),
    );
  } catch (error) {
    return toRouteErrorResponse(error, "Unable to update notebook lease");
  }
}
