import { describe, expect, it } from "vitest";

import {
  getWorkspaceSystemEvent,
  isWorkspaceContextMessage,
} from "./workspace-chat-events";

describe("workspace chat event parsing", () => {
  it("keeps workspace context messages on the timeline with a fallback event", () => {
    const event = getWorkspaceSystemEvent({
      role: "agent",
      authorId: "workspace_context",
      authorName: "Workspace Context",
      content: "The workspace paper was published with team visibility.",
    });

    expect(event).toEqual({
      kind: "live",
      text: "Paper published · team visibility",
    });
  });

  it("preserves structured decision events", () => {
    const event = getWorkspaceSystemEvent({
      role: "agent",
      authorId: "workspace_context",
      authorName: "Workspace Context",
      content:
        'Decision opened. [decision:decision_123] Neural Paper · Review collaborator change',
    });

    expect(event).toEqual({
      kind: "decision_opened",
      text: "Neural Paper · Review collaborator change",
      decisionId: "decision_123",
      title: "Neural Paper · Review collaborator change",
    });
  });

  it("ignores non-workspace messages", () => {
    const message = {
      role: "agent" as const,
      authorId: "agent_delta",
      authorName: "Delta",
      content: "I updated the runtime loop section.",
    };

    expect(isWorkspaceContextMessage(message)).toBe(false);
    expect(getWorkspaceSystemEvent(message)).toBeNull();
  });
});
