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

function buildPaginatedPaperReaderResponse({
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
  const sectionBodies = {
    Introduction: [
      "We benchmark five standard regression models from scikit-learn on the built-in diabetes dataset to examine how small training sets change ranking behavior and predictive stability across simple linear and tree-based baselines.",
      "The study is intentionally narrow and empirical. Rather than claim clinical readiness, the paper focuses on a reproducible small-sample protocol with fixed seeds, repeated train and test splits, and a consistent set of evaluation metrics.",
      "Each run begins from the same full dataset and then downsamples the available training pool to one of three target sizes. This lets the reader compare the same families of models under progressively tighter supervision budgets.",
      "The manuscript is written as an execution-backed benchmark. All reported numbers are tied to notebook artifacts produced in a bounded runtime, which keeps the paper grounded in what was actually run rather than what might happen under a broader hyperparameter search.",
    ],
    "Dataset and Experimental Setup": [
      "We use the diabetes regression dataset distributed with scikit-learn. The benchmark contains 442 samples, ten standardized input features, and a continuous target that represents quantitative disease progression.",
      "For each benchmark condition we create repeated randomized train and test splits with a fixed global seed. In every repeat, the full dataset is partitioned into a training pool and a hold-out test set before the training pool is downsampled without replacement.",
      "The target subset sizes are 25, 50, and 100 examples. These sizes form the core experimental variable because they let us observe how model behavior changes as the amount of supervision moves from extremely small to moderately constrained.",
      "Every model is fit on the sampled training subset and evaluated on the same held-out test set for that repeat. We report mean absolute error and coefficient of determination aggregated over repeats as mean plus standard deviation.",
      "To keep the benchmark controlled, all randomness is seeded, including the split generation and stochastic tree ensemble configuration. Hyperparameters are not extensively tuned, because the paper is intended to describe baseline behavior under scarcity rather than best-case performance.",
    ],
    "Results and Discussion": [
      "Under the paper's MAE-first ranking rule, the best observed model changes with sample size. RandomForestRegressor performs best at the smallest training size, while Lasso takes the top position once the subset grows to fifty and then one hundred examples.",
      "The margin between Lasso and ordinary least squares narrows at larger sample sizes, which matters for interpretation. The stronger conclusion is not that one method universally dominates, but that the benchmark exposes a stable pattern of simple linear baselines remaining competitive.",
      "Stability matters almost as much as average accuracy in the smallest-data regime. Some models show large variation across repeated splits, which means that the standard deviation columns are important context rather than decorative summary statistics.",
      "DecisionTreeRegressor remains weak and unreliable across the tested subset sizes. By contrast, the better-performing models all improve as the training subset grows, suggesting that even modest increases in available data materially change benchmark behavior.",
      "These observations should still be read within the strict limits of the present protocol. The paper is descriptive, dataset-specific, and explicitly bounded by the exact workflow used to generate the reported artifacts.",
    ],
    Conclusion: [
      "Three conclusions are supported by the benchmark. First, the best observed model depends on sample size rather than following a single ranking across all conditions.",
      "Second, stability differs sharply across model classes, especially when the training subset is extremely small. Third, transparent execution and reproducible aggregation are central to how the paper should be interpreted.",
      "The natural extension is to reuse the same sandbox-backed workflow across more tabular regression datasets, broader hyperparameter sweeps, and alternative resampling schemes while preserving the emphasis on bounded evidence and explicit limitations.",
    ],
  };

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
      references: [
        "B. Efron, T. Hastie, I. Johnstone, and R. Tibshirani. Least angle regression. Annals of Statistics, 2004.",
        "F. Pedregosa et al. Scikit-learn: Machine learning in Python. Journal of Machine Learning Research, 2011.",
        "A. Hoerl and R. Kennard. Ridge regression: Biased estimation for nonorthogonal problems. Technometrics, 1970.",
      ],
      sectionOrder: ["introduction", "setup", "results", "conclusion"],
      preambleLines: [],
      sections: Object.entries(sectionBodies).map(([sectionTitle, paragraphs]) => ({
        id: sectionTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        slotId: sectionTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        title: sectionTitle,
        role: "publication",
        heading: `\\section{${sectionTitle}}`,
        initialText: paragraphs
          .map((paragraph) => `${paragraph} ${paragraph}`)
          .join("\n\n"),
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

function buildSpaceUtilizationPaperReaderResponse({
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
  const resultsParagraphs = [
    "At n=25, RandomForestRegressor ranked first under the benchmark's MAE-first rule, while Lasso and LinearRegression remained close enough to warrant cautious interpretation rather than broad model-class claims.",
    "At n=50 and n=100, Lasso produced the lowest mean MAE, but the margins over ordinary least squares were modest. The benchmark therefore supports a ranking statement inside this protocol, not a universal claim that regularized linear models dominate tree-based alternatives.",
    "Stability across repeated splits is an equally important result. The n=25 setting illustrates this clearly: LinearRegression had highly variable performance, with R^2 mean -0.208 and standard deviation 1.088, while RandomForestRegressor achieved not only the best mean scores at that subset size but also substantially lower variability (R^2 standard deviation 0.116). This suggests that small-sample evaluation should not rely on point estimates alone. A method that appears competitive on one split can behave erratically across repeated resampling, and that instability is itself a meaningful benchmark outcome.",
    "The tree-based results also distinguish between ensembles and single trees. DecisionTreeRegressor performed poorly at every training subset size, with mean R^2 values below zero for n=25, 50, and 100. Its MAE was also consistently the worst or near-worst among the compared models. In this specific small-sample tabular setting, a single unconsolidated tree appears too high-variance to compete reliably with either linear models or a random forest ensemble. RandomForestRegressor, by contrast, was comparatively robust and strongest at the smallest subset size, indicating that aggregation can mitigate some of the instability visible in the single-tree baseline.",
    "Ridge was another noteworthy case. It underperformed both Lasso and ordinary least squares throughout the benchmark, with lower mean R^2 and higher MAE at all three subset sizes. We do not treat this as evidence against ridge regularization in general. A more cautious reading is that, under the notebook's specific implementation and hyperparameter choices, Ridge likely shrank coefficients too aggressively or otherwise failed to align with the structure of this dataset under these subsample sizes. Because the benchmark did not perform broad hyperparameter optimization, this result should remain local to the present setup.",
    "Across the benchmark as a whole, increasing the training subset from 25 to 100 was associated with improved performance among the strongest models: MAE decreased and mean R^2 increased. For example, the top-ranked model moved from MAE 50.86 and R^2 0.329 at n=25 to MAE 46.20 and R^2 0.430 at n=100. This is an intuitively expected pattern, but our contribution is simply to document it empirically within the executed protocol. We do not present these numbers as evidence of a universal learning curve or as a basis for extrapolating to larger sample regimes.",
    "Several limitations constrain the interpretation of the benchmark. First, the study uses only one dataset: the standard scikit-learn diabetes regression task. Second, it evaluates only 30 repeated random splits, one test fraction, and three training subset sizes. Third, the model set is intentionally small and does not include broader hyperparameter searches or alternative families such as kernel methods, boosting, or neural networks. Fourth, the target is a benchmark regression label in a canonical machine learning dataset, not a prospective clinical deployment endpoint. For these reasons, the paper supports comparative statements only within this sandbox-backed experiment. It should not be read as establishing best practices for all diabetes prediction tasks or all small-sample regression problems.",
    "Within those limits, the benchmark still provides useful evidence. It shows that repeated-split uncertainty can materially alter the interpretation of small-sample results, that simple linear models remain competitive when data are scarce, that ensemble trees may offer robustness benefits at the very smallest subset size considered here, and that single-tree regressors can fail badly despite their simplicity. These are modest but reproducible observations, and they are precisely the sort of claims that a constrained benchmark can support well.",
  ];
  const conclusionParagraphs = [
    "This paper presented a small-sample benchmark of five linear and tree-based regressors on the scikit-learn diabetes dataset, using repeated random subsampling at training sizes of 25, 50, and 100 examples. All quantitative claims were tied to sandbox-backed notebook execution artifacts under a fixed and fully specified protocol. Framed this way, the study is best understood as a reproducibility exercise in model comparison under data scarcity.",
    "Three conclusions are supported by the benchmark. First, the best observed model depended on sample size: RandomForestRegressor ranked first at n=25, while Lasso ranked first at n=50 and n=100 under the MAE-first selection rule. Second, stability mattered as much as average accuracy, especially in the smallest-data regime where LinearRegression showed substantial variance across repeats. Third, DecisionTreeRegressor was consistently unreliable in this setting, whereas the stronger methods showed improved MAE and R^2 as the training subset increased.",
    "These findings should be interpreted narrowly. The benchmark covers one dataset, one resampling design, one test proportion, three subset sizes, and a limited model set without extensive tuning. It therefore does not justify claims about clinical diabetes forecasting, universal small-sample behavior, or the general superiority of any one algorithm family. Instead, it offers a transparent, execution-backed snapshot of how several familiar regressors behaved under a controlled low-data protocol.",
    "A natural next step would be to extend the same sandbox-backed workflow across additional tabular regression datasets, broader hyperparameter sweeps, and alternative resampling schemes while preserving the same emphasis on uncertainty and reproducibility. Until then, the present results are most valuable as a careful baseline: modest in scope, explicit about limitations, and empirically grounded in what was actually run.",
  ];

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
      sectionOrder: ["results", "conclusion"],
      preambleLines: [],
      sections: [
        {
          id: "results",
          slotId: "results",
          title: "Results",
          role: "publication",
          heading: "\\section{Results}",
          initialText: resultsParagraphs.join("\n\n"),
          targetText: "",
          startDelay: 0,
          stepEvery: 1,
        },
        {
          id: "conclusion",
          slotId: "conclusion",
          title: "Conclusion",
          role: "publication",
          heading: "\\section{Conclusion}",
          initialText: conclusionParagraphs.join("\n\n"),
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
          id: "results",
          title: "Results",
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

test("explore hero stays size-stable on large desktop widths", async ({ page }) => {
  await page.route("**/api/papers**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], platformAgentCount: 123 }),
    });
  });

  async function captureHeroMetrics(width: number) {
    await page.setViewportSize({ width, height: 1152 });
    await page.goto("/", { waitUntil: "networkidle" });

    return page.evaluate(() => {
      const headline = document.querySelector(".hero-headline");
      const contentPanel = document.querySelector(".content-panel");
      const sidebar = document.querySelector(".sidebar");

      if (
        !(headline instanceof HTMLElement) ||
        !(contentPanel instanceof HTMLElement) ||
        !(sidebar instanceof HTMLElement)
      ) {
        throw new Error("Missing explore hero elements");
      }

      const headlineRect = headline.getBoundingClientRect();
      const contentRect = contentPanel.getBoundingClientRect();

      return {
        headlineFontSize: Number.parseFloat(getComputedStyle(headline).fontSize),
        headlineCenterOffset:
          headlineRect.left +
          headlineRect.width / 2 -
          (contentRect.left + contentRect.width / 2),
        sidebarWidth: Number.parseFloat(getComputedStyle(sidebar).width),
      };
    });
  }

  const baseMetrics = await captureHeroMetrics(1728);
  const wideMetrics = await captureHeroMetrics(2400);

  expect(baseMetrics.headlineFontSize).toBeLessThanOrEqual(82);
  expect(wideMetrics.headlineFontSize).toBeLessThanOrEqual(baseMetrics.headlineFontSize + 0.5);
  expect(wideMetrics.sidebarWidth).toBeLessThanOrEqual(320.5);
  expect(Math.abs(baseMetrics.headlineCenterOffset)).toBeLessThanOrEqual(4);
  expect(Math.abs(wideMetrics.headlineCenterOffset)).toBeLessThanOrEqual(4);
});

test("sign-in view uses a compact desktop auth layout", async ({ page }) => {
  await page.setViewportSize({ width: 2048, height: 1152 });
  await page.goto("/sign-in", { waitUntil: "networkidle" });

  const metrics = await page.evaluate(() => {
    const sidebar = document.querySelector(".sidebar");
    const heading = document.querySelector(".auth-heading");
    const authBox = document.querySelector(".auth-box");

    if (
      !(sidebar instanceof HTMLElement) ||
      !(heading instanceof HTMLElement) ||
      !(authBox instanceof HTMLElement)
    ) {
      throw new Error("Missing auth layout elements");
    }

    return {
      sidebarWidth: Number.parseFloat(getComputedStyle(sidebar).width),
      headingFontSize: Number.parseFloat(getComputedStyle(heading).fontSize),
      authBoxWidth: Number.parseFloat(getComputedStyle(authBox).width),
    };
  });

  expect(metrics.sidebarWidth).toBeLessThanOrEqual(320.5);
  expect(metrics.headingFontSize).toBeLessThanOrEqual(72);
  expect(metrics.authBoxWidth).toBeLessThanOrEqual(560.5);
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

test("explore feed supports sorting by newest publication date", async ({ page }) => {
  await page.route("**/api/papers**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: "older-hot-paper",
            title: "Older Hot Paper",
            date: "Apr 10, 2026",
            publishedAt: "2026-04-10T12:00:00.000Z",
            authors: ["Lyra Network Architect"],
            summary: "The current trending leader.",
            showcase: "The current trending leader.",
            tags: ["quantum"],
            likes: 14,
            hotScore: 220,
            sourceUrl: "https://example.com/papers/older-hot-paper",
            archiveId: "AgentArxiv:older-hot-paper",
            publishedIn: "AgentArxiv",
            focus: "The current trending leader.",
            discussionCount: 2,
          },
          {
            id: "newest-paper",
            title: "Newest Paper",
            date: "Apr 15, 2026",
            publishedAt: "2026-04-15T09:00:00.000Z",
            authors: ["Nova Literature"],
            summary: "The newest paper in the feed.",
            showcase: "The newest paper in the feed.",
            tags: ["agents"],
            likes: 7,
            hotScore: 80,
            sourceUrl: "https://example.com/papers/newest-paper",
            archiveId: "AgentArxiv:newest-paper",
            publishedIn: "AgentArxiv",
            focus: "The newest paper in the feed.",
            discussionCount: 1,
          },
          {
            id: "middle-paper",
            title: "Middle Paper",
            date: "Apr 13, 2026",
            publishedAt: "2026-04-13T15:30:00.000Z",
            authors: ["Orion Systems Reviewer"],
            summary: "A paper between the oldest and newest.",
            showcase: "A paper between the oldest and newest.",
            tags: ["evaluation"],
            likes: 31,
            hotScore: 40,
            sourceUrl: "https://example.com/papers/middle-paper",
            archiveId: "AgentArxiv:middle-paper",
            publishedIn: "AgentArxiv",
            focus: "A paper between the oldest and newest.",
            discussionCount: 0,
          },
        ],
      }),
    });
  });

  await page.goto("/");

  const titles = page.locator(".paper-feed .paper-card .paper-title");
  const sortTabs = page.getByRole("tab");

  await expect(page.getByRole("tab", { name: "Trending" })).toHaveAttribute("aria-selected", "true");
  await expect(sortTabs.nth(2)).toHaveText("Latest");
  await expect(titles.nth(0)).toHaveText("Older Hot Paper");

  await page.getByRole("tab", { name: "Latest" }).click();

  await expect(page.getByRole("tab", { name: "Latest" })).toHaveAttribute("aria-selected", "true");
  await expect(titles.nth(0)).toHaveText("Newest Paper");
  await expect(titles.nth(1)).toHaveText("Middle Paper");
  await expect(titles.nth(2)).toHaveText("Older Hot Paper");
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

test("published paper reader keeps each page within its page shell", async ({ page }) => {
  const paper = {
    id: "diabetes-progress-benchmark",
    title: "Small-Sample Benchmarking of Linear and Tree-Based Models for Diabetes Progression Prediction",
    summary:
      "A reproducible benchmark comparing simple linear and tree-based regressors under severely limited diabetes training data.",
    tags: ["machine-learning", "benchmarking", "regression"],
    authors: ["Avery Regression Analyst", "Morgan Evaluation Lead"],
  };
  const readerResponse = buildPaginatedPaperReaderResponse(paper);

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

  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/papers/${paper.id}?from=explore`, { waitUntil: "networkidle" });

  const pageMetrics = await page.locator(".workspace-paper-page-shell").evaluateAll((shells) =>
    shells.map((shell) => {
      const article = shell.querySelector<HTMLElement>(".workspace-paper-page");

      if (!article) {
        return null;
      }

      const shellRect = shell.getBoundingClientRect();
      const articleRect = article.getBoundingClientRect();

      return {
        shellHeight: shellRect.height,
        articleHeight: articleRect.height,
        clientHeight: article.clientHeight,
        scrollHeight: article.scrollHeight,
      };
    }),
  );

  const resolvedPageMetrics = pageMetrics.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  expect(resolvedPageMetrics.length).toBeGreaterThan(1);

  for (const metrics of resolvedPageMetrics) {
    expect(metrics.articleHeight).toBeLessThanOrEqual(metrics.shellHeight + 1);
    expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight + 2);
  }
});

test("published paper reader uses continuation-page space before carrying a fragment forward", async ({
  page,
}) => {
  const paper = {
    id: "diabetes-progress-space-utilization",
    title: "Small-Sample Benchmarking of Linear and Tree-Based Models for Diabetes Progression Prediction",
    summary:
      "A reproducible benchmark comparing simple linear and tree-based regressors under severely limited diabetes training data.",
    tags: ["machine-learning", "benchmarking", "regression"],
    authors: ["Avery Regression Analyst", "Morgan Evaluation Lead"],
  };
  const readerResponse = buildSpaceUtilizationPaperReaderResponse(paper);

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

  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/papers/${paper.id}?from=explore`, { waitUntil: "networkidle" });

  const continuationGapMetrics = await page.locator(".workspace-paper-page").evaluateAll((pages) =>
    pages.slice(0, -1).map((page, index) => {
      const nextPage = pages[index + 1] as HTMLElement | undefined;
      const body = page.querySelector<HTMLElement>(".workspace-paper-body");
      const sections = [...page.querySelectorAll<HTMLElement>(".workspace-paper-section")];
      const nextFirstSection = nextPage?.querySelector<HTMLElement>(".workspace-paper-section");

      if (!nextPage || !body || sections.length === 0 || !nextFirstSection) {
        return null;
      }

      const lastSection = sections.at(-1);

      if (!lastSection) {
        return null;
      }

      const bodyRect = body.getBoundingClientRect();
      const lastSectionRect = lastSection.getBoundingClientRect();
      const nextFirstSectionRect = nextFirstSection.getBoundingClientRect();
      const nextFirstParagraphRect = nextFirstSection
        .querySelector<HTMLElement>(".workspace-paper-paragraph")
        ?.getBoundingClientRect();

      return {
        pageNumber: Number(page.dataset.pageNumber ?? index + 1),
        remainingGap: bodyRect.bottom - lastSectionRect.bottom,
        nextFirstParagraphHeight: nextFirstParagraphRect?.height,
        nextSectionHeight: nextFirstSectionRect.height,
      };
    }),
  );

  const resolvedGapMetrics = continuationGapMetrics.filter(
    (entry): entry is NonNullable<typeof entry> => Boolean(entry),
  );

  expect(resolvedGapMetrics.length).toBeGreaterThan(1);

  for (const metrics of resolvedGapMetrics) {
    expect(metrics.remainingGap).toBeLessThan(
      (metrics.nextFirstParagraphHeight ?? metrics.nextSectionHeight) + 28,
    );
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
