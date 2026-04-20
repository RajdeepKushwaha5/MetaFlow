"""Application configuration via environment variables."""

from pathlib import Path

from pydantic_settings import BaseSettings

_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    """Central configuration loaded from environment / .env file."""

    # OpenMetadata AI SDK
    ai_sdk_host: str = "http://localhost:8585"
    ai_sdk_token: str = ""

    # LLM (Google Gemini / OpenAI)
    llm_provider: str = "gemini"  # "gemini" or "openai"
    google_api_key: str = ""
    openai_api_key: str = ""
    llm_model: str = "gemini-2.5-flash"

    # Optional integrations
    slack_webhook_url: str = ""
    github_token: str = ""
    github_default_repo: str = ""
    google_service_account_file: str = ""

    # Email (SMTP)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_pass: str = ""
    smtp_from: str = ""

    # Jira
    jira_url: str = ""
    jira_user: str = ""
    jira_api_token: str = ""
    jira_project_key: str = ""

    # Notion
    notion_api_key: str = ""
    notion_database_id: str = ""

    # Webhook secret for OM alerts
    webhook_secret: str = ""

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "info"

    # Demo + steward mode
    demo_mode: bool = False
    steward_enabled: bool = False
    steward_poll_seconds: int = 60

    # Judge mode — one-flag config that points at the public OM sandbox
    # and pre-enables the demo-friendly toggles.
    judge_mode: bool = False
    sandbox_host: str = "https://sandbox.open-metadata.org"

    # OAuth 2.0 client-credentials for OpenMetadata MCP / REST.
    # When all three of token_url/client_id/client_secret are set, MetaFlow
    # uses the OAuth grant + auto-refresh; otherwise falls back to AI_SDK_TOKEN.
    om_oauth_token_url: str = ""
    om_oauth_client_id: str = ""
    om_oauth_client_secret: str = ""
    om_oauth_scope: str = ""
    om_oauth_audience: str = ""

    # AI SDK native multi-turn conversations (server-side history in OM).
    # When false, MetaFlow keeps using local SQLite (the default).
    use_ai_sdk_conversations: bool = False

    model_config = {"env_file": str(_ENV_FILE), "env_file_encoding": "utf-8"}


def _apply_judge_mode(s: "Settings") -> "Settings":
    """If JUDGE_MODE=true, override host + enable steward (real data, autonomous)."""
    if s.judge_mode:
        # Keep DEMO_MODE off so judges see a REAL OM (the public sandbox).
        s.ai_sdk_host = s.sandbox_host
        s.steward_enabled = True
    return s


settings = _apply_judge_mode(Settings())
