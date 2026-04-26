"""Shared client singletons for the AI SDK and LLM."""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from ai_sdk import AISdk, AISdkConfig
from langchain_core.callbacks import AsyncCallbackManagerForLLMRun, CallbackManagerForLLMRun
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import BaseMessage
from langchain_core.outputs import ChatResult
from pydantic import PrivateAttr
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


def _split_gemini_keys() -> list[str]:
    """Return Gemini keys in failover order, preserving GOOGLE_API_KEY first."""
    keys: list[str] = []
    if settings.google_api_key.strip():
        keys.append(settings.google_api_key.strip())
    for raw in settings.google_api_keys.replace("\n", ",").split(","):
        key = raw.strip()
        if key and key not in keys:
            keys.append(key)
    return keys


def _is_rotatable_gemini_error(exc: Exception) -> bool:
    """True for Gemini quota/rate-limit errors where trying the next key helps."""
    text = str(exc).lower()
    return any(
        marker in text
        for marker in (
            "429",
            "quota",
            "rate limit",
            "resource_exhausted",
            "exhausted",
            "too many requests",
        )
    )


class RotatingGeminiChatModel(BaseChatModel):
    """Gemini chat model that retries quota failures with the next API key."""

    model: str
    api_keys: tuple[str, ...]
    streaming: bool = True

    _models: list[ChatGoogleGenerativeAI] = PrivateAttr(default_factory=list)
    _active_index: int = PrivateAttr(default=0)

    def model_post_init(self, __context: Any) -> None:
        self._models = [
            ChatGoogleGenerativeAI(
                model=self.model,
                google_api_key=key,
                streaming=self.streaming,
            )
            for key in self.api_keys
        ]

    @property
    def _llm_type(self) -> str:
        return "rotating-google-generative-ai"

    @property
    def _identifying_params(self) -> dict[str, Any]:
        return {"model": self.model, "key_count": len(self.api_keys)}

    def _ordered_models(self) -> list[ChatGoogleGenerativeAI]:
        if not self._models:
            return []
        return self._models[self._active_index :] + self._models[: self._active_index]

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        last_exc: Exception | None = None
        for model in self._ordered_models():
            try:
                result = model._generate(messages, stop=stop, run_manager=run_manager, **kwargs)
                self._active_index = self._models.index(model)
                return result
            except Exception as exc:
                last_exc = exc
                if not _is_rotatable_gemini_error(exc):
                    raise
        if last_exc:
            raise last_exc
        raise RuntimeError("No Gemini API keys configured.")

    async def _agenerate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: AsyncCallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        last_exc: Exception | None = None
        for model in self._ordered_models():
            try:
                result = await model._agenerate(messages, stop=stop, run_manager=run_manager, **kwargs)
                self._active_index = self._models.index(model)
                return result
            except Exception as exc:
                last_exc = exc
                if not _is_rotatable_gemini_error(exc):
                    raise
        if last_exc:
            raise last_exc
        raise RuntimeError("No Gemini API keys configured.")

    def bind_tools(self, tools, **kwargs):  # type: ignore[no-untyped-def]
        bound = [model.bind_tools(tools, **kwargs) for model in self._ordered_models()]
        if not bound:
            raise RuntimeError("No Gemini API keys configured.")
        return bound[0].with_fallbacks(bound[1:])


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
    gemini_keys = _split_gemini_keys()
    if len(gemini_keys) > 1:
        return RotatingGeminiChatModel(
            model=model,
            api_keys=tuple(gemini_keys),
            streaming=True,
        )
    return ChatGoogleGenerativeAI(
        model=model,
        google_api_key=gemini_keys[0] if gemini_keys else settings.google_api_key,
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
