"""PaymentIntent model — Sprint 24.

Tracks the lifecycle of a customer payment for a completed trip.

Status flow:  pending → paid | failed
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class PaymentIntent(Base):
    """A single payment request tied to one completed trip.

    Constraints:
      - One intent per trip (UNIQUE on trip_id).
      - If the first intent is already ``paid`` the endpoint returns the
        existing record (idempotence).
    """

    __tablename__ = "payment_intents"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    # Exactly one of trip_id / craft_request_id is set (a ride vs an assistance
    # job). Both nullable + unique so the same payment infra serves both.
    trip_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("trips.id", ondelete="CASCADE"),
        nullable=True,
        unique=True,   # one intent per trip
        index=True,
    )
    craft_request_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("craft_requests.id", ondelete="CASCADE"),
        nullable=True,
        unique=True,   # one intent per craft request
        index=True,
    )

    # Sprint 66: amounts are USD cents (field name kept as amount_cents until the
    # coordinated backend+frontend rename in Phase 3b).
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="USD")

    # "cinetpay" | "orange_money" | "stripe" | "mock"
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="mock")

    # Opaque reference from the payment provider (used to match webhooks).
    provider_ref: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)

    # pending | paid | failed | refunded
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")

    # URL the customer should visit to complete the payment.
    checkout_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    def __repr__(self) -> str:
        return f"<PaymentIntent id={self.id!r} status={self.status!r}>"
