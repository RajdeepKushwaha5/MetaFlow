"""Slack integration tools for cross-platform metadata workflows.

Provides LangChain tools that post messages to Slack via Incoming
Webhooks, allowing agents to send notifications, alerts, and
formatted reports as part of multi-MCP orchestration workflows.
"""

from __future__ import annotations

import json

import httpx
from langchain_core.tools import tool

from app.core.config import settings
from app.core.demo import is_demo, slack_alert_ok, slack_notification_ok


def get_slack_tools() -> list:
    """Return all Slack LangChain tools."""
    return [send_slack_notification, send_slack_alert]


@tool
def send_slack_notification(message: str) -> str:
    """Send a plain text notification to the configured Slack channel.

    Use this for simple status updates, summaries, or informational messages.
    Supports Slack mrkdwn formatting: *bold*, _italic_, `code`, links.

    Args:
        message: The message text to send. Supports Slack mrkdwn formatting.
    """
    if is_demo():
        return slack_notification_ok(message)
    if not settings.slack_webhook_url:
        return "Error: Slack webhook URL not configured. Set SLACK_WEBHOOK_URL in .env"

    try:
        resp = httpx.post(
            settings.slack_webhook_url,
            json={"text": message},
            timeout=15,
        )
        resp.raise_for_status()
        return "✅ Slack notification sent successfully!"
    except httpx.HTTPStatusError as e:
        return f"Slack API error ({e.response.status_code}): {e.response.text[:300]}"
    except Exception as e:
        return f"Error sending Slack notification: {e}"


@tool
def send_slack_alert(
    title: str,
    summary: str,
    severity: str = "info",
    details: str = "",
    link_url: str = "",
    link_text: str = "View Details",
) -> str:
    """Send a richly formatted alert to the configured Slack channel.

    Use this for structured alerts like data quality failures, governance
    audit results, or impact analysis reports. The alert is formatted with
    a colored severity bar, title, summary, and optional details.

    Args:
        title: Alert title (shown as header).
        summary: Brief summary of the alert.
        severity: One of "critical", "warning", "info", or "success".
        details: Additional details text (optional, shown in a subsection).
        link_url: Optional URL to link to (e.g. a gist, OM entity, GitHub issue).
        link_text: Display text for the link button.
    """
    if is_demo():
        return slack_alert_ok(title, severity)
    if not settings.slack_webhook_url:
        return "Error: Slack webhook URL not configured. Set SLACK_WEBHOOK_URL in .env"

    color_map = {
        "critical": "#dc2626",
        "warning": "#f59e0b",
        "info": "#3b82f6",
        "success": "#22c55e",
    }
    color = color_map.get(severity.lower(), "#6b7280")
    emoji_map = {
        "critical": "🚨",
        "warning": "⚠️",
        "info": "ℹ️",
        "success": "✅",
    }
    emoji = emoji_map.get(severity.lower(), "📊")

    blocks = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": f"{emoji} {title}"},
        },
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": summary},
        },
    ]

    if details:
        blocks.append(
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": details},
            }
        )

    if link_url:
        blocks.append(
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {"type": "plain_text", "text": link_text},
                        "url": link_url,
                        "style": "primary",
                    }
                ],
            }
        )

    blocks.append({"type": "divider"})
    blocks.append(
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": f"Sent by *MetaFlow* Multi-Agent Orchestrator | Severity: *{severity.upper()}*",
                }
            ],
        }
    )

    payload = {
        "text": f"{emoji} {title}: {summary}",
        "attachments": [{"color": color, "blocks": blocks}],
    }

    try:
        resp = httpx.post(
            settings.slack_webhook_url,
            content=json.dumps(payload),
            headers={"Content-Type": "application/json"},
            timeout=15,
        )
        resp.raise_for_status()
        return (
            f"✅ Slack alert sent successfully!\n"
            f"- **Title**: {title}\n"
            f"- **Severity**: {severity.upper()}\n"
            f"- **Channel**: Configured webhook channel"
        )
    except httpx.HTTPStatusError as e:
        return f"Slack API error ({e.response.status_code}): {e.response.text[:300]}"
    except Exception as e:
        return f"Error sending Slack alert: {e}"
