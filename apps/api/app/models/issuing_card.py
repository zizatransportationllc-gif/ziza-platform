"""IssuingCard model — Sprint 70.

One Stripe Issuing debit card per payee (driver / professional), used to spend
the balance they accumulate in their Stripe Connect account.

One row per user (UNIQUE on user_id). Lifecycle: active ⇄ inactive.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class IssuingCard(Base):
    """A Stripe Issuing debit card owned by a driver or professional."""

    __tablename__ = "issuing_cards"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,   # one card per payee
        nullable=False,
        index=True,
    )
    # "driver" | "professional" — the role that owns this card.
    owner_role: Mapped[str] = mapped_column(String(16), nullable=False)

    stripe_cardholder_id: Mapped[str] = mapped_column(String(128), nullable=False)
    stripe_card_id: Mapped[str] = mapped_column(String(128), nullable=False)
    last4: Mapped[str | None] = mapped_column(String(4), nullable=True)
    # active | inactive
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    def __repr__(self) -> str:
        return f"<IssuingCard user_id={self.user_id!r} status={self.status!r}>"
