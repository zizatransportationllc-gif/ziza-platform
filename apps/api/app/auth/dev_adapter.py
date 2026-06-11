"""DEV auth adapter — Sprint 2 → Sprint 47.

Signs/verifies JWTs with a local HMAC secret.
Four users are seeded; all share the same password (AUTH_DEV_PASSWORD).

Sprint 25 changes:
  - Access token TTL is now driven by ``jwt_access_ttl_min`` (default 15 min).
  - Added ``issue_for_user_id()`` for the refresh token rotation flow.
Sprint 47 changes:
  - Added professional@ziza.dev (role: professional) for Ziza Craft testing.

Never use this adapter in production.
"""
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import HTTPException, status

from app.auth.base import AuthAdapter, Claims
from app.config import settings

# ---------------------------------------------------------------------------
# Seeded users (dev only)
# ---------------------------------------------------------------------------
SEEDED_USERS: dict[str, dict[str, str]] = {
    "customer@ziza.dev":     {"user_id": "usr_001", "role": "customer"},
    "driver@ziza.dev":       {"user_id": "usr_002", "role": "driver"},
    "admin@ziza.dev":        {"user_id": "usr_003", "role": "admin"},
    "professional@ziza.dev": {"user_id": "usr_004", "role": "professional"},  # Sprint 47 — Ziza Craft
}

_ALGORITHM = "HS256"


class DevAdapter(AuthAdapter):
    """HMAC-signed JWT adapter for local development and CI."""

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _build_token(self, email: str, user: dict) -> str:
        now = datetime.now(timezone.utc)
        payload = {
            "sub": user["user_id"],
            "email": email,
            "role": user["role"],
            "provider": "dev",
            "iat": now,
            "exp": now + timedelta(minutes=settings.jwt_access_ttl_min),
        }
        return jwt.encode(payload, settings.auth_dev_secret, algorithm=_ALGORITHM)

    # ------------------------------------------------------------------
    # Token issuance (only called from POST /v1/token)
    # ------------------------------------------------------------------
    def issue(self, email: str, password: str) -> str:
        """Return a signed JWT for the given seeded user credentials."""
        if password != settings.auth_dev_password:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
            )
        user = SEEDED_USERS.get(email)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unknown user",
            )
        return self._build_token(email, user)

    def issue_raw(self, email: str, user_id: str, role: str) -> str:
        """Issue a JWT from explicit values — used for locally-created accounts.

        Called from POST /v1/auth/signup and the DB-fallback path in
        POST /v1/token.  No password check is performed here; the caller
        is responsible for validating credentials before calling this.
        """
        return self._build_token(email, {"user_id": user_id, "role": role})

    def issue_for_user_id(self, auth_user_id: str) -> str:
        """Return a new access token for a known auth_user_id.

        Called during the refresh token rotation flow — no password required
        because the caller already proved ownership via the refresh token.
        """
        for email, data in SEEDED_USERS.items():
            if data["user_id"] == auth_user_id:
                return self._build_token(email, data)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unknown user",
        )

    # ------------------------------------------------------------------
    # Token verification (called on every protected request)
    # ------------------------------------------------------------------
    def verify(self, token: str) -> Claims:
        try:
            payload = jwt.decode(
                token,
                settings.auth_dev_secret,
                algorithms=[_ALGORITHM],
            )
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token expired",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except jwt.InvalidTokenError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return Claims(
            user_id=payload["sub"],
            email=payload["email"],
            role=payload["role"],
            provider=payload["provider"],
        )


# Sprint 66 — l'adaptateur sert désormais de couche SESSION en dev ET en prod
# (le JWT maison authentifie chaque requête). Le nom « Dev » est conservé comme
# alias rétro-compatible pour les imports existants.
SessionJwtAdapter = DevAdapter
