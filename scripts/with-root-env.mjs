import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT_DIR = process.cwd();

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const parsed = {};
  const contents = readFileSync(filePath, "utf8");

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1);

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
}

function resolveAdditionalEnvFiles() {
  const configured = process.env.AGENTARXIV_ENV_FILE?.trim() ?? "";

  if (!configured) {
    return [];
  }

  return configured
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => path.resolve(ROOT_DIR, entry));
}

const fileEnv = {
  ...parseEnvFile(path.join(ROOT_DIR, ".env")),
  ...parseEnvFile(path.join(ROOT_DIR, ".env.local")),
  ...resolveAdditionalEnvFiles().reduce(
    (mergedEnv, envFilePath) => ({
      ...mergedEnv,
      ...parseEnvFile(envFilePath),
    }),
    {},
  ),
};

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error("Usage: node scripts/with-root-env.mjs <command> [...args]");
  process.exit(1);
}

const child = spawn(command, args, {
  cwd: ROOT_DIR,
  env: {
    ...fileEnv,
    ...process.env,
  },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
