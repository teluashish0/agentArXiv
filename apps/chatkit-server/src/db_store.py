from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol
from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit

from chatkit.store import NotFoundError, Store
from chatkit.types import Attachment, Page, ThreadItem, ThreadMetadata
from pydantic import TypeAdapter
from psycopg import AsyncConnection
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb


DEFAULT_LOCAL_DATABASE_URL = (
  "postgresql://agentarxiv:agentarxiv@localhost:15432/agentarxiv?schema=public"
)
PRISMA_ONLY_DATABASE_URL_PARAMS = {
  "connection_limit",
  "pgbouncer",
  "pool_timeout",
  "schema",
  "statement_cache_size",
}


class ChatKitRequestContext(Protocol):
  workspace_id: str
  surface: str


@dataclass(frozen=True)
class LegacyChatKitContext:
  workspace_id: str
  surface: str


def normalize_database_url(database_url: str) -> str:
  parsed = urlsplit(database_url)
  query_pairs = parse_qsl(parsed.query, keep_blank_values=True)
  normalized_pairs: list[tuple[str, str]] = []
  schema: str | None = None
  options: str | None = None

  for key, value in query_pairs:
    if key == "schema" and value.strip():
      schema = value.strip()
      continue

    if key == "options":
      options = value
      continue

    if key in PRISMA_ONLY_DATABASE_URL_PARAMS:
      continue

    normalized_pairs.append((key, value))

  if schema:
    search_path_option = f"-csearch_path={schema}"
    merged_options = (
      f"{options} {search_path_option}".strip() if options else search_path_option
    )
    normalized_pairs.append(("options", merged_options))
  elif options:
    normalized_pairs.append(("options", options))

  return urlunsplit(parsed._replace(query=urlencode(normalized_pairs, quote_via=quote)))


def resolve_database_url() -> str:
  configured_url = os.environ.get("DATABASE_URL", "").strip()

  if configured_url:
    return normalize_database_url(configured_url)

  if os.environ.get("NODE_ENV") == "production":
    raise RuntimeError("DATABASE_URL is required in production for the ChatKit store.")

  return normalize_database_url(DEFAULT_LOCAL_DATABASE_URL)


class DatabaseChatKitStore(Store[ChatKitRequestContext]):
  def __init__(self, legacy_store_path: Path | None = None):
    self._database_url = resolve_database_url()
    self._legacy_store_path = legacy_store_path
    self._thread_adapter = TypeAdapter(ThreadMetadata)
    self._thread_item_adapter = TypeAdapter(ThreadItem)
    self._attachment_adapter = TypeAdapter(Attachment)
    self._initialize_lock = asyncio.Lock()
    self._initialized = False

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

  def _normalize_payload_object(self, value: Any) -> dict[str, Any]:
    payload = json.loads(value) if isinstance(value, str) else value

    if not isinstance(payload, dict):
      raise ValueError("Expected a JSON object payload in the ChatKit store.")

    return dict(payload)

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

  async def _connect(self) -> AsyncConnection[Any]:
    return await AsyncConnection.connect(
      self._database_url,
      autocommit=True,
      row_factory=dict_row,
    )

  async def _fetchone_raw(
    self,
    query: str,
    params: tuple[Any, ...] = (),
  ) -> dict[str, Any] | None:
    async with await self._connect() as connection:
      cursor = await connection.execute(query, params)
      return await cursor.fetchone()

  async def _fetchone(
    self,
    query: str,
    params: tuple[Any, ...] = (),
  ) -> dict[str, Any] | None:
    await self.initialize()
    return await self._fetchone_raw(query, params)

  async def _fetchall_raw(
    self,
    query: str,
    params: tuple[Any, ...] = (),
  ) -> list[dict[str, Any]]:
    async with await self._connect() as connection:
      cursor = await connection.execute(query, params)
      rows = await cursor.fetchall()
      return list(rows)

  async def _fetchall(
    self,
    query: str,
    params: tuple[Any, ...] = (),
  ) -> list[dict[str, Any]]:
    await self.initialize()
    return await self._fetchall_raw(query, params)

  async def _execute_raw(
    self,
    query: str,
    params: tuple[Any, ...] = (),
  ) -> None:
    async with await self._connect() as connection:
      await connection.execute(query, params)

  async def _execute(
    self,
    query: str,
    params: tuple[Any, ...] = (),
  ) -> None:
    await self.initialize()
    await self._execute_raw(query, params)

  def _thread_context_values(
    self,
    thread: ThreadMetadata,
    context: ChatKitRequestContext,
  ) -> tuple[str, str]:
    workspace_id = str(thread.metadata.get("workspace_id") or context.workspace_id).strip()
    surface = str(thread.metadata.get("surface") or context.surface).strip()

    if not workspace_id or not surface:
      raise ValueError("ChatKit thread persistence requires workspace_id and surface metadata.")

    return workspace_id, surface

  def _legacy_store_exists(self) -> bool:
    return bool(self._legacy_store_path and self._legacy_store_path.exists())

  def _read_legacy_state_sync(self) -> dict[str, Any]:
    if not self._legacy_store_path:
      return {"threads": {}, "items": {}, "attachments": {}}

    return json.loads(self._legacy_store_path.read_text(encoding="utf-8"))

  async def _import_legacy_state_if_needed(self) -> None:
    if not self._legacy_store_exists():
      return

    existing_row = await self._fetchone_raw("SELECT id FROM chatkit_threads LIMIT 1")

    if existing_row:
      return

    legacy_state = await asyncio.to_thread(self._read_legacy_state_sync)
    raw_threads = legacy_state.get("threads", {})
    raw_items = legacy_state.get("items", {})
    raw_attachments = legacy_state.get("attachments", {})
    contexts_by_thread_id: dict[str, LegacyChatKitContext] = {}

    for raw_thread in raw_threads.values():
      if not isinstance(raw_thread, dict):
        continue

      thread = self._parse_thread(raw_thread)
      metadata = thread.metadata or {}
      workspace_id = str(metadata.get("workspace_id") or "").strip()
      surface = str(metadata.get("surface") or "").strip()

      if not workspace_id or not surface:
        continue

      context = LegacyChatKitContext(workspace_id=workspace_id, surface=surface)
      contexts_by_thread_id[thread.id] = context
      await self._upsert_thread(thread, context, initialize_store=False)

    for thread_id, raw_thread_items in raw_items.items():
      context = contexts_by_thread_id.get(thread_id)

      if not context or not isinstance(raw_thread_items, list):
        continue

      for raw_item in raw_thread_items:
        if not isinstance(raw_item, dict):
          continue

        item = self._parse_item(raw_item)
        await self._upsert_item(thread_id, item, context, initialize_store=False)

    for raw_attachment in raw_attachments.values():
      if not isinstance(raw_attachment, dict):
        continue

      attachment = self._parse_attachment(raw_attachment)
      thread_id = getattr(attachment, "thread_id", None)
      context = contexts_by_thread_id.get(thread_id or "")

      if not context:
        continue

      await self._upsert_attachment(attachment, context, initialize_store=False)

  async def initialize(self) -> None:
    if self._initialized:
      return

    async with self._initialize_lock:
      if self._initialized:
        return

      # Ensure the schema is reachable before request handling starts.
      async with await self._connect():
        pass

      await self._import_legacy_state_if_needed()
      self._initialized = True

  async def close(self) -> None:
    return None

  async def _upsert_thread(
    self,
    thread: ThreadMetadata,
    context: ChatKitRequestContext,
    *,
    initialize_store: bool = True,
  ) -> None:
    workspace_id, surface = self._thread_context_values(thread, context)
    query = """
      INSERT INTO chatkit_threads (
        id,
        workspace_id,
        surface,
        title,
        payload,
        created_at,
        updated_at
      )
      VALUES (%s, %s, %s, %s, %s, %s, %s)
      ON CONFLICT (id) DO UPDATE SET
        workspace_id = EXCLUDED.workspace_id,
        surface = EXCLUDED.surface,
        title = EXCLUDED.title,
        payload = EXCLUDED.payload,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at
      """
    params = (
      thread.id,
      workspace_id,
      surface,
      thread.title,
      Jsonb(self._serialize_thread(thread)),
      thread.created_at,
      datetime.now(timezone.utc),
    )

    if initialize_store:
      await self._execute(query, params)
    else:
      await self._execute_raw(query, params)

  async def _upsert_item(
    self,
    thread_id: str,
    item: ThreadItem,
    context: ChatKitRequestContext,
    *,
    initialize_store: bool = True,
  ) -> None:
    query = """
      INSERT INTO chatkit_thread_items (
        id,
        thread_id,
        workspace_id,
        surface,
        item_type,
        payload,
        created_at,
        updated_at
      )
      VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
      ON CONFLICT (id) DO UPDATE SET
        thread_id = EXCLUDED.thread_id,
        workspace_id = EXCLUDED.workspace_id,
        surface = EXCLUDED.surface,
        item_type = EXCLUDED.item_type,
        payload = EXCLUDED.payload,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at
      """
    params = (
      item.id,
      thread_id,
      context.workspace_id,
      context.surface,
      item.type,
      Jsonb(self._serialize_item(item)),
      item.created_at,
      datetime.now(timezone.utc),
    )

    if initialize_store:
      await self._execute(query, params)
    else:
      await self._execute_raw(query, params)

  async def _upsert_attachment(
    self,
    attachment: Attachment,
    context: ChatKitRequestContext,
    *,
    initialize_store: bool = True,
  ) -> None:
    payload = self._serialize_attachment(attachment)
    query = """
      INSERT INTO chatkit_attachments (
        id,
        thread_id,
        workspace_id,
        surface,
        attachment_type,
        name,
        mime_type,
        payload,
        created_at,
        updated_at
      )
      VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
      ON CONFLICT (id) DO UPDATE SET
        thread_id = EXCLUDED.thread_id,
        workspace_id = EXCLUDED.workspace_id,
        surface = EXCLUDED.surface,
        attachment_type = EXCLUDED.attachment_type,
        name = EXCLUDED.name,
        mime_type = EXCLUDED.mime_type,
        payload = EXCLUDED.payload,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at
      """
    now = datetime.now(timezone.utc)
    params = (
      attachment.id,
      getattr(attachment, "thread_id", None),
      context.workspace_id,
      context.surface,
      attachment.type,
      attachment.name,
      attachment.mime_type,
      Jsonb(payload),
      now,
      now,
    )

    if initialize_store:
      await self._execute(query, params)
    else:
      await self._execute_raw(query, params)

  async def load_thread(self, thread_id: str, context: ChatKitRequestContext) -> ThreadMetadata:
    row = await self._fetchone(
      "SELECT payload FROM chatkit_threads WHERE id = %s",
      (thread_id,),
    )

    if not row:
      raise NotFoundError(f"Thread {thread_id} not found")

    return self._parse_thread(self._normalize_payload_object(row["payload"]))

  async def save_thread(self, thread: ThreadMetadata, context: ChatKitRequestContext) -> None:
    await self._upsert_thread(thread, context)

  async def load_thread_items(
    self,
    thread_id: str,
    after: str | None,
    limit: int,
    order: str,
    context: ChatKitRequestContext,
  ) -> Page[ThreadItem]:
    rows = await self._fetchall(
      """
      SELECT payload
      FROM chatkit_thread_items
      WHERE thread_id = %s
      ORDER BY created_at ASC, id ASC
      """,
      (thread_id,),
    )
    items = [self._parse_item(self._normalize_payload_object(row["payload"])) for row in rows]
    return self._paginate(items, after, limit, order)

  async def save_attachment(self, attachment: Attachment, context: ChatKitRequestContext) -> None:
    await self._upsert_attachment(attachment, context)

  async def load_attachment(self, attachment_id: str, context: ChatKitRequestContext) -> Attachment:
    row = await self._fetchone(
      "SELECT payload FROM chatkit_attachments WHERE id = %s",
      (attachment_id,),
    )

    if not row:
      raise NotFoundError(f"Attachment {attachment_id} not found")

    return self._parse_attachment(self._normalize_payload_object(row["payload"]))

  async def delete_attachment(self, attachment_id: str, context: ChatKitRequestContext) -> None:
    await self._execute(
      "DELETE FROM chatkit_attachments WHERE id = %s",
      (attachment_id,),
    )

  async def load_threads(
    self,
    limit: int,
    after: str | None,
    order: str,
    context: ChatKitRequestContext,
  ) -> Page[ThreadMetadata]:
    rows = await self._fetchall(
      """
      SELECT payload
      FROM chatkit_threads
      WHERE workspace_id = %s AND surface = %s
      ORDER BY created_at ASC, id ASC
      """,
      (context.workspace_id, context.surface),
    )
    threads = [self._parse_thread(self._normalize_payload_object(row["payload"])) for row in rows]
    return self._paginate(threads, after, limit, order)

  async def add_thread_item(self, thread_id: str, item: ThreadItem, context: ChatKitRequestContext) -> None:
    await self._upsert_item(thread_id, item, context)

  async def save_item(self, thread_id: str, item: ThreadItem, context: ChatKitRequestContext) -> None:
    await self._upsert_item(thread_id, item, context)

  async def load_item(self, thread_id: str, item_id: str, context: ChatKitRequestContext) -> ThreadItem:
    row = await self._fetchone(
      """
      SELECT payload
      FROM chatkit_thread_items
      WHERE thread_id = %s AND id = %s
      """,
      (thread_id, item_id),
    )

    if not row:
      raise NotFoundError(f"Item {item_id} not found in thread {thread_id}")

    return self._parse_item(self._normalize_payload_object(row["payload"]))

  async def delete_thread(self, thread_id: str, context: ChatKitRequestContext) -> None:
    await self._execute(
      "DELETE FROM chatkit_thread_items WHERE thread_id = %s",
      (thread_id,),
    )
    await self._execute(
      "DELETE FROM chatkit_attachments WHERE thread_id = %s",
      (thread_id,),
    )
    await self._execute(
      "DELETE FROM chatkit_threads WHERE id = %s",
      (thread_id,),
    )

  async def delete_thread_item(self, thread_id: str, item_id: str, context: ChatKitRequestContext) -> None:
    await self._execute(
      "DELETE FROM chatkit_thread_items WHERE thread_id = %s AND id = %s",
      (thread_id, item_id),
    )
