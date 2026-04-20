"""GitHub integration tools for cross-platform metadata workflows.

Provides LangChain tools that interact with the GitHub REST API,
allowing agents to create issues, gists, and search repositories
as part of multi-MCP orchestration workflows.
"""

from __future__ import annotations

import httpx
from langchain_core.tools import tool

from app.core.config import settings
from app.core.demo import (
    github_gist_created,
    github_issue_created,
    is_demo,
    generic_ok,
)


def get_github_tools() -> list:
    """Return all GitHub LangChain tools."""
    return [create_github_issue, create_github_gist, search_github_issues]


@tool
def create_github_issue(title: str, body: str, labels: str = "") -> str:
    """Create a GitHub issue to track a metadata problem, action item, or compliance task.

    Use this to create tracking issues for data quality failures, governance
    gaps, schema change impacts, or any metadata operation that needs follow-up.

    Args:
        title: Short descriptive issue title.
        body: Detailed issue body in markdown format. Include findings, links,
              and recommended actions.
        labels: Comma-separated label names (e.g. "data-quality,urgent").
    """
    if is_demo():
        return github_issue_created(title)
    if not settings.github_token:
        return "Error: GitHub token not configured. Set GITHUB_TOKEN in .env"
    if not settings.github_default_repo:
        return (
            "Error: Default GitHub repository not configured. "
            "Set GITHUB_DEFAULT_REPO in .env (format: owner/repo)"
        )

    label_list = [l.strip() for l in labels.split(",") if l.strip()] if labels else []

    try:
        resp = httpx.post(
            f"https://api.github.com/repos/{settings.github_default_repo}/issues",
            headers={
                "Authorization": f"Bearer {settings.github_token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            json={"title": title, "body": body, "labels": label_list},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        return (
            f"✅ GitHub issue created successfully!\n"
            f"- **Title**: {data['title']}\n"
            f"- **Number**: #{data['number']}\n"
            f"- **URL**: {data['html_url']}\n"
            f"- **Labels**: {', '.join(l['name'] for l in data.get('labels', []))}"
        )
    except httpx.HTTPStatusError as e:
        return f"GitHub API error ({e.response.status_code}): {e.response.text[:300]}"
    except Exception as e:
        return f"Error creating GitHub issue: {e}"


@tool
def create_github_gist(description: str, filename: str, content: str) -> str:
    """Create a GitHub gist with a report, summary, or data contract document.

    Use this to publish structured reports (markdown tables, data contracts,
    audit summaries) as shareable gists that can be linked from issues or
    Slack messages.

    Args:
        description: Short gist description.
        filename: File name including extension (e.g. "dq-report.md").
        content: Full file content (markdown recommended).
    """
    if is_demo():
        return github_gist_created(filename)
    if not settings.github_token:
        return "Error: GitHub token not configured. Set GITHUB_TOKEN in .env"

    try:
        resp = httpx.post(
            "https://api.github.com/gists",
            headers={
                "Authorization": f"Bearer {settings.github_token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            json={
                "description": description,
                "public": False,
                "files": {filename: {"content": content}},
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        return (
            f"✅ GitHub gist created successfully!\n"
            f"- **Description**: {data['description']}\n"
            f"- **URL**: {data['html_url']}\n"
            f"- **Files**: {', '.join(data['files'].keys())}"
        )
    except httpx.HTTPStatusError as e:
        return f"GitHub API error ({e.response.status_code}): {e.response.text[:300]}"
    except Exception as e:
        return f"Error creating GitHub gist: {e}"


@tool
def search_github_issues(query: str, state: str = "open") -> str:
    """Search GitHub issues in the configured repository.

    Use this to check for existing issues before creating duplicates,
    or to find related tracking issues for a metadata concern.

    Args:
        query: Search keywords.
        state: Issue state filter — "open", "closed", or "all".
    """
    if is_demo():
        return generic_ok("GitHub search", {"query": query, "state": state, "results": []})
    if not settings.github_token:
        return "Error: GitHub token not configured. Set GITHUB_TOKEN in .env"
    if not settings.github_default_repo:
        return "Error: Default GitHub repository not configured."

    try:
        search_q = f"{query} repo:{settings.github_default_repo} is:issue state:{state}"
        resp = httpx.get(
            "https://api.github.com/search/issues",
            headers={
                "Authorization": f"Bearer {settings.github_token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            params={"q": search_q, "per_page": 10},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()

        if data["total_count"] == 0:
            return f"No issues found matching '{query}'."

        lines = [f"Found {data['total_count']} issue(s):\n"]
        for item in data["items"][:10]:
            labels = ", ".join(l["name"] for l in item.get("labels", []))
            lines.append(
                f"- **#{item['number']}** [{item['title']}]({item['html_url']}) "
                f"({item['state']}){f' — Labels: {labels}' if labels else ''}"
            )
        return "\n".join(lines)
    except httpx.HTTPStatusError as e:
        return f"GitHub API error ({e.response.status_code}): {e.response.text[:300]}"
    except Exception as e:
        return f"Error searching GitHub issues: {e}"
