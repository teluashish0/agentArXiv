const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1"]);

export const DEFAULT_LOCAL_DATABASE_PORT = "15432";
export const DEFAULT_LOCAL_DATABASE_URL =
  `postgresql://agentarxiv:agentarxiv@localhost:${DEFAULT_LOCAL_DATABASE_PORT}/agentarxiv?schema=public`;

function parseDatabaseUrl(databaseUrl: string) {
  try {
    return new URL(databaseUrl);
  } catch {
    return null;
  }
}

function readTruthyEnv(key: string) {
  return /^(1|true|yes)$/i.test(process.env[key]?.trim() ?? "");
}

export function resolveDatabaseUrlFromEnv() {
  return process.env.DATABASE_URL?.trim() || DEFAULT_LOCAL_DATABASE_URL;
}

export function summarizeDatabaseUrl(databaseUrl: string) {
  const parsed = parseDatabaseUrl(databaseUrl);

  if (!parsed) {
    return databaseUrl;
  }

  const databaseName = parsed.pathname.replace(/^\//, "") || "(default)";
  const host = parsed.hostname || "(socket)";
  const port = parsed.port || "(default)";

  return `${parsed.username || "(anonymous)"}@${host}:${port}/${databaseName}`;
}

export function isSafeLocalResetTarget(databaseUrl: string) {
  const parsed = parseDatabaseUrl(databaseUrl);

  if (!parsed) {
    return false;
  }

  const databaseName = parsed.pathname.replace(/^\//, "");

  return (
    (parsed.protocol === "postgresql:" || parsed.protocol === "postgres:") &&
    loopbackHosts.has(parsed.hostname) &&
    (parsed.port || DEFAULT_LOCAL_DATABASE_PORT) === DEFAULT_LOCAL_DATABASE_PORT &&
    parsed.username === "agentarxiv" &&
    parsed.password === "agentarxiv" &&
    databaseName === "agentarxiv"
  );
}

export function assertSafeDestructiveSeedTarget(databaseUrl: string) {
  if (isSafeLocalResetTarget(databaseUrl)) {
    return;
  }

  const allowOverride = readTruthyEnv("AGENTARXIV_ALLOW_DESTRUCTIVE_SEED");
  const confirmTarget = process.env.AGENTARXIV_CONFIRM_DESTRUCTIVE_DATABASE_URL?.trim() ?? "";
  const targetSummary = summarizeDatabaseUrl(databaseUrl);

  if (
    allowOverride &&
    (confirmTarget === databaseUrl || confirmTarget === targetSummary)
  ) {
    return;
  }

  throw new Error(
    [
      `Refusing to run destructive seed against ${targetSummary}.`,
      "pnpm db:seed deletes all persisted rows before writing the replacement state.",
      `This command is only allowed by default for the local docker database on localhost:${DEFAULT_LOCAL_DATABASE_PORT}.`,
      "If you truly intend to replace a shared database, set AGENTARXIV_ALLOW_DESTRUCTIVE_SEED=true",
      `and AGENTARXIV_CONFIRM_DESTRUCTIVE_DATABASE_URL='${targetSummary}' for that one invocation.`,
    ].join(" "),
  );
}
