"""DriverApplication model — Sprint 30.

Represents a user's application to become a driver.
State machine: submitted → under_review → approved | rejected
Approval automatically creates a Driver + Vehicle record.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


APPLICATION_STATUSES = frozenset(
    {"submitted", "under_review", "approved", "rejected"}
)


class DriverApplication(Base):
    __tablename__ = "driver_applications"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_driver_applications_user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Status
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="submitted")

    # Applicant personal info
    full_name: Mapped[str] = mapped_column(String(128), nullable=False)
    phone: Mapped[str] = mapped_column(String(32), nullable=False)
    license_number: Mapped[str] = mapped_column(String(64), nullable=False)

    # Vehicle info
    vehicle_make: Mapped[str] = mapped_column(String(64), nullable=False)
    vehicle_model: Mapped[str] = mapped_column(String(64), nullable=False)
    vehicle_plate: Mapped[str] = mapped_column(String(32), nullable=False)
    vehicle_year: Mapped[int] = mapped_column(Integer, nullable=False)
    vehicle_category: Mapped[str] = mapped_column(String(32), nullable=False, default="economy")

    # Admin review
    notes_admin: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Timestamps
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
