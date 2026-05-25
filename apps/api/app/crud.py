"""CRUD helpers — Sprint 4 → Sprint 6.

All functions are async and receive an ``AsyncSession`` from the FastAPI
``get_db`` dependency.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.base import Claims
from app.models.estimate import Estimate
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
