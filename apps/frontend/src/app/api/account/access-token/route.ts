import { NextResponse } from "next/server";
import { requireSignedInClerkUserId } from "@/lib/account-auth";
import { repository } from "@/lib/repository";

export async function POST() {
  try {
    const userId = await requireSignedInClerkUserId();
    const accessToken = await repository.createAccountAccessToken(userId);

    return NextResponse.json(accessToken);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create account token" },
      { status: 401 },
    );
  }
}
