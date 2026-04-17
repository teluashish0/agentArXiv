from __future__ import annotations

import asyncio
import hashlib
import json
import mimetypes
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx
from agents import Agent, Runner
from chatkit.agents import AgentContext, ThreadItemConverter, stream_agent_response
from chatkit.server import ChatKitServer, NonStreamingResult, StreamingResult, stream_widget
from chatkit.store import NotFoundError, Store
from chatkit.types import (
    Attachment,
    AssistantMessageItem,
    FileAttachment,
    HiddenContextItem,
    InferenceOptions,
    ImageAttachment,
    Page,
    SDKHiddenContextItem,
    ThreadItem,
    ThreadMetadata,
    UserMessageItem,
    UserMessageTagContent,
    UserMessageTextContent,
    WidgetItem,
)
from chatkit.widgets import Card, Col, Divider, Markdown, Text
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse, Response, StreamingResponse
from openai.types.responses import ResponseInputTextParam
from pydantic import BaseModel, Field, TypeAdapter
from starlette.datastructures import UploadFile as StarletteUploadFile

from .db_store import DatabaseChatKitStore


def resolve_root_dir() -> Path:
  current = Path(__file__).resolve()

  for parent in current.parents:
    if (parent / "apps" / "chatkit-server" / "requirements.txt").exists():
      return parent

    if (parent / "requirements.txt").exists() and (parent / "src").exists():
      return parent

  return current.parents[1] if len(current.parents) > 1 else current.parent


ROOT_DIR = resolve_root_dir()
load_dotenv(ROOT_DIR / ".env.local", override=False)
load_dotenv(ROOT_DIR / ".env", override=False)
DEFAULT_STORE_PATH = ROOT_DIR / "data/runtime/chatkit-state.json"
DEFAULT_ATTACHMENT_STORAGE_PATH = ROOT_DIR / "data/runtime/chatkit-attachments"
DEFAULT_ATTACHMENT_STORAGE_BACKEND = "local"
DEFAULT_GCS_ATTACHMENT_PREFIX = "chatkit-attachments"
DEFAULT_CONTEXT_API_BASE_URL = "http://localhost:3000"
DEFAULT_CHATKIT_PUBLIC_BASE_URL = "http://127.0.0.1:8001"
DEFAULT_MODEL = "gpt-5.4-mini"
DEFAULT_CHATKIT_SHARED_SECRET = "agentarxiv-local-chatkit-secret"
CHATKIT_SHARED_SECRET_HEADER = "x-agentarxiv-chatkit-secret"
PAPER_CHAT_THREAD_SCOPE_HEADER = "x-agentarxiv-paper-thread-scope"
DEFAULT_INTERNAL_AGENT_GUIDANCE = "\n".join(
  [
    "Prefer novelty, evidence, and manuscript quality over speed.",
    "Use multi-pass research loops instead of one-shot answers.",
    "Turn visuals, tables, equations, and linked evidence into section-level value when they sharpen the paper.",
  ]
)
MAX_THREAD_ITEMS = 400
MAX_MESSAGE_ATTACHMENTS = 5
MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024
MAX_ATTACHMENT_TEXT_CHARS = 12000
MAX_ATTACHMENT_EXCERPT_CHARS = 280
WORKSPACE_REFERENCE_ADAPTER = TypeAdapter(list[dict[str, Any]])
ANCHOR_STOP_WORDS = {
  "about",
  "across",
  "after",
  "against",
  "around",
  "because",
  "between",
  "could",
  "from",
  "have",
  "into",
  "only",
  "remain",
  "same",
  "than",
  "that",
  "their",
  "them",
  "they",
  "this",
  "using",
  "with",
  "would",
}

TEXT_ATTACHMENT_MIME_PREFIXES = ("text/",)
TEXT_ATTACHMENT_MIME_TYPES = {
  "application/json",
  "application/ld+json",
  "application/xml",
  "application/x-yaml",
  "application/yaml",
  "application/javascript",
  "application/x-javascript",
}
TEXT_ATTACHMENT_SUFFIXES = {
  ".bib",
  ".c",
  ".cc",
  ".cpp",
  ".css",
  ".csv",
  ".go",
  ".h",
  ".hpp",
  ".html",
  ".java",
  ".js",
  ".json",
  ".log",
  ".md",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".sql",
  ".tex",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
}

_internal_agent_guidance_cache: str | None = None


def load_internal_agent_guidance() -> str:
  global _internal_agent_guidance_cache

  if _internal_agent_guidance_cache is not None:
    return _internal_agent_guidance_cache

  try:
    guidance = (ROOT_DIR / "AGENTS.md").read_text(encoding="utf-8").strip()
  except OSError:
    guidance = ""

  _internal_agent_guidance_cache = guidance or DEFAULT_INTERNAL_AGENT_GUIDANCE
  return _internal_agent_guidance_cache


class RequestContext(BaseModel):
  workspace_id: str
  surface: str
  decision_id: str | None = None
  paper_thread_scope: str | None = None
  paper_context_source: str = "workspace"


class SelectionPayload(BaseModel):
  text: str
  pageNumber: int
  sectionId: str | None = None
  sectionTitle: str | None = None
  agentId: str | None = None
  agentName: str | None = None
  contextText: str | None = None


class MessageReferencePayload(BaseModel):
  messageId: str
  authorId: str | None = None
  authorName: str
  authorAccent: str | None = None
  excerpt: str
  pageNumber: int | None = None
  sectionTitle: str | None = None


class AgentMessagePayload(BaseModel):
  agentId: str | None = None
  agentName: str
  agentAccent: str | None = None
  content: str
  selection: SelectionPayload | None = None
  messageReference: MessageReferencePayload | None = None
  references: list[dict[str, Any]] = Field(default_factory=list)


class WorkspaceMessagePayload(BaseModel):
  text: str = ""
  selection: SelectionPayload | None = None
  messageReference: MessageReferencePayload | None = None
  references: list[dict[str, Any]] = Field(default_factory=list)
  authorId: str | None = None
  authorName: str | None = None
  authorAccent: str | None = None


class WorkspaceAttachmentView(BaseModel):
  id: str
  type: str
  name: str
  mimeType: str
  sizeBytes: int | None = None
  excerpt: str | None = None
  previewUrl: str | None = None
  downloadUrl: str


class WorkspaceMessageView(BaseModel):
  id: str
  role: str
  authorId: str | None = None
  authorName: str
  authorAccent: str | None = None
  content: str
  selection: SelectionPayload | None = None
  messageReference: MessageReferencePayload | None = None
  references: list[dict[str, Any]] = Field(default_factory=list)
  attachments: list[WorkspaceAttachmentView] = Field(default_factory=list)
  createdAt: datetime


class SurfaceThreadPayload(BaseModel):
  threadId: str
  threadTitle: str
  paperTitle: str
  surfaceTitle: str
  manuscriptText: str
  mode: str = "workspace"
  notebookSummary: str | None = None
  navigation: dict[str, Any] | None = None
  collaborators: list[dict[str, Any]]
  sections: list[dict[str, Any]]
  seedMessages: list[dict[str, Any]]
  governanceDecisions: list[dict[str, Any]] = Field(default_factory=list)
  activeDecision: dict[str, Any] | None = None
  otherDecisionDigests: list[dict[str, Any]] = Field(default_factory=list)
  evidenceLinks: list[dict[str, Any]] = Field(default_factory=list)


def normalize_paper_thread_scope(value: str | None) -> str | None:
  normalized = (value or "").strip()
  return normalized[:256] if normalized else None


def build_scoped_paper_thread_id(paper_id: str, thread_scope: str | None = None) -> str:
  normalized_scope = normalize_paper_thread_scope(thread_scope)
  base_thread_id = f"paper-{paper_id}"

  if not normalized_scope:
    return base_thread_id

  digest = hashlib.sha256(normalized_scope.encode("utf-8")).hexdigest()[:16]
  return f"{base_thread_id}-{digest}"


def resolve_paper_thread_scope(request: Request) -> str | None:
  return normalize_paper_thread_scope(request.headers.get(PAPER_CHAT_THREAD_SCOPE_HEADER))


def build_request_context(
  workspace_id: str,
  surface: str,
  request: Request,
  decision_id: str | None = None,
  paper_context_source: str = "workspace",
) -> RequestContext:
  return RequestContext(
    workspace_id=workspace_id,
    surface=surface,
    decision_id=decision_id,
    paper_thread_scope=resolve_paper_thread_scope(request) if surface == "paper" else None,
    paper_context_source=paper_context_source,
  )


def sanitize_attachment_name(filename: str) -> str:
  sanitized = "".join(character if character.isalnum() or character in {".", "-", "_"} else "-" for character in filename)
  sanitized = sanitized.strip(".-") or "attachment"
  return sanitized[:120]


def normalize_excerpt(value: str, limit: int = MAX_ATTACHMENT_EXCERPT_CHARS) -> str:
  compact = " ".join(value.split()).strip()

  if len(compact) <= limit:
    return compact

  return f"{compact[: limit - 1].rstrip()}…"


class FileAttachmentBlobStore:
  def __init__(self, base_path: Path):
    self.base_path = base_path

  def build_storage_path(self, thread_id: str, attachment_id: str, filename: str) -> Path:
    return self.base_path / thread_id / f"{attachment_id}-{sanitize_attachment_name(filename)}"

  async def write_blob(
    self,
    thread_id: str,
    attachment_id: str,
    filename: str,
    raw_bytes: bytes,
    mime_type: str,
  ) -> dict[str, Any]:
    storage_path = self.build_storage_path(thread_id, attachment_id, filename)
    storage_path.parent.mkdir(parents=True, exist_ok=True)
    await asyncio.to_thread(storage_path.write_bytes, raw_bytes)
    return {
      "storage_provider": "local",
      "storage_path": str(storage_path),
    }

  async def read_blob(self, attachment: Attachment) -> bytes:
    metadata = attachment.metadata or {}
    storage_path = metadata.get("storage_path")

    if not storage_path:
      raise NotFoundError(f"Attachment {attachment.id} does not have a file path")

    file_path = Path(str(storage_path))

    if not file_path.exists():
      raise NotFoundError(f"Attachment file for {attachment.id} was not found")

    return await asyncio.to_thread(file_path.read_bytes)


class GCSAttachmentBlobStore:
  def __init__(
    self,
    bucket_name: str,
    prefix: str = DEFAULT_GCS_ATTACHMENT_PREFIX,
    project: str | None = None,
  ):
    self.bucket_name = bucket_name
    self.prefix = prefix.strip("/")
    self.project = project or None
    self._client: Any | None = None

  def _get_client(self):
    if self._client is not None:
      return self._client

    try:
      from google.cloud import storage
    except ImportError as exc:
      raise RuntimeError(
        "google-cloud-storage must be installed to use the GCS attachment backend.",
      ) from exc

    self._client = storage.Client(project=self.project)
    return self._client

  def build_object_name(self, thread_id: str, attachment_id: str, filename: str) -> str:
    object_name = f"{thread_id}/{attachment_id}-{sanitize_attachment_name(filename)}"

    if self.prefix:
      return f"{self.prefix}/{object_name}"

    return object_name

  def _upload_blob_sync(self, object_name: str, raw_bytes: bytes, mime_type: str) -> None:
    bucket = self._get_client().bucket(self.bucket_name)
    blob = bucket.blob(object_name)
    blob.upload_from_string(raw_bytes, content_type=mime_type)

  async def write_blob(
    self,
    thread_id: str,
    attachment_id: str,
    filename: str,
    raw_bytes: bytes,
    mime_type: str,
  ) -> dict[str, Any]:
    object_name = self.build_object_name(thread_id, attachment_id, filename)
    await asyncio.to_thread(self._upload_blob_sync, object_name, raw_bytes, mime_type)
    return {
      "storage_provider": "gcs",
      "storage_bucket": self.bucket_name,
      "storage_object": object_name,
    }

  def _download_blob_sync(self, bucket_name: str, object_name: str) -> bytes:
    bucket = self._get_client().bucket(bucket_name)
    blob = bucket.blob(object_name)
    return blob.download_as_bytes()

  async def read_blob(self, attachment: Attachment) -> bytes:
    metadata = attachment.metadata or {}
    bucket_name = str(metadata.get("storage_bucket") or self.bucket_name).strip()
    object_name = str(metadata.get("storage_object") or "").strip()

    if not bucket_name or not object_name:
      raise NotFoundError(f"Attachment {attachment.id} does not have a GCS object binding")

    try:
      return await asyncio.to_thread(self._download_blob_sync, bucket_name, object_name)
    except Exception as exc:
      raise NotFoundError(f"Attachment {attachment.id} was not found in object storage") from exc


class AttachmentBlobStoreRouter:
  def __init__(
    self,
    *,
    primary_backend: str,
    local_store: FileAttachmentBlobStore,
    gcs_store: GCSAttachmentBlobStore | None = None,
  ):
    self.primary_backend = primary_backend
    self.local_store = local_store
    self.gcs_store = gcs_store

  async def write_blob(
    self,
    thread_id: str,
    attachment_id: str,
    filename: str,
    raw_bytes: bytes,
    mime_type: str,
  ) -> dict[str, Any]:
    if self.primary_backend == "gcs":
      if not self.gcs_store:
        raise RuntimeError("GCS attachment storage is not configured.")

      return await self.gcs_store.write_blob(
        thread_id,
        attachment_id,
        filename,
        raw_bytes,
        mime_type,
      )

    return await self.local_store.write_blob(
      thread_id,
      attachment_id,
      filename,
      raw_bytes,
      mime_type,
    )

  async def read_blob(self, attachment: Attachment) -> bytes:
    metadata = attachment.metadata or {}
    storage_provider = str(metadata.get("storage_provider") or "").strip().lower()

    if storage_provider == "gcs" or (
      metadata.get("storage_bucket") and metadata.get("storage_object")
    ):
      if not self.gcs_store:
        raise NotFoundError(
          f"Attachment {attachment.id} is stored in GCS but the GCS backend is not configured",
        )

      return await self.gcs_store.read_blob(attachment)

    return await self.local_store.read_blob(attachment)


class FileChatKitStore(Store[RequestContext]):
  def __init__(self, path: Path):
    self.path = path
    self._lock = asyncio.Lock()
    self._thread_adapter = TypeAdapter(ThreadMetadata)
    self._thread_item_adapter = TypeAdapter(ThreadItem)
    self._attachment_adapter = TypeAdapter(Attachment)

  def _read_state_sync(self) -> dict[str, Any]:
    if not self.path.exists():
      self.path.parent.mkdir(parents=True, exist_ok=True)
      self.path.write_text(
        json.dumps({"threads": {}, "items": {}, "attachments": {}}, indent=2),
        encoding="utf-8",
      )

    return json.loads(self.path.read_text(encoding="utf-8"))

  def _write_state_sync(self, state: dict[str, Any]) -> None:
    self.path.parent.mkdir(parents=True, exist_ok=True)
    self.path.write_text(json.dumps(state, indent=2), encoding="utf-8")

  async def _read_state(self) -> dict[str, Any]:
    return await asyncio.to_thread(self._read_state_sync)

  async def _write_state(self, state: dict[str, Any]) -> None:
    await asyncio.to_thread(self._write_state_sync, state)

  def _serialize_thread(self, thread: ThreadMetadata) -> dict[str, Any]:
    return thread.model_dump(mode="json")

  def _serialize_item(self, item: ThreadItem) -> dict[str, Any]:
    return item.model_dump(mode="json")

  def _serialize_attachment(self, attachment: Attachment) -> dict[str, Any]:
    return attachment.model_dump(mode="json")

  def _parse_thread(self, payload: dict[str, Any]) -> ThreadMetadata:
    return self._thread_adapter.validate_python(payload)

  def _parse_item(self, payload: dict[str, Any]) -> ThreadItem:
    return self._thread_item_adapter.validate_python(payload)

  def _parse_attachment(self, payload: dict[str, Any]) -> Attachment:
    return self._attachment_adapter.validate_python(payload)

  def _paginate(self, records: list[Any], after: str | None, limit: int, order: str) -> Page[Any]:
    ordered = list(records if order == "asc" else reversed(records))

    if after:
      ids = [record.id for record in ordered]
      if after in ids:
        ordered = ordered[ids.index(after) + 1 :]

    sliced = ordered[:limit]

    return Page(
      data=sliced,
      has_more=len(ordered) > limit,
      after=sliced[-1].id if len(ordered) > limit and sliced else None,
    )

  async def load_thread(self, thread_id: str, context: RequestContext) -> ThreadMetadata:
    async with self._lock:
      state = await self._read_state()
      payload = state["threads"].get(thread_id)

      if not payload:
        raise NotFoundError(f"Thread {thread_id} not found")

      return self._parse_thread(payload)

  async def save_thread(self, thread: ThreadMetadata, context: RequestContext) -> None:
    async with self._lock:
      state = await self._read_state()
      state["threads"][thread.id] = self._serialize_thread(thread)
      await self._write_state(state)

  async def load_thread_items(
    self,
    thread_id: str,
    after: str | None,
    limit: int,
    order: str,
    context: RequestContext,
  ) -> Page[ThreadItem]:
    async with self._lock:
      state = await self._read_state()
      payloads = state["items"].get(thread_id, [])
      items = [self._parse_item(payload) for payload in payloads]
      items.sort(key=lambda item: item.created_at)
      return self._paginate(items, after, limit, order)

  async def save_attachment(self, attachment: Attachment, context: RequestContext) -> None:
    async with self._lock:
      state = await self._read_state()
      state["attachments"][attachment.id] = self._serialize_attachment(attachment)
      await self._write_state(state)

  async def load_attachment(self, attachment_id: str, context: RequestContext) -> Attachment:
    async with self._lock:
      state = await self._read_state()
      payload = state["attachments"].get(attachment_id)

      if not payload:
        raise NotFoundError(f"Attachment {attachment_id} not found")

      return self._parse_attachment(payload)

  async def delete_attachment(self, attachment_id: str, context: RequestContext) -> None:
    async with self._lock:
      state = await self._read_state()
      state["attachments"].pop(attachment_id, None)
      await self._write_state(state)

  async def load_threads(
    self,
    limit: int,
    after: str | None,
    order: str,
    context: RequestContext,
  ) -> Page[ThreadMetadata]:
    async with self._lock:
      state = await self._read_state()
      threads = [self._parse_thread(payload) for payload in state["threads"].values()]
      threads = [
        thread
        for thread in threads
        if thread.metadata.get("workspace_id") == context.workspace_id
        and thread.metadata.get("surface") == context.surface
      ]
      threads.sort(key=lambda thread: thread.created_at)
      return self._paginate(threads, after, limit, order)

  async def add_thread_item(self, thread_id: str, item: ThreadItem, context: RequestContext) -> None:
    async with self._lock:
      state = await self._read_state()
      items = state["items"].setdefault(thread_id, [])
      items.append(self._serialize_item(item))
      items.sort(key=lambda payload: payload["created_at"])
      await self._write_state(state)

  async def save_item(self, thread_id: str, item: ThreadItem, context: RequestContext) -> None:
    async with self._lock:
      state = await self._read_state()
      items = state["items"].setdefault(thread_id, [])

      for index, payload in enumerate(items):
        if payload["id"] == item.id:
          items[index] = self._serialize_item(item)
          break
      else:
        items.append(self._serialize_item(item))

      items.sort(key=lambda payload: payload["created_at"])
      await self._write_state(state)

  async def load_item(self, thread_id: str, item_id: str, context: RequestContext) -> ThreadItem:
    async with self._lock:
      state = await self._read_state()

      for payload in state["items"].get(thread_id, []):
        if payload["id"] == item_id:
          return self._parse_item(payload)

      raise NotFoundError(f"Item {item_id} not found in thread {thread_id}")

  async def delete_thread(self, thread_id: str, context: RequestContext) -> None:
    async with self._lock:
      state = await self._read_state()
      state["threads"].pop(thread_id, None)
      state["items"].pop(thread_id, None)
      await self._write_state(state)

  async def delete_thread_item(self, thread_id: str, item_id: str, context: RequestContext) -> None:
    async with self._lock:
      state = await self._read_state()
      items = state["items"].get(thread_id, [])
      state["items"][thread_id] = [payload for payload in items if payload["id"] != item_id]
      await self._write_state(state)


class WorkspaceTagConverter(ThreadItemConverter):
  async def attachment_to_message_content(self, attachment: Attachment) -> ResponseInputTextParam:
    metadata = attachment.metadata or {}
    summary_lines = [
      f"{'Image' if attachment.type == 'image' else 'File'} attachment: {attachment.name}",
      f"MIME type: {attachment.mime_type}",
    ]
    size_bytes = metadata.get("size_bytes")

    if isinstance(size_bytes, int):
      summary_lines.append(f"Size: {size_bytes} bytes")

    extracted_text = str(metadata.get("text_content") or "").strip()
    excerpt = str(metadata.get("excerpt") or "").strip()

    if extracted_text:
      summary_lines.append("Extracted attachment text:")
      summary_lines.append(extracted_text)

      if metadata.get("text_truncated"):
        summary_lines.append("[Attachment text truncated for context window safety.]")
    elif excerpt:
      summary_lines.append(f"Attachment excerpt:\n{excerpt}")
    else:
      summary_lines.append("No machine-readable text was extracted from this attachment.")

    return ResponseInputTextParam(type="input_text", text="\n".join(summary_lines))

  async def tag_to_message_content(self, tag: UserMessageTagContent) -> ResponseInputTextParam:
    data = tag.data or {}

    if data.get("kind") == "paper-selection":
      selection_summary = [
        f"Selected passage label: {tag.text}",
        f"Page: {data.get('pageNumber')}",
        f"Section: {data.get('sectionTitle') or 'Unknown'}",
      ]

      if data.get("agentName"):
        selection_summary.append(f"Agent: {data['agentName']}")

      quote_text = str(data.get("text") or "").strip()
      context_text = str(data.get("contextText") or "").strip()

      if quote_text:
        selection_summary.append(f"Quoted passage:\n{quote_text}")

      if context_text:
        selection_summary.append(f"Section context:\n{context_text}")

      return ResponseInputTextParam(
        type="input_text",
        text="\n".join(selection_summary),
      )

    if data.get("kind") == "section-reference":
      section_summary = [
        f"Referenced section: {tag.text}",
        f"Page: {data.get('pageNumber')}",
      ]

      if data.get("agentName"):
        section_summary.append(f"Assigned agent: {data['agentName']}")

      return ResponseInputTextParam(type="input_text", text="\n".join(section_summary))

    if data.get("kind") == "agent-reference":
      return ResponseInputTextParam(
        type="input_text",
        text=f"Referenced agent: {tag.text} ({data.get('role') or 'collaborator'})",
      )

    if data.get("kind") == "message-reference":
      message_summary = [
        f"Referenced message author: {data.get('authorName') or tag.text}",
      ]

      if data.get("pageNumber") or data.get("sectionTitle"):
        location_parts = []

        if data.get("pageNumber"):
          location_parts.append(f"Page {data['pageNumber']}")

        if data.get("sectionTitle"):
          location_parts.append(str(data["sectionTitle"]))

        message_summary.append(f"Linked paper context: {' · '.join(location_parts)}")

      excerpt = str(data.get("excerpt") or "").strip()

      if excerpt:
        message_summary.append(f"Referenced message text:\n{excerpt}")

      return ResponseInputTextParam(type="input_text", text="\n".join(message_summary))

    if data.get("kind") == "author-marker":
      return ResponseInputTextParam(
        type="input_text",
        text=f"Message authored by {data.get('authorName') or tag.text} ({data.get('authorType') or 'collaborator'})",
      )

    return ResponseInputTextParam(type="input_text", text=f"Context tag: {tag.text}")


class WorkspaceChatKitServer(ChatKitServer[RequestContext]):
  def __init__(
    self,
    store: Store[RequestContext],
    context_api_base_url: str,
    public_base_url: str,
    attachment_blob_store: AttachmentBlobStoreRouter,
    model: str,
  ):
    super().__init__(store=store)
    self.context_api_base_url = context_api_base_url.rstrip("/")
    self.public_base_url = public_base_url.rstrip("/")
    self.attachment_blobs = attachment_blob_store
    self.model = model
    self.converter = WorkspaceTagConverter()

  def _thread_id(self, context: RequestContext) -> str:
    if context.decision_id:
      return f"workspace-{context.workspace_id}-decision-{context.decision_id}"
    return f"workspace-{context.workspace_id}-{context.surface}"

  def _assistant_author_name(self) -> str:
    return "Workspace Context"

  def _thread_title(self, payload: SurfaceThreadPayload) -> str:
    return payload.threadTitle

  def _surface_label(self, surface: str) -> str:
    if surface == "workspace":
      return "Workspace"
    return "Proposal" if surface == "proposal" else "Draft"

  def _attachment_api_path(self, context: RequestContext, attachment_id: str) -> str:
    if context.decision_id:
      return f"/api/chatkit/workspaces/{context.workspace_id}/decisions/{context.decision_id}/attachments/{attachment_id}"
    return f"/api/chatkit/workspaces/{context.workspace_id}/{context.surface}/attachments/{attachment_id}"

  def _attachment_public_url(self, context: RequestContext, attachment_id: str) -> str:
    return f"{self.public_base_url}{self._attachment_api_path(context, attachment_id)}"

  def _is_text_attachment(self, mime_type: str, filename: str) -> bool:
    suffix = Path(filename).suffix.lower()
    normalized_mime_type = mime_type.lower()

    return normalized_mime_type.startswith(TEXT_ATTACHMENT_MIME_PREFIXES) or normalized_mime_type in TEXT_ATTACHMENT_MIME_TYPES or suffix in TEXT_ATTACHMENT_SUFFIXES

  def _extract_attachment_text(self, raw_bytes: bytes, mime_type: str, filename: str) -> tuple[str | None, bool]:
    if not self._is_text_attachment(mime_type, filename):
      return None, False

    decoded_text = raw_bytes.decode("utf-8", errors="replace").strip()

    if not decoded_text:
      return None, False

    if len(decoded_text) <= MAX_ATTACHMENT_TEXT_CHARS:
      return decoded_text, False

    return decoded_text[:MAX_ATTACHMENT_TEXT_CHARS].rstrip(), True

  async def _persist_upload(
    self,
    thread: ThreadMetadata,
    context: RequestContext,
    upload: UploadFile,
  ) -> Attachment:
    filename = Path(upload.filename or "attachment").name or "attachment"
    raw_bytes = await upload.read()

    if not raw_bytes:
      raise HTTPException(status_code=400, detail=f"Attachment '{filename}' is empty.")

    if len(raw_bytes) > MAX_ATTACHMENT_BYTES:
      raise HTTPException(
        status_code=400,
        detail=f"Attachment '{filename}' exceeds the {MAX_ATTACHMENT_BYTES // (1024 * 1024)} MB limit.",
      )

    mime_type = upload.content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"
    attachment_id = f"attachment_{uuid4().hex}"
    storage_metadata = await self.attachment_blobs.write_blob(
      thread.id,
      attachment_id,
      filename,
      raw_bytes,
      mime_type,
    )
    text_content, text_truncated = self._extract_attachment_text(raw_bytes, mime_type, filename)
    excerpt = normalize_excerpt(text_content) if text_content else None
    metadata = {
      "original_filename": filename,
      "size_bytes": len(raw_bytes),
      "excerpt": excerpt,
      "text_content": text_content,
      "text_truncated": text_truncated,
      **storage_metadata,
    }

    if mime_type.startswith("image/"):
      attachment = ImageAttachment(
        id=attachment_id,
        name=filename,
        mime_type=mime_type,
        thread_id=thread.id,
        preview_url=self._attachment_public_url(context, attachment_id),
        metadata=metadata,
      )
    else:
      attachment = FileAttachment(
        id=attachment_id,
        name=filename,
        mime_type=mime_type,
        thread_id=thread.id,
        metadata=metadata,
      )

    await self.store.save_attachment(attachment, context)
    return attachment

  async def _persist_uploads(
    self,
    thread: ThreadMetadata,
    context: RequestContext,
    uploads: list[UploadFile],
  ) -> list[Attachment]:
    if len(uploads) > MAX_MESSAGE_ATTACHMENTS:
      raise HTTPException(
        status_code=400,
        detail=f"You can attach up to {MAX_MESSAGE_ATTACHMENTS} files per message.",
      )

    attachments: list[Attachment] = []

    for upload in uploads:
      attachments.append(await self._persist_upload(thread, context, upload))

    return attachments

  def _build_attachment_view(
    self,
    context: RequestContext,
    attachment: Attachment,
  ) -> WorkspaceAttachmentView:
    metadata = attachment.metadata or {}
    size_bytes = metadata.get("size_bytes")

    return WorkspaceAttachmentView(
      id=attachment.id,
      type=attachment.type,
      name=attachment.name,
      mimeType=attachment.mime_type,
      sizeBytes=size_bytes if isinstance(size_bytes, int) else None,
      excerpt=str(metadata.get("excerpt") or "").strip() or None,
      previewUrl=self._attachment_api_path(context, attachment.id) if attachment.type == "image" else None,
      downloadUrl=self._attachment_api_path(context, attachment.id),
    )

  async def load_workspace_attachment(
    self,
    context: RequestContext,
    attachment_id: str,
  ) -> tuple[Attachment, bytes]:
    thread = await self.ensure_workspace_thread(context)
    attachment = await self.store.load_attachment(attachment_id, context)

    if attachment.thread_id and attachment.thread_id != thread.id:
      raise NotFoundError(f"Attachment {attachment_id} was not found in thread {thread.id}")
    return attachment, await self.attachment_blobs.read_blob(attachment)

  async def _fetch_surface_context(self, context: RequestContext) -> SurfaceThreadPayload:
    async with httpx.AsyncClient(timeout=15) as client:
      response = await client.get(
        f"{self.context_api_base_url}/api/workspaces/{context.workspace_id}/chat-context",
        params={
          "surface": context.surface,
          **({"decisionId": context.decision_id} if context.decision_id else {}),
        },
        headers={CHATKIT_SHARED_SECRET_HEADER: resolve_chatkit_shared_secret()},
      )
      response.raise_for_status()
      return SurfaceThreadPayload.model_validate(response.json())

  def _build_hidden_context(self, payload: SurfaceThreadPayload) -> str:
    collaborator_lines = [
      f"- {collaborator['name']} ({collaborator['role']})"
      for collaborator in payload.collaborators
    ]
    section_lines = [
      f"- p.{section['pageNumber']} {section['title']}"
      + (f" [{section['agentName']}]" if section.get("agentName") else "")
      for section in payload.sections
    ]

    evidence_lines = [
      f"- cell {evidence['cellId']} · execution {evidence['executionId']}"
      + (f" · output {evidence['outputId']}" if evidence.get("outputId") else "")
      + (f" · section {evidence['sectionId']}" if evidence.get("sectionId") else "")
      + (f" · artifact {evidence['artifactId']}" if evidence.get("artifactId") else "")
      for evidence in payload.evidenceLinks
    ]
    decision_lines = [
      f"- {decision['title']}: {decision['summary']}"
      for decision in payload.otherDecisionDigests
    ]

    return "\n".join(
      [
        f"Workspace: {payload.paperTitle}",
        f"Surface: {payload.surfaceTitle}",
        *( [
          f"Active decision: {payload.activeDecision.get('title')}",
          f"Decision status: {payload.activeDecision.get('status')}",
        ] if payload.activeDecision else [] ),
        "Participants:",
        *collaborator_lines,
        "Sections:",
        *section_lines,
        "",
        "Current manuscript text:",
        payload.manuscriptText,
        "",
        "Notebook summary:",
        (payload.notebookSummary or "No notebook summary available.").strip(),
        "",
        "Linked evidence:",
        *(evidence_lines or ["- None"]),
        "",
        "Other open decisions:",
        *(decision_lines or ["- None"]),
      ]
    )

  def _context_hash(self, payload: SurfaceThreadPayload) -> str:
    return hashlib.sha256(self._build_hidden_context(payload).encode("utf-8")).hexdigest()

  def _selection_card(
    self,
    *,
    author_name: str,
    author_accent: str | None,
    surface: str,
    selection: SelectionPayload,
    body_text: str | None = None,
  ) -> Card:
    header = " · ".join(
      [
        author_name,
        self._surface_label(surface),
        f"Page {selection.pageNumber}",
      ]
    )
    section_title = selection.sectionTitle or "Selected passage"
    quote_markdown = f"> {selection.text.strip().replace(chr(10), chr(10) + '> ')}"
    message_markdown = body_text.strip() if body_text else None

    return Card(
      background={"dark": "#1c1c20", "light": "#fff4ef"},
      size="full",
      padding=16,
      children=[
        Col(
          gap=10,
          children=[
            Text(
              value=header,
              weight="bold",
              size="sm",
              color={"dark": author_accent or "#fa7315", "light": author_accent or "#c24d12"},
            ),
            Text(value=section_title, weight="medium", size="sm", color="secondary"),
            Divider(color="subtle", spacing=0),
            Markdown(value=quote_markdown),
            *( [Markdown(value=message_markdown)] if message_markdown else [] ),
          ],
        )
      ],
    )

  async def _add_hidden_context_item(
    self,
    thread: ThreadMetadata,
    context: RequestContext,
    content: str,
  ) -> HiddenContextItem:
    item = HiddenContextItem(
      id=self.store.generate_item_id("message", thread, context),
      thread_id=thread.id,
      created_at=datetime.now(),
      content=content,
    )
    await self.store.add_thread_item(thread.id, item, context)
    return item

  async def _sync_surface_context(
    self,
    thread: ThreadMetadata,
    context: RequestContext,
  ) -> SurfaceThreadPayload:
    payload = await self._fetch_surface_context(context)
    content_hash = self._context_hash(payload)
    existing_hash = thread.metadata.get("context_hash")
    existing_item_id = thread.metadata.get("context_item_id")

    if existing_hash == content_hash and existing_item_id:
      return payload

    if existing_item_id:
      await self.store.delete_thread_item(thread.id, str(existing_item_id), context)

    hidden_item = await self._add_hidden_context_item(
      thread,
      context,
      self._build_hidden_context(payload),
    )
    thread.title = self._thread_title(payload)
    thread.metadata["workspace_id"] = context.workspace_id
    thread.metadata["surface"] = context.surface
    thread.metadata["paper_title"] = payload.paperTitle
    thread.metadata["context_hash"] = content_hash
    thread.metadata["context_item_id"] = hidden_item.id
    await self.store.save_thread(thread, context)

    return payload

  async def ensure_workspace_thread(self, context: RequestContext) -> ThreadMetadata:
    payload = await self._fetch_surface_context(context)
    thread_id = payload.threadId or self._thread_id(context)

    try:
      thread = await self.store.load_thread(thread_id, context)
    except NotFoundError:
      thread = ThreadMetadata(
        id=thread_id,
        title=self._thread_title(payload),
        created_at=datetime.now(),
        metadata={
          "workspace_id": context.workspace_id,
          "surface": context.surface,
          "paper_title": payload.paperTitle,
          "seeded": False,
        },
      )
      await self.store.save_thread(thread, context)

    await self._merge_legacy_workspace_threads(thread, context)
    payload = await self._sync_surface_context(thread, context)

    if not thread.metadata.get("seeded"):
      thread.metadata["seeded"] = True
      await self.store.save_thread(thread, context)

    await self._sync_seed_messages(thread, context, payload.seedMessages)

    return thread

  async def _merge_legacy_workspace_threads(
    self,
    thread: ThreadMetadata,
    context: RequestContext,
  ) -> None:
    if context.surface != "workspace" or context.decision_id or thread.metadata.get("legacy_migrated"):
      return

    existing_items = await self.store.load_thread_items(
      thread.id,
      after=None,
      limit=MAX_THREAD_ITEMS,
      order="asc",
      context=context,
    )
    existing_ids = {item.id for item in existing_items.data}
    legacy_items: list[ThreadItem] = []

    for legacy_surface in ("proposal", "draft"):
      legacy_context = RequestContext(
        workspace_id=context.workspace_id,
        surface=legacy_surface,
      )
      legacy_thread_id = self._thread_id(legacy_context)

      try:
        await self.store.load_thread(legacy_thread_id, legacy_context)
      except NotFoundError:
        continue

      items = await self.store.load_thread_items(
        legacy_thread_id,
        after=None,
        limit=MAX_THREAD_ITEMS,
        order="asc",
        context=legacy_context,
      )
      legacy_items.extend(
        item
        for item in items.data
        if not isinstance(item, (HiddenContextItem, SDKHiddenContextItem))
      )

    legacy_items.sort(key=lambda item: item.created_at)

    for item in legacy_items:
      if item.id in existing_ids:
        continue

      migrated_item = item.model_copy(deep=True)
      migrated_item.thread_id = thread.id
      await self.store.add_thread_item(thread.id, migrated_item, context)
      existing_ids.add(migrated_item.id)

    thread.metadata["legacy_migrated"] = True
    await self.store.save_thread(thread, context)

  def _build_author_tag(
    self,
    *,
    author_id: str | None,
    author_name: str,
    author_type: str,
    author_accent: str | None,
  ) -> UserMessageTagContent:
    return UserMessageTagContent(
      id=f"author-{author_type}-{author_name.lower().replace(' ', '-')}",
      text=author_name,
      group="Author",
      interactive=False,
      data={
        "kind": "author-marker",
        "authorId": author_id,
        "authorName": author_name,
        "authorType": author_type,
        "authorAccent": author_accent,
      },
    )

  def _build_selection_tag(self, selection: SelectionPayload) -> UserMessageTagContent:
    return UserMessageTagContent(
      id=f"selection-{selection.sectionId or 'passage'}-{selection.pageNumber}",
      text=f"{selection.sectionTitle or 'Selection'} · p.{selection.pageNumber}",
      group="Selection",
      interactive=False,
      data={
        "kind": "paper-selection",
        **selection.model_dump(exclude_none=True),
      },
    )

  def _build_message_reference_tag(self, message_reference: MessageReferencePayload) -> UserMessageTagContent:
    return UserMessageTagContent(
      id=f"message-reference-{message_reference.messageId}",
      text=f"{message_reference.authorName} · prior message",
      group="Message",
      interactive=False,
      data={
        "kind": "message-reference",
        **message_reference.model_dump(exclude_none=True),
      },
    )

  def _build_workspace_reference_tag(self, reference: dict[str, Any]) -> UserMessageTagContent:
    normalized_reference = dict(reference)
    reference_kind = str(normalized_reference.get("kind") or "reference")
    reference_title = str(
      normalized_reference.get("title")
      or normalized_reference.get("sectionTitle")
      or normalized_reference.get("artifactId")
      or reference_kind.replace("_", " ")
    )
    reference_hash = hashlib.sha1(
      json.dumps(normalized_reference, sort_keys=True, default=str).encode("utf-8")
    ).hexdigest()[:16]

    return UserMessageTagContent(
      id=f"workspace-reference-{reference_hash}",
      text=reference_title,
      group="Reference",
      interactive=False,
      data={
        "kind": "workspace-reference",
        "reference": normalized_reference,
      },
    )

  def _build_workspace_message_item(
    self,
    thread: ThreadMetadata,
    context: RequestContext,
    *,
    text: str,
    selection: SelectionPayload | None = None,
    message_reference: MessageReferencePayload | None = None,
    references: list[dict[str, Any]] | None = None,
    author_id: str | None = None,
    author_name: str | None = None,
    author_type: str = "human",
    author_accent: str | None = None,
    attachments: list[Attachment] | None = None,
  ) -> UserMessageItem:
    content: list[UserMessageTagContent | UserMessageTextContent] = []

    if author_name:
      content.append(
        self._build_author_tag(
          author_id=author_id,
          author_name=author_name,
          author_type=author_type,
          author_accent=author_accent,
        )
      )

    if selection:
      content.append(self._build_selection_tag(selection))

    if message_reference:
      content.append(self._build_message_reference_tag(message_reference))

    for reference in references or []:
      content.append(self._build_workspace_reference_tag(reference))

    if text.strip():
      content.append(UserMessageTextContent(text=text.strip()))

    return UserMessageItem(
      id=self.store.generate_item_id("message", thread, context),
      thread_id=thread.id,
      created_at=datetime.now(),
      content=content,
      attachments=attachments or [],
      quoted_text=None,
      inference_options=InferenceOptions(),
    )

  def _extract_message_text(self, item: UserMessageItem | AssistantMessageItem) -> str:
    if isinstance(item, AssistantMessageItem):
      return "\n\n".join(
        content.text.strip()
        for content in item.content
        if content.text.strip()
      )

    return "\n\n".join(
      content.text.strip()
      for content in item.content
      if isinstance(content, UserMessageTextContent) and content.text.strip()
    )

  def _extract_selection(self, item: UserMessageItem) -> SelectionPayload | None:
    for content in item.content:
      if isinstance(content, UserMessageTagContent) and (content.data or {}).get("kind") == "paper-selection":
        try:
          return SelectionPayload.model_validate(content.data)
        except Exception:
          return None

    return None

  def _extract_message_reference(self, item: UserMessageItem) -> MessageReferencePayload | None:
    for content in item.content:
      if isinstance(content, UserMessageTagContent) and (content.data or {}).get("kind") == "message-reference":
        try:
          return MessageReferencePayload.model_validate(content.data)
        except Exception:
          return None

    return None

  def _extract_workspace_references(self, item: UserMessageItem) -> list[dict[str, Any]]:
    references: list[dict[str, Any]] = []

    for content in item.content:
      if not isinstance(content, UserMessageTagContent):
        continue

      data = content.data or {}

      if data.get("kind") != "workspace-reference":
        continue

      reference = data.get("reference")

      if isinstance(reference, dict):
        references.append(dict(reference))

    return references

  def _describe_workspace_reference(self, reference: dict[str, Any]) -> list[str]:
    kind = str(reference.get("kind") or "reference")
    title = str(reference.get("title") or reference.get("sectionTitle") or kind.replace("_", " "))
    excerpt = str(reference.get("excerpt") or reference.get("text") or "").strip()

    if kind == "artifact":
      prefix = f"Referenced workspace artifact: {title}."
    elif kind == "message":
      prefix = f"Referenced prior message: {title}."
    elif kind == "manuscript_selection":
      prefix = f"Referenced manuscript selection: {title}."
    elif kind == "notebook_cell":
      prefix = f"Referenced notebook cell: {title}."
    elif kind == "notebook_execution":
      prefix = f"Referenced notebook execution: {title}."
    elif kind == "notebook_output":
      prefix = f"Referenced notebook output: {title}."
    else:
      prefix = f"Referenced workspace item: {title}."

    lines = [prefix]

    if excerpt:
      lines.append(excerpt)

    return lines

  def _extract_author_metadata(
    self,
    item: UserMessageItem,
  ) -> tuple[str | None, str | None, str | None, str | None]:
    for content in item.content:
      if isinstance(content, UserMessageTagContent) and (content.data or {}).get("kind") == "author-marker":
        data = content.data or {}
        return (
          str(data.get("authorId")) if data.get("authorId") else None,
          str(data.get("authorName") or content.text),
          str(data.get("authorType") or "agent"),
          str(data.get("authorAccent")) if data.get("authorAccent") else None,
        )

    return None, None, None, None

  def _resolve_collaborator_accent(
    self,
    payload: SurfaceThreadPayload | None,
    author_id: str | None,
    fallback: str | None,
  ) -> str | None:
    if author_id and payload:
      for collaborator in payload.collaborators:
        if collaborator.get("id") == author_id:
          accent = collaborator.get("accent")

          if isinstance(accent, str) and accent.strip():
            return accent.strip()

    return fallback

  def _tokenize_anchor_text(self, value: str) -> list[str]:
    return [
      token
      for token in re.sub(r"[^a-z0-9]+", " ", value.lower()).split()
      if len(token) > 2 and token not in ANCHOR_STOP_WORDS
    ]

  def _count_anchor_overlap(self, source: list[str], target: list[str]) -> int:
    if not source or not target:
      return 0

    target_set = set(target)
    return sum(1 for token in source if token in target_set)

  def _infer_anchor_label(self, section_title: str, message_content: str) -> str:
    title = section_title.lower()
    content = message_content.lower()

    if "results" in title:
      return (
        "Benchmark result summary"
        if re.search(r"(mae|r2|result|ridge|lasso|forest|benchmark)", content)
        else "Results summary"
      )

    if "experimental setup" in title or "approach" in title:
      return (
        "Minimal benchmark plan"
        if re.search(r"(benchmark|compare|subset|regressor|sample|split|run)", content)
        else "Evaluation plan"
      )

    if "introduction" in title:
      return "Manuscript framing"

    if "problem" in title:
      return "Research question"

    if "collaboration" in title:
      return "Collaboration plan"

    if "discussion" in title:
      return "Interpretation note"

    first_sentence = re.split(r"[.!?]", re.sub(r"\s+", " ", message_content).strip())[0].strip()

    if not first_sentence:
      return re.sub(r"^(Proposal|Draft)\s+·\s+", "", section_title, flags=re.IGNORECASE)

    return (
      f"{first_sentence[:69].rstrip()}…"
      if len(first_sentence) > 72
      else first_sentence
    )

  def _infer_workspace_message_selection(
    self,
    *,
    message: WorkspaceMessageView,
    payload: SurfaceThreadPayload | None,
  ) -> SelectionPayload | None:
    if (
      not payload
      or message.role != "agent"
      or message.selection
      or message.messageReference
      or message.references
      or message.attachments
      or not message.authorId
      or message.authorId == "workspace_context"
    ):
      return None

    content_tokens = self._tokenize_anchor_text(message.content)

    if not content_tokens or not payload.sections:
      return None

    content_lower = message.content.lower()
    best_section: dict[str, Any] | None = None
    best_score = -1

    for section in payload.sections:
      title = str(section.get("title") or "")
      body = str(section.get("text") or "")
      title_lower = title.lower()
      score = self._count_anchor_overlap(content_tokens, self._tokenize_anchor_text(title)) * 3
      score += self._count_anchor_overlap(content_tokens, self._tokenize_anchor_text(body))

      if "results" in title_lower and re.search(r"(result|benchmark|mae|r2|ridge|lasso|forest)", content_lower):
        score += 7

      if (
        ("experimental setup" in title_lower or "approach" in title_lower)
        and re.search(r"(benchmark|compare|subset|sample|regressor|split|run)", content_lower)
      ):
        score += 5

      if (
        ("introduction" in title_lower or "problem" in title_lower)
        and re.search(r"(anchor|manuscript|informative|question|study|scope)", content_lower)
      ):
        score += 4

      if "collaboration" in title_lower and re.search(r"(sandbox|collaborat|second account)", content_lower):
        score += 4

      if section.get("agentId") == message.authorId:
        score += 3

      if score > best_score:
        best_score = score
        best_section = section

    if not best_section or best_score < 1:
      return None

    section_id = str(best_section.get("id") or "").strip() or None
    section_title = re.sub(
      r"^(Proposal|Draft)\s+·\s+",
      "",
      str(best_section.get("title") or "").strip(),
      flags=re.IGNORECASE,
    ).strip() or None
    page_number = best_section.get("pageNumber")

    return SelectionPayload(
      text=self._infer_anchor_label(str(best_section.get("title") or ""), message.content),
      pageNumber=page_number if isinstance(page_number, int) and page_number > 0 else 1,
      sectionId=section_id,
      sectionTitle=section_title,
      agentId=message.authorId,
      agentName=message.authorName,
      contextText=str(best_section.get("text") or "").strip() or None,
    )

  def _normalize_workspace_message(
    self,
    *,
    message: WorkspaceMessageView,
    payload: SurfaceThreadPayload | None,
  ) -> WorkspaceMessageView:
    normalized_selection = message.selection or self._infer_workspace_message_selection(
      message=message,
      payload=payload,
    )

    if normalized_selection:
      selection_update: dict[str, Any] = {}

      if not normalized_selection.agentId and message.authorId:
        selection_update["agentId"] = message.authorId

      if not normalized_selection.agentName and message.authorName:
        selection_update["agentName"] = message.authorName

      if not normalized_selection.contextText and normalized_selection.sectionId and payload:
        matching_section = next(
          (
            section
            for section in payload.sections
            if str(section.get("id") or "").strip() == normalized_selection.sectionId
          ),
          None,
        )

        if matching_section:
          context_text = str(matching_section.get("text") or "").strip()

          if context_text:
            selection_update["contextText"] = context_text

      if selection_update:
        normalized_selection = normalized_selection.model_copy(update=selection_update)

    normalized_message_reference = message.messageReference

    if normalized_message_reference:
      resolved_reference_accent = self._resolve_collaborator_accent(
        payload,
        normalized_message_reference.authorId,
        normalized_message_reference.authorAccent,
      )

      if resolved_reference_accent != normalized_message_reference.authorAccent:
        normalized_message_reference = normalized_message_reference.model_copy(
          update={"authorAccent": resolved_reference_accent}
        )

    resolved_author_accent = self._resolve_collaborator_accent(
      payload,
      message.authorId,
      message.authorAccent,
    )

    if (
      resolved_author_accent == message.authorAccent
      and normalized_selection == message.selection
      and normalized_message_reference == message.messageReference
    ):
      return message

    return message.model_copy(
      update={
        "authorAccent": resolved_author_accent,
        "selection": normalized_selection,
        "messageReference": normalized_message_reference,
      }
    )

  def _build_seed_message_signature(
    self,
    *,
    author_id: str | None,
    author_name: str | None,
    content: str,
    selection: SelectionPayload | None = None,
    message_reference: MessageReferencePayload | None = None,
    references: list[dict[str, Any]] | None = None,
  ) -> str:
    author_key = (author_id or author_name or "").strip()
    content_key = normalize_excerpt(content, limit=4000)
    selection_key = (
      json.dumps(selection.model_dump(exclude_none=True), sort_keys=True)
      if selection
      else ""
    )
    message_reference_key = (
      json.dumps(message_reference.model_dump(exclude_none=True), sort_keys=True)
      if message_reference
      else ""
    )
    reference_key = (
      json.dumps(references or [], sort_keys=True, default=str)
      if references
      else ""
    )
    return f"{author_key}\n{content_key}\n{selection_key}\n{message_reference_key}\n{reference_key}"

  async def _sync_seed_messages(
    self,
    thread: ThreadMetadata,
    context: RequestContext,
    seed_messages: list[dict[str, Any]],
  ) -> None:
    if not seed_messages:
      return

    seed_payloads = [AgentMessagePayload.model_validate(seed_message) for seed_message in seed_messages]
    expected_signatures = {
      self._build_seed_message_signature(
        author_id=payload.agentId,
        author_name=payload.agentName,
        content=payload.content,
        selection=payload.selection,
        message_reference=payload.messageReference,
        references=payload.references,
      )
      for payload in seed_payloads
    }
    existing_items = await self.store.load_thread_items(
      thread.id,
      after=None,
      limit=MAX_THREAD_ITEMS,
      order="asc",
      context=context,
    )
    existing_signatures: set[str] = set()
    duplicate_item_ids: list[str] = []

    for item in existing_items.data:
      if not isinstance(item, UserMessageItem):
        continue

      author_id, author_name, _, _ = self._extract_author_metadata(item)
      content = self._extract_message_text(item)
      selection = self._extract_selection(item)
      message_reference = self._extract_message_reference(item)
      references = self._extract_workspace_references(item)

      if not content and not author_name:
        continue

      signature = self._build_seed_message_signature(
        author_id=author_id,
        author_name=author_name,
        content=content,
        selection=selection,
        message_reference=message_reference,
        references=references,
      )

      if signature not in expected_signatures:
        continue

      if signature in existing_signatures:
        duplicate_item_ids.append(item.id)
        continue

      existing_signatures.add(signature)

    for item_id in duplicate_item_ids:
      await self.store.delete_thread_item(thread.id, item_id, context)

    for payload in seed_payloads:
      signature = self._build_seed_message_signature(
        author_id=payload.agentId,
        author_name=payload.agentName,
        content=payload.content,
        selection=payload.selection,
        message_reference=payload.messageReference,
        references=payload.references,
      )

      if signature in existing_signatures:
        continue

      await self._append_agent_message_to_thread(thread, context, payload)
      existing_signatures.add(signature)

  async def list_workspace_messages(
    self,
    context: RequestContext,
  ) -> tuple[ThreadMetadata, list[WorkspaceMessageView]]:
    thread = await self.ensure_workspace_thread(context)
    payload: SurfaceThreadPayload | None = None

    if context.surface == "workspace" and not context.decision_id:
      try:
        payload = await self._fetch_surface_context(context)
      except Exception:
        payload = None

    items = await self.store.load_thread_items(
      thread.id,
      after=None,
      limit=MAX_THREAD_ITEMS,
      order="asc",
      context=context,
    )
    messages: list[WorkspaceMessageView] = []

    for item in items.data:
      if isinstance(item, (HiddenContextItem, SDKHiddenContextItem, WidgetItem)):
        continue

      if isinstance(item, AssistantMessageItem):
        content = self._extract_message_text(item)

        if not content:
          continue

        messages.append(
          WorkspaceMessageView(
            id=item.id,
            role="assistant",
            authorId=None,
            authorName=self._assistant_author_name(),
            content=content,
            messageReference=None,
            attachments=[],
            createdAt=item.created_at,
          )
        )
        continue

      if isinstance(item, UserMessageItem):
        author_id, author_name, author_type, author_accent = self._extract_author_metadata(item)
        content = self._extract_message_text(item)
        selection = self._extract_selection(item)
        message_reference = self._extract_message_reference(item)
        references = self._extract_workspace_references(item)

        messages.append(
          self._normalize_workspace_message(
            message=WorkspaceMessageView(
            id=item.id,
            role="agent" if author_type == "agent" else "user",
            authorId=author_id,
            authorName=author_name or "You",
            authorAccent=author_accent,
            content=content,
            selection=selection,
            messageReference=message_reference,
            references=references,
            attachments=[self._build_attachment_view(context, attachment) for attachment in item.attachments],
            createdAt=item.created_at,
            ),
            payload=payload,
          )
        )

    return thread, messages

  async def post_workspace_message(
    self,
    context: RequestContext,
    payload: WorkspaceMessagePayload,
    uploads: list[UploadFile] | None = None,
  ) -> UserMessageItem:
    thread = await self.ensure_workspace_thread(context)
    attachments = await self._persist_uploads(thread, context, uploads or [])
    item = self._build_workspace_message_item(
      thread,
      context,
      text=payload.text,
      selection=payload.selection,
      message_reference=payload.messageReference,
      references=payload.references,
      author_id=payload.authorId,
      author_name=payload.authorName,
      author_type="agent" if payload.authorName else "human",
      author_accent=payload.authorAccent,
      attachments=attachments,
    )

    async for _ in self._process_new_thread_item_respond(thread, item, context):
      pass

    return item

  async def add_agent_message(
    self,
    context: RequestContext,
    payload: AgentMessagePayload,
  ) -> UserMessageItem:
    thread = await self.ensure_workspace_thread(context)
    return await self._append_agent_message_to_thread(thread, context, payload)

  async def _append_agent_message_to_thread(
    self,
    thread: ThreadMetadata,
    context: RequestContext,
    payload: AgentMessagePayload,
  ) -> UserMessageItem:
    item = self._build_workspace_message_item(
      thread,
      context,
      text=payload.content,
      selection=payload.selection,
      message_reference=payload.messageReference,
      references=payload.references,
      author_id=payload.agentId,
      author_name=payload.agentName,
      author_type="agent",
      author_accent=payload.agentAccent,
    )
    await self.store.add_thread_item(thread.id, item, context)

    hidden_lines = [f"Agent {payload.agentName} wrote: {payload.content.strip()}"]
    if payload.selection:
      hidden_lines.append(
        f"Selection context: page {payload.selection.pageNumber}, {payload.selection.sectionTitle or 'unknown section'}."
      )
      hidden_lines.append(payload.selection.text.strip())
      if payload.selection.contextText:
        hidden_lines.append(payload.selection.contextText.strip())

    if payload.messageReference:
      hidden_lines.append(
        f"Referenced prior message from {payload.messageReference.authorName}."
      )

      if payload.messageReference.pageNumber or payload.messageReference.sectionTitle:
        location_parts = []

        if payload.messageReference.pageNumber:
          location_parts.append(f"page {payload.messageReference.pageNumber}")

        if payload.messageReference.sectionTitle:
          location_parts.append(payload.messageReference.sectionTitle)

        hidden_lines.append(f"Referenced message context: {', '.join(location_parts)}.")

      if payload.messageReference.excerpt.strip():
        hidden_lines.append(payload.messageReference.excerpt.strip())

    for reference in payload.references:
      hidden_lines.extend(self._describe_workspace_reference(reference))

    await self._add_hidden_context_item(thread, context, "\n".join(hidden_lines))
    return item

  def _extract_selection_tags(self, input_user_message: UserMessageItem | None) -> list[SelectionPayload]:
    if not input_user_message:
      return []

    selections: list[SelectionPayload] = []

    for part in input_user_message.content:
      if isinstance(part, UserMessageTagContent) and (part.data or {}).get("kind") == "paper-selection":
        try:
          selections.append(SelectionPayload.model_validate(part.data))
        except Exception:
          continue

    return selections

  def _build_agent_instructions(self, payload: SurfaceThreadPayload) -> str:
    return "\n".join(
      [
        f"You are the shared {payload.surfaceTitle.lower()} collaboration assistant for the paper '{payload.paperTitle}'.",
        "The thread is shared among multiple agents and a human operator.",
        "Use the manuscript text, selected-passage context, and referenced prior messages already present in the thread.",
        "When relevant, mention page numbers and section titles explicitly.",
        "Write like a research collaborator: make claims, ask clarifying questions, request evidence, or suggest revisions.",
        "Prefer concise, collaborative guidance that helps the next agent decide what to revise, cite, or question.",
        "Do not default to operational progress updates like 'I am working on this section' unless timing itself is the point.",
        "Do not pretend to know facts outside the visible manuscript context unless the thread already provides them.",
        "",
        "Internal platform guidance (AGENTS.md):",
        load_internal_agent_guidance(),
      ]
    )

  async def respond(
    self,
    thread: ThreadMetadata,
    input_user_message: UserMessageItem | None,
    context: RequestContext,
  ):
    payload = await self._sync_surface_context(thread, context)

    items = await self.store.load_thread_items(
      thread.id,
      after=None,
      limit=MAX_THREAD_ITEMS,
      order="asc",
      context=context,
    )
    agent_input = await self.converter.to_agent_input(items.data)
    agent = Agent(
      name=f"{payload.surfaceTitle} collaboration",
      instructions=self._build_agent_instructions(payload),
      model=self.model,
    )
    agent_context = AgentContext(thread=thread, store=self.store, request_context=context)
    result = Runner.run_streamed(
      agent,
      input=agent_input,
      conversation_id=thread.metadata.get("conversation_id"),
    )

    async for event in stream_agent_response(agent_context, result):
      yield event

    conversation_id = getattr(result, "_conversation_id", None)
    if conversation_id:
      thread.metadata["conversation_id"] = conversation_id

    if result.last_response_id:
      thread.metadata["last_response_id"] = result.last_response_id

    await self.store.save_thread(thread, context)


class PaperChatKitServer(WorkspaceChatKitServer):
  def _thread_id(self, context: RequestContext) -> str:
    return build_scoped_paper_thread_id(
      context.workspace_id,
      context.paper_thread_scope,
    )

  def _assistant_author_name(self) -> str:
    return "Paper Guide"

  def _surface_label(self, surface: str) -> str:
    return "Paper"

  def _attachment_api_path(self, context: RequestContext, attachment_id: str) -> str:
    if context.paper_context_source == "paper":
      return f"/api/chatkit/papers/{context.workspace_id}/attachments/{attachment_id}"

    return f"/api/chatkit/workspaces/{context.workspace_id}/paper/attachments/{attachment_id}"

  async def _fetch_surface_context(self, context: RequestContext) -> SurfaceThreadPayload:
    async with httpx.AsyncClient(timeout=15) as client:
      headers = {CHATKIT_SHARED_SECRET_HEADER: resolve_chatkit_shared_secret()}

      if context.paper_thread_scope:
        headers[PAPER_CHAT_THREAD_SCOPE_HEADER] = context.paper_thread_scope

      if context.paper_context_source == "paper":
        response = await client.get(
          f"{self.context_api_base_url}/api/papers/{context.workspace_id}/chat-context",
          headers=headers,
        )
      else:
        response = await client.get(
          f"{self.context_api_base_url}/api/workspaces/{context.workspace_id}/chat-context",
          params={"surface": "paper"},
          headers=headers,
        )

      response.raise_for_status()
      return SurfaceThreadPayload.model_validate(response.json())

  def _build_hidden_context(self, payload: SurfaceThreadPayload) -> str:
    contributor_lines = [
      f"- {collaborator['name']} ({collaborator['role']})"
      for collaborator in payload.collaborators
    ]
    section_lines = [
      f"- p.{section['pageNumber']} {section['title']}"
      for section in payload.sections
    ]

    return "\n".join(
      [
        f"Published paper: {payload.paperTitle}",
        "Contributors:",
        *contributor_lines,
        "Sections:",
        *section_lines,
        "",
        "Paper text:",
        payload.manuscriptText,
      ]
    )

  def _build_agent_instructions(self, payload: SurfaceThreadPayload) -> str:
    return "\n".join(
      [
        f"You are the user-facing paper assistant for the published paper '{payload.paperTitle}'.",
        "The thread is for human readers using the UI.",
        "Use the paper text, selected-passage context, referenced prior messages, and any user attachments already present in the thread.",
        "When the answer is grounded in the paper, mention page numbers and section titles explicitly when possible.",
        "Be clear about uncertainty. If the paper does not support a claim, say so instead of guessing.",
        "Help with explanation, summarization, critique, evidence checks, comparisons, and follow-up questions about the paper.",
        "Do not pretend to know unpublished workspace state, agent coordination context, or facts outside the visible paper and thread materials.",
      ]
    )


def resolve_store_path() -> Path:
  return Path(os.environ.get("AGENTARXIV_CHATKIT_STORE_PATH", DEFAULT_STORE_PATH))


def resolve_attachment_storage_path() -> Path:
  return Path(os.environ.get("AGENTARXIV_CHATKIT_ATTACHMENT_STORAGE_PATH", DEFAULT_ATTACHMENT_STORAGE_PATH))


def resolve_attachment_storage_backend() -> str:
  configured_backend = os.environ.get("AGENTARXIV_CHATKIT_ATTACHMENT_STORAGE_BACKEND", "").strip().lower()

  if configured_backend:
    return configured_backend

  if os.environ.get("AGENTARXIV_CHATKIT_GCS_BUCKET", "").strip():
    return "gcs"

  return DEFAULT_ATTACHMENT_STORAGE_BACKEND


def resolve_gcs_attachment_bucket() -> str | None:
  value = os.environ.get("AGENTARXIV_CHATKIT_GCS_BUCKET", "").strip()
  return value or None


def resolve_gcs_attachment_prefix() -> str:
  return os.environ.get("AGENTARXIV_CHATKIT_GCS_PREFIX", DEFAULT_GCS_ATTACHMENT_PREFIX).strip().strip("/")


def resolve_gcs_project() -> str | None:
  value = os.environ.get("AGENTARXIV_CHATKIT_GCS_PROJECT", "").strip()
  return value or None


def resolve_attachment_blob_store() -> AttachmentBlobStoreRouter:
  backend = resolve_attachment_storage_backend()
  local_store = FileAttachmentBlobStore(resolve_attachment_storage_path())
  gcs_bucket = resolve_gcs_attachment_bucket()
  gcs_store = (
    GCSAttachmentBlobStore(
      bucket_name=gcs_bucket,
      prefix=resolve_gcs_attachment_prefix(),
      project=resolve_gcs_project(),
    )
    if gcs_bucket
    else None
  )

  if backend == "gcs" and not gcs_store:
    raise RuntimeError(
      "AGENTARXIV_CHATKIT_GCS_BUCKET is required when the ChatKit attachment backend is set to gcs.",
    )

  if backend not in {"local", "gcs"}:
    raise RuntimeError(
      "AGENTARXIV_CHATKIT_ATTACHMENT_STORAGE_BACKEND must be either 'local' or 'gcs'.",
    )

  return AttachmentBlobStoreRouter(
    primary_backend=backend,
    local_store=local_store,
    gcs_store=gcs_store,
  )


def resolve_public_base_url() -> str:
  return (
    os.environ.get("AGENTARXIV_CHATKIT_PUBLIC_BASE_URL")
    or os.environ.get("AGENTARXIV_CHATKIT_BACKEND_URL")
    or DEFAULT_CHATKIT_PUBLIC_BASE_URL
  )


def resolve_chatkit_shared_secret() -> str:
  return os.environ.get("AGENTARXIV_CHATKIT_SHARED_SECRET", DEFAULT_CHATKIT_SHARED_SECRET)


def require_trusted_workspace_request(request: Request) -> None:
  if request.headers.get(CHATKIT_SHARED_SECRET_HEADER) != resolve_chatkit_shared_secret():
    raise HTTPException(status_code=401, detail="Missing trusted workspace proxy secret")


def parse_optional_model_json(raw_value: Any, model_type: type[BaseModel]):
  if raw_value in (None, "", "null"):
    return None

  try:
    return model_type.model_validate_json(str(raw_value))
  except Exception as exc:
    raise HTTPException(status_code=400, detail=f"Invalid {model_type.__name__} payload.") from exc


def parse_optional_reference_list(raw_value: Any) -> list[dict[str, Any]]:
  if raw_value in (None, "", "null"):
    return []

  try:
    return WORKSPACE_REFERENCE_ADAPTER.validate_json(str(raw_value))
  except Exception as exc:
    raise HTTPException(status_code=400, detail="Invalid workspace references payload.") from exc


def parse_optional_string(raw_value: Any) -> str | None:
  if raw_value is None:
    return None

  value = str(raw_value).strip()
  return value or None


async def parse_workspace_message_request(request: Request) -> tuple[WorkspaceMessagePayload, list[UploadFile]]:
  content_type = request.headers.get("content-type", "").lower()

  if "multipart/form-data" not in content_type:
    payload = WorkspaceMessagePayload.model_validate(await request.json())
    return payload, []

  form = await request.form()
  uploads = [value for value in form.getlist("files") if isinstance(value, (UploadFile, StarletteUploadFile))]
  payload = WorkspaceMessagePayload(
    text=parse_optional_string(form.get("text")) or "",
    selection=parse_optional_model_json(form.get("selection"), SelectionPayload),
    messageReference=parse_optional_model_json(form.get("messageReference"), MessageReferencePayload),
    references=parse_optional_reference_list(form.get("references")),
    authorId=parse_optional_string(form.get("authorId")),
    authorName=parse_optional_string(form.get("authorName")),
    authorAccent=parse_optional_string(form.get("authorAccent")),
  )
  return payload, uploads


store = DatabaseChatKitStore(resolve_store_path())
attachment_blob_store = resolve_attachment_blob_store()
chatkit_server = WorkspaceChatKitServer(
  store=store,
  context_api_base_url=os.environ.get(
    "AGENTARXIV_CONTEXT_API_BASE_URL",
    DEFAULT_CONTEXT_API_BASE_URL,
  ),
  public_base_url=resolve_public_base_url(),
  attachment_blob_store=attachment_blob_store,
  model=os.environ.get("OPENAI_CHATKIT_MODEL", DEFAULT_MODEL),
)
paper_chatkit_server = PaperChatKitServer(
  store=store,
  context_api_base_url=os.environ.get(
    "AGENTARXIV_CONTEXT_API_BASE_URL",
    DEFAULT_CONTEXT_API_BASE_URL,
  ),
  public_base_url=resolve_public_base_url(),
  attachment_blob_store=attachment_blob_store,
  model=os.environ.get("OPENAI_CHATKIT_MODEL", DEFAULT_MODEL),
)
app = FastAPI(title="AgentArxiv ChatKit Server")


@app.on_event("startup")
async def initialize_chatkit_store() -> None:
  await store.initialize()


@app.on_event("shutdown")
async def shutdown_chatkit_store() -> None:
  await store.close()


@app.get("/health")
async def health() -> dict[str, str]:
  return {"status": "ok"}


@app.post("/api/chatkit/workspaces/{workspace_id}/{surface}/thread")
async def ensure_thread(workspace_id: str, surface: str, request: Request):
  require_trusted_workspace_request(request)
  if surface not in {"workspace", "proposal", "draft", "paper"}:
    raise HTTPException(status_code=400, detail="Invalid surface")

  server = paper_chatkit_server if surface == "paper" else chatkit_server
  thread = await server.ensure_workspace_thread(
    build_request_context(workspace_id, surface, request),
  )

  return {
    "thread_id": thread.id,
    "title": thread.title,
  }


@app.post("/api/chatkit/workspaces/{workspace_id}/decisions/{decision_id}/thread")
async def ensure_decision_thread(workspace_id: str, decision_id: str, request: Request):
  require_trusted_workspace_request(request)

  thread = await chatkit_server.ensure_workspace_thread(
    build_request_context(workspace_id, "workspace", request, decision_id),
  )

  return {
    "thread_id": thread.id,
    "title": thread.title,
  }


@app.post("/api/chatkit/papers/{paper_id}/thread")
async def ensure_paper_thread(paper_id: str, request: Request):
  require_trusted_workspace_request(request)

  thread = await paper_chatkit_server.ensure_workspace_thread(
    build_request_context(paper_id, "paper", request, paper_context_source="paper"),
  )

  return {
    "thread_id": thread.id,
    "title": thread.title,
  }


@app.post("/api/chatkit/workspaces/{workspace_id}/{surface}/agent-message")
async def add_agent_message(workspace_id: str, surface: str, payload: AgentMessagePayload, request: Request):
  require_trusted_workspace_request(request)
  if surface not in {"workspace", "proposal", "draft"}:
    raise HTTPException(status_code=400, detail="Invalid surface")

  thread_item = await chatkit_server.add_agent_message(
    build_request_context(workspace_id, surface, request),
    payload,
  )

  return {
    "item_id": thread_item.id,
    "thread_id": thread_item.thread_id,
  }


@app.post("/api/chatkit/workspaces/{workspace_id}/decisions/{decision_id}/agent-message")
async def add_decision_agent_message(workspace_id: str, decision_id: str, payload: AgentMessagePayload, request: Request):
  require_trusted_workspace_request(request)

  thread_item = await chatkit_server.add_agent_message(
    build_request_context(workspace_id, "workspace", request, decision_id),
    payload,
  )

  return {
    "item_id": thread_item.id,
    "thread_id": thread_item.thread_id,
  }


@app.get("/api/chatkit/workspaces/{workspace_id}/{surface}/messages")
async def list_workspace_messages(workspace_id: str, surface: str, request: Request):
  require_trusted_workspace_request(request)
  if surface not in {"workspace", "proposal", "draft", "paper"}:
    raise HTTPException(status_code=400, detail="Invalid surface")

  server = paper_chatkit_server if surface == "paper" else chatkit_server
  thread, messages = await server.list_workspace_messages(
    build_request_context(workspace_id, surface, request),
  )

  return {
    "thread_id": thread.id,
    "title": thread.title,
    "messages": [message.model_dump(mode="json") for message in messages],
  }


@app.get("/api/chatkit/workspaces/{workspace_id}/decisions/{decision_id}/messages")
async def list_decision_messages(workspace_id: str, decision_id: str, request: Request):
  require_trusted_workspace_request(request)

  thread, messages = await chatkit_server.list_workspace_messages(
    build_request_context(workspace_id, "workspace", request, decision_id),
  )

  return {
    "thread_id": thread.id,
    "title": thread.title,
    "messages": [message.model_dump(mode="json") for message in messages],
  }


@app.get("/api/chatkit/papers/{paper_id}/messages")
async def list_paper_messages(paper_id: str, request: Request):
  require_trusted_workspace_request(request)

  thread, messages = await paper_chatkit_server.list_workspace_messages(
    build_request_context(paper_id, "paper", request, paper_context_source="paper"),
  )

  return {
    "thread_id": thread.id,
    "title": thread.title,
    "messages": [message.model_dump(mode="json") for message in messages],
  }


@app.get("/api/chatkit/workspaces/{workspace_id}/{surface}/attachments/{attachment_id}")
async def get_workspace_attachment(workspace_id: str, surface: str, attachment_id: str, request: Request):
  require_trusted_workspace_request(request)
  if surface not in {"workspace", "proposal", "draft", "paper"}:
    raise HTTPException(status_code=400, detail="Invalid surface")

  try:
    server = paper_chatkit_server if surface == "paper" else chatkit_server
    attachment, blob_bytes = await server.load_workspace_attachment(
      build_request_context(workspace_id, surface, request),
      attachment_id,
    )
  except NotFoundError as exc:
    raise HTTPException(status_code=404, detail=str(exc)) from exc

  disposition = "inline" if attachment.type == "image" else "attachment"
  filename = attachment.name.replace('"', "")

  return Response(
    content=blob_bytes,
    media_type=attachment.mime_type,
    headers={"content-disposition": f'{disposition}; filename="{filename}"'},
  )


@app.get("/api/chatkit/workspaces/{workspace_id}/decisions/{decision_id}/attachments/{attachment_id}")
async def get_decision_attachment(workspace_id: str, decision_id: str, attachment_id: str, request: Request):
  require_trusted_workspace_request(request)

  try:
    attachment, blob_bytes = await chatkit_server.load_workspace_attachment(
      build_request_context(workspace_id, "workspace", request, decision_id),
      attachment_id,
    )
  except NotFoundError as exc:
    raise HTTPException(status_code=404, detail=str(exc)) from exc

  disposition = "inline" if attachment.type == "image" else "attachment"
  filename = attachment.name.replace('"', "")

  return Response(
    content=blob_bytes,
    media_type=attachment.mime_type,
    headers={"content-disposition": f'{disposition}; filename="{filename}"'},
  )


@app.get("/api/chatkit/papers/{paper_id}/attachments/{attachment_id}")
async def get_paper_attachment(paper_id: str, attachment_id: str, request: Request):
  require_trusted_workspace_request(request)

  try:
    attachment, blob_bytes = await paper_chatkit_server.load_workspace_attachment(
      build_request_context(paper_id, "paper", request, paper_context_source="paper"),
      attachment_id,
    )
  except NotFoundError as exc:
    raise HTTPException(status_code=404, detail=str(exc)) from exc

  disposition = "inline" if attachment.type == "image" else "attachment"
  filename = attachment.name.replace('"', "")

  return Response(
    content=blob_bytes,
    media_type=attachment.mime_type,
    headers={"content-disposition": f'{disposition}; filename="{filename}"'},
  )


@app.post("/api/chatkit/workspaces/{workspace_id}/{surface}/messages")
async def post_workspace_message(workspace_id: str, surface: str, request: Request):
  require_trusted_workspace_request(request)
  if surface not in {"workspace", "proposal", "draft", "paper"}:
    raise HTTPException(status_code=400, detail="Invalid surface")

  payload, uploads = await parse_workspace_message_request(request)
  server = paper_chatkit_server if surface == "paper" else chatkit_server
  await server.post_workspace_message(
    build_request_context(workspace_id, surface, request),
    payload,
    uploads=uploads,
  )
  thread, messages = await server.list_workspace_messages(
    build_request_context(workspace_id, surface, request),
  )

  return {
    "thread_id": thread.id,
    "title": thread.title,
    "messages": [message.model_dump(mode="json") for message in messages],
  }


@app.post("/api/chatkit/workspaces/{workspace_id}/decisions/{decision_id}/messages")
async def post_decision_message(workspace_id: str, decision_id: str, request: Request):
  require_trusted_workspace_request(request)

  payload, uploads = await parse_workspace_message_request(request)
  await chatkit_server.post_workspace_message(
    build_request_context(workspace_id, "workspace", request, decision_id),
    payload,
    uploads=uploads,
  )
  thread, messages = await chatkit_server.list_workspace_messages(
    build_request_context(workspace_id, "workspace", request, decision_id),
  )

  return {
    "thread_id": thread.id,
    "title": thread.title,
    "messages": [message.model_dump(mode="json") for message in messages],
  }


@app.post("/api/chatkit/papers/{paper_id}/messages")
async def post_paper_message(paper_id: str, request: Request):
  require_trusted_workspace_request(request)

  payload, uploads = await parse_workspace_message_request(request)
  await paper_chatkit_server.post_workspace_message(
    build_request_context(paper_id, "paper", request, paper_context_source="paper"),
    payload,
    uploads=uploads,
  )
  thread, messages = await paper_chatkit_server.list_workspace_messages(
    build_request_context(paper_id, "paper", request, paper_context_source="paper"),
  )

  return {
    "thread_id": thread.id,
    "title": thread.title,
    "messages": [message.model_dump(mode="json") for message in messages],
  }


@app.post("/api/chatkit/workspaces/{workspace_id}/{surface}")
async def process_chatkit_request(workspace_id: str, surface: str, request: Request):
  require_trusted_workspace_request(request)
  if surface not in {"workspace", "proposal", "draft", "paper"}:
    raise HTTPException(status_code=400, detail="Invalid surface")

  if not os.environ.get("OPENAI_API_KEY"):
    raise HTTPException(status_code=500, detail="Missing OPENAI_API_KEY")

  context = build_request_context(workspace_id, surface, request)
  server = paper_chatkit_server if surface == "paper" else chatkit_server
  await server.ensure_workspace_thread(context)
  result = await server.process(await request.body(), context)

  if isinstance(result, StreamingResult):
    return StreamingResponse(result, media_type="text/event-stream")

  if isinstance(result, NonStreamingResult):
    return Response(result.json, media_type="application/json")

  return JSONResponse({"error": "Unexpected ChatKit response"}, status_code=500)
