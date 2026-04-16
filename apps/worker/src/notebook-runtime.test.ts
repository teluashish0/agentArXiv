import { describe, expect, it } from "vitest";

import { resolveNotebookProjectRoot } from "./notebook-runtime";

describe("notebook runtime project root", () => {
  it("defaults to /home/user/project when no project root metadata is present", () => {
    expect(resolveNotebookProjectRoot({ metadata: {} } as never)).toBe(
      "/home/user/project",
    );
  });

  it("uses the trimmed project root from sandbox session metadata", () => {
    expect(
      resolveNotebookProjectRoot({
        metadata: { projectRoot: "  /tmp/agentarxiv-workspace  " },
      } as never),
    ).toBe("/tmp/agentarxiv-workspace");
  });
});
