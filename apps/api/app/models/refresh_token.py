"""RefreshToken model — Sprint 25.

Stores the SHA-256 hash of opaque refresh tokens issued by POST /v1/token.
The raw token is never persisted; only its hash is stored here.

Lifecycle:
  active (revoked_at IS NULL, expires_at > now)
  → rotated  (revoked_at SET, new token issued)
  → expired  (expires_at < now)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class RefreshToken(Base):
    """One row per issued refresh token (append-only, never updated except revoke)."""

    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    # Auth-provider user_id (e.g. "usr_001" for dev, Firebase UID for prod).
    # Stored as VARCHAR — no FK to users.id so it works before /v1/auth/register.
    auth_user_id: Mapped[str] = mapped_column(
        String(128), nullable=False, index=True
    )

    # SHA-256(raw_token) — unique, never changes after issuance
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)

    # When this token stops being valid regardless of revocation
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    # Set when the token is consumed (rotation) or the user logs out
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )

    def __repr__(self) -> str:
        return (
            f"<RefreshToken user={self.auth_user_id!r} "
            f"revoked={self.revoked_at is not None}>"
        )
