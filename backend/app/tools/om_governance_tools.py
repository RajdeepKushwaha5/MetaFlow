"""OpenMetadata Governance tools — natural-language governance-as-chat.

These LangChain tools let the agent swarm actually MUTATE OM's governance
state: create glossary terms, classifications, tags; set owners, tiers,
and apply tags to entities. This closes the loop from "AI suggests"
to "AI does" directly in OpenMetadata.

Every tool hits OM's native REST API — no MCP dependency required.
"""

from __future__ import annotations

import httpx
from langchain_core.tools import tool

from app.core.auth import build_auth_headers
from app.core.config import settings
from app.core.governance import patch_entity_description


def _om_base() -> str:
    return settings.ai_sdk_host.rstrip("/")


def _om_headers(content_type: str | None = None) -> dict[str, str]:
    return build_auth_headers(content_type)


def get_om_governance_tools() -> list:
    return [
        om_create_glossary,
        om_create_glossary_term,
        om_create_classification,
        om_create_tag,
        om_patch_entity_description,
        om_apply_tag_to_entity,
        om_set_entity_owner,
        om_set_entity_tier,
    ]


@tool
def om_create_glossary(name: str, description: str) -> str:
    """Create a new business glossary in OpenMetadata.

    Use before creating terms when the requested glossary does not already
    exist.

    Args:
        name: Glossary name.
        description: Business-friendly glossary purpose.
    """
    try:
        resp = httpx.post(
            f"{_om_base()}/api/v1/glossaries",
            headers=_om_headers("application/json"),
            json={
                "name": name,
                "displayName": name,
                "description": description,
            },
            timeout=10,
        )
        if resp.status_code >= 400:
            return f"Failed to create glossary '{name}': HTTP {resp.status_code} — {resp.text[:200]}"
        data = resp.json()
        return f"Created glossary '{name}' (id={data.get('id')})."
    except Exception as exc:
        return f"Error creating glossary: {exc}"


@tool
def om_create_glossary_term(glossary_name: str, term_name: str, description: str) -> str:
    """Create a business glossary term inside an existing OpenMetadata glossary.

    Use when the user asks to define a business concept, add a term to the
    glossary, or formalize vocabulary. The glossary itself must already exist.

    Args:
        glossary_name: Name (or FQN) of the parent glossary.
        term_name: Name of the new term.
        description: Business-friendly definition.
    """
    try:
        resp = httpx.post(
            f"{_om_base()}/api/v1/glossaryTerms",
            headers=_om_headers("application/json"),
            json={
                "name": term_name,
                "displayName": term_name,
                "description": description,
                "glossary": glossary_name,
            },
            timeout=10,
        )
        if resp.status_code >= 400:
            return f"Failed to create glossary term '{term_name}': HTTP {resp.status_code} — {resp.text[:200]}"
        data = resp.json()
        return f"Created glossary term '{term_name}' in '{glossary_name}' (id={data.get('id')})."
    except Exception as exc:
        return f"Error creating glossary term: {exc}"


@tool
def om_create_classification(name: str, description: str, mutually_exclusive: bool = False) -> str:
    """Create a new classification (a container for tags) in OpenMetadata.

    Use this when introducing a new governance dimension — e.g. 'PII',
    'Compliance', 'DataSensitivity'. Tags are created inside classifications.

    Args:
        name: Classification name (no spaces recommended).
        description: What this classification captures.
        mutually_exclusive: If true, an entity can carry at most one tag from this classification.
    """
    try:
        resp = httpx.post(
            f"{_om_base()}/api/v1/classifications",
            headers=_om_headers("application/json"),
            json={
                "name": name,
                "description": description,
                "mutuallyExclusive": mutually_exclusive,
            },
            timeout=10,
        )
        if resp.status_code >= 400:
            return f"Failed to create classification '{name}': HTTP {resp.status_code} — {resp.text[:200]}"
        data = resp.json()
        return f"Created classification '{name}' (id={data.get('id')})."
    except Exception as exc:
        return f"Error creating classification: {exc}"


@tool
def om_create_tag(classification_name: str, tag_name: str, description: str) -> str:
    """Create a new tag inside an existing classification.

    Args:
        classification_name: Name of the parent classification.
        tag_name: Name of the new tag.
        description: What this tag represents.
    """
    try:
        resp = httpx.post(
            f"{_om_base()}/api/v1/tags",
            headers=_om_headers("application/json"),
            json={
                "name": tag_name,
                "description": description,
                "classification": classification_name,
            },
            timeout=10,
        )
        if resp.status_code >= 400:
            return f"Failed to create tag '{tag_name}': HTTP {resp.status_code} — {resp.text[:200]}"
        data = resp.json()
        return f"Created tag '{classification_name}.{tag_name}' (id={data.get('id')})."
    except Exception as exc:
        return f"Error creating tag: {exc}"


def _patch_entity(entity_type: str, entity_fqn: str, patch: list[dict]) -> tuple[bool, str]:
    """JSON-Patch an OM entity by FQN."""
    try:
        # Fetch the entity to get its id
        lookup = httpx.get(
            f"{_om_base()}/api/v1/{entity_type}/name/{entity_fqn}",
            headers=_om_headers(),
            timeout=10,
        )
        if lookup.status_code >= 400:
            return False, f"Entity lookup failed: HTTP {lookup.status_code}"
        ent = lookup.json()

        resp = httpx.patch(
            f"{_om_base()}/api/v1/{entity_type}/{ent['id']}",
            headers=_om_headers("application/json-patch+json"),
            json=patch,
            timeout=10,
        )
        if resp.status_code >= 400:
            return False, f"Patch failed: HTTP {resp.status_code} — {resp.text[:200]}"
        return True, "Patched successfully."
    except Exception as exc:
        return False, f"Error: {exc}"


@tool
def om_patch_entity_description(entity_fqn: str, description: str, entity_type: str = "tables") -> str:
    """Patch an entity description in OpenMetadata.

    Args:
        entity_fqn: Fully-qualified name of the target entity.
        description: Description to write.
        entity_type: Plural entity type, e.g. 'tables', 'topics', 'dashboards'.
    """
    result = patch_entity_description(entity_fqn, description, entity_type)
    if result.get("ok"):
        return f"Updated description for {entity_fqn}. version={result.get('version')}"
    return f"Could not update description for {entity_fqn}. {result.get('reason')}: {result.get('detail')}"


@tool
def om_apply_tag_to_entity(entity_fqn: str, tag_fqn: str, entity_type: str = "tables") -> str:
    """Apply a tag (like 'PII.Sensitive' or 'Tier.Tier1') to a table or column.

    Args:
        entity_fqn: Fully-qualified name of the target entity.
        tag_fqn: Fully-qualified name of the tag (e.g. 'PII.Sensitive').
        entity_type: The plural entity type — 'tables', 'topics', 'dashboards', etc. Default 'tables'.
    """
    patch = [{
        "op": "add",
        "path": "/tags/-",
        "value": {"tagFQN": tag_fqn, "source": "Classification", "labelType": "Manual", "state": "Confirmed"},
    }]
    ok, msg = _patch_entity(entity_type, entity_fqn, patch)
    return f"{'Applied' if ok else 'Could not apply'} tag '{tag_fqn}' to {entity_fqn}. {msg}"


@tool
def om_set_entity_owner(entity_fqn: str, owner_email: str, entity_type: str = "tables") -> str:
    """Assign an owner (user) to an entity in OpenMetadata.

    Args:
        entity_fqn: Fully-qualified name of the target entity.
        owner_email: Email of the user to assign as owner.
        entity_type: The plural entity type (default 'tables').
    """
    try:
        user = httpx.get(
            f"{_om_base()}/api/v1/users/email/{owner_email}",
            headers=_om_headers(),
            timeout=10,
        )
        if user.status_code >= 400:
            return f"Could not resolve user by email '{owner_email}': HTTP {user.status_code}"
        user_data = user.json()
    except Exception as exc:
        return f"Error looking up user: {exc}"

    patch = [{
        "op": "add",
        "path": "/owners/-",
        "value": {"id": user_data["id"], "type": "user"},
    }]
    ok, msg = _patch_entity(entity_type, entity_fqn, patch)
    return f"{'Assigned' if ok else 'Could not assign'} owner '{owner_email}' to {entity_fqn}. {msg}"


@tool
def om_set_entity_tier(entity_fqn: str, tier: str, entity_type: str = "tables") -> str:
    """Set the criticality tier for an entity (Tier1 = most critical).

    Args:
        entity_fqn: Fully-qualified name of the target entity.
        tier: One of 'Tier1', 'Tier2', 'Tier3', 'Tier4', 'Tier5'.
        entity_type: The plural entity type (default 'tables').
    """
    tier_clean = tier.replace("Tier.", "").strip()
    if tier_clean not in {"Tier1", "Tier2", "Tier3", "Tier4", "Tier5"}:
        return f"Invalid tier '{tier}'. Must be one of Tier1..Tier5."

    patch = [{
        "op": "add",
        "path": "/tags/-",
        "value": {
            "tagFQN": f"Tier.{tier_clean}",
            "source": "Classification",
            "labelType": "Manual",
            "state": "Confirmed",
        },
    }]
    ok, msg = _patch_entity(entity_type, entity_fqn, patch)
    return f"{'Set' if ok else 'Could not set'} tier '{tier_clean}' on {entity_fqn}. {msg}"
