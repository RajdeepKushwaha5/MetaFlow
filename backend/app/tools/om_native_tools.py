"""Native OpenMetadata tools that go beyond what OM's MCP server exposes.

These tools talk directly to OM's REST API and feed two things the org
emphasized in the hackathon talk:

1. **Search-preference awareness** (#3) — read OM's search settings so the
   agent can EXPLAIN to the user when results were boosted by their org's
   preferences ("ranked first because Snowflake is boosted +2.0").

2. **Custom-property surfacing** (#4) — every entity fetch also pulls the
   ``extension`` block, so any custom properties OTHER teams set (including
   MetaFlow's own ``metaflow_health_score``) become visible in the chat
   reasoning.

3. **Token-efficiency tracking** (#1) — wraps semantic_search and records
   how many entities the agent did NOT have to inspect because OM filtered
   them out first.
"""

from __future__ import annotations

import json

import httpx
from langchain_core.tools import tool

from app.core.auth import build_auth_headers
from app.core.config import settings
from app.core.demo import is_demo
from app.core.stats import record_semantic_search


def _om_base() -> str:
    return settings.ai_sdk_host.rstrip("/")


def _om_headers() -> dict[str, str]:
    return build_auth_headers()


def get_om_native_tools() -> list:
    return [
        om_get_search_preferences,
        om_search_with_preferences,
        om_read_custom_properties,
    ]


# ---------------------------------------------------------------------------
# 1. Search preferences — answers org talk audience question #2
# ---------------------------------------------------------------------------


@tool
def om_get_search_preferences() -> str:
    """Read the org's OpenMetadata search settings (term boosts, field weights).

    Use this BEFORE running a broad search if the user's question looks
    ambiguous ("find customers"), so you can explain WHY the top result
    was ranked first ("Snowflake is boosted +2.0 in your org's prefs").

    Returns the search settings as JSON. Empty / defaults if no org tuning
    has been done yet.
    """
    if is_demo():
        return json.dumps({
            "demo": True,
            "term_boosts": [
                {"value": "snowflake", "boost": 2.0, "field": "service.name"},
                {"value": "tier1", "boost": 3.0, "field": "tier.tagFQN"},
            ],
            "field_weights": {
                "displayName": 15.0,
                "name": 10.0,
                "description": 2.0,
                "columns.name": 7.0,
            },
            "explanation": (
                "Your org boosts Snowflake assets and Tier-1 assets in search "
                "results. Use this to explain ranking to the user."
            ),
        }, indent=2)

    try:
        r = httpx.get(
            f"{_om_base()}/api/v1/settings/searchSettings",
            headers=_om_headers(),
            timeout=10,
        )
        if r.status_code != 200:
            return json.dumps({"error": f"HTTP {r.status_code}", "body": r.text[:200]})
        data = r.json()
        # OM nests under config_value; flatten the relevant bits.
        cfg = data.get("config_value") or data
        return json.dumps({
            "term_boosts": cfg.get("globalSettings", {}).get("termBoosts", []),
            "field_weights": cfg.get("globalSettings", {}).get("fieldValueBoosts", {}),
            "raw": cfg,
        }, indent=2)
    except Exception as exc:
        return json.dumps({"error": str(exc)[:200]})


# ---------------------------------------------------------------------------
# 2. Boost-aware semantic search wrapper
# ---------------------------------------------------------------------------


@tool
def om_search_with_preferences(query: str, top_k: int = 5) -> str:
    """Search OM with org-preference awareness AND record token efficiency.

    Hits OM's ``/api/v1/search/query`` (the same endpoint MCP's semantic_search
    uses), returns the top-K results, AND records to MetaFlow's efficiency
    counter how many entities we did NOT have to feed to the LLM.

    Use this whenever the user asks discovery questions ("find...", "show me
    tables for..."). Always EXPLAIN ranking using
    ``om_get_search_preferences`` if results look surprising.
    """
    full_scan_size = 200  # conservative typical OM dataset slice

    if is_demo():
        results = [
            {"name": f"{query}_table_{i}", "service": "snowflake", "score": 9.5 - i * 0.4}
            for i in range(min(top_k, 5))
        ]
        record_semantic_search(
            results_returned=len(results),
            top_k_used=len(results),
            full_scan_size_estimate=full_scan_size,
        )
        return json.dumps({
            "demo": True,
            "query": query,
            "top_k": len(results),
            "results": results,
            "efficiency_note": (
                f"Avoided full scan of ~{full_scan_size} entities. "
                "Token savings recorded to /api/metrics/efficiency."
            ),
        }, indent=2)

    try:
        r = httpx.get(
            f"{_om_base()}/api/v1/search/query",
            headers=_om_headers(),
            params={"q": query, "size": top_k, "from": 0},
            timeout=15,
        )
        if r.status_code != 200:
            return json.dumps({"error": f"HTTP {r.status_code}", "body": r.text[:200]})
        data = r.json()
        hits = data.get("hits", {}).get("hits", [])
        results = []
        for h in hits[:top_k]:
            src = h.get("_source", {})
            results.append({
                "name": src.get("name") or src.get("displayName"),
                "fqn": src.get("fullyQualifiedName"),
                "type": h.get("_index"),
                "service": (src.get("service") or {}).get("name"),
                "score": h.get("_score"),
            })

        total_returned = data.get("hits", {}).get("total", {}).get("value", len(hits))
        record_semantic_search(
            results_returned=total_returned,
            top_k_used=len(results),
            full_scan_size_estimate=full_scan_size,
        )

        return json.dumps({
            "query": query,
            "total_matches": total_returned,
            "top_k": len(results),
            "results": results,
            "efficiency_note": (
                f"Avoided inspecting ~{full_scan_size - len(results)} entities. "
                f"Recorded to /api/metrics/efficiency."
            ),
        }, indent=2)
    except Exception as exc:
        return json.dumps({"error": str(exc)[:200]})


# ---------------------------------------------------------------------------
# 3. Custom-property reader — surfaces metaflow_health_score + others
# ---------------------------------------------------------------------------


@tool
def om_read_custom_properties(entity_fqn: str, entity_type: str = "table") -> str:
    """Read all custom properties (extension fields) on an OM entity.

    This surfaces:
    - MetaFlow's own ``metaflow_health_score`` written by the Steward
    - Any other custom properties the org has defined and populated

    Use whenever you fetch an entity by FQN — it gives the user context
    that's invisible from the standard MCP tools.

    Args:
        entity_fqn: The fully qualified name of the entity.
        entity_type: One of 'table', 'topic', 'dashboard', 'pipeline'.
    """
    if is_demo():
        return json.dumps({
            "demo": True,
            "entity_fqn": entity_fqn,
            "extension": {
                "metaflow_health_score": json.dumps({
                    "score": 87, "breakdown": {"contract": 1.0, "dq": 0.9, "pii": 0.8},
                    "agent": "metaflow.steward",
                }),
                "data_owner_team": "fraud-ops",
                "compliance_review_due": "2026-Q2",
            },
            "summary": (
                "Health score 87/100 (set by metaflow.steward). "
                "Owned by fraud-ops. Compliance review due Q2 2026."
            ),
        }, indent=2)

    type_to_endpoint = {
        "table": "/api/v1/tables/name",
        "topic": "/api/v1/topics/name",
        "dashboard": "/api/v1/dashboards/name",
        "pipeline": "/api/v1/pipelines/name",
    }
    endpoint = type_to_endpoint.get(entity_type, "/api/v1/tables/name")
    try:
        r = httpx.get(
            f"{_om_base()}{endpoint}/{entity_fqn}",
            headers=_om_headers(),
            params={"fields": "extension"},
            timeout=10,
        )
        if r.status_code != 200:
            return json.dumps({"error": f"HTTP {r.status_code}"})
        ext = r.json().get("extension") or {}
        if not ext:
            return json.dumps({"entity_fqn": entity_fqn, "extension": {}, "note": "no custom properties set"})
        return json.dumps({
            "entity_fqn": entity_fqn,
            "extension": ext,
            "property_count": len(ext),
            "has_metaflow_score": "metaflow_health_score" in ext,
        }, indent=2)
    except Exception as exc:
        return json.dumps({"error": str(exc)[:200]})
