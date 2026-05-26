"""Trip and TripEvent models — Sprint 4 → Sprint 21."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Trip(Base):
    """A single ride request from a customer, potentially fulfilled by a driver.

    Lifecycle: pending → accepted → in_progress → completed | cancelled
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
    # pending | accepted | in_progress | completed | cancelled
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="pending", index=True
    )
    origin_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    origin_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    dest_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    dest_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Sprint 6: fare snapshot copied from the Estimate at booking time
    estimate_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    fare_xof: Mapped[int | None] = mapped_column(Integer, nullable=True)
    distance_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    duration_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Sprint 14: optional promo code applied at booking
    promo_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    discount_pct: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Sprint 21: vehicle category chosen at booking — economy | comfort | premium
    category: Mapped[str] = mapped_column(
        String(32), nullable=False, default="economy", server_default="economy"
    )
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
