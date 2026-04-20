"""Notion integration tools for cross-platform metadata documentation.

Provides LangChain tools that interact with the Notion API,
allowing agents to create pages and append content blocks as part
of multi-MCP orchestration workflows for metadata documentation.
"""

from __future__ import annotations

import json
import logging

import httpx
from langchain_core.tools import tool

from app.core.config import settings
from app.core.demo import is_demo, notion_page_created, generic_ok

_logger = logging.getLogger(__name__)

_NOTION_API = "https://api.notion.com/v1"
_NOTION_VERSION = "2022-06-28"


def get_notion_tools() -> list:
    """Return all Notion LangChain tools."""
    return [create_notion_page, append_notion_blocks]


def _notion_headers() -> dict:
    """Build Notion API auth headers."""
    return {
        "Authorization": f"Bearer {settings.notion_api_key}",
        "Content-Type": "application/json",
        "Notion-Version": _NOTION_VERSION,
    }


@tool
def create_notion_page(
    title: str,
    content: str,
    database_id: str = "",
    icon_emoji: str = "📊",
) -> str:
    """Create a Notion page to document metadata findings or audit reports.

    Use this for teams that maintain a Notion-based metadata knowledge base.
    Create pages for audit reports, data quality summaries, lineage
    documentation, or governance notes.

    Args:
        title: Page title (e.g. "Data Quality Audit — 2025-07-14").
        content: Page body in plain text. Each paragraph will become a text block.
                 Use '---' on its own line for dividers.
        database_id: Notion database ID to create the page in.
                     Defaults to NOTION_DATABASE_ID env var. If empty,
                     creates the page as a standalone workspace page.
        icon_emoji: Emoji icon for the page (default: 📊).
    """
    if is_demo():
        return notion_page_created(title)
    if not settings.notion_api_key:
        return "Error: Notion not configured. Set NOTION_API_KEY in .env"

    db_id = database_id or settings.notion_database_id

    # Build children blocks from content
    children = _text_to_blocks(content)

    payload: dict = {
        "icon": {"type": "emoji", "emoji": icon_emoji},
        "children": children,
    }

    if db_id:
        payload["parent"] = {"database_id": db_id}
        payload["properties"] = {
            "title": {"title": [{"text": {"content": title}}]}
        }
    else:
        # Standalone page under workspace
        payload["parent"] = {"type": "workspace", "workspace": True}
        payload["properties"] = {
            "title": {"title": [{"text": {"content": title}}]}
        }

    try:
        resp = httpx.post(
            f"{_NOTION_API}/pages",
            headers=_notion_headers(),
            json=payload,
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        page_url = data.get("url", "")
        page_id = data.get("id", "")
        return (
            f"✅ Notion page created successfully!\n"
            f"- **Title**: {title}\n"
            f"- **ID**: {page_id}\n"
            f"- **URL**: {page_url}"
        )
    except httpx.HTTPStatusError as e:
        return f"Notion API error ({e.response.status_code}): {e.response.text[:300]}"
    except Exception as e:
        return f"Error creating Notion page: {e}"


@tool
def append_notion_blocks(page_id: str, content: str) -> str:
    """Append content blocks to an existing Notion page.

    Use this to add findings, updates, or additional context to an
    existing Notion documentation page.

    Args:
        page_id: The Notion page ID to append to (UUID format).
        content: Text content to append. Each paragraph becomes a block.
                 Use '---' on its own line for dividers.
    """
    if is_demo():
        return generic_ok("Notion blocks appended", {"page_id": page_id})
    if not settings.notion_api_key:
        return "Error: Notion not configured. Set NOTION_API_KEY in .env"

    children = _text_to_blocks(content)

    try:
        resp = httpx.patch(
            f"{_NOTION_API}/blocks/{page_id}/children",
            headers=_notion_headers(),
            json={"children": children},
            timeout=30,
        )
        resp.raise_for_status()
        return (
            f"✅ Content appended to Notion page {page_id}!\n"
            f"- Blocks added: {len(children)}"
        )
    except httpx.HTTPStatusError as e:
        return f"Notion API error ({e.response.status_code}): {e.response.text[:300]}"
    except Exception as e:
        return f"Error appending to Notion page: {e}"


def _text_to_blocks(text: str) -> list[dict]:
    """Convert plain text to Notion block objects."""
    blocks = []
    for paragraph in text.split("\n"):
        stripped = paragraph.strip()
        if not stripped:
            continue
        if stripped == "---":
            blocks.append({"object": "block", "type": "divider", "divider": {}})
        elif stripped.startswith("# "):
            blocks.append({
                "object": "block",
                "type": "heading_1",
                "heading_1": {
                    "rich_text": [{"type": "text", "text": {"content": stripped[2:]}}]
                },
            })
        elif stripped.startswith("## "):
            blocks.append({
                "object": "block",
                "type": "heading_2",
                "heading_2": {
                    "rich_text": [{"type": "text", "text": {"content": stripped[3:]}}]
                },
            })
        elif stripped.startswith("- ") or stripped.startswith("* "):
            blocks.append({
                "object": "block",
                "type": "bulleted_list_item",
                "bulleted_list_item": {
                    "rich_text": [{"type": "text", "text": {"content": stripped[2:]}}]
                },
            })
        else:
            blocks.append({
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": [{"type": "text", "text": {"content": stripped}}]
                },
            })
    return blocks
