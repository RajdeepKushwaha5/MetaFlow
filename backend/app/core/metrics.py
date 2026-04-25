"""Real-data metrics scanner.

Walks the OpenMetadata REST API and computes hard numbers used by the
Operations page: tables scanned, PII gaps, contract coverage, DQ pass rate,
ownership / description coverage.
"""

from __future__ import annotations

import re
import time
from typing import Any

import httpx

from app.core.config import settings
from app.core.demo import is_demo

PII_NAME_PATTERNS = re.compile(
    r"(email|e_mail|phone|mobile|ssn|address|street|zip|postal|"
    r"birth|dob|passport|nationalid|national_id|credit_card|"
    r"card_number|account_number|iban|swift|first_name|last_name|"
    r"full_name|surname|given_name|maiden|tax_id|tin)",
    re.IGNORECASE,
)

PII_TAG_HINTS = ("pii", "sensitive", "personal", "gdpr", "phi")


def _om_get(path: str, params: dict | None = None, timeout: float = 20.0) -> dict:
    from app.core.auth import build_auth_headers
    base = settings.ai_sdk_host.rstrip("/")
    resp = httpx.get(f"{base}{path}", headers=build_auth_headers(), params=params, timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def _column_has_pii_tag(col: dict) -> bool:
    for t in col.get("tags") or []:
        label = (t.get("tagFQN") or t.get("name") or "").lower()
        if any(h in label for h in PII_TAG_HINTS):
            return True
    return False


def _latest_test_status(test_case: dict) -> str:
    result = test_case.get("testCaseResult") or {}
    status = result.get("testCaseStatus") or ""
    if status:
        return str(status)

    fqn = test_case.get("fullyQualifiedName")
    if not fqn:
        return ""
    try:
        latest = _om_get(
            f"/api/v1/dataQuality/testCases/testCaseResults/{fqn}",
            {"limit": 1},
            timeout=10,
        )
        rows = latest.get("data") or []
        if rows:
            return str(rows[0].get("testCaseStatus") or "")
    except Exception:
        return ""
    return ""


def _column_looks_pii(col: dict) -> bool:
    name = (col.get("name") or "").lower()
    if "consent" in name or name.endswith("_status") or name.endswith("_state"):
        return False
    return bool(PII_NAME_PATTERNS.search(name))


def _demo_metrics() -> dict[str, Any]:
    return {
        "demo": True,
        "scanned_at": int(time.time()),
        "totals": {
            "tables": 847,
            "topics": 32,
            "dashboards": 64,
            "pipelines": 91,
        },
        "pii": {
            "columns_with_pii_tag": 142,
            "columns_likely_pii_missing_tag": 23,
            "auto_taggable": 19,
            "needs_human_review": 4,
        },
        "contracts": {
            "tables_with_contracts": 41,
            "contract_coverage_pct": 4.84,
            "active": 38,
            "draft": 3,
            "violated": 0,
        },
        "data_quality": {
            "test_cases": 312,
            "passing": 287,
            "failing": 18,
            "pass_rate_pct": 91.99,
        },
        "ownership": {
            "tables_with_owner": 689,
            "ownership_coverage_pct": 81.35,
        },
        "description": {
            "tables_with_description": 612,
            "description_coverage_pct": 72.26,
        },
    }


def scan_metrics(sample_tables: int = 200) -> dict[str, Any]:
    """Walk OM and return a hard-numbers snapshot.

    ``sample_tables`` caps how many tables we deep-inspect for column-level
    PII analysis, to keep the scan responsive on large catalogs.
    """
    if is_demo():
        return _demo_metrics()

    if not settings.ai_sdk_token:
        return {
            "demo": False,
            "ok": False,
            "scanned_at": int(time.time()),
            "error": "AI_SDK_TOKEN is not configured; cannot scan OpenMetadata.",
        }

    try:
        # ---- totals via paging.total ----
        tables = _om_get("/api/v1/tables", {"limit": 0})
        topics = _om_get("/api/v1/topics", {"limit": 0})
        dashboards = _om_get("/api/v1/dashboards", {"limit": 0})
        pipelines = _om_get("/api/v1/pipelines", {"limit": 0})
        contracts_resp = _om_get("/api/v1/dataContracts", {"limit": 0})
        tests_resp = _om_get("/api/v1/dataQuality/testCases", {"limit": 0})

        total_tables = tables.get("paging", {}).get("total", 0)
        total_contracts = contracts_resp.get("paging", {}).get("total", 0)
        total_tests = tests_resp.get("paging", {}).get("total", 0)

        # ---- sample tables for column inspection + ownership ----
        sample = _om_get(
            "/api/v1/tables",
            {"limit": min(sample_tables, 1000), "fields": "owners,columns,tags"},
        )
        rows = sample.get("data", [])

        owned = sum(1 for r in rows if r.get("owner") or r.get("owners"))
        described = sum(1 for r in rows if (r.get("description") or "").strip())

        cols_pii_tagged = 0
        cols_likely_pii_untagged = 0
        for tbl in rows:
            for col in tbl.get("columns") or []:
                tagged = _column_has_pii_tag(col)
                if tagged:
                    cols_pii_tagged += 1
                elif _column_looks_pii(col):
                    cols_likely_pii_untagged += 1

        # ---- DQ pass rate from a small page ----
        tests_page = _om_get(
            "/api/v1/dataQuality/testCases",
            {"limit": 100, "fields": "testCaseResult"},
        )
        passing = failing = 0
        for tc in tests_page.get("data", []):
            res = _latest_test_status(tc)
            if res.lower() == "success":
                passing += 1
            elif res.lower() == "failed":
                failing += 1
        sampled_tests = passing + failing
        pass_rate = round(100 * passing / sampled_tests, 2) if sampled_tests else None

        sample_n = max(1, len(rows))
        return {
            "demo": False,
            "ok": True,
            "scanned_at": int(time.time()),
            "totals": {
                "tables": total_tables,
                "topics": topics.get("paging", {}).get("total", 0),
                "dashboards": dashboards.get("paging", {}).get("total", 0),
                "pipelines": pipelines.get("paging", {}).get("total", 0),
            },
            "pii": {
                "columns_with_pii_tag": cols_pii_tagged,
                "columns_likely_pii_missing_tag": cols_likely_pii_untagged,
                "sample_size_tables": sample_n,
            },
            "contracts": {
                "tables_with_contracts": total_contracts,
                "contract_coverage_pct": round(100 * total_contracts / max(total_tables, 1), 2),
            },
            "data_quality": {
                "test_cases": total_tests,
                "sampled": sampled_tests,
                "passing": passing,
                "failing": failing,
                "pass_rate_pct": pass_rate,
            },
            "ownership": {
                "tables_with_owner": owned,
                "ownership_coverage_pct": round(100 * owned / sample_n, 2),
                "sample_size": sample_n,
            },
            "description": {
                "tables_with_description": described,
                "description_coverage_pct": round(100 * described / sample_n, 2),
                "sample_size": sample_n,
            },
        }
    except Exception as exc:
        return {
            "demo": False,
            "ok": False,
            "scanned_at": int(time.time()),
            "error": f"OM scan failed: {exc}",
        }
