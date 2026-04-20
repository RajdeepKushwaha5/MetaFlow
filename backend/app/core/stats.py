"""In-memory agent usage statistics tracker.

Tracks agent invocations, tool calls, and response times for the
Agent Dashboard. Data is kept in-memory and reset on server restart.
"""

from __future__ import annotations

import time
import threading
from collections import defaultdict
from datetime import datetime, timezone

_lock = threading.Lock()

# agent_name -> list of {duration_ms, timestamp}
_agent_calls: dict[str, list[dict]] = defaultdict(list)

# platform_name -> tool call count
_platform_calls: dict[str, int] = defaultdict(int)

# Recent activity log (most recent first, max 100)
_recent_activity: list[dict] = []

# Map tool modules to platform names
_TOOL_TO_PLATFORM = {
    "github": "GitHub",
    "slack": "Slack",
    "google": "Google Workspace",
    "email": "Email",
    "jira": "Jira",
    "notion": "Notion",
}

# ---------------------------------------------------------------------------
# Token-efficiency tracker — quantifies the "right answer in fewest tokens"
# story the OM org keeps repeating. Every time semantic_search returns a
# narrow shortlist that the agent uses INSTEAD of a full table scan, we
# count the rough tokens we did NOT have to send through the LLM.
# ---------------------------------------------------------------------------

# Average tokens to fully describe one OM entity in a prompt (FQN + columns
# + tags + ~1 sentence description). Conservative.
_TOKENS_PER_ENTITY = 180

_efficiency: dict[str, int] = {
    "semantic_searches": 0,
    "results_returned": 0,
    "results_used_top_k": 0,
    "results_skipped": 0,
    "tokens_avoided": 0,
    "full_scans_avoided": 0,
}


def record_semantic_search(
    results_returned: int,
    top_k_used: int,
    full_scan_size_estimate: int = 200,
) -> dict[str, int]:
    """Record one semantic_search call.

    ``results_returned``: how many hits the search returned.
    ``top_k_used``: how many the agent actually fed downstream (typically 5-10).
    ``full_scan_size_estimate``: how many entities the agent would have had to
    inspect WITHOUT semantic_search (default 200 — typical OM dataset slice).
    """
    avoided_entities = max(0, full_scan_size_estimate - top_k_used)
    tokens_avoided = avoided_entities * _TOKENS_PER_ENTITY
    with _lock:
        _efficiency["semantic_searches"] += 1
        _efficiency["results_returned"] += results_returned
        _efficiency["results_used_top_k"] += top_k_used
        _efficiency["results_skipped"] += max(0, results_returned - top_k_used)
        _efficiency["tokens_avoided"] += tokens_avoided
        _efficiency["full_scans_avoided"] += 1
        return dict(_efficiency)


def get_efficiency() -> dict:
    """Return the running efficiency snapshot."""
    with _lock:
        snap = dict(_efficiency)
        # USD savings estimate at gemini-flash list price ~$0.075 / 1M input tokens.
        snap["estimated_usd_saved"] = round(snap["tokens_avoided"] * 0.075 / 1_000_000, 4)
        return snap


def record_agent_call(agent_name: str, duration_ms: float) -> None:
    """Record an agent invocation."""
    now = datetime.now(timezone.utc).isoformat()
    with _lock:
        _agent_calls[agent_name].append({"duration_ms": duration_ms, "timestamp": now})
        _recent_activity.insert(0, {
            "type": "agent_call",
            "agent": agent_name,
            "duration_ms": round(duration_ms, 1),
            "timestamp": now,
        })
        if len(_recent_activity) > 100:
            _recent_activity.pop()


def record_tool_call(tool_name: str) -> None:
    """Record a tool call, mapping it to its platform."""
    with _lock:
        for prefix, platform in _TOOL_TO_PLATFORM.items():
            if prefix in tool_name.lower():
                _platform_calls[platform] += 1
                return
        _platform_calls["OpenMetadata MCP"] += 1


def record_chat(thread_id: str, user_msg: str) -> None:
    """Record a chat interaction in recent activity."""
    now = datetime.now(timezone.utc).isoformat()
    with _lock:
        _recent_activity.insert(0, {
            "type": "chat",
            "thread_id": thread_id,
            "preview": user_msg[:80],
            "timestamp": now,
        })
        if len(_recent_activity) > 100:
            _recent_activity.pop()


def get_stats(total_conversations: int = 0, total_messages: int = 0) -> dict:
    """Return current dashboard statistics."""
    with _lock:
        agents = []
        for name, calls in _agent_calls.items():
            avg_ms = sum(c["duration_ms"] for c in calls) / len(calls) if calls else 0
            agents.append({"agent": name, "calls": len(calls), "avg_duration_ms": round(avg_ms, 1)})
        agents.sort(key=lambda x: x["calls"], reverse=True)

        platforms = [{"platform": p, "tool_calls": c} for p, c in _platform_calls.items()]
        platforms.sort(key=lambda x: x["tool_calls"], reverse=True)

        return {
            "total_conversations": total_conversations,
            "total_messages": total_messages,
            "agents": agents,
            "platforms": platforms,
            "recent_activity": list(_recent_activity[:20]),
        }
