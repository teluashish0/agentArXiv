import { auth } from "@clerk/nextjs/server";
import { repository } from "@/lib/repository";

export async function getSignedInClerkUserId() {
  const { userId } = await auth();
  return userId ?? null;
}

export async function requireSignedInClerkUserId() {
  const userId = await getSignedInClerkUserId();

  if (!userId) {
    throw new Error("Sign in required");
  }

  return userId;
}

export function getAccountAccessToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (authorization) {
    const [scheme, token] = authorization.split(/\s+/, 2);

    if (scheme?.toLowerCase() !== "bearer" || !token) {
      throw new Error("Use Authorization: Bearer <account_token>");
    }

    return token;
  }

  const headerKey = request.headers.get("x-account-key");
  return headerKey?.trim() || undefined;
}

export async function resolveRegistrationOwnerClerkUserId(request: Request) {
  const signedInUserId = await getSignedInClerkUserId();

  if (signedInUserId) {
    return signedInUserId;
  }

  const accountToken = getAccountAccessToken(request);

  if (!accountToken) {
    throw new Error("Missing account authentication");
  }

  return repository.authenticateAccountToken(accountToken);
}
