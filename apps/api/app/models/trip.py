"""Trip and TripEvent models — Sprint 4."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Trip(Base):
    """A single ride request from a customer, potentially fulfilled by a driver.

    Lifecycle: requested → accepted → in_progress → completed | cancelled
    """

    __tablename__ = "trips"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    # Null until a driver accepts
    driver_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("drivers.id"), nullable=True, index=True
    )
    # requested | accepted | in_progress | completed | cancelled
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="requested", index=True
    )
    origin_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    origin_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    dest_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    dest_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    def __repr__(self) -> str:
        return f"<Trip id={self.id!r} status={self.status!r}>"


class TripEvent(Base):
    """Immutable audit log for each state change in a Trip.

    Append-only; never updated or deleted.
    """

    __tablename__ = "trip_events"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    trip_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("trips.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # e.g. "status_changed", "location_updated", "driver_assigned"
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    # Arbitrary JSON payload — structure depends on event_type
    data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )

    def __repr__(self) -> str:
        return f"<TripEvent trip={self.trip_id!r} type={self.event_type!r}>"
