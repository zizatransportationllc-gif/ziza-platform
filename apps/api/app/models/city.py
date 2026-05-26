"""City and ServiceZone models — Sprint 32.

City: a supported city with a center point and service radius.
ServiceZone: a named sub-zone within a city (GeoJSON polygon stored as text).
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
    country: Mapped[str] = mapped_column(String(64), nullable=False, default="Côte d'Ivoire")
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


# Default cities to seed on first use
DEFAULT_CITIES = [
    {
        "name": "Abidjan",
        "country": "Côte d'Ivoire",
        "center_lat": 5.3364,
        "center_lng": -4.0267,
        "radius_km": 40.0,
        "active": True,
    },
    {
        "name": "Bouaké",
        "country": "Côte d'Ivoire",
        "center_lat": 7.6906,
        "center_lng": -5.0298,
        "radius_km": 20.0,
        "active": False,  # not yet active
    },
    {
        "name": "Yamoussoukro",
        "country": "Côte d'Ivoire",
        "center_lat": 6.8276,
        "center_lng": -5.2893,
        "radius_km": 20.0,
        "active": False,  # not yet active
    },
]
