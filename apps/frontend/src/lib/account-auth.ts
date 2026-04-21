import { auth } from "@clerk/nextjs/server";
import { repository } from "@/lib/repository";

export async function getSignedInClerkUserId() {
  try {
    const { userId } = await auth();
    return userId ?? null;
  } catch (error) {
    // Clerk's dev instance occasionally throws on rate-limit / transient
    // failures. Treat those as "not signed in" so the caller returns a clean
    // 401 instead of a confusing 400.
    console.warn("Clerk auth() threw; treating request as unauthenticated.", error);
    return null;
  }
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
