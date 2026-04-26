"""Auto-Remediation engine — deep lineage-aware root-cause + ticket drafting.

When a DQ test fails, this module:
  1. Fetches the failing test case + its target column.
  2. Walks the table's column-level lineage UPSTREAM.
  3. For every upstream column, pulls profiler history and computes drift
     (null %, distinct count, min/max, row count) between the latest
     snapshot and the 30-day baseline.
  4. Ranks upstream columns by drift magnitude — the top one is the
     suspected root cause.
  5. Resolves the OWNER of that upstream table via OM's ownership API.
  6. Drafts a GitHub issue + Jira ticket payload assigned to that owner.

Everything degrades to deterministic demo data when OM is unreachable,
so the UI is always demoable.
"""

from __future__ import annotations

import hashlib
import time
from typing import Any

import httpx

from app.core.config import settings

# ---------------------------------------------------------------------------
# Shared OM helper (intentionally duplicated to keep this module standalone)
# ---------------------------------------------------------------------------


def _om_request(method: str, path: str, *, params: dict | None = None, json_body: dict | None = None) -> dict | None:
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


def _seed(key: str) -> int:
    return int(hashlib.md5(key.encode()).hexdigest()[:8], 16)


# ---------------------------------------------------------------------------
# Drift scoring
# ---------------------------------------------------------------------------


def _drift_score(current: dict, baseline: dict) -> tuple[float, list[dict]]:
    """Score drift between a current profile snapshot and a baseline.

    Returns (score 0..1, list of contributing signals).
    """
    signals: list[dict] = []
    total = 0.0
    weights = 0.0

    def _norm(cur: float | None, base: float | None) -> float | None:
        if cur is None or base is None:
            return None
        if base == 0:
            return 1.0 if cur != 0 else 0.0
        return abs(cur - base) / max(abs(base), 1e-9)

    # Null %
    cur_null = current.get("nullProportion")
    base_null = baseline.get("nullProportion")
    if cur_null is not None and base_null is not None:
        delta = abs(cur_null - base_null)
        signals.append({
            "metric": "null_proportion",
            "baseline": round(base_null, 4),
            "current": round(cur_null, 4),
            "delta": round(delta, 4),
            "severity": "critical" if delta > 0.1 else "high" if delta > 0.03 else "low",
        })
        total += delta * 3.0
        weights += 3.0

    # Distinct count (ratio)
    cur_dist = current.get("distinctCount")
    base_dist = baseline.get("distinctCount")
    norm_dist = _norm(cur_dist, base_dist)
    if norm_dist is not None:
        signals.append({
            "metric": "distinct_count",
            "baseline": base_dist,
            "current": cur_dist,
            "delta_pct": round(norm_dist * 100, 2),
            "severity": "high" if norm_dist > 0.3 else "medium" if norm_dist > 0.1 else "low",
        })
        total += min(norm_dist, 1.0) * 1.5
        weights += 1.5

    # Min/Max shift
    for key in ("min", "max"):
        cur_v = current.get(key)
        base_v = baseline.get(key)
        norm_v = _norm(cur_v, base_v) if isinstance(cur_v, (int, float)) and isinstance(base_v, (int, float)) else None
        if norm_v is not None and norm_v > 0.1:
            signals.append({
                "metric": key,
                "baseline": base_v,
                "current": cur_v,
                "delta_pct": round(norm_v * 100, 2),
                "severity": "high" if norm_v > 0.5 else "medium",
            })
            total += min(norm_v, 1.0) * 1.0
            weights += 1.0

    if weights == 0:
        return 0.0, signals
    return min(total / weights, 1.0), signals


# ---------------------------------------------------------------------------
# Demo data
# ---------------------------------------------------------------------------


def _demo_remediation(test_fqn: str) -> dict:
    s = _seed(test_fqn)
    parts = test_fqn.split(".")
    target_table = ".".join(parts[:-1]) if len(parts) > 1 else "warehouse.orders.daily_revenue"
    target_col = "amount"

    # Candidate upstream columns ranked by drift
    upstream_candidates = [
        {
            "table_fqn": "raw.payments_stream",
            "column": "amount",
            "drift_score": 0.87,
            "owner": {"name": "alice", "email": "alice@example.com", "type": "user"},
            "signals": [
                {"metric": "null_proportion", "baseline": 0.002, "current": 0.24, "delta": 0.238, "severity": "critical"},
                {"metric": "distinct_count", "baseline": 98421, "current": 74103, "delta_pct": 24.71, "severity": "high"},
                {"metric": "max", "baseline": 99999.0, "current": 1200000.0, "delta_pct": 1100.01, "severity": "high"},
            ],
            "profile_url": "/table/raw.payments_stream/profiler",
        },
        {
            "table_fqn": "raw.users_cdc",
            "column": "user_id",
            "drift_score": 0.21,
            "owner": {"name": "bob", "email": "bob@example.com", "type": "user"},
            "signals": [
                {"metric": "null_proportion", "baseline": 0.0, "current": 0.004, "delta": 0.004, "severity": "low"},
            ],
            "profile_url": "/table/raw.users_cdc/profiler",
        },
        {
            "table_fqn": "raw.products",
            "column": "price",
            "drift_score": 0.08,
            "owner": {"name": "carol", "email": "carol@example.com", "type": "user"},
            "signals": [
                {"metric": "distinct_count", "baseline": 412, "current": 418, "delta_pct": 1.46, "severity": "low"},
            ],
            "profile_url": "/table/raw.products/profiler",
        },
    ]

    root_cause = upstream_candidates[0]

    github_issue = {
        "title": f"[DQ] `{target_table}.{target_col}` failing — root cause in `{root_cause['table_fqn']}.{root_cause['column']}`",
        "assignees": [root_cause["owner"]["name"]],
        "labels": ["data-quality", "auto-triaged", "priority:high"],
        "body": _render_issue_body(test_fqn, target_table, target_col, root_cause),
    }
    jira_ticket = {
        "project": "DATA",
        "issue_type": "Bug",
        "priority": "High",
        "summary": github_issue["title"],
        "assignee": root_cause["owner"]["email"],
        "description": github_issue["body"],
        "labels": github_issue["labels"],
    }

    return {
        "test_fqn": test_fqn,
        "target_table": target_table,
        "target_column": target_col,
        "demo": True,
        "confidence": 0.89,
        "root_cause": root_cause,
        "candidates": upstream_candidates,
        "owner": root_cause["owner"],
        "narrative": (
            f"Root cause identified with 89% confidence: **{root_cause['table_fqn']}.{root_cause['column']}**. "
            f"Null rate on that column jumped from 0.2% → 24% in the last 24h, and max value spiked 11× "
            f"(likely a unit/scale bug in the upstream writer). Owner `@{root_cause['owner']['name']}` has been "
            f"identified and a GitHub issue + Jira ticket have been drafted for review."
        ),
        "suggested_tickets": {
            "github": github_issue,
            "jira": jira_ticket,
        },
        "timeline": [
            {"at": "T-26h", "event": "Upstream schema migration on payments_raw (tracked via OM)"},
            {"at": "T-24h", "event": f"Null rate on {root_cause['table_fqn']}.{root_cause['column']} began climbing"},
            {"at": "T-2h", "event": f"Test `{test_fqn.split('.')[-1]}` threshold breached"},
            {"at": "now", "event": "Auto-remediation engine identified root cause and drafted tickets"},
        ],
    }


def _render_issue_body(test_fqn: str, target_table: str, target_col: str, root_cause: dict) -> str:
    signals_md = "\n".join(
        f"- **{s['metric']}**: baseline `{s.get('baseline')}` → current `{s.get('current')}` "
        f"(Δ {s.get('delta_pct', s.get('delta'))}, severity: {s['severity']})"
        for s in root_cause["signals"]
    )
    return f"""## Summary

Data quality test `{test_fqn}` on `{target_table}.{target_col}` is failing.
Column-level lineage + profiler drift analysis identified the likely root cause upstream.

## Root Cause

**Table**: `{root_cause['table_fqn']}`
**Column**: `{root_cause['column']}`
**Drift score**: {root_cause['drift_score']:.2f} / 1.00
**Owner**: @{root_cause['owner']['name']}

## Drift Signals

{signals_md}

## Suggested Next Steps

1. Inspect the upstream writer that populates `{root_cause['table_fqn']}.{root_cause['column']}`.
2. Check recent schema changes or deployments touching this column.
3. If confirmed as a bug, revert or hotfix; otherwise update the DQ threshold.

_This issue was auto-drafted by MetaFlow's Data Reliability Copilot using OpenMetadata lineage, profiler, and ownership APIs._
"""


# ---------------------------------------------------------------------------
# Real OpenMetadata path
# ---------------------------------------------------------------------------


def _resolve_owner(entity: dict) -> dict:
    """Extract owner info from an OM entity payload (user or team)."""
    owners = entity.get("owners") or ([entity["owner"]] if entity.get("owner") else [])
    if not owners:
        return {"name": "unassigned", "email": "", "type": "none"}
    o = owners[0]
    return {
        "name": o.get("name") or o.get("displayName") or "unknown",
        "email": o.get("email", ""),
        "type": o.get("type", "user"),
        "fqn": o.get("fullyQualifiedName", ""),
    }


def _get_upstream_columns(table_id: str, target_column: str, max_depth: int = 2) -> list[tuple[str, str, str]]:
    """Return list of (upstream_table_fqn, upstream_table_id, upstream_column) tuples.

    Uses column-level lineage if available; falls back to table-level lineage
    with column-name matching.
    """
    results: list[tuple[str, str, str]] = []
    frontier = [(table_id, 0)]
    visited = {table_id}

    while frontier:
        next_frontier: list[tuple[str, int]] = []
        for tid, depth in frontier:
            if depth >= max_depth:
                continue
            lineage = _om_request("GET", f"/api/v1/lineage/table/{tid}", params={"upstreamDepth": 1})
            if not lineage:
                continue
            lineage_nodes = {n.get("id"): n for n in lineage.get("nodes", []) if n.get("id")}
            for edge in lineage.get("upstreamEdges", []):
                from_id = edge.get("fromEntity")
                to_entity = edge.get("toEntity")
                # Only process edges that actually point TO the current entity
                if not from_id or from_id in visited or to_entity != tid:
                    continue
                visited.add(from_id)
                from_data = edge.get("fromEntityData") or lineage_nodes.get(from_id, {})
                from_fqn = from_data.get("fullyQualifiedName", from_id)

                # Try column mapping from lineage edge
                col_mappings = (edge.get("lineageDetails") or {}).get("columnsLineage") or []
                matched_col = None
                for m in col_mappings:
                    if any(target_column in str(c) for c in m.get("toColumns", [])):
                        from_cols = m.get("fromColumns", [])
                        if from_cols:
                            matched_col = str(from_cols[0]).split(".")[-1]
                            break
                if not matched_col:
                    matched_col = target_column  # assume name match

                results.append((from_fqn, from_id, matched_col))
                next_frontier.append((from_id, depth + 1))
        frontier = next_frontier
    return results


def _profile_baseline(column_profile: dict) -> dict:
    """Extract baseline metrics from a column's historical profile."""
    return {
        "nullProportion": column_profile.get("nullProportion"),
        "distinctCount": column_profile.get("distinctCount"),
        "min": column_profile.get("min"),
        "max": column_profile.get("max"),
    }


def auto_remediate(test_fqn: str) -> dict:
    """Lineage-aware auto-remediation: drift detection + owner + ticket draft."""
    if not _is_om_alive():
        return _demo_remediation(test_fqn)

    # 1. Fetch failing test
    test = _om_request(
        "GET",
        f"/api/v1/dataQuality/testCases/name/{test_fqn}",
        params={"fields": "entityLink,testDefinition,testSuite"},
    )
    if not test:
        return {
            "test_fqn": test_fqn,
            "target_table": "",
            "target_column": "",
            "demo": False,
            "confidence": 0,
            "root_cause": None,
            "candidates": [],
            "owner": {"name": "unassigned", "email": "", "type": "none"},
            "narrative": f"OpenMetadata test case `{test_fqn}` was not found.",
            "suggested_tickets": {},
            "timeline": [{"at": "now", "event": "OpenMetadata test lookup returned no result"}],
        }

    # Parse entity link: <#E::table::<fqn>::columns::<col>>
    entity_link = test.get("entityLink", "")
    target_table_fqn = ""
    target_column = ""
    if "::columns::" in entity_link:
        parts = entity_link.strip("<>").split("::")
        if len(parts) >= 5:
            target_table_fqn = parts[2]
            target_column = parts[4]
    elif "::table::" in entity_link:
        parts = entity_link.strip("<>").split("::")
        if len(parts) >= 3:
            target_table_fqn = parts[2]

    if not target_table_fqn:
        return {
            "test_fqn": test_fqn,
            "target_table": "",
            "target_column": "",
            "demo": False,
            "confidence": 0.2,
            "root_cause": None,
            "candidates": [],
            "owner": {"name": "unassigned", "email": "", "type": "none"},
            "narrative": f"OpenMetadata test `{test_fqn}` exists but does not include a parseable table entity link.",
            "suggested_tickets": {},
            "timeline": [{"at": "now", "event": "Test case found, but target table could not be parsed"}],
        }

    # 2. Fetch target table
    target = _om_request(
        "GET",
        f"/api/v1/tables/name/{target_table_fqn}",
        params={"fields": "columns,owners,profile"},
    )
    if not target:
        return {
            "test_fqn": test_fqn,
            "target_table": target_table_fqn,
            "target_column": target_column,
            "demo": False,
            "confidence": 0.2,
            "root_cause": None,
            "candidates": [],
            "owner": {"name": "unassigned", "email": "", "type": "none"},
            "narrative": f"OpenMetadata table `{target_table_fqn}` referenced by `{test_fqn}` was not found.",
            "suggested_tickets": {},
            "timeline": [{"at": "now", "event": "Target table lookup returned no result"}],
        }

    # 3. Walk upstream column lineage
    upstream = _get_upstream_columns(target["id"], target_column or "", max_depth=2)
    if not upstream:
        fallback_column = target_column
        if not fallback_column and target.get("columns"):
            fallback_column = target["columns"][0].get("name", "")
        if fallback_column:
            upstream = [(target_table_fqn, target["id"], fallback_column)]

    # 4. Score each upstream candidate
    candidates: list[dict] = []
    for up_fqn, up_id, up_col in upstream:
        up_table = _om_request(
            "GET",
            f"/api/v1/tables/name/{up_fqn}",
            params={"fields": "columns,owners"},
        )
        if not up_table:
            continue

        # Find the column
        col_data: dict = {}
        for c in up_table.get("columns", []):
            if c.get("name") == up_col:
                col_data = c
                break
        if not col_data:
            continue

        # Fetch profile history (latest + N samples back)
        profile_hist = _om_request(
            "GET",
            f"/api/v1/tables/{up_id}/columnProfile/{up_col}",
            params={"limit": 30},
        )
        samples = (profile_hist or {}).get("data", []) if profile_hist else []
        if len(samples) < 2:
            # Use current profile from column metadata as best-effort
            cur = _profile_baseline(col_data.get("profile", {}) or {})
            baseline = cur
        else:
            cur = _profile_baseline(samples[0])
            # Average historical samples as baseline
            nulls = [s.get("nullProportion") for s in samples[1:] if s.get("nullProportion") is not None]
            distincts = [s.get("distinctCount") for s in samples[1:] if s.get("distinctCount") is not None]
            mins = [s.get("min") for s in samples[1:] if isinstance(s.get("min"), (int, float))]
            maxs = [s.get("max") for s in samples[1:] if isinstance(s.get("max"), (int, float))]
            baseline = {
                "nullProportion": sum(nulls) / len(nulls) if nulls else None,
                "distinctCount": sum(distincts) / len(distincts) if distincts else None,
                "min": sum(mins) / len(mins) if mins else None,
                "max": sum(maxs) / len(maxs) if maxs else None,
            }

        score, signals = _drift_score(cur, baseline)
        if not signals:
            signals = [{
                "metric": "lineage_dependency",
                "baseline": "registered in OpenMetadata",
                "current": f"{up_fqn}.{up_col}",
                "delta": 0,
                "severity": "medium" if up_fqn != target_table_fqn else "low",
            }]
            score = 0.35 if up_fqn != target_table_fqn else 0.15
        owner = _resolve_owner(up_table)
        candidates.append({
            "table_fqn": up_fqn,
            "column": up_col,
            "drift_score": round(score, 3),
            "owner": owner,
            "signals": signals,
            "profile_url": f"/table/{up_fqn}/profiler",
        })

    if not candidates:
        return {
            "test_fqn": test_fqn,
            "target_table": target_table_fqn,
            "target_column": target_column,
            "demo": False,
            "confidence": 0.35,
            "root_cause": None,
            "candidates": [],
            "owner": _resolve_owner(target),
            "narrative": (
                f"OpenMetadata test `{test_fqn}` was resolved to `{target_table_fqn}`"
                f"{'.' + target_column if target_column else ''}, but no column profile or upstream lineage candidates were available yet."
            ),
            "suggested_tickets": {
                "github": {
                    "title": f"[DQ] Investigate `{test_fqn}` on `{target_table_fqn}`",
                    "assignees": [],
                    "labels": ["data-quality", "needs-profile", "metaflow"],
                    "body": "OpenMetadata test case exists, but no lineage/profile evidence was available yet. Run profiling or register lineage, then re-run MetaFlow auto-remediation.",
                },
                "jira": {
                    "project": "DATA",
                    "issue_type": "Task",
                    "priority": "Medium",
                    "summary": f"[DQ] Investigate `{test_fqn}` on `{target_table_fqn}`",
                    "assignee": "",
                    "description": "OpenMetadata test case exists, but no lineage/profile evidence was available yet. Run profiling or register lineage, then re-run MetaFlow auto-remediation.",
                    "labels": ["data-quality", "needs-profile", "metaflow"],
                },
            },
            "timeline": [
                {"at": "now", "event": "Resolved test case from OpenMetadata"},
                {"at": "now", "event": "No upstream lineage/profile candidates were available"},
                {"at": "next", "event": "Run profiling or register lineage to improve confidence"},
            ],
        }

    candidates.sort(key=lambda c: c["drift_score"], reverse=True)
    root_cause = candidates[0]

    github_issue = {
        "title": f"[DQ] `{target_table_fqn}.{target_column}` failing — root cause in `{root_cause['table_fqn']}.{root_cause['column']}`",
        "assignees": [root_cause["owner"]["name"]] if root_cause["owner"]["name"] != "unassigned" else [],
        "labels": ["data-quality", "auto-triaged", "priority:high"],
        "body": _render_issue_body(test_fqn, target_table_fqn, target_column, root_cause),
    }
    jira_ticket = {
        "project": "DATA",
        "issue_type": "Bug",
        "priority": "High",
        "summary": github_issue["title"],
        "assignee": root_cause["owner"]["email"],
        "description": github_issue["body"],
        "labels": github_issue["labels"],
    }

    return {
        "test_fqn": test_fqn,
        "target_table": target_table_fqn,
        "target_column": target_column,
        "demo": False,
        "confidence": min(0.95, 0.5 + root_cause["drift_score"] * 0.5),
        "root_cause": root_cause,
        "candidates": candidates,
        "owner": root_cause["owner"],
        "narrative": (
            f"Ranked {len(candidates)} upstream column(s). Top candidate: "
            f"`{root_cause['table_fqn']}.{root_cause['column']}` "
            f"(drift score {root_cause['drift_score']:.2f}). "
            f"Owner: {root_cause['owner']['name']}."
        ),
        "suggested_tickets": {"github": github_issue, "jira": jira_ticket},
        "timeline": [
            {"at": "now", "event": f"Analyzed {len(candidates)} upstream columns via OM lineage + profiler"},
            {"at": "now", "event": f"Top drift signal on {root_cause['table_fqn']}.{root_cause['column']}"},
            {"at": "now", "event": f"Owner resolved via OM ownership API: {root_cause['owner']['name']}"},
        ],
    }


# ---------------------------------------------------------------------------
# Ticket dispatch — hands off to existing GitHub / Jira integrations
# ---------------------------------------------------------------------------


def dispatch_ticket(remediation: dict, target: str = "github") -> dict:
    """Create the drafted ticket on GitHub or Jira.

    In demo mode, returns a simulated success payload. In connected mode,
    calls the target platform's REST API directly.
    """
    suggested = remediation.get("suggested_tickets", {})
    payload = suggested.get(target)
    if not payload:
        return {"created": False, "message": f"No {target} payload in remediation"}

    # GitHub
    if target == "github":
        token = getattr(settings, "github_token", None)
        repo = getattr(settings, "github_default_repo", None)
        if token and repo:
            try:
                issue_payload = {
                    "title": payload["title"],
                    "body": payload["body"],
                    "labels": payload.get("labels", []),
                    "assignees": payload.get("assignees", []),
                }
                resp = httpx.post(
                    f"https://api.github.com/repos/{repo}/issues",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Accept": "application/vnd.github+json",
                        "X-GitHub-Api-Version": "2022-11-28",
                    },
                    json=issue_payload,
                    timeout=15,
                )
                if resp.status_code == 422 and issue_payload.get("assignees"):
                    # OpenMetadata owners are not always GitHub collaborators.
                    # Keep dispatch reliable by creating the issue unassigned.
                    issue_payload.pop("assignees", None)
                    resp = httpx.post(
                        f"https://api.github.com/repos/{repo}/issues",
                        headers={
                            "Authorization": f"Bearer {token}",
                            "Accept": "application/vnd.github+json",
                            "X-GitHub-Api-Version": "2022-11-28",
                        },
                        json=issue_payload,
                        timeout=15,
                    )
                if resp.status_code < 400:
                    data = resp.json()
                    return {
                        "created": True,
                        "target": "github",
                        "result": {"url": data.get("html_url"), "number": data.get("number")},
                        "payload": payload,
                    }
                return {"created": False, "target": "github", "error": f"HTTP {resp.status_code}", "payload": payload}
            except Exception as exc:
                return {"created": False, "target": "github", "error": str(exc), "payload": payload}

    # Jira
    if target == "jira":
        host = getattr(settings, "jira_url", None)
        email = getattr(settings, "jira_user", None)
        token = getattr(settings, "jira_api_token", None)
        if host and email and token:
            try:
                resp = httpx.post(
                    f"{host.rstrip('/')}/rest/api/3/issue",
                    auth=(email, token),
                    json={
                        "fields": {
                            "project": {"key": payload["project"]},
                            "summary": payload["summary"],
                            "issuetype": {"name": payload["issue_type"]},
                            "priority": {"name": payload["priority"]},
                            "labels": payload.get("labels", []),
                            "description": {
                                "type": "doc",
                                "version": 1,
                                "content": [{"type": "paragraph", "content": [{"type": "text", "text": payload["description"]}]}],
                            },
                        }
                    },
                    timeout=15,
                )
                if resp.status_code < 400:
                    data = resp.json()
                    return {
                        "created": True,
                        "target": "jira",
                        "result": {"key": data.get("key"), "id": data.get("id")},
                        "payload": payload,
                    }
                return {"created": False, "target": "jira", "error": f"HTTP {resp.status_code}", "payload": payload}
            except Exception as exc:
                return {"created": False, "target": "jira", "error": str(exc), "payload": payload}

    # Demo fallback
    return {
        "created": True,
        "demo": True,
        "target": target,
        "result": {
            "url": f"https://{target}.example.com/issues/{int(time.time()) % 10000}",
            "id": f"DATA-{_seed(remediation['test_fqn']) % 9999}",
        },
        "payload": payload,
        "message": f"Drafted {target} ticket (demo mode — no real integration configured).",
    }
