"""AI Studio Personas — thin adapter over OM's ``AISdk.create_persona``.

OpenMetadata 1.12 introduced *Personas* in AI Studio: declarative agents
defined in OM (with a system prompt, default model, allowed MCP tools)
that any client can invoke. This module gives MetaFlow a path to publish
its 12 LangGraph specialists as OM-native personas, so they show up in
the AI Studio UI alongside the org's own personas.

If the connected SDK build supports ``client.personas.*`` (or the legacy
``client.create_persona`` shape), every call goes through it. Otherwise
we keep a local in-memory registry with the same shape, so the rest of
MetaFlow (and the ``/api/personas`` endpoints) keeps working.

Toggle dispatch via ``/api/personas/{id}/invoke?message=...`` — that
endpoint either calls OM's persona runtime or falls back to running the
matching LangGraph specialist locally.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from app.agents.specialists import SPECIALIST_CONFIGS
from app.core.clients import get_ai_sdk_client
from app.core.config import settings

_logger = logging.getLogger(__name__)

# Local fallback registry — keyed by persona name.
_LOCAL_PERSONAS: dict[str, dict[str, Any]] = {}


# ---------------------------------------------------------------------------
# Definition: how each MetaFlow specialist becomes a Persona
# ---------------------------------------------------------------------------


def _persona_definitions() -> list[dict[str, Any]]:
    """Translate MetaFlow specialists → AI Studio persona payloads."""
    out: list[dict[str, Any]] = []
    for name, cfg in SPECIALIST_CONFIGS.items():
        prompt_template = cfg.get("prompt", "")
        # Render with a placeholder host so the persona is portable.
        prompt = prompt_template.format(metadata_host=settings.ai_sdk_host)
        out.append(
            {
                "name": f"metaflow.{name}",
                "displayName": name.replace("_", " ").title(),
                "description": (
                    f"MetaFlow specialist agent ({name}) — "
                    "published as an OpenMetadata AI Studio persona."
                ),
                "model": settings.llm_model,
                "provider": settings.llm_provider,
                "systemPrompt": prompt,
                "mcpTools": [str(t) for t in cfg.get("mcp_tools", [])],
                "tags": ["metaflow", "agent", "auto-generated"],
            }
        )
    return out


# ---------------------------------------------------------------------------
# SDK detection — look for the persona surface, gracefully fall back
# ---------------------------------------------------------------------------


def _personas_api() -> Any | None:
    """Return ``client.personas`` (1.12+) or a shim for ``create_persona``."""
    try:
        client = get_ai_sdk_client()
    except Exception as exc:
        _logger.debug("AI SDK init failed: %s", exc)
        return None

    # Preferred: namespaced API
    api = getattr(client, "personas", None)
    if api is not None:
        return api

    # Legacy: top-level create_persona
    if hasattr(client, "create_persona"):
        class _Shim:
            def create(self, **payload):
                return client.create_persona(**payload)

            def list(self, limit: int = 100):
                return getattr(client, "list_personas", lambda **_: [])(limit=limit)

            def invoke(self, name: str, message: str, **kwargs):
                if hasattr(client, "invoke_persona"):
                    return client.invoke_persona(name=name, message=message, **kwargs)
                raise AttributeError("invoke_persona not supported")

        return _Shim()

    return None


def personas_supported() -> bool:
    """True if the AI SDK build exposes a Persona API."""
    return _personas_api() is not None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def list_personas() -> dict[str, Any]:
    """Return all MetaFlow-published personas (server-side or local)."""
    api = _personas_api()
    if api is not None:
        try:
            rows = api.list(limit=200)
            return {
                "backend": "ai_sdk",
                "personas": _normalize(rows),
            }
        except Exception as exc:
            _logger.warning("Persona list via SDK failed (%s); using local", exc)

    return {
        "backend": "local",
        "personas": list(_LOCAL_PERSONAS.values()),
    }


def publish_personas() -> dict[str, Any]:
    """Idempotently push every MetaFlow specialist into OM as a persona.

    Called by ``POST /api/personas/publish``. Safe to call repeatedly:
    each persona is upserted by ``name``.
    """
    defs = _persona_definitions()
    api = _personas_api()
    created: list[str] = []
    updated: list[str] = []
    failed: list[dict[str, Any]] = []

    if api is not None:
        for d in defs:
            try:
                if hasattr(api, "upsert"):
                    api.upsert(**d)
                    updated.append(d["name"])
                else:
                    api.create(**d)
                    created.append(d["name"])
            except Exception as exc:
                # 409 already-exists → treat as update
                msg = str(exc).lower()
                if "exist" in msg or "409" in msg or "duplicate" in msg:
                    updated.append(d["name"])
                else:
                    failed.append({"name": d["name"], "error": str(exc)[:200]})
        return {
            "backend": "ai_sdk",
            "created": created,
            "updated": updated,
            "failed": failed,
            "total": len(defs),
            "published_at": datetime.now(timezone.utc).isoformat(),
        }

    # Local fallback — keep the same shape so callers don't branch.
    for d in defs:
        existed = d["name"] in _LOCAL_PERSONAS
        _LOCAL_PERSONAS[d["name"]] = {
            **d,
            "id": d["name"],
            "createdAt": _LOCAL_PERSONAS.get(d["name"], {}).get(
                "createdAt", datetime.now(timezone.utc).isoformat()
            ),
        }
        (updated if existed else created).append(d["name"])
    return {
        "backend": "local",
        "created": created,
        "updated": updated,
        "failed": failed,
        "total": len(defs),
        "published_at": datetime.now(timezone.utc).isoformat(),
    }


def invoke_persona(name: str, message: str, orchestrator: Any = None) -> dict[str, Any]:
    """Invoke a persona by name and return its reply.

    1. If OM personas runtime is available → delegate to it.
    2. Otherwise → run the matching local LangGraph specialist via the
       supervisor orchestrator (so behavior stays identical).
    """
    api = _personas_api()
    if api is not None and hasattr(api, "invoke"):
        try:
            resp = api.invoke(name=name, message=message)
            if hasattr(resp, "model_dump"):
                resp = resp.model_dump()
            return {"backend": "ai_sdk", "persona": name, "response": resp}
        except Exception as exc:
            _logger.warning("Persona invoke via SDK failed (%s); using local", exc)

    # Local fallback: route through the supervisor with a steering hint.
    if orchestrator is None:
        return {
            "backend": "local",
            "persona": name,
            "response": "Orchestrator unavailable for local persona invocation.",
            "error": True,
        }
    short = name.replace("metaflow.", "")
    steered = f"Route this to the {short} specialist: {message}"
    final_text = ""
    try:
        for chunk in orchestrator.stream(
            {"messages": [{"role": "user", "content": steered}]}
        ):
            for node, payload in chunk.items():
                msgs = payload.get("messages") or []
                if msgs and node != "supervisor":
                    final_text = getattr(msgs[-1], "content", "") or final_text
    except Exception as exc:
        return {
            "backend": "local",
            "persona": name,
            "response": f"Local invocation failed: {exc}",
            "error": True,
        }
    return {
        "backend": "local",
        "persona": name,
        "response": final_text or "(no content)",
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _normalize(rows: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for r in rows or []:
        if hasattr(r, "model_dump"):
            d = r.model_dump()
        elif isinstance(r, dict):
            d = r
        else:
            d = {"name": getattr(r, "name", None)}
        out.append(d)
    return out
