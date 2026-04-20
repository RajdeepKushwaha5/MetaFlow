"""OAuth 2.0 client-credentials helper for OpenMetadata MCP / REST.

OpenMetadata 1.x supports JWT bearer tokens (PATs) and — when configured
with an external OIDC provider (Okta, Auth0, Keycloak, Google) — the
standard ``client_credentials`` OAuth 2.0 grant for machine-to-machine
calls. This module abstracts both:

    Authorization: Bearer <token>

is built from EITHER:

  1. ``OM_OAUTH_TOKEN_URL`` + ``OM_OAUTH_CLIENT_ID`` + ``OM_OAUTH_CLIENT_SECRET``
     (preferred — short-lived tokens, automatic refresh), OR

  2. ``AI_SDK_TOKEN`` (legacy PAT — long-lived, no refresh).

All MetaFlow tool helpers go through :func:`build_auth_headers` so flipping
the org from PAT → OAuth is a config-only change.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Any

import httpx

from app.core.config import settings

_logger = logging.getLogger(__name__)

# Refresh tokens this many seconds before they actually expire.
_REFRESH_SKEW = 30

# Cached access token state. Thread-safe via _LOCK.
_token: str | None = None
_token_expiry: float = 0.0  # epoch seconds
_LOCK = threading.Lock()


def _oauth_configured() -> bool:
    return bool(
        settings.om_oauth_token_url
        and settings.om_oauth_client_id
        and settings.om_oauth_client_secret
    )


def _fetch_oauth_token() -> tuple[str, float]:
    """Run the client_credentials grant; return (token, expiry_epoch)."""
    data: dict[str, Any] = {
        "grant_type": "client_credentials",
        "client_id": settings.om_oauth_client_id,
        "client_secret": settings.om_oauth_client_secret,
    }
    if settings.om_oauth_scope:
        data["scope"] = settings.om_oauth_scope
    if settings.om_oauth_audience:
        data["audience"] = settings.om_oauth_audience

    resp = httpx.post(
        settings.om_oauth_token_url,
        data=data,
        timeout=15,
        headers={"Accept": "application/json"},
    )
    resp.raise_for_status()
    body = resp.json()
    access_token = body.get("access_token")
    if not access_token:
        raise RuntimeError(
            f"OAuth token endpoint returned no access_token: {body}"
        )
    expires_in = int(body.get("expires_in", 3600))
    return access_token, time.time() + max(60, expires_in - _REFRESH_SKEW)


def get_om_token() -> str:
    """Return a valid bearer token for OM, refreshing OAuth tokens as needed.

    Order of precedence:

    1. OAuth client_credentials (if configured) — auto-refreshed.
    2. Static PAT from ``AI_SDK_TOKEN``.
    3. Empty string (caller will send no Authorization header).
    """
    global _token, _token_expiry  # noqa: PLW0603

    if _oauth_configured():
        with _LOCK:
            if _token and time.time() < _token_expiry:
                return _token
            try:
                token, expiry = _fetch_oauth_token()
                _token, _token_expiry = token, expiry
                _logger.info(
                    "OAuth token refreshed; valid for %ds",
                    int(expiry - time.time()),
                )
                return _token
            except Exception as exc:
                _logger.warning(
                    "OAuth token fetch failed (%s); falling back to PAT", exc
                )

    return settings.ai_sdk_token or ""


def build_auth_headers(content_type: str | None = None) -> dict[str, str]:
    """Return Authorization + optional Content-Type headers for an OM call."""
    headers: dict[str, str] = {}
    token = get_om_token()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if content_type:
        headers["Content-Type"] = content_type
    return headers


def auth_status() -> dict[str, Any]:
    """Lightweight introspection used by ``GET /api/system/auth``."""
    if _oauth_configured():
        valid_for = max(0, int(_token_expiry - time.time())) if _token else 0
        return {
            "mode": "oauth2_client_credentials",
            "token_url": settings.om_oauth_token_url,
            "client_id": settings.om_oauth_client_id,
            "scope": settings.om_oauth_scope or None,
            "audience": settings.om_oauth_audience or None,
            "token_cached": bool(_token),
            "token_valid_for_seconds": valid_for,
        }
    return {
        "mode": "personal_access_token" if settings.ai_sdk_token else "anonymous",
        "token_present": bool(settings.ai_sdk_token),
    }


def reset_token_cache() -> None:
    """Force the next call to fetch a fresh OAuth token (used in tests)."""
    global _token, _token_expiry  # noqa: PLW0603
    with _LOCK:
        _token = None
        _token_expiry = 0.0
