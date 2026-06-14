"""ProfessionalPayoutRequest model — Sprint 67.

A professional's request to withdraw accumulated craft earnings. Kept in a
dedicated table, fully isolated from the driver ``payout_requests`` flow.

Lifecycle: pending → approved | rejected → processed | failed  (admin action).
Amounts are stored in USD cents (``amount_cents``).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ProfessionalPayoutRequest(Base):
    """A professional's request to withdraw earnings (USD cents)."""

    __tablename__ = "professional_payout_requests"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    professional_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("professionals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    # pending | approved | rejected | processed | failed
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="pending", server_default="pending"
    )
    note_admin: Mapped[str | None] = mapped_column(Text, nullable=True)
    # WS3 (Sprint 68) — opaque reference of the executed Stripe transfer.
    provider_ref: Mapped[str | None] = mapped_column(String(128), nullable=True)
    processed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    def __repr__(self) -> str:
        return (
            f"<ProfessionalPayoutRequest id={self.id!r} "
            f"amount={self.amount_cents} status={self.status!r}>"
        )
