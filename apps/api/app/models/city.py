"""City and ServiceZone models — Sprint 32 / Sprint 46 (US/NJ localization).

City: a supported city/state/country zone with a center point and service radius.
ServiceZone: a named sub-zone within a city (GeoJSON polygon stored as text).

zone_type values: "city" | "state" | "country"
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class City(Base):
    __tablename__ = "cities"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    country: Mapped[str] = mapped_column(String(64), nullable=False, default="United States")
    # zone_type: "city" | "state" | "country" — Sprint 46
    zone_type: Mapped[str] = mapped_column(String(16), nullable=False, default="city")
    center_lat: Mapped[float] = mapped_column(Float, nullable=False)
    center_lng: Mapped[float] = mapped_column(Float, nullable=False)
    radius_km: Mapped[float] = mapped_column(Float, nullable=False, default=30.0)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )

    zones: Mapped[list["ServiceZone"]] = relationship(
        "ServiceZone", back_populates="city", lazy="select"
    )


class ServiceZone(Base):
    __tablename__ = "service_zones"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    city_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    # GeoJSON polygon as text — used for display and future spatial queries
    polygon_geojson: Mapped[str | None] = mapped_column(Text, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )

    city: Mapped["City"] = relationship("City", back_populates="zones")


# ---------------------------------------------------------------------------
# Sprint 46 — Default zones: major New Jersey cities
# All inactive by default so zone enforcement stays OFF until the admin
# explicitly activates a zone (prevents accidental restriction on first deploy).
# ---------------------------------------------------------------------------
DEFAULT_CITIES = [
    {
        "name": "Newark",
        "country": "United States",
        "zone_type": "city",
        "center_lat": 40.7357,
        "center_lng": -74.1724,
        "radius_km": 15.0,
        "active": False,
    },
    {
        "name": "Jersey City",
        "country": "United States",
        "zone_type": "city",
        "center_lat": 40.7178,
        "center_lng": -74.0431,
        "radius_km": 12.0,
        "active": False,
    },
    {
        "name": "Trenton",
        "country": "United States",
        "zone_type": "city",
        "center_lat": 40.2206,
        "center_lng": -74.7597,
        "radius_km": 12.0,
        "active": False,
    },
    {
        "name": "Camden",
        "country": "United States",
        "zone_type": "city",
        "center_lat": 39.9259,
        "center_lng": -75.1196,
        "radius_km": 10.0,
        "active": False,
    },
    {
        "name": "Paterson",
        "country": "United States",
        "zone_type": "city",
        "center_lat": 40.9176,
        "center_lng": -74.1719,
        "radius_km": 10.0,
        "active": False,
    },
    {
        "name": "Elizabeth",
        "country": "United States",
        "zone_type": "city",
        "center_lat": 40.6640,
        "center_lng": -74.2107,
        "radius_km": 10.0,
        "active": False,
    },
    {
        "name": "Edison",
        "country": "United States",
        "zone_type": "city",
        "center_lat": 40.5187,
        "center_lng": -74.4121,
        "radius_km": 10.0,
        "active": False,
    },
    {
        "name": "Woodbridge",
        "country": "United States",
        "zone_type": "city",
        "center_lat": 40.5576,
        "center_lng": -74.2846,
        "radius_km": 10.0,
        "active": False,
    },
]
