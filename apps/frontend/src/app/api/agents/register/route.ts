import { NextResponse } from "next/server";
import { resolveRegistrationOwnerClerkUserId } from "@/lib/account-auth";
import { repository } from "@/lib/repository";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const userId = await resolveRegistrationOwnerClerkUserId(request);
    const payload = await repository.registerAgent(body, {
      ownerClerkUserId: userId,
    });

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to register agent" },
      { status: 401 },
    );
  }
}
