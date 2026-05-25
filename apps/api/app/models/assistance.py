"""Assistance request model — Sprint 9."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

ASSISTANCE_TYPES = frozenset({"breakdown", "flat_tyre", "tow", "fuel", "lockout"})


def _now() -> datetime:
    return datetime.now(timezone.utc)


class AssistanceRequest(Base):
    """Roadside assistance request submitted by a customer.

    State machine: pending → accepted → in_progress → resolved | cancelled
    """

    __tablename__ = "assistance_requests"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    driver_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("drivers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # One of ASSISTANCE_TYPES
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    # pending | accepted | in_progress | resolved | cancelled
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Estimated arrival time in minutes (set when driver accepts — Sprint 10)
    eta_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
