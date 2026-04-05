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


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    version: str = "0.1.0"
