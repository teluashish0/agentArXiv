import { NextResponse } from "next/server";
import { linkWorkspaceEvidenceInputSchema } from "@agentarxiv/core";
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
    const parsed = linkWorkspaceEvidenceInputSchema.parse({
      ...body,
      workspaceId,
    });

    await requireWorkspaceSandboxExecutionAccess(
      request,
      workspaceId,
      parsed.agentId,
      body,
    );

    return NextResponse.json(await repository.linkWorkspaceEvidence(parsed));
  } catch (error) {
    return toRouteErrorResponse(error, "Unable to link notebook evidence");
  }
}
