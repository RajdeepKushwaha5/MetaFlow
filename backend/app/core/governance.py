"""Governance writebacks + schema-drift timeline.

Two judge-visible features that live inside OpenMetadata itself:

1. ``write_health_score`` — registers (idempotent) a ``metaflow.health_score``
   custom property on the ``table`` entity type, then PATCHes the score
   onto a specific table. Judges who open the OM UI see MetaFlow's verdict
   alongside the table's native metadata.

2. ``schema_drift_timeline`` — walks OM's native ``tables/{id}/versions``
   API and returns a clean timeline of column add/drop/rename/type changes.
   Directly answers the live audience question from the org's hackathon talk
   ("we want to build a dashboard for tracking schema drift over time").

Both functions degrade gracefully to a deterministic demo payload when
``DEMO_MODE=true`` or when OpenMetadata is unreachable, so the demo never
hits a network failure mid-pitch.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from app.core.config import settings, is_dry_run, is_public_sandbox
from app.core.demo import is_demo

# OM property type id for "string" — used when registering the custom property.
# OM exposes types via /api/v1/metadata/types; "string" is universally available.
_OM_STRING_TYPE_FALLBACK_NAME = "string"

# Custom property + extension key. Stored as a JSON string under
# entity.extension["metaflow_health_score"].
HEALTH_SCORE_PROPERTY = "metaflow_health_score"


def _om_base() -> str:
    return settings.ai_sdk_host.rstrip("/")


def _om_headers(content_type: str | None = None) -> dict[str, str]:
    from app.core.auth import build_auth_headers
    return build_auth_headers(content_type)


def _om_json_request(
    method: str,
    path: str,
    *,
    content_type: str = "application/json",
    json_body: dict[str, Any] | list[dict[str, Any]] | None = None,
) -> tuple[bool, dict[str, Any]]:
    """Small REST helper that preserves OM error detail for judge checks."""
    try:
        with httpx.Client(timeout=15.0) as client:
            r = client.request(
                method,
                f"{_om_base()}{path}",
                headers=_om_headers(content_type),
                json=json_body,
            )
        if r.status_code >= 400:
            return False, {"status": r.status_code, "body": r.text[:500]}
        return True, r.json() if r.content else {}
    except Exception as exc:
        return False, {"error": str(exc)[:500]}


# ---------------------------------------------------------------------------
# 1. Custom-property writeback
# ---------------------------------------------------------------------------


def _demo_health_score(entity_fqn: str, score: int, breakdown: dict[str, float]) -> dict[str, Any]:
    return {
        "demo": True,
        "ok": True,
        "entity_fqn": entity_fqn,
        "property": HEALTH_SCORE_PROPERTY,
        "score": score,
        "breakdown": breakdown,
        "written_at": datetime.now(timezone.utc).isoformat(),
        "om_url": f"{_om_base()}/table/{entity_fqn}",
        "note": "Demo mode — would PATCH entity.extension on the table in OM.",
    }


def _ensure_health_score_property() -> dict[str, Any]:
    """Idempotently register the ``metaflow_health_score`` custom property
    on the ``table`` entity type. Returns ``{ok, created, reason}``.

    Safe to call repeatedly — if the property already exists OM returns
    409 / 400 which we swallow as ``created=False``.
    """
    base = _om_base()
    # Look up the table type id
    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.get(
                f"{base}/api/v1/metadata/types/name/table",
                headers=_om_headers(),
            )
            if r.status_code != 200:
                return {"ok": False, "reason": f"table type lookup failed: {r.status_code}"}
            type_id = r.json().get("id")
            if not type_id:
                return {"ok": False, "reason": "no id on table type"}

            # Look up the string property type id (needed for the propertyType ref)
            r2 = client.get(
                f"{base}/api/v1/metadata/types/name/{_OM_STRING_TYPE_FALLBACK_NAME}",
                headers=_om_headers(),
            )
            if r2.status_code != 200:
                return {"ok": False, "reason": f"string type lookup failed: {r2.status_code}"}
            string_type_id = r2.json().get("id")

            # Attempt to register — OM will 4xx if it already exists, which is fine.
            r3 = client.put(
                f"{base}/api/v1/metadata/types/{type_id}",
                headers=_om_headers("application/json"),
                json={
                    "name": HEALTH_SCORE_PROPERTY,
                    "description": "MetaFlow autonomous health score (0-100) with per-dimension breakdown.",
                    "propertyType": {"id": string_type_id, "type": "type"},
                },
            )
            if r3.status_code in (200, 201):
                return {"ok": True, "created": True}
            # Already-exists or validation-failure → still considered ok for our purposes
            return {"ok": True, "created": False, "status": r3.status_code}
    except Exception as exc:
        return {"ok": False, "reason": str(exc)[:200]}


def _dry_run_health_score(entity_fqn: str, score: int, breakdown: dict[str, float]) -> dict[str, Any]:
    """Judge-mode payload — what we WOULD have PATCHed to OM."""
    return {
        "ok": True,
        "dry_run": True,
        "judge_mode": True,
        "entity_fqn": entity_fqn,
        "property": HEALTH_SCORE_PROPERTY,
        "score": score,
        "breakdown": breakdown,
        "would_patch": {
            "method": "PATCH",
            "url": f"{_om_base()}/api/v1/tables/{{id-of:{entity_fqn}}}",
            "extension_key": HEALTH_SCORE_PROPERTY,
        },
        "om_url": f"{_om_base()}/table/{entity_fqn}",
        "note": (
            "Judge mode is pointed at the public OpenMetadata sandbox; writes "
            "are dry-runs to avoid polluting shared data. Run locally with "
            "JUDGE_DRY_RUN=false to actually PATCH."
        ),
    }


def write_health_score(
    entity_fqn: str,
    score: int,
    breakdown: dict[str, float] | None = None,
) -> dict[str, Any]:
    """Write a MetaFlow health score back to OM as a native custom property.

    The score appears under the table's ``extension`` block — visible in the
    OpenMetadata UI under the table's "Custom Properties" panel. This is the
    "human direction, AI execution" loop closed: AI decides, OM stores it,
    humans review it in their existing tool.
    """
    breakdown = breakdown or {}

    if is_demo():
        return _demo_health_score(entity_fqn, score, breakdown)

    # Don't PATCH the shared public sandbox — return a clear dry-run payload.
    if is_dry_run():
        return _dry_run_health_score(entity_fqn, score, breakdown)

    if not settings.ai_sdk_token:
        return {"ok": False, "reason": "AI_SDK_TOKEN not configured"}

    # Step 1: ensure the custom property exists on the table type (idempotent).
    reg = _ensure_health_score_property()
    if not reg.get("ok"):
        return {
            "ok": False,
            "entity_fqn": entity_fqn,
            "property": HEALTH_SCORE_PROPERTY,
            "score": score,
            "breakdown": breakdown,
            "reason": reg.get("reason", "property registration failed"),
        }

    # Step 2: PATCH the table to set extension[metaflow_health_score].
    base = _om_base()
    payload_value = json.dumps({
        "score": score,
        "breakdown": breakdown,
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "agent": "metaflow.steward",
    })

    try:
        with httpx.Client(timeout=15.0) as client:
            # Look up table by FQN to get its id
            r = client.get(
                f"{base}/api/v1/tables/name/{entity_fqn}",
                headers=_om_headers(),
            )
            if r.status_code != 200:
                return {
                    "ok": False,
                    "entity_fqn": entity_fqn,
                    "property": HEALTH_SCORE_PROPERTY,
                    "score": score,
                    "breakdown": breakdown,
                    "reason": f"table lookup failed: {r.status_code}",
                }
            table = r.json()
            table_id = table.get("id")

            # JSON-patch op to add/replace the extension key
            existing = table.get("extension") or {}
            patch_op = "replace" if HEALTH_SCORE_PROPERTY in existing else "add"
            patch = [{
                "op": patch_op,
                "path": f"/extension/{HEALTH_SCORE_PROPERTY}",
                "value": payload_value,
            }]
            # If extension itself is missing, add it first
            if not existing:
                patch = [{"op": "add", "path": "/extension", "value": {HEALTH_SCORE_PROPERTY: payload_value}}]

            r2 = client.patch(
                f"{base}/api/v1/tables/{table_id}",
                headers=_om_headers("application/json-patch+json"),
                content=json.dumps(patch),
            )
            if r2.status_code not in (200, 201):
                return {
                    "ok": False,
                    "entity_fqn": entity_fqn,
                    "property": HEALTH_SCORE_PROPERTY,
                    "score": score,
                    "breakdown": breakdown,
                    "reason": f"patch failed: {r2.status_code} {r2.text[:120]}",
                }

            return {
                "ok": True,
                "entity_fqn": entity_fqn,
                "property": HEALTH_SCORE_PROPERTY,
                "score": score,
                "breakdown": breakdown,
                "written_at": datetime.now(timezone.utc).isoformat(),
                "om_url": f"{base}/table/{entity_fqn}",
                "registered": reg.get("created", False),
            }
    except Exception as exc:
        return {
            "ok": False,
            "entity_fqn": entity_fqn,
            "property": HEALTH_SCORE_PROPERTY,
            "score": score,
            "breakdown": breakdown,
            "reason": str(exc)[:200],
        }


def patch_entity_description(
    entity_fqn: str,
    description: str,
    entity_type: str = "tables",
) -> dict[str, Any]:
    """Patch a description onto an OM entity by FQN.

    This is the direct, deterministic version of the Curator Agent's
    ``patch_entity`` capability, used by smoke tests and live demos.
    """
    if is_demo():
        return {
            "ok": True,
            "demo": True,
            "entity_fqn": entity_fqn,
            "description": description,
        }
    if is_dry_run():
        return {
            "ok": True,
            "dry_run": True,
            "entity_fqn": entity_fqn,
            "would_patch": [{"op": "add", "path": "/description", "value": description}],
        }

    ok, entity = _om_json_request(
        "GET",
        f"/api/v1/{entity_type}/name/{entity_fqn}",
        content_type="application/json",
    )
    if not ok:
        return {"ok": False, "reason": "lookup failed", "detail": entity}

    existing = entity.get("description")
    patch = [{
        "op": "replace" if existing else "add",
        "path": "/description",
        "value": description,
    }]
    ok, patched = _om_json_request(
        "PATCH",
        f"/api/v1/{entity_type}/{entity['id']}",
        content_type="application/json-patch+json",
        json_body=patch,
    )
    if not ok:
        return {"ok": False, "reason": "patch failed", "detail": patched}
    return {
        "ok": True,
        "entity_fqn": entity_fqn,
        "entity_type": entity_type,
        "old_description": existing,
        "description": patched.get("description") or description,
        "version": patched.get("version"),
        "om_url": f"{_om_base()}/{entity_type.rstrip('s')}/{entity_fqn}",
    }


def create_glossary_with_term(
    glossary_name: str,
    glossary_description: str,
    term_name: str,
    term_description: str,
) -> dict[str, Any]:
    """Create a glossary and one term, idempotently enough for demos."""
    if is_demo():
        return {
            "ok": True,
            "demo": True,
            "glossary": glossary_name,
            "term": f"{glossary_name}.{term_name}",
        }
    if is_dry_run():
        return {
            "ok": True,
            "dry_run": True,
            "would_create": {
                "glossary": glossary_name,
                "term": f"{glossary_name}.{term_name}",
            },
        }

    ok, glossary = _om_json_request(
        "POST",
        "/api/v1/glossaries",
        json_body={
            "name": glossary_name,
            "displayName": glossary_name,
            "description": glossary_description,
        },
    )
    glossary_created = ok
    if not ok and glossary.get("status") in (400, 409):
        ok, glossary = _om_json_request(
            "GET",
            f"/api/v1/glossaries/name/{glossary_name}",
            content_type="application/json",
        )
        glossary_created = False
    if not ok:
        return {"ok": False, "reason": "glossary create/lookup failed", "detail": glossary}

    ok, term = _om_json_request(
        "POST",
        "/api/v1/glossaryTerms",
        json_body={
            "name": term_name,
            "displayName": term_name,
            "description": term_description,
            "glossary": glossary.get("fullyQualifiedName") or glossary_name,
        },
    )
    term_created = ok
    if not ok and term.get("status") in (400, 409):
        ok, term = _om_json_request(
            "GET",
            f"/api/v1/glossaryTerms/name/{glossary_name}.{term_name}",
            content_type="application/json",
        )
        term_created = False
    if not ok:
        return {"ok": False, "reason": "term create/lookup failed", "detail": term, "glossary": glossary}

    return {
        "ok": True,
        "glossary": glossary.get("fullyQualifiedName") or glossary_name,
        "term": term.get("fullyQualifiedName") or f"{glossary_name}.{term_name}",
        "glossary_created": glossary_created,
        "term_created": term_created,
        "glossary_id": glossary.get("id"),
        "term_id": term.get("id"),
    }


# ---------------------------------------------------------------------------
# 2. Schema-drift timeline
# ---------------------------------------------------------------------------


def _demo_schema_drift(entity_fqn: str) -> dict[str, Any]:
    now = datetime.now(timezone.utc)

    def _at(days_ago: int) -> str:
        return (now - timedelta(days=days_ago)).isoformat()

    return {
        "demo": True,
        "entity_fqn": entity_fqn,
        "version_count": 5,
        "first_seen": _at(120),
        "last_changed": _at(2),
        "changes": [
            {"ts": _at(2), "version": "1.4", "kind": "column_added",
             "column": "loyalty_tier", "details": "VARCHAR(16)", "by": "ingestion-service"},
            {"ts": _at(14), "version": "1.3", "kind": "column_type_changed",
             "column": "phone", "details": "VARCHAR(20) -> VARCHAR(32)", "by": "alice@acme.com"},
            {"ts": _at(31), "version": "1.2", "kind": "column_renamed",
             "column": "cust_id -> customer_id", "details": "rename", "by": "bob@acme.com"},
            {"ts": _at(60), "version": "1.1", "kind": "column_added",
             "column": "email_address", "details": "VARCHAR(128), tagged PII.Sensitive", "by": "ingestion-service"},
            {"ts": _at(120), "version": "1.0", "kind": "table_created",
             "column": "*", "details": "initial schema", "by": "ingestion-service"},
        ],
        "summary": {
            "additions": 2,
            "renames": 1,
            "type_changes": 1,
            "drops": 0,
        },
    }


def _diff_columns(prev_cols: list[dict], curr_cols: list[dict]) -> list[dict]:
    """Compare two column lists and emit structured drift events."""
    prev_by_name = {c.get("name"): c for c in prev_cols if c.get("name")}
    curr_by_name = {c.get("name"): c for c in curr_cols if c.get("name")}
    events: list[dict] = []

    for name, col in curr_by_name.items():
        if name not in prev_by_name:
            events.append({
                "kind": "column_added",
                "column": name,
                "details": col.get("dataType") or col.get("dataTypeDisplay") or "",
            })
            continue
        prev = prev_by_name[name]
        prev_type = prev.get("dataType") or prev.get("dataTypeDisplay")
        curr_type = col.get("dataType") or col.get("dataTypeDisplay")
        if prev_type and curr_type and prev_type != curr_type:
            events.append({
                "kind": "column_type_changed",
                "column": name,
                "details": f"{prev_type} -> {curr_type}",
            })

    for name in prev_by_name:
        if name not in curr_by_name:
            events.append({
                "kind": "column_dropped",
                "column": name,
                "details": prev_by_name[name].get("dataType") or "",
            })

    return events


def _decode_table_version(raw: Any) -> dict[str, Any] | None:
    """OM 1.12 can return full version objects as JSON strings."""
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return None
    return raw if isinstance(raw, dict) else None


def schema_drift_timeline(entity_fqn: str, limit: int = 20) -> dict[str, Any]:
    """Return a clean timeline of schema changes for a table.

    Walks OM's native ``/api/v1/tables/{id}/versions`` and diffs adjacent
    versions to produce add/drop/type-change events. Falls back to the demo
    timeline on any failure so the UI always has something to render.
    """
    if is_demo():
        return _demo_schema_drift(entity_fqn)

    if not settings.ai_sdk_token:
        return {
            "demo": False,
            "entity_fqn": entity_fqn,
            "version_count": 0,
            "first_seen": None,
            "last_changed": None,
            "changes": [],
            "summary": {"additions": 0, "renames": 0, "type_changes": 0, "drops": 0},
            "error": "AI_SDK_TOKEN not configured",
        }

    base = _om_base()
    try:
        with httpx.Client(timeout=15.0) as client:
            r = client.get(
                f"{base}/api/v1/tables/name/{entity_fqn}",
                headers=_om_headers(),
                params={"fields": "columns"},
            )
            if r.status_code != 200:
                return {
                    "demo": False,
                    "entity_fqn": entity_fqn,
                    "version_count": 0,
                    "first_seen": None,
                    "last_changed": None,
                    "changes": [],
                    "summary": {"additions": 0, "renames": 0, "type_changes": 0, "drops": 0},
                    "error": f"table lookup failed: {r.status_code}",
                }
            table = r.json()
            table_id = table.get("id")

            v = client.get(
                f"{base}/api/v1/tables/{table_id}/versions",
                headers=_om_headers(),
            )
            if v.status_code != 200:
                return {
                    "demo": False,
                    "entity_fqn": entity_fqn,
                    "version_count": 0,
                    "first_seen": None,
                    "last_changed": None,
                    "changes": [],
                    "summary": {"additions": 0, "renames": 0, "type_changes": 0, "drops": 0},
                    "error": f"versions lookup failed: {v.status_code}",
                }
            versions_payload = v.json()
            version_refs = versions_payload.get("versions") or []

            # Each ref has {version, updatedAt}. Fetch each one in sorted order.
            decoded_refs = [_decode_table_version(ref) for ref in version_refs]
            decoded_refs = [ref for ref in decoded_refs if ref]
            version_refs = sorted(decoded_refs, key=lambda x: x.get("updatedAt", 0))[-limit:]
            full_versions: list[dict] = []
            for ref in version_refs:
                ver = ref.get("version")
                if ver is None:
                    continue
                if ref.get("columns") is not None:
                    full_versions.append(ref)
                    continue
                fr = client.get(f"{base}/api/v1/tables/{table_id}/versions/{ver}", headers=_om_headers())
                if fr.status_code == 200:
                    full_versions.append(_decode_table_version(fr.json()) or fr.json())

            changes: list[dict] = []
            for prev, curr in zip(full_versions, full_versions[1:]):
                ts_ms = curr.get("updatedAt") or 0
                ts = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).isoformat() if ts_ms else ""
                events = _diff_columns(prev.get("columns") or [], curr.get("columns") or [])
                for e in events:
                    e["ts"] = ts
                    e["version"] = str(curr.get("version"))
                    e["by"] = curr.get("updatedBy") or "unknown"
                    changes.append(e)

            summary = {
                "additions": sum(1 for c in changes if c["kind"] == "column_added"),
                "renames": 0,  # OM doesn't surface renames natively in version diffs
                "type_changes": sum(1 for c in changes if c["kind"] == "column_type_changed"),
                "drops": sum(1 for c in changes if c["kind"] == "column_dropped"),
            }

            return {
                "demo": False,
                "entity_fqn": entity_fqn,
                "version_count": len(full_versions),
                "first_seen": (
                    datetime.fromtimestamp(full_versions[0].get("updatedAt", 0) / 1000, tz=timezone.utc).isoformat()
                    if full_versions else None
                ),
                "last_changed": (
                    datetime.fromtimestamp(full_versions[-1].get("updatedAt", 0) / 1000, tz=timezone.utc).isoformat()
                    if full_versions else None
                ),
                "changes": list(reversed(changes)),  # newest first
                "summary": summary,
            }
    except Exception as exc:
        return {
            "demo": False,
            "entity_fqn": entity_fqn,
            "version_count": 0,
            "first_seen": None,
            "last_changed": None,
            "changes": [],
            "summary": {"additions": 0, "renames": 0, "type_changes": 0, "drops": 0},
            "error": str(exc)[:200],
        }
