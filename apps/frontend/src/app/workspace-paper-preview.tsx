"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ExplorePaperWorkspacePreview } from "./paper-view-model";
import { ManuscriptRichText } from "./manuscript-math";
import { buildRenderedLatexDocument } from "./workspace-latex-surface";
import { workspacePaperTemplates } from "./workspace-paper-data";

type WorkspacePaperPreviewProps = {
  preview: ExplorePaperWorkspacePreview;
  title: string;
  className: string;
};

type RenderedPreviewDocument = ReturnType<typeof buildRenderedLatexDocument>;
type RenderedPreviewSection = RenderedPreviewDocument["pages"][number]["sections"][number];
type RenderedPreviewAsset = RenderedPreviewSection["assets"][number];

const WORKSPACE_PREVIEW_PAGE_WIDTH_PX = 8.5 * 96;

function buildPreviewAffiliations(authors: RenderedPreviewDocument["authors"]) {
  const affiliationIndex = new Map<string, number>();
  const affiliations: Array<{ index: number; label: string }> = [];

  for (const author of authors) {
    const label = [author.affiliation, author.location].filter(Boolean).join(", ");

    if (!label || affiliationIndex.has(label)) {
      continue;
    }

    const nextIndex = affiliations.length + 1;
    affiliationIndex.set(label, nextIndex);
    affiliations.push({
      index: nextIndex,
      label,
    });
  }

  return {
    affiliations,
    getAuthorAffiliationIndex(author: RenderedPreviewDocument["authors"][number]) {
      const label = [author.affiliation, author.location].filter(Boolean).join(", ");
      return label ? affiliationIndex.get(label) : undefined;
    },
  };
}

function getPaperPreviewStyle(
  renderedDocument: RenderedPreviewDocument,
  scale: number,
): CSSProperties {
  const template = workspacePaperTemplates[renderedDocument.templateId];

  return {
    "--workspace-paper-page-width": template.typography.pageWidth,
    "--workspace-paper-header-padding": template.typography.headerPadding,
    "--workspace-paper-header-gap": template.typography.headerGap,
    "--workspace-paper-title-size": template.typography.titleSize,
    "--workspace-paper-title-line-height": template.typography.titleLineHeight,
    "--workspace-paper-author-name-size": template.typography.authorNameSize,
    "--workspace-paper-author-meta-size": template.typography.authorMetaSize,
    "--workspace-paper-author-block-gap": template.typography.authorBlockGap,
    "--workspace-paper-affiliation-gap": template.typography.affiliationGap,
    "--workspace-paper-correspondence-spacing": template.typography.correspondenceSpacing,
    "--workspace-paper-frontmatter-padding": template.typography.frontMatterPadding,
    "--workspace-paper-abstract-padding": template.typography.abstractPadding,
    "--workspace-paper-abstract-heading-size": template.typography.abstractHeadingSize,
    "--workspace-paper-abstract-heading-spacing": template.typography.abstractHeadingSpacing,
    "--workspace-paper-abstract-text-size": template.typography.abstractTextSize,
    "--workspace-paper-abstract-text-line-height": template.typography.abstractTextLineHeight,
    "--workspace-paper-keywords-size": template.typography.keywordsSize,
    "--workspace-paper-keywords-spacing": template.typography.keywordsSpacing,
    "--workspace-paper-body-padding": template.typography.bodyPadding,
    "--workspace-paper-continuation-body-padding": template.typography.continuationBodyPadding,
    "--workspace-paper-section-spacing": template.typography.sectionSpacing,
    "--workspace-paper-section-title-size": template.typography.sectionTitleSize,
    "--workspace-paper-section-title-line-height": template.typography.sectionTitleLineHeight,
    "--workspace-paper-section-title-spacing": template.typography.sectionTitleSpacing,
    "--workspace-paper-paragraph-size": template.typography.paragraphSize,
    "--workspace-paper-paragraph-line-height": template.typography.paragraphLineHeight,
    "--workspace-paper-paragraph-spacing": template.typography.paragraphSpacing,
    "--workspace-paper-reference-size": template.typography.referenceSize,
    "--workspace-paper-reference-line-height": template.typography.referenceLineHeight,
    "--workspace-paper-reference-spacing": template.typography.referenceSpacing,
    "--workspace-paper-page-number-offset": template.typography.pageNumberOffset,
    "--workspace-paper-scale": String(scale),
  } as CSSProperties;
}

function renderPreviewAsset(
  asset: RenderedPreviewAsset,
  sectionNumber: number,
  index: number,
) {
  const label = `${asset.captionLabel} ${sectionNumber}.${asset.captionNumber}`;

  if (asset.kind === "image") {
    return (
      <figure className="workspace-paper-figure" key={`${asset.id}-${index}`}>
        <img alt={asset.title} className="workspace-paper-figure-image" src={asset.src} />
        <figcaption className="workspace-paper-asset-caption">
          <strong>{label}.</strong> {asset.title}
        </figcaption>
      </figure>
    );
  }

  if (asset.kind === "table") {
    const numericColumnFlags = asset.headers.map((_, columnIndex) => {
      const columnValues = asset.rows
        .map((row) => row[columnIndex] ?? "")
        .map((value) => value.trim())
        .filter(Boolean);

      return (
        columnValues.length > 0 &&
        columnValues.every((value) =>
          /^[-+]?(\d+(\.\d+)?|\.\d+)$/.test(
            value.replace(/\u2212/g, "-").replace(/[%,$]/g, "").replace(/,/g, "").trim(),
          ),
        )
      );
    });

    return (
      <div className="workspace-paper-table-block" key={`${asset.id}-${index}`}>
        <p className="workspace-paper-asset-caption">
          <strong>{label}.</strong> {asset.title}
        </p>
        <table className="workspace-paper-table">
          <thead>
            <tr>
              {asset.headers.map((header, headerIndex) => (
                <th
                  className={numericColumnFlags[headerIndex] ? "is-numeric" : undefined}
                  key={`${asset.id}-${header}`}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {asset.rows.map((row, rowIndex) => (
              <tr key={`${asset.id}-row-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <td
                    className={numericColumnFlags[cellIndex] ? "is-numeric" : undefined}
                    key={`${asset.id}-row-${rowIndex}-cell-${cellIndex}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="workspace-paper-text-asset" key={`${asset.id}-${index}`}>
      <pre>{asset.text}</pre>
      <p className="workspace-paper-asset-caption">
        <strong>{label}.</strong> {asset.title}
      </p>
    </div>
  );
}

export function WorkspacePaperPreview({
  preview,
  title,
  className,
}: WorkspacePaperPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.42);
  const renderedDocument = buildRenderedLatexDocument(preview.draftDocument, preview.agents, "draft", 0);
  const firstPage = renderedDocument.pages[0];
  const paperStyle = getPaperPreviewStyle(renderedDocument, scale);
  const { affiliations, getAuthorAffiliationIndex } = buildPreviewAffiliations(renderedDocument.authors);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const updateScale = () => {
      const availableWidth = Math.max(220, container.clientWidth - 2);
      const nextScale = Math.max(
        0.27,
        Math.min(1, Number((availableWidth / WORKSPACE_PREVIEW_PAGE_WIDTH_PX).toFixed(3))),
      );

      setScale(nextScale);
    };

    updateScale();

    const resizeObserver = new ResizeObserver(updateScale);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  if (!firstPage) {
    return null;
  }

  return (
    <div
      aria-label={`Preview of the first page of ${title}`}
      className={className}
      ref={containerRef}
      style={paperStyle}
    >
      <div className="workspace-paper-page-shell">
        <article className="workspace-paper-page" data-page-number={firstPage.number}>
          {firstPage.includeHeader ? (
            <header className="workspace-paper-header" data-page-number={firstPage.number} data-line-number={1}>
              <h2 className="workspace-paper-title">{renderedDocument.paperTitle}</h2>

              <div className="workspace-paper-authors">
                <p className="workspace-paper-author-line">
                  {renderedDocument.authors.map((author, authorIndex) => {
                    const affiliationIndex = getAuthorAffiliationIndex(author);

                    return (
                      <span key={author.id}>
                        {authorIndex > 0 ? ", " : ""}
                        <span>{author.name}</span>
                        {affiliationIndex ? <sup>{affiliationIndex}</sup> : null}
                      </span>
                    );
                  })}
                </p>

                {affiliations.length > 0 ? (
                  <div className="workspace-paper-affiliations">
                    {affiliations.map((affiliation) => (
                      <p className="workspace-paper-affiliation-line" key={affiliation.index}>
                        <sup>{affiliation.index}</sup>
                        <span>{affiliation.label}</span>
                      </p>
                    ))}
                  </div>
                ) : null}

                {renderedDocument.authors.some((author) => author.email) ? (
                  <p className="workspace-paper-correspondence">
                    Correspondence:{" "}
                    {renderedDocument.authors
                      .map((author) => author.email)
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                ) : null}
              </div>
            </header>
          ) : null}

          {firstPage.includeFrontmatter && renderedDocument.abstractText ? (
            <section className="workspace-paper-frontmatter" data-page-number={firstPage.number} data-line-number={1}>
              {workspacePaperTemplates[renderedDocument.templateId].frontMatterStyle === "ieee" ? (
                <p className="workspace-paper-abstract workspace-paper-abstract-inline">
                  <strong>Abstract</strong>
                  <span>&mdash;</span>
                  <span>
                    <ManuscriptRichText text={renderedDocument.abstractText} />
                  </span>
                </p>
              ) : (
                <div className="workspace-paper-abstract">
                  <h2>Abstract</h2>
                  <p>
                    <ManuscriptRichText text={renderedDocument.abstractText} />
                  </p>
                </div>
              )}

              {renderedDocument.keywords?.length ? (
                <p className="workspace-paper-keywords">
                  <strong>Keywords:</strong> {renderedDocument.keywords.join(", ")}
                </p>
              ) : null}
            </section>
          ) : null}

          <div
            className={[
              "workspace-paper-body",
              !firstPage.includeHeader && !firstPage.includeFrontmatter ? "is-continuation-page" : "",
              renderedDocument.layoutMode === "single" ? "is-single-column" : "is-double-column",
            ]
              .join(" ")
              .trim()}
          >
            {firstPage.sections.map((section) => (
              <section
                className={[
                  "workspace-paper-section",
                  section.isContinuation ? "is-continuation" : "",
                ]
                  .join(" ")
                  .trim()}
                data-page-number={firstPage.number}
                data-section-id={section.id}
                data-section-title={section.title}
                key={section.fragmentId}
              >
                {section.showHeading ? (
                  <h3 className="workspace-paper-section-title">
                    <span className="workspace-paper-section-number">{section.sectionNumber}.</span>
                    <span>{section.title}</span>
                  </h3>
                ) : null}

                {section.paragraphs.map((paragraph, paragraphIndex) => (
                  <p className="workspace-paper-paragraph" key={`${section.id}-${paragraphIndex}`}>
                    <ManuscriptRichText text={paragraph} />
                  </p>
                ))}

                {section.assets.map((asset, assetIndex) =>
                  renderPreviewAsset(asset, section.sectionNumber, assetIndex),
                )}
              </section>
            ))}

            {firstPage.includeReferences && renderedDocument.references?.length ? (
              <section className="workspace-paper-section workspace-paper-references">
                <h3 className="workspace-paper-section-title">
                  <span className="workspace-paper-section-number">{renderedDocument.sections.length + 1}.</span>
                  <span>References</span>
                </h3>

                <ol className="workspace-paper-reference-list">
                  {renderedDocument.references.map((reference, referenceIndex) => (
                    <li className="workspace-paper-reference-item" key={`${renderedDocument.title}-ref-${referenceIndex}`}>
                      {reference}
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </div>

          <footer className="workspace-paper-page-number" aria-hidden="true">
            {firstPage.number}
          </footer>
        </article>
      </div>
    </div>
  );
}
