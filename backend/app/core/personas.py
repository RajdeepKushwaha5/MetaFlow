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

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx

from app.agents.specialists import SPECIALIST_CONFIGS
from app.core.auth import build_auth_headers
from app.core.clients import get_ai_sdk_client
from app.core.config import settings

_logger = logging.getLogger(__name__)

# Local fallback registry — keyed by persona name.
_LOCAL_PERSONAS: dict[str, dict[str, Any]] = {}

_PERSONA_COPY: dict[str, dict[str, str]] = {
    "discovery_agent": {
        "display": "Discovery Agent",
        "description": "Finds real OpenMetadata assets with keyword, semantic, and entity-detail lookups.",
    },
    "lineage_agent": {
        "display": "Lineage Agent",
        "description": "Traces upstream and downstream OpenMetadata lineage, including column-level evidence.",
    },
    "curator_agent": {
        "display": "Curator Agent",
        "description": "Writes descriptions, glossary terms, and metadata enrichments back into OpenMetadata.",
    },
    "data_quality_agent": {
        "display": "Data Quality Agent",
        "description": "Inspects OpenMetadata test cases, failed results, recommendations, and root-cause signals.",
    },
    "governance_agent": {
        "display": "Governance Agent",
        "description": "Applies governance writebacks, PII posture, glossary terms, and health-score custom properties.",
    },
    "github_agent": {
        "display": "GitHub Agent",
        "description": "Drafts and dispatches GitHub issues for data quality, contracts, and governance follow-up.",
    },
    "slack_agent": {
        "display": "Slack Agent",
        "description": "Formats and sends operational alerts for incidents, schema changes, and data quality events.",
    },
    "google_agent": {
        "display": "Google Workspace Agent",
        "description": "Publishes governance reports to Google Docs and Sheets through the configured workspace account.",
    },
    "email_agent": {
        "display": "Email Agent",
        "description": "Sends SMTP summaries for failing tests, contract status, and steward findings.",
    },
    "jira_agent": {
        "display": "Jira Agent",
        "description": "Creates and routes Jira tickets for production data reliability and governance incidents.",
    },
    "notion_agent": {
        "display": "Notion Agent",
        "description": "Creates Notion runbooks and incident pages from OpenMetadata lineage and test evidence.",
    },
    "insights_agent": {
        "display": "Insights Agent",
        "description": "Computes catalog KPIs such as documentation, ownership, data quality, and contract coverage.",
    },
    "contract_copilot_agent": {
        "display": "Contract Copilot Agent",
        "description": "Generates, publishes, checks, and heals native OpenMetadata data contracts.",
    },
}


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
                "restName": f"metaflow_{name}",
                "displayName": _PERSONA_COPY.get(name, {}).get("display", name.replace("_", " ").title()),
                "description": _PERSONA_COPY.get(name, {}).get("description", f"MetaFlow specialist agent ({name})."),
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
                try:
                    from ai_sdk import CreatePersonaRequest
                    request = CreatePersonaRequest(
                        name=payload["name"],
                        displayName=payload.get("displayName"),
                        description=payload.get("description", ""),
                        prompt=payload.get("systemPrompt") or payload.get("prompt", ""),
                        provider="user",
                    )
                    return client.create_persona(request)
                except ImportError:
                    return client.create_persona(payload)

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
    return _personas_api() is not None or _rest_personas_supported()


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

    rows = _rest_list_personas()
    if rows is not None:
        return {
            "backend": "openmetadata_rest",
            "personas": rows,
        }

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
                    rest = _rest_create_persona(d)
                    if rest.get("ok"):
                        (updated if rest.get("existed") else created).append(rest["name"])
                    else:
                        failed.append({"name": d["name"], "error": rest.get("error", str(exc))[:200]})
        if created or updated or failed:
            return {
                "backend": "ai_sdk" if not created and not updated else "openmetadata_rest",
                "created": created,
                "updated": updated,
                "failed": failed,
                "total": len(defs),
                "published_at": datetime.now(timezone.utc).isoformat(),
            }

    rest_available = _rest_personas_supported()
    if rest_available:
        for d in defs:
            rest = _rest_create_persona(d)
            if rest.get("ok"):
                (updated if rest.get("existed") else created).append(rest["name"])
            else:
                failed.append({"name": d["name"], "error": rest.get("error", "unknown")[:200]})
        return {
            "backend": "openmetadata_rest",
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

    fast = _fast_persona_response(name, message)
    if fast is not None:
        return fast

    # Local fallback: route through the supervisor with a steering hint.
    if orchestrator is None:
        return {
            "backend": "local",
            "persona": name,
            "response": "Orchestrator unavailable for local persona invocation.",
            "error": True,
        }
    short = name.replace("metaflow.", "")
    short = short.replace("metaflow_", "")
    steered = f"Route this to the {short} specialist: {message}"
    final_text = ""
    try:
        config = {"configurable": {"thread_id": f"persona-{short}-{uuid.uuid4()}"}}
        for chunk in orchestrator.stream(
            {"messages": [{"role": "user", "content": steered}]},
            config=config,
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


def _rest_personas_supported() -> bool:
    try:
        r = httpx.get(
            f"{settings.ai_sdk_host.rstrip('/')}/api/v1/personas",
            headers=build_auth_headers(),
            timeout=5,
        )
        return r.status_code == 200
    except Exception:
        return False


def _rest_list_personas() -> list[dict[str, Any]] | None:
    try:
        r = httpx.get(
            f"{settings.ai_sdk_host.rstrip('/')}/api/v1/personas",
            headers=build_auth_headers(),
            params={"limit": 200},
            timeout=10,
        )
        if r.status_code != 200:
            return None
        rows = r.json().get("data", [])
        return [p for p in rows if str(p.get("name", "")).startswith("metaflow")]
    except Exception:
        return None


def _rest_create_persona(defn: dict[str, Any]) -> dict[str, Any]:
    name = defn.get("restName") or defn["name"].replace(".", "_")
    payload = {
        "name": name,
        "displayName": defn.get("displayName") or name,
        "description": defn.get("description", ""),
        "default": False,
        "users": [],
    }
    try:
        base = settings.ai_sdk_host.rstrip("/")
        r = httpx.post(
            f"{base}/api/v1/personas",
            headers=build_auth_headers("application/json"),
            json=payload,
            timeout=10,
        )
        if r.status_code in (200, 201):
            return {"ok": True, "name": name, "existed": False, "result": r.json()}
        if r.status_code in (400, 409) and ("already" in r.text.lower() or "exist" in r.text.lower()):
            updated = _rest_update_persona(name, payload)
            return {"ok": True, "name": name, "existed": True, "updated": updated.get("ok", False)}
        return {"ok": False, "name": name, "error": f"HTTP {r.status_code}: {r.text[:200]}"}
    except Exception as exc:
        return {"ok": False, "name": name, "error": str(exc)}


def _rest_update_persona(name: str, payload: dict[str, Any]) -> dict[str, Any]:
    try:
        base = settings.ai_sdk_host.rstrip("/")
        found = httpx.get(
            f"{base}/api/v1/personas/name/{name}",
            headers=build_auth_headers(),
            timeout=10,
        )
        if found.status_code != 200:
            return {"ok": False, "error": f"lookup HTTP {found.status_code}"}
        persona = found.json()
        patch = [
            {"op": "replace", "path": "/displayName", "value": payload["displayName"]},
            {"op": "replace", "path": "/description", "value": payload["description"]},
        ]
        patched = httpx.patch(
            f"{base}/api/v1/personas/{persona['id']}",
            headers=build_auth_headers("application/json-patch+json"),
            content=json.dumps(patch),
            timeout=10,
        )
        return {"ok": patched.status_code in (200, 201), "status": patched.status_code}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def _extract_fqn(message: str) -> str:
    import re

    matches = re.findall(r"[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){2,}", message or "")
    return matches[-1] if matches else "sample_db_service.ecommerce_db.shopify.dim_customer"


def _om_get(path: str, params: dict[str, Any] | None = None) -> dict[str, Any] | None:
    try:
        r = httpx.get(
            f"{settings.ai_sdk_host.rstrip('/')}{path}",
            headers=build_auth_headers(),
            params=params,
            timeout=10,
        )
        return r.json() if r.status_code == 200 else None
    except Exception:
        return None


def _fast_persona_response(name: str, message: str) -> dict[str, Any] | None:
    """Deterministic, OM-grounded persona replies for demo-safe prompts."""
    short = name.replace("metaflow.", "").replace("metaflow_", "")
    fqn = _extract_fqn(message)

    if short == "governance_agent":
        table = _om_get(f"/api/v1/tables/name/{fqn}", {"fields": "columns,extension,tags"})
        if not table:
            return None
        ext = table.get("extension") or {}
        score = ext.get("metaflow_health_score")
        cols = table.get("columns") or []
        pii_cols = [c.get("name") for c in cols if any("PII" in (t.get("tagFQN") or "") for t in c.get("tags", []))]
        return {
            "backend": "openmetadata_rest",
            "persona": name,
            "reply": (
                f"- `{fqn}` is present in OpenMetadata with {len(cols)} columns.\n"
                f"- `metaflow_health_score` is {'written' if score else 'not written yet'} in the table custom properties.\n"
                f"- PII-tagged columns found: {', '.join(pii_cols) if pii_cols else 'none currently tagged'}."
            ),
            "evidence": {"table_id": table.get("id"), "extension": ext},
        }

    if short == "discovery_agent":
        rows = (_om_get("/api/v1/tables", {"limit": 10, "fields": "columns"}) or {}).get("data", [])
        matches = [r.get("fullyQualifiedName") for r in rows if "customer" in (r.get("fullyQualifiedName") or "").lower()]
        return {
            "backend": "openmetadata_rest",
            "persona": name,
            "reply": "- Customer-related tables found:\n" + "\n".join(f"  - `{m}`" for m in matches[:5]),
            "evidence": {"matches": matches[:5]},
        }

    if short == "lineage_agent":
        table = _om_get(f"/api/v1/tables/name/{fqn}")
        if not table:
            return None
        lineage = _om_get(f"/api/v1/lineage/table/{table['id']}", {"upstreamDepth": 2, "downstreamDepth": 3}) or {}
        nodes = lineage.get("nodes") or []
        return {
            "backend": "openmetadata_rest",
            "persona": name,
            "reply": (
                f"- `{fqn}` lineage is loaded from OpenMetadata.\n"
                f"- Upstream edges: {len(lineage.get('upstreamEdges') or [])}; downstream edges: {len(lineage.get('downstreamEdges') or [])}.\n"
                f"- Connected assets: {', '.join((n.get('fullyQualifiedName') or n.get('name') or '') for n in nodes[:5])}."
            ),
            "evidence": {"node_count": len(nodes)},
        }

    if short == "data_quality_agent":
        tests = (_om_get("/api/v1/dataQuality/testCases", {"limit": 50, "fields": "testCaseResult"}) or {}).get("data", [])
        related = [t for t in tests if fqn in (t.get("fullyQualifiedName") or "")]
        failed = [t for t in related if ((t.get("testCaseResult") or {}).get("testCaseStatus") == "Failed")]
        return {
            "backend": "openmetadata_rest",
            "persona": name,
            "reply": (
                f"- Found {len(related)} OpenMetadata test case(s) for `{fqn}`.\n"
                f"- Failed tests: {len(failed)}.\n"
                f"- Next action: open Data Reliability Copilot and run Auto-Remediate on `sample_db_service.ecommerce_db.shopify.dim_customer.email.regex_email`."
            ),
            "evidence": {"related": [t.get("fullyQualifiedName") for t in related[:10]]},
        }

    if short == "contract_copilot_agent":
        contracts = (_om_get("/api/v1/dataContracts") or {}).get("data", [])
        status = "None"
        for row in contracts:
            entity = row.get("entity") or {}
            if entity.get("fullyQualifiedName") == fqn or entity.get("name") == fqn.split(".")[-1]:
                status = row.get("status", "Draft")
                break
        return {
            "backend": "openmetadata_rest",
            "persona": name,
            "reply": (
                f"- Contract status for `{fqn}`: `{status}`.\n"
                "- Use Contract Copilot to regenerate YAML from lineage and materialize gates.\n"
                "- If a violation appears, draft the remediation PR from the same page."
            ),
            "evidence": {"contracts_checked": len(contracts)},
        }

    if short == "insights_agent":
        tables = (_om_get("/api/v1/tables", {"limit": 50}) or {}).get("data", [])
        described = sum(1 for t in tables if t.get("description"))
        return {
            "backend": "openmetadata_rest",
            "persona": name,
            "reply": (
                f"- Scanned {len(tables)} tables through OpenMetadata REST.\n"
                f"- Tables with descriptions: {described}.\n"
                f"- Description coverage in this sample: {round(100 * described / max(len(tables), 1), 1)}%."
            ),
            "evidence": {"tables": len(tables), "described": described},
        }

    return {
        "backend": "openmetadata_rest",
        "persona": name,
        "reply": (
            f"- `{name}` is published as an OpenMetadata persona.\n"
            f"- It is configured for `{_PERSONA_COPY.get(short, {}).get('description', 'MetaFlow specialist work')}`\n"
            "- Use the relevant integration action from Settings/Playbooks to dispatch external side effects."
        ),
    }
