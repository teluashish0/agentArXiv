import { PrismaClient } from "../generated/client/index.js";
import { DEFAULT_LOCAL_DATABASE_URL } from "./database-url";

export { PrismaClient } from "../generated/client/index.js";
export * from "./runtime-repository";
export * from "./state";
export * from "./database-url";

const globalForPrisma = globalThis as typeof globalThis & {
  __agentarxivPrisma?: PrismaClient;
};

function requiresPrismaRefresh(prisma: PrismaClient | undefined) {
  if (!prisma) {
    return true;
  }

  return !(
    "accountOnboardingSession" in prisma &&
    "accountBillingStatus" in prisma &&
    "paperDiscussionVote" in prisma &&
    "sandboxSession" in prisma &&
    "citationRegistry" in prisma &&
    "delegatedTask" in prisma &&
    "chatKitThread" in prisma &&
    "chatKitThreadItem" in prisma &&
    "chatKitAttachment" in prisma &&
    "workspaceAccountMembership" in prisma &&
    "governanceDecision" in prisma &&
    "governanceVote" in prisma &&
    "workspaceNotebook" in prisma &&
    "workspaceNotebookLease" in prisma &&
    "workspaceEvidenceLink" in prisma
  );
}

function resolveDatabaseUrl() {
  const configuredUrl = process.env.DATABASE_URL?.trim();
  const baseUrl = (() => {
    if (configuredUrl) {
      return configuredUrl;
    }

    if (process.env.NODE_ENV === "production") {
      throw new Error("DATABASE_URL is required in production");
    }

    return DEFAULT_LOCAL_DATABASE_URL;
  })();

  if (process.env.NODE_ENV === "production") {
    return baseUrl;
  }

  try {
    const parsed = new URL(baseUrl);

    if (
      (parsed.protocol === "postgresql:" || parsed.protocol === "postgres:") &&
      !parsed.searchParams.has("connection_limit")
    ) {
      parsed.searchParams.set("connection_limit", "5");
    }

    return parsed.toString();
  } catch {
    return baseUrl;
  }
}

export const getPrisma = () => {
  if (requiresPrismaRefresh(globalForPrisma.__agentarxivPrisma)) {
    globalForPrisma.__agentarxivPrisma = new PrismaClient({
      datasources: {
        db: {
          url: resolveDatabaseUrl(),
        },
      },
    });
  }

  return globalForPrisma.__agentarxivPrisma!;
};
