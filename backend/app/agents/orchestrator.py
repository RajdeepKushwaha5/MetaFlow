"""Multi-MCP agent orchestrator built on ``langgraph-supervisor``.

Creates a supervisor graph that delegates to specialist agents across
seven platforms: OpenMetadata MCP, GitHub, Slack, Google Workspace,
Email, Jira, and Notion — plus a platform analytics agent.

This is the core of the Multi-MCP Agent Orchestrator — it combines
tools from the OpenMetadata MCP server with GitHub, Slack, Google,
Email, Jira, Notion APIs, and OM REST API analytics to enable
cross-platform metadata workflows.
"""

from __future__ import annotations

from langgraph.checkpoint.memory import MemorySaver
from langgraph_supervisor import create_supervisor

from app.agents.prompts import ORCHESTRATOR_PROMPT
from app.agents.specialists import SPECIALIST_CONFIGS, create_specialist
from app.core.clients import get_ai_sdk_client, get_llm, get_metadata_host
from app.tools.contract_tools import get_contract_tools
from app.tools.email_tools import get_email_tools
from app.tools.github_tools import get_github_tools
from app.tools.google_tools import get_google_tools
from app.tools.insights_tools import get_insights_tools
from app.tools.jira_tools import get_jira_tools
from app.tools.lineage_tools import get_lineage_tools
from app.tools.notion_tools import get_notion_tools
from app.tools.om_governance_tools import get_om_governance_tools
from app.tools.om_native_tools import get_om_native_tools
from app.tools.slack_tools import get_slack_tools


def build_orchestrator():
    """Build and compile the full multi-agent orchestrator graph.

    Creates 12 specialist agents:
    - 5 OpenMetadata MCP agents (discovery, lineage, curator, DQ, governance)
    - 1 Platform Analytics agent (insights — OM REST API)
    - 1 GitHub agent (issues, gists, search)
    - 1 Slack agent (notifications, alerts)
    - 1 Google agent (Sheets, Docs)
    - 1 Email agent (alerts, reports)
    - 1 Jira agent (issues, comments, search)
    - 1 Notion agent (pages, blocks)

    The supervisor routes user requests to the right specialist(s) and
    chains them for cross-platform workflows.

    Returns a compiled LangGraph ``CompiledStateGraph`` ready for
    ``invoke`` / ``stream``.
    """
    client = get_ai_sdk_client()
    model = get_llm()
    host = get_metadata_host()

    # Prepare cross-platform tools
    github_tools = get_github_tools()
    slack_tools = get_slack_tools()
    google_tools = get_google_tools()
    email_tools = get_email_tools()
    jira_tools = get_jira_tools()
    notion_tools = get_notion_tools()
    insights_tools = get_insights_tools()
    contract_tools = get_contract_tools()

    # Map agent names to their extra (non-MCP) tools
    extra_tools_map = {
        "github_agent": github_tools,
        "slack_agent": slack_tools,
        "google_agent": google_tools,
        "email_agent": email_tools,
        "jira_agent": jira_tools,
        "notion_agent": notion_tools,
        "insights_agent": insights_tools,
        "contract_copilot_agent": contract_tools,
        # Governance agent gets both MCP tools and direct OM REST governance tools
        # PLUS the native search-preferences / custom-property tools
        "governance_agent": get_om_governance_tools() + get_om_native_tools(),
        # Curator agent also gets governance tools (for tag/owner application)
        "curator_agent": get_om_governance_tools() + get_om_native_tools(),
        # Discovery agent gets the native preference-aware search + efficiency tracker
        "discovery_agent": get_om_native_tools(),
        # Lineage agent gets bulk lineage authoring (the Claude-demo parallel)
        "lineage_agent": get_lineage_tools(),
    }

    # Create each specialist agent
    specialists = [
        create_specialist(
            name,
            client,
            model,
            host,
            extra_tools=extra_tools_map.get(name),
        )
        for name in SPECIALIST_CONFIGS
    ]

    # Create the supervisor that routes to specialists
    workflow = create_supervisor(
        specialists,
        model=model,
        prompt=ORCHESTRATOR_PROMPT,
        output_mode="last_message",
    )

    # Compile with in-memory checkpointer for conversation persistence
    checkpointer = MemorySaver()
    return workflow.compile(checkpointer=checkpointer)
