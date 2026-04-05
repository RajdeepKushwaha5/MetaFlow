"""Shared client singletons for the AI SDK and LLM."""

from __future__ import annotations

from functools import lru_cache

from ai_sdk import AISdk, AISdkConfig
from langchain_google_genai import ChatGoogleGenerativeAI

from app.core.config import settings


@lru_cache(maxsize=1)
def get_ai_sdk_client() -> AISdk:
    """Return a singleton AISdk client."""
    config = AISdkConfig(host=settings.ai_sdk_host, token=settings.ai_sdk_token)
    return AISdk.from_config(config)


@lru_cache(maxsize=1)
def get_llm() -> ChatGoogleGenerativeAI:
    """Return a singleton ChatGoogleGenerativeAI model."""
    return ChatGoogleGenerativeAI(
        model=settings.llm_model,
        google_api_key=settings.google_api_key,
        streaming=True,
    )


def get_metadata_host() -> str:
    """Return the OpenMetadata host URL (without trailing slash)."""
    return settings.ai_sdk_host.rstrip("/")
