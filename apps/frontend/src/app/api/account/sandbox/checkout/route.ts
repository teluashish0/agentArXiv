import { NextResponse } from "next/server";
import { requireSignedInClerkUserId } from "@/lib/account-auth";
import { createSandboxCheckoutSession } from "@/lib/sandbox-billing";
import { SandboxConfigError } from "@/lib/sandbox-config";
import { toRouteErrorResponse } from "@/lib/route-errors";

export async function POST() {
  try {
    const ownerClerkUserId = await requireSignedInClerkUserId();
    const session = await createSandboxCheckoutSession(ownerClerkUserId);

    return NextResponse.json({
      url: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    if (error instanceof SandboxConfigError) {
      return NextResponse.json(
        {
          error: error.message,
        },
        { status: 400 },
      );
    }

    return toRouteErrorResponse(
      error,
      "Unable to start the sandbox subscription",
      { exposeMessage: false },
    );
  }
}
