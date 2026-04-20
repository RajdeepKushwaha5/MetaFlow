"""FastAPI application — the MetaFlow backend."""

from __future__ import annotations

import json
import logging
import re
import asyncio
import threading
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from app.agents.orchestrator import build_orchestrator
from app.core.clients import PROVIDER_MODELS, rebuild_llm
from app.core.config import settings as app_settings
from app.core.history import init_db
from app.core.ai_conversation import (
    save_message,
    list_conversations,
    get_conversation,
    delete_conversation,
    conversation_backend,
)
from app.core.stats import record_chat, record_agent_call, record_tool_call, get_stats
from app.core.stats import get_efficiency
from app.playbooks.executor import execute_playbook
from app.playbooks.registry import PLAYBOOKS
from app.core.reliability import (
    compute_impact,
    build_cause_tree,
    recommend_dq_tests,
    create_test_case,
)
from app.core.remediation import auto_remediate, dispatch_ticket
from app.core.contracts import (
    create_test_cases_for_contract,
    generate_contract,
    get_contract_status,
    propose_contract_fix,
    publish_contract,
)
from app.core.metrics import scan_metrics
from app.core.governance import schema_drift_timeline, write_health_score
from app.core.steward import (
    get_steward_digest,
    get_steward_state,
    start_steward,
    stop_steward,
)
from app.schemas import (
    ChatRequest,
    ComponentHealth,
    ConversationDetail,
    ConversationSummary,
    CreateContractTestsRequest,
    CreateTestRequest,
    DashboardStats,
    DispatchTicketRequest,
    HealContractRequest,
    HealthResponse,
    HealthScoreRequest,
    IntegrationsResponse,
    IntegrationsUpdate,
    IntegrationStatus,
    LLMSettingsResponse,
    LLMSettingsUpdate,
    PlaybookInfo,
    PlaybookRunRequest,
    PublishContractRequest,
    WebhookEvent,
)

# ---------------------------------------------------------------------------
# Application lifespan — build the orchestrator once at startup
# ---------------------------------------------------------------------------

_orchestrator = None
_orchestrator_lock = threading.Lock()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _orchestrator
    init_db()
    try:
        _orchestrator = build_orchestrator()
    except Exception as exc:
        logging.error("Failed to build orchestrator: %s", exc)
        _orchestrator = None
    # Auto-start the Continuous Data Steward if enabled
    if app_settings.steward_enabled:
        try:
            await start_steward()
        except Exception as exc:
            logging.error("Failed to start steward: %s", exc)
    yield
    try:
        await stop_steward()
    except Exception:
        pass


app = FastAPI(
    title="MetaFlow",
    description="Multi-MCP Agent Orchestration Platform for OpenMetadata",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/health", response_model=HealthResponse)
async def health():
    components = []

    # Orchestrator status
    if _orchestrator is not None:
        components.append(ComponentHealth(name="orchestrator", status="ok", detail="Built and ready"))
    else:
        components.append(ComponentHealth(name="orchestrator", status="down", detail="Failed to initialize"))

    # LLM status
    try:
        from app.core.clients import get_llm
        llm = get_llm()
        components.append(ComponentHealth(name="llm", status="ok", detail=type(llm).__name__))
    except Exception as exc:
        components.append(ComponentHealth(name="llm", status="down", detail=str(exc)[:100]))

    # OpenMetadata connectivity (async to avoid blocking the event loop)
    try:
        import httpx
        om_host = app_settings.ai_sdk_host.rstrip("/")
        async with httpx.AsyncClient(timeout=3) as client:
            r = await client.get(f"{om_host}/api/v1/system/version")
        if r.status_code == 200:
            ver = r.json().get("version", "unknown")
            components.append(ComponentHealth(name="openmetadata", status="ok", detail=f"v{ver}"))
        else:
            components.append(ComponentHealth(name="openmetadata", status="degraded", detail=f"HTTP {r.status_code}"))
    except Exception:
        components.append(ComponentHealth(name="openmetadata", status="down", detail="Unreachable"))

    overall = "ok" if all(c.status == "ok" for c in components) else "degraded"
    return HealthResponse(status=overall, components=components)


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
    """Send a chat message and receive a streaming SSE response.

    Streams agent-by-agent reasoning events so the UI can show which
    specialist is active and what tools are being called in real-time.
    """

    thread_id = req.thread_id or str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}

    # Persist user message
    save_message(thread_id, "user", req.message)
    record_chat(thread_id, req.message)

    MAX_RETRIES = 4
    BASE_DELAY = 5  # seconds
    last_exc: Exception | None = None

    def _extract_content(raw) -> str:
        """Normalize content from message objects (handles Gemini list blocks)."""
        if isinstance(raw, list):
            return "\n".join(
                block.get("text", "") if isinstance(block, dict) else str(block)
                for block in raw
            )
        return str(raw) if raw else ""

    async def _stream_with_retry():
        """Stream the orchestrator with exponential backoff on 429 errors."""
        for attempt in range(MAX_RETRIES):
            try:
                return _orchestrator.stream(
                    {"messages": [{"role": "user", "content": req.message}]},
                    config=config,
                )
            except Exception as exc:
                nonlocal last_exc
                last_exc = exc
                exc_str = str(exc)
                if "429" in exc_str or "RESOURCE_EXHAUSTED" in exc_str:
                    match = re.search(r"retryDelay.*?(\d+)", exc_str)
                    delay = int(match.group(1)) + 2 if match else BASE_DELAY * (2 ** attempt)
                    delay = min(delay, 60)
                    if attempt < MAX_RETRIES - 1:
                        logging.warning(
                            "Rate limited (attempt %d/%d), retrying in %ds...",
                            attempt + 1, MAX_RETRIES, delay,
                        )
                        await asyncio.sleep(delay)
                        continue
                raise
        raise RuntimeError(
            f"Max retries ({MAX_RETRIES}) exceeded for LLM request. Last error: {last_exc}"
        )

    async def event_stream():
        yield json.dumps({"type": "thread_id", "thread_id": thread_id})
        if _orchestrator is None:
            yield json.dumps({"type": "error", "message": "Orchestrator not initialized"})
            yield json.dumps({"type": "done"})
            return
        try:
            stream = await _stream_with_retry()
            final_content = ""
            current_agent = None
            agent_start = None

            for chunk in stream:
                # LangGraph supervisor yields {node_name: {"messages": [...]}}
                for node_name, node_output in chunk.items():
                    messages = node_output.get("messages", [])
                    if not messages:
                        continue

                    # Track agent transitions for live reasoning
                    if node_name != "supervisor" and node_name != current_agent:
                        # Record timing for the previous agent
                        if current_agent and agent_start:
                            elapsed = (time.time() - agent_start) * 1000
                            record_agent_call(current_agent, elapsed)
                        current_agent = node_name
                        agent_start = time.time()
                        yield json.dumps({
                            "type": "agent_start",
                            "agent": node_name,
                        })

                    last_msg = messages[-1]
                    # Extract tool calls for real-time display
                    tool_calls = getattr(last_msg, "tool_calls", None)
                    if tool_calls:
                        for tc in tool_calls:
                            tool_name = tc.get("name", "") if isinstance(tc, dict) else getattr(tc, "name", "")
                            if tool_name:
                                record_tool_call(tool_name)
                                yield json.dumps({
                                    "type": "tool_call",
                                    "agent": node_name,
                                    "tool": tool_name,
                                })

                    # Extract content from messages
                    content = getattr(last_msg, "content", "")
                    if content and node_name != "supervisor":
                        text = _extract_content(content)
                        if text.strip():
                            final_content = text

            # Record timing for the last agent
            if current_agent and agent_start:
                elapsed = (time.time() - agent_start) * 1000
                record_agent_call(current_agent, elapsed)

            if not final_content:
                final_content = "No response generated."

            # Persist assistant message
            save_message(thread_id, "assistant", final_content)
            yield json.dumps({"type": "chunk", "content": final_content})
        except Exception as exc:
            # Log full error server-side; send a truncated message to the client
            logging.error("Chat stream failed (thread=%s): %s", thread_id, exc, exc_info=True)
            yield json.dumps({"type": "error", "message": str(exc)[:200]})
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


# ---------------------------------------------------------------------------
# Webhook Listener — receives OpenMetadata alert payloads
# ---------------------------------------------------------------------------

@app.post("/api/webhooks/openmetadata")
async def webhook_listener(request: Request):
    """Receive OpenMetadata alert webhooks and auto-trigger workflows.

    Parses the incoming payload and routes to appropriate playbooks:
    - Test Case failures → DQ Fire Drill playbook
    - Schema changes → Impact Radar playbook
    - Other events → Generic analysis + Slack notification
    """
    try:
        body = await request.json()
    except Exception:
        from fastapi.responses import JSONResponse
        return JSONResponse({"status": "error", "message": "Invalid JSON payload"}, status_code=400)

    # Normalize — OM webhooks can vary in structure
    event_type = body.get("eventType", body.get("event_type", "unknown"))
    entity_type = body.get("entityType", body.get("entity_type", ""))
    entity_fqn = body.get("entityFullyQualifiedName", body.get("entity_fqn", ""))
    change_desc = body.get("changeDescription", body.get("change_description", ""))
    test_status = body.get("testCaseStatus", "")

    if isinstance(change_desc, dict):
        change_desc = json.dumps(change_desc)

    if _orchestrator is None:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            {"status": "queued", "message": "Orchestrator not ready — event logged"},
            status_code=503,
        )

    thread_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}
    save_message(thread_id, "system", f"Webhook: {event_type} on {entity_fqn}")

    # Route to playbooks based on event type for auto-triggered workflows
    playbook_id = None
    user_input = entity_fqn or str(change_desc)

    if entity_type.lower() in ("testcase", "test_case", "testsuite", "test_suite"):
        if test_status.lower() in ("failed", "aborted"):
            playbook_id = "dq-fire-drill"
            user_input = f"DQ test failure on {entity_fqn}. Status: {test_status}. Details: {change_desc}"
    elif event_type.lower() in ("entitycreated", "entityupdated", "entitydeleted"):
        if entity_type.lower() == "table" and change_desc:
            playbook_id = "impact-radar"
            user_input = f"Schema change on {entity_fqn}: {change_desc}"

    if playbook_id:
        # Auto-trigger a playbook
        logging.info("Webhook auto-triggering playbook '%s' for %s", playbook_id, entity_fqn)
        results = []
        async for event in execute_playbook(playbook_id, user_input, _orchestrator):
            results.append(event)
        save_message(thread_id, "assistant", f"Auto-triggered playbook: {playbook_id}")
        return {
            "status": "processed",
            "thread_id": thread_id,
            "playbook_triggered": playbook_id,
            "steps_completed": sum(1 for r in results if r.get("type") == "step_done"),
        }

    # Fallback: generic analysis via orchestrator
    prompt = (
        f"An OpenMetadata webhook was received: event_type={event_type}, "
        f"entity_type={entity_type}, entity_fqn={entity_fqn}. "
        f"Change details: {change_desc}. "
        f"Please analyze this event, check the affected entity, "
        f"and send a Slack notification summarizing the impact."
    )

    try:
        result = _orchestrator.invoke(
            {"messages": [{"role": "user", "content": prompt}]},
            config=config,
        )
        messages = result.get("messages", [])
        if messages:
            raw = messages[-1].content
            content = raw if isinstance(raw, str) else str(raw)
        else:
            content = ""
        save_message(thread_id, "assistant", content)
        return {"status": "processed", "thread_id": thread_id}
    except Exception as exc:
        logging.error("Webhook processing failed: %s", exc)
        return {"status": "error", "message": str(exc)}


# ---------------------------------------------------------------------------
# Conversation History
# ---------------------------------------------------------------------------

@app.get("/api/conversations", response_model=list[ConversationSummary])
async def api_list_conversations():
    """List recent conversations."""
    rows = list_conversations(limit=50)
    return [ConversationSummary(**r) for r in rows]


@app.get("/api/conversations/{conversation_id}")
async def api_get_conversation(conversation_id: str):
    """Get a conversation with all messages."""
    conv = get_conversation(conversation_id)
    if conv is None:
        return {"error": "Conversation not found"}
    return conv


@app.delete("/api/conversations/{conversation_id}")
async def api_delete_conversation(conversation_id: str):
    """Delete a conversation."""
    ok = delete_conversation(conversation_id)
    return {"deleted": ok}


# ---------------------------------------------------------------------------
# Agent Dashboard Stats
# ---------------------------------------------------------------------------

@app.get("/api/stats", response_model=DashboardStats)
async def api_stats():
    """Return agent usage statistics for the dashboard."""
    convs = list_conversations(limit=10000)
    total_convs = len(convs)
    total_msgs = sum(c.get("message_count", 0) for c in convs)
    return DashboardStats(**get_stats(total_convs, total_msgs))


# ---------------------------------------------------------------------------
# LLM Settings
# ---------------------------------------------------------------------------

@app.get("/api/settings", response_model=LLMSettingsResponse)
async def api_get_settings():
    """Return current LLM provider/model config (keys masked)."""
    return LLMSettingsResponse(
        provider=app_settings.llm_provider,
        model=app_settings.llm_model,
        gemini_key_set=bool(app_settings.google_api_key),
        openai_key_set=bool(app_settings.openai_api_key),
        gemini_models=PROVIDER_MODELS["gemini"],
        openai_models=PROVIDER_MODELS["openai"],
    )


@app.put("/api/settings", response_model=LLMSettingsResponse)
async def api_update_settings(req: LLMSettingsUpdate):
    """Update LLM provider, model, or API keys and rebuild orchestrator."""
    global _orchestrator

    changed = False

    # Update API keys
    if req.gemini_key is not None:
        app_settings.google_api_key = req.gemini_key
        changed = True
    if req.openai_key is not None:
        app_settings.openai_api_key = req.openai_key
        changed = True

    # Update provider
    if req.provider is not None and req.provider in PROVIDER_MODELS:
        if req.provider != app_settings.llm_provider:
            app_settings.llm_provider = req.provider
            # If no explicit model given, default to first model for new provider
            if req.model is None:
                app_settings.llm_model = PROVIDER_MODELS[req.provider][0]
            changed = True

    # Update model
    if req.model is not None:
        provider = req.provider or app_settings.llm_provider
        if req.model in PROVIDER_MODELS.get(provider, []):
            app_settings.llm_model = req.model
            changed = True

    # Rebuild orchestrator with new settings
    if changed:
        rebuild_llm()
        with _orchestrator_lock:
            try:
                _orchestrator = build_orchestrator()
            except Exception as exc:
                logging.error("Failed to rebuild orchestrator: %s", exc)
                _orchestrator = None

    return LLMSettingsResponse(
        provider=app_settings.llm_provider,
        model=app_settings.llm_model,
        gemini_key_set=bool(app_settings.google_api_key),
        openai_key_set=bool(app_settings.openai_api_key),
        gemini_models=PROVIDER_MODELS["gemini"],
        openai_models=PROVIDER_MODELS["openai"],
    )


# ---------------------------------------------------------------------------
# Integrations — manage platform credentials from the UI
# ---------------------------------------------------------------------------


def _build_integrations_status() -> IntegrationsResponse:
    """Snapshot of all integration configuration (secrets masked)."""
    s = app_settings
    items: list[IntegrationStatus] = [
        IntegrationStatus(
            id="openmetadata",
            name="OpenMetadata",
            configured=bool(s.ai_sdk_host and s.ai_sdk_token),
            fields={"host": s.ai_sdk_host or ""},
        ),
        IntegrationStatus(
            id="github",
            name="GitHub",
            configured=bool(s.github_token),
            fields={"default_repo": s.github_default_repo or ""},
        ),
        IntegrationStatus(
            id="slack",
            name="Slack",
            configured=bool(s.slack_webhook_url),
            fields={},
        ),
        IntegrationStatus(
            id="jira",
            name="Jira",
            configured=bool(s.jira_url and s.jira_api_token),
            fields={
                "url": s.jira_url or "",
                "user": s.jira_user or "",
                "project_key": s.jira_project_key or "",
            },
        ),
        IntegrationStatus(
            id="notion",
            name="Notion",
            configured=bool(s.notion_api_key),
            fields={"database_id": s.notion_database_id or ""},
        ),
        IntegrationStatus(
            id="google",
            name="Google Workspace",
            configured=bool(s.google_service_account_file),
            fields={"service_account_file": s.google_service_account_file or ""},
        ),
        IntegrationStatus(
            id="email",
            name="Email (SMTP)",
            configured=bool(s.smtp_host and s.smtp_user),
            fields={
                "host": s.smtp_host or "",
                "port": str(s.smtp_port or ""),
                "user": s.smtp_user or "",
                "from": s.smtp_from or "",
            },
        ),
        IntegrationStatus(
            id="webhook",
            name="OpenMetadata Webhook",
            configured=bool(s.webhook_secret),
            fields={},
        ),
    ]
    return IntegrationsResponse(integrations=items)


@app.get("/api/integrations", response_model=IntegrationsResponse)
async def api_get_integrations():
    """Return configuration status for every platform integration (secrets masked)."""
    return _build_integrations_status()


@app.put("/api/integrations", response_model=IntegrationsResponse)
async def api_update_integrations(req: IntegrationsUpdate):
    """Update any subset of integration credentials.

    A field set to ``None`` is ignored. An empty string clears the value.
    """
    field_map = {
        "om_host": "ai_sdk_host",
        "om_token": "ai_sdk_token",
        "github_token": "github_token",
        "github_default_repo": "github_default_repo",
        "slack_webhook_url": "slack_webhook_url",
        "jira_url": "jira_url",
        "jira_user": "jira_user",
        "jira_api_token": "jira_api_token",
        "jira_project_key": "jira_project_key",
        "notion_api_key": "notion_api_key",
        "notion_database_id": "notion_database_id",
        "google_service_account_file": "google_service_account_file",
        "smtp_host": "smtp_host",
        "smtp_port": "smtp_port",
        "smtp_user": "smtp_user",
        "smtp_pass": "smtp_pass",
        "smtp_from": "smtp_from",
        "webhook_secret": "webhook_secret",
    }
    data = req.model_dump(exclude_none=True)
    for src, dst in field_map.items():
        if src in data:
            setattr(app_settings, dst, data[src])

    # If OpenMetadata credentials changed, rebuild orchestrator so the new host/token is picked up.
    if any(k in data for k in ("om_host", "om_token")):
        global _orchestrator
        with _orchestrator_lock:
            try:
                _orchestrator = build_orchestrator()
            except Exception as exc:
                logging.error("Failed to rebuild orchestrator after integration change: %s", exc)
                _orchestrator = None

    return _build_integrations_status()


# ---------------------------------------------------------------------------
# Data Reliability — Impact scoring, Cause trees, DQ recommendations
# ---------------------------------------------------------------------------


@app.get("/api/reliability/impact")
async def api_impact_score(entity_fqn: str, max_depth: int = 3):
    """Compute impact score + lineage blast-radius graph for an entity.

    The underlying function makes synchronous HTTP calls; we offload to a
    worker thread so we don't block the event loop.
    """
    return await asyncio.to_thread(compute_impact, entity_fqn, max_depth)


@app.get("/api/reliability/cause-tree")
async def api_cause_tree(test_fqn: str):
    """Build an explainable cause tree for a failing DQ test case."""
    return await asyncio.to_thread(build_cause_tree, test_fqn)


@app.get("/api/reliability/recommendations")
async def api_dq_recommendations(table_fqn: str):
    """Recommend DQ tests for a table based on profile + schema heuristics."""
    return await asyncio.to_thread(recommend_dq_tests, table_fqn)


@app.post("/api/reliability/create-test")
async def api_create_test(req: CreateTestRequest):
    """Create a DQ test case on OpenMetadata from a recommendation."""
    return await asyncio.to_thread(create_test_case, req.table_fqn, req.recommendation)


# ---------------------------------------------------------------------------
# Auto-Remediation — lineage-aware root cause + ticket draft
# ---------------------------------------------------------------------------


@app.get("/api/reliability/auto-remediate")
async def api_auto_remediate(test_fqn: str):
    """Lineage-aware auto-remediation: identify root-cause upstream column
    via drift analysis + owner resolution + drafted GitHub/Jira tickets."""
    return await asyncio.to_thread(auto_remediate, test_fqn)


@app.post("/api/reliability/dispatch-ticket")
async def api_dispatch_ticket(req: DispatchTicketRequest):
    """Send a drafted remediation ticket to GitHub or Jira."""
    return await asyncio.to_thread(dispatch_ticket, req.remediation, req.target)


# ---------------------------------------------------------------------------
# Data Contract Generator — synthesize contracts from lineage + profiles
# ---------------------------------------------------------------------------


@app.get("/api/reliability/contract")
async def api_generate_contract(entity_fqn: str, max_depth: int = 3):
    """Generate a data contract YAML from an entity's lineage + profiler stats."""
    return await asyncio.to_thread(generate_contract, entity_fqn, max_depth)


@app.post("/api/reliability/contract/publish")
async def api_publish_contract(req: PublishContractRequest):
    """Push a generated data contract back to OpenMetadata."""
    return await asyncio.to_thread(publish_contract, req.entity_fqn, req.contract)


@app.get("/api/reliability/contract/status")
async def api_contract_status(entity_fqn: str):
    """Get the live status (Draft/Active/Violated) of a contract."""
    return await asyncio.to_thread(get_contract_status, entity_fqn)


@app.post("/api/reliability/contract/create-tests")
async def api_contract_create_tests(req: CreateContractTestsRequest):
    """Materialize the contract's quality gates as OM test cases."""
    return await asyncio.to_thread(
        create_test_cases_for_contract, req.entity_fqn, req.contract
    )


@app.post("/api/reliability/contract/heal")
async def api_contract_heal(req: HealContractRequest):
    """Draft a remediation (SQL diff + ticket) for a violated contract."""
    return await asyncio.to_thread(
        propose_contract_fix, req.entity_fqn, req.violation_summary
    )


@app.post("/webhooks/contract-violation")
async def webhook_contract_violation(event: WebhookEvent):
    """OM webhook entrypoint for contract violations.

    Expected payload (best-effort): {entity_fqn, violation_summary}.
    Drafts a heal proposal and returns it. Wire to your alerting / PR
    automation downstream.
    """
    payload = event.payload or {}
    entity_fqn = payload.get("entity_fqn") or payload.get("entityFqn")
    violation = payload.get("violation_summary") or payload.get("summary") or "contract violated"
    if not entity_fqn:
        return {"ok": False, "message": "missing entity_fqn in payload"}
    heal = await asyncio.to_thread(propose_contract_fix, entity_fqn, violation)
    return {"ok": True, "heal": heal}


# ---------------------------------------------------------------------------
# Continuous Data Steward (background autonomous agent)
# ---------------------------------------------------------------------------


@app.get("/api/steward/state")
async def api_steward_state():
    """Live state of the steward background loop."""
    return get_steward_state()


@app.get("/api/steward/digest")
async def api_steward_digest():
    """Today's rolling digest of events + actions taken."""
    return get_steward_digest()


@app.post("/api/steward/start")
async def api_steward_start():
    """Start the steward background loop (idempotent)."""
    return await start_steward()


@app.post("/api/steward/stop")
async def api_steward_stop():
    """Stop the steward background loop."""
    return await stop_steward()


# ---------------------------------------------------------------------------
# Real-data metrics scanner
# ---------------------------------------------------------------------------


@app.get("/api/metrics/scan")
async def api_metrics_scan(sample_tables: int = 200):
    """Walk OM and return hard numbers (PII gaps, contract coverage, DQ pass rate)."""
    return await asyncio.to_thread(scan_metrics, sample_tables)


# ---------------------------------------------------------------------------
# Governance writebacks — make MetaFlow's verdict visible inside OM itself
# ---------------------------------------------------------------------------


@app.post("/api/governance/health-score")
async def api_write_health_score(req: HealthScoreRequest):
    """Write a MetaFlow health score back to OM as a native custom property.

    Idempotently registers the ``metaflow_health_score`` custom property on
    the ``table`` entity type, then PATCHes the score onto the specific table.
    The score becomes visible in OM's UI under the table's Custom Properties
    panel — closing the loop from "AI suggests" to "OM stores it for humans".
    """
    return await asyncio.to_thread(
        write_health_score, req.entity_fqn, req.score, req.breakdown or {}
    )


@app.get("/api/governance/schema-drift")
async def api_schema_drift(entity_fqn: str, limit: int = 20):
    """Return a schema-drift timeline for a table (column add/drop/type-change).

    Walks OM's native ``/api/v1/tables/{id}/versions`` and diffs adjacent
    versions. Directly answers the live audience question from the org's
    hackathon talk: "we want to build a dashboard for tracking schema drift".
    """
    return await asyncio.to_thread(schema_drift_timeline, entity_fqn, limit)


# ---------------------------------------------------------------------------
# Token efficiency — quantifies the "right answer in fewest tokens" story
# ---------------------------------------------------------------------------


@app.get("/api/metrics/efficiency")
async def api_metrics_efficiency():
    """Running tally of tokens NOT sent to the LLM thanks to OM filtering.

    Every time DiscoveryAgent calls ``om_search_with_preferences``, we
    record how many entities the agent did NOT have to inspect. Multiplied
    by an avg-tokens-per-entity heuristic, this gives a concrete number
    judges can hear: "MetaFlow saved 14,200 tokens this session".
    """
    return get_efficiency()


# ---------------------------------------------------------------------------
# System info — for the frontend "Judge Mode" / "Demo Mode" banner
# ---------------------------------------------------------------------------


@app.get("/api/system/info")
async def api_system_info():
    """Surface the env-mode flags so the UI can show the right banner."""
    from app.core.auth import auth_status
    from app.core.personas import personas_supported
    return {
        "demo_mode": app_settings.demo_mode,
        "judge_mode": app_settings.judge_mode,
        "steward_enabled": app_settings.steward_enabled,
        "ai_sdk_host": app_settings.ai_sdk_host,
        "is_sandbox": "sandbox.open-metadata.org" in app_settings.ai_sdk_host,
        "auth_mode": auth_status().get("mode"),
        "conversation_backend": conversation_backend(),
        "personas_supported": personas_supported(),
    }


# ---------------------------------------------------------------------------
# Auth introspection — proves whether OAuth refresh is live
# ---------------------------------------------------------------------------


@app.get("/api/system/auth")
async def api_system_auth():
    """Show the active auth mode (PAT vs OAuth client_credentials) and
    OAuth token freshness. Used by the UI + by ops dashboards.
    """
    from app.core.auth import auth_status
    return auth_status()


@app.post("/api/system/auth/refresh")
async def api_system_auth_refresh():
    """Force-refresh the OAuth access token. No-op if PAT mode."""
    from app.core.auth import auth_status, get_om_token, reset_token_cache
    reset_token_cache()
    token = get_om_token()
    return {
        "refreshed": True,
        "has_token": bool(token),
        **auth_status(),
    }


# ---------------------------------------------------------------------------
# AI Studio Personas — publish MetaFlow specialists into OM as personas
# ---------------------------------------------------------------------------


@app.get("/api/personas")
async def api_personas_list():
    """List MetaFlow-published personas (server-side or local)."""
    from app.core.personas import list_personas
    return list_personas()


@app.post("/api/personas/publish")
async def api_personas_publish():
    """Idempotently push every MetaFlow specialist into OM as an AI Studio
    persona. Safe to call repeatedly. Returns created/updated/failed lists.
    """
    from app.core.personas import publish_personas
    return publish_personas()


@app.post("/api/personas/{persona_name}/invoke")
async def api_personas_invoke(persona_name: str, message: str):
    """Invoke a single persona by name. Routes to OM if supported, else
    runs the matching local LangGraph specialist.
    """
    from app.core.personas import invoke_persona
    return invoke_persona(persona_name, message, orchestrator=_orchestrator)


# ---------------------------------------------------------------------------
# Virtual connector export — MetaFlow's outputs as if it were an OM source
# ---------------------------------------------------------------------------


@app.get("/api/connector/export")
async def api_connector_export():
    """Export MetaFlow's outputs in an OM-ingestion-style envelope.

    Frames health scores, contract status, drift events, and steward
    actions as if MetaFlow were a custom OM connector publishing
    metadata. Useful for downstream pipelines that want to consume
    MetaFlow's autonomous decisions as a metadata source.
    """
    state = get_steward_state()
    digest = get_steward_digest()
    return {
        "source": {
            "name": "metaflow.virtual-connector",
            "type": "AutonomousAgent",
            "version": "0.1.0",
            "host": app_settings.ai_sdk_host,
        },
        "ingestionTimestamp": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "entities": {
            "stewardState": state,
            "stewardDigest": digest,
        },
        "schema": {
            "customProperties": [
                {
                    "name": "metaflow_health_score",
                    "type": "string",
                    "description": "MetaFlow autonomous health score (0-100) JSON blob.",
                    "example": '{"score": 87, "breakdown": {"contract": 1.0, "dq": 0.9}}',
                }
            ],
        },
    }

