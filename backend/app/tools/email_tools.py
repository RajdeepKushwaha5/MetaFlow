"""Email alert tools for cross-platform metadata workflows.

Provides LangChain tools that send HTML emails via SMTP, allowing
agents to deliver data quality reports, governance alerts, and
audit summaries directly to data owners' inboxes.
"""

from __future__ import annotations

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from langchain_core.tools import tool

from app.core.config import settings
from app.core.demo import email_sent, is_demo

_logger = logging.getLogger(__name__)


def get_email_tools() -> list:
    """Return all Email LangChain tools."""
    return [send_email_alert, send_email_report]


@tool
def send_email_alert(
    to: str,
    subject: str,
    summary: str,
    severity: str = "info",
    details: str = "",
) -> str:
    """Send an email alert about a metadata issue to one or more recipients.

    Use this to notify data owners, stewards, or team leads about data quality
    failures, governance gaps, or compliance issues directly in their inbox.

    Args:
        to: Comma-separated email addresses (e.g. "alice@co.com,bob@co.com").
        subject: Email subject line.
        summary: Brief summary of the alert (1-3 sentences).
        severity: One of "critical", "warning", "info", or "success".
        details: Optional longer details in plain text or simple HTML.
    """
    if is_demo():
        return email_sent(to, subject)
    if not settings.smtp_host:
        return "Error: SMTP not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env"

    color_map = {
        "critical": "#dc2626",
        "warning": "#f59e0b",
        "info": "#3b82f6",
        "success": "#22c55e",
    }
    color = color_map.get(severity, "#3b82f6")
    label = severity.upper()

    html = f"""\
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:{color};color:white;padding:12px 20px;border-radius:8px 8px 0 0">
        <strong>[{label}]</strong> {subject}
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:20px;border-radius:0 0 8px 8px">
        <p style="margin:0 0 12px 0;font-size:15px">{summary}</p>
        {"<div style='background:#f9fafb;padding:12px;border-radius:6px;font-size:13px;white-space:pre-wrap'>" + details + "</div>" if details else ""}
        <hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb">
        <p style="margin:0;font-size:12px;color:#9ca3af">Sent by MetaFlow — Multi-MCP Agent Orchestrator</p>
      </div>
    </div>"""

    return _send_email(to, subject, html)


@tool
def send_email_report(
    to: str,
    subject: str,
    body_html: str,
) -> str:
    """Send a full HTML email report to one or more recipients.

    Use this for detailed reports like data quality summaries, audit results,
    or metadata health checks that need rich formatting.

    Args:
        to: Comma-separated email addresses.
        subject: Email subject line.
        body_html: Full HTML body content. Use tables, headers, colors for formatting.
    """
    if is_demo():
        return email_sent(to, subject)
    if not settings.smtp_host:
        return "Error: SMTP not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env"

    wrapped = f"""\
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto">
      {body_html}
      <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb">
      <p style="font-size:12px;color:#9ca3af">Sent by MetaFlow — Multi-MCP Agent Orchestrator</p>
    </div>"""

    return _send_email(to, subject, wrapped)


def _send_email(to: str, subject: str, html_body: str) -> str:
    """Internal: send an HTML email via SMTP."""
    recipients = [addr.strip() for addr in to.split(",") if addr.strip()]
    if not recipients:
        return "Error: No valid email recipients provided."

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from or settings.smtp_user
    msg["To"] = ", ".join(recipients)
    msg.attach(MIMEText(html_body, "html"))

    server = None
    try:
        if settings.smtp_port == 465:
            server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15)
        else:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15)
            server.starttls()

        if settings.smtp_user and settings.smtp_pass:
            server.login(settings.smtp_user, settings.smtp_pass)

        server.sendmail(msg["From"], recipients, msg.as_string())

        return (
            f"Email sent successfully!\n"
            f"- **To**: {', '.join(recipients)}\n"
            f"- **Subject**: {subject}"
        )
    except Exception as e:
        _logger.exception("Failed to send email")
        return f"Error sending email: {e}"
    finally:
        if server:
            try:
                server.quit()
            except Exception:
                pass
