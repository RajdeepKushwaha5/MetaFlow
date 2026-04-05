"""FastAPI application — the MetaFlow backend."""

from __future__ import annotations

import json
import logging
import re
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from app.agents.orchestrator import build_orchestrator
from app.playbooks.executor import execute_playbook
from app.playbooks.registry import PLAYBOOKS
from app.schemas import (
    ChatRequest,
    HealthResponse,
    PlaybookInfo,
    PlaybookRunRequest,
)

# ---------------------------------------------------------------------------
# Application lifespan — build the orchestrator once at startup
# ---------------------------------------------------------------------------

_orchestrator = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _orchestrator
    try:
        _orchestrator = build_orchestrator()
    except Exception as exc:
        logging.error("Failed to build orchestrator: %s", exc)
        _orchestrator = None
    yield


app = FastAPI(
    title="MetaFlow",
    description="Multi-MCP Agent Orchestration Platform for OpenMetadata",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(status="ok")


@app.get("/api/playbooks", response_model=list[PlaybookInfo])
async def list_playbooks():
    return [
        PlaybookInfo(
            id=p.id,
            name=p.name,
            icon=p.icon,
            description=p.description,
            input_label=p.input_label,
            input_placeholder=p.input_placeholder,
            step_count=len(p.steps),
        )
        for p in PLAYBOOKS.values()
    ]


@app.post("/api/chat")
async def chat(req: ChatRequest):
    """Send a chat message and receive a streaming SSE response."""

    thread_id = req.thread_id or str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}

    MAX_RETRIES = 4
    BASE_DELAY = 5  # seconds

    def _invoke_with_retry():
        """Invoke the orchestrator with exponential backoff on 429 errors."""
        for attempt in range(MAX_RETRIES):
            try:
                return _orchestrator.invoke(
                    {"messages": [{"role": "user", "content": req.message}]},
                    config=config,
                )
            except Exception as exc:
                exc_str = str(exc)
                if "429" in exc_str or "RESOURCE_EXHAUSTED" in exc_str:
                    # Parse retry delay from error if available
                    match = re.search(r"retryDelay.*?(\d+)", exc_str)
                    delay = int(match.group(1)) + 2 if match else BASE_DELAY * (2 ** attempt)
                    delay = min(delay, 60)
                    if attempt < MAX_RETRIES - 1:
                        logging.warning(
                            "Rate limited (attempt %d/%d), retrying in %ds...",
                            attempt + 1, MAX_RETRIES, delay,
                        )
                        time.sleep(delay)
                        continue
                raise
        raise RuntimeError("Max retries exceeded for LLM request")

    async def event_stream():
        yield json.dumps({"type": "thread_id", "thread_id": thread_id})
        if _orchestrator is None:
            yield json.dumps({"type": "error", "message": "Orchestrator not initialized"})
            yield json.dumps({"type": "done"})
            return
        try:
            result = _invoke_with_retry()
            messages = result.get("messages", [])
            raw = messages[-1].content if messages else "No response generated."
            # Gemini may return content as a list of blocks
            if isinstance(raw, list):
                content = "\n".join(
                    block.get("text", "") if isinstance(block, dict) else str(block)
                    for block in raw
                )
            else:
                content = raw
            yield json.dumps({"type": "chunk", "content": content})
        except Exception as exc:
            yield json.dumps({"type": "error", "message": str(exc)})
        yield json.dumps({"type": "done"})

    return EventSourceResponse(event_stream())


@app.post("/api/playbooks/run")
async def run_playbook(req: PlaybookRunRequest):
    """Execute a playbook and stream results via SSE."""

    async def event_stream():
        async for event in execute_playbook(
            req.playbook_id, req.user_input, _orchestrator
        ):
            yield json.dumps(event)

    return EventSourceResponse(event_stream())
