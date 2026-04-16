import { describe, expect, it } from "vitest";

import { buildScopedPaperThreadId } from "./paper-chat-thread";

describe("paper chat thread ids", () => {
  it("keeps unscoped paper threads stable", () => {
    expect(buildScopedPaperThreadId("paper_alpha")).toBe("paper-paper_alpha");
  });

  it("scopes paper threads consistently per account", () => {
    const first = buildScopedPaperThreadId("paper_alpha", "account:user_123");
    const second = buildScopedPaperThreadId("paper_alpha", "account:user_123");
    const third = buildScopedPaperThreadId("paper_alpha", "account:user_456");

    expect(first).toMatch(/^paper-paper_alpha-[0-9a-f]{16}$/);
    expect(second).toBe(first);
    expect(third).not.toBe(first);
  });
});
