"""Driver model — Sprint 4 → Sprint 23."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Driver(Base):
    """Driver profile linked to a User account.

    One-to-one with ``users``.  Created when a user with role="driver"
    completes on-boarding (Sprint 5+).
    """

    __tablename__ = "drivers"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    license_number: Mapped[str | None] = mapped_column(
        String(64), nullable=True
    )
    # active | inactive | suspended
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="active"
    )
    # Sprint 13 — online/offline presence toggle
    is_online: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0"
    )
    # Sprint 23 — denormalised live position snapshot (synced from driver_locations)
    current_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    current_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # WS3 (Sprint 68) — Stripe Connect (Express) account for real payouts.
    # NB: reused to hold the payee's provider account id (Stripe acct_… or Finix MU…).
    stripe_account_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # 2026-07 — payout provider the payee chose at onboarding ("stripe" | "finix").
    # Null → falls back to the global settings.payout_provider.
    payout_provider: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )

    def __repr__(self) -> str:
        return f"<Driver id={self.id!r} status={self.status!r} online={self.is_online!r}>"
