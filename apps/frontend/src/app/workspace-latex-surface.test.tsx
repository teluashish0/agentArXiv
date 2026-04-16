import { describe, expect, it } from "vitest";

import type { WorkspaceLatexDocument } from "./workspace-paper-data";
import { buildRenderedLatexDocument } from "./workspace-latex-surface";

function makeLongParagraph() {
  return "This benchmark paragraph is intentionally long so the rendered document paginates across multiple pages. ".repeat(
    18,
  ).trim();
}

describe("buildRenderedLatexDocument asset captions", () => {
  it("numbers tables and figures independently across paginated section fragments", () => {
    const document: WorkspaceLatexDocument = {
      id: "draft",
      title: "Draft",
      templateId: "arxiv-labs-template",
      paperTitle: "Caption Regression Test",
      authors: [],
      abstractText: "",
      keywords: [],
      references: [],
      sectionOrder: ["results"],
      preambleLines: [],
      closingLines: [],
      sections: [
        {
          id: "results",
          slotId: "results",
          title: "Results",
          role: "writing",
          heading: "\\section{Results}",
          initialText: Array.from({ length: 22 }, makeLongParagraph).join("\n\n"),
          targetText: "",
          startDelay: 0,
          stepEvery: 1,
          assets: [
            {
              id: "asset_table",
              title: "Benchmark summary",
              type: "table",
              content: [
                "| Model | MAE | R^2 |",
                "| --- | ---: | ---: |",
                "| Ridge | 46.51 | 0.43 |",
                "| Lasso | 46.92 | 0.42 |",
              ].join("\n"),
            },
            {
              id: "asset_chart",
              title: "Best observed MAE by training subset size",
              type: "chart",
              content: "data:image/png;base64,abc123",
            },
            {
              id: "asset_figure",
              title: "Sandbox benchmark visualization from notebook execution",
              type: "figure",
              content: "data:image/png;base64,xyz789",
            },
          ],
        },
      ],
    };

    const rendered = buildRenderedLatexDocument(document, [], "paper", 0);
    const captionSequence = rendered.pages
      .flatMap((page) => page.sections)
      .filter((section) => section.id === "results")
      .flatMap((section) =>
        section.assets.map((asset) => `${asset.captionLabel} ${asset.captionNumber}`),
      );

    expect(captionSequence).toEqual(["Table 1", "Figure 1", "Figure 2"]);
  });
});
