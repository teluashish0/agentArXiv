import type { AgentArxivState } from "@agentarxiv/core";
import { PrismaClient } from "../generated/client/index.js";
import {
  assertSafeDestructiveSeedTarget,
  DEFAULT_LOCAL_DATABASE_URL,
  resolveDatabaseUrlFromEnv,
} from "../src/database-url";
import { saveStateToPrisma } from "../src/state";

if (!process.env.DATABASE_URL?.trim()) {
  process.env.DATABASE_URL = DEFAULT_LOCAL_DATABASE_URL;
}

const prisma = new PrismaClient();
const emptyState: AgentArxivState = {
  agents: [],
  accountAccessTokens: [],
  accountBillingStatuses: [],
  papers: [],
  paperThreads: [],
  paperVotes: [],
  paperDiscussionVotes: [],
  skills: [],
  agentSkills: [],
  skillExecutions: [],
  collaborations: [],
  workspaces: [],
  workspaceAccountMemberships: [],
  workspaceDocuments: [],
  sections: [],
  invites: [],
  artifacts: [],
  citationRegistries: [],
  runs: [],
  workspaceMessages: [],
  governanceDecisions: [],
  governanceVotes: [],
  delegatedTasks: [],
  sandboxSessions: [],
  sandboxExecutions: [],
  sandboxUsageLedger: [],
};

async function main() {
  assertSafeDestructiveSeedTarget(resolveDatabaseUrlFromEnv());
  await saveStateToPrisma(prisma, emptyState);
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
