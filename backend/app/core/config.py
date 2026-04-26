"""Application configuration via environment variables."""

from pathlib import Path

from pydantic_settings import BaseSettings

_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    """Central configuration loaded from environment / .env file."""

    # OpenMetadata AI SDK
    ai_sdk_host: str = "http://localhost:8585"
    ai_sdk_token: str = ""

    # LLM (Google Gemini / OpenAI / Anthropic)
    llm_provider: str = "gemini"  # "gemini" | "openai" | "anthropic"
    google_api_key: str = ""
    google_api_keys: str = ""
    openai_api_key: str = ""
    anthropic_api_key: str = ""
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
    # When true, write operations against the public sandbox are turned into
    # dry-runs so MetaFlow never PATCHes shared judge-visible data. Auto-on
    # when judge_mode + host is the public sandbox; can be forced on/off.
    # Leave as None to auto-detect based on judge_mode + sandbox host.
    judge_dry_run: bool | None = None

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
    """Apply judge defaults without clobbering an explicit local OM host.

    Hackathon judging can happen in two real-data modes:
    - public sandbox: no AI_SDK_HOST override, so use SANDBOX_HOST
    - local Docker: AI_SDK_HOST points at openmetadata-server, so preserve it
    """
    if s.judge_mode:
        # Keep DEMO_MODE off so judges see a REAL OM target.
        s.demo_mode = False
        if s.ai_sdk_host in ("", "http://localhost:8585"):
            s.ai_sdk_host = s.sandbox_host
        s.steward_enabled = True
    return s


def is_public_sandbox() -> bool:
    """True when the active OM host is OpenMetadata's shared public sandbox."""
    return "sandbox.open-metadata.org" in (settings.ai_sdk_host or "")


def is_dry_run() -> bool:
    """True when MetaFlow should NOT make destructive writes against OM.

    Auto-on whenever we're pointed at the shared public sandbox in judge mode
    (so we don't PATCH data that other judges / spectators are looking at).
    Can be forced via ``JUDGE_DRY_RUN=true`` / ``false``.
    """
    if settings.judge_dry_run is not None:
        return bool(settings.judge_dry_run)
    return bool(settings.judge_mode and is_public_sandbox())


settings = _apply_judge_mode(Settings())
