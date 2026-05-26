"""DriverLocation model — Sprint 22 (real-time GPS tracking)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class DriverLocation(Base):
    """Latest GPS position for a driver.

    One row per driver (upserted). Updated every time the driver pushes
    a new position.  Customers use it to compute ETA to the pickup point.
    """

    __tablename__ = "driver_locations"
    __table_args__ = (UniqueConstraint("driver_id", name="uq_driver_location_driver"),)

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    driver_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("drivers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )

    def __repr__(self) -> str:
        return f"<DriverLocation driver={self.driver_id!r} ({self.lat}, {self.lng})>"
