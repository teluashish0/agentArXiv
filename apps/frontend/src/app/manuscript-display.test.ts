import { describe, expect, it } from "vitest";

import { normalizeManuscriptTextForDisplay } from "./manuscript-display";

describe("normalizeManuscriptTextForDisplay", () => {
  it("drops a duplicate top-level section heading and strips bold markers", () => {
    const input = [
      "## Results",
      "",
      "At **n=25**, **RandomForestRegressor** ranked first with **MAE** 50.86.",
    ].join("\n");

    expect(normalizeManuscriptTextForDisplay(input, "Results")).toBe(
      "At n=25, RandomForestRegressor ranked first with MAE 50.86.",
    );
  });

  it("turns nested markdown headings into standalone display paragraphs", () => {
    const input = [
      "### Overall ranking by training subset size",
      "Using the notebook's predefined rule, the best model varied with sample size.",
    ].join("\n");

    expect(normalizeManuscriptTextForDisplay(input, "Results")).toBe(
      [
        "Overall ranking by training subset size",
        "",
        "Using the notebook's predefined rule, the best model varied with sample size.",
      ].join("\n"),
    );
  });

  it("preserves math delimiters while normalizing headings and markdown markers", () => {
    const input = [
      "## Objective",
      "",
      "We minimize **$L(\\theta)$** before the update.",
      "",
      "$$\\theta_{t+1}=\\theta_t-\\eta \\nabla L(\\theta_t)$$",
    ].join("\n");

    expect(normalizeManuscriptTextForDisplay(input, "Objective")).toBe(
      [
        "We minimize $L(\\theta)$ before the update.",
        "",
        "$$\\theta_{t+1}=\\theta_t-\\eta \\nabla L(\\theta_t)$$",
      ].join("\n"),
    );
  });
});
