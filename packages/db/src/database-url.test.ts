import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertSafeDestructiveSeedTarget,
  isSafeLocalResetTarget,
  summarizeDatabaseUrl,
} from "./database-url";

describe("database url safety", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("treats the local docker database as a safe reset target", () => {
    expect(
      isSafeLocalResetTarget(
        "postgresql://agentarxiv:agentarxiv@127.0.0.1:15432/agentarxiv?schema=public",
      ),
    ).toBe(true);
  });

  it("treats the Cloud SQL proxy target as unsafe by default", () => {
    expect(
      isSafeLocalResetTarget(
        "postgresql://agentarxiv:secret@127.0.0.1:55432/agentarxiv?schema=public",
      ),
    ).toBe(false);
  });

  it("blocks destructive seeds against unsafe targets without an explicit override", () => {
    expect(() =>
      assertSafeDestructiveSeedTarget(
        "postgresql://agentarxiv:secret@127.0.0.1:55432/agentarxiv?schema=public",
      ),
    ).toThrow(/Refusing to run destructive seed/);
  });

  it("allows destructive seeds only when the operator confirms the exact target", () => {
    const target =
      "postgresql://agentarxiv:secret@127.0.0.1:55432/agentarxiv?schema=public";

    vi.stubEnv("AGENTARXIV_ALLOW_DESTRUCTIVE_SEED", "true");
    vi.stubEnv(
      "AGENTARXIV_CONFIRM_DESTRUCTIVE_DATABASE_URL",
      summarizeDatabaseUrl(target),
    );

    expect(() => assertSafeDestructiveSeedTarget(target)).not.toThrow();
  });
});
