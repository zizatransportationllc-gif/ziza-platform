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
from app.models.rating import Rating  # noqa: F401
from app.models.assistance import AssistanceRequest  # noqa: F401
from app.models.driver_capability import DriverCapability  # noqa: F401
from app.models.promo import PromoCode  # noqa: F401
from app.models.payout_request import PayoutRequest, CommissionSetting  # noqa: F401  — Sprint 29
from app.models.platform_setting import PlatformSetting  # noqa: F401
from app.models.driver_document import DriverDocument  # noqa: F401
from app.models.notification import Notification  # noqa: F401
from app.models.saved_place import SavedPlace  # noqa: F401
from app.models.driver_location import DriverLocation  # noqa: F401
from app.models.payment import PaymentIntent  # noqa: F401  — Sprint 24
from app.models.refresh_token import RefreshToken  # noqa: F401  — Sprint 25
from app.models.device_token import DeviceToken  # noqa: F401  — Sprint 26

__all__ = [
    "Base", "User", "Driver", "Vehicle", "Trip", "TripEvent", "Estimate",
    "Rating", "AssistanceRequest", "DriverCapability", "PromoCode",
    "PayoutRequest", "CommissionSetting", "PlatformSetting", "DriverDocument", "Notification",
    "SavedPlace", "DriverLocation", "PaymentIntent", "RefreshToken",
    "DeviceToken",
]
