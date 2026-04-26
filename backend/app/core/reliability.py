"""Data Reliability engine — impact scoring, cause trees, DQ recommendations.

This module powers the "signature" features of MetaFlow:
- Impact Score: ranks DQ failures by blast radius using lineage BFS.
- Cause Tree: aggregates failure context into an explainable tree.
- DQ Recommendations: heuristic test suggestions from column profiles.
- Create Test: POST a new test case to OpenMetadata.

All functions gracefully fall back to realistic demo data when OM is
unreachable, so the UI is always demoable.
"""

from __future__ import annotations

import hashlib
import json
import time
from typing import Any

import httpx

from app.core.config import settings


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _om_request(method: str, path: str, *, params: dict | None = None, json_body: dict | None = None) -> dict | None:
    """Authenticated request to OpenMetadata REST API. Returns None on failure."""
    try:
        from app.core.auth import build_auth_headers
        base = settings.ai_sdk_host.rstrip("/")
        headers = build_auth_headers("application/json" if json_body is not None else None)
        resp = httpx.request(
            method,
            f"{base}{path}",
            headers=headers,
            params=params,
            json=json_body,
            timeout=8,
        )
        if resp.status_code >= 400:
            return None
        return resp.json()
    except Exception:
        return None


def _is_om_alive() -> bool:
    return _om_request("GET", "/api/v1/system/version") is not None


# ---------------------------------------------------------------------------
# Demo data — deterministic based on input FQN (so same entity → same graph)
# ---------------------------------------------------------------------------


def _seed(fqn: str) -> int:
    return int(hashlib.md5(fqn.encode()).hexdigest()[:8], 16)


def _demo_impact(entity_fqn: str) -> dict:
    """Realistic demo impact graph (used when OM is unreachable)."""
    s = _seed(entity_fqn)

    # Build a believable 3-tier graph
    upstream = [
        {"fqn": "raw.payments_stream", "type": "table", "service": "kafka", "layer": -1},
        {"fqn": "raw.users_cdc", "type": "table", "service": "kafka", "layer": -1},
    ]
    center = {
        "fqn": entity_fqn,
        "type": "table",
        "service": entity_fqn.split(".")[0] if "." in entity_fqn else "warehouse",
        "layer": 0,
        "failing": True,
    }
    downstream_tables = [
        {"fqn": "analytics.daily_revenue", "type": "table", "service": "snowflake", "layer": 1},
        {"fqn": "analytics.customer_360", "type": "table", "service": "snowflake", "layer": 1},
        {"fqn": "marts.finance_summary", "type": "table", "service": "snowflake", "layer": 2},
    ]
    downstream_dashboards = [
        {"fqn": "superset.Executive KPIs", "type": "dashboard", "service": "superset", "layer": 3, "consumers": 42},
        {"fqn": "looker.Revenue by Region", "type": "dashboard", "service": "looker", "layer": 3, "consumers": 18},
    ]
    downstream_pipelines = [
        {"fqn": "airflow.billing_nightly", "type": "pipeline", "service": "airflow", "layer": 2},
    ]

    nodes = upstream + [center] + downstream_tables + downstream_dashboards + downstream_pipelines
    edges = [
        {"source": "raw.payments_stream", "target": entity_fqn},
        {"source": "raw.users_cdc", "target": entity_fqn},
        {"source": entity_fqn, "target": "analytics.daily_revenue"},
        {"source": entity_fqn, "target": "analytics.customer_360"},
        {"source": "analytics.daily_revenue", "target": "marts.finance_summary"},
        {"source": "analytics.daily_revenue", "target": "superset.Executive KPIs"},
        {"source": "analytics.customer_360", "target": "looker.Revenue by Region"},
        {"source": "analytics.daily_revenue", "target": "airflow.billing_nightly"},
    ]

    # Scoring components
    downstream_count = len([n for n in nodes if n["layer"] > 0])
    dashboard_count = len(downstream_dashboards)
    total_consumers = sum(n.get("consumers", 0) for n in downstream_dashboards)
    criticality = 0.85 + (s % 15) / 100  # 0.85..1.00
    recency_hours = (s % 72) + 1
    recency_factor = max(0.3, 1.0 - (recency_hours / 168))  # decay over a week

    # Final score 0-100
    raw_score = (
        downstream_count * 8
        + dashboard_count * 15
        + total_consumers * 0.6
        + criticality * 20
    ) * recency_factor
    score = round(min(100, raw_score), 1)

    severity = "critical" if score >= 70 else "high" if score >= 45 else "medium" if score >= 20 else "low"

    return {
        "entity_fqn": entity_fqn,
        "score": score,
        "severity": severity,
        "demo": True,
        "breakdown": {
            "downstream_tables": len(downstream_tables),
            "downstream_dashboards": dashboard_count,
            "downstream_pipelines": len(downstream_pipelines),
            "total_consumers": total_consumers,
            "criticality_tier": round(criticality, 2),
            "hours_since_last_failure": recency_hours,
        },
        "nodes": nodes,
        "edges": edges,
        "explanation": (
            f"Score {score}/100 ({severity}). "
            f"{downstream_count} downstream assets including "
            f"{dashboard_count} dashboards with ~{total_consumers} weekly viewers. "
            f"Criticality tier: {round(criticality, 2)}. "
            f"Recency weighting: {round(recency_factor, 2)} ({recency_hours}h ago)."
        ),
    }


# ---------------------------------------------------------------------------
# Impact Score — public API
# ---------------------------------------------------------------------------


def compute_impact(entity_fqn: str, max_depth: int = 3) -> dict:
    """Compute impact score and build a lineage-based blast radius graph.

    Algorithm:
      1. Fetch entity from OM (fallback to demo).
      2. BFS downstream lineage up to max_depth layers.
      3. Count nodes by type; fetch usage/criticality tier.
      4. Score = f(downstream_count, dashboard_count, consumers, criticality, recency).
    """
    if not _is_om_alive():
        return _demo_impact(entity_fqn)

    # Try to fetch the entity
    entity = _om_request("GET", f"/api/v1/tables/name/{entity_fqn}", params={"fields": "tags,owners"})
    if entity is None:
        return {
            "entity_fqn": entity_fqn,
            "score": 0,
            "severity": "unknown",
            "demo": False,
            "source": "openmetadata_not_found",
            "breakdown": {
                "downstream_tables": 0,
                "downstream_dashboards": 0,
                "downstream_pipelines": 0,
                "total_consumers": 0,
                "criticality_tier": 0,
                "hours_since_last_failure": 0,
            },
            "nodes": [],
            "edges": [],
            "explanation": f"Entity '{entity_fqn}' was not found in OpenMetadata.",
        }

    entity_id = entity.get("id")
    if not entity_id:
        return {
            "entity_fqn": entity_fqn,
            "score": 0,
            "severity": "unknown",
            "demo": False,
            "source": "openmetadata_missing_id",
            "breakdown": {
                "downstream_tables": 0,
                "downstream_dashboards": 0,
                "downstream_pipelines": 0,
                "total_consumers": 0,
                "criticality_tier": 0,
                "hours_since_last_failure": 0,
            },
            "nodes": [],
            "edges": [],
            "explanation": f"Entity '{entity_fqn}' exists in OpenMetadata but did not include an id.",
        }

    nodes: dict[str, dict] = {
        entity_fqn: {
            "fqn": entity_fqn,
            "type": "table",
            "service": entity.get("service", {}).get("name", "warehouse"),
            "layer": 0,
            "failing": True,
        }
    }
    edges: list[dict] = []
    tier_fqn = ""
    for tag in entity.get("tags", []) or []:
        tag_fqn = tag.get("tagFQN") or tag.get("name") or ""
        if tag_fqn.startswith("Tier."):
            tier_fqn = tag_fqn
            break
    criticality = _tier_to_score(tier_fqn)

    # BFS downstream (and harvest upstream on first pass) via lineage
    frontier = [(entity_id, entity_fqn, 0)]
    visited = {entity_id}
    while frontier:
        next_frontier: list[tuple[str, str, int]] = []
        for eid, efqn, layer in frontier:
            if layer >= max_depth:
                continue
            # On the first pass also request upstreamDepth=1 to get source nodes (layer=-1)
            params: dict = {"downstreamDepth": 1}
            if layer == 0:
                params["upstreamDepth"] = 1
            lineage = _om_request("GET", f"/api/v1/lineage/table/{eid}", params=params)
            if not lineage:
                continue
            lineage_nodes = {n.get("id"): n for n in lineage.get("nodes", []) if n.get("id")}

            # --- Harvest upstream source nodes (layer=-1) on first pass only ---
            if layer == 0:
                for up_edge in lineage.get("upstreamEdges", []):
                    from_id = up_edge.get("fromEntity")
                    if not from_id or from_id in visited:
                        continue
                    up_node = lineage_nodes.get(from_id, {})
                    up_fqn = up_node.get("fullyQualifiedName", from_id)
                    if up_fqn not in nodes:
                        up_type = up_node.get("type") or up_node.get("entityType", "table")
                        nodes[up_fqn] = {
                            "fqn": up_fqn,
                            "type": up_type,
                            "service": (up_node.get("service") or {}).get("name") or up_fqn.split(".")[0],
                            "layer": -1,
                        }
                        edges.append({"source": up_fqn, "target": efqn})

            # --- BFS downstream: only process edges originating from the current entity ---
            for edge in lineage.get("downstreamEdges", []):
                from_entity = edge.get("fromEntity")
                to_id = edge.get("toEntity")
                # Skip transitive edges (from other nodes) to avoid wrong layer assignment
                if not to_id or to_id in visited or from_entity != eid:
                    continue
                visited.add(to_id)
                to_node = edge.get("toEntityData") or lineage_nodes.get(to_id, {})
                to_fqn = to_node.get("fullyQualifiedName", to_id)
                to_type = to_node.get("entityType") or to_node.get("type", "table")
                nodes[to_fqn] = {
                    "fqn": to_fqn,
                    "type": to_type,
                    "service": (to_node.get("service") or {}).get("name") or to_fqn.split(".")[0],
                    "layer": layer + 1,
                }
                edges.append({"source": efqn, "target": to_fqn})
                if to_type == "table":
                    next_frontier.append((to_id, to_fqn, layer + 1))
        frontier = next_frontier

    node_list = list(nodes.values())
    downstream_count = sum(1 for n in node_list if n["layer"] > 0)
    dashboard_count = sum(1 for n in node_list if n.get("type") == "dashboard")
    pipeline_count = sum(1 for n in node_list if n.get("type") == "pipeline")

    # Usage: rough consumer count from follows/usage (may not exist)
    total_consumers = dashboard_count * 10  # conservative estimate

    raw_score = (
        downstream_count * 8
        + dashboard_count * 15
        + total_consumers * 0.6
        + criticality * 20
    )
    score = round(min(100, raw_score), 1)
    severity = "critical" if score >= 70 else "high" if score >= 45 else "medium" if score >= 20 else "low"

    source = "openmetadata_lineage" if edges else "openmetadata_entity"
    return {
        "entity_fqn": entity_fqn,
        "score": score,
        "severity": severity,
        "demo": False,
        "source": source,
        "breakdown": {
            "downstream_tables": sum(1 for n in node_list if n.get("type") == "table" and n["layer"] > 0),
            "downstream_dashboards": dashboard_count,
            "downstream_pipelines": pipeline_count,
            "total_consumers": total_consumers,
            "criticality_tier": criticality,
            "hours_since_last_failure": 0,
        },
        "nodes": node_list,
        "edges": edges,
        "explanation": (
            f"Score {score}/100 ({severity}). "
            f"{downstream_count} downstream assets including {dashboard_count} dashboards."
            if edges
            else f"Score {score}/100 ({severity}). Live OpenMetadata entity found; no downstream lineage edges are currently registered for this seeded table."
        ),
    }


def _tier_to_score(tier_fqn: str) -> float:
    """Map OM tier tag to criticality score 0..1."""
    mapping = {"Tier.Tier1": 1.0, "Tier.Tier2": 0.75, "Tier.Tier3": 0.5, "Tier.Tier4": 0.3, "Tier.Tier5": 0.1}
    return mapping.get(tier_fqn, 0.6)


# ---------------------------------------------------------------------------
# Cause Tree — aggregate failure context into explainable tree
# ---------------------------------------------------------------------------


def _demo_cause_tree(test_fqn: str) -> dict:
    s = _seed(test_fqn)
    null_rate = 15 + (s % 15)

    return {
        "test_fqn": test_fqn,
        "test_name": test_fqn.split(".")[-1],
        "status": "Failed",
        "demo": True,
        "narrative": (
            f"The test **{test_fqn.split('.')[-1]}** failed because the null rate on the target column "
            f"jumped to {null_rate}% (baseline: <1%). The root cause appears to be an upstream schema "
            f"migration on `payments_raw` 2 days ago that changed the `amount` column's default behavior. "
            f"Owner @alice was notified. No prior incidents in last 30 days."
        ),
        "tree": {
            "id": "root",
            "label": f"Test '{test_fqn.split('.')[-1]}' failed",
            "kind": "failure",
            "severity": "high",
            "evidence": f"Null rate: {null_rate}% (threshold: 1%)",
            "children": [
                {
                    "id": "pattern",
                    "label": "Pattern analysis",
                    "kind": "pattern",
                    "evidence": "Nulls concentrated in 2026-04-15 partition",
                    "children": [
                        {
                            "id": "temporal",
                            "label": "Temporal concentration",
                            "kind": "signal",
                            "evidence": "98% of nulls arrived in last 24h",
                            "children": [],
                        }
                    ],
                },
                {
                    "id": "upstream",
                    "label": "Upstream investigation",
                    "kind": "upstream",
                    "evidence": "payments_raw.amount shows matching null pattern (24% null rate)",
                    "is_root_cause": True,
                    "children": [
                        {
                            "id": "schema-change",
                            "label": "Schema migration on payments_raw",
                            "kind": "change",
                            "evidence": "Column default removed 2 days ago by @bob",
                            "children": [],
                        }
                    ],
                },
                {
                    "id": "context",
                    "label": "Context",
                    "kind": "context",
                    "children": [
                        {
                            "id": "owner",
                            "label": "Owner: @alice",
                            "kind": "owner",
                            "evidence": "Slack @alice · last active 3h ago",
                            "children": [],
                        },
                        {
                            "id": "history",
                            "label": "Recent incidents: 0",
                            "kind": "history",
                            "evidence": "No failures in last 30 days",
                            "children": [],
                        },
                    ],
                },
            ],
        },
        "suggested_actions": [
            {"label": "Revert payments_raw migration", "kind": "fix", "confidence": 0.82},
            {"label": "Notify @alice via Slack", "kind": "notify", "confidence": 0.95},
            {"label": "Create Jira ticket (P1)", "kind": "ticket", "confidence": 0.90},
        ],
    }


def build_cause_tree(test_fqn: str) -> dict:
    """Aggregate a failing DQ test's context into an explainable cause tree."""
    if not _is_om_alive():
        return _demo_cause_tree(test_fqn)

    tc = _om_request("GET", f"/api/v1/dataQuality/testCases/name/{test_fqn}", params={"fields": "testDefinition,testSuite"})
    if tc is None:
        return {
            "test_fqn": test_fqn,
            "test_name": test_fqn.split(".")[-1],
            "status": "NotFound",
            "demo": False,
            "narrative": f"Test case `{test_fqn}` was not found in OpenMetadata.",
            "tree": {
                "id": "root",
                "label": "OpenMetadata test case not found",
                "kind": "failure",
                "severity": "medium",
                "evidence": test_fqn,
                "children": [],
            },
            "suggested_actions": [
                {"label": "Create or materialize the missing OpenMetadata test case", "kind": "fix", "confidence": 0.9}
            ],
        }

    results = _om_request(
        "GET",
        f"/api/v1/dataQuality/testCases/testCaseResults/{test_fqn}",
        params={"limit": 10},
    )
    if results is None:
        results = _om_request("GET", f"/api/v1/dataQuality/testCases/{tc.get('id')}/testCaseResult", params={"limit": 10})
    latest = (results or {}).get("data", [{}])[0] if results else {}

    # Build tree from real data
    status = latest.get("testCaseStatus") or tc.get("entityStatus") or "Unprocessed"
    entity_link = tc.get("entityLink", "")
    test_definition = (tc.get("testDefinition") or {}).get("name", "unknown")
    params = tc.get("parameterValues") or []
    evidence = latest.get("result") or f"OpenMetadata test definition: {test_definition}"
    history_note = (
        "No execution result is available yet, so MetaFlow is showing definition and target evidence."
        if not latest
        else f"Latest run timestamp: {latest.get('timestamp', 'recently')}."
    )
    tree = {
        "id": "root",
        "label": f"Test '{tc.get('name')}' status: {status}",
        "kind": "failure",
        "severity": "high" if status == "Failed" else "medium",
        "evidence": evidence,
        "children": [
            {
                "id": "target",
                "label": "Target asset",
                "kind": "context",
                "evidence": entity_link or "No entity link returned",
                "children": [],
            },
            {
                "id": "definition",
                "label": f"Rule: {test_definition}",
                "kind": "signal",
                "evidence": ", ".join(f"{p.get('name')}={p.get('value')}" for p in params) if params else "No parameters",
                "children": [],
            },
            {
                "id": "history",
                "label": "Execution history",
                "kind": "history",
                "evidence": "No test run result has been recorded yet" if not latest else "Latest result loaded from OpenMetadata",
                "children": [],
            },
        ],
    }

    return {
        "test_fqn": test_fqn,
        "test_name": tc.get("name", ""),
        "status": status,
        "demo": False,
        "narrative": (
            f"OpenMetadata test case `{tc.get('name')}` targets `{entity_link}`. "
            f"Current status is `{status}`. "
            f"{history_note}"
        ),
        "tree": tree,
        "suggested_actions": [
            {"label": "Run the OpenMetadata test suite", "kind": "fix", "confidence": 0.86},
            {"label": "Review the target column and rule parameters", "kind": "investigate", "confidence": 0.82},
        ],
    }


# ---------------------------------------------------------------------------
# DQ Test Recommendations — heuristic suggestions from column profile
# ---------------------------------------------------------------------------


def _demo_recommendations(table_fqn: str) -> dict:
    return {
        "table_fqn": table_fqn,
        "demo": True,
        "recommendations": [
            {
                "id": "rec-1",
                "test_type": "columnValuesToBeNotNull",
                "column": "id",
                "rationale": "Primary key column — NULL values would break joins and break downstream pipelines.",
                "confidence": 0.98,
                "params": {},
            },
            {
                "id": "rec-2",
                "test_type": "columnValuesToBeUnique",
                "column": "id",
                "rationale": "Primary key should be unique. Current profile shows 0 duplicates in sampled rows.",
                "confidence": 0.95,
                "params": {},
            },
            {
                "id": "rec-3",
                "test_type": "columnValuesToMatchRegex",
                "column": "email",
                "rationale": "Email column detected — validate format to catch malformed inputs.",
                "confidence": 0.88,
                "params": {"regex": r"^[\w\.-]+@[\w\.-]+\.\w+$"},
            },
            {
                "id": "rec-4",
                "test_type": "columnValueMaxToBeBetween",
                "column": "amount",
                "rationale": "Numeric column — cap maximum to catch outliers. Current p99: 9,842.",
                "confidence": 0.76,
                "params": {"minValue": 0, "maxValue": 100000},
            },
            {
                "id": "rec-5",
                "test_type": "tableRowCountToBeBetween",
                "column": None,
                "rationale": "Daily volume check — typical range 50k–120k rows/day based on 30-day history.",
                "confidence": 0.83,
                "params": {"minValue": 40000, "maxValue": 150000},
            },
        ],
    }


def recommend_dq_tests(table_fqn: str) -> dict:
    """Suggest DQ tests based on column profile + type + name heuristics."""
    if not _is_om_alive():
        return _demo_recommendations(table_fqn)

    table = _om_request("GET", f"/api/v1/tables/name/{table_fqn}", params={"fields": "columns,profile"})
    if not table:
        return {
            "table_fqn": table_fqn,
            "demo": False,
            "recommendations": [],
            "message": f"Table '{table_fqn}' was not found in OpenMetadata.",
        }

    recs: list[dict] = []
    for i, col in enumerate(table.get("columns", [])[:12]):
        name = col.get("name", "").lower()
        dtype = col.get("dataType", "").upper()
        profile = col.get("profile", {}) or {}

        # Rule 1: PK-ish → not null + unique
        if name in ("id", "uuid", "pk") or name.endswith("_id"):
            recs.append({
                "id": f"rec-{i}-null",
                "test_type": "columnValuesToBeNotNull",
                "column": col["name"],
                "rationale": f"'{col['name']}' looks like an identifier — NULL values typically break joins.",
                "confidence": 0.95,
                "params": {},
            })
        # Rule 2: email → regex
        if "email" in name:
            recs.append({
                "id": f"rec-{i}-email",
                "test_type": "columnValuesToMatchRegex",
                "column": col["name"],
                "rationale": "Email column detected — validate format.",
                "confidence": 0.88,
                "params": {"regex": r"^[\w\.-]+@[\w\.-]+\.\w+$"},
            })
        # Rule 3: numeric → range
        if dtype in ("INT", "BIGINT", "DECIMAL", "NUMERIC", "FLOAT", "DOUBLE"):
            max_val = profile.get("max")
            if max_val is not None:
                recs.append({
                    "id": f"rec-{i}-range",
                    "test_type": "columnValueMaxToBeBetween",
                    "column": col["name"],
                    "rationale": f"Numeric column — current max: {max_val}. Guard against outliers.",
                    "confidence": 0.75,
                    "params": {"minValue": 0, "maxValue": max_val * 2 if isinstance(max_val, (int, float)) else 100000},
                })

    # Table-level
    row_count = (table.get("profile") or {}).get("rowCount")
    if row_count:
        recs.append({
            "id": "rec-table-rows",
            "test_type": "tableRowCountToBeBetween",
            "column": None,
            "rationale": f"Volume check — current row count: {row_count}.",
            "confidence": 0.80,
            "params": {"minValue": int(row_count * 0.5), "maxValue": int(row_count * 2)},
        })

    if not recs:
        return {
            "table_fqn": table_fqn,
            "demo": False,
            "recommendations": [],
            "message": "OpenMetadata table was found, but no column patterns required a recommendation.",
        }

    return {"table_fqn": table_fqn, "demo": False, "recommendations": recs[:8]}


def create_test_case(table_fqn: str, recommendation: dict) -> dict:
    """Create a test case on OpenMetadata from a recommendation."""
    if not _is_om_alive():
        return {
            "created": False,
            "demo": True,
            "message": "OpenMetadata unreachable — test would be created in a live environment.",
            "preview": {
                "name": f"{recommendation['test_type']}_{recommendation.get('column', 'table')}_{int(time.time())}",
                "testDefinition": recommendation["test_type"],
                "entityLink": f"<#E::table::{table_fqn}>",
                "parameterValues": [{"name": k, "value": str(v)} for k, v in recommendation.get("params", {}).items()],
            },
        }

    payload = {
        "name": f"{recommendation['test_type']}_{recommendation.get('column', 'table')}_{int(time.time())}",
        "testDefinition": recommendation["test_type"],
        "entityLink": (
            f"<#E::table::{table_fqn}::columns::{recommendation['column']}>"
            if recommendation.get("column")
            else f"<#E::table::{table_fqn}>"
        ),
        "parameterValues": [{"name": k, "value": str(v)} for k, v in recommendation.get("params", {}).items()],
    }
    result = _om_request("POST", "/api/v1/dataQuality/testCases", json_body=payload)
    if result is None:
        return {"created": False, "message": "Failed to create test case", "preview": payload}
    return {"created": True, "test_case": result, "preview": payload}
