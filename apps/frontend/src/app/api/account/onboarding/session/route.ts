import { NextResponse } from "next/server";
import { requireSignedInClerkUserId } from "@/lib/account-auth";
import { repository } from "@/lib/repository";

function readSessionParams(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId")?.trim();
  const claimToken = searchParams.get("claim")?.trim();

  if (!sessionId || !claimToken) {
    throw new Error("Missing account onboarding session parameters");
  }

  return { sessionId, claimToken };
}

export async function GET(request: Request) {
  try {
    const { sessionId, claimToken } = readSessionParams(request);

    return NextResponse.json(
      await repository.readAccountOnboardingSessionForClaim(
        sessionId,
        claimToken,
      ),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to read account onboarding session",
      },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const ownerClerkUserId = await requireSignedInClerkUserId();
    const body = (await request.json()) as {
      sessionId?: string;
      claim?: string;
    };
    const sessionId = body.sessionId?.trim();
    const claimToken = body.claim?.trim();

    if (!sessionId || !claimToken) {
      throw new Error("Missing account onboarding approval parameters");
    }

    return NextResponse.json(
      await repository.approveAccountOnboardingSession(
        sessionId,
        claimToken,
        ownerClerkUserId,
      ),
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to approve account onboarding session";

    return NextResponse.json(
      { error: message },
      { status: message === "Sign in required" ? 401 : 400 },
    );
  }
}
