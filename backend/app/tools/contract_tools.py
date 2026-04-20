"""Data Contract tools — agent-callable wrappers around the Contract Copilot.

These LangChain tools let the orchestrator generate, publish, enforce, and
heal OpenMetadata Data Contracts as part of natural-language workflows.

Backed by ``app.core.contracts`` which talks to OM's ``/api/v1/dataContracts``
endpoint (with a graceful demo fallback when OM is offline).
"""

from __future__ import annotations

import json

from langchain_core.tools import tool

from app.core.contracts import (
    create_test_cases_for_contract,
    generate_contract,
    get_contract_status,
    propose_contract_fix,
    publish_contract,
)


def get_contract_tools() -> list:
    """Return all Data Contract LangChain tools."""
    return [
        generate_data_contract,
        publish_data_contract,
        create_contract_test_cases,
        get_data_contract_status,
        propose_contract_heal,
    ]


# ---------------------------------------------------------------------------
# Tool 1 — Generate
# ---------------------------------------------------------------------------


@tool
def generate_data_contract(entity_fqn: str, max_depth: int = 3) -> str:
    """Generate a Data Contract for an OpenMetadata entity.

    Walks the entity's upstream lineage, pulls profiler stats, and synthesizes
    a contract with: schema expectations, semantics rules, SLAs, and quality
    gates. Returns the contract as JSON (the YAML representation is also
    included for human review).

    Use this as the FIRST step of any Contract Copilot workflow. After
    review, pipe the resulting ``contract`` object into ``publish_data_contract``.

    Args:
        entity_fqn: Fully-qualified name of the target table (e.g.
            ``warehouse.analytics.daily_revenue``).
        max_depth: Lineage depth to walk upstream (default 3).
    """
    try:
        result = generate_contract(entity_fqn, max_depth=max_depth)
        # Compact form for the LLM — drop the verbose YAML
        compact = {
            "entity_fqn": result["entity_fqn"],
            "demo": result.get("demo", False),
            "narrative": result.get("narrative"),
            "stats": result.get("stats"),
            "contract": result["contract"],
        }
        return json.dumps(compact, indent=2, default=str)
    except Exception as exc:
        return f"Error generating contract for {entity_fqn}: {exc}"


# ---------------------------------------------------------------------------
# Tool 2 — Publish
# ---------------------------------------------------------------------------


@tool
def publish_data_contract(entity_fqn: str, contract_json: str) -> str:
    """Publish a generated Data Contract back to OpenMetadata.

    Pushes the contract to OM's ``/api/v1/dataContracts`` endpoint. If that
    endpoint is unavailable, falls back to attaching the contract as an
    extension on the table entity. The contract is created with status
    ``Draft``; promote it to ``Active`` from the OpenMetadata UI after review.

    Args:
        entity_fqn: Fully-qualified name of the target table.
        contract_json: JSON string of the contract dict (the ``contract``
            field returned by ``generate_data_contract``).
    """
    try:
        contract = json.loads(contract_json) if isinstance(contract_json, str) else contract_json
    except json.JSONDecodeError as exc:
        return f"Could not parse contract JSON: {exc}"
    try:
        result = publish_contract(entity_fqn, contract)
        return json.dumps(result, indent=2, default=str)
    except Exception as exc:
        return f"Error publishing contract for {entity_fqn}: {exc}"


# ---------------------------------------------------------------------------
# Tool 3 — Materialize the gates as real OM test cases
# ---------------------------------------------------------------------------


@tool
def create_contract_test_cases(entity_fqn: str, contract_json: str) -> str:
    """Create OpenMetadata test cases from a contract's quality gates.

    Each ``quality_gates`` entry in the contract is mapped to a
    ``testCase`` on the target table/column via the OM REST API. This makes
    the contract enforceable — when a test fails, the contract status flips
    to ``Violated`` and triggers the heal workflow.

    Args:
        entity_fqn: Fully-qualified name of the table the contract applies to.
        contract_json: JSON string of the contract dict.
    """
    try:
        contract = json.loads(contract_json) if isinstance(contract_json, str) else contract_json
    except json.JSONDecodeError as exc:
        return f"Could not parse contract JSON: {exc}"
    try:
        result = create_test_cases_for_contract(entity_fqn, contract)
        return json.dumps(result, indent=2, default=str)
    except Exception as exc:
        return f"Error creating test cases for {entity_fqn}: {exc}"


# ---------------------------------------------------------------------------
# Tool 4 — Status check
# ---------------------------------------------------------------------------


@tool
def get_data_contract_status(entity_fqn: str) -> str:
    """Get the current status of a Data Contract attached to an entity.

    Returns ``Draft`` / ``Active`` / ``Violated`` along with the most recent
    test pass/fail counts. Use this to monitor a contract before launching
    the heal workflow.

    Args:
        entity_fqn: Fully-qualified name of the table.
    """
    try:
        result = get_contract_status(entity_fqn)
        return json.dumps(result, indent=2, default=str)
    except Exception as exc:
        return f"Error fetching contract status for {entity_fqn}: {exc}"


# ---------------------------------------------------------------------------
# Tool 5 — Heal proposal
# ---------------------------------------------------------------------------


@tool
def propose_contract_heal(entity_fqn: str, violation_summary: str) -> str:
    """Propose a remediation for a Violated Data Contract.

    Given a violation summary (failing test names, drift details, etc.),
    drafts a proposed fix. The returned object includes:
    - ``diff`` — a human-readable description of the proposed change
    - ``patch_paths`` — files most likely to need editing (dbt model, schema)
    - ``ticket_draft`` — title / body suitable for a GitHub PR or Jira ticket

    Pipe ``ticket_draft`` into ``create_github_issue`` or ``create_jira_issue``
    to dispatch the fix.

    Args:
        entity_fqn: Fully-qualified name of the violated table.
        violation_summary: Plain-text description of what failed.
    """
    try:
        result = propose_contract_fix(entity_fqn, violation_summary)
        return json.dumps(result, indent=2, default=str)
    except Exception as exc:
        return f"Error proposing heal for {entity_fqn}: {exc}"
