"""Pydantic models for API request / response schemas."""

from __future__ import annotations

from pydantic import BaseModel


class ChatRequest(BaseModel):
    """Incoming chat message from the user."""

    message: str
    thread_id: str | None = None


class PlaybookRunRequest(BaseModel):
    """Request to execute a playbook."""

    playbook_id: str
    user_input: str


class PlaybookInfo(BaseModel):
    """Public-facing playbook metadata."""

    id: str
    name: str
    icon: str
    description: str
    input_label: str
    input_placeholder: str
    step_count: int


class ComponentHealth(BaseModel):
    """Health status of a single component."""

    name: str
    status: str  # "ok" | "degraded" | "down"
    detail: str = ""


class HealthResponse(BaseModel):
    """Health check response with component-level detail."""

    status: str
    version: str = "0.2.0"
    components: list[ComponentHealth] = []


# ---------------------------------------------------------------------------
# Webhook
# ---------------------------------------------------------------------------

class WebhookEvent(BaseModel):
    """Incoming OpenMetadata alert / webhook payload."""

    event_type: str = ""
    entity_type: str = ""
    entity_fqn: str = ""
    change_description: str = ""
    timestamp: int = 0


# ---------------------------------------------------------------------------
# Conversation History
# ---------------------------------------------------------------------------

class ConversationSummary(BaseModel):
    id: str
    title: str
    created_at: str
    message_count: int


class ConversationMessage(BaseModel):
    role: str
    content: str
    timestamp: str


class ConversationDetail(BaseModel):
    id: str
    title: str
    created_at: str
    messages: list[ConversationMessage]


# ---------------------------------------------------------------------------
# Agent Dashboard Stats
# ---------------------------------------------------------------------------

class AgentStat(BaseModel):
    agent: str
    calls: int
    avg_duration_ms: float


class PlatformStat(BaseModel):
    platform: str
    tool_calls: int


class DashboardStats(BaseModel):
    total_conversations: int
    total_messages: int
    agents: list[AgentStat]
    platforms: list[PlatformStat]
    recent_activity: list[dict]


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

class LLMSettingsResponse(BaseModel):
    """Current LLM configuration (keys are masked)."""

    provider: str
    model: str
    gemini_key_set: bool
    openai_key_set: bool
    gemini_models: list[str]
    openai_models: list[str]


class LLMSettingsUpdate(BaseModel):
    """Request to update LLM provider / model / keys."""

    provider: str | None = None
    model: str | None = None
    gemini_key: str | None = None
    openai_key: str | None = None


# ---------------------------------------------------------------------------
# Data Reliability
# ---------------------------------------------------------------------------


class CreateTestRequest(BaseModel):
    """Create a DQ test case from a recommendation."""

    table_fqn: str
    recommendation: dict


class DispatchTicketRequest(BaseModel):
    """Dispatch a drafted remediation ticket to GitHub or Jira."""

    remediation: dict
    target: str = "github"  # "github" | "jira"


class PublishContractRequest(BaseModel):
    """Push a generated data contract back to OpenMetadata."""

    entity_fqn: str
    contract: dict


class CreateContractTestsRequest(BaseModel):
    """Materialize a contract's quality gates as OM test cases."""

    entity_fqn: str
    contract: dict


class HealContractRequest(BaseModel):
    """Propose a remediation for a violated contract."""

    entity_fqn: str
    violation_summary: str


class HealthScoreRequest(BaseModel):
    """Write a MetaFlow health score back to OM as a native custom property."""

    entity_fqn: str
    score: int  # 0-100
    breakdown: dict[str, float] | None = None


# ---------------------------------------------------------------------------
# Integrations (platform credentials managed from the UI)
# ---------------------------------------------------------------------------


class IntegrationStatus(BaseModel):
    """Configuration status of a single integration (secrets never leak)."""

    id: str
    name: str
    configured: bool
    # Non-secret display fields (endpoint, repo, email, etc.)
    fields: dict[str, str] = {}


class IntegrationsResponse(BaseModel):
    """Status of all platform integrations."""

    integrations: list[IntegrationStatus]


class IntegrationsUpdate(BaseModel):
    """Update any subset of integration credentials. Empty string clears a value."""

    # OpenMetadata
    om_host: str | None = None
    om_token: str | None = None
    # GitHub
    github_token: str | None = None
    github_default_repo: str | None = None
    # Slack
    slack_webhook_url: str | None = None
    # Jira
    jira_url: str | None = None
    jira_user: str | None = None
    jira_api_token: str | None = None
    jira_project_key: str | None = None
    # Notion
    notion_api_key: str | None = None
    notion_database_id: str | None = None
    # Google Workspace
    google_service_account_file: str | None = None
    # SMTP / Email
    smtp_host: str | None = None
    smtp_port: int | None = None
    smtp_user: str | None = None
    smtp_pass: str | None = None
    smtp_from: str | None = None
    # Webhook secret
    webhook_secret: str | None = None
