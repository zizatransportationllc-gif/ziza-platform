"""PayoutRequest model — Sprint 15.

A driver requests withdrawal of accumulated earnings.
Admin approves or rejects the request.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class PayoutRequest(Base):
    """A driver's request to withdraw earnings.

    Lifecycle: pending → approved | rejected  (admin action).
    """

    __tablename__ = "payout_requests"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    driver_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("drivers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    amount_xof: Mapped[int] = mapped_column(Integer, nullable=False)
    # pending | approved | rejected
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="pending", server_default="pending"
    )
    # Optional admin note (reason for rejection, etc.)
    note_admin: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    def __repr__(self) -> str:
        return (
            f"<PayoutRequest id={self.id!r} amount={self.amount_xof} "
            f"status={self.status!r}>"
        )
