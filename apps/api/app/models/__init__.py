"""Model package — imports every model so they register with Base.metadata.

Import this package (or any individual model) before calling
``Base.metadata.create_all()`` or running Alembic migrations.
"""
from app.db import Base  # noqa: F401 — re-export for convenience
from app.models.user import User  # noqa: F401
from app.models.driver import Driver  # noqa: F401
from app.models.vehicle import Vehicle  # noqa: F401
from app.models.trip import Trip, TripEvent  # noqa: F401
from app.models.estimate import Estimate  # noqa: F401

__all__ = ["Base", "User", "Driver", "Vehicle", "Trip", "TripEvent", "Estimate"]
