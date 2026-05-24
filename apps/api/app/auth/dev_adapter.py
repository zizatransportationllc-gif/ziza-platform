"""DEV auth adapter — Sprint 2.

Signs/verifies JWTs with a local HMAC secret.
Three users are seeded; all share the same password (AUTH_DEV_PASSWORD).

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
    "customer@ziza.dev": {"user_id": "usr_001", "role": "customer"},
    "driver@ziza.dev":   {"user_id": "usr_002", "role": "driver"},
    "admin@ziza.dev":    {"user_id": "usr_003", "role": "admin"},
}

_ALGORITHM = "HS256"


class DevAdapter(AuthAdapter):
    """HMAC-signed JWT adapter for local development and CI."""

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
        now = datetime.now(timezone.utc)
        payload = {
            "sub": user["user_id"],
            "email": email,
            "role": user["role"],
            "provider": "dev",
            "iat": now,
            "exp": now + timedelta(hours=settings.auth_dev_token_ttl_hours),
        }
        return jwt.encode(payload, settings.auth_dev_secret, algorithm=_ALGORITHM)

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
