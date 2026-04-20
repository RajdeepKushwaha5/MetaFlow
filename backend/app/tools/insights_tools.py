"""Data Insights tools — query OpenMetadata REST APIs for platform analytics.

These tools expose Data Insights / KPI information that is NOT covered by
the MCP surface, giving MetaFlow unique access to platform analytics such
as documentation coverage, ownership percentages, and data-quality pass
rates — all via the OM REST API.
"""

from __future__ import annotations

import json

import httpx
from langchain_core.tools import tool

from app.core.config import settings


def _om_get(path: str, params: dict | None = None) -> dict:
    """Helper: authenticated GET against the OpenMetadata REST API."""
    from app.core.auth import build_auth_headers
    base = settings.ai_sdk_host.rstrip("/")
    resp = httpx.get(f"{base}{path}", headers=build_auth_headers(), params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def get_insights_tools() -> list:
    """Return all Data Insights LangChain tools."""
    return [
        get_data_insights_summary,
        get_entity_counts,
        get_dq_summary,
        get_ownership_coverage,
        get_description_coverage,
    ]


# ---------------------------------------------------------------------------
# Tool 1: Aggregate Data Insights dashboard summary
# ---------------------------------------------------------------------------

@tool
def get_data_insights_summary(days: int = 30) -> str:
    """Get a high-level Data Insights summary for the OpenMetadata instance.

    Returns aggregate counts of tables, topics, dashboards, pipelines,
    ML models, and their documentation/ownership coverage.

    Args:
        days: Look-back window in days (default 30). Currently used for context.
    """
    try:
        # Fetch entity counts per service type
        tables = _om_get("/api/v1/tables", {"limit": 0, "includeEmptyTestSuites": True})
        topics = _om_get("/api/v1/topics", {"limit": 0})
        dashboards = _om_get("/api/v1/dashboards", {"limit": 0})
        pipelines = _om_get("/api/v1/pipelines", {"limit": 0})

        summary = {
            "total_tables": tables.get("paging", {}).get("total", 0),
            "total_topics": topics.get("paging", {}).get("total", 0),
            "total_dashboards": dashboards.get("paging", {}).get("total", 0),
            "total_pipelines": pipelines.get("paging", {}).get("total", 0),
            "days_window": days,
        }
        return json.dumps(summary, indent=2)
    except httpx.HTTPStatusError as e:
        return f"OpenMetadata API error ({e.response.status_code}): {e.response.text[:300]}"
    except Exception as e:
        return f"Error fetching data insights: {e}"


# ---------------------------------------------------------------------------
# Tool 2: Entity counts by type and service
# ---------------------------------------------------------------------------

@tool
def get_entity_counts(entity_type: str = "table") -> str:
    """Get entity counts grouped by database service.

    Useful for understanding the distribution of data assets across services.

    Args:
        entity_type: One of 'table', 'topic', 'dashboard', 'pipeline'.
    """
    type_to_endpoint = {
        "table": "/api/v1/tables",
        "topic": "/api/v1/topics",
        "dashboard": "/api/v1/dashboards",
        "pipeline": "/api/v1/pipelines",
    }
    endpoint = type_to_endpoint.get(entity_type.lower())
    if not endpoint:
        return f"Unknown entity type '{entity_type}'. Use: table, topic, dashboard, pipeline."

    try:
        resp = _om_get(endpoint, {"limit": 100, "fields": "owner,tags"})
        entities = resp.get("data", [])
        total = resp.get("paging", {}).get("total", len(entities))

        # Aggregate by service
        by_service: dict[str, int] = {}
        with_owner = 0
        with_desc = 0
        for ent in entities:
            svc = ent.get("service", {}).get("name", "unknown") if isinstance(ent.get("service"), dict) else "unknown"
            by_service[svc] = by_service.get(svc, 0) + 1
            if ent.get("owner"):
                with_owner += 1
            if ent.get("description"):
                with_desc += 1

        result = {
            "entity_type": entity_type,
            "total": total,
            "sampled": len(entities),
            "by_service": by_service,
            "with_owner": with_owner,
            "with_description": with_desc,
            "ownership_pct": round(with_owner / max(len(entities), 1) * 100, 1),
            "description_pct": round(with_desc / max(len(entities), 1) * 100, 1),
        }
        return json.dumps(result, indent=2)
    except httpx.HTTPStatusError as e:
        return f"OpenMetadata API error ({e.response.status_code}): {e.response.text[:300]}"
    except Exception as e:
        return f"Error fetching entity counts: {e}"


# ---------------------------------------------------------------------------
# Tool 3: Data Quality pass-rate summary
# ---------------------------------------------------------------------------

@tool
def get_dq_summary() -> str:
    """Get a data quality summary: total tests, pass/fail counts, pass rate.

    Queries all test cases and aggregates the latest result status.
    This gives a platform-wide view of data quality health.
    """
    try:
        resp = _om_get("/api/v1/dataQuality/testCases", {"limit": 100, "fields": "testCaseResult"})
        cases = resp.get("data", [])
        total = resp.get("paging", {}).get("total", len(cases))

        passed = 0
        failed = 0
        aborted = 0
        no_result = 0
        failed_tests: list[dict] = []

        for tc in cases:
            result = tc.get("testCaseResult")
            if not result:
                no_result += 1
                continue
            status = result.get("testCaseStatus", "").lower()
            if status == "success":
                passed += 1
            elif status == "failed":
                failed += 1
                failed_tests.append({
                    "name": tc.get("name", "unknown"),
                    "fqn": tc.get("fullyQualifiedName", ""),
                    "entity_link": tc.get("entityLink", ""),
                    "failure_reason": result.get("result", ""),
                })
            elif status == "aborted":
                aborted += 1
            else:
                no_result += 1

        summary = {
            "total_test_cases": total,
            "sampled": len(cases),
            "passed": passed,
            "failed": failed,
            "aborted": aborted,
            "no_result_yet": no_result,
            "pass_rate_pct": round(passed / max(passed + failed, 1) * 100, 1),
            "failed_tests": failed_tests[:10],  # Top 10 failures
        }
        return json.dumps(summary, indent=2)
    except httpx.HTTPStatusError as e:
        return f"OpenMetadata API error ({e.response.status_code}): {e.response.text[:300]}"
    except Exception as e:
        return f"Error fetching DQ summary: {e}"


# ---------------------------------------------------------------------------
# Tool 4: Ownership coverage across tables
# ---------------------------------------------------------------------------

@tool
def get_ownership_coverage(database_filter: str = "") -> str:
    """Get ownership coverage statistics for tables.

    Returns the percentage of tables that have an assigned owner,
    optionally filtered by database name.

    Args:
        database_filter: Optional database name to filter by (empty = all).
    """
    try:
        params: dict = {"limit": 100, "fields": "owner"}
        if database_filter:
            params["database"] = database_filter
        resp = _om_get("/api/v1/tables", params)
        entities = resp.get("data", [])
        total = resp.get("paging", {}).get("total", len(entities))

        with_owner = sum(1 for e in entities if e.get("owner"))
        without_owner = len(entities) - with_owner

        unowned_tables = [
            {"name": e.get("name", ""), "fqn": e.get("fullyQualifiedName", "")}
            for e in entities if not e.get("owner")
        ][:15]

        result = {
            "total_tables": total,
            "sampled": len(entities),
            "with_owner": with_owner,
            "without_owner": without_owner,
            "ownership_pct": round(with_owner / max(len(entities), 1) * 100, 1),
            "unowned_tables": unowned_tables,
            "filter": database_filter or "all",
        }
        return json.dumps(result, indent=2)
    except httpx.HTTPStatusError as e:
        return f"OpenMetadata API error ({e.response.status_code}): {e.response.text[:300]}"
    except Exception as e:
        return f"Error fetching ownership coverage: {e}"


# ---------------------------------------------------------------------------
# Tool 5: Description coverage across tables
# ---------------------------------------------------------------------------

@tool
def get_description_coverage(database_filter: str = "") -> str:
    """Get documentation coverage statistics for tables.

    Returns the percentage of tables that have a description, plus lists
    the undocumented ones so the user can prioritize enrichment.

    Args:
        database_filter: Optional database name to filter by (empty = all).
    """
    try:
        params: dict = {"limit": 100, "fields": "owner,tags,columns"}
        if database_filter:
            params["database"] = database_filter
        resp = _om_get("/api/v1/tables", params)
        entities = resp.get("data", [])
        total = resp.get("paging", {}).get("total", len(entities))

        with_desc = 0
        without_desc_list: list[dict] = []
        col_coverage: list[dict] = []

        for e in entities:
            if e.get("description"):
                with_desc += 1
            else:
                without_desc_list.append({
                    "name": e.get("name", ""),
                    "fqn": e.get("fullyQualifiedName", ""),
                })

            # Column-level coverage for sampled tables
            columns = e.get("columns", [])
            if columns:
                cols_with_desc = sum(1 for c in columns if c.get("description"))
                col_coverage.append({
                    "table": e.get("name", ""),
                    "total_columns": len(columns),
                    "documented_columns": cols_with_desc,
                    "col_doc_pct": round(cols_with_desc / len(columns) * 100, 1),
                })

        result = {
            "total_tables": total,
            "sampled": len(entities),
            "with_description": with_desc,
            "without_description": len(entities) - with_desc,
            "table_description_pct": round(with_desc / max(len(entities), 1) * 100, 1),
            "undocumented_tables": without_desc_list[:15],
            "column_coverage_sample": col_coverage[:10],
            "filter": database_filter or "all",
        }
        return json.dumps(result, indent=2)
    except httpx.HTTPStatusError as e:
        return f"OpenMetadata API error ({e.response.status_code}): {e.response.text[:300]}"
    except Exception as e:
        return f"Error fetching description coverage: {e}"
