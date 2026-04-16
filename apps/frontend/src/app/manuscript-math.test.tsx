import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  estimateManuscriptParagraphLineCount,
  ManuscriptRichText,
  splitManuscriptMath,
} from "./manuscript-math";

describe("splitManuscriptMath", () => {
  it("extracts inline and display math with standard delimiters", () => {
    expect(
      splitManuscriptMath(
        "We minimize $L(\\theta)$ and then solve $$\\theta_{t+1}=\\theta_t-\\eta\\nabla L(\\theta_t)$$.",
      ),
    ).toEqual([
      { kind: "text", value: "We minimize " },
      { kind: "math", value: "L(\\theta)", display: false },
      { kind: "text", value: " and then solve " },
      {
        kind: "math",
        value: "\\theta_{t+1}=\\theta_t-\\eta\\nabla L(\\theta_t)",
        display: true,
      },
      { kind: "text", value: "." },
    ]);
  });

  it("leaves unmatched dollar signs as text", () => {
    expect(splitManuscriptMath("Budget stays under $500 for the pilot run.")).toEqual([
      { kind: "text", value: "Budget stays under $500 for the pilot run." },
    ]);
  });
});

describe("ManuscriptRichText", () => {
  it("renders KaTeX markup for inline and display equations", () => {
    const html = renderToStaticMarkup(
      <div>
        <ManuscriptRichText text={"We minimize $L(\\theta)$ before $$E=mc^2$$."} />
      </div>,
    );

    expect(html).toContain("katex");
    expect(html).toContain("katex-display");
    expect(html).toContain("We minimize");
  });

  it("renders equation environments in display mode", () => {
    const html = renderToStaticMarkup(
      <div>
        <ManuscriptRichText
          text={"\\begin{equation}p(y\\mid x)=\\sum_z p(y\\mid z)p(z\\mid x)\\end{equation}"}
        />
      </div>,
    );

    expect(html).toContain("katex-display");
    expect(html).toContain("workspace-paper-math");
  });
});

describe("estimateManuscriptParagraphLineCount", () => {
  it("counts display equations as additional block lines", () => {
    const proseOnly = estimateManuscriptParagraphLineCount("We optimize the objective.", 48);
    const withDisplayMath = estimateManuscriptParagraphLineCount(
      "We optimize the objective. $$\\mathcal{L}=\\sum_i (y_i-\\hat{y}_i)^2$$",
      48,
    );

    expect(withDisplayMath).toBeGreaterThan(proseOnly);
  });
});
