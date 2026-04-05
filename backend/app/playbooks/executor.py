"""Playbook execution engine — runs multi-step playbooks via the orchestrator."""

from __future__ import annotations

import uuid
from typing import AsyncGenerator

from app.playbooks.registry import PLAYBOOKS, Playbook


async def execute_playbook(
    playbook_id: str,
    user_input: str,
    orchestrator,
) -> AsyncGenerator[dict, None]:
    """Execute a playbook step-by-step, yielding SSE events.

    Yields dicts suitable for serialization as SSE ``data:`` payloads:
    - ``{"type": "step_start", "step": int, "description": str}``
    - ``{"type": "chunk", "step": int, "content": str}``
    - ``{"type": "step_done", "step": int}``
    - ``{"type": "playbook_done"}``
    - ``{"type": "error", "message": str}``
    """
    playbook = PLAYBOOKS.get(playbook_id)
    if playbook is None:
        yield {"type": "error", "message": f"Unknown playbook: {playbook_id}"}
        return

    thread_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}

    for idx, step in enumerate(playbook.steps):
        yield {"type": "step_start", "step": idx, "description": step.description}

        prompt = step.instruction.format(user_input=user_input)

        try:
            result = orchestrator.invoke(
                {"messages": [{"role": "user", "content": prompt}]},
                config=config,
            )
            content = result["messages"][-1].content
            yield {"type": "chunk", "step": idx, "content": content}
        except Exception as exc:
            yield {"type": "error", "message": f"Step {idx} failed: {exc}"}
            return

        yield {"type": "step_done", "step": idx}

    yield {"type": "playbook_done"}
