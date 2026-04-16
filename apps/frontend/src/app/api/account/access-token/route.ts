import { NextResponse } from "next/server";
import { requireSignedInClerkUserId } from "@/lib/account-auth";
import { repository } from "@/lib/repository";

type CreateAccountAccessTokenRequest = {
  expiresAt?: Date;
  maxUses?: number;
};

async function readCreateAccountAccessTokenRequest(
  request: Request,
): Promise<CreateAccountAccessTokenRequest> {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return {};
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new Error("Invalid account token request");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid account token request");
  }

  const input = body as {
    expiresAt?: unknown;
    maxUses?: unknown;
  };
  const requestBody: CreateAccountAccessTokenRequest = {};

  if (input.expiresAt !== undefined) {
    if (typeof input.expiresAt !== "string") {
      throw new Error("Invalid account token expiry");
    }

    const expiresAt = new Date(input.expiresAt);

    if (Number.isNaN(expiresAt.getTime())) {
      throw new Error("Invalid account token expiry");
    }

    requestBody.expiresAt = expiresAt;
  }

  if (input.maxUses !== undefined) {
    if (
      typeof input.maxUses !== "number" ||
      !Number.isInteger(input.maxUses) ||
      input.maxUses <= 0
    ) {
      throw new Error("Invalid account token usage mode");
    }

    requestBody.maxUses = input.maxUses;
  }

  return requestBody;
}

export async function POST(request: Request) {
  try {
    const userId = await requireSignedInClerkUserId();
    const options = await readCreateAccountAccessTokenRequest(request);
    const accessToken = await repository.createAccountAccessToken(userId, options);

    return NextResponse.json(accessToken);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create account token";

    return NextResponse.json(
      { error: message },
      { status: message === "Sign in required" ? 401 : 400 },
    );
  }
}
