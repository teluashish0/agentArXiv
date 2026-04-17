#!/usr/bin/env python3
"""Strict diabetes research runtime harness.

This script is intentionally stricter than the repository-backed runtime demos.
It registers two external agents against a target AgentArXiv deployment, persists
all workspace mutations through the authenticated MCP surface, uses the shared
notebook + sandbox execution path for the benchmark, and links the resulting
execution back into the manuscript before publication.

Required environment variables:
  OPENAI_API_KEY
  AGENTARXIV_BASE_URL
  AGENTARXIV_ACCOUNT_TOKEN_A
  AGENTARXIV_ACCOUNT_TOKEN_B

Optional environment variables:
  STRICT_RUNTIME_MODEL               default: gpt-5.4
  STRICT_RUNTIME_TIMEOUT_SECONDS     default: 1800
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, TypeVar
from uuid import uuid4

import httpx
from agents import Agent, Runner
from agents.mcp import MCPServerSse
from pydantic import BaseModel, Field


RESEARCH_TITLE = "Small-Sample Benchmarking of Linear and Tree-Based Models for Diabetes Progression Prediction"
RESEARCH_ABSTRACT = (
    "A collaborative runtime paper that benchmarks linear and tree-based regressors on "
    "small subsamples of the scikit-learn diabetes dataset, with all benchmark claims "
    "grounded in sandbox-backed notebook execution artifacts."
)
RESEARCH_IDEA_SUMMARY = (
    "Measure how linear and tree-based regressors behave when the diabetes regression "
    "dataset is restricted to small training subsets. The paper should separate stable "
    "patterns from noise, report uncertainty across repeated splits, and avoid claiming "
    "broad clinical value from a toy benchmark."
)
RESEARCH_EXPERIMENTAL_LOG = (
    "Use the built-in scikit-learn diabetes dataset, evaluate repeated random subsamples "
    "at 25, 50, and 100 training examples, compare LinearRegression, Ridge, Lasso, "
    "DecisionTreeRegressor, and RandomForestRegressor, and report MAE and R^2."
)
RESEARCH_GUIDELINES = (
    "Keep the paper empirical and sober. The benchmark is a reproducibility exercise for "
    "small-sample model behavior, not a claim about deployable diabetes forecasting."
)
INTERNAL_MANUSCRIPT_GUIDANCE = (
    "Internal manuscript optimization guidance:\n"
    "- Before publish, inspect manuscript readiness and add linked diagrams, charts, tables, "
    "and sandbox-backed evidence when method or evaluation sections would otherwise be text-only.\n"
    "- Link assets to the section they support so they improve manuscript readiness and preview quality.\n"
    "- After sandbox runs, convert outputs into benchmark charts, tables, or concise evidence-backed visuals.\n"
    "- Caption-ready visuals and linked evidence increase manuscript readiness score and public paper quality."
)
PROPOSAL_SECTION_TITLES = [
    "Research Question and Scope",
    "Dataset and Small-Sample Setting",
    "Benchmarking Protocol",
    "Sandbox Execution Plan",
    "Risks and Open Questions",
]
DRAFT_SECTION_TITLES = [
    "Introduction",
    "Dataset and Experimental Setup",
    "Models and Small-Sample Protocol",
    "Results",
    "Discussion",
    "Conclusion",
]
CITATION_CANDIDATES = [
    {
        "key": "efron2004_lars",
        "title": "Least Angle Regression",
        "authors": ["Bradley Efron", "Trevor Hastie", "Iain Johnstone", "Robert Tibshirani"],
        "venue": "Annals of Statistics",
        "year": 2004,
        "abstract": (
            "Introduced the LARS procedure and used the diabetes dataset as a canonical "
            "benchmark regression problem."
        ),
        "tags": ["diabetes dataset", "lasso", "regression"],
        "verified": True,
        "sourceUrl": "https://doi.org/10.1214/009053604000000067",
    },
    {
        "key": "hoerl1970_ridge",
        "title": "Ridge Regression: Biased Estimation for Nonorthogonal Problems",
        "authors": ["Arthur E. Hoerl", "Robert W. Kennard"],
        "venue": "Technometrics",
        "year": 1970,
        "abstract": "Classic ridge regression reference for regularized linear estimation.",
        "tags": ["ridge regression", "linear models"],
        "verified": True,
        "sourceUrl": "https://doi.org/10.1080/00401706.1970.10488634",
    },
    {
        "key": "tibshirani1996_lasso",
        "title": "Regression Shrinkage and Selection via the Lasso",
        "authors": ["Robert Tibshirani"],
        "venue": "Journal of the Royal Statistical Society Series B",
        "year": 1996,
        "abstract": "Foundational lasso reference for sparse linear regression.",
        "tags": ["lasso", "linear models"],
        "verified": True,
        "sourceUrl": "https://doi.org/10.1111/j.2517-6161.1996.tb02080.x",
    },
    {
        "key": "breiman1984_cart",
        "title": "Classification and Regression Trees",
        "authors": ["Leo Breiman", "Jerome Friedman", "Richard Olshen", "Charles Stone"],
        "venue": "Wadsworth",
        "year": 1984,
        "abstract": "Canonical reference for regression trees and split-based models.",
        "tags": ["decision trees", "regression trees"],
        "verified": True,
        "sourceUrl": "https://books.google.com/books?id=JwQx-WOmSyQC",
    },
    {
        "key": "breiman2001_rf",
        "title": "Random Forests",
        "authors": ["Leo Breiman"],
        "venue": "Machine Learning",
        "year": 2001,
        "abstract": "Classic random forest reference covering bagging-based tree ensembles.",
        "tags": ["random forests", "tree ensembles"],
        "verified": True,
        "sourceUrl": "https://doi.org/10.1023/A:1010933404324",
    },
    {
        "key": "pedregosa2011_sklearn",
        "title": "Scikit-learn: Machine Learning in Python",
        "authors": [
            "Fabian Pedregosa",
            "Gael Varoquaux",
            "Alexandre Gramfort",
            "Vincent Michel",
            "Bertrand Thirion",
            "Olivier Grisel",
            "Mathieu Blondel",
            "Peter Prettenhofer",
            "Ron Weiss",
            "Vincent Dubourg",
            "Jake VanderPlas",
            "Alexandre Passos",
            "David Cournapeau",
            "Matthieu Brucher",
            "Matthieu Perrot",
            "Edouard Duchesnay",
        ],
        "venue": "Journal of Machine Learning Research",
        "year": 2011,
        "abstract": "Reference for scikit-learn implementations used in the benchmark.",
        "tags": ["scikit-learn", "software"],
        "verified": True,
        "sourceUrl": "https://jmlr.org/papers/v12/pedregosa11a.html",
    },
]
TERMINAL_EXECUTION_STATUSES = {"completed", "failed", "canceled"}
RESULT_SENTINEL = "RESULT_JSON="


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Set {name} before running the strict runtime harness.")
    return value


BASE_URL = require_env("AGENTARXIV_BASE_URL").rstrip("/")
ACCOUNT_TOKEN_A = require_env("AGENTARXIV_ACCOUNT_TOKEN_A")
ACCOUNT_TOKEN_B = require_env("AGENTARXIV_ACCOUNT_TOKEN_B")
MODEL_NAME = os.environ.get("STRICT_RUNTIME_MODEL", "gpt-5.4").strip() or "gpt-5.4"
STRICT_TIMEOUT_SECONDS = int(os.environ.get("STRICT_RUNTIME_TIMEOUT_SECONDS", "1800"))
RUN_SUFFIX = datetime.now(tz=timezone.utc).strftime("%Y%m%d%H%M%S")
MAX_INLINE_FIGURE_UPLOAD_CHARS = 8_000_000


@dataclass
class RegisteredAgent:
    account_label: str
    agent_id: str
    display_name: str
    api_key: str
    recovery_key: str
    endpoint: str
    accent: str | None = None


class StructuredSection(BaseModel):
    title: str
    content: str = Field(min_length=120)


class ProposalAuthoringOutput(BaseModel):
    sections: list[StructuredSection]
    owner_message: str = Field(min_length=40)
    invite_reasoning: str = Field(min_length=24)
    invite_summary: str = Field(min_length=24)


class CollaboratorAcceptanceOutput(BaseModel):
    acceptance_message: str = Field(min_length=40)


class BenchmarkPlanOutput(BaseModel):
    benchmark_message: str = Field(min_length=40)
    notebook_summary: str = Field(min_length=40)
    protocol_section: str = Field(min_length=300)
    cell_source: str = Field(min_length=300)


class ResultsInterpretationOutput(BaseModel):
    results_message: str = Field(min_length=60)
    results_section: str = Field(min_length=300)
    discussion_points: list[str] = Field(min_length=3)
    showcase_summary: str = Field(min_length=80)


class LeadDraftOutput(BaseModel):
    introduction: str = Field(min_length=300)
    experimental_setup: str = Field(min_length=300)
    discussion: str = Field(min_length=300)
    conclusion: str = Field(min_length=220)


class FormulaRevisionDecisionOutput(BaseModel):
    revise_methods: bool
    rationale: str = Field(min_length=40)
    revised_section: str | None = Field(default=None, min_length=320)


class SectionAssetSelection(BaseModel):
    section_title: str = Field(
        pattern="^(Dataset and Experimental Setup|Models and Small-Sample Protocol|Results)$"
    )
    artifact_titles: list[str] = Field(min_length=1)
    rationale: str = Field(min_length=40)


class AssetSelectionOutput(BaseModel):
    section_assignments: list[SectionAssetSelection] = Field(min_length=2, max_length=3)


class ReviewerOutput(BaseModel):
    summary: str = Field(min_length=24)
    decision: str = Field(pattern="^(accept|request_changes)$")


class SectionRepairOutput(BaseModel):
    content: str = Field(min_length=220)


SECTION_MIN_LENGTHS = {
    "Introduction": 300,
    "Dataset and Experimental Setup": 300,
    "Models and Small-Sample Protocol": 300,
    "Results": 300,
    "Discussion": 300,
    "Conclusion": 220,
}
PLACEHOLDER_SECTION_MARKERS = (
    "see above",
    "formatted as",
    "suitable for direct inclusion",
    "complete draft section",
    "workspace brief",
    "derived from the benchmark payload",
    "described in the workspace brief",
)


def slugify(value: str) -> str:
    lowered = re.sub(r"[^a-z0-9]+", "-", value.lower())
    return lowered.strip("-")


def json_blob(value: Any) -> str:
    return json.dumps(value, indent=2, sort_keys=True)


def log_stage(message: str) -> None:
    timestamp = datetime.now(tz=timezone.utc).strftime("%H:%M:%S")
    print(f"[{timestamp} UTC] {message}", flush=True)


def manuscript_needs_formula_revision(manuscript_status: dict[str, Any]) -> bool:
    recommended_actions = manuscript_status.get("recommendedActions")
    if not isinstance(recommended_actions, list):
        return False
    return any("rendered equation" in str(action).lower() for action in recommended_actions)


def extract_text_payload(result: Any) -> Any:
    content = getattr(result, "content", None)
    if not isinstance(content, list):
        return getattr(result, "structuredContent", None) or {}

    text_parts: list[str] = []
    for item in content:
        item_type = item.get("type") if isinstance(item, dict) else getattr(item, "type", None)
        item_text = item.get("text") if isinstance(item, dict) else getattr(item, "text", None)
        if item_type == "text" and isinstance(item_text, str):
            text_parts.append(item_text)

    text = "\n\n".join(part.strip() for part in text_parts if part.strip()).strip()
    if not text:
        return getattr(result, "structuredContent", None) or {}

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {"raw_text": text}


def normalize_tool_record(payload: Any) -> dict[str, Any]:
    if isinstance(payload, dict) and "id" in payload:
        return payload

    if isinstance(payload, dict):
        for key in ("task", "delegatedTask", "result", "data", "workspace"):
            nested = payload.get(key)
            if isinstance(nested, dict) and "id" in nested:
                return nested

        raw_text = payload.get("raw_text")
        if isinstance(raw_text, str) and raw_text.strip():
            try:
                parsed = json.loads(raw_text)
            except json.JSONDecodeError:
                pass
            else:
                if isinstance(parsed, dict):
                    return normalize_tool_record(parsed)

    raise RuntimeError(f"Tool returned a dict without an id field: {payload!r}")


def make_author(agent: RegisteredAgent) -> dict[str, str]:
    handle = slugify(agent.display_name)
    return {
        "id": agent.agent_id,
        "name": agent.display_name,
        "affiliation": "AgentArXiv",
        "location": "Remote",
        "email": f"{handle}@agentarxiv.local",
    }


def blank_seed_sections(titles: list[str], role: str) -> list[dict[str, Any]]:
    sections: list[dict[str, Any]] = []
    for index, title in enumerate(titles, start=1):
        sections.append(
            {
                "slotId": slugify(title).replace("-", "_"),
                "title": title,
                "role": role,
                "pageHint": index,
                "content": "",
            }
        )
    return sections


def find_section(record: dict[str, Any], title: str, surface: str) -> dict[str, Any]:
    normalized = title.casefold()
    for document in record.get("documents", []):
        if document.get("surface") != surface:
            continue
        for section in document.get("sections", []):
            if str(section.get("title", "")).casefold() == normalized:
                return section
    raise KeyError(f"Section '{title}' not found on {surface}.")


def find_invite(record: dict[str, Any], invite_id: str) -> dict[str, Any]:
    for invite in record.get("invites", []):
        if invite.get("id") == invite_id:
            return invite
    raise KeyError(f"Invite '{invite_id}' not found on workspace record.")


def find_governance_decision(
    record: dict[str, Any],
    *,
    kind: str,
    invite_id: str | None = None,
) -> dict[str, Any]:
    for decision in record.get("governanceDecisions", []):
        if decision.get("kind") != kind:
            continue
        if invite_id is not None:
            target_payload = decision.get("targetPayload") or {}
            if target_payload.get("inviteId") != invite_id:
                continue
        if decision.get("status") == "resolved":
            continue
        return decision
    raise KeyError(f"Open governance decision for kind '{kind}' was not found.")


def execution_result_payload(execution: dict[str, Any], activity: dict[str, Any]) -> dict[str, Any]:
    haystacks: list[str] = []
    for key in ("stdout", "stderr", "resultSummary"):
        value = execution.get(key)
        if isinstance(value, str) and value.strip():
            haystacks.append(value)

    outputs = execution.get("outputs")
    if isinstance(outputs, dict):
        haystacks.extend(
            value for value in outputs.values() if isinstance(value, str) and value.strip()
        )

    cells = (
        activity.get("notebook", {})
        .get("document", {})
        .get("cells", [])
    )
    for cell in cells:
        if cell.get("id") != execution.get("notebookCellId"):
            continue
        for output in cell.get("outputs", []) or []:
            for key in ("text", "traceback"):
                value = output.get(key)
                if isinstance(value, list):
                    haystacks.append("".join(str(part) for part in value))
                elif isinstance(value, str):
                    haystacks.append(value)

    for haystack in haystacks:
        match = re.search(rf"{re.escape(RESULT_SENTINEL)}(\{{.*\}})", haystack, re.DOTALL)
        if not match:
            continue
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            continue

    raise RuntimeError(
        f"Notebook execution {execution.get('id')} did not emit a parseable {RESULT_SENTINEL} payload."
    )


def benchmark_table_rows(result_payload: dict[str, Any]) -> list[list[str]]:
    rows: list[list[str]] = []
    grouped_results = result_payload.get("results", {})
    if isinstance(grouped_results, list):
        for item in grouped_results:
            if not isinstance(item, dict):
                continue
            rows.append(
                [
                    str(item.get("sample_size", "")),
                    str(item.get("model", "")),
                    f"{float(item.get('mae_mean', 0.0)):.3f}",
                    f"{float(item.get('mae_std', 0.0)):.3f}",
                    f"{float(item.get('r2_mean', 0.0)):.3f}",
                    f"{float(item.get('r2_std', 0.0)):.3f}",
                ]
            )
        return rows

    if not isinstance(grouped_results, dict):
        raise RuntimeError(f"Unexpected benchmark results payload: {grouped_results!r}")

    top_level_keys = list(grouped_results.keys())
    if top_level_keys and all(not str(key).isdigit() for key in top_level_keys):
        grouped_by_sample_size: dict[str, list[dict[str, Any]]] = {}
        for model_name, sample_map in grouped_results.items():
            if not isinstance(sample_map, dict):
                continue
            for sample_size, metrics in sample_map.items():
                if not isinstance(metrics, dict):
                    continue
                grouped_by_sample_size.setdefault(str(sample_size), []).append(
                    {
                        "model": str(model_name),
                        **metrics,
                    }
                )
        grouped_results = grouped_by_sample_size

    for sample_size in sorted(grouped_results, key=lambda value: int(str(value))):
        items = grouped_results.get(sample_size)
        if isinstance(items, dict):
            for model_name, metrics in items.items():
                if not isinstance(metrics, dict):
                    continue
                rows.append(
                    [
                        str(sample_size),
                        str(model_name),
                        f"{float(metrics.get('mae_mean', 0.0)):.3f}",
                        f"{float(metrics.get('mae_std', 0.0)):.3f}",
                        f"{float(metrics.get('r2_mean', 0.0)):.3f}",
                        f"{float(metrics.get('r2_std', 0.0)):.3f}",
                    ]
                )
            continue
        if not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            rows.append(
                [
                    str(sample_size),
                    str(item.get("model", "")),
                    f"{float(item.get('mae_mean', 0.0)):.3f}",
                    f"{float(item.get('mae_std', 0.0)):.3f}",
                    f"{float(item.get('r2_mean', 0.0)):.3f}",
                    f"{float(item.get('r2_std', 0.0)):.3f}",
                ]
            )
    return rows


def best_by_sample_size_chart_data(
    result_payload: dict[str, Any],
    *,
    metric: str,
) -> list[dict[str, Any]]:
    best_by_sample_size = result_payload.get("best_by_sample_size", {})
    if not isinstance(best_by_sample_size, dict):
        raise RuntimeError(f"Unexpected best_by_sample_size payload: {best_by_sample_size!r}")

    data: list[dict[str, Any]] = []
    for sample_size in sorted(best_by_sample_size, key=lambda value: int(str(value))):
        item = best_by_sample_size.get(sample_size)
        if not isinstance(item, dict):
            continue
        metric_payload = item.get("metrics") if isinstance(item.get("metrics"), dict) else item
        value = metric_payload.get(metric) if isinstance(metric_payload, dict) else None
        if value is None:
            continue
        data.append(
            {
                "label": f"n={sample_size} {item.get('model', '')}".strip(),
                "value": float(value),
            }
        )
    return data


def dataset_summary_rows(result_payload: dict[str, Any]) -> list[list[str]]:
    dataset = result_payload.get("dataset", {})
    protocol = result_payload.get("protocol", {})
    if not isinstance(dataset, dict) or not isinstance(protocol, dict):
        raise RuntimeError("Benchmark payload is missing dataset/protocol sections.")

    feature_names = dataset.get("feature_names", [])
    if isinstance(feature_names, list):
        feature_summary = ", ".join(str(name) for name in feature_names[:6])
        if len(feature_names) > 6:
            feature_summary = f"{feature_summary}, ..."
    else:
        feature_summary = ""

    return [
        ["Dataset", str(dataset.get("name", "sklearn_diabetes"))],
        ["Samples", str(dataset.get("n_samples", ""))],
        ["Features", str(dataset.get("n_features", ""))],
        ["Feature names", feature_summary],
        [
            "Train subset sizes",
            ", ".join(
                str(value)
                for value in (
                    protocol.get("train_subset_sizes")
                    or protocol.get("train_sizes")
                    or []
                )
            ),
        ],
        ["Repeats per subset", str(protocol.get("n_repeats") or protocol.get("repeats") or "")],
        ["Test size", str(protocol.get("test_size", ""))],
        ["Models", ", ".join(str(model) for model in protocol.get("models", []))],
    ]


def build_protocol_diagram() -> dict[str, Any]:
    nodes = [
        "Sklearn diabetes dataset",
        "Seeded train/test split",
        "Subset downsampling",
        "Linear and tree regressors",
        "MAE and R^2 aggregation",
        "Figures, tables, and manuscript evidence",
    ]
    edges = [
        {"from": nodes[0], "to": nodes[1], "label": "442 samples"},
        {"from": nodes[1], "to": nodes[2], "label": "n=25/50/100"},
        {"from": nodes[2], "to": nodes[3], "label": "30 repeats"},
        {"from": nodes[3], "to": nodes[4], "label": "evaluate"},
        {"from": nodes[4], "to": nodes[5], "label": "link back"},
    ]
    return {"nodes": nodes, "edges": edges}


def notebook_cell_outputs(activity: dict[str, Any], notebook_cell_id: str) -> list[dict[str, Any]]:
    cells = activity.get("notebook", {}).get("document", {}).get("cells", [])
    if not isinstance(cells, list):
        return []
    for cell in cells:
        if cell.get("id") != notebook_cell_id:
            continue
        outputs = cell.get("outputs")
        return outputs if isinstance(outputs, list) else []
    return []


def joined_output_value(value: Any) -> str | None:
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    if isinstance(value, list):
        joined = "".join(str(part) for part in value).strip()
        return joined or None
    return None


def notebook_output_image_data_uri(
    activity: dict[str, Any],
    notebook_cell_id: str,
) -> str | None:
    for output in notebook_cell_outputs(activity, notebook_cell_id):
        data = output.get("data")
        if not isinstance(data, dict):
            continue
        png = joined_output_value(data.get("image/png"))
        if png:
            return f"data:image/png;base64,{re.sub(r'\\s+', '', png)}"
        jpeg = joined_output_value(data.get("image/jpeg"))
        if jpeg:
            return f"data:image/jpeg;base64,{re.sub(r'\\s+', '', jpeg)}"
        svg = joined_output_value(data.get("image/svg+xml"))
        if svg:
            encoded = base64.b64encode(svg.encode("utf-8")).decode("ascii")
            return f"data:image/svg+xml;base64,{encoded}"
    return None


def ensure_visual_benchmark_cell_source(cell_source: str) -> str:
    if "matplotlib" in cell_source.lower() and ".show(" in cell_source.lower():
        return cell_source

    visualization_block = """

# Paper-ready visual summary for the experiments pane and manuscript figure assets.
try:
    import matplotlib.pyplot as plt
except Exception:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "matplotlib"])
    import matplotlib.pyplot as plt
from io import StringIO
from IPython.display import SVG, display

chart_records = []
for sample_size_label, rows in payload["results"].items():
    for row in rows:
        chart_records.append(
            {
                "sample_size_label": str(sample_size_label),
                "model": row["model"],
                "mae_mean": row["mae_mean"],
                "r2_mean": row["r2_mean"],
            }
        )

plot_df = pd.DataFrame(chart_records)
sample_order = [str(size) for size in payload["protocol"]["train_subset_sizes"]]
model_order = list(payload["protocol"]["models"])
mae_pivot = (
    plot_df.pivot(index="sample_size_label", columns="model", values="mae_mean")
    .reindex(index=sample_order, columns=model_order)
)
r2_pivot = (
    plot_df.pivot(index="sample_size_label", columns="model", values="r2_mean")
    .reindex(index=sample_order, columns=model_order)
)

fig, axes = plt.subplots(1, 2, figsize=(14, 5.2), constrained_layout=True)
mae_pivot.plot(kind="bar", ax=axes[0], rot=0)
axes[0].set_title("Mean MAE by training subset size")
axes[0].set_xlabel("Training subset size")
axes[0].set_ylabel("Mean MAE")
axes[0].grid(axis="y", alpha=0.25)

r2_pivot.plot(kind="bar", ax=axes[1], rot=0)
axes[1].set_title("Mean R^2 by training subset size")
axes[1].set_xlabel("Training subset size")
axes[1].set_ylabel("Mean R^2")
axes[1].grid(axis="y", alpha=0.25)

for axis in axes:
    axis.legend(title="Model", fontsize=8, title_fontsize=9, frameon=False)

svg_buffer = StringIO()
fig.savefig(svg_buffer, format="svg", bbox_inches="tight")
display(SVG(svg_buffer.getvalue()))
plt.close(fig)
""".strip("\n")

    match = re.search(
        rf"(?P<indent>^[ \t]*)print\(\"{re.escape(RESULT_SENTINEL)}\" \+ json\.dumps\(payload.*$",
        cell_source,
        re.MULTILINE,
    )
    if match:
        start = match.start()
        return (
            cell_source[:start].rstrip()
            + "\n\n"
            + visualization_block
            + "\n\n"
            + cell_source[start:].lstrip()
        )

    return cell_source.rstrip() + "\n\n" + visualization_block + "\n"


OutputModelT = TypeVar("OutputModelT", bound=BaseModel)


async def run_structured_agent(
    *,
    name: str,
    instructions: str,
    prompt: str,
    output_type: type[OutputModelT],
) -> OutputModelT:
    agent = Agent(
        name=name,
        instructions=instructions,
        model=MODEL_NAME,
        output_type=output_type,
    )
    result = await Runner.run(agent, prompt, max_turns=6)
    return result.final_output_as(output_type, raise_if_incorrect_type=True)


def section_quality_issues(section_title: str, content: str) -> list[str]:
    normalized = re.sub(r"\s+", " ", content.strip())
    issues: list[str] = []
    minimum_length = SECTION_MIN_LENGTHS.get(section_title, 220)

    if len(normalized) < minimum_length:
        issues.append(f"content is shorter than {minimum_length} characters")

    lower = normalized.lower()
    for marker in PLACEHOLDER_SECTION_MARKERS:
        if marker in lower:
            issues.append(f"contains placeholder phrase '{marker}'")

    sentences = [item.strip() for item in re.split(r"[.!?]+", normalized) if len(item.strip()) >= 20]
    minimum_sentences = 3 if section_title == "Conclusion" else 4
    if len(sentences) < minimum_sentences:
        issues.append(f"contains fewer than {minimum_sentences} substantive sentences")

    return issues


def repair_requirements_for_section(section_title: str) -> list[str]:
    common = [
        "Return only final manuscript prose for the section.",
        "Do not mention formatting instructions, hidden workspace context, or phrases like 'see above' or 'direct inclusion'.",
        "Stay inside the observed benchmark evidence and avoid broader clinical claims.",
    ]

    if section_title == "Dataset and Experimental Setup":
        return common + [
            "State the dataset name, sample count, feature count, held-out test size, train subset sizes, repetition count, compared models, and the sandbox-backed notebook execution path.",
            "Explain why repeated small-sample splits are used and what the setup is intended to measure.",
        ]

    if section_title == "Introduction":
        return common + [
            "Frame the paper as a narrow, reproducible study of small-sample model behavior rather than deployable forecasting.",
        ]

    if section_title == "Discussion":
        return common + [
            "Interpret the observed variance and stability patterns without overstating generality.",
        ]

    if section_title == "Conclusion":
        return common + [
            "Summarize the main takeaways and the limits of the benchmark in concise, publication-ready prose.",
        ]

    return common


async def repair_section_draft(
    *,
    section_title: str,
    current_content: str,
    workspace_brief: dict[str, Any],
    result_payload: dict[str, Any],
    discussion_points: list[str],
    issues: list[str],
) -> str:
    repaired = await run_structured_agent(
        name=f"{slugify(section_title)}-repair",
        instructions=(
            "You rewrite manuscript sections that failed quality control. Produce final paper prose, "
            "ground every concrete claim in the visible benchmark setup or results, and remove any "
            "meta-writing or placeholder language."
        ),
        prompt=(
            f"Rewrite the section '{section_title}' for '{RESEARCH_TITLE}'.\n\n"
            f"Current draft to replace:\n{current_content}\n\n"
            f"Known issues:\n{json_blob(issues)}\n\n"
            f"Workspace brief:\n{json_blob(workspace_brief)}\n\n"
            f"Benchmark payload:\n{json_blob(result_payload)}\n\n"
            f"Discussion points:\n{json_blob(discussion_points)}\n\n"
            f"Requirements:\n{json_blob(repair_requirements_for_section(section_title))}\n"
        ),
        output_type=SectionRepairOutput,
    )
    repaired_content = repaired.content.strip()
    remaining_issues = section_quality_issues(section_title, repaired_content)
    if remaining_issues:
        raise RuntimeError(
            f"Repaired section '{section_title}' still failed validation: {remaining_issues}"
        )
    return repaired_content


async def submit_draft_section(
    *,
    server: MCPServerSse,
    workspace_id: str,
    section: dict[str, Any],
    agent_id: str,
    content: str,
    rationale: str,
    cited_keys: list[str],
    artifact_refs: list[str],
) -> None:
    await call_tool_record(
        server,
        "claim_section",
        {
            "workspaceId": workspace_id,
            "sectionId": section["id"],
            "agentId": agent_id,
        },
    )
    await call_tool_record(
        server,
        "update_live_section_draft",
        {
            "workspaceId": workspace_id,
            "sectionId": section["id"],
            "agentId": agent_id,
            "content": content,
        },
    )
    await call_tool_record(
        server,
        "submit_section_draft",
        {
            "workspaceId": workspace_id,
            "sectionId": section["id"],
            "agentId": agent_id,
            "content": content,
            "rationale": rationale,
            "citedKeys": cited_keys,
            "artifactRefs": artifact_refs,
        },
    )


async def review_section_submission(
    *,
    server: MCPServerSse,
    workspace_id: str,
    section: dict[str, Any],
    reviewer_id: str,
    section_title: str,
    section_text: str,
    result_payload: dict[str, Any],
) -> ReviewerOutput:
    review = await run_structured_agent(
        name="section-reviewer",
        instructions=(
            "You review a manuscript section for realism, grounding, and whether the "
            "claims stay inside the observed benchmark evidence. Accept sections that "
            "are sober and adequately supported."
        ),
        prompt=(
            f"Review the section '{section_title}' for '{RESEARCH_TITLE}'.\n\n"
            f"Section text:\n{section_text}\n\n"
            f"Observed benchmark payload:\n{json_blob(result_payload)}\n"
        ),
        output_type=ReviewerOutput,
    )
    await call_tool_record(
        server,
        "submit_review_feedback",
        {
            "workspaceId": workspace_id,
            "sectionId": section["id"],
            "agentId": reviewer_id,
            "decision": review.decision,
            "summary": review.summary,
        },
    )
    return review


async def register_agent(
    client: httpx.AsyncClient,
    *,
    account_label: str,
    account_token: str,
    display_name: str,
    handle_base: str,
    headline: str,
    research_description: str,
    research_interests: list[str],
    capabilities: list[str],
    preferred_roles: list[str],
    collaboration_intent: str,
) -> RegisteredAgent:
    payload = {
        "displayName": display_name,
        "handle": f"{handle_base}-{RUN_SUFFIX}"[:60],
        "headline": headline,
        "researchDescription": research_description,
        "researchInterests": research_interests,
        "capabilities": capabilities,
        "preferredRoles": preferred_roles,
        "collaborationIntent": collaboration_intent,
        "seedPaperIds": [],
    }
    response = await client.post(
        f"{BASE_URL}/api/agents/register",
        headers={
            "content-type": "application/json",
            "authorization": f"Bearer {account_token}",
        },
        json=payload,
    )
    body = response.json()
    if response.status_code >= 400:
        raise RuntimeError(
            f"Agent registration failed for {display_name} on {account_label}: {body}"
        )

    agent = body["agent"]
    return RegisteredAgent(
        account_label=account_label,
        agent_id=agent["id"],
        display_name=agent["displayName"],
        api_key=body["apiKey"],
        recovery_key=body["recoveryKey"],
        endpoint=body["endpoint"],
        accent=agent.get("avatarAccent"),
    )


async def call_tool_payload(
    server: MCPServerSse,
    name: str,
    arguments: dict[str, Any] | None = None,
) -> Any:
    return extract_text_payload(await server.call_tool(name, arguments or {}))


async def call_tool_record(
    server: MCPServerSse,
    name: str,
    arguments: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = await call_tool_payload(server, name, arguments)
    if not isinstance(payload, dict):
        raise RuntimeError(f"Tool {name} returned a non-dict payload: {payload!r}")
    raw_text = payload.get("raw_text")
    if isinstance(raw_text, str) and raw_text.strip() and set(payload) == {"raw_text"}:
        raise RuntimeError(f"Tool {name} error: {raw_text.strip()}")
    return payload


async def call_tool_entity(
    server: MCPServerSse,
    name: str,
    arguments: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return normalize_tool_record(await call_tool_payload(server, name, arguments))


async def wait_for_execution(
    *,
    server: MCPServerSse,
    workspace_id: str,
    agent_id: str,
    execution_id: str,
    timeout_seconds: int,
) -> tuple[dict[str, Any], dict[str, Any]]:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        activity = await call_tool_record(
            server,
            "list_notebook_activity",
            {"workspaceId": workspace_id, "limit": 20},
        )
        for execution in activity.get("executions", []):
            if execution.get("id") != execution_id:
                continue
            if execution.get("status") in TERMINAL_EXECUTION_STATUSES:
                return activity, execution
        await call_tool_record(
            server,
            "heartbeat_lease",
            {"workspaceId": workspace_id, "agentId": agent_id},
        )
        await asyncio.sleep(10)

    raise TimeoutError(
        f"Sandbox execution {execution_id} did not finish within {timeout_seconds} seconds."
    )


async def main() -> None:
    log_stage("Registering runtime agents against the target deployment.")
    async with httpx.AsyncClient(timeout=60) as client:
        lead = await register_agent(
            client,
            account_label="account_a",
            account_token=ACCOUNT_TOKEN_A,
            display_name="Avery Diabetes Runtime Lead",
            handle_base="avery-diabetes-lead",
            headline="Coordinates reproducible small-sample regression studies.",
            research_description=(
                "Plans benchmark-driven empirical papers, keeps claims tied to observed "
                "runtime evidence, and integrates multi-agent outputs into a sober manuscript."
            ),
            research_interests=["machine learning", "benchmarking", "scientific writing"],
            capabilities=["coordination", "experimental framing", "technical writing"],
            preferred_roles=["coordination", "writing"],
            collaboration_intent=(
                "Own the manuscript thesis, keep the benchmark realistic, and separate "
                "observed patterns from broader claims."
            ),
        )
        benchmarker = await register_agent(
            client,
            account_label="account_b",
            account_token=ACCOUNT_TOKEN_B,
            display_name="Bryn Small-Sample Benchmark Analyst",
            handle_base="bryn-benchmark-analyst",
            headline="Designs and interprets small-sample regression benchmarks.",
            research_description=(
                "Builds benchmark notebooks, checks model sensitivity under limited data, "
                "and writes result sections tied to execution artifacts."
            ),
            research_interests=["small-sample learning", "regression", "sandbox experiments"],
            capabilities=["benchmark design", "notebook execution", "results analysis"],
            preferred_roles=["research", "evaluation"],
            collaboration_intent=(
                "Turn sandbox-backed benchmark outputs into defensible claims about model "
                "behavior under data scarcity."
            ),
        )

    lead_mcp = MCPServerSse(
        {"url": lead.endpoint, "headers": {"Authorization": f"Bearer {lead.api_key}"}},
        cache_tools_list=True,
        client_session_timeout_seconds=300,
        name=f"{lead.display_name} MCP",
    )
    benchmarker_mcp = MCPServerSse(
        {
            "url": benchmarker.endpoint,
            "headers": {"Authorization": f"Bearer {benchmarker.api_key}"},
        },
        cache_tools_list=True,
        client_session_timeout_seconds=300,
        name=f"{benchmarker.display_name} MCP",
    )

    async with lead_mcp, benchmarker_mcp:
        log_stage("Checking sandbox eligibility for both registered agents.")
        lead_eligibility = await call_tool_record(
            lead_mcp,
            "sandbox_get_agent_eligibility",
            {"agentId": lead.agent_id},
        )
        benchmarker_eligibility = await call_tool_record(
            benchmarker_mcp,
            "sandbox_get_agent_eligibility",
            {"agentId": benchmarker.agent_id},
        )
        lead_verified = lead_eligibility.get("sandboxEligibility") == "verified"
        benchmarker_verified = (
            benchmarker_eligibility.get("sandboxEligibility") == "verified"
        )

        if not lead_verified and not benchmarker_verified:
            raise RuntimeError(
                "Neither registered agent is sandbox-verified on this deployment. "
                "A strict benchmark run cannot proceed without at least one verified agent."
            )
        if not benchmarker_verified:
            if lead_verified:
                raise RuntimeError(
                    "The configured benchmark agent is not sandbox-verified, but the lead "
                    "agent is. Re-run the harness with the verified account token assigned "
                    "to AGENTARXIV_ACCOUNT_TOKEN_B so notebook execution is owned by the "
                    "verified collaborator."
                )
            raise RuntimeError(
                "The configured benchmark agent is not sandbox-verified. Assign a verified "
                "account token to AGENTARXIV_ACCOUNT_TOKEN_B before running the strict "
                "benchmark harness."
            )

        log_stage("Authoring proposal-stage content.")
        proposal_output = await run_structured_agent(
            name="proposal-author",
            instructions=(
                "You write proposal-stage manuscript content for an empirical ML benchmark "
                "paper. Produce clear, bounded sections that specify what will be measured, "
                "how sandbox execution is used, and which claims are intentionally out of scope."
            ),
            prompt=(
                f"Write the proposal stage for the paper '{RESEARCH_TITLE}'.\n\n"
                f"Target abstract:\n{RESEARCH_ABSTRACT}\n\n"
                f"Paper idea:\n{RESEARCH_IDEA_SUMMARY}\n\n"
                f"Experimental log:\n{RESEARCH_EXPERIMENTAL_LOG}\n\n"
                f"Generate exactly these proposal sections:\n{json_blob(PROPOSAL_SECTION_TITLES)}\n\n"
                "Also return:\n"
                "- an owner-authored proposal message that summarizes the collaboration plan,\n"
                "- an invite reasoning string,\n"
                "- an invite summary string.\n"
                "Keep the plan realistic, reproducible, and sandbox-backed."
            ),
            output_type=ProposalAuthoringOutput,
        )

        log_stage("Creating workspace and writing proposal sections through MCP.")
        workspace = await call_tool_record(
            lead_mcp,
            "create_workspace",
            {
                "ownerAgentId": lead.agent_id,
                "slug": f"{slugify(RESEARCH_TITLE)}-{RUN_SUFFIX}",
                "title": RESEARCH_TITLE,
                "abstract": RESEARCH_ABSTRACT,
                "venue": "AgentArXiv",
                "ideaSummary": RESEARCH_IDEA_SUMMARY,
                "experimentalLog": RESEARCH_EXPERIMENTAL_LOG,
                "conferenceGuidelines": RESEARCH_GUIDELINES,
                "templateName": "arxiv-labs-template",
                "tags": ["machine-learning", "benchmarking", "diabetes"],
                "desiredRoles": ["coordination", "research", "evaluation"],
                "maxCollaborators": 2,
                "proposal": {
                    "paperTitle": RESEARCH_TITLE,
                    "authors": [make_author(lead), make_author(benchmarker)],
                    "sections": blank_seed_sections(PROPOSAL_SECTION_TITLES, "coordination"),
                },
                "draft": {
                    "paperTitle": RESEARCH_TITLE,
                    "abstractText": RESEARCH_ABSTRACT,
                    "keywords": [
                        "small-sample learning",
                        "regression",
                        "diabetes dataset",
                        "sandbox benchmarking",
                    ],
                    "authors": [make_author(lead), make_author(benchmarker)],
                    "sections": blank_seed_sections(DRAFT_SECTION_TITLES, "writing"),
                },
            },
        )
        workspace_id = workspace["workspace"]["id"]
        log_stage(f"Workspace created: {workspace_id}")
        workspace_record = await call_tool_record(
            lead_mcp,
            "read_workspace_brief",
            {"workspaceId": workspace_id},
        )

        for section in proposal_output.sections:
            proposal_section = find_section(workspace_record, section.title, "proposal")
            await call_tool_record(
                lead_mcp,
                "update_proposal_section",
                {
                    "workspaceId": workspace_id,
                    "sectionId": proposal_section["id"],
                    "agentId": lead.agent_id,
                    "content": section.content,
                },
            )

        await call_tool_record(
            lead_mcp,
            "post_workspace_message",
            {
                "workspaceId": workspace_id,
                "agentId": lead.agent_id,
                "surface": "proposal",
                "content": proposal_output.owner_message,
            },
        )
        log_stage("Inviting collaborator and activating the draft surface.")
        invite = await call_tool_record(
            lead_mcp,
            "send_invite",
            {
                "workspaceId": workspace_id,
                "fromAgentId": lead.agent_id,
                "toAgentId": benchmarker.agent_id,
                "reasoning": proposal_output.invite_reasoning,
                "interestSummary": proposal_output.invite_summary,
                "proposal": {
                    "mode": "collaborate",
                    "title": "Small-sample benchmark collaboration",
                    "summary": proposal_output.invite_summary,
                    "requestedRoles": ["research", "evaluation"],
                    "contributionAreas": [
                        "notebook execution",
                        "small-sample benchmarking",
                        "results analysis",
                    ],
                    "deliverables": [
                        "Run the sandbox-backed diabetes benchmark notebook",
                        "Write the results section from benchmark evidence",
                    ],
                    "linkedPaperIds": [],
                    "questions": [
                        "Which models remain stable under 25-100 training examples?",
                        "Which effects are too noisy to support strong claims?",
                    ],
                },
            },
        )

        collaborator_response = await run_structured_agent(
            name="collaborator-acceptance",
            instructions=(
                "You are accepting a bounded empirical collaboration. Write one concise "
                "proposal-stage message that claims benchmark ownership and states how "
                "you will keep the result grounded in notebook evidence."
            ),
            prompt=(
                f"You are joining the workspace '{RESEARCH_TITLE}'. Write the message you "
                "will post to the proposal surface after accepting the invite."
            ),
            output_type=CollaboratorAcceptanceOutput,
        )

        invite_acceptance = await call_tool_payload(
            benchmarker_mcp,
            "accept_invite",
            {
                "inviteId": invite["id"],
                "agentId": benchmarker.agent_id,
            },
        )
        if isinstance(invite_acceptance, dict):
            raw_text = invite_acceptance.get("raw_text")
            if isinstance(raw_text, str) and raw_text.strip():
                if "Consensus is required" not in raw_text:
                    raise RuntimeError(f"Tool accept_invite error: {raw_text.strip()}")

        workspace_record = await call_tool_record(
            lead_mcp,
            "read_workspace_brief",
            {"workspaceId": workspace_id},
        )
        workspace_invite = find_invite(workspace_record, invite["id"])
        if workspace_invite.get("status") != "accepted":
            collaborator_decision = find_governance_decision(
                workspace_record,
                kind="collaborator_change",
                invite_id=invite["id"],
            )
            decision_id = str(collaborator_decision["id"])
            await call_tool_record(
                lead_mcp,
                "update_governance_decision_status",
                {
                    "workspaceId": workspace_id,
                    "agentId": lead.agent_id,
                    "decisionId": decision_id,
                    "status": "ready",
                },
            )
            await call_tool_record(
                lead_mcp,
                "update_governance_decision_status",
                {
                    "workspaceId": workspace_id,
                    "agentId": lead.agent_id,
                    "decisionId": decision_id,
                    "status": "vote",
                },
            )
            await call_tool_record(
                lead_mcp,
                "cast_governance_vote",
                {
                    "workspaceId": workspace_id,
                    "agentId": lead.agent_id,
                    "decisionId": decision_id,
                    "vote": "approve",
                    "rationale": (
                        "Approve the benchmark collaborator so the workspace can run the "
                        "sandbox-backed notebook and complete the empirical evidence pass."
                    ),
                },
            )
            workspace_record = await call_tool_record(
                lead_mcp,
                "read_workspace_brief",
                {"workspaceId": workspace_id},
            )
            workspace_invite = find_invite(workspace_record, invite["id"])
            if workspace_invite.get("status") != "accepted":
                raise RuntimeError(
                    f"Invite {invite['id']} did not resolve to accepted status: {workspace_invite!r}"
                )

        await call_tool_record(
            benchmarker_mcp,
            "post_workspace_message",
            {
                "workspaceId": workspace_id,
                "agentId": benchmarker.agent_id,
                "surface": "proposal",
                "content": collaborator_response.acceptance_message,
            },
        )

        await call_tool_record(
            lead_mcp,
            "activate_workspace_draft",
            {"workspaceId": workspace_id, "agentId": lead.agent_id},
        )
        workspace_record = await call_tool_record(
            lead_mcp,
            "read_workspace_brief",
            {"workspaceId": workspace_id},
        )

        await call_tool_record(
            benchmarker_mcp,
            "submit_citation_candidates",
            {
                "workspaceId": workspace_id,
                "agentId": benchmarker.agent_id,
                "papers": CITATION_CANDIDATES,
            },
        )

        log_stage("Drafting the notebook benchmark plan and manuscript protocol section.")
        benchmark_plan = await run_structured_agent(
            name="benchmark-notebook-author",
            instructions=(
                "You author code notebook cells for empirical ML benchmarking. Produce a "
                "single Python code cell that can run inside a shared notebook, keeps all "
                "randomness seeded, installs missing dependencies if needed, and prints one "
                f"final machine-readable line that starts with {RESULT_SENTINEL}. Also produce "
                "a prose manuscript section describing the compared models and the small-sample "
                "protocol. When the compared objectives or reported metrics are easier to audit "
                "as math, include KaTeX-compatible equations in the manuscript section."
            ),
            prompt=(
                f"Write the benchmark notebook cell for '{RESEARCH_TITLE}'.\n\n"
                f"Workspace brief:\n{json_blob(workspace_record['workspace'])}\n\n"
                f"Sandbox eligibility:\n{json_blob(benchmarker_eligibility)}\n\n"
                "Requirements:\n"
                "- use sklearn.datasets.load_diabetes\n"
                "- compare LinearRegression, Ridge, Lasso, DecisionTreeRegressor, RandomForestRegressor\n"
                "- evaluate train subset sizes 25, 50, and 100\n"
                "- repeat randomized train/test splits with fixed seeds\n"
                "- report mae_mean, mae_std, r2_mean, and r2_std\n"
                "- render at least one paper-ready matplotlib figure in the notebook outputs summarizing model behavior across subset sizes\n"
                "- emit a final single-line JSON payload with dataset, protocol, results, and best_by_sample_size\n"
                "- keep claims limited to observed benchmark behavior\n"
                "- if the compared objectives or reported metrics are materially easier to audit as math, include one or more displayed KaTeX-compatible equations using $$...$$ or \\[...\\]\n"
                "- keep any formula aligned with the executed code and the benchmark payload rather than introducing unrelated theory\n"
                "Also return:\n"
                "- a draft-surface message announcing the benchmark execution,\n"
                "- a notebook revision summary,\n"
                "- a prose section titled 'Models and Small-Sample Protocol' for the manuscript.\n"
            ),
            output_type=BenchmarkPlanOutput,
        )

        benchmark_cell_source = ensure_visual_benchmark_cell_source(benchmark_plan.cell_source)
        results_section = find_section(workspace_record, "Results", "draft")
        methods_section = find_section(workspace_record, "Models and Small-Sample Protocol", "draft")
        setup_section = find_section(workspace_record, "Dataset and Experimental Setup", "draft")
        log_stage("Creating and accepting the delegated benchmark task.")
        delegated_task = await call_tool_entity(
            lead_mcp,
            "create_delegated_task",
            {
                "workspaceId": workspace_id,
                "fromAgentId": lead.agent_id,
                "toAgentId": benchmarker.agent_id,
                "title": "Run the diabetes benchmark and draft the evidence-backed sections",
                "summary": (
                    "Execute the shared notebook inside the sandbox, generate manuscript visuals "
                    "and benchmark assets, and produce manuscript-ready methods and results text "
                    "grounded in the run output."
                ),
                "kind": "research",
                "sectionId": results_section["id"],
                "deliverables": [
                    "Executed notebook cell",
                    "Linked evidence for the Results section",
                    "Benchmark table artifact",
                    "Notebook figure artifact",
                    "Benchmark chart artifacts",
                    "Methods and Results section drafts",
                ],
            },
        )
        await call_tool_record(
            benchmarker_mcp,
            "accept_delegated_task",
            {
                "taskId": delegated_task["id"],
                "agentId": benchmarker.agent_id,
                "responseNote": "I will run the benchmark in the shared notebook and keep the write-up tied to the execution payload.",
            },
        )
        await call_tool_record(
            benchmarker_mcp,
            "post_workspace_message",
            {
                "workspaceId": workspace_id,
                "agentId": benchmarker.agent_id,
                "surface": "draft",
                "content": benchmark_plan.benchmark_message,
                "selection": {
                    "text": "Benchmark plan for diabetes small-sample results",
                    "pageNumber": int(results_section.get("pageNumber") or 4),
                    "surface": "draft",
                    "sectionId": results_section["id"],
                    "sectionTitle": results_section["title"],
                },
            },
        )

        log_stage("Saving the benchmark notebook cell and queueing sandbox execution.")
        notebook = await call_tool_record(
            benchmarker_mcp,
            "get_notebook",
            {"workspaceId": workspace_id},
        )
        benchmark_cell_id = f"cell_{uuid4().hex[:12]}"
        notebook_document = notebook["document"]
        notebook_document["cells"].append(
            {
                "id": benchmark_cell_id,
                "cell_type": "code",
                "source": [line + "\n" for line in benchmark_cell_source.rstrip().splitlines()],
                "metadata": {
                    "agentarxiv": {
                        "title": "Diabetes small-sample benchmark",
                        "authorAgentId": benchmarker.agent_id,
                    }
                },
                "execution_count": None,
                "outputs": [],
            }
        )

        await call_tool_record(
            benchmarker_mcp,
            "acquire_lease",
            {"workspaceId": workspace_id, "agentId": benchmarker.agent_id},
        )
        try:
            await call_tool_record(
                benchmarker_mcp,
                "save_notebook",
                {
                    "workspaceId": workspace_id,
                    "agentId": benchmarker.agent_id,
                    "document": notebook_document,
                    "summary": benchmark_plan.notebook_summary,
                },
            )
            notebook_execution = await call_tool_record(
                benchmarker_mcp,
                "execute_cell",
                {
                    "workspaceId": workspace_id,
                    "agentId": benchmarker.agent_id,
                    "cellId": benchmark_cell_id,
                    "objective": "Run the diabetes small-sample benchmark notebook cell.",
                    "timeoutSeconds": min(STRICT_TIMEOUT_SECONDS, 1200),
                },
            )
            activity, completed_execution = await wait_for_execution(
                server=benchmarker_mcp,
                workspace_id=workspace_id,
                agent_id=benchmarker.agent_id,
                execution_id=notebook_execution["id"],
                timeout_seconds=STRICT_TIMEOUT_SECONDS,
            )
        finally:
            await call_tool_record(
                benchmarker_mcp,
                "release_lease",
                {"workspaceId": workspace_id, "agentId": benchmarker.agent_id},
            )

        if completed_execution["status"] != "completed":
            raise RuntimeError(
                f"Notebook execution {completed_execution['id']} ended in status "
                f"{completed_execution['status']}: {completed_execution.get('errorMessage')}"
            )

        log_stage(f"Notebook execution completed: {completed_execution['id']}")
        result_payload = execution_result_payload(completed_execution, activity)
        notebook_figure_artifact_id: str | None = None
        await call_tool_record(
            benchmarker_mcp,
            "link_evidence",
            {
                "workspaceId": workspace_id,
                "agentId": benchmarker.agent_id,
                "cellId": benchmark_cell_id,
                "executionId": completed_execution["id"],
                "sectionId": results_section["id"],
            },
        )
        manuscript_guidance_before_assets = await call_tool_record(
            lead_mcp,
            "inspect_workspace_manuscript",
            {"workspaceId": workspace_id},
        )
        inspection_reward_signals = manuscript_guidance_before_assets.get("rewardSignals") or []
        inspection_recommended_actions = (
            manuscript_guidance_before_assets.get("recommendedActions") or []
        )
        inspection_section_guidance = manuscript_guidance_before_assets.get("sections") or []

        notebook_figure_data_uri = notebook_output_image_data_uri(activity, benchmark_cell_id)
        if notebook_figure_data_uri:
            if len(notebook_figure_data_uri) > MAX_INLINE_FIGURE_UPLOAD_CHARS:
                log_stage(
                    "Notebook figure remained in the sandbox output but was too large to mirror "
                    "through MCP, so manuscript visuals will rely on the generated chart and diagram assets."
                )
            else:
                try:
                    notebook_figure = await call_tool_record(
                        benchmarker_mcp,
                        "upload_manuscript_asset",
                    {
                        "workspaceId": workspace_id,
                        "agentId": benchmarker.agent_id,
                        "assetType": "figure",
                        "title": "Sandbox benchmark visualization from notebook execution",
                        "content": notebook_figure_data_uri,
                    },
                )
                    notebook_figure_artifact_id = notebook_figure.get("id")
                except Exception as exc:
                    log_stage(f"Skipping notebook figure upload after MCP rejection: {exc}")

        benchmark_table = await call_tool_record(
            benchmarker_mcp,
            "generate_manuscript_asset",
            {
                "workspaceId": workspace_id,
                "agentId": benchmarker.agent_id,
                "assetType": "table",
                "title": "Small-sample diabetes benchmark summary",
                "template": "benchmark",
                "headers": [
                    "Sample size",
                    "Model",
                    "MAE mean",
                    "MAE std",
                    "R^2 mean",
                    "R^2 std",
                ],
                "rows": benchmark_table_rows(result_payload),
            },
        )
        benchmark_artifact_id = benchmark_table.get("id")
        mae_chart = await call_tool_record(
            benchmarker_mcp,
            "generate_manuscript_asset",
            {
                "workspaceId": workspace_id,
                "agentId": benchmarker.agent_id,
                "assetType": "chart",
                "title": "Best observed MAE by training subset size",
                "template": "benchmark_bar",
                "chartType": "bar",
                "data": best_by_sample_size_chart_data(result_payload, metric="mae_mean"),
                "xLabel": "Best model at each training subset size",
                "yLabel": "Mean MAE",
            },
        )
        mae_chart_artifact_id = mae_chart.get("id")
        r2_chart = await call_tool_record(
            benchmarker_mcp,
            "generate_manuscript_asset",
            {
                "workspaceId": workspace_id,
                "agentId": benchmarker.agent_id,
                "assetType": "chart",
                "title": "Best observed R^2 by training subset size",
                "template": "benchmark_bar",
                "chartType": "bar",
                "data": best_by_sample_size_chart_data(result_payload, metric="r2_mean"),
                "xLabel": "Best model at each training subset size",
                "yLabel": "Mean R^2",
            },
        )
        r2_chart_artifact_id = r2_chart.get("id")
        workflow_diagram_input = build_protocol_diagram()
        workflow_diagram = await call_tool_record(
            benchmarker_mcp,
            "generate_manuscript_asset",
            {
                "workspaceId": workspace_id,
                "agentId": benchmarker.agent_id,
                "assetType": "diagram",
                "title": "Sandbox benchmark workflow",
                "template": "pipeline",
                "nodes": workflow_diagram_input["nodes"],
                "edges": workflow_diagram_input["edges"],
            },
        )
        workflow_diagram_artifact_id = workflow_diagram.get("id")
        setup_table = await call_tool_record(
            benchmarker_mcp,
            "generate_manuscript_asset",
            {
                "workspaceId": workspace_id,
                "agentId": benchmarker.agent_id,
                "assetType": "table",
                "title": "Diabetes dataset and protocol summary",
                "template": "dataset_summary",
                "headers": ["Aspect", "Value"],
                "rows": dataset_summary_rows(result_payload),
            },
        )
        setup_table_artifact_id = setup_table.get("id")
        method_artifact_ids = [
            artifact_id
            for artifact_id in [workflow_diagram_artifact_id, setup_table_artifact_id]
            if artifact_id
        ]
        result_artifact_ids = [
            artifact_id
            for artifact_id in [
                benchmark_artifact_id,
                mae_chart_artifact_id,
                r2_chart_artifact_id,
                notebook_figure_artifact_id,
            ]
            if artifact_id
        ]
        asset_catalog = [
            {
                "id": benchmark_artifact_id,
                "title": "Small-sample diabetes benchmark summary",
                "type": "table",
                "sectionTitle": "Results",
            },
            {
                "id": mae_chart_artifact_id,
                "title": "Best observed MAE by training subset size",
                "type": "chart",
                "sectionTitle": "Results",
            },
            {
                "id": r2_chart_artifact_id,
                "title": "Best observed R^2 by training subset size",
                "type": "chart",
                "sectionTitle": "Results",
            },
            {
                "id": workflow_diagram_artifact_id,
                "title": "Sandbox benchmark workflow",
                "type": "diagram",
                "sectionTitle": "Models and Small-Sample Protocol",
            },
            {
                "id": setup_table_artifact_id,
                "title": "Diabetes dataset and protocol summary",
                "type": "table",
                "sectionTitle": "Dataset and Experimental Setup",
            },
        ]
        if notebook_figure_artifact_id:
            asset_catalog.append(
                {
                    "id": notebook_figure_artifact_id,
                    "title": "Sandbox benchmark visualization from notebook execution",
                    "type": "figure",
                    "sectionTitle": "Results",
                }
            )
        asset_catalog = [asset for asset in asset_catalog if asset.get("id")]
        asset_selection = await run_structured_agent(
            name="manuscript-asset-selector",
            instructions=(
                "You are an internal manuscript optimizer. Treat the inspection report's "
                "reward signals and recommended actions as the authoritative readiness guidance, "
                "then decide which generated assets should actually be attached to which "
                "sections. Prefer enough assets to raise manuscript readiness without "
                "attaching redundant visuals."
            ),
            prompt=(
                f"Optimize artifact inclusion for '{RESEARCH_TITLE}'.\n\n"
                f"{INTERNAL_MANUSCRIPT_GUIDANCE}\n\n"
                f"Inspection-derived reward signals:\n{json_blob(inspection_reward_signals)}\n\n"
                f"Inspection-derived recommended actions:\n{json_blob(inspection_recommended_actions)}\n\n"
                f"Section-level artifact guidance:\n{json_blob(inspection_section_guidance)}\n\n"
                f"Readiness inspection before asset attachment:\n{json_blob(manuscript_guidance_before_assets)}\n\n"
                f"Executed benchmark payload:\n{json_blob(result_payload)}\n\n"
                f"Candidate manuscript assets:\n{json_blob(asset_catalog)}\n\n"
                "Return section assignments for the assets that should be linked into the paper. "
                "Prioritize the Results, Models and Small-Sample Protocol, and Dataset and Experimental Setup sections. "
                "This paper should read like a complete research manuscript rather than a text-only benchmark memo, "
                "so prefer linking at least one image-like Results figure when available."
            ),
            output_type=AssetSelectionOutput,
        )
        artifact_id_by_title = {
            str(asset["title"]): str(asset["id"])
            for asset in asset_catalog
            if asset.get("title") and asset.get("id")
        }
        artifact_refs_by_section: dict[str, list[str]] = {
            "Dataset and Experimental Setup": [],
            "Models and Small-Sample Protocol": [],
            "Results": [],
        }
        for assignment in asset_selection.section_assignments:
            artifact_refs_by_section[assignment.section_title] = list(
                dict.fromkeys(
                    artifact_id_by_title[title]
                    for title in assignment.artifact_titles
                    if title in artifact_id_by_title
                )
            )
        if not artifact_refs_by_section["Results"]:
            artifact_refs_by_section["Results"] = result_artifact_ids
        if not artifact_refs_by_section["Models and Small-Sample Protocol"]:
            artifact_refs_by_section["Models and Small-Sample Protocol"] = method_artifact_ids
        if not artifact_refs_by_section["Dataset and Experimental Setup"] and setup_table_artifact_id:
            artifact_refs_by_section["Dataset and Experimental Setup"] = [setup_table_artifact_id]
        selected_artifact_ids = list(
            dict.fromkeys(
                artifact_id
                for refs in artifact_refs_by_section.values()
                for artifact_id in refs
            )
        )

        log_stage("Interpreting benchmark results and drafting the remaining manuscript sections.")
        interpretation = await run_structured_agent(
            name="results-interpreter",
            instructions=(
                "You interpret benchmark outputs for a sober manuscript. Summarize what the "
                "results show, avoid overclaiming, and tie every claim back to the observed "
                "execution payload."
            ),
            prompt=(
                f"Interpret the completed notebook benchmark for '{RESEARCH_TITLE}'.\n\n"
                f"Execution payload:\n{json_blob(result_payload)}\n\n"
                "Return:\n"
                "- a draft-surface message reporting the evidence,\n"
                "- a full Results section,\n"
                "- a short list of discussion points the lead author should fold into the Discussion section,\n"
                "- a publication showcase summary.\n"
            ),
            output_type=ResultsInterpretationOutput,
        )

        lead_sections = await run_structured_agent(
            name="lead-draft-author",
            instructions=(
                "You write introduction, setup, discussion, and conclusion sections for a "
                "benchmark paper. Stay empirical, explain the sandbox-backed workflow, and "
                "make the limits of the benchmark explicit. Preserve mathematically explicit "
                "methods sections when they are justified by the benchmark."
            ),
            prompt=(
                f"Write the remaining draft sections for '{RESEARCH_TITLE}'.\n\n"
                f"Workspace brief:\n{json_blob(workspace_record['workspace'])}\n\n"
                f"Benchmark payload:\n{json_blob(result_payload)}\n\n"
                f"Discussion points from the benchmark analyst:\n{json_blob(interpretation.discussion_points)}\n"
            ),
            output_type=LeadDraftOutput,
        )
        lead_section_content = {
            "Introduction": lead_sections.introduction,
            "Dataset and Experimental Setup": lead_sections.experimental_setup,
            "Discussion": lead_sections.discussion,
            "Conclusion": lead_sections.conclusion,
        }
        for section_title, content in list(lead_section_content.items()):
            issues = section_quality_issues(section_title, content)
            if not issues:
                continue
            log_stage(
                f"Repairing '{section_title}' before submission because the generated draft looked placeholder-like."
            )
            lead_section_content[section_title] = await repair_section_draft(
                section_title=section_title,
                current_content=content,
                workspace_brief=workspace_record["workspace"],
                result_payload=result_payload,
                discussion_points=interpretation.discussion_points,
                issues=issues,
            )
        protocol_section_text = benchmark_plan.protocol_section

        log_stage("Submitting draft sections, review feedback, and publishing the paper.")
        await call_tool_record(
            benchmarker_mcp,
            "post_workspace_message",
            {
                "workspaceId": workspace_id,
                "agentId": benchmarker.agent_id,
                "surface": "draft",
                "content": interpretation.results_message,
                "selection": {
                    "text": "Sandbox-backed benchmark findings",
                    "pageNumber": int(results_section.get("pageNumber") or 4),
                    "surface": "draft",
                    "sectionId": results_section["id"],
                    "sectionTitle": results_section["title"],
                },
                "references": [
                    {
                        "kind": "notebook_execution",
                        "notebookId": activity["notebook"]["id"],
                        "cellId": benchmark_cell_id,
                        "executionId": completed_execution["id"],
                        "status": completed_execution["status"],
                        "title": "Completed diabetes benchmark execution",
                    }
                ],
            },
        )

        draft_submissions = [
            {
                "server": lead_mcp,
                "agent_id": lead.agent_id,
                "section_title": "Introduction",
                "content": lead_section_content["Introduction"],
                "rationale": "Frames the paper as a strict sandbox-backed benchmark of small-sample regression behavior.",
                "cited_keys": ["efron2004_lars", "pedregosa2011_sklearn"],
                "artifact_refs": [],
            },
            {
                "server": lead_mcp,
                "agent_id": lead.agent_id,
                "section_title": "Dataset and Experimental Setup",
                "content": lead_section_content["Dataset and Experimental Setup"],
                "rationale": "Explains the dataset, repeated split protocol, and links the setup summary asset.",
                "cited_keys": ["efron2004_lars", "pedregosa2011_sklearn"],
                "artifact_refs": artifact_refs_by_section["Dataset and Experimental Setup"],
            },
            {
                "server": benchmarker_mcp,
                "agent_id": benchmarker.agent_id,
                "section_title": "Models and Small-Sample Protocol",
                "content": protocol_section_text,
                "rationale": "Documents the concrete model set and benchmark procedure that generated the linked notebook evidence and workflow diagram.",
                "cited_keys": [
                    "hoerl1970_ridge",
                    "tibshirani1996_lasso",
                    "breiman1984_cart",
                    "breiman2001_rf",
                    "pedregosa2011_sklearn",
                ],
                "artifact_refs": artifact_refs_by_section["Models and Small-Sample Protocol"],
            },
            {
                "server": benchmarker_mcp,
                "agent_id": benchmarker.agent_id,
                "section_title": "Results",
                "content": interpretation.results_section,
                "rationale": "Summarizes the executed notebook outputs and links the table, chart, and notebook-figure artifacts.",
                "cited_keys": ["pedregosa2011_sklearn"],
                "artifact_refs": artifact_refs_by_section["Results"],
            },
            {
                "server": lead_mcp,
                "agent_id": lead.agent_id,
                "section_title": "Discussion",
                "content": lead_section_content["Discussion"],
                "rationale": "Interprets the observed stability and variance patterns without extending beyond the benchmark.",
                "cited_keys": ["hoerl1970_ridge", "tibshirani1996_lasso", "breiman2001_rf"],
                "artifact_refs": [],
            },
            {
                "server": lead_mcp,
                "agent_id": lead.agent_id,
                "section_title": "Conclusion",
                "content": lead_section_content["Conclusion"],
                "rationale": "Closes with the benchmark-limited takeaways and next-step recommendations.",
                "cited_keys": [],
                "artifact_refs": [],
            },
        ]
        draft_submission_by_title = {
            str(item["section_title"]): item for item in draft_submissions
        }

        await call_tool_record(
            lead_mcp,
            "post_workspace_message",
            {
                "workspaceId": workspace_id,
                "agentId": lead.agent_id,
                "surface": "draft",
                "content": (
                    "I will fold the benchmark evidence into the framing and discussion sections, "
                    "keeping the manuscript limited to the observed small-sample behavior."
                ),
                "selection": {
                    "text": "Lead synthesis plan for the evidence-backed discussion",
                    "pageNumber": int(methods_section.get("pageNumber") or 3),
                    "surface": "draft",
                    "sectionId": methods_section["id"],
                    "sectionTitle": methods_section["title"],
                },
            },
        )

        workspace_record = await call_tool_record(
            lead_mcp,
            "read_workspace_brief",
            {"workspaceId": workspace_id},
        )

        for submission in draft_submissions:
            section = find_section(workspace_record, str(submission["section_title"]), "draft")
            await submit_draft_section(
                server=submission["server"],
                workspace_id=workspace_id,
                section=section,
                agent_id=str(submission["agent_id"]),
                content=str(submission["content"]),
                rationale=str(submission["rationale"]),
                cited_keys=list(submission["cited_keys"]),
                artifact_refs=list(submission["artifact_refs"]),
            )

        await call_tool_record(
            benchmarker_mcp,
            "complete_delegated_task",
            {
                "taskId": delegated_task["id"],
                "agentId": benchmarker.agent_id,
                "resultSummary": (
                    "Executed the diabetes small-sample benchmark in the shared notebook, linked "
                    "the notebook run to the Results section, and delivered manuscript-ready methods "
                    "and results text with linked figure, chart, diagram, and table artifacts."
                ),
                "artifactRefs": selected_artifact_ids,
            },
        )

        review_plan = [
            (benchmarker_mcp, benchmarker.agent_id, "Introduction"),
            (benchmarker_mcp, benchmarker.agent_id, "Dataset and Experimental Setup"),
            (lead_mcp, lead.agent_id, "Models and Small-Sample Protocol"),
            (lead_mcp, lead.agent_id, "Results"),
            (benchmarker_mcp, benchmarker.agent_id, "Discussion"),
            (benchmarker_mcp, benchmarker.agent_id, "Conclusion"),
        ]
        review_assignment_by_title = {
            section_title: (server, reviewer_id)
            for server, reviewer_id, section_title in review_plan
        }

        for server, reviewer_id, section_title in review_plan:
            section = find_section(workspace_record, section_title, "draft")
            await review_section_submission(
                server=server,
                workspace_id=workspace_id,
                section=section,
                reviewer_id=reviewer_id,
                section_title=section_title,
                section_text=str(draft_submission_by_title[section_title]["content"]),
                result_payload=result_payload,
            )

        manuscript_status = await call_tool_record(
            lead_mcp,
            "inspect_workspace_manuscript",
            {"workspaceId": workspace_id},
        )
        requested_changes = [
            section
            for section in manuscript_status.get("sections", [])
            if section.get("status") == "changes_requested"
        ]
        if requested_changes:
            log_stage(
                "Review requested changes for one or more sections; repairing them automatically before publish."
            )
            for section_status in requested_changes:
                section_title = str(section_status.get("title") or "")
                if not section_title or section_title not in draft_submission_by_title:
                    raise RuntimeError(
                        f"Cannot repair unknown section from manuscript status: {section_status}"
                    )
                submission = draft_submission_by_title[section_title]
                repaired_content = await repair_section_draft(
                    section_title=section_title,
                    current_content=str(submission["content"]),
                    workspace_brief=workspace_record["workspace"],
                    result_payload=result_payload,
                    discussion_points=interpretation.discussion_points,
                    issues=[
                        f"Platform review status: {section_status.get('status')}",
                        *section_quality_issues(section_title, str(submission["content"])),
                    ],
                )
                submission["content"] = repaired_content
                section = find_section(workspace_record, section_title, "draft")
                await submit_draft_section(
                    server=submission["server"],
                    workspace_id=workspace_id,
                    section=section,
                    agent_id=str(submission["agent_id"]),
                    content=repaired_content,
                    rationale=str(submission["rationale"]),
                    cited_keys=list(submission["cited_keys"]),
                    artifact_refs=list(submission["artifact_refs"]),
                )
                review_server, reviewer_id = review_assignment_by_title[section_title]
                await review_section_submission(
                    server=review_server,
                    workspace_id=workspace_id,
                    section=section,
                    reviewer_id=reviewer_id,
                    section_title=section_title,
                    section_text=repaired_content,
                    result_payload=result_payload,
                )

            manuscript_status = await call_tool_record(
                lead_mcp,
                "inspect_workspace_manuscript",
                {"workspaceId": workspace_id},
            )
        if manuscript_needs_formula_revision(manuscript_status):
            log_stage(
                "Manuscript readiness suggested a formula pass; asking an editor agent whether "
                "the methods section should be revised."
            )
            formula_revision = await run_structured_agent(
                name="formula-readiness-editor",
                instructions=(
                    "You are a manuscript readiness editor. Decide whether the methods/protocol "
                    "section should be revised to add math. Only request or make a revision "
                    "when a formula materially improves auditability for this executed benchmark. "
                    "Use KaTeX-compatible delimiters when revising, keep notation minimal, and "
                    "do not add equations just to game a rubric."
                ),
                prompt=(
                    f"Review the 'Models and Small-Sample Protocol' section for '{RESEARCH_TITLE}'.\n\n"
                    f"Current section text:\n{protocol_section_text}\n\n"
                    f"Benchmark payload:\n{json_blob(result_payload)}\n\n"
                    f"Current manuscript readiness report:\n{json_blob(manuscript_status)}\n\n"
                    "Return whether the section should be revised to add formulas. If yes, return "
                    "a revised section that adds only equations that are appropriate for this "
                    "benchmark, such as a regularized linear objective or reported evaluation "
                    "metric. If no, explain why the current prose is already adequate."
                ),
                output_type=FormulaRevisionDecisionOutput,
            )
            if formula_revision.revise_methods and formula_revision.revised_section:
                protocol_section_text = formula_revision.revised_section
                draft_submission_by_title["Models and Small-Sample Protocol"]["content"] = (
                    protocol_section_text
                )
                await call_tool_record(
                    benchmarker_mcp,
                    "submit_section_draft",
                    {
                        "workspaceId": workspace_id,
                        "sectionId": methods_section["id"],
                        "agentId": benchmarker.agent_id,
                        "content": protocol_section_text,
                        "rationale": formula_revision.rationale,
                        "citedKeys": [
                            "hoerl1970_ridge",
                            "tibshirani1996_lasso",
                            "breiman1984_cart",
                            "breiman2001_rf",
                            "pedregosa2011_sklearn",
                        ],
                        "artifactRefs": artifact_refs_by_section["Models and Small-Sample Protocol"],
                    },
                )
                formula_review = await run_structured_agent(
                    name="formula-section-reviewer",
                    instructions=(
                        "You review a benchmark methods section for mathematical clarity and grounding. "
                        "Accept sections whose equations are relevant, correctly scoped, and tied to the executed study."
                    ),
                    prompt=(
                        f"Review the revised section 'Models and Small-Sample Protocol' for '{RESEARCH_TITLE}'.\n\n"
                        f"Section text:\n{protocol_section_text}\n\n"
                        f"Observed benchmark payload:\n{json_blob(result_payload)}\n"
                    ),
                    output_type=ReviewerOutput,
                )
                await call_tool_record(
                    lead_mcp,
                    "submit_review_feedback",
                    {
                        "workspaceId": workspace_id,
                        "sectionId": methods_section["id"],
                        "agentId": lead.agent_id,
                        "decision": formula_review.decision,
                        "summary": formula_review.summary,
                    },
                )
                manuscript_status = await call_tool_record(
                    lead_mcp,
                    "inspect_workspace_manuscript",
                    {"workspaceId": workspace_id},
                )

        remaining_nonaccepted = [
            str(section.get("title") or "")
            for section in manuscript_status.get("sections", [])
            if section.get("status") != "accepted"
        ]
        if remaining_nonaccepted:
            raise RuntimeError(
                f"Manuscript still has non-accepted sections before publish: {remaining_nonaccepted}"
            )

        published = await call_tool_record(
            lead_mcp,
            "publish_workspace_paper",
            {
                "workspaceId": workspace_id,
                "agentId": lead.agent_id,
                "visibility": "public",
                "showcase": interpretation.showcase_summary,
                "publishedIn": "AgentArXiv · Benchmarking Runtime",
            },
        )

        final_messages = await call_tool_payload(
            lead_mcp,
            "list_workspace_messages",
            {"workspaceId": workspace_id},
        )
        final_activity = await call_tool_record(
            lead_mcp,
            "list_notebook_activity",
            {"workspaceId": workspace_id, "limit": 20},
        )
        run_status = await call_tool_record(
            lead_mcp,
            "stream_run_status",
            {"workspaceId": workspace_id},
        )

        log_stage("Strict runtime run completed successfully.")
        print(
            json.dumps(
                {
                    "baseUrl": BASE_URL,
                    "workspaceId": workspace_id,
                    "paperId": published.get("id"),
                    "paperTitle": published.get("title"),
                    "workspacePath": published.get("workspacePath"),
                    "leadAgentId": lead.agent_id,
                    "benchmarkAgentId": benchmarker.agent_id,
                    "executionId": completed_execution["id"],
                    "executionStatus": completed_execution["status"],
                    "executionMode": completed_execution.get("executionMode"),
                    "sandboxEligibility": {
                        "lead": lead_eligibility.get("sandboxEligibility"),
                        "benchmarker": benchmarker_eligibility.get("sandboxEligibility"),
                    },
                    "messageCount": len(final_messages if isinstance(final_messages, list) else []),
                    "notebookRevision": final_activity.get("notebook", {}).get("currentRevision"),
                    "artifactId": benchmark_artifact_id,
                    "artifactIds": {
                        "benchmarkTable": benchmark_artifact_id,
                        "bestMaeChart": mae_chart_artifact_id,
                        "bestR2Chart": r2_chart_artifact_id,
                        "workflowDiagram": workflow_diagram_artifact_id,
                        "setupTable": setup_table_artifact_id,
                        "notebookFigure": notebook_figure_artifact_id,
                    },
                    "artifactSelection": {
                        "bySection": artifact_refs_by_section,
                        "selectedArtifactIds": selected_artifact_ids,
                    },
                    "manuscriptStatus": manuscript_status,
                    "runStatus": run_status,
                    "resultPayload": result_payload,
                },
                indent=2,
                sort_keys=True,
            )
        )


if __name__ == "__main__":
    asyncio.run(main())
