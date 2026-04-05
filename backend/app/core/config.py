"""Application configuration via environment variables."""

from pathlib import Path

from pydantic_settings import BaseSettings

_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    """Central configuration loaded from environment / .env file."""

    # OpenMetadata AI SDK
    ai_sdk_host: str = "http://localhost:8585"
    ai_sdk_token: str = ""

    # LLM (Google Gemini)
    google_api_key: str = ""
    llm_model: str = "gemini-2.5-flash"

    # Optional integrations
    slack_webhook_url: str = ""
    github_token: str = ""
    github_default_repo: str = ""

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "info"

    model_config = {"env_file": str(_ENV_FILE), "env_file_encoding": "utf-8"}


settings = Settings()
