"""CRUD helpers — Sprint 4 → Sprint 24.

All functions are async and receive an ``AsyncSession`` from the FastAPI
``get_db`` dependency.
"""
from __future__ import annotations

import math
import uuid
from datetime import datetime, timedelta, timezone

import sqlalchemy as sa
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.base import Claims
from app.models.assistance import AssistanceRequest, ASSISTANCE_TYPES
from app.models.driver import Driver
from app.models.driver_capability import DriverCapability
from app.models.driver_document import DriverDocument, DOCUMENT_TYPES
from app.models.notification import Notification
from app.models.driver_location import DriverLocation
from app.models.payment import PaymentIntent
from app.models.saved_place import SavedPlace
from app.models.estimate import Estimate
from app.models.payout_request import PayoutRequest as PayoutRequestModel
from app.models.platform_setting import PlatformSetting
from app.models.promo import PromoCode
from app.models.rating import Rating
from app.models.trip import Trip, TripEvent
from app.models.user import User
from app.models.vehicle import Vehicle


# ---------------------------------------------------------------------------
# Sprint 21 — Vehicle category constants
# ---------------------------------------------------------------------------

VEHICLE_CATEGORIES = {"economy", "comfort", "premium"}

#: Fare multiplier applied on top of the base (economy) fare.
CATEGORY_MULTIPLIERS: dict[str, float] = {
    "economy": 1.0,
    "comfort": 1.4,
    "premium": 2.0,
}

CATEGORY_LABELS: dict[str, str] = {
    "economy": "Économique",
    "comfort": "Confort",
    "premium": "Premium",
}

CATEGORY_DESCRIPTIONS: dict[str, str] = {
    "economy": "Trajet standard au meilleur prix",
    "comfort": "Véhicule spacieux et climatisé",
    "premium": "Berline haut de gamme",
}


def _utc(dt: datetime) -> datetime:
    """Return dt as a tz-aware UTC datetime.

    SQLite stores DateTime(timezone=True) without the offset, so the value
    comes back as a naive datetime. PostgreSQL returns tz-aware datetimes.
    This helper normalises both cases so comparison with datetime.now(utc)
    always works.
    """
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# Notifications — Sprint 18 (internal helper, used by other CRUD functions)
# ---------------------------------------------------------------------------

async def _push_notification(
    db: AsyncSession,
    user_uuid: uuid.UUID,
    notif_type: str,
    title: str,
    body: str,
) -> None:
    """Insert a Notification row for the given users.id UUID.

    Fire-and-forget: errors are silently swallowed so they never break the
    parent transaction.  The caller must already have committed the triggering
    event before calling this.
    """
    try:
        notif = Notification(
            user_id=user_uuid,
            type=notif_type,
            title=title,
            body=body,
        )
        db.add(notif)
        await db.commit()
    except Exception:
        await db.rollback()


async def list_notifications(
    db: AsyncSession,
    auth_user_id: str,
    limit: int = 20,
    offset: int = 0,
) -> list[Notification]:
    """Return all notifications for the authenticated user, newest first."""
    user = await _get_user_by_auth_id(db, auth_user_id)
    if user is None:
        return []
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


async def get_unread_count(db: AsyncSession, auth_user_id: str) -> int:
    """Return the number of unread notifications for the authenticated user."""
    user = await _get_user_by_auth_id(db, auth_user_id)
    if user is None:
        return 0
    result = await db.execute(
        select(func.count(Notification.id))
        .where(Notification.user_id == user.id, Notification.read.is_(False))
    )
    return result.scalar() or 0


async def mark_all_notifications_read(db: AsyncSession, auth_user_id: str) -> int:
    """Mark every unread notification as read.  Returns the count marked."""
    user = await _get_user_by_auth_id(db, auth_user_id)
    if user is None:
        return 0
    result = await db.execute(
        sa.update(Notification)
        .where(Notification.user_id == user.id, Notification.read.is_(False))
        .values(read=True)
        .returning(Notification.id)
    )
    await db.commit()
    return len(result.all())


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

async def upsert_user(db: AsyncSession, claims: Claims) -> tuple[User, bool]:
    """Insert or update a ``User`` row from auth claims.

    Returns ``(user, created)`` where ``created=True`` if this is a brand-new
    row, ``False`` if an existing row was found (and potentially updated).
    """
    result = await db.execute(select(User).where(User.user_id == claims.user_id))
    user: User | None = result.scalar_one_or_none()

    if user is None:
        user = User(
            user_id=claims.user_id,
            email=claims.email,
            role=claims.role,
            provider=claims.provider,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user, True

    # --- existing user: sync any changed fields --------------------------
    changed = False
    if user.email != claims.email:
        user.email = claims.email
        changed = True
    if user.role != claims.role:
        user.role = claims.role
        changed = True
    if user.provider != claims.provider:
        user.provider = claims.provider
        changed = True

    if changed:
        user.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(user)

    return user, False


async def _get_user_by_auth_id(db: AsyncSession, auth_user_id: str) -> User | None:
    """Return a User row by auth user_id string (internal helper)."""
    result = await db.execute(select(User).where(User.user_id == auth_user_id))
    return result.scalar_one_or_none()


# ---------------------------------------------------------------------------
# Trips — Sprint 6
# ---------------------------------------------------------------------------

# Statuses from which a customer can cancel
_CANCELLABLE_STATUSES = frozenset({"pending", "accepted"})


async def create_trip(
    db: AsyncSession,
    claims: Claims,
    estimate_id: str,
    promo_code: str | None = None,
    category: str = "economy",
) -> Trip:
    """Create a new Trip from a valid, unexpired Estimate.

    The caller must already have a users row (call POST /v1/auth/register first).
    ``category`` selects the vehicle class (economy / comfort / premium) and
    applies the corresponding fare multiplier on top of the base estimate fare.
    Raises HTTPException on any validation failure.
    """
    if category not in VEHICLE_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid category '{category}'. Valid: {sorted(VEHICLE_CATEGORIES)}",
        )
    # 1. Resolve the caller's DB user row (need the UUID for the FK)
    user = await _get_user_by_auth_id(db, claims.user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found — call POST /v1/auth/register first",
        )

    # 2. Validate the estimate_id UUID format
    try:
        est_uuid = uuid.UUID(estimate_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid estimate_id format",
        )

    # 3. Load and validate the estimate
    est_result = await db.execute(select(Estimate).where(Estimate.id == est_uuid))
    est: Estimate | None = est_result.scalar_one_or_none()
    if est is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Estimate not found",
        )
    if est.user_id != claims.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Estimate belongs to another user",
        )
    if _utc(est.expires_at) < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Estimate has expired — request a new one",
        )

    # 4a. Apply category multiplier to the base economy fare (Sprint 21)
    cat_multiplier = CATEGORY_MULTIPLIERS[category]
    base_fare = max(1, round(est.fare_xof * cat_multiplier)) if est.fare_xof else est.fare_xof

    # 4b. Optionally validate and apply a promo code
    applied_promo: PromoCode | None = None
    applied_discount_pct: int | None = None
    final_fare = base_fare

    if promo_code:
        promo_result = await db.execute(
            select(PromoCode).where(PromoCode.code == promo_code.upper().strip())
        )
        promo: PromoCode | None = promo_result.scalar_one_or_none()
        if promo is None or not promo.active:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Promo code '{promo_code}' is invalid or inactive",
            )
        if promo.expires_at is not None and _utc(promo.expires_at) < datetime.now(timezone.utc):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Promo code '{promo_code}' has expired",
            )
        if promo.max_uses is not None and promo.uses >= promo.max_uses:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Promo code '{promo_code}' has reached its usage limit",
            )
        applied_promo = promo
        applied_discount_pct = promo.discount_pct
        if final_fare is not None:
            final_fare = max(1, round(final_fare * (1 - promo.discount_pct / 100)))

    # 5. Create the trip, snapshotting the fare from the estimate
    trip = Trip(
        customer_id=user.id,
        status="pending",
        origin_lat=est.origin_lat,
        origin_lng=est.origin_lng,
        dest_lat=est.dest_lat,
        dest_lng=est.dest_lng,
        estimate_id=est.id,
        fare_xof=final_fare,
        distance_km=est.distance_km,
        duration_min=est.duration_min,
        promo_code=promo_code.upper().strip() if promo_code else None,
        discount_pct=applied_discount_pct,
        category=category,
    )
    db.add(trip)
    await db.flush()  # populate trip.id without committing yet

    # 6. Increment promo usage (after flush so trip.id is available)
    if applied_promo is not None:
        applied_promo.uses += 1

    # 7. Log the initial status_changed event
    event = TripEvent(
        trip_id=trip.id,
        event_type="status_changed",
        data={"from": None, "to": "pending"},
        actor="customer",
    )
    db.add(event)
    await db.commit()
    await db.refresh(trip)
    return trip


async def get_trip(
    db: AsyncSession,
    trip_id: str,
    auth_user_id: str,
) -> tuple[Trip, list[TripEvent]]:
    """Return a trip + its ordered events, verified to belong to the caller."""
    try:
        trip_uuid = uuid.UUID(trip_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid trip_id format",
        )

    trip_result = await db.execute(select(Trip).where(Trip.id == trip_uuid))
    trip: Trip | None = trip_result.scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found")

    # Verify ownership via the users table
    user = await _get_user_by_auth_id(db, auth_user_id)
    if user is None or trip.customer_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your trip")

    events_result = await db.execute(
        select(TripEvent)
        .where(TripEvent.trip_id == trip.id)
        .order_by(TripEvent.created_at)
    )
    events = list(events_result.scalars().all())
    return trip, events


async def list_trips(
    db: AsyncSession,
    auth_user_id: str,
    limit: int = 50,
    offset: int = 0,
) -> list[Trip]:
    """Return all trips for the authenticated customer, newest first."""
    user = await _get_user_by_auth_id(db, auth_user_id)
    if user is None:
        return []

    result = await db.execute(
        select(Trip)
        .where(Trip.customer_id == user.id)
        .order_by(Trip.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


async def cancel_trip(
    db: AsyncSession,
    trip_id: str,
    auth_user_id: str,
) -> Trip:
    """Cancel a trip (customer action).

    Only allowed from 'pending' or 'accepted' status.
    Raises 409 for trips that are in_progress, completed, or already cancelled.
    """
    trip, _ = await get_trip(db, trip_id, auth_user_id)

    if trip.status not in _CANCELLABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot cancel a trip in '{trip.status}' status",
        )

    prev_status = trip.status
    trip.status = "cancelled"
    trip.updated_at = datetime.now(timezone.utc)

    event = TripEvent(
        trip_id=trip.id,
        event_type="status_changed",
        data={"from": prev_status, "to": "cancelled"},
        actor="customer",
    )
    db.add(event)
    await db.commit()
    await db.refresh(trip)
    return trip


# ---------------------------------------------------------------------------
# Drivers — Sprint 7
# ---------------------------------------------------------------------------

async def upsert_driver(db: AsyncSession, claims: Claims) -> tuple[Driver, bool]:
    """Create or return the Driver profile for an authenticated driver user.

    The user row must already exist (call POST /v1/auth/register first).
    Returns ``(driver, created)`` — idempotent.
    """
    user = await _get_user_by_auth_id(db, claims.user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found — call POST /v1/auth/register first",
        )

    result = await db.execute(select(Driver).where(Driver.user_id == user.id))
    driver: Driver | None = result.scalar_one_or_none()
    if driver is not None:
        return driver, False

    driver = Driver(user_id=user.id, status="active")
    db.add(driver)
    await db.commit()
    await db.refresh(driver)
    return driver, True


async def _get_driver_by_auth_id(db: AsyncSession, auth_user_id: str) -> Driver | None:
    """Internal: look up Driver row via auth user_id string."""
    user = await _get_user_by_auth_id(db, auth_user_id)
    if user is None:
        return None
    result = await db.execute(select(Driver).where(Driver.user_id == user.id))
    return result.scalar_one_or_none()


# ---------------------------------------------------------------------------
# Trip state transitions — driver side (Sprint 7)
# ---------------------------------------------------------------------------

async def list_available_trips(
    db: AsyncSession, auth_user_id: str | None = None
) -> list[Trip]:
    """All pending trips for the driver marketplace.

    Sprint 23: if the authenticated driver has a known current position
    (``drivers.current_lat/lng``), the list is sorted by ascending haversine
    distance between the trip origin and the driver's position.
    Falls back to newest-first when no position is available.
    """
    result = await db.execute(
        select(Trip)
        .where(Trip.status == "pending")
        .order_by(Trip.created_at.desc())
    )
    trips = list(result.scalars().all())

    if auth_user_id is not None:
        driver = await _get_driver_by_auth_id(db, auth_user_id)
        if (
            driver is not None
            and getattr(driver, "current_lat", None) is not None
            and getattr(driver, "current_lng", None) is not None
        ):
            d_lat = driver.current_lat
            d_lng = driver.current_lng
            trips.sort(
                key=lambda t: _haversine_km(
                    d_lat, d_lng,
                    t.origin_lat or 0.0,
                    t.origin_lng or 0.0,
                )
            )

    return trips


async def get_driver_active_trip(db: AsyncSession, auth_user_id: str) -> Trip | None:
    """Return the driver's current trip in accepted or in_progress state."""
    driver = await _get_driver_by_auth_id(db, auth_user_id)
    if driver is None:
        return None
    result = await db.execute(
        select(Trip)
        .where(
            Trip.driver_id == driver.id,
            Trip.status.in_(["accepted", "in_progress"]),
        )
        .order_by(Trip.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


def _require_driver(driver: Driver | None) -> Driver:
    """Raise if driver is None or inactive."""
    if driver is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver profile not found — call POST /v1/drivers/register first",
        )
    if driver.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Driver account is not active",
        )
    return driver


async def _load_trip_for_driver(db: AsyncSession, trip_id: str, driver: Driver) -> Trip:
    """Load a trip and verify it is owned by this driver."""
    try:
        trip_uuid = uuid.UUID(trip_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid trip_id format",
        )
    result = await db.execute(select(Trip).where(Trip.id == trip_uuid))
    trip: Trip | None = result.scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found")
    if trip.driver_id != driver.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your trip")
    return trip


async def accept_trip(db: AsyncSession, trip_id: str, auth_user_id: str) -> Trip:
    """Driver accepts a pending trip → accepted.  Sets trip.driver_id."""
    driver = _require_driver(await _get_driver_by_auth_id(db, auth_user_id))

    try:
        trip_uuid = uuid.UUID(trip_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid trip_id format",
        )
    result = await db.execute(select(Trip).where(Trip.id == trip_uuid))
    trip: Trip | None = result.scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found")
    if trip.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Trip is not available (status: {trip.status})",
        )

    trip.status = "accepted"
    trip.driver_id = driver.id
    trip.updated_at = datetime.now(timezone.utc)
    db.add(TripEvent(
        trip_id=trip.id,
        event_type="status_changed",
        data={"from": "pending", "to": "accepted", "driver_id": str(driver.id)},
        actor="driver",
    ))
    await db.commit()
    await db.refresh(trip)
    # Sprint 18: notify the customer
    await _push_notification(
        db, trip.customer_id,
        "trip_accepted",
        "🚗 Chauffeur en route",
        "Un chauffeur a accepté votre course. Il arrive bientôt !",
    )
    return trip


async def start_trip(db: AsyncSession, trip_id: str, auth_user_id: str) -> Trip:
    """Driver starts an accepted trip → in_progress."""
    driver = _require_driver(await _get_driver_by_auth_id(db, auth_user_id))
    trip = await _load_trip_for_driver(db, trip_id, driver)
    if trip.status != "accepted":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot start a trip in '{trip.status}' status",
        )

    trip.status = "in_progress"
    trip.updated_at = datetime.now(timezone.utc)
    db.add(TripEvent(
        trip_id=trip.id,
        event_type="status_changed",
        data={"from": "accepted", "to": "in_progress"},
        actor="driver",
    ))
    await db.commit()
    await db.refresh(trip)
    return trip


async def complete_trip(db: AsyncSession, trip_id: str, auth_user_id: str) -> Trip:
    """Driver completes an in_progress trip → completed."""
    driver = _require_driver(await _get_driver_by_auth_id(db, auth_user_id))
    trip = await _load_trip_for_driver(db, trip_id, driver)
    if trip.status != "in_progress":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot complete a trip in '{trip.status}' status",
        )

    trip.status = "completed"
    trip.updated_at = datetime.now(timezone.utc)
    db.add(TripEvent(
        trip_id=trip.id,
        event_type="status_changed",
        data={"from": "in_progress", "to": "completed"},
        actor="driver",
    ))
    await db.commit()
    await db.refresh(trip)
    # Sprint 18: notify the customer
    fare_str = f" — {trip.fare_xof:,} XOF".replace(",", " ") if trip.fare_xof else ""
    await _push_notification(
        db, trip.customer_id,
        "trip_completed",
        "✅ Trajet terminé",
        f"Votre course est terminée{fare_str}. Merci d'avoir choisi Ziza !",
    )
    return trip


# ---------------------------------------------------------------------------
# Ratings � Sprint 8
# ---------------------------------------------------------------------------

async def create_rating(
    db: AsyncSession,
    claims: Claims,
    trip_id: str,
    stars: int,
    comment: str | None,
) -> Rating:
    """Customer submits a 1-5 star rating for a completed trip.

    Validates: trip exists, customer owns it, trip is completed,
    not already rated.
    """
    try:
        trip_uuid = uuid.UUID(trip_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid trip_id format",
        )

    trip_result = await db.execute(select(Trip).where(Trip.id == trip_uuid))
    trip: Trip | None = trip_result.scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found")

    user = await _get_user_by_auth_id(db, claims.user_id)
    if user is None or trip.customer_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your trip")

    if trip.status != "completed":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Only completed trips can be rated (current status: {trip.status})",
        )
    if trip.driver_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Trip has no assigned driver",
        )

    # Check for duplicate rating
    existing = await db.execute(select(Rating).where(Rating.trip_id == trip_uuid))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Trip already rated",
        )

    rating = Rating(
        trip_id=trip.id,
        driver_id=trip.driver_id,
        customer_id=user.id,
        stars=stars,
        comment=comment,
    )
    db.add(rating)
    await db.commit()
    await db.refresh(rating)
    return rating


async def get_trip_rating(db: AsyncSession, trip_id: str) -> Rating | None:
    """Return the Rating for a trip, or None if not yet rated."""
    try:
        trip_uuid = uuid.UUID(trip_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid trip_id format",
        )
    result = await db.execute(select(Rating).where(Rating.trip_id == trip_uuid))
    return result.scalar_one_or_none()


# ---------------------------------------------------------------------------
# Assistance — Sprint 9
# ---------------------------------------------------------------------------

_ASSISTANCE_CANCELLABLE = frozenset({"pending"})


async def create_assistance_request(
    db: AsyncSession,
    claims: Claims,
    req_type: str,
    lat: float,
    lng: float,
    note: str | None,
) -> AssistanceRequest:
    """Create a new roadside assistance request for the authenticated customer.

    Raises 422 if the type is not one of the allowed values.
    """
    user = await _get_user_by_auth_id(db, claims.user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found - call POST /v1/auth/register first",
        )

    if req_type not in ASSISTANCE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid type '{req_type}'. Must be one of: {sorted(ASSISTANCE_TYPES)}",
        )

    req = AssistanceRequest(
        customer_id=user.id,
        type=req_type,
        status="pending",
        lat=lat,
        lng=lng,
        note=note,
    )
    db.add(req)
    await db.commit()
    await db.refresh(req)
    return req


async def get_assistance_request(
    db: AsyncSession,
    req_id: str,
    auth_user_id: str,
) -> AssistanceRequest:
    """Return an assistance request, verified to belong to the calling customer."""
    try:
        req_uuid = uuid.UUID(req_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid request_id format",
        )

    result = await db.execute(
        select(AssistanceRequest).where(AssistanceRequest.id == req_uuid)
    )
    req: AssistanceRequest | None = result.scalar_one_or_none()
    if req is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assistance request not found",
        )

    user = await _get_user_by_auth_id(db, auth_user_id)
    if user is None or req.customer_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not your request",
        )

    return req


async def cancel_assistance(
    db: AsyncSession,
    req_id: str,
    auth_user_id: str,
) -> AssistanceRequest:
    """Customer cancels a pending assistance request.

    Only allowed from 'pending' status. Raises 409 otherwise.
    """
    req = await get_assistance_request(db, req_id, auth_user_id)

    if req.status not in _ASSISTANCE_CANCELLABLE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot cancel a request in '{req.status}' status",
        )

    req.status = "cancelled"
    req.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(req)
    return req


async def list_available_assistance(
    db: AsyncSession, auth_user_id: str | None = None
) -> list[AssistanceRequest]:
    """All pending assistance requests, filtered by driver capabilities if set.

    If ``auth_user_id`` is provided and the driver has declared capabilities,
    only requests of matching types are returned.
    Empty capabilities = no filter (driver handles all types).
    """
    query = (
        select(AssistanceRequest)
        .where(AssistanceRequest.status == "pending")
        .order_by(AssistanceRequest.created_at.desc())
    )

    if auth_user_id is not None:
        driver = await _get_driver_by_auth_id(db, auth_user_id)
        if driver is not None:
            caps_result = await db.execute(
                select(DriverCapability.type).where(
                    DriverCapability.driver_id == driver.id
                )
            )
            caps = list(caps_result.scalars().all())
            if caps:  # non-empty → filter by declared capabilities
                query = query.where(AssistanceRequest.type.in_(caps))

    result = await db.execute(query)
    return list(result.scalars().all())


async def get_driver_active_assistance(
    db: AsyncSession, auth_user_id: str
) -> AssistanceRequest | None:
    """Return the driver's current assistance request in accepted or in_progress state."""
    driver = await _get_driver_by_auth_id(db, auth_user_id)
    if driver is None:
        return None
    result = await db.execute(
        select(AssistanceRequest)
        .where(
            AssistanceRequest.driver_id == driver.id,
            AssistanceRequest.status.in_(["accepted", "in_progress"]),
        )
        .order_by(AssistanceRequest.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _load_assistance_for_driver(
    db: AsyncSession, req_id: str, driver: Driver
) -> AssistanceRequest:
    """Load an assistance request and verify it is assigned to this driver."""
    try:
        req_uuid = uuid.UUID(req_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid request_id format",
        )

    result = await db.execute(
        select(AssistanceRequest).where(AssistanceRequest.id == req_uuid)
    )
    req: AssistanceRequest | None = result.scalar_one_or_none()
    if req is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assistance request not found",
        )
    if req.driver_id != driver.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not your request",
        )
    return req


async def accept_assistance(
    db: AsyncSession, req_id: str, auth_user_id: str
) -> AssistanceRequest:
    """Driver accepts a pending assistance request → accepted.  Sets driver_id."""
    driver = _require_driver(await _get_driver_by_auth_id(db, auth_user_id))

    try:
        req_uuid = uuid.UUID(req_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid request_id format",
        )

    result = await db.execute(
        select(AssistanceRequest).where(AssistanceRequest.id == req_uuid)
    )
    req: AssistanceRequest | None = result.scalar_one_or_none()
    if req is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assistance request not found",
        )
    if req.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Assistance request is not available (status: {req.status})",
        )

    req.status = "accepted"
    req.driver_id = driver.id
    req.updated_at = datetime.now(timezone.utc)
    # Sprint 23: use driver's real position when available; fall back to city centre
    d_lat = getattr(driver, "current_lat", None) or _ABIDJAN_LAT
    d_lng = getattr(driver, "current_lng", None) or _ABIDJAN_LNG
    req.eta_min = _compute_eta_min(d_lat, d_lng, req.lat, req.lng)
    await db.commit()
    await db.refresh(req)
    return req


async def start_assistance(
    db: AsyncSession, req_id: str, auth_user_id: str
) -> AssistanceRequest:
    """Driver starts an accepted assistance request → in_progress."""
    driver = _require_driver(await _get_driver_by_auth_id(db, auth_user_id))
    req = await _load_assistance_for_driver(db, req_id, driver)

    if req.status != "accepted":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot start a request in '{req.status}' status",
        )

    req.status = "in_progress"
    req.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(req)
    return req


async def resolve_assistance(
    db: AsyncSession, req_id: str, auth_user_id: str
) -> AssistanceRequest:
    """Driver resolves an in_progress assistance request → resolved."""
    driver = _require_driver(await _get_driver_by_auth_id(db, auth_user_id))
    req = await _load_assistance_for_driver(db, req_id, driver)

    if req.status != "in_progress":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot resolve a request in '{req.status}' status",
        )

    req.status = "resolved"
    req.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(req)
    return req


async def get_driver_rating_stats(
    db: AsyncSession,
    auth_user_id: str,
) -> tuple[float | None, int]:
    """Return (average_stars, total_ratings) for the authenticated driver.

    Returns (None, 0) when no ratings exist yet.
    """
    driver = await _get_driver_by_auth_id(db, auth_user_id)
    if driver is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver profile not found - call POST /v1/drivers/register first",
        )

    result = await db.execute(
        select(func.avg(Rating.stars), func.count(Rating.id))
        .where(Rating.driver_id == driver.id)
    )
    row = result.one()
    avg = float(row[0]) if row[0] is not None else None
    count = row[1]
    return avg, count


# ---------------------------------------------------------------------------
# Driver Capabilities — Sprint 10
# ---------------------------------------------------------------------------

# Abidjan city centre used as the default dispatch origin for ETA calculation
_ABIDJAN_LAT: float = 5.345317
_ABIDJAN_LNG: float = -4.024429


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Return great-circle distance in km between two WGS-84 coordinates."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _compute_eta_min(
    driver_lat: float, driver_lng: float, req_lat: float, req_lng: float
) -> int:
    """Estimated arrival time: 30 km/h average + 5 min base, minimum 5 min."""
    dist_km = _haversine_km(driver_lat, driver_lng, req_lat, req_lng)
    return max(5, round(dist_km / 30 * 60) + 5)


async def get_driver_capabilities(
    db: AsyncSession, auth_user_id: str
) -> list[str]:
    """Return the list of assistance types the driver has declared.

    Empty list means no filter — driver sees all pending requests.
    """
    driver = await _get_driver_by_auth_id(db, auth_user_id)
    if driver is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver profile not found - call POST /v1/drivers/register first",
        )
    result = await db.execute(
        select(DriverCapability.type).where(
            DriverCapability.driver_id == driver.id
        )
    )
    return sorted(result.scalars().all())


async def set_driver_capabilities(
    db: AsyncSession, auth_user_id: str, types: list[str]
) -> list[str]:
    """Replace the driver's capability set with the given list.

    Validates all types against ASSISTANCE_TYPES.
    Empty list = clears filter (driver handles all types).
    Returns the new sorted capability list.
    """
    driver = await _get_driver_by_auth_id(db, auth_user_id)
    if driver is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver profile not found - call POST /v1/drivers/register first",
        )

    invalid = [t for t in types if t not in ASSISTANCE_TYPES]
    if invalid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid types: {invalid}. Must be from: {sorted(ASSISTANCE_TYPES)}",
        )

    # Replace all capabilities atomically
    await db.execute(
        sa.delete(DriverCapability).where(DriverCapability.driver_id == driver.id)
    )
    unique_types = list(set(types))
    for t in unique_types:
        db.add(DriverCapability(driver_id=driver.id, type=t))
    await db.commit()
    return sorted(unique_types)


async def admin_list_drivers(db: AsyncSession) -> list[dict]:
    """Return all driver profiles with user info and capabilities (admin view)."""
    result = await db.execute(
        select(Driver, User)
        .join(User, Driver.user_id == User.id)
        .order_by(Driver.created_at.desc())
    )
    rows = result.all()

    out = []
    for driver, user in rows:
        caps_result = await db.execute(
            select(DriverCapability.type).where(
                DriverCapability.driver_id == driver.id
            )
        )
        capabilities = sorted(caps_result.scalars().all())
        # Sprint 15: include avg rating stats
        rating_result = await db.execute(
            select(func.avg(Rating.stars), func.count(Rating.id))
            .where(Rating.driver_id == driver.id)
        )
        r_row = rating_result.one()
        avg_rating = round(float(r_row[0]), 2) if r_row[0] is not None else None
        total_ratings = r_row[1]
        out.append({
            "driver_id": str(driver.id),
            "user_id": user.user_id,
            "email": user.email,
            "status": driver.status,
            "license_number": driver.license_number,
            "capabilities": capabilities,
            "avg_rating": avg_rating,
            "total_ratings": total_ratings,
            "created_at": driver.created_at.isoformat(),
        })
    return out


async def admin_set_driver_capabilities(
    db: AsyncSession, driver_id_str: str, types: list[str]
) -> list[str]:
    """Admin replaces capabilities for any driver (identified by UUID string).

    Returns the new sorted capability list.
    """
    try:
        driver_uuid = uuid.UUID(driver_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid driver_id format",
        )

    result = await db.execute(select(Driver).where(Driver.id == driver_uuid))
    driver: Driver | None = result.scalar_one_or_none()
    if driver is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver not found",
        )

    invalid = [t for t in types if t not in ASSISTANCE_TYPES]
    if invalid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid types: {invalid}. Must be from: {sorted(ASSISTANCE_TYPES)}",
        )

    await db.execute(
        sa.delete(DriverCapability).where(DriverCapability.driver_id == driver.id)
    )
    unique_types_admin = list(set(types))
    for t in unique_types_admin:
        db.add(DriverCapability(driver_id=driver.id, type=t))
    await db.commit()
    return sorted(unique_types_admin)


# ---------------------------------------------------------------------------
# Driver Earnings — Sprint 11
# ---------------------------------------------------------------------------

async def get_driver_earnings(db: AsyncSession, auth_user_id: str) -> dict:
    """Return an earnings summary for the authenticated driver.

    Includes total, today (UTC), current week (Mon–Sun), and the 10 most
    recent completed trips.
    """
    driver = await _get_driver_by_auth_id(db, auth_user_id)
    if driver is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver profile not found - call POST /v1/drivers/register first",
        )

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())  # Monday

    def _sum_count(row) -> tuple[int, int]:
        return (int(row[0]) if row[0] is not None else 0, row[1])

    # All-time
    r_total = await db.execute(
        select(func.sum(Trip.fare_xof), func.count(Trip.id))
        .where(Trip.driver_id == driver.id, Trip.status == "completed")
    )
    total_xof, total_trips = _sum_count(r_total.one())

    # Today
    r_today = await db.execute(
        select(func.sum(Trip.fare_xof), func.count(Trip.id))
        .where(
            Trip.driver_id == driver.id,
            Trip.status == "completed",
            Trip.updated_at >= today_start,
        )
    )
    today_xof, today_trips = _sum_count(r_today.one())

    # This week
    r_week = await db.execute(
        select(func.sum(Trip.fare_xof), func.count(Trip.id))
        .where(
            Trip.driver_id == driver.id,
            Trip.status == "completed",
            Trip.updated_at >= week_start,
        )
    )
    week_xof, week_trips = _sum_count(r_week.one())

    # Last 10 completed trips
    r_hist = await db.execute(
        select(Trip)
        .where(Trip.driver_id == driver.id, Trip.status == "completed")
        .order_by(Trip.updated_at.desc())
        .limit(10)
    )
    recent = list(r_hist.scalars().all())

    return {
        "total_xof": total_xof,
        "total_trips": total_trips,
        "today_xof": today_xof,
        "today_trips": today_trips,
        "week_xof": week_xof,
        "week_trips": week_trips,
        "recent_trips": recent,
    }


# ---------------------------------------------------------------------------
# Admin Statistics — Sprint 11
# ---------------------------------------------------------------------------

async def admin_get_stats(db: AsyncSession) -> dict:
    """Platform-wide statistics for admin dashboard."""

    # Trip counts by status + total revenue
    r_trips = await db.execute(
        select(Trip.status, func.count(Trip.id)).group_by(Trip.status)
    )
    trips_by_status: dict[str, int] = dict(r_trips.all())

    r_rev = await db.execute(
        select(func.sum(Trip.fare_xof)).where(Trip.status == "completed")
    )
    total_revenue_xof = int(r_rev.scalar() or 0)

    # Assistance counts by status
    r_assist = await db.execute(
        select(AssistanceRequest.status, func.count(AssistanceRequest.id))
        .group_by(AssistanceRequest.status)
    )
    assist_by_status: dict[str, int] = dict(r_assist.all())

    # Driver counts by status
    r_drivers = await db.execute(
        select(Driver.status, func.count(Driver.id)).group_by(Driver.status)
    )
    drivers_by_status: dict[str, int] = dict(r_drivers.all())

    # Sprint 24: payment stats
    r_pay_count = await db.execute(
        select(func.count(PaymentIntent.id)).where(PaymentIntent.status == "paid")
    )
    total_paid_count = int(r_pay_count.scalar() or 0)

    r_pay_xof = await db.execute(
        select(func.sum(PaymentIntent.amount_xof)).where(PaymentIntent.status == "paid")
    )
    total_paid_xof = int(r_pay_xof.scalar() or 0)

    return {
        "trips": {
            "total": sum(trips_by_status.values()),
            "by_status": trips_by_status,
            "total_revenue_xof": total_revenue_xof,
        },
        "assistance": {
            "total": sum(assist_by_status.values()),
            "by_status": assist_by_status,
        },
        "drivers": {
            "total": sum(drivers_by_status.values()),
            "by_status": drivers_by_status,
        },
        "payments": {
            "total_paid": total_paid_count,
            "total_paid_xof": total_paid_xof,
        },
    }


async def admin_list_trips(
    db: AsyncSession,
    limit: int = 50,
    offset: int = 0,
    status: str | None = None,
    customer_email: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> list[dict]:
    """All trips with customer email, newest first (admin view).

    Optional filters (Sprint 19):
      - status: exact match (pending|accepted|in_progress|completed|cancelled)
      - customer_email: case-insensitive partial match
      - date_from / date_to: filter on created_at (inclusive)
    """
    q = select(Trip, User).join(User, Trip.customer_id == User.id)
    if status:
        q = q.where(Trip.status == status)
    if customer_email:
        q = q.where(User.email.ilike(f"%{customer_email}%"))
    if date_from:
        q = q.where(Trip.created_at >= date_from)
    if date_to:
        q = q.where(Trip.created_at <= date_to)
    q = q.order_by(Trip.created_at.desc()).limit(limit).offset(offset)

    r = await db.execute(q)
    out = []
    for trip, customer in r.all():
        out.append({
            "trip_id": str(trip.id),
            "status": trip.status,
            "fare_xof": trip.fare_xof,
            "distance_km": trip.distance_km,
            "duration_min": trip.duration_min,
            "customer_email": customer.email,
            "driver_id": str(trip.driver_id) if trip.driver_id else None,
            "category": getattr(trip, "category", "economy"),
            "created_at": trip.created_at.isoformat(),
            "updated_at": trip.updated_at.isoformat(),
        })
    return out


# ---------------------------------------------------------------------------
# Vehicle Management — Sprint 12
# ---------------------------------------------------------------------------

async def _get_active_vehicle_for_driver(
    db: AsyncSession, driver_id: uuid.UUID
) -> Vehicle | None:
    """Return the driver's current active vehicle (most recent), or None."""
    result = await db.execute(
        select(Vehicle)
        .where(Vehicle.driver_id == driver_id, Vehicle.status == "active")
        .order_by(Vehicle.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_vehicle_for_driver_uuid(
    db: AsyncSession, driver_id: uuid.UUID | None
) -> Vehicle | None:
    """Public helper: look up the active vehicle for a driver UUID (used in trip responses)."""
    if driver_id is None:
        return None
    return await _get_active_vehicle_for_driver(db, driver_id)


async def get_driver_vehicle(db: AsyncSession, auth_user_id: str) -> Vehicle | None:
    """Return the authenticated driver's active vehicle, or None if not set."""
    driver = await _get_driver_by_auth_id(db, auth_user_id)
    if driver is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver profile not found - call POST /v1/drivers/register first",
        )
    return await _get_active_vehicle_for_driver(db, driver.id)


async def upsert_vehicle(
    db: AsyncSession,
    auth_user_id: str,
    plate: str,
    make: str | None,
    model_name: str | None,
    year: int | None,
    color: str | None,
    category: str = "economy",
) -> tuple[Vehicle, bool]:
    """Create or update the driver's active vehicle.

    If the driver already has an active vehicle, its fields are updated in-place.
    Otherwise a new Vehicle row is created.

    Returns (vehicle, created) where created=True for a new record.
    Raises 409 if the plate is already used by another driver.
    Raises 422 if category is not in VEHICLE_CATEGORIES.
    """
    if category not in VEHICLE_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid category '{category}'. Valid: {sorted(VEHICLE_CATEGORIES)}",
        )
    driver = _require_driver(await _get_driver_by_auth_id(db, auth_user_id))
    vehicle = await _get_active_vehicle_for_driver(db, driver.id)

    if vehicle is None:
        # Check plate uniqueness across drivers
        existing_plate = await db.execute(
            select(Vehicle).where(Vehicle.plate == plate)
        )
        if existing_plate.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Plate '{plate}' is already registered",
            )
        vehicle = Vehicle(
            driver_id=driver.id,
            plate=plate,
            make=make,
            model=model_name,
            year=year,
            color=color,
            category=category,
            status="active",
        )
        db.add(vehicle)
        await db.commit()
        await db.refresh(vehicle)
        return vehicle, True

    # Check plate uniqueness only if it changed
    if vehicle.plate != plate:
        existing_plate = await db.execute(
            select(Vehicle).where(Vehicle.plate == plate)
        )
        if existing_plate.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Plate '{plate}' is already registered",
            )

    vehicle.plate = plate
    vehicle.make = make
    vehicle.model = model_name
    vehicle.year = year
    vehicle.color = color
    vehicle.category = category
    await db.commit()
    await db.refresh(vehicle)
    return vehicle, False


# ---------------------------------------------------------------------------
# Customer Assistance History — Sprint 12
# ---------------------------------------------------------------------------

async def list_customer_assistance(
    db: AsyncSession, auth_user_id: str
) -> list[AssistanceRequest]:
    """Return all assistance requests for the authenticated customer, newest first."""
    user = await _get_user_by_auth_id(db, auth_user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found - call POST /v1/auth/register first",
        )
    result = await db.execute(
        select(AssistanceRequest)
        .where(AssistanceRequest.customer_id == user.id)
        .order_by(AssistanceRequest.created_at.desc())
    )
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# Admin — User List — Sprint 12
# ---------------------------------------------------------------------------

async def admin_list_users(
    db: AsyncSession,
    role: str | None = None,
    email: str | None = None,
) -> list[dict]:
    """Return all registered users (newest first) for admin view.

    Optional filters (Sprint 19):
      - role: exact match (admin|driver|customer)
      - email: case-insensitive partial match
    """
    q = select(User)
    if role:
        q = q.where(User.role == role)
    if email:
        q = q.where(User.email.ilike(f"%{email}%"))
    q = q.order_by(User.created_at.desc())
    result = await db.execute(q)
    users = result.scalars().all()
    return [
        {
            "user_id": u.user_id,
            "email": u.email,
            "role": u.role,
            "provider": u.provider,
            "created_at": u.created_at.isoformat(),
        }
        for u in users
    ]


# ---------------------------------------------------------------------------
# Sprint 13 — Driver presence, driver trip history, admin assistance list
# ---------------------------------------------------------------------------

async def get_driver_profile(db: AsyncSession, auth_user_id: str) -> dict:
    """Return driver profile including online status and rating stats (Sprint 15)."""
    driver = _require_driver(await _get_driver_by_auth_id(db, auth_user_id))
    r = await db.execute(
        select(func.avg(Rating.stars), func.count(Rating.id))
        .where(Rating.driver_id == driver.id)
    )
    row = r.one()
    avg_rating = round(float(row[0]), 2) if row[0] is not None else None
    total_ratings = row[1]
    return {
        "driver_id": str(driver.id),
        "status": driver.status,
        "is_online": driver.is_online,
        "avg_rating": avg_rating,
        "total_ratings": total_ratings,
        "registered_at": _utc(driver.created_at).isoformat(),
    }


async def set_driver_online(
    db: AsyncSession, auth_user_id: str, online: bool
) -> dict:
    """Toggle the driver's online/offline presence flag."""
    driver = _require_driver(await _get_driver_by_auth_id(db, auth_user_id))
    driver.is_online = online
    await db.commit()
    await db.refresh(driver)
    return {"driver_id": str(driver.id), "is_online": driver.is_online}


async def list_driver_trip_history(
    db: AsyncSession,
    auth_user_id: str,
    limit: int = 20,
    offset: int = 0,
) -> list[Trip]:
    """Return the driver's completed or cancelled trips, newest first."""
    driver = _require_driver(await _get_driver_by_auth_id(db, auth_user_id))
    result = await db.execute(
        select(Trip)
        .where(
            Trip.driver_id == driver.id,
            Trip.status.in_(["completed", "cancelled"]),
        )
        .order_by(Trip.updated_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


async def admin_list_assistance(
    db: AsyncSession, limit: int = 50, offset: int = 0
) -> list[dict]:
    """Return all assistance requests (newest first) for admin view."""
    result = await db.execute(
        select(AssistanceRequest, User)
        .join(User, AssistanceRequest.customer_id == User.id)
        .order_by(AssistanceRequest.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = result.all()
    return [
        {
            "request_id": str(req.id),
            "type": req.type,
            "status": req.status,
            "lat": req.lat,
            "lng": req.lng,
            "note": req.note,
            "eta_min": req.eta_min,
            "customer_email": user.email,
            "driver_id": str(req.driver_id) if req.driver_id else None,
            "created_at": _utc(req.created_at).isoformat(),
            "updated_at": _utc(req.updated_at).isoformat(),
        }
        for req, user in rows
    ]


# ---------------------------------------------------------------------------
# Sprint 14 — Promo codes & admin driver status
# ---------------------------------------------------------------------------

async def create_promo(
    db: AsyncSession,
    code: str,
    discount_pct: int,
    max_uses: int | None,
    expires_at: datetime | None,
) -> PromoCode:
    """Admin creates a new promotional discount code."""
    code_upper = code.upper().strip()
    existing = await db.execute(
        select(PromoCode).where(PromoCode.code == code_upper)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Promo code '{code_upper}' already exists",
        )
    promo = PromoCode(
        code=code_upper,
        discount_pct=discount_pct,
        max_uses=max_uses,
        expires_at=expires_at,
    )
    db.add(promo)
    await db.commit()
    await db.refresh(promo)
    return promo


async def list_promos(db: AsyncSession) -> list[PromoCode]:
    """Return all promo codes (newest first)."""
    result = await db.execute(
        select(PromoCode).order_by(PromoCode.created_at.desc())
    )
    return list(result.scalars().all())


async def deactivate_promo(db: AsyncSession, code: str) -> PromoCode:
    """Admin deactivates a promo code (sets active=False)."""
    code_upper = code.upper().strip()
    result = await db.execute(
        select(PromoCode).where(PromoCode.code == code_upper)
    )
    promo: PromoCode | None = result.scalar_one_or_none()
    if promo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Promo code '{code_upper}' not found",
        )
    promo.active = False
    await db.commit()
    await db.refresh(promo)
    return promo


async def validate_promo(db: AsyncSession, code: str) -> dict:
    """Check whether a promo code is currently usable.

    Returns {"valid": True, "code": str, "discount_pct": int} or raises 422.
    """
    code_upper = code.upper().strip()
    result = await db.execute(
        select(PromoCode).where(PromoCode.code == code_upper)
    )
    promo: PromoCode | None = result.scalar_one_or_none()
    if promo is None or not promo.active:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Promo code '{code}' is invalid or inactive",
        )
    if promo.expires_at is not None and _utc(promo.expires_at) < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Promo code '{code}' has expired",
        )
    if promo.max_uses is not None and promo.uses >= promo.max_uses:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Promo code '{code}' has reached its usage limit",
        )
    return {"valid": True, "code": promo.code, "discount_pct": promo.discount_pct}


# ---------------------------------------------------------------------------
# Sprint 15 — Payout requests & admin ratings view
# ---------------------------------------------------------------------------

_VALID_PAYOUT_STATUSES = {"approved", "rejected"}


async def create_payout_request(
    db: AsyncSession,
    auth_user_id: str,
    amount_xof: int,
) -> PayoutRequestModel:
    """Driver creates a payout (withdrawal) request.

    Raises 422 if amount_xof ≤ 0.
    """
    driver = _require_driver(await _get_driver_by_auth_id(db, auth_user_id))
    if amount_xof <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="amount_xof must be greater than 0",
        )
    req = PayoutRequestModel(
        driver_id=driver.id,
        amount_xof=amount_xof,
        status="pending",
    )
    db.add(req)
    await db.commit()
    await db.refresh(req)
    return req


async def list_driver_payout_requests(
    db: AsyncSession,
    auth_user_id: str,
) -> list[PayoutRequestModel]:
    """Return all payout requests for the authenticated driver, newest first."""
    driver = _require_driver(await _get_driver_by_auth_id(db, auth_user_id))
    result = await db.execute(
        select(PayoutRequestModel)
        .where(PayoutRequestModel.driver_id == driver.id)
        .order_by(PayoutRequestModel.created_at.desc())
    )
    return list(result.scalars().all())


async def admin_list_payout_requests(
    db: AsyncSession, limit: int = 50, offset: int = 0
) -> list[dict]:
    """Return all payout requests (newest first) for admin view."""
    result = await db.execute(
        select(PayoutRequestModel, Driver, User)
        .join(Driver, PayoutRequestModel.driver_id == Driver.id)
        .join(User, Driver.user_id == User.id)
        .order_by(PayoutRequestModel.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return [
        {
            "payout_id": str(req.id),
            "driver_id": str(req.driver_id),
            "driver_email": user.email,
            "amount_xof": req.amount_xof,
            "status": req.status,
            "note_admin": req.note_admin,
            "created_at": _utc(req.created_at).isoformat(),
            "updated_at": _utc(req.updated_at).isoformat(),
        }
        for req, driver, user in result.all()
    ]


async def admin_update_payout_status(
    db: AsyncSession,
    request_id_str: str,
    new_status: str,
    note_admin: str | None = None,
) -> dict:
    """Admin approves or rejects a payout request.

    Raises 422 for invalid status, 404 if not found.
    """
    if new_status not in _VALID_PAYOUT_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid status '{new_status}'. Valid: {sorted(_VALID_PAYOUT_STATUSES)}",
        )
    try:
        req_uuid = uuid.UUID(request_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid payout_request_id format",
        )
    result = await db.execute(
        select(PayoutRequestModel).where(PayoutRequestModel.id == req_uuid)
    )
    req: PayoutRequestModel | None = result.scalar_one_or_none()
    if req is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payout request not found",
        )
    req.status = new_status
    if note_admin is not None:
        req.note_admin = note_admin
    req.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(req)
    return {
        "payout_id": str(req.id),
        "driver_id": str(req.driver_id),
        "amount_xof": req.amount_xof,
        "status": req.status,
        "note_admin": req.note_admin,
        "created_at": _utc(req.created_at).isoformat(),
        "updated_at": _utc(req.updated_at).isoformat(),
    }


async def admin_list_ratings(
    db: AsyncSession, limit: int = 50, offset: int = 0
) -> list[dict]:
    """Return all ratings (newest first) with customer info for admin view."""
    result = await db.execute(
        select(Rating, User)
        .join(User, Rating.customer_id == User.id)
        .order_by(Rating.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return [
        {
            "rating_id": str(rating.id),
            "trip_id": str(rating.trip_id),
            "driver_id": str(rating.driver_id),
            "customer_email": user.email,
            "stars": rating.stars,
            "comment": rating.comment,
            "created_at": _utc(rating.created_at).isoformat(),
        }
        for rating, user in result.all()
    ]


# ---------------------------------------------------------------------------
# Sprint 16 — User profile & surge pricing
# ---------------------------------------------------------------------------

async def get_user_profile(db: AsyncSession, auth_user_id: str) -> dict:
    """Return the authenticated user's profile including name and phone."""
    user = await _get_user_by_auth_id(db, auth_user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found — call POST /v1/auth/register first",
        )
    return {
        "user_id": user.user_id,
        "email": user.email,
        "role": user.role,
        "name": user.name,
        "phone": user.phone,
        "created_at": _utc(user.created_at).isoformat(),
    }


async def update_user_profile(
    db: AsyncSession,
    auth_user_id: str,
    name: str | None,
    phone: str | None,
) -> dict:
    """Update the user's name and/or phone.

    A ``None`` value for a field means "leave unchanged".
    Pass an empty string to clear the field.
    """
    user = await _get_user_by_auth_id(db, auth_user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found — call POST /v1/auth/register first",
        )
    if name is not None:
        user.name = name if name != "" else None
    if phone is not None:
        user.phone = phone if phone != "" else None
    user.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)
    return {
        "user_id": user.user_id,
        "email": user.email,
        "role": user.role,
        "name": user.name,
        "phone": user.phone,
        "created_at": _utc(user.created_at).isoformat(),
    }


async def get_surge_multiplier(db: AsyncSession) -> float:
    """Return the current surge multiplier from platform_settings.

    Falls back to ``settings.fare_surge_multiplier`` (default 1.0) when not set.
    """
    from app.config import settings as _settings  # noqa: PLC0415

    result = await db.execute(
        select(PlatformSetting).where(PlatformSetting.key == "surge_multiplier")
    )
    row = result.scalar_one_or_none()
    if row is None:
        return float(_settings.fare_surge_multiplier)
    try:
        return float(row.value)
    except (ValueError, TypeError):
        return float(_settings.fare_surge_multiplier)


async def set_surge_multiplier(db: AsyncSession, value: float) -> float:
    """Upsert the surge multiplier in platform_settings.

    Validates 1.0 ≤ value ≤ 5.0.  Returns the stored value.
    """
    if value < 1.0 or value > 5.0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="surge_multiplier must be between 1.0 and 5.0",
        )

    result = await db.execute(
        select(PlatformSetting).where(PlatformSetting.key == "surge_multiplier")
    )
    row = result.scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if row is None:
        row = PlatformSetting(key="surge_multiplier", value=str(value), updated_at=now)
        db.add(row)
    else:
        row.value = str(value)
        row.updated_at = now
    await db.commit()
    await db.refresh(row)
    return float(row.value)


# ---------------------------------------------------------------------------
# Sprint 17 — Driver documents (KYC) & admin pending counts
# ---------------------------------------------------------------------------

_VALID_DOCUMENT_STATUSES = {"approved", "rejected"}


async def submit_driver_document(
    db: AsyncSession,
    auth_user_id: str,
    doc_type: str,
    url: str,
) -> DriverDocument:
    """Driver submits a KYC document (URL to a scan).

    Raises 422 if doc_type is not one of the allowed values.
    Multiple submissions of the same type are allowed (resubmit after rejection).
    """
    driver = _require_driver(await _get_driver_by_auth_id(db, auth_user_id))
    if doc_type not in DOCUMENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid document type '{doc_type}'. Valid: {sorted(DOCUMENT_TYPES)}",
        )
    doc = DriverDocument(
        driver_id=driver.id,
        type=doc_type,
        url=url,
        status="pending",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


async def list_driver_documents(
    db: AsyncSession,
    auth_user_id: str,
) -> list[DriverDocument]:
    """Return all documents submitted by the authenticated driver, newest first."""
    driver = _require_driver(await _get_driver_by_auth_id(db, auth_user_id))
    result = await db.execute(
        select(DriverDocument)
        .where(DriverDocument.driver_id == driver.id)
        .order_by(DriverDocument.created_at.desc())
    )
    return list(result.scalars().all())


async def admin_list_documents(
    db: AsyncSession, limit: int = 50, offset: int = 0
) -> list[dict]:
    """Return all driver documents (newest first) with driver email for admin view."""
    result = await db.execute(
        select(DriverDocument, Driver, User)
        .join(Driver, DriverDocument.driver_id == Driver.id)
        .join(User, Driver.user_id == User.id)
        .order_by(DriverDocument.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return [
        {
            "document_id": str(doc.id),
            "driver_id": str(doc.driver_id),
            "driver_email": user.email,
            "type": doc.type,
            "url": doc.url,
            "status": doc.status,
            "note_admin": doc.note_admin,
            "created_at": _utc(doc.created_at).isoformat(),
            "updated_at": _utc(doc.updated_at).isoformat(),
        }
        for doc, driver, user in result.all()
    ]


async def admin_update_document_status(
    db: AsyncSession,
    document_id_str: str,
    new_status: str,
    note_admin: str | None = None,
) -> dict:
    """Admin approves or rejects a driver document.

    Raises 422 for invalid status, 404 if not found.
    """
    if new_status not in _VALID_DOCUMENT_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid status '{new_status}'. Valid: {sorted(_VALID_DOCUMENT_STATUSES)}",
        )
    try:
        doc_uuid = uuid.UUID(document_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid document_id format",
        )
    result = await db.execute(
        select(DriverDocument).where(DriverDocument.id == doc_uuid)
    )
    doc: DriverDocument | None = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )
    doc.status = new_status
    if note_admin is not None:
        doc.note_admin = note_admin
    doc.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(doc)

    # Sprint 18: notify the driver whose document was reviewed
    driver_result = await db.execute(select(Driver).where(Driver.id == doc.driver_id))
    reviewed_driver = driver_result.scalar_one_or_none()
    if reviewed_driver is not None:
        doc_type_label = {
            "license": "Permis de conduire",
            "insurance": "Assurance",
            "registration": "Carte grise",
            "id_card": "Carte d'identité",
        }.get(doc.type, doc.type)
        if new_status == "approved":
            await _push_notification(
                db, reviewed_driver.user_id,
                "document_approved",
                "✅ Document approuvé",
                f"Votre {doc_type_label} a été approuvé par l'équipe Ziza.",
            )
        else:
            note_suffix = f" — {note_admin}" if note_admin else ""
            await _push_notification(
                db, reviewed_driver.user_id,
                "document_rejected",
                "❌ Document rejeté",
                f"Votre {doc_type_label} a été rejeté{note_suffix}. Veuillez soumettre un nouveau document.",
            )

    return {
        "document_id": str(doc.id),
        "driver_id": str(doc.driver_id),
        "type": doc.type,
        "url": doc.url,
        "status": doc.status,
        "note_admin": doc.note_admin,
        "created_at": _utc(doc.created_at).isoformat(),
        "updated_at": _utc(doc.updated_at).isoformat(),
    }


async def admin_get_pending_counts(db: AsyncSession) -> dict:
    """Return counts of items awaiting admin action.

    Currently tracks: pending payout requests and pending KYC documents.
    """
    r_payouts = await db.execute(
        select(func.count(PayoutRequestModel.id))
        .where(PayoutRequestModel.status == "pending")
    )
    payout_count = r_payouts.scalar() or 0

    r_docs = await db.execute(
        select(func.count(DriverDocument.id))
        .where(DriverDocument.status == "pending")
    )
    doc_count = r_docs.scalar() or 0

    return {
        "payout_requests": int(payout_count),
        "documents": int(doc_count),
    }


_VALID_DRIVER_STATUSES = {"active", "inactive", "suspended"}


async def admin_set_driver_status(
    db: AsyncSession, driver_id_str: str, new_status: str
) -> dict:
    """Admin sets the status of a driver (active | inactive | suspended)."""
    if new_status not in _VALID_DRIVER_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid status '{new_status}'. Valid: {sorted(_VALID_DRIVER_STATUSES)}",
        )
    try:
        driver_uuid = uuid.UUID(driver_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid driver_id format",
        )
    result = await db.execute(select(Driver).where(Driver.id == driver_uuid))
    driver: Driver | None = result.scalar_one_or_none()
    if driver is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver not found",
        )
    driver.status = new_status
    await db.commit()
    await db.refresh(driver)
    return {"driver_id": str(driver.id), "status": driver.status}


# ---------------------------------------------------------------------------
# Sprint 20 — Saved places (customer address book)
# ---------------------------------------------------------------------------

MAX_SAVED_PLACES = 10
_VALID_PLACE_LABELS = {"home", "work", "other"}


async def list_saved_places(
    db: AsyncSession,
    auth_user_id: str,
) -> list[SavedPlace]:
    """Return all saved places for the authenticated user, oldest first."""
    user = await _get_user_by_auth_id(db, auth_user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    result = await db.execute(
        select(SavedPlace)
        .where(SavedPlace.user_id == user.id)
        .order_by(SavedPlace.created_at.asc())
    )
    return list(result.scalars().all())


async def create_saved_place(
    db: AsyncSession,
    auth_user_id: str,
    label: str,
    name: str,
    lat: float,
    lng: float,
) -> SavedPlace:
    """Create a saved place for the authenticated user.

    Raises 422 if label is invalid or the user already has MAX_SAVED_PLACES places.
    """
    if label not in _VALID_PLACE_LABELS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid label '{label}'. Valid: {sorted(_VALID_PLACE_LABELS)}",
        )
    user = await _get_user_by_auth_id(db, auth_user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    count_result = await db.execute(
        select(func.count(SavedPlace.id)).where(SavedPlace.user_id == user.id)
    )
    count = count_result.scalar() or 0
    if count >= MAX_SAVED_PLACES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Maximum of {MAX_SAVED_PLACES} saved places reached",
        )
    place = SavedPlace(user_id=user.id, label=label, name=name, lat=lat, lng=lng)
    db.add(place)
    await db.commit()
    await db.refresh(place)
    return place


async def update_saved_place(
    db: AsyncSession,
    auth_user_id: str,
    place_id: str,
    label: str | None = None,
    name: str | None = None,
    lat: float | None = None,
    lng: float | None = None,
) -> SavedPlace:
    """Update one or more fields of a saved place.

    Only the owner can update their own places.  Returns 404 if not found or
    if the place belongs to a different user.
    """
    if label is not None and label not in _VALID_PLACE_LABELS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid label '{label}'. Valid: {sorted(_VALID_PLACE_LABELS)}",
        )
    user = await _get_user_by_auth_id(db, auth_user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    try:
        place_uuid = uuid.UUID(place_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid place_id format",
        )
    result = await db.execute(
        select(SavedPlace).where(SavedPlace.id == place_uuid, SavedPlace.user_id == user.id)
    )
    place: SavedPlace | None = result.scalar_one_or_none()
    if place is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved place not found")
    if label is not None:
        place.label = label
    if name is not None:
        place.name = name
    if lat is not None:
        place.lat = lat
    if lng is not None:
        place.lng = lng
    await db.commit()
    await db.refresh(place)
    return place


async def delete_saved_place(
    db: AsyncSession,
    auth_user_id: str,
    place_id: str,
) -> None:
    """Delete a saved place.  Only the owner can delete their own places."""
    user = await _get_user_by_auth_id(db, auth_user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    try:
        place_uuid = uuid.UUID(place_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid place_id format",
        )
    result = await db.execute(
        select(SavedPlace).where(SavedPlace.id == place_uuid, SavedPlace.user_id == user.id)
    )
    place: SavedPlace | None = result.scalar_one_or_none()
    if place is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved place not found")
    await db.delete(place)
    await db.commit()


# ---------------------------------------------------------------------------
# Sprint 22 — Driver location & ETA
# ---------------------------------------------------------------------------

#: Average city speed used for ETA estimation (km/h).
CITY_SPEED_KMH: float = 30.0


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance between two WGS-84 coordinates (km)."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


async def upsert_driver_location(
    db: AsyncSession,
    claims: Claims,
    lat: float,
    lng: float,
) -> DriverLocation:
    """Create or update the driver's current GPS position."""
    driver = await _get_driver_by_auth_id(db, claims.user_id)
    if driver is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found")

    result = await db.execute(
        select(DriverLocation).where(DriverLocation.driver_id == driver.id)
    )
    loc: DriverLocation | None = result.scalar_one_or_none()
    now = datetime.now(timezone.utc)

    if loc is None:
        loc = DriverLocation(driver_id=driver.id, lat=lat, lng=lng, updated_at=now)
        db.add(loc)
    else:
        loc.lat = lat
        loc.lng = lng
        loc.updated_at = now

    # Sprint 23 — keep denormalised snapshot on the drivers row so dispatch
    # can sort by proximity without an extra join.
    driver.current_lat = lat
    driver.current_lng = lng
    driver.last_seen_at = now

    await db.commit()
    await db.refresh(loc)
    return loc


async def get_driver_location(
    db: AsyncSession,
    claims: Claims,
) -> DriverLocation:
    """Return the driver's last known location (404 if not set yet)."""
    driver = await _get_driver_by_auth_id(db, claims.user_id)
    if driver is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found")

    result = await db.execute(
        select(DriverLocation).where(DriverLocation.driver_id == driver.id)
    )
    loc: DriverLocation | None = result.scalar_one_or_none()
    if loc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No location recorded yet",
        )
    return loc


async def get_trip_eta(
    db: AsyncSession,
    claims: Claims,
    trip_id: str,
) -> dict:
    """Return driver distance & ETA for an active trip.

    Only the trip's customer can call this.
    Returns: {distance_km, eta_min, driver_lat, driver_lng, updated_at}
    """
    try:
        trip_uuid = uuid.UUID(trip_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid trip_id format",
        )

    # Resolve requesting user
    user = await _get_user_by_auth_id(db, claims.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Load trip
    trip_result = await db.execute(select(Trip).where(Trip.id == trip_uuid))
    trip: Trip | None = trip_result.scalar_one_or_none()
    if trip is None or trip.customer_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found")

    if trip.status not in ("accepted", "in_progress"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No driver assigned to this trip yet",
        )

    if trip.driver_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No driver assigned to this trip yet",
        )

    # Get driver's location
    loc_result = await db.execute(
        select(DriverLocation).where(DriverLocation.driver_id == trip.driver_id)
    )
    loc: DriverLocation | None = loc_result.scalar_one_or_none()
    if loc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver location not available yet",
        )

    # Determine reference point: pickup for accepted, dest for in_progress
    if trip.status == "accepted":
        ref_lat = trip.origin_lat
        ref_lng = trip.origin_lng
    else:
        ref_lat = trip.dest_lat
        ref_lng = trip.dest_lng

    if ref_lat is None or ref_lng is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip coordinates not available",
        )

    distance_km = round(_haversine_km(loc.lat, loc.lng, ref_lat, ref_lng), 2)
    eta_min = max(1, round((distance_km / CITY_SPEED_KMH) * 60))

    return {
        "distance_km": distance_km,
        "eta_min": eta_min,
        "driver_lat": loc.lat,
        "driver_lng": loc.lng,
        "updated_at": _utc(loc.updated_at).isoformat(),
    }


async def get_trip_tracking(
    db: AsyncSession,
    claims: Claims,
    trip_id: str,
) -> dict:
    """Return driver's live position for a trip the caller owns.

    Sprint 23 — lightweight polling endpoint consumed by the customer app.
    Returns: {trip_id, status, driver_lat, driver_lng, eta_min, updated_at}
    Returns 404 when no driver location is available yet (customer polls again).
    """
    try:
        trip_uuid = uuid.UUID(trip_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid trip_id format",
        )

    # Resolve requesting user
    user = await _get_user_by_auth_id(db, claims.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Load trip — must belong to this customer
    trip_result = await db.execute(select(Trip).where(Trip.id == trip_uuid))
    trip: Trip | None = trip_result.scalar_one_or_none()
    if trip is None or trip.customer_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found")

    if trip.status not in ("accepted", "in_progress"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip is not active",
        )

    if trip.driver_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No driver assigned yet",
        )

    # Prefer the denormalised snapshot on the Driver row (updated in real time
    # by upsert_driver_location) to avoid an extra table join.
    driver_result = await db.execute(select(Driver).where(Driver.id == trip.driver_id))
    driver: Driver | None = driver_result.scalar_one_or_none()

    d_lat: float | None = getattr(driver, "current_lat", None) if driver else None
    d_lng: float | None = getattr(driver, "current_lng", None) if driver else None
    updated_at_val = getattr(driver, "last_seen_at", None) if driver else None

    # Fall back to driver_locations table if snapshot is not yet populated
    if d_lat is None or d_lng is None:
        loc_result = await db.execute(
            select(DriverLocation).where(DriverLocation.driver_id == trip.driver_id)
        )
        loc: DriverLocation | None = loc_result.scalar_one_or_none()
        if loc is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Driver location not available yet",
            )
        d_lat = loc.lat
        d_lng = loc.lng
        updated_at_val = loc.updated_at

    # Compute ETA toward pickup (accepted) or destination (in_progress)
    if trip.status == "accepted":
        ref_lat, ref_lng = trip.origin_lat, trip.origin_lng
    else:
        ref_lat, ref_lng = trip.dest_lat, trip.dest_lng

    eta_min: int | None = None
    if ref_lat is not None and ref_lng is not None:
        distance_km = _haversine_km(d_lat, d_lng, ref_lat, ref_lng)
        eta_min = max(1, round((distance_km / CITY_SPEED_KMH) * 60))

    updated_str = _utc(updated_at_val).isoformat() if updated_at_val else None

    return {
        "trip_id": str(trip.id),
        "status": trip.status,
        "driver_lat": d_lat,
        "driver_lng": d_lng,
        "eta_min": eta_min,
        "updated_at": updated_str,
    }


# ---------------------------------------------------------------------------
# Sprint 24 — Payment
# ---------------------------------------------------------------------------

def _intent_to_dict(intent: PaymentIntent) -> dict:
    """Serialise a PaymentIntent row to a plain dict."""
    return {
        "intent_id": str(intent.id),
        "trip_id": str(intent.trip_id),
        "amount_xof": intent.amount_xof,
        "currency": intent.currency,
        "provider": intent.provider,
        "provider_ref": intent.provider_ref,
        "status": intent.status,
        "checkout_url": intent.checkout_url,
        "created_at": _utc(intent.created_at).isoformat(),
        "updated_at": _utc(intent.updated_at).isoformat(),
    }


async def create_payment_intent(
    db: AsyncSession,
    claims: Claims,
    trip_id: str,
    adapter,
    return_url: str = "https://app.ziza.ci/payment/return",
) -> dict:
    """Create (or return existing) PaymentIntent for a completed trip.

    Rules:
    - Trip must be ``completed`` (422 otherwise).
    - Only the trip's customer can initiate payment (403 otherwise).
    - Idempotent: if a ``paid`` intent already exists it is returned as-is.
    - If a ``pending`` intent already exists it is returned as-is (allow retry).

    Returns the PaymentIntent dict.
    """
    # Resolve user
    user = await _get_user_by_auth_id(db, claims.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Parse + load trip
    try:
        trip_uuid = uuid.UUID(trip_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid trip_id format",
        )

    trip_result = await db.execute(select(Trip).where(Trip.id == trip_uuid))
    trip: Trip | None = trip_result.scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found")
    if trip.customer_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not own this trip",
        )
    if trip.status != "completed":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Trip must be completed to pay (current status: {trip.status!r})",
        )

    # Check for an existing intent (idempotence)
    existing_result = await db.execute(
        select(PaymentIntent).where(PaymentIntent.trip_id == trip_uuid)
    )
    existing: PaymentIntent | None = existing_result.scalar_one_or_none()
    if existing is not None:
        return _intent_to_dict(existing)

    # Create a new intent
    amount = trip.fare_xof or 0
    intent = PaymentIntent(
        trip_id=trip.id,
        amount_xof=amount,
        provider=getattr(adapter, "_provider_name", "mock"),
    )
    db.add(intent)
    await db.flush()  # get the UUID

    # Call the payment provider
    checkout = await adapter.create_checkout(
        amount_xof=amount,
        ref=str(intent.id),
        return_url=return_url,
    )
    intent.provider_ref = checkout["provider_ref"]
    intent.checkout_url = checkout["checkout_url"]
    await db.commit()
    await db.refresh(intent)
    return _intent_to_dict(intent)


async def confirm_payment(
    db: AsyncSession,
    payload: bytes,
    headers: dict,
    adapter,
) -> dict:
    """Process an inbound webhook from the payment provider.

    Verifies the signature, looks up the intent by provider_ref,
    transitions its status, and stamps ``trip.paid_at`` when paid.

    Raises:
      - ``ValueError`` (→ 400) on invalid signature or malformed payload.
      - ``HTTPException(404)`` when the provider_ref is unknown.
    """
    # Delegate signature check + parsing to the adapter
    event = await adapter.verify_webhook(payload, headers)

    provider_ref = event["provider_ref"]
    new_status = event["status"]  # "paid" | "failed"

    intent_result = await db.execute(
        select(PaymentIntent).where(PaymentIntent.provider_ref == provider_ref)
    )
    intent: PaymentIntent | None = intent_result.scalar_one_or_none()
    if intent is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No payment intent found for provider_ref {provider_ref!r}",
        )

    intent.status = new_status

    if new_status == "paid":
        # Stamp the trip
        now = datetime.now(timezone.utc)
        trip_result = await db.execute(select(Trip).where(Trip.id == intent.trip_id))
        trip: Trip | None = trip_result.scalar_one_or_none()
        if trip is not None:
            trip.paid_at = now

    await db.commit()
    await db.refresh(intent)
    return _intent_to_dict(intent)


async def get_payment_intent(
    db: AsyncSession,
    claims: Claims,
    intent_id: str,
) -> dict:
    """Return a PaymentIntent by ID; caller must own the linked trip (403)."""
    user = await _get_user_by_auth_id(db, claims.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    try:
        intent_uuid = uuid.UUID(intent_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid intent_id format",
        )

    intent_result = await db.execute(
        select(PaymentIntent).where(PaymentIntent.id == intent_uuid)
    )
    intent: PaymentIntent | None = intent_result.scalar_one_or_none()
    if intent is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Payment intent not found"
        )

    # Verify ownership through the trip
    trip_result = await db.execute(select(Trip).where(Trip.id == intent.trip_id))
    trip: Trip | None = trip_result.scalar_one_or_none()
    if trip is None or trip.customer_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not own this payment intent",
        )

    return _intent_to_dict(intent)


async def get_trip_payment(
    db: AsyncSession,
    claims: Claims,
    trip_id: str,
) -> dict | None:
    """Return the PaymentIntent for a trip, or None if none exists yet.

    Returns ``None`` (→ caller returns 404) when the trip has no intent.
    """
    user = await _get_user_by_auth_id(db, claims.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    try:
        trip_uuid = uuid.UUID(trip_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid trip_id format",
        )

    # Verify the trip belongs to this user
    trip_result = await db.execute(select(Trip).where(Trip.id == trip_uuid))
    trip: Trip | None = trip_result.scalar_one_or_none()
    if trip is None or trip.customer_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found")

    intent_result = await db.execute(
        select(PaymentIntent).where(PaymentIntent.trip_id == trip_uuid)
    )
    intent: PaymentIntent | None = intent_result.scalar_one_or_none()
    if intent is None:
        return None
    return _intent_to_dict(intent)
