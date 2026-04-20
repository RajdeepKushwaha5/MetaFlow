"""Bulk lineage authoring — the killer Claude-demo parallel.

The OM org's hackathon talk closed with a Claude demo that added lineage
edges across many tables in one prompt. This module gives MetaFlow the
same superpower:

- ``get_query_history_lineage_candidates`` reads OM's ``/api/v1/usage``
  endpoint and infers source -> target relationships from JOIN patterns
  in the recorded query log.
- ``add_lineage_edge`` calls OM's ``/api/v1/lineage`` PUT endpoint to
  materialize one edge.
- ``bulk_add_lineage_edges`` does it for a list — the "scale this out"
  moment in the demo.
"""

from __future__ import annotations

import json
import re
from typing import Any

import httpx
from langchain_core.tools import tool

from app.core.auth import build_auth_headers
from app.core.config import settings
from app.core.demo import is_demo


def _om_base() -> str:
    return settings.ai_sdk_host.rstrip("/")


def _om_headers(content_type: str | None = None) -> dict[str, str]:
    return build_auth_headers(content_type)


# Very loose regex for "JOIN <table>" — good enough to find candidate pairs.
_JOIN_RE = re.compile(r"\bJOIN\s+([A-Za-z_][\w.]*)", re.IGNORECASE)
_FROM_RE = re.compile(r"\bFROM\s+([A-Za-z_][\w.]*)", re.IGNORECASE)
_INSERT_RE = re.compile(r"\bINSERT\s+INTO\s+([A-Za-z_][\w.]*)", re.IGNORECASE)


def get_lineage_tools() -> list:
    return [
        get_query_history_lineage_candidates,
        bulk_add_lineage_edges,
    ]


def _extract_pairs(sql: str) -> list[tuple[str, str]]:
    """Return [(source, target)] pairs inferred from one SQL statement."""
    sources: list[str] = []
    target: str | None = None

    sources.extend(_FROM_RE.findall(sql))
    sources.extend(_JOIN_RE.findall(sql))

    inserts = _INSERT_RE.findall(sql)
    if inserts:
        target = inserts[0]

    if not target or not sources:
        return []
    pairs: list[tuple[str, str]] = []
    for s in sources:
        if s != target:
            pairs.append((s, target))
    return pairs


def _demo_candidates() -> list[dict]:
    return [
        {"source_fqn": "warehouse.raw.events", "target_fqn": "warehouse.staging.events_clean", "confidence": 0.95, "evidence": "INSERT INTO events_clean ... FROM events"},
        {"source_fqn": "warehouse.staging.events_clean", "target_fqn": "warehouse.analytics.daily_revenue", "confidence": 0.92, "evidence": "INSERT INTO daily_revenue ... FROM events_clean JOIN orders"},
        {"source_fqn": "warehouse.staging.orders", "target_fqn": "warehouse.analytics.daily_revenue", "confidence": 0.9, "evidence": "JOIN orders"},
        {"source_fqn": "warehouse.crm.customers", "target_fqn": "warehouse.analytics.customer_360", "confidence": 0.88, "evidence": "INSERT INTO customer_360 ... FROM customers"},
        {"source_fqn": "warehouse.analytics.customer_360", "target_fqn": "warehouse.bi.exec_dashboard_data", "confidence": 0.8, "evidence": "FROM customer_360"},
    ]


@tool
def get_query_history_lineage_candidates(
    service_name: str = "",
    limit: int = 200,
) -> str:
    """Infer lineage candidates from OM's recorded query history.

    Reads OM's usage / query-log endpoint and parses JOIN / INSERT INTO
    patterns to suggest source -> target lineage pairs. Each candidate
    has a confidence score and the SQL evidence.

    Use this BEFORE calling ``bulk_add_lineage_edges`` so the user (or
    the supervisor) can sanity-check what's about to be written.

    Args:
        service_name: Filter by OM service name (empty = all).
        limit: Max queries to scan.
    """
    if is_demo():
        return json.dumps({
            "demo": True,
            "candidates": _demo_candidates(),
            "scanned_queries": 47,
            "service": service_name or "warehouse",
        }, indent=2)

    try:
        with httpx.Client(timeout=20.0) as client:
            r = client.get(
                f"{_om_base()}/api/v1/queries",
                headers=_om_headers(),
                params={"limit": limit, "service": service_name} if service_name else {"limit": limit},
            )
            if r.status_code != 200:
                return json.dumps({"error": f"HTTP {r.status_code}", "body": r.text[:200]})
            data = r.json().get("data", [])

            seen: dict[tuple[str, str], dict] = {}
            for q in data:
                sql = q.get("query") or q.get("queryText") or ""
                if not sql:
                    continue
                for src, tgt in _extract_pairs(sql):
                    key = (src, tgt)
                    if key in seen:
                        seen[key]["evidence_count"] += 1
                    else:
                        seen[key] = {
                            "source_fqn": src,
                            "target_fqn": tgt,
                            "evidence": sql[:200],
                            "evidence_count": 1,
                        }
            candidates = sorted(seen.values(), key=lambda c: c["evidence_count"], reverse=True)
            for c in candidates:
                # Confidence: 0.5 baseline + 0.1 per repeated occurrence (cap 0.95)
                c["confidence"] = round(min(0.95, 0.5 + 0.1 * c["evidence_count"]), 2)

            return json.dumps({
                "scanned_queries": len(data),
                "candidate_count": len(candidates),
                "candidates": candidates[:50],
            }, indent=2)
    except Exception as exc:
        return json.dumps({"error": str(exc)[:200]})


def _add_one_edge(source_fqn: str, target_fqn: str) -> dict[str, Any]:
    """Resolve FQNs to entity ids and PUT one lineage edge to OM."""
    base = _om_base()
    # Resolve both ends — assume tables.
    try:
        with httpx.Client(timeout=10.0) as client:
            sr = client.get(
                f"{base}/api/v1/tables/name/{source_fqn}",
                headers=_om_headers(),
            )
            tr = client.get(
                f"{base}/api/v1/tables/name/{target_fqn}",
                headers=_om_headers(),
            )
            if sr.status_code != 200 or tr.status_code != 200:
                return {"ok": False, "source_fqn": source_fqn, "target_fqn": target_fqn,
                        "reason": f"resolve failed: {sr.status_code}/{tr.status_code}"}
            sid = sr.json().get("id")
            tid = tr.json().get("id")

            payload = {
                "edge": {
                    "fromEntity": {"id": sid, "type": "table"},
                    "toEntity": {"id": tid, "type": "table"},
                    "lineageDetails": {"description": "Inferred by metaflow.bulk-lineage from query history"},
                }
            }
            pr = client.put(
                f"{base}/api/v1/lineage",
                headers=_om_headers("application/json"),
                json=payload,
            )
            ok = pr.status_code in (200, 201)
            return {"ok": ok, "source_fqn": source_fqn, "target_fqn": target_fqn,
                    "status": pr.status_code,
                    "reason": None if ok else pr.text[:120]}
    except Exception as exc:
        return {"ok": False, "source_fqn": source_fqn, "target_fqn": target_fqn,
                "reason": str(exc)[:120]}


@tool
def bulk_add_lineage_edges(candidates_json: str, min_confidence: float = 0.7) -> str:
    """Materialize a batch of lineage edges in OpenMetadata.

    ``candidates_json`` is the JSON string returned by
    ``get_query_history_lineage_candidates`` (or any list of
    ``{source_fqn, target_fqn, confidence?}`` objects).

    Filters by ``min_confidence`` and PUTs each edge to OM's
    ``/api/v1/lineage`` endpoint. Returns a summary of what was added,
    skipped (low confidence), and failed.
    """
    try:
        parsed = json.loads(candidates_json) if isinstance(candidates_json, str) else candidates_json
    except Exception as exc:
        return json.dumps({"error": f"could not parse candidates_json: {exc}"})

    if isinstance(parsed, dict) and "candidates" in parsed:
        items = parsed["candidates"]
    elif isinstance(parsed, list):
        items = parsed
    else:
        return json.dumps({"error": "candidates_json must be a list or object with 'candidates'"})

    eligible = [c for c in items if float(c.get("confidence", 1.0)) >= min_confidence]
    skipped = len(items) - len(eligible)

    if is_demo():
        return json.dumps({
            "demo": True,
            "added": len(eligible),
            "skipped_low_confidence": skipped,
            "failed": 0,
            "min_confidence": min_confidence,
            "results": [
                {"ok": True, "source_fqn": c["source_fqn"], "target_fqn": c["target_fqn"]}
                for c in eligible
            ],
            "narrative": (
                f"Added {len(eligible)} lineage edges to OpenMetadata in one batch. "
                f"Skipped {skipped} candidates below {min_confidence} confidence."
            ),
        }, indent=2)

    results = [_add_one_edge(c["source_fqn"], c["target_fqn"]) for c in eligible]
    added = sum(1 for r in results if r.get("ok"))
    failed = len(results) - added
    return json.dumps({
        "added": added,
        "skipped_low_confidence": skipped,
        "failed": failed,
        "min_confidence": min_confidence,
        "results": results[:50],
    }, indent=2)
