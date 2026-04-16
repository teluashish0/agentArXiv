import { compile, type TopLevelSpec } from "vega-lite";
import { parse, View } from "vega";

export type DiagramTemplate = "architecture" | "pipeline" | "comparison";
export type ChartTemplate = "benchmark_bar" | "ablation_bar";
export type TableTemplate = "benchmark" | "dataset_summary" | "ablation" | "taxonomy";

export type DiagramAssetInput = {
  assetType: "diagram";
  title: string;
  template?: DiagramTemplate;
  nodes: string[];
  edges: Array<{ from: string; to: string; label?: string }>;
};

export type ChartAssetInput = {
  assetType: "chart";
  title: string;
  template?: ChartTemplate;
  data: Array<{ label: string; value: number }>;
  xLabel?: string;
  yLabel?: string;
};

export type TableAssetInput = {
  assetType: "table";
  title: string;
  template?: TableTemplate;
  headers: string[];
  rows: string[][];
};

export type ManuscriptAssetInput =
  | DiagramAssetInput
  | ChartAssetInput
  | TableAssetInput;

const paperFigurePalette = {
  background: "#fffdfa",
  border: "#d8cdbf",
  text: "#201a15",
  muted: "#6d655c",
  grid: "#d8d0c5",
  blue: "#4c72b0",
  teal: "#55a868",
  orange: "#dd8452",
  red: "#c44e52",
  purple: "#8172b2",
  gold: "#ccb974",
} as const;

const paperChartColors = [
  paperFigurePalette.blue,
  paperFigurePalette.teal,
  paperFigurePalette.orange,
  paperFigurePalette.red,
  paperFigurePalette.purple,
  paperFigurePalette.gold,
];

const d2ThemeByTemplate: Record<DiagramTemplate, number> = {
  architecture: 0,
  pipeline: 0,
  comparison: 0,
};

async function instantiateD2() {
  const { D2 } = await import("@terrastruct/d2");

  return new D2();
}

let d2SingletonPromise: ReturnType<typeof instantiateD2> | undefined;

function getD2() {
  if (!d2SingletonPromise) {
    d2SingletonPromise = instantiateD2();
  }

  return d2SingletonPromise;
}

function normalizeIdentifier(value: string, index: number) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized.length > 0 ? normalized : `node_${index + 1}`;
}

function escapeD2Label(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", '\\"');
}

function svgToDataUri(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function inferDiagramTemplate(title: string): DiagramTemplate {
  const normalized = title.toLowerCase();

  if (/(comparison|versus|vs\.?)/.test(normalized)) {
    return "comparison";
  }

  if (/(pipeline|loop|workflow)/.test(normalized)) {
    return "pipeline";
  }

  return "architecture";
}

function inferChartTemplate(title: string): ChartTemplate {
  return /(ablation|failure|breakdown)/i.test(title) ? "ablation_bar" : "benchmark_bar";
}

function inferTableTemplate(title: string): TableTemplate {
  const normalized = title.toLowerCase();

  if (/(dataset|setup|materials|protocol)/.test(normalized)) {
    return "dataset_summary";
  }

  if (/(ablation|failure|sensitivity)/.test(normalized)) {
    return "ablation";
  }

  if (/(related work|motivation|taxonomy|comparison)/.test(normalized)) {
    return "taxonomy";
  }

  return "benchmark";
}

function normalizeTableCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function isNumericTableCell(value: string) {
  return /^[-+]?[\d.,]+(?:%|x)?$/i.test(value.trim());
}

function formatChartValue(value: number) {
  if (Number.isInteger(value)) {
    return String(value);
  }

  if (Math.abs(value) >= 10) {
    return value.toFixed(1).replace(/\.0$/, "");
  }

  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function chooseChartOrientation(data: Array<{ label: string; value: number }>) {
  const longestLabel = data.reduce(
    (maxLength, datum) => Math.max(maxLength, datum.label.trim().length),
    0,
  );

  return longestLabel > 18 || data.length > 5 ? "horizontal" : "vertical";
}

function buildDiagramDsl(input: Omit<DiagramAssetInput, "assetType">) {
  const template = input.template ?? inferDiagramTemplate(input.title);
  const direction = template === "comparison" ? "down" : "right";
  const layout = template === "architecture" ? "elk" : "dagre";
  const accent =
    template === "pipeline"
      ? paperFigurePalette.teal
      : template === "comparison"
        ? paperFigurePalette.purple
        : paperFigurePalette.blue;
  const nodeFill =
    template === "comparison" ? "#f4effa" : template === "pipeline" ? "#edf7f1" : "#eef3ff";
  const ids = input.nodes.map((node, index) => ({
    id: normalizeIdentifier(node, index),
    label: node.trim(),
  }));
  const idsByLabel = new Map(ids.map((entry) => [entry.label, entry.id]));
  const nodeBlocks = ids.map(
    (entry) => `
${entry.id}: "${escapeD2Label(entry.label)}" {
  shape: rectangle
  style: {
    fill: "${nodeFill}"
    stroke: "${accent}"
    stroke-width: 2
    border-radius: 14
    font-size: 18
    font-color: "${paperFigurePalette.text}"
    bold: true
  }
}`.trim(),
  );
  const edgeBlocks = input.edges
    .map((edge) => {
      const fromId = idsByLabel.get(edge.from.trim());
      const toId = idsByLabel.get(edge.to.trim());

      if (!fromId || !toId) {
        return "";
      }

      const label = edge.label?.trim()
        ? `: "${escapeD2Label(edge.label.trim())}"`
        : "";

      return `${fromId} -> ${toId}${label} {
  style.stroke: "${accent}"
  style.stroke-width: 2
  style.font-size: 14
  style.font-color: "${paperFigurePalette.muted}"
}`;
    })
    .filter(Boolean);

  return `
direction: ${direction}
style: {
  fill: "${paperFigurePalette.background}"
  stroke: "${paperFigurePalette.border}"
  stroke-width: 1
}

${nodeBlocks.join("\n\n")}

${edgeBlocks.join("\n\n")}
`.trim();
}

async function renderDiagramSvg(input: Omit<DiagramAssetInput, "assetType">) {
  const template = input.template ?? inferDiagramTemplate(input.title);
  const d2 = await getD2();
  const compiled = await d2.compile(buildDiagramDsl(input), {
    inputPath: "index.d2",
    options: {
      layout: template === "architecture" ? "elk" : "dagre",
      themeID: d2ThemeByTemplate[template],
      pad: 32,
      scale: 1,
    },
  });

  return d2.render(compiled.diagram, compiled.renderOptions);
}

function buildVegaLiteSpec(input: Omit<ChartAssetInput, "assetType">): TopLevelSpec {
  const template = input.template ?? inferChartTemplate(input.title);
  const orientation = chooseChartOrientation(input.data);
  const colorRange =
    template === "ablation_bar"
      ? [
          paperFigurePalette.orange,
          paperFigurePalette.red,
          paperFigurePalette.gold,
          paperFigurePalette.purple,
          paperFigurePalette.blue,
        ]
      : paperChartColors;
  const commonConfig = {
    background: paperFigurePalette.background,
    padding: { left: 18, right: 18, top: 18, bottom: 18 },
    view: {
      stroke: paperFigurePalette.border,
      strokeWidth: 1.2,
      cornerRadius: 18,
    },
    axis: {
      domainColor: paperFigurePalette.text,
      domainWidth: 1.4,
      grid: true,
      gridColor: paperFigurePalette.grid,
      gridWidth: 1,
      labelColor: paperFigurePalette.muted,
      labelFont: "Helvetica",
      labelFontSize: 12,
      labelLimit: orientation === "horizontal" ? 180 : 120,
      tickColor: paperFigurePalette.text,
      titleColor: paperFigurePalette.muted,
      titleFont: "Helvetica",
      titleFontSize: 13,
      titleFontWeight: "normal",
    },
  } satisfies TopLevelSpec["config"];

  if (orientation === "horizontal") {
    return {
      $schema: "https://vega.github.io/schema/vega-lite/v6.json",
      width: 700,
      height: Math.max(240, input.data.length * 52),
      config: commonConfig,
      data: { values: input.data },
      layer: [
        {
          mark: {
            type: "bar",
            cornerRadiusEnd: 5,
          },
          encoding: {
            y: {
              field: "label",
              type: "nominal",
              sort: null,
              title: null,
            },
            x: {
              field: "value",
              type: "quantitative",
              title: input.yLabel ?? input.xLabel ?? undefined,
            },
            color: {
              field: "label",
              type: "nominal",
              legend: null,
              scale: { range: colorRange },
            },
          },
        },
        {
          mark: {
            type: "text",
            align: "left",
            baseline: "middle",
            dx: 8,
            font: "Helvetica",
            fontSize: 12,
            color: paperFigurePalette.text,
          },
          encoding: {
            y: {
              field: "label",
              type: "nominal",
              sort: null,
            },
            x: {
              field: "value",
              type: "quantitative",
            },
            text: {
              field: "value",
              type: "quantitative",
              format: "~g",
            },
          },
        },
      ],
    };
  }

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    width: 640,
    height: 340,
    config: commonConfig,
    data: { values: input.data },
    layer: [
      {
        mark: {
          type: "bar",
          cornerRadiusTopLeft: 5,
          cornerRadiusTopRight: 5,
        },
        encoding: {
          x: {
            field: "label",
            type: "nominal",
            sort: null,
            axis: {
              labelAngle: 0,
              labelLineHeight: 15,
            },
            title: input.xLabel ?? undefined,
          },
          y: {
            field: "value",
            type: "quantitative",
            title: input.yLabel ?? undefined,
          },
          color: {
            field: "label",
            type: "nominal",
            legend: null,
            scale: { range: colorRange },
          },
        },
      },
      {
        mark: {
          type: "text",
          dy: -8,
          font: "Helvetica",
          fontSize: 12,
          color: paperFigurePalette.text,
        },
        encoding: {
          x: {
            field: "label",
            type: "nominal",
            sort: null,
          },
          y: {
            field: "value",
            type: "quantitative",
          },
          text: {
            field: "value",
            type: "quantitative",
            format: "~g",
          },
        },
      },
    ],
  };
}

async function renderChartSvg(input: Omit<ChartAssetInput, "assetType">) {
  const spec = buildVegaLiteSpec(input);
  const compiled = compile(spec).spec;
  const runtime = parse(compiled);
  const view = new View(runtime, {
    renderer: "none",
  });

  try {
    return await view.toSVG();
  } finally {
    view.finalize();
  }
}

function renderMarkdownTable(input: Omit<TableAssetInput, "assetType">) {
  const template = input.template ?? inferTableTemplate(input.title);
  const normalizedHeaders = input.headers.map((header) => normalizeTableCell(header));
  const normalizedRows = input.rows.map((row) =>
    normalizedHeaders.map((_, index) => normalizeTableCell(row[index] ?? "")),
  );
  const separatorLine = `| ${normalizedHeaders
    .map((_, index) => {
      const columnValues = normalizedRows
        .map((row) => row[index])
        .filter((value): value is string => Boolean(value && value.length > 0));
      const numericColumn =
        columnValues.length > 0 && columnValues.every((value) => isNumericTableCell(value));

      if (template === "taxonomy") {
        return ":---";
      }

      return numericColumn ? "---:" : ":---";
    })
    .join(" | ")} |`;
  const headerLine = `| ${normalizedHeaders.join(" | ")} |`;
  const rowLines = input.rows.map((row) => {
    const padded = normalizedHeaders.map((_, index) =>
      normalizeTableCell(row[index] ?? ""),
    );
    return `| ${padded.join(" | ")} |`;
  });

  return [headerLine, separatorLine, ...rowLines].join("\n");
}

export async function renderManuscriptAsset(input: ManuscriptAssetInput) {
  if (input.assetType === "diagram") {
    return svgToDataUri(
      await renderDiagramSvg({
        title: input.title,
        template: input.template,
        nodes: input.nodes,
        edges: input.edges,
      }),
    );
  }

  if (input.assetType === "chart") {
    return svgToDataUri(
      await renderChartSvg({
        title: input.title,
        template: input.template,
        data: input.data,
        xLabel: input.xLabel,
        yLabel: input.yLabel,
      }),
    );
  }

  return renderMarkdownTable({
    title: input.title,
    template: input.template,
    headers: input.headers,
    rows: input.rows,
  });
}

export function getArtifactEngineSummary() {
  return {
    diagram: {
      engine: "d2",
      source: "https://github.com/terrastruct/d2",
      license: "MPL-2.0",
    },
    chart: {
      engine: "vega-lite",
      source: "https://github.com/vega/vega-lite",
      license: "BSD-3-Clause",
    },
    table: {
      engine: "markdown-table",
      source: "internal",
      license: "internal",
    },
  } as const;
}

export function formatNumericArtifactValue(value: number) {
  return formatChartValue(value);
}
