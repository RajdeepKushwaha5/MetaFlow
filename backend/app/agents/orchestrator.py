"""Multi-MCP agent orchestrator built on ``langgraph-supervisor``.

Creates a supervisor graph that delegates to specialist agents across
three platforms: OpenMetadata MCP, GitHub, and Slack.

This is the core of the Multi-MCP Agent Orchestrator — it combines
tools from the OpenMetadata MCP server with GitHub and Slack APIs
to enable cross-platform metadata workflows.
"""

from __future__ import annotations

from langgraph.checkpoint.memory import MemorySaver
from langgraph_supervisor import create_supervisor

from app.agents.prompts import ORCHESTRATOR_PROMPT
from app.agents.specialists import SPECIALIST_CONFIGS, create_specialist
from app.core.clients import get_ai_sdk_client, get_llm, get_metadata_host
from app.tools.github_tools import get_github_tools
from app.tools.slack_tools import get_slack_tools


def build_orchestrator():
    """Build and compile the full multi-agent orchestrator graph.

    Creates 7 specialist agents:
    - 5 OpenMetadata MCP agents (discovery, lineage, curator, DQ, governance)
    - 1 GitHub agent (issues, gists, search)
    - 1 Slack agent (notifications, alerts)

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

    # Map agent names to their extra (non-MCP) tools
    extra_tools_map = {
        "github_agent": github_tools,
        "slack_agent": slack_tools,
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
