"""Estimate model — Sprint 5."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Estimate(Base):
    """Persisted fare estimate.

    Created by POST /v1/estimate; referenced by POST /v1/trips (Sprint 6).
    Expires 15 minutes after creation — trips must be booked before expiry.
    """

    __tablename__ = "estimates"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # Auth user_id (not a FK — avoids requiring a users row in dev/test)
    user_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)

    origin_lat: Mapped[float] = mapped_column(Float, nullable=False)
    origin_lng: Mapped[float] = mapped_column(Float, nullable=False)
    dest_lat: Mapped[float] = mapped_column(Float, nullable=False)
    dest_lng: Mapped[float] = mapped_column(Float, nullable=False)

    distance_km: Mapped[float] = mapped_column(Float, nullable=False)
    duration_min: Mapped[int] = mapped_column(Integer, nullable=False)
    fare_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    surge_multiplier: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    # "mapbox" | "google_maps" | "haversine"
    distance_source: Mapped[str] = mapped_column(String(32), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    def __repr__(self) -> str:
        return f"<Estimate id={self.id!r} fare={self.fare_cents} XOF>"
