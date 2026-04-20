"""Functional verification of all MetaFlow features."""

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

passed = 0
failed = 0


def test(name, fn):
    global passed, failed
    print(f"\n[TEST] {name}")
    try:
        fn()
        passed += 1
        print("  PASS")
    except Exception as e:
        failed += 1
        print(f"  FAIL: {e}")


# ---- TEST 1 ----
def t1():
    from app.tools.insights_tools import get_insights_tools
    tools = get_insights_tools()
    names = sorted([t.name for t in tools])
    expected = sorted([
        "get_data_insights_summary", "get_entity_counts",
        "get_dq_summary", "get_ownership_coverage", "get_description_coverage",
    ])
    assert names == expected, f"Got {names}"
    for t in tools:
        assert callable(t.invoke), f"{t.name} not invocable"
    print(f"  5 tools: {names}")

test("insights_tools: 5 callable tools", t1)


# ---- TEST 2 ----
def t2():
    from app.agents import prompts
    prompt_names = [
        "ORCHESTRATOR_PROMPT", "DISCOVERY_PROMPT", "LINEAGE_PROMPT",
        "CURATOR_PROMPT", "DATA_QUALITY_PROMPT", "GOVERNANCE_PROMPT",
        "GITHUB_PROMPT", "SLACK_PROMPT", "GOOGLE_PROMPT", "EMAIL_PROMPT",
        "JIRA_PROMPT", "NOTION_PROMPT", "INSIGHTS_PROMPT",
    ]
    for pn in prompt_names:
        val = getattr(prompts, pn)
        assert len(val) > 100, f"{pn} too short ({len(val)})"
    total = sum(len(getattr(prompts, p)) for p in prompt_names)
    print(f"  13 prompts loaded ({total} total chars)")

test("prompts: all 13 exist and are substantial", t2)


# ---- TEST 3 ----
def t3():
    from app.agents.prompts import ORCHESTRATOR_PROMPT
    agent_names = [
        "discovery_agent", "lineage_agent", "curator_agent",
        "data_quality_agent", "governance_agent", "github_agent",
        "slack_agent", "google_agent", "email_agent", "jira_agent",
        "notion_agent", "insights_agent",
    ]
    missing = [a for a in agent_names if a not in ORCHESTRATOR_PROMPT]
    assert not missing, f"Missing from prompt: {missing}"
    print(f"  All 12 agent names found in orchestrator prompt")

test("ORCHESTRATOR_PROMPT routes to all 12 agents", t3)


# ---- TEST 4 ----
def t4():
    from app.agents.prompts import DATA_QUALITY_PROMPT
    checks = {
        "impact scoring": "Impact Score" in DATA_QUALITY_PROMPT or "impact_score" in DATA_QUALITY_PROMPT,
        "cause tree": "cause tree" in DATA_QUALITY_PROMPT.lower() or "cause_tree" in DATA_QUALITY_PROMPT,
        "severity": "Severity" in DATA_QUALITY_PROMPT,
    }
    for label, ok in checks.items():
        assert ok, f"Missing {label}"
    print(f"  Impact scoring + cause tree + severity all present")

test("DATA_QUALITY_PROMPT: enhanced with impact scoring", t4)


# ---- TEST 5 ----
def t5():
    from app.agents.prompts import INSIGHTS_PROMPT
    tool_names = [
        "get_data_insights_summary", "get_entity_counts", "get_dq_summary",
        "get_ownership_coverage", "get_description_coverage",
    ]
    missing = [t for t in tool_names if t not in INSIGHTS_PROMPT]
    assert not missing, f"Missing from prompt: {missing}"
    print(f"  All 5 tool names found in insights prompt")

test("INSIGHTS_PROMPT: describes all 5 tools", t5)


# ---- TEST 6 ----
def t6():
    from app.playbooks.registry import PLAYBOOKS
    assert len(PLAYBOOKS) == 13, f"Expected 13, got {len(PLAYBOOKS)}"
    print(f"  13 playbooks: {sorted(PLAYBOOKS.keys())}")

test("playbooks: exactly 13 in registry", t6)


# ---- TEST 7 ----
def t7():
    from app.playbooks.registry import PLAYBOOKS
    for pid in ["dq-test-recommender", "platform-health-kpi"]:
        pb = PLAYBOOKS[pid]
        assert hasattr(pb, "name"), f"{pid}: missing name"
        assert hasattr(pb, "steps"), f"{pid}: missing steps"
        step_count = len(pb.steps)
        assert step_count >= 3, f"{pid}: too few steps ({step_count})"
        for i, step in enumerate(pb.steps):
            assert hasattr(step, "instruction"), f"{pid} step {i}: missing instruction"
            assert hasattr(step, "description"), f"{pid} step {i}: missing description"
        print(f"  {pid}: {step_count} steps, name='{pb.name}'")

test("new playbooks: dq-test-recommender + platform-health-kpi", t7)


# ---- TEST 8 ----
def t8():
    from app.playbooks.registry import PLAYBOOKS
    # Playbook steps use instruction+description (no agent field).
    # The orchestrator's supervisor routes each instruction to the right agent.
    # Verify all steps have non-empty instruction and description.
    bad = []
    total_steps = 0
    for pid, pb in PLAYBOOKS.items():
        for i, step in enumerate(pb.steps):
            total_steps += 1
            if not step.instruction or not step.description:
                bad.append(f"{pid}/step{i}")
    assert not bad, f"Empty step fields: {bad}"
    print(f"  All {total_steps} steps across {len(PLAYBOOKS)} playbooks have instruction+description")

test("playbook steps have instruction+description", t8)


# ---- TEST 9 ----
def t9():
    from app.core.config import settings
    assert hasattr(settings, "ai_sdk_host"), "Missing ai_sdk_host"
    assert hasattr(settings, "ai_sdk_token"), "Missing ai_sdk_token"
    print(f"  ai_sdk_host={settings.ai_sdk_host}")

test("config: OM connection settings exist", t9)


# ---- TEST 10 ----
def t10():
    from app.tools.github_tools import get_github_tools
    from app.tools.slack_tools import get_slack_tools
    from app.tools.google_tools import get_google_tools
    from app.tools.email_tools import get_email_tools
    from app.tools.jira_tools import get_jira_tools
    from app.tools.notion_tools import get_notion_tools
    from app.tools.insights_tools import get_insights_tools
    counts = {}
    for name, fn in [
        ("github", get_github_tools), ("slack", get_slack_tools),
        ("google", get_google_tools), ("email", get_email_tools),
        ("jira", get_jira_tools), ("notion", get_notion_tools),
        ("insights", get_insights_tools),
    ]:
        t = fn()
        counts[name] = len(t)
    total = sum(counts.values())
    print(f"  {total} tools across 7 modules: {counts}")

test("cross-platform tools: all 7 modules load", t10)


# ---- TEST 11 ----
def t11():
    from app.schemas import ChatRequest, PlaybookRunRequest
    r = ChatRequest(message="test", thread_id=None)
    assert r.message == "test"
    pr = PlaybookRunRequest(playbook_id="test", user_input="test input")
    assert pr.playbook_id == "test"
    assert pr.user_input == "test input"
    print(f"  ChatRequest + PlaybookRunRequest instantiable")

test("schemas: request/response models", t11)


# ---- TEST 12 ----
def t12():
    from app.tools.insights_tools import get_insights_tools
    tools = get_insights_tools()
    tools_by_name = {t.name: t for t in tools}
    # These take database_filter param
    for tname in ["get_ownership_coverage", "get_description_coverage"]:
        t = tools_by_name[tname]
        schema = t.args_schema.model_json_schema()
        props = schema.get("properties", {})
        assert "database_filter" in props, f"{tname}: missing database_filter param"
        print(f"  {tname}: has database_filter param")
    # These have optional params only (days or no args)
    for tname in ["get_data_insights_summary", "get_entity_counts", "get_dq_summary"]:
        t = tools_by_name[tname]
        schema = t.args_schema.model_json_schema()
        props = list(schema.get("properties", {}).keys())
        print(f"  {tname}: params={props}")

test("insights_tools: tool arg schemas", t12)


# ---- TEST 13 ----
def t13():
    from app.playbooks.registry import PLAYBOOKS
    # Playbook steps don't have agent fields — the supervisor routes.
    # Instead verify instructions contain keywords that imply correct routing.
    pb = PLAYBOOKS["dq-test-recommender"]
    all_text = " ".join(s.instruction for s in pb.steps)
    assert "test" in all_text.lower(), "DQ Test Recommender should mention tests"
    assert "column" in all_text.lower(), "DQ Test Recommender should mention columns"
    print(f"  dq-test-recommender: {len(pb.steps)} steps, mentions tests+columns")

    pb2 = PLAYBOOKS["platform-health-kpi"]
    all_text2 = " ".join(s.instruction for s in pb2.steps)
    assert "coverage" in all_text2.lower() or "insights" in all_text2.lower(), \
        "Platform Health KPI should mention coverage/insights"
    print(f"  platform-health-kpi: {len(pb2.steps)} steps, mentions coverage/insights")

test("new playbooks have correct instruction content", t13)


# ---- TEST 14 ----
def t14():
    """Verify webhook handler references valid playbook IDs."""
    import ast
    with open("app/main.py") as f:
        source = f.read()
    # Check that dq-fire-drill and impact-radar are referenced
    assert "dq-fire-drill" in source, "Webhook doesn't reference dq-fire-drill"
    assert "impact-radar" in source, "Webhook doesn't reference impact-radar"
    # Verify those IDs exist in playbooks
    from app.playbooks.registry import PLAYBOOKS
    assert "dq-fire-drill" in PLAYBOOKS, "dq-fire-drill not in PLAYBOOKS"
    assert "impact-radar" in PLAYBOOKS, "impact-radar not in PLAYBOOKS"
    print(f"  Webhook references dq-fire-drill + impact-radar (both exist)")

test("webhook: auto-trigger playbook IDs valid", t14)


# ---- TEST 15 ----
def t15():
    """Verify main.py can be parsed and has required routes."""
    import ast
    with open("app/main.py") as f:
        tree = ast.parse(f.read())
    # Find all string constants in the source that look like route paths
    routes_found = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            if node.value.startswith("/"):
                routes_found.append(node.value)
    expected_routes = [
        "/api/chat", "/api/playbooks", "/api/playbooks/run",
        "/api/conversations", "/api/webhooks/openmetadata",
        "/api/stats", "/api/settings", "/health",
    ]
    for route in expected_routes:
        found = any(route in r for r in routes_found)
        assert found, f"Route {route} not found in main.py"
    print(f"  All {len(expected_routes)} API routes present: {expected_routes}")

test("main.py: all required API routes exist", t15)


# ========= SUMMARY =========
print("\n" + "=" * 60)
print(f"RESULTS: {passed} passed, {failed} failed out of {passed + failed}")
print("=" * 60)
if failed > 0:
    print("\n⚠ Some tests failed — see details above")
    sys.exit(1)
else:
    print("\n✅ All features verified successfully")
