"""Demo Mode — deterministic fixtures for offline / stage demos.

When ``settings.demo_mode`` is true, every external integration short-circuits
to a pre-baked response so the demo NEVER hits a network failure mid-pitch.

Each helper returns a structured dict that the calling tool can json-dump.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from app.core.config import settings


def is_demo() -> bool:
    """True if MetaFlow is running in demo mode."""
    return bool(settings.demo_mode)


def _stamp(prefix: str, seed: str) -> str:
    """Stable fake id: ``<prefix>-<8 hex chars>``."""
    h = hashlib.sha1(seed.encode("utf-8"), usedforsecurity=False).hexdigest()[:8]
    return f"{prefix}-{h}"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Per-platform fixture builders (return a JSON string for the tool to emit)
# ---------------------------------------------------------------------------

def slack_notification_ok(message: str) -> str:
    return json.dumps({
        "demo": True,
        "channel": "#data-platform",
        "ts": _now_iso(),
        "preview": message[:200],
        "status": "✅ (demo) Slack notification queued",
    }, indent=2)


def slack_alert_ok(title: str, severity: str) -> str:
    return json.dumps({
        "demo": True,
        "channel": "#data-platform",
        "ts": _now_iso(),
        "title": title,
        "severity": severity,
        "status": "✅ (demo) Slack alert queued",
    }, indent=2)


def jira_issue_created(summary: str, project_key: str = "DATA") -> str:
    key = _stamp(project_key, summary)
    return json.dumps({
        "demo": True,
        "key": key.upper(),
        "url": f"https://example.atlassian.net/browse/{key.upper()}",
        "summary": summary,
        "created": _now_iso(),
        "status": "✅ (demo) Jira issue created",
    }, indent=2)


def jira_comment_added(issue_key: str) -> str:
    return json.dumps({
        "demo": True,
        "issue": issue_key,
        "comment_id": _stamp("c", issue_key),
        "status": "✅ (demo) Comment added",
    }, indent=2)


def jira_search_result(query: str) -> str:
    return json.dumps({
        "demo": True,
        "query": query,
        "issues": [
            {"key": "DATA-1042", "summary": "DQ failure on orders.amount", "status": "Open"},
            {"key": "DATA-1031", "summary": "PII tagging gap on customers", "status": "In Review"},
        ],
        "total": 2,
    }, indent=2)


def notion_page_created(title: str) -> str:
    pid = _stamp("page", title)
    return json.dumps({
        "demo": True,
        "page_id": pid,
        "url": f"https://notion.so/{pid}",
        "title": title,
        "status": "✅ (demo) Notion page created",
    }, indent=2)


def google_sheet_created(title: str) -> str:
    sid = _stamp("sheet", title)
    return json.dumps({
        "demo": True,
        "sheet_id": sid,
        "url": f"https://docs.google.com/spreadsheets/d/{sid}",
        "title": title,
        "status": "✅ (demo) Sheet created",
    }, indent=2)


def google_doc_created(title: str) -> str:
    did = _stamp("doc", title)
    return json.dumps({
        "demo": True,
        "doc_id": did,
        "url": f"https://docs.google.com/document/d/{did}",
        "title": title,
        "status": "✅ (demo) Doc created",
    }, indent=2)


def email_sent(to: str, subject: str) -> str:
    return json.dumps({
        "demo": True,
        "to": to,
        "subject": subject,
        "queued_at": _now_iso(),
        "status": "✅ (demo) Email queued",
    }, indent=2)


def github_issue_created(title: str) -> str:
    n = int(hashlib.sha1(title.encode(), usedforsecurity=False).hexdigest()[:4], 16) % 999
    return json.dumps({
        "demo": True,
        "issue_number": n,
        "url": f"https://github.com/example/data-platform/issues/{n}",
        "title": title,
        "status": "✅ (demo) GitHub issue created",
    }, indent=2)


def github_gist_created(filename: str) -> str:
    gid = _stamp("gist", filename)
    return json.dumps({
        "demo": True,
        "gist_id": gid,
        "url": f"https://gist.github.com/example/{gid}",
        "filename": filename,
        "status": "✅ (demo) Gist created",
    }, indent=2)


def generic_ok(label: str, payload: dict[str, Any] | None = None) -> str:
    out: dict[str, Any] = {"demo": True, "status": f"✅ (demo) {label}", "ts": _now_iso()}
    if payload:
        out.update(payload)
    return json.dumps(out, indent=2)
