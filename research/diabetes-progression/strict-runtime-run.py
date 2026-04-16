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


class ReviewerOutput(BaseModel):
    summary: str = Field(min_length=24)
    decision: str = Field(pattern="^(accept|request_changes)$")


def slugify(value: str) -> str:
    lowered = re.sub(r"[^a-z0-9]+", "-", value.lower())
    return lowered.strip("-")


def json_blob(value: Any) -> str:
    return json.dumps(value, indent=2, sort_keys=True)


def log_stage(message: str) -> None:
    timestamp = datetime.now(tz=timezone.utc).strftime("%H:%M:%S")
    print(f"[{timestamp} UTC] {message}", flush=True)


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
        client_session_timeout_seconds=30,
        name=f"{lead.display_name} MCP",
    )
    benchmarker_mcp = MCPServerSse(
        {
            "url": benchmarker.endpoint,
            "headers": {"Authorization": f"Bearer {benchmarker.api_key}"},
        },
        cache_tools_list=True,
        client_session_timeout_seconds=30,
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
        if lead_eligibility.get("sandboxEligibility") != "verified" and benchmarker_eligibility.get(
            "sandboxEligibility"
        ) != "verified":
            raise RuntimeError(
                "Neither registered agent is sandbox-verified on this deployment. "
                "A strict benchmark run cannot proceed without at least one verified agent."
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
                "a prose manuscript section describing the compared models and the small-sample protocol."
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
                "- emit a final single-line JSON payload with dataset, protocol, results, and best_by_sample_size\n"
                "- keep claims limited to observed benchmark behavior\n"
                "Also return:\n"
                "- a draft-surface message announcing the benchmark execution,\n"
                "- a notebook revision summary,\n"
                "- a prose section titled 'Models and Small-Sample Protocol' for the manuscript.\n"
            ),
            output_type=BenchmarkPlanOutput,
        )

        results_section = find_section(workspace_record, "Results", "draft")
        methods_section = find_section(workspace_record, "Models and Small-Sample Protocol", "draft")
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
                    "Execute the shared notebook inside the sandbox, generate a benchmark table, "
                    "and produce manuscript-ready methods and results text grounded in the run output."
                ),
                "kind": "research",
                "sectionId": results_section["id"],
                "deliverables": [
                    "Executed notebook cell",
                    "Linked evidence for the Results section",
                    "Benchmark table artifact",
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
                "source": [line + "\n" for line in benchmark_plan.cell_source.rstrip().splitlines()],
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

        benchmark_table = await call_tool_record(
            benchmarker_mcp,
            "generate_manuscript_asset",
            {
                "workspaceId": workspace_id,
                "agentId": benchmarker.agent_id,
                "assetType": "table",
                "title": "Small-sample diabetes benchmark summary",
                "sectionId": results_section["id"],
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
                "make the limits of the benchmark explicit."
            ),
            prompt=(
                f"Write the remaining draft sections for '{RESEARCH_TITLE}'.\n\n"
                f"Workspace brief:\n{json_blob(workspace_record['workspace'])}\n\n"
                f"Benchmark payload:\n{json_blob(result_payload)}\n\n"
                f"Discussion points from the benchmark analyst:\n{json_blob(interpretation.discussion_points)}\n"
            ),
            output_type=LeadDraftOutput,
        )

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
            (
                lead_mcp,
                lead.agent_id,
                "Introduction",
                lead_sections.introduction,
                "Frames the paper as a strict sandbox-backed benchmark of small-sample regression behavior.",
                ["efron2004_lars", "pedregosa2011_sklearn"],
                [],
            ),
            (
                lead_mcp,
                lead.agent_id,
                "Dataset and Experimental Setup",
                lead_sections.experimental_setup,
                "Explains the dataset, repeated split protocol, and sandbox notebook workflow.",
                ["efron2004_lars", "pedregosa2011_sklearn"],
                [],
            ),
            (
                benchmarker_mcp,
                benchmarker.agent_id,
                "Models and Small-Sample Protocol",
                benchmark_plan.protocol_section,
                "Documents the concrete model set and benchmark procedure that generated the linked notebook evidence.",
                [
                    "hoerl1970_ridge",
                    "tibshirani1996_lasso",
                    "breiman1984_cart",
                    "breiman2001_rf",
                    "pedregosa2011_sklearn",
                ],
                [],
            ),
            (
                benchmarker_mcp,
                benchmarker.agent_id,
                "Results",
                interpretation.results_section,
                "Summarizes the executed notebook outputs and links the benchmark table artifact.",
                ["pedregosa2011_sklearn"],
                [benchmark_artifact_id] if benchmark_artifact_id else [],
            ),
            (
                lead_mcp,
                lead.agent_id,
                "Discussion",
                lead_sections.discussion,
                "Interprets the observed stability and variance patterns without extending beyond the benchmark.",
                ["hoerl1970_ridge", "tibshirani1996_lasso", "breiman2001_rf"],
                [],
            ),
            (
                lead_mcp,
                lead.agent_id,
                "Conclusion",
                lead_sections.conclusion,
                "Closes with the benchmark-limited takeaways and next-step recommendations.",
                [],
                [],
            ),
        ]

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

        for server, agent_id, section_title, content, rationale, cited_keys, artifact_refs in draft_submissions:
            section = find_section(workspace_record, section_title, "draft")
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

        await call_tool_record(
            benchmarker_mcp,
            "complete_delegated_task",
            {
                "taskId": delegated_task["id"],
                "agentId": benchmarker.agent_id,
                "resultSummary": (
                    "Executed the diabetes small-sample benchmark in the shared notebook, linked "
                    "the notebook run to the Results section, and delivered manuscript-ready methods "
                    "and results text with the benchmark table artifact."
                ),
                "artifactRefs": [benchmark_artifact_id] if benchmark_artifact_id else [],
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

        for server, reviewer_id, section_title in review_plan:
            section = find_section(workspace_record, section_title, "draft")
            section_text = next(
                item[3] for item in draft_submissions if item[2] == section_title
            )
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

        manuscript_status = await call_tool_record(
            lead_mcp,
            "inspect_workspace_manuscript",
            {"workspaceId": workspace_id},
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
