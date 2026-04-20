"""Unit + integration tests for the MetaFlow backend.

Covers:
- Health endpoint
- Playbooks listing endpoint
- Settings GET / PUT endpoints
- Conversations CRUD endpoints
- Stats endpoint
- Webhook endpoint
- Chat endpoint (SSE streaming)
- Schema validation
- History / stats modules
"""

from __future__ import annotations

import json

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.core.history import init_db, save_message, list_conversations, get_conversation, delete_conversation
from app.core.stats import record_agent_call, record_tool_call, record_chat, get_stats
from app.core.clients import PROVIDER_MODELS, rebuild_llm
from app.core.config import settings as app_settings
from app.playbooks.registry import PLAYBOOKS
from app.agents.specialists import SPECIALIST_CONFIGS
from app.tools.insights_tools import get_insights_tools
from app.schemas import (
    HealthResponse,
    PlaybookInfo,
    LLMSettingsResponse,
    LLMSettingsUpdate,
    ConversationSummary,
    DashboardStats,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    """Async httpx client wired to the FastAPI app (no real server needed)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ===================================================================
# 1. UNIT TESTS — Schemas
# ===================================================================

class TestSchemas:
    def test_health_response(self):
        r = HealthResponse(status="ok")
        assert r.status == "ok"
        assert r.version == "0.2.0"

    def test_playbook_info(self):
        p = PlaybookInfo(
            id="test",
            name="Test",
            icon="zap",
            description="desc",
            input_label="Label",
            input_placeholder="Placeholder",
            step_count=3,
        )
        assert p.id == "test"
        assert p.step_count == 3

    def test_llm_settings_response(self):
        r = LLMSettingsResponse(
            provider="gemini",
            model="gemini-2.5-flash",
            gemini_key_set=True,
            openai_key_set=False,
            gemini_models=["gemini-2.5-flash"],
            openai_models=["gpt-4o"],
        )
        assert r.provider == "gemini"
        assert r.gemini_key_set is True

    def test_llm_settings_update_partial(self):
        u = LLMSettingsUpdate(provider="openai")
        assert u.provider == "openai"
        assert u.model is None
        assert u.gemini_key is None

    def test_dashboard_stats(self):
        s = DashboardStats(
            total_conversations=5,
            total_messages=20,
            agents=[],
            platforms=[],
            recent_activity=[],
        )
        assert s.total_conversations == 5


# ===================================================================
# 2. UNIT TESTS — Provider models config
# ===================================================================

class TestProviderModels:
    def test_gemini_models_present(self):
        assert "gemini" in PROVIDER_MODELS
        assert "gemini-2.5-flash" in PROVIDER_MODELS["gemini"]
        assert len(PROVIDER_MODELS["gemini"]) >= 5

    def test_openai_models_present(self):
        assert "openai" in PROVIDER_MODELS
        assert "gpt-4o" in PROVIDER_MODELS["openai"]
        assert len(PROVIDER_MODELS["openai"]) >= 7

    def test_rebuild_llm_resets_singleton(self):
        rebuild_llm()
        # After rebuild, _llm_instance should be None
        from app.core.clients import _llm_instance
        assert _llm_instance is None


# ===================================================================
# 3. UNIT TESTS — Playbook registry
# ===================================================================

class TestPlaybooks:
    def test_playbooks_not_empty(self):
        assert len(PLAYBOOKS) > 0

    def test_playbooks_have_13_entries(self):
        assert len(PLAYBOOKS) == 13

    def test_playbook_has_required_fields(self):
        for pid, pb in PLAYBOOKS.items():
            assert pb.id == pid
            assert pb.name
            assert pb.description
            assert pb.icon
            assert pb.input_label
            assert pb.input_placeholder
            assert len(pb.steps) > 0

    def test_specific_playbooks_exist(self):
        expected = [
            "impact-radar",
            "pii-sweep",
            "dq-fire-drill",
            "metadata-health",
            "dq-report-notify",
            "pii-track-notify",
            "dq-sheet-alert",
            "metadata-audit-doc",
            "dq-jira-email",
            "lineage-notion-jira",
            "full-incident-response",
            "dq-test-recommender",
            "platform-health-kpi",
        ]
        for pid in expected:
            assert pid in PLAYBOOKS, f"Playbook '{pid}' missing"


# ===================================================================
# 3b. UNIT TESTS — Specialist configs & Insights tools
# ===================================================================

class TestSpecialistConfigs:
    def test_all_12_agents_configured(self):
        expected_agents = [
            "discovery_agent", "lineage_agent", "curator_agent",
            "data_quality_agent", "governance_agent", "github_agent",
            "slack_agent", "google_agent", "email_agent", "jira_agent",
            "notion_agent", "insights_agent",
        ]
        for name in expected_agents:
            assert name in SPECIALIST_CONFIGS, f"Agent '{name}' missing from SPECIALIST_CONFIGS"
        assert len(SPECIALIST_CONFIGS) == 12

    def test_insights_agent_has_no_mcp_tools(self):
        cfg = SPECIALIST_CONFIGS["insights_agent"]
        assert cfg["mcp_tools"] == []

    def test_insights_tools_returns_5_tools(self):
        tools = get_insights_tools()
        assert len(tools) == 5
        names = {t.name for t in tools}
        assert "get_data_insights_summary" in names
        assert "get_dq_summary" in names
        assert "get_ownership_coverage" in names
        assert "get_description_coverage" in names
        assert "get_entity_counts" in names

    def test_discovery_agent_has_mcp_tools(self):
        cfg = SPECIALIST_CONFIGS["discovery_agent"]
        assert len(cfg["mcp_tools"]) == 3


# ===================================================================
# 4. UNIT TESTS — Stats module
# ===================================================================

class TestStats:
    def test_record_agent_call(self):
        record_agent_call("test_agent", 150.0)
        stats = get_stats()
        agents = {a["agent"]: a for a in stats["agents"]}
        assert "test_agent" in agents
        assert agents["test_agent"]["calls"] >= 1

    def test_record_tool_call_github(self):
        record_tool_call("github_create_issue")
        stats = get_stats()
        platforms = {p["platform"]: p for p in stats["platforms"]}
        assert "GitHub" in platforms

    def test_record_tool_call_slack(self):
        record_tool_call("slack_post_message")
        stats = get_stats()
        platforms = {p["platform"]: p for p in stats["platforms"]}
        assert "Slack" in platforms

    def test_record_chat_activity(self):
        record_chat("thread-1", "Hello world")
        stats = get_stats()
        assert len(stats["recent_activity"]) > 0
        assert stats["recent_activity"][0]["type"] == "chat"


# ===================================================================
# 5. UNIT TESTS — History module (SQLite)
# ===================================================================

class TestHistory:
    def setup_method(self):
        init_db()

    def test_save_and_list_conversations(self):
        cid = "test-conv-unit-1"
        save_message(cid, "user", "Hello from unit test")
        convs = list_conversations(limit=100)
        ids = [c["id"] for c in convs]
        assert cid in ids

    def test_save_and_get_conversation(self):
        cid = "test-conv-unit-2"
        delete_conversation(cid)  # clean slate
        save_message(cid, "user", "First message")
        save_message(cid, "assistant", "Response")
        conv = get_conversation(cid)
        assert conv is not None
        assert conv["id"] == cid
        assert len(conv["messages"]) == 2

    def test_delete_conversation(self):
        cid = "test-conv-unit-3"
        save_message(cid, "user", "To be deleted")
        ok = delete_conversation(cid)
        assert ok is True
        conv = get_conversation(cid)
        assert conv is None

    def test_get_nonexistent_conversation(self):
        conv = get_conversation("nonexistent-id")
        assert conv is None

    def test_delete_nonexistent_conversation(self):
        ok = delete_conversation("nonexistent-id-2")
        assert ok is False


# ===================================================================
# 6. INTEGRATION TESTS — API Endpoints (via httpx ASGI transport)
# ===================================================================

@pytest.mark.anyio
class TestHealthEndpoint:
    async def test_health_returns_ok(self, client):
        resp = await client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] in ("ok", "degraded")
        assert "version" in data
        assert "components" in data
        assert isinstance(data["components"], list)


@pytest.mark.anyio
class TestPlaybooksEndpoint:
    async def test_list_playbooks(self, client):
        resp = await client.get("/api/playbooks")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 13

    async def test_playbook_structure(self, client):
        resp = await client.get("/api/playbooks")
        data = resp.json()
        for pb in data:
            assert "id" in pb
            assert "name" in pb
            assert "icon" in pb
            assert "description" in pb
            assert "input_label" in pb
            assert "input_placeholder" in pb
            assert "step_count" in pb
            assert pb["step_count"] > 0


@pytest.mark.anyio
class TestSettingsEndpoint:
    async def test_get_settings(self, client):
        resp = await client.get("/api/settings")
        assert resp.status_code == 200
        data = resp.json()
        assert data["provider"] in ("gemini", "openai")
        assert "model" in data
        assert "gemini_models" in data
        assert "openai_models" in data
        assert isinstance(data["gemini_key_set"], bool)
        assert isinstance(data["openai_key_set"], bool)

    async def test_get_settings_has_all_models(self, client):
        resp = await client.get("/api/settings")
        data = resp.json()
        assert len(data["gemini_models"]) >= 5
        assert len(data["openai_models"]) >= 7


@pytest.mark.anyio
class TestConversationsEndpoint:
    async def test_list_conversations(self, client):
        resp = await client.get("/api/conversations")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    async def test_get_nonexistent_conversation(self, client):
        resp = await client.get("/api/conversations/fake-id-999")
        assert resp.status_code == 200
        data = resp.json()
        assert "error" in data

    async def test_delete_nonexistent_conversation(self, client):
        resp = await client.delete("/api/conversations/fake-id-999")
        assert resp.status_code == 200
        data = resp.json()
        assert data["deleted"] is False

    async def test_conversation_crud(self, client):
        """Create a conversation via history module, then verify API returns it."""
        cid = "test-api-crud-1"
        save_message(cid, "user", "Test via API")
        save_message(cid, "assistant", "Response via API")

        # List should include it
        resp = await client.get("/api/conversations")
        data = resp.json()
        ids = [c["id"] for c in data]
        assert cid in ids

        # Get specific
        resp = await client.get(f"/api/conversations/{cid}")
        data = resp.json()
        assert data["id"] == cid
        assert len(data["messages"]) == 2

        # Delete
        resp = await client.delete(f"/api/conversations/{cid}")
        data = resp.json()
        assert data["deleted"] is True

        # Verify gone
        resp = await client.get(f"/api/conversations/{cid}")
        data = resp.json()
        assert data.get("error") or data is None


@pytest.mark.anyio
class TestStatsEndpoint:
    async def test_get_stats(self, client):
        resp = await client.get("/api/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert "total_conversations" in data
        assert "total_messages" in data
        assert "agents" in data
        assert "platforms" in data
        assert "recent_activity" in data
        assert isinstance(data["agents"], list)
        assert isinstance(data["platforms"], list)


@pytest.mark.anyio
class TestWebhookEndpoint:
    async def test_webhook_without_orchestrator(self, client):
        """When orchestrator is None, webhook should return queued or processed."""
        payload = {
            "eventType": "entityCreated",
            "entityType": "table",
            "entityFullyQualifiedName": "test.db.schema.mytable",
            "changeDescription": "New table created",
        }
        resp = await client.post("/api/webhooks/openmetadata", json=payload)
        assert resp.status_code in (200, 503)
        data = resp.json()
        assert data["status"] in ("processed", "queued", "error")

    async def test_webhook_invalid_json(self, client):
        resp = await client.post(
            "/api/webhooks/openmetadata",
            content="not json",
            headers={"content-type": "application/json"},
        )
        # FastAPI will return 400 for invalid JSON body
        assert resp.status_code in (400, 422)


@pytest.mark.anyio
class TestChatEndpoint:
    async def test_chat_returns_sse(self, client):
        """Chat endpoint should return SSE stream (event source)."""
        resp = await client.post(
            "/api/chat",
            json={"message": "Hello", "thread_id": "test-sse-1"},
        )
        # SSE responses come back as 200 with text/event-stream
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers.get("content-type", "")

    async def test_chat_stream_has_events(self, client):
        """Parse the SSE stream and verify it contains expected event types."""
        resp = await client.post(
            "/api/chat",
            json={"message": "Test", "thread_id": "test-sse-2"},
        )
        body = resp.text
        # SSE lines start with "data: "
        events = []
        for line in body.split("\n"):
            line = line.strip()
            if line.startswith("data: "):
                try:
                    events.append(json.loads(line[6:]))
                except json.JSONDecodeError:
                    pass

        # We should have at least thread_id and done events
        types = [e.get("type") for e in events]
        assert "thread_id" in types
        assert "done" in types
