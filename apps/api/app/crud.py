"""CRUD helpers — Sprint 4 → Sprint 10.

All functions are async and receive an ``AsyncSession`` from the FastAPI
``get_db`` dependency.
"""
from __future__ import annotations

import math
import uuid
from datetime import datetime, timezone

import sqlalchemy as sa
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.base import Claims
from app.models.assistance import AssistanceRequest, ASSISTANCE_TYPES
from app.models.driver import Driver
from app.models.driver_capability import DriverCapability
from app.models.estimate import Estimate
from app.models.rating import Rating
from app.models.trip import Trip, TripEvent
from app.models.user import User


def _utc(dt: datetime) -> datetime:
    """Return dt as a tz-aware UTC datetime.

    SQLite stores DateTime(timezone=True) without the offset, so the value
    comes back as a naive datetime. PostgreSQL returns tz-aware datetimes.
    This helper normalises both cases so comparison with datetime.now(utc)
    always works.
    """
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


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
) -> Trip:
    """Create a new Trip from a valid, unexpired Estimate.

    The caller must already have a users row (call POST /v1/auth/register first).
    Raises HTTPException on any validation failure.
    """
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

    # 4. Create the trip, snapshotting the fare from the estimate
    trip = Trip(
        customer_id=user.id,
        status="pending",
        origin_lat=est.origin_lat,
        origin_lng=est.origin_lng,
        dest_lat=est.dest_lat,
        dest_lng=est.dest_lng,
        estimate_id=est.id,
        fare_xof=est.fare_xof,
        distance_km=est.distance_km,
        duration_min=est.duration_min,
    )
    db.add(trip)
    await db.flush()  # populate trip.id without committing yet

    # 5. Log the initial status_changed event
    event = TripEvent(
        trip_id=trip.id,
        event_type="status_changed",
        data={"from": None, "to": "pending"},
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
) -> list[Trip]:
    """Return all trips for the authenticated customer, newest first."""
    user = await _get_user_by_auth_id(db, auth_user_id)
    if user is None:
        return []

    result = await db.execute(
        select(Trip)
        .where(Trip.customer_id == user.id)
        .order_by(Trip.created_at.desc())
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

async def list_available_trips(db: AsyncSession) -> list[Trip]:
    """All pending trips, newest first (driver marketplace view)."""
    result = await db.execute(
        select(Trip)
        .where(Trip.status == "pending")
        .order_by(Trip.created_at.desc())
    )
    return list(result.scalars().all())


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
    ))
    await db.commit()
    await db.refresh(trip)
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
    ))
    await db.commit()
    await db.refresh(trip)
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
    # ETA: haversine distance from Abidjan dispatch centre to customer location
    req.eta_min = _compute_eta_min(_ABIDJAN_LAT, _ABIDJAN_LNG, req.lat, req.lng)
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
        out.append({
            "driver_id": str(driver.id),
            "user_id": user.user_id,
            "email": user.email,
            "status": driver.status,
            "license_number": driver.license_number,
            "capabilities": capabilities,
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
    unique_types = list(set(types))
    for t in unique_types:
        db.add(DriverCapability(driver_id=driver.id, type=t))
    await db.commit()
    return sorted(unique_types)
