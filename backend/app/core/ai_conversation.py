"""Native multi-turn conversation backed by the OpenMetadata AI SDK.

OpenMetadata's AI SDK ships a server-side conversation API
(``client.conversations.create / append / list_messages``) that lets the
platform — not the client — own multi-turn state. This means:

* Conversations live in OM, alongside the entities they reference.
* Other OM-aware clients (the OM UI, another agent, an audit dashboard)
  can read them.
* Restarting MetaFlow doesn't drop history.

This module is a thin, defensive wrapper. If the connected AI SDK build
exposes the expected API surface, every call goes through it. Otherwise
we transparently fall back to the local SQLite store (``app.core.history``)
so MetaFlow keeps working against older OM versions.

Toggle with ``USE_AI_SDK_CONVERSATIONS=true`` (default false).
"""

from __future__ import annotations

import logging
from typing import Any

from app.core.clients import get_ai_sdk_client
from app.core.config import settings
from app.core.history import (
    delete_conversation as _local_delete,
    get_conversation as _local_get,
    list_conversations as _local_list,
    save_message as _local_save,
)

_logger = logging.getLogger(__name__)


def use_ai_sdk_conversations() -> bool:
    """True if conversations should be persisted server-side in OM."""
    return bool(settings.use_ai_sdk_conversations)


def _conversations_api() -> Any | None:
    """Return ``client.conversations`` if the SDK exposes it, else ``None``."""
    try:
        client = get_ai_sdk_client()
    except Exception as exc:  # SDK init may fail in offline tests
        _logger.debug("AI SDK init failed: %s", exc)
        return None
    return getattr(client, "conversations", None)


def save_message(
    conversation_id: str,
    role: str,
    content: str,
    title: str | None = None,
) -> dict[str, Any]:
    """Append a message to a conversation, server-side or local."""
    if use_ai_sdk_conversations():
        api = _conversations_api()
        if api is not None:
            try:
                # Most SDK builds expose `create_or_get` + `append`.
                if hasattr(api, "create_or_get"):
                    api.create_or_get(id=conversation_id, title=title or content[:80])
                elif hasattr(api, "create"):
                    try:
                        api.create(id=conversation_id, title=title or content[:80])
                    except Exception:
                        # Already exists is fine.
                        pass
                api.append(conversation_id=conversation_id, role=role, content=content)
                return {"backend": "ai_sdk", "conversation_id": conversation_id}
            except Exception as exc:
                _logger.warning(
                    "AI SDK conversation save failed (%s); falling back to local", exc
                )

    _local_save(conversation_id, role, content, title)
    return {"backend": "local", "conversation_id": conversation_id}


def list_conversations(limit: int = 50) -> list[dict[str, Any]]:
    """List recent conversations from whichever backend is active."""
    if use_ai_sdk_conversations():
        api = _conversations_api()
        if api is not None and hasattr(api, "list"):
            try:
                rows = api.list(limit=limit)
                # Normalize to the shape the frontend already consumes.
                normalized: list[dict[str, Any]] = []
                for r in rows:
                    if hasattr(r, "model_dump"):
                        d = r.model_dump()
                    elif isinstance(r, dict):
                        d = r
                    else:
                        d = {"id": getattr(r, "id", None), "title": getattr(r, "title", None)}
                    normalized.append(
                        {
                            "id": d.get("id"),
                            "title": d.get("title") or "(untitled)",
                            "created_at": d.get("created_at") or d.get("createdAt"),
                            "message_count": d.get("message_count") or d.get("messageCount") or 0,
                        }
                    )
                return normalized
            except Exception as exc:
                _logger.warning(
                    "AI SDK conversation list failed (%s); falling back to local", exc
                )
    return _local_list(limit=limit)


def get_conversation(conversation_id: str) -> dict[str, Any] | None:
    """Fetch a single conversation + messages from active backend."""
    if use_ai_sdk_conversations():
        api = _conversations_api()
        if api is not None and hasattr(api, "get"):
            try:
                conv = api.get(conversation_id)
                if conv is None:
                    return None
                if hasattr(conv, "model_dump"):
                    conv = conv.model_dump()
                msgs = conv.get("messages") or []
                norm_msgs = []
                for m in msgs:
                    if hasattr(m, "model_dump"):
                        m = m.model_dump()
                    norm_msgs.append(
                        {
                            "role": m.get("role"),
                            "content": m.get("content"),
                            "timestamp": m.get("timestamp") or m.get("createdAt"),
                        }
                    )
                return {
                    "id": conv.get("id") or conversation_id,
                    "title": conv.get("title") or "(untitled)",
                    "created_at": conv.get("created_at") or conv.get("createdAt"),
                    "messages": norm_msgs,
                    "backend": "ai_sdk",
                }
            except Exception as exc:
                _logger.warning(
                    "AI SDK conversation get failed (%s); falling back to local", exc
                )
    out = _local_get(conversation_id)
    if out is not None:
        out["backend"] = "local"
    return out


def conversation_backend() -> str:
    """Used by ``/api/system/info`` so the UI can show which store is live."""
    if use_ai_sdk_conversations() and _conversations_api() is not None:
        return "ai_sdk"
    return "local_sqlite"


def delete_conversation(conversation_id: str) -> dict[str, Any]:
    """Delete a conversation. Tries SDK first, then local."""
    if use_ai_sdk_conversations():
        api = _conversations_api()
        if api is not None and hasattr(api, "delete"):
            try:
                api.delete(conversation_id)
                return {"backend": "ai_sdk", "deleted": True, "conversation_id": conversation_id}
            except Exception as exc:
                _logger.warning(
                    "AI SDK conversation delete failed (%s); falling back to local", exc
                )
    _local_delete(conversation_id)
    return {"backend": "local", "deleted": True, "conversation_id": conversation_id}
