"""Specialist agent definitions — each wraps a set of MCP tools.

Supports three kinds of specialists:
- Pure OpenMetadata MCP agents (discovery, lineage, curator, DQ, governance)
- Pure cross-platform agents (GitHub, Slack)
- Hybrid agents that combine MCP + external tools
"""

from __future__ import annotations

import logging

from ai_sdk import AISdk
from ai_sdk.mcp.models import MCPTool
from langchain_core.tools import BaseTool
from langchain_core.language_models import BaseChatModel
from langgraph.prebuilt import create_react_agent
from langchain_google_genai import ChatGoogleGenerativeAI

from app.agents.prompts import (
    CONTRACT_COPILOT_PROMPT,
    CURATOR_PROMPT,
    DATA_QUALITY_PROMPT,
    DISCOVERY_PROMPT,
    EMAIL_PROMPT,
    GITHUB_PROMPT,
    GOOGLE_PROMPT,
    GOVERNANCE_PROMPT,
    INSIGHTS_PROMPT,
    JIRA_PROMPT,
    LINEAGE_PROMPT,
    NOTION_PROMPT,
    SLACK_PROMPT,
)

# ---------------------------------------------------------------------------
# Tool assignments per specialist
# ---------------------------------------------------------------------------

SPECIALIST_CONFIGS: dict[str, dict] = {
    "discovery_agent": {
        "mcp_tools": [
            MCPTool.SEMANTIC_SEARCH,
            MCPTool.SEARCH_METADATA,
            MCPTool.GET_ENTITY_DETAILS,
        ],
        "prompt": DISCOVERY_PROMPT,
    },
    "lineage_agent": {
        "mcp_tools": [
            MCPTool.GET_ENTITY_LINEAGE,
            MCPTool.GET_ENTITY_DETAILS,
        ],
        "prompt": LINEAGE_PROMPT,
    },
    "curator_agent": {
        "mcp_tools": [
            MCPTool.GET_ENTITY_DETAILS,
            MCPTool.PATCH_ENTITY,
            MCPTool.CREATE_GLOSSARY_TERM,
        ],
        "prompt": CURATOR_PROMPT,
    },
    "data_quality_agent": {
        "mcp_tools": [
            MCPTool.GET_TEST_DEFINITIONS,
            MCPTool.CREATE_TEST_CASE,
            MCPTool.ROOT_CAUSE_ANALYSIS,
            MCPTool.GET_ENTITY_DETAILS,
        ],
        "prompt": DATA_QUALITY_PROMPT,
    },
    "governance_agent": {
        "mcp_tools": [
            MCPTool.SEARCH_METADATA,
            MCPTool.SEMANTIC_SEARCH,
            MCPTool.GET_ENTITY_DETAILS,
            MCPTool.PATCH_ENTITY,
            MCPTool.CREATE_GLOSSARY,
            MCPTool.CREATE_GLOSSARY_TERM,
        ],
        "prompt": GOVERNANCE_PROMPT,
    },
    # Cross-platform specialists — no MCP tools, use extra_tools instead
    "github_agent": {
        "mcp_tools": [],
        "prompt": GITHUB_PROMPT,
    },
    "slack_agent": {
        "mcp_tools": [],
        "prompt": SLACK_PROMPT,
    },
    "google_agent": {
        "mcp_tools": [],
        "prompt": GOOGLE_PROMPT,
    },
    "email_agent": {
        "mcp_tools": [],
        "prompt": EMAIL_PROMPT,
    },
    "jira_agent": {
        "mcp_tools": [],
        "prompt": JIRA_PROMPT,
    },
    "notion_agent": {
        "mcp_tools": [],
        "prompt": NOTION_PROMPT,
    },
    # Platform analytics specialist — uses OM REST API, not MCP
    "insights_agent": {
        "mcp_tools": [],
        "prompt": INSIGHTS_PROMPT,
    },
    # Data Contract Copilot — generates / publishes / heals OM Data Contracts.
    # Uses OM REST API directly; needs MCP entity-details for context.
    "contract_copilot_agent": {
        "mcp_tools": [
            MCPTool.GET_ENTITY_DETAILS,
            MCPTool.GET_ENTITY_LINEAGE,
        ],
        "prompt": CONTRACT_COPILOT_PROMPT,
    },
}


def create_specialist(
    name: str,
    client: AISdk,
    model: BaseChatModel,
    metadata_host: str,
    extra_tools: list[BaseTool] | None = None,
):
    """Create a single specialist react agent.

    For OM MCP specialists, tools come from the AI SDK client.
    For cross-platform specialists, tools come from ``extra_tools``.
    Both can be combined for hybrid agents.

    Returns a LangGraph ``CompiledGraph`` that can be used as a node.
    """
    cfg = SPECIALIST_CONFIGS[name]

    # Gather tools from both MCP and extra sources
    tools: list[BaseTool] = []
    if cfg["mcp_tools"]:
        try:
            tools.extend(client.mcp.as_langchain_tools(include=cfg["mcp_tools"]))
        except Exception as exc:
            logging.warning("Could not load MCP tools for %s: %s", name, exc)
    if extra_tools:
        tools.extend(extra_tools)

    prompt = cfg["prompt"].format(metadata_host=metadata_host)

    return create_react_agent(
        model=model,
        tools=tools,
        name=name,
        prompt=prompt,
    )
