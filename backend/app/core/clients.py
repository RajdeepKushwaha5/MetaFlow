"""Shared client singletons for the AI SDK and LLM."""

from __future__ import annotations

from functools import lru_cache

from ai_sdk import AISdk, AISdkConfig
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI

from app.core.config import settings

try:
    from langchain_anthropic import ChatAnthropic  # type: ignore
    _HAS_ANTHROPIC = True
except ImportError:  # pragma: no cover
    ChatAnthropic = None  # type: ignore
    _HAS_ANTHROPIC = False

# Supported models per provider
PROVIDER_MODELS: dict[str, list[str]] = {
    "gemini": [
        "gemini-2.5-flash",
        "gemini-2.5-pro",
        "gemini-2.0-flash",
        "gemini-1.5-pro",
        "gemini-1.5-flash",
    ],
    "openai": [
        "gpt-4o",
        "gpt-4o-mini",
        "gpt-4-turbo",
        "gpt-3.5-turbo",
        "o1",
        "o1-mini",
        "o3-mini",
    ],
    "anthropic": [
        "claude-opus-4-20250514",
        "claude-sonnet-4-20250514",
        "claude-3-5-sonnet-latest",
        "claude-3-5-haiku-latest",
        "claude-3-opus-latest",
    ],
}


@lru_cache(maxsize=1)
def get_ai_sdk_client() -> AISdk:
    """Return a singleton AISdk client."""
    config = AISdkConfig(host=settings.ai_sdk_host, token=settings.ai_sdk_token)
    return AISdk.from_config(config)


# ---- Mutable LLM singleton (rebuilt when settings change) ----
_llm_instance: BaseChatModel | None = None


def _build_llm() -> BaseChatModel:
    """Create a new LLM instance based on current settings."""
    provider = settings.llm_provider
    model = settings.llm_model

    if provider == "openai":
        return ChatOpenAI(
            model=model,
            api_key=settings.openai_api_key,
            streaming=True,
        )
    if provider == "anthropic":
        if not _HAS_ANTHROPIC or ChatAnthropic is None:
            raise RuntimeError(
                "Anthropic provider selected but 'langchain-anthropic' is not installed. "
                "Install it with: pip install langchain-anthropic"
            )
        return ChatAnthropic(
            model=model,
            api_key=settings.anthropic_api_key,
            streaming=True,
        )
    # Default: gemini
    return ChatGoogleGenerativeAI(
        model=model,
        google_api_key=settings.google_api_key,
        streaming=True,
    )


def get_llm() -> BaseChatModel:
    """Return the current LLM instance, building on first call."""
    global _llm_instance
    if _llm_instance is None:
        _llm_instance = _build_llm()
    return _llm_instance


def rebuild_llm() -> None:
    """Discard cached LLM so next get_llm() builds a fresh one."""
    global _llm_instance
    _llm_instance = None


def get_metadata_host() -> str:
    """Return the OpenMetadata host URL (without trailing slash)."""
    return settings.ai_sdk_host.rstrip("/")
