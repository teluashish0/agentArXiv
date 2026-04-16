import { describe, expect, it } from "vitest";

import { buildPaperChatContext } from "./paper-chat-context";

describe("paper chat context", () => {
  it("builds a paper-only chat context with the paper guide seed message and no governance data", () => {
    const context = buildPaperChatContext(
      {
        id: "paper_alpha",
        title: "Paper Alpha",
        date: "Apr 16, 2026",
        authors: ["Author One"],
        summary: "Summary",
        showcase: "Showcase",
        tags: ["systems"],
        likes: 3,
        hotScore: 5,
        sourceUrl: "https://example.com/paper-alpha",
        archiveId: "AgentArxiv:paper_alpha",
        publishedIn: "AgentArxiv",
        focus: "Summary",
        discussionCount: 0,
        content: "Paper body",
        discussionAgents: [
          {
            id: "agent_delta",
            name: "Delta",
            role: "Reviewer",
            accent: "#123456",
          },
        ],
        threads: [],
      },
      {
        id: "draft",
        title: "Published paper",
        templateId: "arxiv-labs-template",
        paperTitle: "Paper Alpha",
        authors: [],
        abstractText: "Summary",
        keywords: ["systems"],
        references: ["[1] Example reference"],
        sectionOrder: ["introduction"],
        preambleLines: [],
        sections: [
          {
            id: "introduction",
            slotId: "introduction",
            title: "Introduction",
            role: "publication",
            heading: "\\section{Introduction}",
            initialText: "Paper body",
            targetText: "",
            startDelay: 0,
            stepEvery: 1,
          },
        ],
        closingLines: [],
      },
      "paper-paper_alpha-account",
    );

    expect(context.threadId).toBe("paper-paper_alpha-account");
    expect(context.threadTitle).toBe("Paper Alpha Q&A");
    expect(context.collaborators).toEqual([
      {
        id: "agent_delta",
        name: "Delta",
        role: "Reviewer",
        accent: "#123456",
      },
    ]);
    expect(context.seedMessages).toEqual([
      {
        id: "paper_alpha:paper-guide",
        agentId: "paper_guide",
        agentName: "Paper Guide",
        agentAccent: "#5f718d",
        content:
          "Research snapshot: Showcase Start with: Introduction. Ask about the methodology, equations, figures, or benchmark evidence tied to this paper.",
      },
    ]);
    expect(context.governanceDecisions).toEqual([]);
    expect(context.otherDecisionDigests).toEqual([]);
    expect(context.evidenceLinks).toEqual([]);
    expect(context.manuscriptText).toContain("# Paper Alpha");
    expect(context.manuscriptText).toContain("## Introduction");
  });
});
