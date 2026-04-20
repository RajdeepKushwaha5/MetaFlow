"""Jira integration tools for cross-platform metadata workflows.

Provides LangChain tools that interact with the Jira REST API,
allowing agents to create issues, add comments, and search for
existing tickets as part of multi-MCP orchestration workflows.
"""

from __future__ import annotations

import base64
import json
import logging

import httpx
from langchain_core.tools import tool

from app.core.config import settings
from app.core.demo import (
    is_demo,
    jira_comment_added,
    jira_issue_created,
    jira_search_result,
)

_logger = logging.getLogger(__name__)


def get_jira_tools() -> list:
    """Return all Jira LangChain tools."""
    return [create_jira_issue, add_jira_comment, search_jira_issues]


def _jira_headers() -> dict:
    """Build Jira REST API auth headers."""
    creds = base64.b64encode(
        f"{settings.jira_user}:{settings.jira_api_token}".encode()
    ).decode()
    return {
        "Authorization": f"Basic {creds}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


@tool
def create_jira_issue(
    summary: str,
    description: str,
    project_key: str = "",
    issue_type: str = "Task",
    priority: str = "Medium",
    labels: str = "",
) -> str:
    """Create a Jira issue to track a metadata problem or action item.

    Use this for enterprise teams that track work in Jira. Create tickets for
    data quality failures, governance gaps, schema change impacts, or any
    metadata operation that needs formal tracking.

    Args:
        summary: Short issue title (e.g. "DQ Failure: null rate spike on orders.amount").
        description: Detailed description in Jira wiki markup or plain text.
                     Include findings, affected entities, severity, and recommended actions.
        project_key: Jira project key (e.g. "DATA", "DQ"). Defaults to JIRA_PROJECT_KEY env var.
        issue_type: Jira issue type: "Task", "Bug", "Story", "Epic" (default: "Task").
        priority: Priority level: "Highest", "High", "Medium", "Low", "Lowest" (default: "Medium").
        labels: Comma-separated labels (e.g. "data-quality,automated,critical").
    """
    if not settings.jira_url or not settings.jira_api_token:
        return "Error: Jira not configured. Set JIRA_URL, JIRA_USER, JIRA_API_TOKEN in .env"

    project = project_key or settings.jira_project_key
    if not project:
        return "Error: No Jira project key specified. Pass project_key or set JIRA_PROJECT_KEY in .env"

    label_list = [l.strip() for l in labels.split(",") if l.strip()] if labels else []

    payload = {
        "fields": {
            "project": {"key": project},
            "summary": summary,
            "description": description,
            "issuetype": {"name": issue_type},
            "priority": {"name": priority},
        }
    }
    if label_list:
        payload["fields"]["labels"] = label_list

    try:
        resp = httpx.post(
            f"{settings.jira_url.rstrip('/')}/rest/api/2/issue",
            headers=_jira_headers(),
            json=payload,
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        issue_key = data["key"]
        issue_url = f"{settings.jira_url.rstrip('/')}/browse/{issue_key}"
        return (
            f"✅ Jira issue created successfully!\n"
            f"- **Key**: {issue_key}\n"
            f"- **Summary**: {summary}\n"
            f"- **Type**: {issue_type}\n"
            f"- **Priority**: {priority}\n"
            f"- **URL**: {issue_url}"
        )
    except httpx.HTTPStatusError as e:
        return f"Jira API error ({e.response.status_code}): {e.response.text[:300]}"
    except Exception as e:
        return f"Error creating Jira issue: {e}"


@tool
def add_jira_comment(issue_key: str, comment: str) -> str:
    """Add a comment to an existing Jira issue.

    Use this to update an existing ticket with new findings, status changes,
    or additional context from metadata operations.

    Args:
        issue_key: The Jira issue key (e.g. "DATA-123").
        comment: Comment text in Jira wiki markup or plain text.
    """
    if is_demo():
        return jira_comment_added(issue_key)
    if not settings.jira_url or not settings.jira_api_token:
        return "Error: Jira not configured. Set JIRA_URL, JIRA_USER, JIRA_API_TOKEN in .env"

    try:
        resp = httpx.post(
            f"{settings.jira_url.rstrip('/')}/rest/api/2/issue/{issue_key}/comment",
            headers=_jira_headers(),
            json={"body": comment},
            timeout=30,
        )
        resp.raise_for_status()
        return (
            f"✅ Comment added to {issue_key}!\n"
            f"- **URL**: {settings.jira_url.rstrip('/')}/browse/{issue_key}"
        )
    except httpx.HTTPStatusError as e:
        return f"Jira API error ({e.response.status_code}): {e.response.text[:300]}"
    except Exception as e:
        return f"Error adding Jira comment: {e}"


@tool
def search_jira_issues(query: str, max_results: int = 10) -> str:
    """Search for existing Jira issues using JQL or keywords.

    Use this to find related tickets before creating duplicates, or to
    check the status of previously created issues.

    Args:
        query: JQL query string or simple keywords. Examples:
               - "project = DATA AND status = Open"
               - "labels = data-quality AND priority = High"
               - "summary ~ 'null rate' ORDER BY created DESC"
        max_results: Maximum issues to return (default: 10).
    """
    if is_demo():
        return jira_search_result(query)
    if not settings.jira_url or not settings.jira_api_token:
        return "Error: Jira not configured. Set JIRA_URL, JIRA_USER, JIRA_API_TOKEN in .env"

    # If it doesn't look like JQL, wrap in text search
    if not any(kw in query.upper() for kw in ["=", "~", "AND", "OR", "ORDER"]):
        query = f'summary ~ "{query}" OR description ~ "{query}" ORDER BY created DESC'

    try:
        resp = httpx.get(
            f"{settings.jira_url.rstrip('/')}/rest/api/2/search",
            headers=_jira_headers(),
            params={"jql": query, "maxResults": max_results, "fields": "summary,status,priority,assignee,labels"},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        issues = data.get("issues", [])

        if not issues:
            return f"No Jira issues found for query: {query}"

        lines = [f"Found {len(issues)} Jira issues:\n"]
        for issue in issues:
            key = issue["key"]
            fields = issue["fields"]
            status = fields.get("status", {}).get("name", "Unknown")
            priority = fields.get("priority", {}).get("name", "None")
            summary = fields.get("summary", "No summary")
            assignee = fields.get("assignee", {})
            assignee_name = assignee.get("displayName", "Unassigned") if assignee else "Unassigned"
            url = f"{settings.jira_url.rstrip('/')}/browse/{key}"
            lines.append(
                f"- **{key}** [{status}] (P: {priority}) — {summary}\n"
                f"  Assignee: {assignee_name} | [View]({url})"
            )
        return "\n".join(lines)
    except httpx.HTTPStatusError as e:
        return f"Jira API error ({e.response.status_code}): {e.response.text[:300]}"
    except Exception as e:
        return f"Error searching Jira: {e}"
