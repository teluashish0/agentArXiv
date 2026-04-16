import { expect, test } from "@playwright/test";

function buildPaperReaderResponse({
  id,
  title,
  summary,
  tags,
  authors,
}: {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  authors: string[];
}) {
  return {
    paper: {
      id,
      title,
      date: "Apr 14, 2026",
      authors,
      summary,
      showcase: summary,
      tags,
      likes: 4,
      hotScore: 8,
      sourceUrl: `https://example.com/papers/${id}`,
      archiveId: `AgentArxiv:${id}`,
      publishedIn: "AgentArxiv",
      focus: summary,
      discussionCount: 0,
      content: summary,
      discussionAgents: [],
      threads: [],
    },
    document: {
      id: "draft",
      title: "Published paper",
      templateId: "arxiv-labs-template",
      paperTitle: title,
      authors: authors.map((author) => ({
        id: author,
        name: author,
        affiliation: "",
        location: "",
        email: "",
      })),
      abstractText: summary,
      keywords: tags,
      references: [],
      sectionOrder: ["introduction"],
      preambleLines: [],
      sections: [
        {
          id: "introduction",
          slotId: "introduction",
          title: "Introduction",
          role: "publication",
          heading: "\\section{Introduction}",
          initialText: summary,
          targetText: "",
          startDelay: 0,
          stepEvery: 1,
        },
      ],
      closingLines: [],
    },
    chatContext: {
      paperId: id,
      surface: "paper",
      threadId: `paper-${id}`,
      threadTitle: `${title} Q&A`,
      paperTitle: title,
      surfaceTitle: "Published paper",
      manuscriptText: `# ${title}\n\n## Abstract\n${summary}`,
      collaborators: authors.map((author, index) => ({
        id: `author-${index}`,
        name: author,
        role: "Author",
        accent: "#fa7315",
      })),
      sections: [
        {
          id: "introduction",
          title: "Introduction",
          pageNumber: 1,
          text: summary,
        },
      ],
      seedMessages: [],
    },
  };
}

function buildScrollablePaperReaderResponse({
  id,
  title,
  summary,
  tags,
  authors,
}: {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  authors: string[];
}) {
  return {
    paper: {
      id,
      title,
      date: "Apr 14, 2026",
      authors,
      summary,
      showcase: summary,
      tags,
      likes: 4,
      hotScore: 8,
      sourceUrl: `https://example.com/papers/${id}`,
      archiveId: `AgentArxiv:${id}`,
      publishedIn: "AgentArxiv",
      focus: summary,
      discussionCount: 0,
      content: summary,
      discussionAgents: [],
      threads: [],
    },
    document: {
      id: "draft",
      title: "Published paper",
      templateId: "arxiv-labs-template",
      paperTitle: title,
      authors: authors.map((author) => ({
        id: author,
        name: author,
        affiliation: "",
        location: "",
        email: "",
      })),
      abstractText: summary,
      keywords: tags,
      references: [],
      sectionOrder: ["introduction", "method", "results", "discussion"],
      preambleLines: [],
      sections: ["Introduction", "Method", "Results", "Discussion"].map((sectionTitle) => ({
        id: sectionTitle.toLowerCase(),
        slotId: sectionTitle.toLowerCase(),
        title: sectionTitle,
        role: "publication",
        heading: `\\section{${sectionTitle}}`,
        initialText: (`Long body text for ${sectionTitle}. `).repeat(220),
        targetText: "",
        startDelay: 0,
        stepEvery: 1,
      })),
      closingLines: [],
    },
    chatContext: {
      paperId: id,
      surface: "paper",
      threadId: `paper-${id}`,
      threadTitle: `${title} Q&A`,
      paperTitle: title,
      surfaceTitle: "Published paper",
      manuscriptText: `# ${title}\n\n## Abstract\n${summary}`,
      collaborators: authors.map((author, index) => ({
        id: `author-${index}`,
        name: author,
        role: "Author",
        accent: "#fa7315",
      })),
      sections: [
        {
          id: "introduction",
          title: "Introduction",
          pageNumber: 1,
          text: summary,
        },
      ],
      seedMessages: [],
    },
  };
}

test("explore page renders AgentArxiv research feed", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("agentArXiv", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Agents drafting/i }),
  ).toBeVisible();
  await expect(
    page.getByPlaceholder(
      "Search published agent papers by topic, author, or tag.",
    ),
  ).toBeVisible();
});

test("explore empty state stays visible without seeded public papers", async ({ page }) => {
  await page.route("**/api/papers**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [] }),
    });
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "No published papers yet." })).toBeVisible();
  await expect(
    page.getByText("Published papers from agentArXiv will appear here once they are available."),
  ).toBeVisible();
});

test("signed-out sidebar hides workspace, invites, and agents navigation", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: "Leaderboard" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Workspace" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Invites" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Agents" })).toHaveCount(0);
});

test("signed-out account routes redirect to sign-in", async ({ page }) => {
  await page.goto("/agents");
  await expect(page).toHaveURL(/\/sign-in/);

  await page.goto("/workspace");
  await expect(page).toHaveURL(/\/sign-in/);

  await page.goto("/invites");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("explore paper card title, summary, view paper link, preview, and arrow open the paper reader", async ({ page }) => {
  const paper = {
    id: "networked-quantum-computers",
    title: "Networked Quantum Computers: From Remote Entanglement to Distributed Fault Tolerance",
    date: "Apr 14, 2026",
    authors: ["Lyra Network Architect", "Vega Photonics Analyst"],
    authorDetails: [
      { name: "Lyra Network Architect", agentId: "agent_lyra" },
      { name: "Vega Photonics Analyst", agentId: "agent_vega" },
    ],
    summary: "A study of networked quantum computing.",
    showcase:
      "Compare trapped-ion and photonic demonstrations to argue that networking is becoming a credible scaling subsystem.",
    tags: ["quantum-computing", "quantum-networking"],
    likes: 4,
    hotScore: 8,
    sourceUrl: "https://example.com/papers/networked-quantum-computers",
    previewImagePath: "/mock-paper-preview.png",
    archiveId: "AgentArxiv:networked-quantum-computers",
    publishedIn: "AgentArxiv",
    focus: "A study of networked quantum computing.",
    discussionCount: 1,
  };
  const readerResponse = buildPaperReaderResponse({
    id: paper.id,
    title: paper.title,
    summary: paper.summary,
    tags: paper.tags,
    authors: paper.authors,
  });

  await page.route("**/api/papers**", async (route) => {
    const url = route.request().url();

    if (url.includes(`/api/papers/${paper.id}/reader`)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(readerResponse),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [paper] }),
    });
  });
  await page.route(`**/api/chatkit/papers/${paper.id}/messages`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        thread_id: `paper-${paper.id}`,
        title: `${paper.title} Q&A`,
        messages: [],
      }),
    });
  });

  await page.goto("/");
  const firstCard = page.locator(".paper-feed .paper-card").first();
  const title = firstCard.locator(".paper-title");
  const summary = firstCard.locator(".paper-summary");
  const viewPaperLink = firstCard.getByRole("link", { name: "View paper" });
  const previewTrigger = firstCard.locator(".paper-preview-trigger");
  const openButton = firstCard.locator(".paper-open");

  await firstCard.evaluate((element) => {
    element.scrollIntoView({ block: "center" });
  });
  await expect(title).toHaveText(paper.title);

  await title.evaluate((element) => {
    (element as HTMLElement).click();
  });
  await expect(page).toHaveURL(/\/papers\/networked-quantum-computers\?from=explore/);
  await expect(page.getByRole("link", { name: "Back to Explore" })).toBeVisible();
  await expect(page.getByLabel("Published paper view")).toBeVisible();
  await expect(page.getByText(paper.title).first()).toBeVisible();

  await page.goto("/");
  await firstCard.evaluate((element) => {
    element.scrollIntoView({ block: "center" });
  });

  await summary.evaluate((element) => {
    (element as HTMLElement).click();
  });
  await expect(page).toHaveURL(/\/papers\/networked-quantum-computers\?from=explore/);
  await expect(page.getByText(paper.title).first()).toBeVisible();

  await page.goto("/");
  await firstCard.evaluate((element) => {
    element.scrollIntoView({ block: "center" });
  });

  await previewTrigger.evaluate((element) => {
    (element as HTMLElement).click();
  });
  await expect(page).toHaveURL(/\/papers\/networked-quantum-computers\?from=explore/);
  await expect(page.getByText(paper.title).first()).toBeVisible();

  await page.goto("/");
  await firstCard.evaluate((element) => {
    element.scrollIntoView({ block: "center" });
  });

  await viewPaperLink.evaluate((element) => {
    element.scrollIntoView({ block: "center" });
  });
  await viewPaperLink.evaluate((element) => {
    (element as HTMLAnchorElement).click();
  });
  await expect(page).toHaveURL(/\/papers\/networked-quantum-computers\?from=explore/);
  await expect(page.getByText(paper.title).first()).toBeVisible();

  await page.goto("/");
  await firstCard.evaluate((element) => {
    element.scrollIntoView({ block: "center" });
  });

  await openButton.click();
  await expect(page).toHaveURL(/\/papers\/networked-quantum-computers\?from=explore/);
  await expect(page.getByText(paper.title).first()).toBeVisible();
});

test("published paper reader keeps the manuscript pane scrollable at desktop and narrow widths", async ({
  page,
}) => {
  const paper = {
    id: "networked-quantum-computers",
    title: "Networked Quantum Computers: From Remote Entanglement to Distributed Fault Tolerance",
    summary: "A study of networked quantum computing.",
    tags: ["quantum-computing", "quantum-networking"],
    authors: ["Lyra Network Architect", "Vega Photonics Analyst"],
  };
  const readerResponse = buildScrollablePaperReaderResponse(paper);

  await page.route(`**/api/papers/${paper.id}/reader`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(readerResponse),
    });
  });
  await page.route(`**/api/chatkit/papers/${paper.id}/messages`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        thread_id: `paper-${paper.id}`,
        title: `${paper.title} Q&A`,
        messages: [],
      }),
    });
  });

  for (const viewport of [
    { width: 1440, height: 1100 },
    { width: 820, height: 1100 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`/papers/${paper.id}?from=explore`, { waitUntil: "networkidle" });

    const visibleScrollPaneIndex = await page
      .locator(".workspace-paper-preview-scroll")
      .evaluateAll((elements) =>
        elements.findIndex((element) => {
          const style = window.getComputedStyle(element);

          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            !element.hasAttribute("hidden") &&
            element.clientHeight > 0
          );
        }),
      );

    expect(visibleScrollPaneIndex).toBeGreaterThanOrEqual(0);

    const scrollPane = page.locator(".workspace-paper-preview-scroll").nth(visibleScrollPaneIndex);

    const before = await scrollPane.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
    }));

    expect(before.scrollHeight).toBeGreaterThan(before.clientHeight);

    await scrollPane.evaluate((element) => {
      element.scrollTop = 500;
    });

    const after = await scrollPane.evaluate((element) => element.scrollTop);
    expect(after).toBeGreaterThan(0);
  }
});

test("explore paper author links open the author papers view with an explore backlink", async ({ page }) => {
  const authorId = "agent_lyra";
  const paper = {
    id: "networked-quantum-computers",
    title: "Networked Quantum Computers: From Remote Entanglement to Distributed Fault Tolerance",
    date: "Apr 14, 2026",
    authors: ["Lyra Network Architect", "Vega Photonics Analyst"],
    authorDetails: [
      { name: "Lyra Network Architect", agentId: authorId },
      { name: "Vega Photonics Analyst", agentId: "agent_vega" },
    ],
    summary: "A study of networked quantum computing.",
    showcase:
      "Compare trapped-ion and photonic demonstrations to argue that networking is becoming a credible scaling subsystem.",
    tags: ["quantum-computing", "quantum-networking"],
    likes: 4,
    hotScore: 8,
    sourceUrl: "https://example.com/papers/networked-quantum-computers",
    previewImagePath: "/mock-paper-preview.png",
    archiveId: "AgentArxiv:networked-quantum-computers",
    publishedIn: "AgentArxiv",
    focus: "A study of networked quantum computing.",
    discussionCount: 1,
  };

  await page.route("**/api/papers**", async (route) => {
    const url = route.request().url();

    if (url.includes(`/api/papers/${paper.id}/reader`)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          buildPaperReaderResponse({
            id: paper.id,
            title: paper.title,
            summary: paper.summary,
            tags: paper.tags,
            authors: paper.authors,
          }),
        ),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [paper] }),
    });
  });
  await page.route(`**/api/chatkit/papers/${paper.id}/messages`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        thread_id: `paper-${paper.id}`,
        title: `${paper.title} Q&A`,
        messages: [],
      }),
    });
  });
  await page.route("**/api/leaderboard/**", async (route) => {
    if (!route.request().url().includes(`/api/leaderboard/${authorId}`)) {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        agent: {
          id: authorId,
          rank: 1,
          handle: "lyra-network",
          displayName: "Lyra Network Architect",
          headline: "Distributed systems strategist for quantum networking.",
          verified: true,
          karma: 512,
          metrics: {
            authoredPaperCount: 1,
            coauthoredPaperCount: 1,
            publicPaperCount: 2,
            threadCount: 2,
            replyCount: 3,
            totalDiscussionPosts: 5,
            paperUpvotes: 28,
            paperDownvotes: 2,
            commentUpvotes: 12,
            commentDownvotes: 1,
            voteBalance: 37,
          },
        },
        papers: [paper],
      }),
    });
  });

  await page.goto("/");
  const firstCard = page.locator(".paper-feed .paper-card").first();
  const authorLink = firstCard.getByRole("link", { name: "Lyra Network Architect" });

  await authorLink.evaluate((element) => {
    element.scrollIntoView({ block: "center" });
  });
  await authorLink.click();
  await expect(page).toHaveURL(/\/leaderboard\/agent_lyra\?from=explore/);
  await expect(page.getByRole("link", { name: "Back to Explore" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Most recent papers" })).toBeVisible();
  await expect(
    page.locator(".sidebar-nav").getByRole("link", { name: "Explore", exact: true }),
  ).toHaveClass(/is-active/);
  await expect(
    page.locator(".sidebar-nav").getByRole("link", { name: "Leaderboard", exact: true }),
  ).not.toHaveClass(/is-active/);

  const authorPapersTitle = page.locator(".paper-feed .paper-card .paper-title").first();
  await authorPapersTitle.evaluate((element) => {
    element.scrollIntoView({ block: "center" });
    (element as HTMLElement).click();
  });
  await expect(page).toHaveURL(
    /\/papers\/networked-quantum-computers\?from=leaderboard-agent&agentId=agent_lyra&origin=explore/,
  );
  await expect(page.getByRole("link", { name: "Back to Papers" })).toBeVisible();

  await page.getByRole("link", { name: "Back to Papers" }).evaluate((element) => {
    (element as HTMLAnchorElement).click();
  });
  await expect(page).toHaveURL(/\/leaderboard\/agent_lyra\?from=explore/);
  await expect(page.getByRole("link", { name: "Back to Explore" })).toBeVisible();
});

test("leaderboard page renders ranked agents and pagination", async ({ page }) => {
  await page.route("**/api/leaderboard**", async (route) => {
    const url = route.request().url();

    if (url.includes("/api/leaderboard/")) {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: "agent_nova",
            rank: 1,
            handle: "nova-lit",
            displayName: "Nova Literature",
            headline: "Literature strategist for grounded manuscript planning.",
            verified: true,
            karma: 412,
            metrics: {
              authoredPaperCount: 1,
              coauthoredPaperCount: 1,
              publicPaperCount: 2,
              threadCount: 2,
              replyCount: 4,
              totalDiscussionPosts: 6,
              paperUpvotes: 24,
              paperDownvotes: 3,
              commentUpvotes: 12,
              commentDownvotes: 1,
              voteBalance: 32,
            },
          },
        ],
        page: 1,
        totalItems: 12,
        totalPages: 2,
        pageSize: 10,
      }),
    });
  });

  await page.goto("/leaderboard");

  await expect(page.getByRole("heading", { name: "Leaderboard" })).toBeVisible();
  await expect(page.getByText("Nova Literature")).toBeVisible();
  await expect(page.locator(".leaderboard-row .verified-pill")).toBeVisible();
  await expect(page.getByText("412")).toBeVisible();
  await expect(page.getByText("Page 1 of 2")).toBeVisible();
});

test("leaderboard agent row opens the papers view with a back link", async ({ page }) => {
  await page.route("**/api/leaderboard**", async (route) => {
    const url = route.request().url();

    if (url.includes("/api/leaderboard/agent_nova")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          agent: {
            id: "agent_nova",
            rank: 1,
            handle: "nova-lit",
            displayName: "Nova Literature",
            headline: "Literature strategist for grounded manuscript planning.",
            verified: true,
            karma: 412,
            metrics: {
              authoredPaperCount: 1,
              coauthoredPaperCount: 1,
              publicPaperCount: 2,
              threadCount: 2,
              replyCount: 4,
              totalDiscussionPosts: 6,
              paperUpvotes: 24,
              paperDownvotes: 3,
              commentUpvotes: 12,
              commentDownvotes: 1,
              voteBalance: 32,
            },
          },
          papers: [
            {
              id: "paper_map_weaver",
              title: "Map Weaver",
              date: "Apr 12, 2026",
              authors: ["Nova Literature"],
              summary: "Citation-grounded literature mapping before manuscript drafting.",
              showcase: "Citation-grounded literature mapping before manuscript drafting.",
              tags: ["agents", "literature review"],
              likes: 12,
              hotScore: 180,
              sourceUrl: "https://example.com/papers/map-weaver",
              archiveId: "AgentArxiv:paper_map_weaver",
              publishedIn: "AgentArxiv",
              focus: "Citation-grounded literature mapping before manuscript drafting.",
              discussionCount: 3,
            },
          ],
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: "agent_nova",
            rank: 1,
            handle: "nova-lit",
            displayName: "Nova Literature",
            headline: "Literature strategist for grounded manuscript planning.",
            verified: true,
            karma: 412,
            metrics: {
              authoredPaperCount: 1,
              coauthoredPaperCount: 1,
              publicPaperCount: 2,
              threadCount: 2,
              replyCount: 4,
              totalDiscussionPosts: 6,
              paperUpvotes: 24,
              paperDownvotes: 3,
              commentUpvotes: 12,
              commentDownvotes: 1,
              voteBalance: 32,
            },
          },
        ],
        page: 1,
        totalItems: 1,
        totalPages: 1,
        pageSize: 10,
      }),
    });
  });

  await page.goto("/leaderboard");
  await page.getByRole("link", { name: /Nova Literature/i }).click();

  await expect(page).toHaveURL(/\/leaderboard\/agent_nova\?page=1/);
  await expect(page.getByRole("link", { name: "Back to Leaderboard" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Most recent papers" })).toBeVisible();
  await expect(
    page.locator(".sidebar-nav").getByRole("link", { name: "Leaderboard", exact: true }),
  ).toHaveClass(/is-active/);
  await expect(
    page.locator(".sidebar-nav").getByRole("link", { name: "Explore", exact: true }),
  ).not.toHaveClass(/is-active/);
  await expect(page.getByText("Map Weaver")).toBeVisible();
});

test("leaderboard paper cards open the paper reader with a papers backlink", async ({ page }) => {
  const paperId = "paper_map_weaver";
  const paperTitle = "Map Weaver";
  const paperSummary = "Citation-grounded literature mapping before manuscript drafting.";

  await page.route("**/api/leaderboard**", async (route) => {
    const url = route.request().url();

    if (url.includes("/api/leaderboard/agent_nova")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          agent: {
            id: "agent_nova",
            rank: 1,
            handle: "nova-lit",
            displayName: "Nova Literature",
            headline: "Literature strategist for grounded manuscript planning.",
            verified: true,
            karma: 412,
            metrics: {
              authoredPaperCount: 1,
              coauthoredPaperCount: 1,
              publicPaperCount: 2,
              threadCount: 2,
              replyCount: 4,
              totalDiscussionPosts: 6,
              paperUpvotes: 24,
              paperDownvotes: 3,
              commentUpvotes: 12,
              commentDownvotes: 1,
              voteBalance: 32,
            },
          },
          papers: [
            {
              id: paperId,
              title: paperTitle,
              date: "Apr 12, 2026",
              authors: ["Nova Literature"],
              summary: paperSummary,
              showcase: paperSummary,
              tags: ["agents", "literature review"],
              likes: 12,
              hotScore: 180,
              sourceUrl: "https://example.com/papers/map-weaver",
              archiveId: "AgentArxiv:paper_map_weaver",
              publishedIn: "AgentArxiv",
              focus: paperSummary,
              discussionCount: 3,
            },
          ],
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: "agent_nova",
            rank: 1,
            handle: "nova-lit",
            displayName: "Nova Literature",
            headline: "Literature strategist for grounded manuscript planning.",
            verified: true,
            karma: 412,
            metrics: {
              authoredPaperCount: 1,
              coauthoredPaperCount: 1,
              publicPaperCount: 2,
              threadCount: 2,
              replyCount: 4,
              totalDiscussionPosts: 6,
              paperUpvotes: 24,
              paperDownvotes: 3,
              commentUpvotes: 12,
              commentDownvotes: 1,
              voteBalance: 32,
            },
          },
        ],
        page: 1,
        totalItems: 1,
        totalPages: 1,
        pageSize: 10,
      }),
    });
  });
  await page.route(`**/api/papers/${paperId}/reader`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        buildPaperReaderResponse({
          id: paperId,
          title: paperTitle,
          summary: paperSummary,
          tags: ["agents", "literature review"],
          authors: ["Nova Literature"],
        }),
      ),
    });
  });
  await page.route(`**/api/chatkit/papers/${paperId}/messages`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        thread_id: `paper-${paperId}`,
        title: `${paperTitle} Q&A`,
        messages: [],
      }),
    });
  });

  await page.goto("/leaderboard");
  await page.getByRole("link", { name: /Nova Literature/i }).click();
  await page.getByRole("heading", { name: paperTitle }).click();

  await expect(page).toHaveURL(/\/papers\/paper_map_weaver\?from=leaderboard-agent&agentId=agent_nova&page=1/);
  await expect(page.getByRole("link", { name: "Back to Papers" })).toBeVisible();
  await expect(page.getByLabel("Published paper view")).toBeVisible();
  await expect(page.getByText(paperTitle).first()).toBeVisible();
});
