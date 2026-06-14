"""WalletTopup model — WS2 (Sprint 68).

A real wallet top-up: the customer pays via the payment provider (Stripe), and
the wallet is credited **only** when the provider confirms the payment via
webhook. Kept in its own table, isolated from trip ``payment_intents``.

Status flow: pending → paid | failed
Amounts are USD cents.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class WalletTopup(Base):
    """A pending/confirmed wallet top-up paid through the payment provider."""

    __tablename__ = "wallet_topups"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="USD")
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="mock")
    # Opaque provider reference used to match webhooks.
    provider_ref: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    # pending | paid | failed
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    checkout_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    def __repr__(self) -> str:
        return f"<WalletTopup id={self.id!r} status={self.status!r} amount={self.amount_cents}>"
