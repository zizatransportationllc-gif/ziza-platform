"""CRUD helpers — Sprint 4 → Sprint 54.

All functions are async and receive an ``AsyncSession`` from the FastAPI
``get_db`` dependency.
"""
from __future__ import annotations

import base64
import io
import math
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import sqlalchemy as sa
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.base import Claims
from app.models.device_token import DeviceToken
from app.models.driver import Driver
from app.models.driver_capability import DriverCapability
from app.models.driver_document import DriverDocument, DOCUMENT_TYPES
from app.models.professional_document import ProfessionalDocument  # Sprint 54
from app.models.message import Message  # Sprint 66
from app.storage import signed_read_url  # F1 (Sprint 68) — private KYC reads
from app.models.bank_account import BankAccount  # Sprint 69
from app import crypto as _crypto  # Sprint 69 — bank field encryption
from app.models.notification import Notification
from app.models.driver_location import DriverLocation
from app.models.payment import PaymentIntent
from app.models.refresh_token import RefreshToken
from app.models.saved_place import SavedPlace
from app.models.estimate import Estimate
from app.models.payout_request import PayoutRequest as PayoutRequestModel, CommissionSetting
from app.models.application import DriverApplication  # Sprint 30
from app.models.flag import FeatureFlag, InviteCode, DEFAULT_FLAGS  # Sprint 31
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
    "economy": "Economy",
    "comfort": "Comfort",
    "premium": "Premium",
}

CATEGORY_DESCRIPTIONS: dict[str, str] = {
    "economy": "Standard ride at the best price",
    "comfort": "Spacious air-conditioned vehicle",
    "premium": "High-end sedan",
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
    data: dict | None = None,   # Sprint 56: extra context forwarded to email templates
) -> None:
    """Insert an in-app Notification row for the given users.id UUID.

    Fire-and-forget: errors are silently swallowed so they never break the
    parent transaction.  The caller must already have committed the triggering
    event before calling this.

    Sprint 26: also triggers external channel dispatch (FCM, email, SMS)
    via ``_dispatch_external``.
    """
    try:
        notif = Notification(
            user_id=user_uuid,
            type=notif_type,
            title=title,
            body=body,
            channel="in_app",
        )
        db.add(notif)
        await db.commit()
    except Exception:
        await db.rollback()

    # Sprint 26 — external channels (fire-and-forget)
    # Sprint 56: forward extra data dict for rich email templates
    await _dispatch_external(db, user_uuid, notif_type, title, body, data=data)


async def _dispatch_external(
    db: AsyncSession,
    user_uuid: uuid.UUID,
    event_type: str,
    title: str,
    body: str,
    data: dict | None = None,
) -> None:
    """Dispatch an event to all registered external notification channels.

    Sprint 26: email/SMS channels receive the user's email as recipient.
    Sprint 39: push channels receive each registered device token in turn.

    Completely fire-and-forget — never raises.
    """
    from app.notifications.dispatcher import get_channels, dispatch_external  # noqa: PLC0415

    channels = get_channels()
    if not channels:
        return

    try:
        # Resolve user for email/SMS channels
        user_result = await db.execute(select(User).where(User.id == user_uuid))
        user: User | None = user_result.scalar_one_or_none()
        if user is None:
            return

        # Sprint 56: always include event_type so HTML templates can look it up,
        # even when extra context data is provided.
        payload = {**(data or {}), "event_type": event_type}

        # 1. Email / SMS channels — recipient = user email
        await dispatch_external(
            db=db,
            user_uuid=user_uuid,
            recipient=user.email,
            event_type=event_type,
            title=title,
            body=body,
            data=payload,
        )

        # 2. Push channels — one call per registered device token (Sprint 39)
        token_rows = (
            await db.execute(
                select(DeviceToken).where(DeviceToken.user_id == user_uuid)
            )
        ).scalars().all()

        for dt in token_rows:
            await dispatch_external(
                db=db,
                user_uuid=user_uuid,
                recipient=dt.token,
                event_type=event_type,
                title=title,
                body=body,
                data=payload,
            )

    except Exception:
        pass  # never break the caller


async def list_notifications(
    db: AsyncSession,
    auth_user_id: str,
    limit: int = 20,
    offset: int = 0,
) -> list[Notification]:
    """Return in-app notifications for the authenticated user, newest first.

    Sprint 26: filters to ``channel = 'in_app'`` only so external-channel rows
    (push, email, sms) do not appear in the frontend polling endpoint.
    """
    user = await _get_user_by_auth_id(db, auth_user_id)
    if user is None:
        return []
    result = await db.execute(
        select(Notification)
        .where(
            Notification.user_id == user.id,
            Notification.channel == "in_app",
        )
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


async def get_unread_count(db: AsyncSession, auth_user_id: str) -> int:
    """Return the number of unread in-app notifications for the authenticated user."""
    user = await _get_user_by_auth_id(db, auth_user_id)
    if user is None:
        return 0
    result = await db.execute(
        select(func.count(Notification.id))
        .where(
            Notification.user_id == user.id,
            Notification.read.is_(False),
            Notification.channel == "in_app",
        )
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


async def delete_notification(
    db: AsyncSession, auth_user_id: str, notification_id: str
) -> bool:
    """Delete one of the user's notifications. Returns True if a row was removed.

    Scoped to the authenticated user so a caller can only delete their own.
    """
    user = await _get_user_by_auth_id(db, auth_user_id)
    if user is None:
        return False
    try:
        notif_uuid = uuid.UUID(notification_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid notification_id format",
        )
    result = await db.execute(
        sa.delete(Notification)
        .where(Notification.id == notif_uuid, Notification.user_id == user.id)
        .returning(Notification.id)
    )
    await db.commit()
    return result.first() is not None


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


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    """Return a User row by email address (used by local-auth signup/login)."""
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def create_local_user(
    db: AsyncSession,
    *,
    user_id: str,
    email: str,
    password_hash: str,
    role: str,
    name: str | None = None,
    phone: str | None = None,
    first_name: str | None = None,
    last_name: str | None = None,
    date_of_birth: str | None = None,
) -> User:
    """Create a new user with a bcrypt-hashed password (Sprint 49 — local auth).

    Sets provider='local' to distinguish these accounts from Firebase/dev-seeded ones.
    Sprint 64: adds first_name, last_name, date_of_birth.
    """
    user = User(
        user_id=user_id,
        email=email,
        role=role,
        provider="local",
        name=name,
        phone=phone,
        password_hash=password_hash,
        first_name=first_name,
        last_name=last_name,
        date_of_birth=date_of_birth,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def create_firebase_user(
    db: AsyncSession, *, uid: str, email: str, role: str,
    first_name: str | None = None, last_name: str | None = None,
    date_of_birth: str | None = None, phone: str | None = None, name: str | None = None,
) -> User:
    """Create a new Firebase-backed user (provider='firebase').

    Identity resolution (by uid, then verified-email collision policy) and the
    admin gate live in the POST /v1/auth/firebase endpoint; by the time this is
    called the caller has confirmed no account exists for this uid or email.
    """
    user = User(
        user_id=uid, email=email, role=role, provider="firebase",
        name=name, phone=phone, first_name=first_name,
        last_name=last_name, date_of_birth=date_of_birth,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def list_local_users(db: AsyncSession) -> list[User]:
    """Return all bcrypt-backed local accounts (provider='local' with a hash).

    Used by the one-shot migration that exports these accounts to Firebase
    Auth via ``firebase auth:import`` (Phase 0).
    """
    result = await db.execute(
        select(User).where(User.provider == "local", User.password_hash.isnot(None))
    )
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# Trips — Sprint 6
# ---------------------------------------------------------------------------

# Statuses from which a customer can cancel
_CANCELLABLE_STATUSES = frozenset({"pending", "accepted", "arrived"})


async def create_trip(
    db: AsyncSession,
    claims: Claims,
    estimate_id: str,
    promo_code: str | None = None,
    category: str = "economy",
    origin_address: str | None = None,
    dest_address: str | None = None,
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

    # 4a. Apply the (admin-configurable) category multiplier to the economy fare
    cat_multipliers = await get_category_multipliers(db)
    cat_multiplier = cat_multipliers.get(category, CATEGORY_MULTIPLIERS.get(category, 1.0))
    base_fare = max(1, round(est.fare_cents * cat_multiplier)) if est.fare_cents else est.fare_cents

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
        origin_address=(origin_address or None),
        dest_address=(dest_address or None),
        estimate_id=est.id,
        fare_cents=final_fare,
        distance_km=est.distance_km,
        duration_min=est.duration_min,
        promo_code=promo_code.upper().strip() if promo_code else None,
        discount_pct=applied_discount_pct,
        category=category,
        # 4-digit code the customer shares with the driver to confirm the pickup
        verification_code=f"{secrets.randbelow(10000):04d}",
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

    driver = Driver(user_id=user.id, status="pending_docs")  # Sprint 54 — blocked until docs validated
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
    """Raise if driver is None or blocked (inactive / suspended).

    Sprint 54: 'pending_docs' is allowed — drivers must be able to read their
    profile and submit KYC documents while awaiting admin validation.
    Only 'accept_trip' enforces the stricter 'active'-only check.
    """
    if driver is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver profile not found — call POST /v1/drivers/register first",
        )
    if driver.status in ("inactive", "suspended"):
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

    # Sprint 54: only fully verified drivers may accept trips
    if driver.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Driver account must be verified (active) to accept trips",
        )

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
        "🚗 Driver on the way",
        "A driver accepted your ride. They are on the way!",
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


async def mark_trip_arrived(db: AsyncSession, trip_id: str, auth_user_id: str) -> Trip:
    """Driver confirms arrival at the pickup point → arrived (leg 1 done).

    The trip cannot move to leg 2 until the customer confirms they are on
    board (see ``confirm_trip_onboard``).
    """
    driver = _require_driver(await _get_driver_by_auth_id(db, auth_user_id))
    trip = await _load_trip_for_driver(db, trip_id, driver)
    if trip.status != "accepted":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot mark arrival on a trip in '{trip.status}' status",
        )

    trip.status = "arrived"
    trip.updated_at = datetime.now(timezone.utc)
    db.add(TripEvent(
        trip_id=trip.id,
        event_type="status_changed",
        data={"from": "accepted", "to": "arrived"},
        actor="driver",
    ))
    await db.commit()
    await db.refresh(trip)
    # Notify the customer so they can confirm they are in the car
    await _push_notification(
        db, trip.customer_id,
        "driver_arrived",
        "📍 Your driver has arrived",
        "Your driver is at the pickup point. Confirm once you are in the car.",
    )
    return trip


async def confirm_trip_onboard(db: AsyncSession, trip_id: str, auth_user_id: str) -> Trip:
    """Customer confirms they are in the car → in_progress (leg 2 starts).

    Only the customer who owns the trip may confirm, and only once the driver
    has marked arrival (status == "arrived").
    """
    trip, _ = await get_trip(db, trip_id, auth_user_id)
    if trip.status != "arrived":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "You can only confirm pickup once the driver has arrived "
                f"(current status: {trip.status})"
            ),
        )

    trip.status = "in_progress"
    trip.updated_at = datetime.now(timezone.utc)
    db.add(TripEvent(
        trip_id=trip.id,
        event_type="status_changed",
        data={"from": "arrived", "to": "in_progress"},
        actor="customer",
    ))
    await db.commit()
    await db.refresh(trip)
    # Notify the driver that the customer is on board → drive to destination
    if trip.driver_id is not None:
        driver = await db.get(Driver, trip.driver_id)
        if driver is not None:
            await _push_notification(
                db, driver.user_id,
                "trip_started",
                "🚗 Customer on board",
                "The customer confirmed pickup. Navigate to the destination.",
            )
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
    fare_str = f" — {trip.fare_cents:,} XOF".replace(",", " ") if trip.fare_cents else ""
    await _push_notification(
        db, trip.customer_id,
        "trip_completed",
        "✅ Trip completed",
        f"Your ride is done{fare_str}. Thank you for choosing Ziza!",
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

# Newark, NJ city centre used as the default dispatch origin for ETA calculation
_NEWARK_LAT: float = 40.7357
_NEWARK_LNG: float = -74.1724


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
        select(func.sum(Trip.fare_cents), func.count(Trip.id))
        .where(Trip.driver_id == driver.id, Trip.status == "completed")
    )
    total_cents, total_trips = _sum_count(r_total.one())

    # Today
    r_today = await db.execute(
        select(func.sum(Trip.fare_cents), func.count(Trip.id))
        .where(
            Trip.driver_id == driver.id,
            Trip.status == "completed",
            Trip.updated_at >= today_start,
        )
    )
    today_cents, today_trips = _sum_count(r_today.one())

    # This week
    r_week = await db.execute(
        select(func.sum(Trip.fare_cents), func.count(Trip.id))
        .where(
            Trip.driver_id == driver.id,
            Trip.status == "completed",
            Trip.updated_at >= week_start,
        )
    )
    week_cents, week_trips = _sum_count(r_week.one())

    # Last 10 completed trips
    r_hist = await db.execute(
        select(Trip)
        .where(Trip.driver_id == driver.id, Trip.status == "completed")
        .order_by(Trip.updated_at.desc())
        .limit(10)
    )
    recent = list(r_hist.scalars().all())

    return {
        "total_cents": total_cents,
        "total_trips": total_trips,
        "today_cents": today_cents,
        "today_trips": today_trips,
        "week_cents": week_cents,
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
        select(func.sum(Trip.fare_cents)).where(Trip.status == "completed")
    )
    total_revenue_cents = int(r_rev.scalar() or 0)

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

    r_pay_cents = await db.execute(
        select(func.sum(PaymentIntent.amount_cents)).where(PaymentIntent.status == "paid")
    )
    total_paid_cents = int(r_pay_cents.scalar() or 0)

    return {
        "trips": {
            "total": sum(trips_by_status.values()),
            "by_status": trips_by_status,
            "total_revenue_cents": total_revenue_cents,
        },
        "drivers": {
            "total": sum(drivers_by_status.values()),
            "by_status": drivers_by_status,
        },
        "payments": {
            "total_paid": total_paid_count,
            "total_paid_cents": total_paid_cents,
        },
    }


async def get_public_stats(db: AsyncSession) -> dict:
    """Public landing-page counters (Sprint 51).

    Matches the labels shown on the landing page:
      - total_trips   → trips with status "completed"
      - total_drivers → drivers with status "active"
      - total_cities  → active service cities ("Cities served")
    """
    from app.models.city import City  # noqa: PLC0415

    completed = await db.scalar(
        select(func.count()).select_from(Trip).where(Trip.status == "completed")
    )
    active_drivers = await db.scalar(
        select(func.count()).select_from(Driver).where(Driver.status == "active")
    )
    active_cities = await db.scalar(
        select(func.count()).select_from(City).where(City.active.is_(True))
    )
    return {
        "total_trips": int(completed or 0),
        "total_drivers": int(active_drivers or 0),
        "total_cities": int(active_cities or 0),
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
            "fare_cents": trip.fare_cents,
            "distance_km": trip.distance_km,
            "duration_min": trip.duration_min,
            "customer_email": customer.email,
            "driver_id": str(trip.driver_id) if trip.driver_id else None,
            "category": getattr(trip, "category", "economy"),
            "paid_at": _utc(trip.paid_at).isoformat() if trip.paid_at else None,
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
            "name": u.name,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "date_of_birth": u.date_of_birth,
            "phone": u.phone,
            "provider": u.provider,
            "created_at": u.created_at.isoformat(),
        }
        for u in users
    ]


# ---------------------------------------------------------------------------
# Sprint 13 — Driver presence, driver trip history
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


async def _enforce_withdrawal_limits(db: AsyncSession, model, id_col, id_value, amount_cents: int) -> None:
    """WS5 — AML caps: per-request max and per-user daily limit (USD cents).

    The daily limit counts today's non-rejected requests for this payee.
    """
    from app.config import settings as _s  # noqa: PLC0415

    if amount_cents > _s.withdrawal_max_single_cents:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Amount exceeds the per-request limit ({_s.withdrawal_max_single_cents})",
        )
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_total = int((await db.execute(
        select(func.coalesce(func.sum(model.amount_cents), 0)).where(
            id_col == id_value,
            model.created_at >= today,
            model.status != "rejected",
        )
    )).scalar_one() or 0)
    if today_total + amount_cents > _s.withdrawal_daily_limit_cents:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Amount exceeds the daily withdrawal limit ({_s.withdrawal_daily_limit_cents})",
        )


async def create_payout_request(
    db: AsyncSession,
    auth_user_id: str,
    amount_cents: int,
) -> PayoutRequestModel:
    """Driver creates a payout (withdrawal) request.

    Raises 422 if amount_cents ≤ 0 or exceeds the driver's available balance.
    """
    driver = _require_driver(await _get_driver_by_auth_id(db, auth_user_id))
    if amount_cents <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="amount_cents must be greater than 0",
        )
    await _enforce_withdrawal_limits(db, PayoutRequestModel, PayoutRequestModel.driver_id, driver.id, amount_cents)
    *_, disponible = await _driver_gains_and_payouts(db, driver)
    disponible = max(disponible, 0)
    if amount_cents > disponible:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Amount exceeds available balance ({disponible})",
        )
    req = PayoutRequestModel(
        driver_id=driver.id,
        amount_cents=amount_cents,
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
            "amount_cents": req.amount_cents,
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
        "amount_cents": req.amount_cents,
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
    """Return the authenticated user's profile including name, phone, and identity fields."""
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
        "first_name": user.first_name,
        "last_name": user.last_name,
        "date_of_birth": user.date_of_birth,
        "avatar_url": signed_read_url(user.avatar_url),
        "home_address": user.home_address,
        "created_at": _utc(user.created_at).isoformat(),
    }


async def update_user_profile(
    db: AsyncSession,
    auth_user_id: str,
    name: str | None,
    phone: str | None,
    first_name: str | None = None,
    last_name: str | None = None,
    date_of_birth: str | None = None,
    avatar_url: str | None = None,
    home_address: str | None = None,
) -> dict:
    """Update the user's name, phone, and identity fields (Sprint 66).

    A ``None`` value for a field means "leave unchanged".
    Pass an empty string to clear the field. Email is NOT editable here — it is
    the Firebase identity and must be changed through the auth provider.
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
    if first_name is not None:
        user.first_name = first_name if first_name != "" else None
    if last_name is not None:
        user.last_name = last_name if last_name != "" else None
    if date_of_birth is not None:
        user.date_of_birth = date_of_birth if date_of_birth != "" else None
    if avatar_url is not None:
        user.avatar_url = avatar_url if avatar_url != "" else None
    if home_address is not None:
        user.home_address = home_address if home_address != "" else None
    user.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)
    return {
        "user_id": user.user_id,
        "email": user.email,
        "role": user.role,
        "name": user.name,
        "phone": user.phone,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "date_of_birth": user.date_of_birth,
        "avatar_url": signed_read_url(user.avatar_url),
        "home_address": user.home_address,
        "created_at": _utc(user.created_at).isoformat(),
    }


# ---------------------------------------------------------------------------
# Sprint 69 — Bank account (payout destination). account_number is masked on read.
# ---------------------------------------------------------------------------

def _bank_account_to_dict(ba) -> dict:
    return {
        "account_holder_name": ba.account_holder_name,
        "bank_name": ba.bank_name,
        "routing_number": ba.routing_number,
        "account_number_last4": ba.account_last4,
        "account_type": ba.account_type,
        "country": ba.country,
        "updated_at": _utc(ba.updated_at).isoformat(),
    }


def decrypt_bank_account_number(ba) -> str:
    """Return the cleartext account number (for payout execution only)."""
    return _crypto.decrypt(ba.account_number)


async def get_bank_account(db: AsyncSession, auth_user_id: str) -> dict | None:
    """Return the user's bank account (masked), or None if not set."""
    user = await _get_user_by_auth_id(db, auth_user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    ba = await db.scalar(select(BankAccount).where(BankAccount.user_id == user.id))
    return _bank_account_to_dict(ba) if ba else None


async def upsert_bank_account(
    db: AsyncSession, auth_user_id: str, *,
    account_holder_name: str, routing_number: str, account_number: str,
    bank_name: str | None = None, account_type: str = "checking", country: str = "US",
) -> dict:
    """Create or replace the user's bank account. Returns the masked record."""
    holder = (account_holder_name or "").strip()
    routing = "".join(c for c in (routing_number or "") if c.isdigit())
    number = "".join(c for c in (account_number or "") if c.isdigit())
    if not holder:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="account_holder_name is required")
    if len(number) < 4:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="account_number is invalid")
    if not routing:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="routing_number is required")
    if account_type not in ("checking", "savings"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="account_type must be checking or savings")

    # Never store cleartext bank numbers in production.
    from app.config import settings as _s  # noqa: PLC0415
    if _s.environment == "prod" and not _s.bank_encryption_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Bank account storage is not configured (encryption key missing)",
        )

    user = await _get_user_by_auth_id(db, auth_user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    ba = await db.scalar(select(BankAccount).where(BankAccount.user_id == user.id))
    if ba is None:
        ba = BankAccount(user_id=user.id)
        db.add(ba)
    ba.account_holder_name = holder
    ba.bank_name = (bank_name or "").strip() or None
    ba.routing_number = routing
    ba.account_number = _crypto.encrypt(number)  # encrypted at rest (Fernet)
    ba.account_last4 = number[-4:]
    ba.account_type = account_type
    ba.country = (country or "US").upper()[:2]
    ba.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(ba)
    return _bank_account_to_dict(ba)


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
# Pricing — base fare & per-mile rate (USD cents), admin-configurable (Sprint 66)
# ---------------------------------------------------------------------------

_PRICING_BASE_KEY = "base_fare_cents"
_PRICING_PER_MILE_KEY = "per_mile_cents"
_PRICING_PER_MINUTE_KEY = "per_minute_cents"
_PRICING_MIN_KEY = "min_fare_cents"
# Per-category fare multipliers (configurable; defaults from CATEGORY_MULTIPLIERS)
_CATEGORY_MULT_KEYS = {
    "economy": "cat_mult_economy",
    "comfort": "cat_mult_comfort",
    "premium": "cat_mult_premium",
}


async def _get_setting_float(db: AsyncSession, key: str, default: float) -> float:
    result = await db.execute(
        select(PlatformSetting).where(PlatformSetting.key == key)
    )
    row = result.scalar_one_or_none()
    if row is None:
        return default
    try:
        return float(row.value)
    except (ValueError, TypeError):
        return default


async def _get_setting_int(db: AsyncSession, key: str, default: int) -> int:
    result = await db.execute(
        select(PlatformSetting).where(PlatformSetting.key == key)
    )
    row = result.scalar_one_or_none()
    if row is None:
        return default
    try:
        return int(row.value)
    except (ValueError, TypeError):
        return default


async def _upsert_setting(db: AsyncSession, key: str, value: str) -> None:
    result = await db.execute(
        select(PlatformSetting).where(PlatformSetting.key == key)
    )
    row = result.scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if row is None:
        db.add(PlatformSetting(key=key, value=value, updated_at=now))
    else:
        row.value = value
        row.updated_at = now


async def get_pricing(db: AsyncSession) -> tuple[int, int]:
    """Return (base_fare_cents, per_mile_cents) — USD cents.

    Reads admin overrides from platform_settings, falling back to the config
    defaults (``fare_base_cents`` / ``fare_per_mile_cents``).
    """
    from app.config import settings as _settings  # noqa: PLC0415

    base = await _get_setting_int(db, _PRICING_BASE_KEY, _settings.fare_base_cents)
    per_mile = await _get_setting_int(db, _PRICING_PER_MILE_KEY, _settings.fare_per_mile_cents)
    return base, per_mile


async def set_pricing(
    db: AsyncSession, base_fare_cents: int, per_mile_cents: int
) -> tuple[int, int]:
    """Upsert the base fare and per-mile rate (USD cents). Returns the stored pair.

    Validates 0 < base ≤ 100_000 and 0 < per_mile ≤ 100_000 (i.e. ≤ $1000).
    """
    if not (0 < base_fare_cents <= 100_000) or not (0 < per_mile_cents <= 100_000):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="base_fare_cents and per_mile_cents must be between 1 and 100000",
        )
    await _upsert_setting(db, _PRICING_BASE_KEY, str(base_fare_cents))
    await _upsert_setting(db, _PRICING_PER_MILE_KEY, str(per_mile_cents))
    await db.commit()
    return base_fare_cents, per_mile_cents


async def get_pricing_config(db: AsyncSession) -> dict:
    """Return the full fare-formula config (USD cents), with admin overrides
    falling back to the config defaults.

    Keys: base_fare_cents, per_mile_cents, per_minute_cents, min_fare_cents.
    """
    from app.config import settings as _settings  # noqa: PLC0415

    base = await _get_setting_int(db, _PRICING_BASE_KEY, _settings.fare_base_cents)
    per_mile = await _get_setting_int(db, _PRICING_PER_MILE_KEY, _settings.fare_per_mile_cents)
    per_minute = await _get_setting_int(db, _PRICING_PER_MINUTE_KEY, _settings.fare_per_minute_cents)
    # Minimum fare defaults to the base fare when never set.
    min_fare = await _get_setting_int(db, _PRICING_MIN_KEY, base)
    return {
        "base_fare_cents": base,
        "per_mile_cents": per_mile,
        "per_minute_cents": per_minute,
        "min_fare_cents": min_fare,
    }


async def get_category_multipliers(db: AsyncSession) -> dict[str, float]:
    """Return the per-category fare multipliers (admin overrides → defaults)."""
    out: dict[str, float] = {}
    for cat, key in _CATEGORY_MULT_KEYS.items():
        out[cat] = await _get_setting_float(db, key, CATEGORY_MULTIPLIERS[cat])
    return out


async def set_pricing_config(
    db: AsyncSession,
    base_fare_cents: int,
    per_mile_cents: int,
    per_minute_cents: int = 0,
    min_fare_cents: int | None = None,
    category_multipliers: dict[str, float] | None = None,
) -> None:
    """Upsert the full fare formula. Validates ranges; commits once.

    ``min_fare_cents`` defaults to ``base_fare_cents`` when not supplied.
    """
    floor = base_fare_cents if min_fare_cents is None else min_fare_cents
    if not (0 < base_fare_cents <= 100_000) or not (0 < per_mile_cents <= 100_000):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="base_fare_cents and per_mile_cents must be between 1 and 100000",
        )
    if not (0 <= per_minute_cents <= 100_000):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="per_minute_cents must be between 0 and 100000",
        )
    if not (0 < floor <= 100_000):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="min_fare_cents must be between 1 and 100000",
        )
    await _upsert_setting(db, _PRICING_BASE_KEY, str(base_fare_cents))
    await _upsert_setting(db, _PRICING_PER_MILE_KEY, str(per_mile_cents))
    await _upsert_setting(db, _PRICING_PER_MINUTE_KEY, str(per_minute_cents))
    await _upsert_setting(db, _PRICING_MIN_KEY, str(floor))
    if category_multipliers:
        for cat, key in _CATEGORY_MULT_KEYS.items():
            if cat in category_multipliers:
                mult = float(category_multipliers[cat])
                if not (0 < mult <= 100):
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"category multiplier for '{cat}' must be between 0 and 100",
                    )
                await _upsert_setting(db, key, str(mult))
    await db.commit()


# ---------------------------------------------------------------------------
# Payment split config — taxes, platform fee, Stripe fee estimate (Sprint 70)
# Admin-configurable via GET/PATCH /v1/admin/settings/payments.
# ---------------------------------------------------------------------------

_PAY_RIDE_TAX_KEY = "ride_tax_flat_cents"
_PAY_RIDE_SPLIT_KEY = "ride_driver_split_pct"
_PAY_CRAFT_FEE_KEY = "craft_platform_fee_pct"
_PAY_CRAFT_TAX_KEY = "craft_tax_pct"
_PAY_STRIPE_PCT_KEY = "stripe_fee_pct"
_PAY_STRIPE_FIXED_KEY = "stripe_fee_fixed_cents"


async def load_payment_config(db: AsyncSession):
    """Return the split ``PaymentConfig``, applying admin overrides.

    Falls back to the config defaults (``settings.*``) for any key not persisted.
    """
    from app.config import settings as _settings  # noqa: PLC0415
    from app.payment.split import PaymentConfig  # noqa: PLC0415

    return PaymentConfig(
        ride_tax_flat_cents=await _get_setting_int(
            db, _PAY_RIDE_TAX_KEY, _settings.ride_tax_flat_cents
        ),
        ride_driver_split_pct=await _get_setting_int(
            db, _PAY_RIDE_SPLIT_KEY, _settings.ride_driver_split_pct
        ),
        craft_platform_fee_pct=await _get_setting_float(
            db, _PAY_CRAFT_FEE_KEY, _settings.craft_platform_fee_pct
        ),
        craft_tax_pct=await _get_setting_float(
            db, _PAY_CRAFT_TAX_KEY, _settings.craft_tax_pct
        ),
        stripe_fee_pct=await _get_setting_float(
            db, _PAY_STRIPE_PCT_KEY, _settings.stripe_fee_pct
        ),
        stripe_fee_fixed_cents=await _get_setting_int(
            db, _PAY_STRIPE_FIXED_KEY, _settings.stripe_fee_fixed_cents
        ),
    )


async def get_payment_settings(db: AsyncSession) -> dict:
    """Return the current payment-split settings (admin view)."""
    cfg = await load_payment_config(db)
    return {
        "ride_tax_flat_cents": cfg.ride_tax_flat_cents,
        "ride_driver_split_pct": cfg.ride_driver_split_pct,
        "craft_platform_fee_pct": cfg.craft_platform_fee_pct,
        "craft_tax_pct": cfg.craft_tax_pct,
        "stripe_fee_pct": cfg.stripe_fee_pct,
        "stripe_fee_fixed_cents": cfg.stripe_fee_fixed_cents,
    }


async def set_payment_settings(
    db: AsyncSession,
    *,
    ride_tax_flat_cents: int | None = None,
    ride_driver_split_pct: int | None = None,
    craft_platform_fee_pct: float | None = None,
    craft_tax_pct: float | None = None,
    stripe_fee_pct: float | None = None,
    stripe_fee_fixed_cents: int | None = None,
) -> dict:
    """Upsert any subset of the payment-split settings. Returns the merged view.

    Validates ranges: cents ≥ 0, percentages in [0, 100].
    """
    def _check_cents(name: str, v: int | None) -> None:
        if v is not None and v < 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{name} must be ≥ 0",
            )

    def _check_pct(name: str, v: float | None) -> None:
        if v is not None and not (0 <= v <= 100):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{name} must be between 0 and 100",
            )

    _check_cents("ride_tax_flat_cents", ride_tax_flat_cents)
    _check_pct("ride_driver_split_pct", ride_driver_split_pct)
    _check_pct("craft_platform_fee_pct", craft_platform_fee_pct)
    _check_pct("craft_tax_pct", craft_tax_pct)
    _check_pct("stripe_fee_pct", stripe_fee_pct)
    _check_cents("stripe_fee_fixed_cents", stripe_fee_fixed_cents)

    if ride_tax_flat_cents is not None:
        await _upsert_setting(db, _PAY_RIDE_TAX_KEY, str(ride_tax_flat_cents))
    if ride_driver_split_pct is not None:
        await _upsert_setting(db, _PAY_RIDE_SPLIT_KEY, str(ride_driver_split_pct))
    if craft_platform_fee_pct is not None:
        await _upsert_setting(db, _PAY_CRAFT_FEE_KEY, str(craft_platform_fee_pct))
    if craft_tax_pct is not None:
        await _upsert_setting(db, _PAY_CRAFT_TAX_KEY, str(craft_tax_pct))
    if stripe_fee_pct is not None:
        await _upsert_setting(db, _PAY_STRIPE_PCT_KEY, str(stripe_fee_pct))
    if stripe_fee_fixed_cents is not None:
        await _upsert_setting(db, _PAY_STRIPE_FIXED_KEY, str(stripe_fee_fixed_cents))
    await db.commit()
    return await get_payment_settings(db)


# ---------------------------------------------------------------------------
# Sprint 17 — Driver documents (KYC) & admin pending counts
# ---------------------------------------------------------------------------

_VALID_DOCUMENT_STATUSES = {"approved", "rejected", "needs_resubmission"}  # Sprint 56


def _ensure_pdf(data_url: str) -> str:
    """Sprint 61 — If data_url is an image, convert it to a PDF data URL.
    PDF data URLs are returned unchanged. Any other format passes through.
    """
    if data_url.startswith("data:application/pdf"):
        return data_url
    # Only attempt conversion for known image MIME types
    if not data_url.startswith("data:image/"):
        return data_url
    try:
        from PIL import Image  # Pillow>=10
        _header, b64 = data_url.split(",", 1)
        raw = base64.b64decode(b64)
        img = Image.open(io.BytesIO(raw))
        if img.mode in ("RGBA", "P", "LA"):
            img = img.convert("RGB")
        pdf_buf = io.BytesIO()
        img.save(pdf_buf, format="PDF", resolution=150)
        pdf_b64 = base64.b64encode(pdf_buf.getvalue()).decode()
        return f"data:application/pdf;base64,{pdf_b64}"
    except Exception:
        # Conversion failed — store the original to avoid data loss
        return data_url


async def submit_driver_document(
    db: AsyncSession,
    auth_user_id: str,
    doc_type: str,
    url: str,
) -> DriverDocument:
    """Driver submits or replaces a KYC document.

    Sprint 59: upsert by (driver_id, type) — re-uploading the same type
    updates the existing record in place (resets status → pending, clears
    note_admin) rather than accumulating duplicate rows.
    Sprint 61: images are converted to PDF before storage.
    Raises 422 if doc_type is not one of the allowed values.
    """
    url = _ensure_pdf(url)
    driver = _require_driver(await _get_driver_by_auth_id(db, auth_user_id))
    if doc_type not in DOCUMENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid document type '{doc_type}'. Valid: {sorted(DOCUMENT_TYPES)}",
        )

    existing = await db.scalar(
        select(DriverDocument).where(
            DriverDocument.driver_id == driver.id,
            DriverDocument.type == doc_type,
        )
    )
    is_replacement = existing is not None

    if is_replacement:
        existing.url = url
        existing.status = "pending"
        existing.note_admin = None
        await db.commit()
        await db.refresh(existing)
        doc = existing
    else:
        doc = DriverDocument(
            driver_id=driver.id,
            type=doc_type,
            url=url,
            status="pending",
        )
        db.add(doc)
        await db.commit()
        await db.refresh(doc)

    # Sprint 56 — notify driver on very first document submission
    if not is_replacement:
        other_count = await db.scalar(
            select(func.count(DriverDocument.id)).where(
                DriverDocument.driver_id == driver.id,
                DriverDocument.id != doc.id,
            )
        )
        if (other_count or 0) == 0:
            _user_row = await db.execute(select(User).where(User.id == driver.user_id))
            _user = _user_row.scalar_one_or_none()
            user_name = getattr(_user, "full_name", None) or (getattr(_user, "email", "") or "").split("@")[0]
            await _push_notification(
                db, driver.user_id,
                "application_submitted",
                "📋 Application received",
                "Your document has been submitted. We will review your application within 24-48 hours.",
                data={"user_name": user_name},
            )

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
            "url": signed_read_url(doc.url),
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

    # Sprint 18 / Sprint 56: notify the driver whose document was reviewed
    driver_result = await db.execute(select(Driver).where(Driver.id == doc.driver_id))
    reviewed_driver = driver_result.scalar_one_or_none()
    if reviewed_driver is not None:
        doc_type_label = {
            "license": "Driver's License",
            "insurance": "Vehicle Insurance",
            "registration": "Vehicle Registration",
            "id_card": "Government ID",
        }.get(doc.type, doc.type)

        # Resolve user name for email template
        _user_row = await db.execute(select(User).where(User.id == reviewed_driver.user_id))
        _user = _user_row.scalar_one_or_none()
        user_name = getattr(_user, "full_name", None) or (getattr(_user, "email", "") or "").split("@")[0]

        if new_status == "approved":
            await _push_notification(
                db, reviewed_driver.user_id,
                "document_approved",
                "✅ Document approved",
                f"Your {doc_type_label} has been approved by the Ziza team.",
            )
        elif new_status == "needs_resubmission":
            # Sprint 56: new status — ask driver to resubmit this specific document
            await _push_notification(
                db, reviewed_driver.user_id,
                "document_needs_resubmission",
                "🔄 Action required — document update",
                f"Please resubmit your {doc_type_label}."
                + (f" Note: {note_admin}" if note_admin else ""),
                data={
                    "user_name": user_name,
                    "doc_type": doc.type,
                    "note": note_admin or "",
                },
            )
        else:
            note_suffix = f" — {note_admin}" if note_admin else ""
            await _push_notification(
                db, reviewed_driver.user_id,
                "document_rejected",
                "❌ Document rejected",
                f"Your {doc_type_label} was rejected{note_suffix}. Please submit a new document.",
            )

    return {
        "document_id": str(doc.id),
        "driver_id": str(doc.driver_id),
        "type": doc.type,
        "url": signed_read_url(doc.url),
        "status": doc.status,
        "note_admin": doc.note_admin,
        "created_at": _utc(doc.created_at).isoformat(),
        "updated_at": _utc(doc.updated_at).isoformat(),
    }


async def admin_get_pending_counts(db: AsyncSession) -> dict:
    """Return counts of items awaiting admin action.

    Sprint 54: includes professional pending KYC documents.
    Sprint 57: includes onboarding (pending_docs drivers + professionals).
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

    r_prof_docs = await db.execute(
        select(func.count(ProfessionalDocument.id))
        .where(ProfessionalDocument.status == "pending")
    )
    prof_doc_count = r_prof_docs.scalar() or 0

    r_onb_drivers = await db.execute(
        select(func.count(Driver.id)).where(Driver.status == "pending_docs")
    )
    onb_driver_count = r_onb_drivers.scalar() or 0

    from app.models.craft import Professional as _Prof
    r_onb_profs = await db.execute(
        select(func.count(_Prof.id)).where(_Prof.status == "pending_docs")
    )
    onb_prof_count = r_onb_profs.scalar() or 0

    return {
        "payout_requests": int(payout_count),
        "documents": int(doc_count) + int(prof_doc_count),
        "onboarding": int(onb_driver_count) + int(onb_prof_count),
    }


_VALID_DRIVER_STATUSES = {"active", "inactive", "suspended", "pending_docs"}  # Sprint 54


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

    if trip.status not in ("accepted", "arrived", "in_progress"):
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

    # Determine reference point: pickup for accepted/arrived, dest for in_progress
    if trip.status in ("accepted", "arrived"):
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

    if trip.status not in ("accepted", "arrived", "in_progress"):
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
    if trip.status in ("accepted", "arrived"):
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
        "trip_id": str(intent.trip_id) if intent.trip_id else None,
        "craft_request_id": str(intent.craft_request_id) if getattr(intent, "craft_request_id", None) else None,
        "amount_cents": intent.amount_cents,
        "currency": intent.currency,
        "provider": intent.provider,
        "provider_ref": intent.provider_ref,
        "status": intent.status,
        "checkout_url": intent.checkout_url,
        # Sprint 70 — split breakdown (null for pre-redesign intents)
        "base_cents": intent.base_cents,
        "platform_fee_cents": intent.platform_fee_cents,
        "tax_cents": intent.tax_cents,
        "stripe_fee_est_cents": intent.stripe_fee_est_cents,
        "payee_amount_cents": intent.payee_amount_cents,
        "platform_amount_cents": intent.platform_amount_cents,
        "payee_account_id": intent.payee_account_id,
        "created_at": _utc(intent.created_at).isoformat(),
        "updated_at": _utc(intent.updated_at).isoformat(),
    }


async def _require_payee_connect_account(
    db: AsyncSession, model, payee_id, label: str
) -> str:
    """Return the payee's Stripe Connect account id, or raise 409.

    The split is done at charge time via a destination charge, so the payee
    (driver / professional) must have an onboarded Connect account that can
    receive transfers *before* the customer can pay. Sprint 70.
    """
    from app.payment import stripe_connect  # noqa: PLC0415

    payee = None
    if payee_id is not None:
        payee = await db.scalar(select(model).where(model.id == payee_id))
    account_id = getattr(payee, "stripe_account_id", None) if payee else None
    if not account_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"The {label} has not completed payment onboarding yet.",
        )
    try:
        st = stripe_connect.get_account_status(account_id)
    except Exception:  # noqa: BLE001 — treat provider errors as "not ready"
        st = {"payouts_enabled": False}
    if not st.get("payouts_enabled"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"The {label}'s payment account is not ready to receive funds.",
        )
    return account_id


async def create_payment_intent(
    db: AsyncSession,
    claims: Claims,
    trip_id: str,
    adapter,
    return_url: str = "https://app.ziza.ci/payment/return",
    notify_url: str | None = None,
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

    # Sprint 70 — split the fare at charge time (Connect destination charge).
    # The driver's share is transferred to their Connect account; the customer
    # is charged fare + tax; Ziza keeps the application fee.
    from app.payment.split import compute_ride_split  # noqa: PLC0415

    fare = trip.fare_cents or 0
    cfg = await load_payment_config(db)
    split = compute_ride_split(fare, cfg)

    destination = await _require_payee_connect_account(
        db, Driver, trip.driver_id, "driver"
    )

    intent = PaymentIntent(
        trip_id=trip.id,
        amount_cents=split.total_client_cents,
        provider=getattr(adapter, "_provider_name", "mock"),
        base_cents=split.base_cents,
        tax_cents=split.tax_cents,
        stripe_fee_est_cents=split.stripe_fee_est_cents,
        payee_amount_cents=split.driver_amount_cents,
        platform_amount_cents=split.platform_amount_cents,
        payee_account_id=destination,
    )
    db.add(intent)
    await db.flush()  # get the UUID

    # Call the payment provider (destination charge → driver share auto-transferred)
    checkout = await adapter.create_checkout(
        amount_cents=split.total_client_cents,
        ref=str(intent.id),
        return_url=return_url,
        notify_url=notify_url or None,
        destination=destination,
        application_fee_cents=split.platform_amount_cents,
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
        # WS2 — not a trip payment? It may be a wallet top-up (same webhook path).
        return await _confirm_wallet_topup(db, provider_ref, new_status)

    # Idempotency + state guard — providers (Stripe/CinetPay) deliver webhooks
    # at-least-once, so the same event may arrive several times.
    #   - Same status already applied → no-op (no re-stamp, no duplicate notif).
    #   - Already 'paid' (terminal)    → ignore later 'failed'/'expired' events.
    if intent.status == new_status or intent.status == "paid":
        return _intent_to_dict(intent)

    intent.status = new_status

    customer_uuid: uuid.UUID | None = None
    if new_status == "paid":
        now = datetime.now(timezone.utc)
        if intent.trip_id is not None:
            # Stamp the trip
            trip_result = await db.execute(select(Trip).where(Trip.id == intent.trip_id))
            trip: Trip | None = trip_result.scalar_one_or_none()
            if trip is not None:
                trip.paid_at = now
                customer_uuid = trip.customer_id
        elif intent.craft_request_id is not None:
            # Stamp the assistance (craft) request
            req = await db.get(CraftRequest, intent.craft_request_id)
            if req is not None:
                req.paid_at = now
                customer_uuid = req.customer_id

    await db.commit()
    await db.refresh(intent)

    # Sprint 26: notify the customer when payment is confirmed
    if new_status == "paid" and customer_uuid is not None:
        amount_cents = intent.amount_cents
        amount_str = f"${amount_cents / 100:,.2f}" if amount_cents else ""
        await _push_notification(
            db, customer_uuid,
            "payment_confirmed",
            "💳 Payment confirmed",
            f"Your payment{(' of ' + amount_str) if amount_str else ''} has been confirmed. Thank you!",
        )

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


async def refund_payment(db: AsyncSession, intent_id: str, adapter) -> dict:
    """WS4 — Admin refunds a paid trip payment (idempotent).

    Only a ``paid`` intent can be refunded; an already-``refunded`` intent is a
    no-op. Delegates to the provider and records ``status='refunded'``.
    """
    try:
        iid = uuid.UUID(intent_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid intent_id"
        )
    intent = await db.scalar(select(PaymentIntent).where(PaymentIntent.id == iid))
    if intent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment intent not found")
    if intent.status == "refunded":
        return _intent_to_dict(intent)  # idempotent
    if intent.status != "paid":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Only paid payments can be refunded (current: {intent.status!r})",
        )
    try:
        await adapter.refund(intent.provider_ref, intent.amount_cents)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Refund failed at provider: {exc}",
        )
    intent.status = "refunded"
    intent.updated_at = datetime.now(timezone.utc)
    trip = await db.scalar(select(Trip).where(Trip.id == intent.trip_id))
    customer_id = trip.customer_id if trip else None
    await db.commit()
    await db.refresh(intent)
    if customer_id is not None:
        try:
            await _push_notification(
                db, customer_id, "payment_refunded", "↩️ Payment refunded",
                f"Your payment of ${intent.amount_cents / 100:,.2f} has been refunded.",
            )
        except Exception:
            pass
    return _intent_to_dict(intent)


async def finance_reconciliation(db: AsyncSession) -> dict:
    """WS4 — Internal financial integrity report (foundation for daily reconciliation).

    Aggregates payments, payouts, top-ups, and checks that every wallet's stored
    balance equals the sum of its ledger transactions. ``balanced`` is False if
    any wallet's ledger does not reconcile.
    """
    async def _count_sum(model, amount_col, **filters):
        q = select(func.count(), func.coalesce(func.sum(amount_col), 0))
        for col, val in filters.items():
            q = q.where(getattr(model, col) == val)
        row = (await db.execute(q)).one()
        return int(row[0]), int(row[1] or 0)

    paid_n, paid_total = await _count_sum(PaymentIntent, PaymentIntent.amount_cents, status="paid")
    ref_n, ref_total = await _count_sum(PaymentIntent, PaymentIntent.amount_cents, status="refunded")
    _, drv_payout = await _count_sum(PayoutRequestModel, PayoutRequestModel.amount_cents, status="processed")
    _, pro_payout = await _count_sum(ProPayoutModel, ProPayoutModel.amount_cents, status="processed")
    _, topup_total = await _count_sum(WalletTopup, WalletTopup.amount_cents, status="paid")

    # Wallet ledger integrity
    wallets = list((await db.execute(select(Wallet))).scalars())
    mismatches = []
    total_balance = 0.0
    for w in wallets:
        total_balance += w.balance_cents
        txs = list((await db.execute(
            select(WalletTransaction).where(WalletTransaction.wallet_id == w.id)
        )).scalars())
        computed = 0.0
        for tx in txs:
            computed += -tx.amount_cents if tx.tx_type == "debit" else tx.amount_cents
        if abs(computed - w.balance_cents) > 0.001:
            mismatches.append({
                "wallet_id": str(w.id),
                "stored_balance_cents": w.balance_cents,
                "computed_balance_cents": computed,
            })

    return {
        "payments": {
            "paid_count": paid_n, "paid_total_cents": paid_total,
            "refunded_count": ref_n, "refunded_total_cents": ref_total,
        },
        "payouts": {
            "driver_processed_total_cents": drv_payout,
            "professional_processed_total_cents": pro_payout,
        },
        "topups": {"paid_total_cents": topup_total},
        "wallets": {
            "count": len(wallets),
            "total_balance_cents": total_balance,
            "ledger_mismatches": mismatches,
        },
        "balanced": len(mismatches) == 0,
    }


# ---------------------------------------------------------------------------
# WS6 (Sprint 68) — Finance observability (metrics, transactions feed, alerts)
# ---------------------------------------------------------------------------

async def _status_count(db: AsyncSession, model, status_value: str) -> int:
    return int((await db.execute(
        select(func.count()).select_from(model).where(model.status == status_value)
    )).scalar_one() or 0)


def _rate(ok: int, total: int):
    return round(ok / total, 4) if total else None


async def finance_metrics(db: AsyncSession) -> dict:
    """WS6 — operational metrics for the admin finance dashboard."""
    pay_paid = await _status_count(db, PaymentIntent, "paid")
    pay_failed = await _status_count(db, PaymentIntent, "failed")
    pay_pending = await _status_count(db, PaymentIntent, "pending")
    pay_refunded = await _status_count(db, PaymentIntent, "refunded")

    drv = {s: await _status_count(db, PayoutRequestModel, s)
           for s in ("processed", "failed", "approved", "pending")}
    pro = {s: await _status_count(db, ProPayoutModel, s)
           for s in ("processed", "failed", "approved", "pending")}
    topup = {s: await _status_count(db, WalletTopup, s)
             for s in ("paid", "pending", "failed")}

    payout_terminal = drv["processed"] + drv["failed"] + pro["processed"] + pro["failed"]
    return {
        "payments": {
            "paid": pay_paid, "failed": pay_failed, "pending": pay_pending,
            "refunded": pay_refunded,
            "success_rate": _rate(pay_paid, pay_paid + pay_failed),
        },
        "payouts": {
            "driver": drv,
            "professional": pro,
            "success_rate": _rate(drv["processed"] + pro["processed"], payout_terminal),
        },
        "topups": topup,
    }


async def finance_transactions(db: AsyncSession, limit: int = 50) -> list[dict]:
    """WS6 — unified recent money-movement feed for the admin dashboard."""
    items: list[dict] = []

    async def _collect(model, kind: str):
        rows = (await db.execute(
            select(model).order_by(model.updated_at.desc()).limit(limit)
        )).scalars()
        for r in rows:
            items.append({
                "kind": kind,
                "id": str(r.id),
                "amount_cents": r.amount_cents,
                "status": r.status,
                "at": _utc(r.updated_at).isoformat(),
            })

    await _collect(PaymentIntent, "payment")
    await _collect(PayoutRequestModel, "driver_payout")
    await _collect(ProPayoutModel, "professional_payout")
    await _collect(WalletTopup, "wallet_topup")

    items.sort(key=lambda x: x["at"], reverse=True)
    return items[:limit]


async def finance_alerts(db: AsyncSession) -> list[dict]:
    """WS6 — conditions an operator should act on (pollable by monitoring)."""
    alerts: list[dict] = []

    recon = await finance_reconciliation(db)
    if not recon["balanced"]:
        alerts.append({
            "level": "critical", "code": "ledger_imbalance",
            "message": "One or more wallet ledgers do not reconcile.",
            "count": len(recon["wallets"]["ledger_mismatches"]),
        })

    drv_failed = await _status_count(db, PayoutRequestModel, "failed")
    pro_failed = await _status_count(db, ProPayoutModel, "failed")
    if drv_failed + pro_failed > 0:
        alerts.append({
            "level": "warning", "code": "failed_payouts",
            "message": "There are failed payouts to investigate.",
            "count": drv_failed + pro_failed,
        })

    pay_failed = await _status_count(db, PaymentIntent, "failed")
    if pay_failed > 0:
        alerts.append({
            "level": "info", "code": "failed_payments",
            "message": "There are failed payment attempts.",
            "count": pay_failed,
        })

    return alerts


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


# ---------------------------------------------------------------------------
# Sprint 25 — Refresh tokens
# ---------------------------------------------------------------------------

import hashlib as _hashlib  # noqa: E402 — module already imported at top
import secrets as _secrets  # noqa: E402


async def _create_refresh_token_row(
    db: AsyncSession,
    auth_user_id: str,
) -> tuple[str, datetime]:
    """Insert a new RefreshToken row (no commit — caller must commit).

    Returns ``(raw_token, expires_at)``.
    """
    from app.config import settings as _cfg  # noqa: PLC0415

    raw = _secrets.token_urlsafe(32)
    token_hash = _hashlib.sha256(raw.encode()).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(days=_cfg.jwt_refresh_ttl_days)
    rt = RefreshToken(
        auth_user_id=auth_user_id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(rt)
    return raw, expires_at


async def create_refresh_token(
    db: AsyncSession,
    auth_user_id: str,
) -> tuple[str, datetime]:
    """Create and persist a new refresh token.

    Returns ``(raw_token, expires_at)``.  The raw token must be returned to
    the client; only its hash is stored.
    """
    raw, expires_at = await _create_refresh_token_row(db, auth_user_id)
    await db.commit()
    return raw, expires_at


async def use_refresh_token(
    db: AsyncSession,
    raw_token: str,
) -> dict:
    """Consume a refresh token and rotate it.

    Validates that the token:
    - Exists in the database (401 if not found).
    - Has not been revoked (401 if revoked).
    - Has not expired (401 if expired).

    On success:
    - Marks the old token as revoked.
    - Issues a new refresh token (rotation).

    Returns ``{auth_user_id, new_refresh_token, new_expires_at}``.
    """
    token_hash = _hashlib.sha256(raw_token.encode()).hexdigest()
    now = datetime.now(timezone.utc)

    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    rt: RefreshToken | None = result.scalar_one_or_none()

    if rt is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if rt.revoked_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if _utc(rt.expires_at) < now:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Revoke consumed token (prevents replay)
    rt.revoked_at = now

    # Issue a new refresh token (rotation)
    new_raw, new_expires = await _create_refresh_token_row(db, rt.auth_user_id)
    await db.commit()

    return {
        "auth_user_id": rt.auth_user_id,
        "new_refresh_token": new_raw,
        "new_expires_at": _utc(new_expires).isoformat(),
    }


async def revoke_refresh_token(
    db: AsyncSession,
    raw_token: str,
) -> bool:
    """Revoke a refresh token (logout).

    Returns ``True`` if the token was found and revoked, ``False`` if not found.
    Already-revoked tokens are silently accepted (idempotent).
    """
    token_hash = _hashlib.sha256(raw_token.encode()).hexdigest()
    now = datetime.now(timezone.utc)

    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    rt: RefreshToken | None = result.scalar_one_or_none()

    if rt is None:
        return False

    if rt.revoked_at is None:
        rt.revoked_at = now
        await db.commit()
    return True


# ---------------------------------------------------------------------------
# Device tokens — Sprint 26
# ---------------------------------------------------------------------------

async def register_device_token(
    db: AsyncSession,
    claims: Claims,
    token: str,
    platform: str = "web",
) -> dict:
    """Upsert a device token for the authenticated user.

    If the token already exists it is silently accepted (idempotent).
    Returns ``{"token": ..., "platform": ..., "user_id": ...}``.
    """
    user = await _get_user_by_auth_id(db, claims.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Upsert: skip insert if the token already exists for this user
    existing_result = await db.execute(
        select(DeviceToken).where(DeviceToken.token == token)
    )
    existing: DeviceToken | None = existing_result.scalar_one_or_none()
    if existing is None:
        dt = DeviceToken(user_id=user.id, token=token, platform=platform)
        db.add(dt)
        await db.commit()
        await db.refresh(dt)
    else:
        dt = existing

    return {
        "token": dt.token,
        "platform": dt.platform,
        "user_id": str(user.user_id),
    }


async def deregister_device_token(
    db: AsyncSession,
    claims: Claims,
    token: str,
) -> bool:
    """Remove a device token.

    Returns ``True`` if removed, ``False`` if not found.
    Ownership: the token must belong to the authenticated user (or admin).
    """
    user = await _get_user_by_auth_id(db, claims.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    result = await db.execute(
        select(DeviceToken).where(
            DeviceToken.token == token,
            DeviceToken.user_id == user.id,
        )
    )
    dt: DeviceToken | None = result.scalar_one_or_none()
    if dt is None:
        return False

    await db.delete(dt)
    await db.commit()
    return True


# ---------------------------------------------------------------------------
# Sprint 29 — Commission settings & payout batch
# ---------------------------------------------------------------------------

#: Default commission rates seeded at first call if the table is empty.
_DEFAULT_COMMISSION_RATES: dict[str, int] = {
    "default": 15,
    "economy": 15,
    "comfort": 18,
    "premium": 20,
}


async def _ensure_commission_defaults(db: AsyncSession) -> None:
    """Seed default commission rows if the table is empty.

    Called lazily so the table is populated on first use without needing
    a separate seed script.
    """
    r = await db.execute(select(func.count(CommissionSetting.id)))
    if (r.scalar() or 0) > 0:
        return
    for cat, rate in _DEFAULT_COMMISSION_RATES.items():
        db.add(CommissionSetting(category=cat, rate_pct=rate))
    await db.commit()


async def get_commission_settings(db: AsyncSession) -> list[dict]:
    """Return all commission rate settings, ordered by category name."""
    await _ensure_commission_defaults(db)
    result = await db.execute(
        select(CommissionSetting).order_by(CommissionSetting.category.asc())
    )
    return [
        {
            "category": row.category,
            "rate_pct": row.rate_pct,
            "effective_from": _utc(row.effective_from).isoformat(),
        }
        for row in result.scalars().all()
    ]


async def set_commission(
    db: AsyncSession,
    category: str,
    rate_pct: int,
    auth_user_id: str,
) -> dict:
    """Create or update the commission rate for a given category.

    ``category`` must be one of: economy, comfort, premium, default.
    ``rate_pct`` must be 0–100.
    Raises 422 on invalid inputs.
    """
    from app.models.payout_request import COMMISSION_CATEGORIES  # noqa: PLC0415

    if category not in COMMISSION_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid category '{category}'. Valid: {sorted(COMMISSION_CATEGORIES)}",
        )
    if not (0 <= rate_pct <= 100):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="rate_pct must be between 0 and 100",
        )
    user = await _get_user_by_auth_id(db, auth_user_id)
    created_by_id = user.id if user else None

    result = await db.execute(
        select(CommissionSetting).where(CommissionSetting.category == category)
    )
    setting: CommissionSetting | None = result.scalar_one_or_none()

    if setting is None:
        setting = CommissionSetting(
            category=category,
            rate_pct=rate_pct,
            created_by=created_by_id,
        )
        db.add(setting)
    else:
        setting.rate_pct = rate_pct
        setting.effective_from = datetime.now(timezone.utc)
        setting.created_by = created_by_id

    await db.commit()
    await db.refresh(setting)
    return {
        "category": setting.category,
        "rate_pct": setting.rate_pct,
        "effective_from": _utc(setting.effective_from).isoformat(),
    }


async def _get_commission_rate(db: AsyncSession, category: str) -> int:
    """Return the commission rate (int %) for a given trip/service category.

    Falls back to "default" if no specific rate is set for ``category``.
    Falls back to 15 % if the table has no "default" row either.
    """
    await _ensure_commission_defaults(db)

    result = await db.execute(
        select(CommissionSetting).where(CommissionSetting.category == category)
    )
    setting: CommissionSetting | None = result.scalar_one_or_none()
    if setting is not None:
        return setting.rate_pct

    # Fallback to "default"
    r_default = await db.execute(
        select(CommissionSetting).where(CommissionSetting.category == "default")
    )
    default_row: CommissionSetting | None = r_default.scalar_one_or_none()
    return default_row.rate_pct if default_row else 15


#: Payout statuses that count against a driver's available balance. A request
#: that is rejected frees the funds again; everything else (pending review,
#: approved, or already paid out) is "committed" and must not be re-withdrawn.
_ACTIVE_DRIVER_PAYOUT_STATUSES = ("pending", "approved", "processed")


async def _driver_gains_and_payouts(
    db: AsyncSession, driver
) -> tuple[int, int, int, int, int]:
    """Compute a driver's earnings vs. payouts.

    Returns ``(gains_bruts, commission, retraits_processed, committed, disponible)``
    where ``committed`` sums pending+approved+processed payouts and
    ``disponible = gains_bruts - commission - committed`` (not clamped).
    """
    trips_result = await db.execute(
        select(Trip.fare_cents, Trip.category)
        .where(Trip.driver_id == driver.id, Trip.status == "completed")
    )
    gains_bruts = 0
    commission_total = 0
    for fare_cents, category in trips_result.all():
        if fare_cents is None:
            continue
        gains_bruts += fare_cents
        rate = await _get_commission_rate(db, category or "economy")
        commission_total += math.floor(fare_cents * rate / 100)

    payouts_result = await db.execute(
        select(
            PayoutRequestModel.status,
            PayoutRequestModel.net_amount_cents,
            PayoutRequestModel.amount_cents,
        ).where(
            PayoutRequestModel.driver_id == driver.id,
            PayoutRequestModel.status.in_(_ACTIVE_DRIVER_PAYOUT_STATUSES),
        )
    )
    committed = 0
    retraits_processed = 0
    for st, net, gross in payouts_result.all():
        amt = net if net is not None else gross
        committed += amt
        if st == "processed":
            retraits_processed += amt

    disponible = gains_bruts - commission_total - committed
    return gains_bruts, commission_total, retraits_processed, committed, disponible


async def get_driver_balance(db: AsyncSession, auth_user_id: str) -> dict:
    """Return the net available balance for a driver.

    Formula:
        gains_bruts  = SUM(fare_cents) for completed trips of this driver
        commission   = SUM(fare_cents × rate_for_category(category))
        retraits     = SUM(net_amount_cents) for processed payout requests
        solde_net    = gains_bruts - commission - retraits

    Net balance is informational: it can be negative if old payout requests
    were processed before commission was tracked.
    """
    driver = await _get_driver_by_auth_id(db, auth_user_id)
    if driver is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver profile not found — call POST /v1/drivers/register first",
        )

    gains_bruts, commission_total, retraits, _committed, disponible = (
        await _driver_gains_and_payouts(db, driver)
    )
    solde_net = gains_bruts - commission_total - retraits

    # Sprint 70 — the driver's split share is transferred to their Connect
    # account at charge time; expose that (real, withdrawable) balance.
    from app.payment import stripe_connect  # noqa: PLC0415
    connect = stripe_connect.get_balance(driver.stripe_account_id or "")

    return {
        "driver_id": str(driver.id),
        "gains_bruts_cents": gains_bruts,
        "commission_cents": commission_total,
        "retraits_cents": retraits,
        "solde_net_cents": solde_net,
        "disponible_cents": max(disponible, 0),
        "connect_available_cents": connect["available_cents"],
        "connect_pending_cents": connect["pending_cents"],
    }


async def _resolve_payout_destination(
    db: AsyncSession, provider: str, *, user_id, stripe_account_id
) -> dict:
    """Resolve the provider-specific payout destination for a payee.

    - ``wellsfargo`` → the payee's bank account (decrypted) for ACH/RTP.
    - ``stripe`` / ``mock`` → the Stripe Connect account id.
    Raises ``RuntimeError`` when the payee has not set up a destination.
    """
    if provider == "wellsfargo":
        ba = await db.scalar(select(BankAccount).where(BankAccount.user_id == user_id))
        if ba is None:
            raise RuntimeError("Payee has no bank account on file")
        return {
            "routing": ba.routing_number,
            "account": decrypt_bank_account_number(ba),
            "holder": ba.account_holder_name,
        }
    if not stripe_account_id:
        raise RuntimeError("Payee has not set up payouts (no connected account)")
    return {"account_id": stripe_account_id}


async def run_payout_batch(db: AsyncSession) -> dict:
    """Process all approved payout requests via the configured PayoutAdapter.

    For each approved request:
      1. Compute commission_cents and net_amount_cents.
      2. Call PayoutAdapter.send_payout().
      3. On success  → status = "processed", processed_at = now, provider_ref set.
      4. On failure  → status = "failed"  (logged, does not abort the batch).

    Returns a summary dict: { processed, failed, total_net_cents, total_commission_cents }.
    """
    from app.config import settings as _settings  # noqa: PLC0415
    from app.payment.payout_adapter import get_payout_adapter  # noqa: PLC0415

    adapter = get_payout_adapter(_settings.payout_provider)

    # Fetch all approved payout requests with driver + user info
    result = await db.execute(
        select(PayoutRequestModel, Driver, User)
        .join(Driver, PayoutRequestModel.driver_id == Driver.id)
        .join(User, Driver.user_id == User.id)
        .where(PayoutRequestModel.status == "approved")
        .order_by(PayoutRequestModel.created_at.asc())
    )
    rows = result.all()

    processed = 0
    failed = 0
    total_net_cents = 0
    total_commission_cents = 0
    now = datetime.now(timezone.utc)

    for req, driver, user in rows:
        # Compute commission for this request
        # Use a flat default rate applied to the full amount (simplified for batch)
        rate = await _get_commission_rate(db, "default")
        commission_cents = math.floor(req.amount_cents * rate / 100)
        net_amount_cents = req.amount_cents - commission_cents

        try:
            destination = await _resolve_payout_destination(
                db, _settings.payout_provider,
                user_id=driver.user_id, stripe_account_id=driver.stripe_account_id,
            )
            ref = await adapter.send_payout(
                destination=destination, amount_cents=net_amount_cents, ref=str(req.id)
            )
            req.status = "processed"
            req.provider_ref = ref
            req.processed_at = now
            req.commission_cents = commission_cents
            req.net_amount_cents = net_amount_cents
            req.updated_at = now
            processed += 1
            total_net_cents += net_amount_cents
            total_commission_cents += commission_cents
        except Exception as exc:
            req.status = "failed"
            req.updated_at = now
            failed += 1
            # Fire-and-forget notification
            try:
                await _push_notification(
                    db,
                    user.id,
                    "payout_failed",
                    "Payout failed",
                    f"Your payout of ${req.amount_cents / 100:,.2f} failed. ({exc})",
                )
            except Exception:
                pass

        await db.commit()

    return {
        "processed": processed,
        "failed": failed,
        "total_net_cents": total_net_cents,
        "total_commission_cents": total_commission_cents,
    }


# ---------------------------------------------------------------------------
# WS3 (Sprint 68) — Stripe Connect onboarding + professional payout processing
# ---------------------------------------------------------------------------

_CONNECT_RETURN_URL = "https://app.ziza.ci/payouts/return"
_CONNECT_REFRESH_URL = "https://app.ziza.ci/payouts/refresh"


async def _payout_entity(db: AsyncSession, auth_id: str, role: str):
    """Resolve the payable entity (driver or professional) for the caller."""
    if role == "driver":
        return _require_driver(await _get_driver_by_auth_id(db, auth_id))
    if role == "professional":
        return await _require_professional(db, auth_id)
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Only drivers and professionals have payout accounts",
    )


async def start_connect_onboarding(db: AsyncSession, auth_id: str, role: str) -> dict:
    """Ensure a Stripe Connect account exists and return a hosted onboarding link."""
    from app.payment import stripe_connect  # noqa: PLC0415

    user = await _get_user_by_auth_id(db, auth_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    entity = await _payout_entity(db, auth_id, role)

    if not entity.stripe_account_id:
        entity.stripe_account_id = stripe_connect.create_express_account(user.email)
        await db.commit()
        await db.refresh(entity)

    url = stripe_connect.create_account_link(
        entity.stripe_account_id, _CONNECT_RETURN_URL, _CONNECT_REFRESH_URL
    )
    return {"account_id": entity.stripe_account_id, "onboarding_url": url}


async def get_connect_status(db: AsyncSession, auth_id: str, role: str) -> dict:
    """Return the payee's Stripe Connect onboarding/payout status."""
    from app.payment import stripe_connect  # noqa: PLC0415

    entity = await _payout_entity(db, auth_id, role)
    if not entity.stripe_account_id:
        return {"account_id": None, "onboarded": False, "payouts_enabled": False}
    st = stripe_connect.get_account_status(entity.stripe_account_id)
    return {
        "account_id": entity.stripe_account_id,
        "onboarded": st["details_submitted"],
        "payouts_enabled": st["payouts_enabled"],
    }


def _pro_payout_admin_dict(req, email: str) -> dict:
    return {
        "payout_id": str(req.id),
        "professional_id": str(req.professional_id),
        "professional_email": email,
        "amount_cents": req.amount_cents,
        "status": req.status,
        "note_admin": req.note_admin,
        "created_at": _utc(req.created_at).isoformat(),
        "updated_at": _utc(req.updated_at).isoformat(),
    }


async def admin_list_professional_payouts(
    db: AsyncSession, limit: int = 50, offset: int = 0
) -> list[dict]:
    """Admin: list all professional payout requests (newest first)."""
    result = await db.execute(
        select(ProPayoutModel, Professional, User)
        .join(Professional, ProPayoutModel.professional_id == Professional.id)
        .join(User, Professional.user_id == User.id)
        .order_by(ProPayoutModel.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return [_pro_payout_admin_dict(req, user.email) for req, prof, user in result.all()]


async def admin_update_professional_payout_status(
    db: AsyncSession, payout_id_str: str, new_status: str, note_admin: str | None = None
) -> dict:
    """Admin: approve or reject a professional payout request."""
    if new_status not in {"approved", "rejected"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="status must be 'approved' or 'rejected'",
        )
    try:
        pid = uuid.UUID(payout_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid payout_id"
        )
    req = await db.scalar(select(ProPayoutModel).where(ProPayoutModel.id == pid))
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payout request not found")
    req.status = new_status
    if note_admin is not None:
        req.note_admin = note_admin
    req.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(req)
    prof = await db.scalar(select(Professional).where(Professional.id == req.professional_id))
    user = await db.scalar(select(User).where(User.id == prof.user_id)) if prof else None
    return _pro_payout_admin_dict(req, user.email if user else "")


async def run_professional_payout_batch(db: AsyncSession) -> dict:
    """Process all approved professional payouts via the configured adapter."""
    from app.config import settings as _settings  # noqa: PLC0415
    from app.payment.payout_adapter import get_payout_adapter  # noqa: PLC0415

    adapter = get_payout_adapter(_settings.payout_provider)
    result = await db.execute(
        select(ProPayoutModel, Professional)
        .join(Professional, ProPayoutModel.professional_id == Professional.id)
        .where(ProPayoutModel.status == "approved")
        .order_by(ProPayoutModel.created_at.asc())
    )
    rows = result.all()

    processed = 0
    failed = 0
    total_net_cents = 0
    now = datetime.now(timezone.utc)
    for req, prof in rows:
        try:
            destination = await _resolve_payout_destination(
                db, _settings.payout_provider,
                user_id=prof.user_id, stripe_account_id=prof.stripe_account_id,
            )
            ref = await adapter.send_payout(
                destination=destination, amount_cents=req.amount_cents, ref=str(req.id)
            )
            req.status = "processed"
            req.provider_ref = ref
            req.processed_at = now
            req.updated_at = now
            processed += 1
            total_net_cents += req.amount_cents
        except Exception:
            req.status = "failed"
            req.updated_at = now
            failed += 1
        await db.commit()

    return {"processed": processed, "failed": failed, "total_net_cents": total_net_cents}


# ---------------------------------------------------------------------------
# Sprint 30 — Driver Application Workflow
# ---------------------------------------------------------------------------

async def create_application(db: AsyncSession, auth_id: str, data: dict) -> dict:
    """Submit a new driver application (one per user, 409 if already exists)."""
    user = await _get_user_by_auth_id(db, auth_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    auth_user_id = user.id

    existing = await db.scalar(
        select(DriverApplication).where(DriverApplication.user_id == auth_user_id)
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An application already exists for this user.",
        )

    app_obj = DriverApplication(
        user_id=auth_user_id,
        status="submitted",
        full_name=data["full_name"],
        phone=data["phone"],
        license_number=data["license_number"],
        vehicle_make=data["vehicle_make"],
        vehicle_model=data["vehicle_model"],
        vehicle_plate=data["vehicle_plate"],
        vehicle_year=data["vehicle_year"],
        vehicle_category=data.get("vehicle_category", "economy"),
        submitted_at=datetime.now(timezone.utc),
    )
    db.add(app_obj)
    await db.commit()
    await db.refresh(app_obj)

    # Sprint 56 — notify applicant that their application is under review
    _user_row = await db.execute(select(User).where(User.id == auth_user_id))
    _user = _user_row.scalar_one_or_none()
    if _user is not None:
        user_name = getattr(_user, "full_name", None) or data.get("full_name", "") or _user.email.split("@")[0]
        await _push_notification(
            db, auth_user_id,
            "application_submitted",
            "📋 Application received",
            "Your driver application has been submitted. We will review it within 24-48 hours.",
            data={"user_name": user_name},
        )

    return _application_to_dict(app_obj)


async def get_my_application(db: AsyncSession, auth_id: str) -> dict | None:
    """Return the authenticated user's own application, or None."""
    user = await _get_user_by_auth_id(db, auth_id)
    if user is None:
        return None
    app_obj = await db.scalar(
        select(DriverApplication).where(DriverApplication.user_id == user.id)
    )
    if app_obj is None:
        return None
    return _application_to_dict(app_obj)


async def admin_list_applications(
    db: AsyncSession,
    status_filter: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    """Admin: list all applications, optionally filtered by status."""
    q = select(DriverApplication).order_by(DriverApplication.submitted_at.desc())
    if status_filter:
        q = q.where(DriverApplication.status == status_filter)
    q = q.limit(limit).offset(offset)
    rows = (await db.execute(q)).scalars().all()
    return [_application_to_dict(r) for r in rows]


async def admin_get_application(db: AsyncSession, application_id: uuid.UUID) -> dict:
    """Admin: get a single application by ID."""
    app_obj = await db.scalar(
        select(DriverApplication).where(DriverApplication.id == application_id)
    )
    if app_obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")
    return _application_to_dict(app_obj)


async def admin_review_application(
    db: AsyncSession,
    application_id: uuid.UUID,
    new_status: str,
    notes_admin: str | None,
    admin_user_id: uuid.UUID,
) -> dict:
    """Admin: approve or reject an application.

    On approval: auto-creates the Driver record + Vehicle if not already existing.
    """
    from app.models.vehicle import Vehicle  # local import to avoid circular deps

    if new_status not in {"approved", "rejected", "under_review"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid status: {new_status!r}. Accepted values: approved, rejected, under_review.",
        )

    app_obj = await db.scalar(
        select(DriverApplication).where(DriverApplication.id == application_id)
    )
    if app_obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")

    app_obj.status = new_status
    app_obj.reviewed_at = datetime.now(timezone.utc)
    app_obj.reviewed_by = admin_user_id
    if notes_admin is not None:
        app_obj.notes_admin = notes_admin

    if new_status == "approved":
        # Auto-create driver record if not already a driver
        driver_row = await db.scalar(
            select(Driver).where(Driver.user_id == app_obj.user_id)
        )
        if driver_row is None:
            driver_row = Driver(
                user_id=app_obj.user_id,
                status="active",
                license_number=app_obj.license_number,
            )
            db.add(driver_row)
            await db.flush()

        # Auto-create vehicle
        vehicle_exists = await db.scalar(
            select(Vehicle).where(Vehicle.driver_id == driver_row.id)
        )
        if vehicle_exists is None:
            vehicle_row = Vehicle(
                driver_id=driver_row.id,
                plate=app_obj.vehicle_plate,
                make=app_obj.vehicle_make,
                model=app_obj.vehicle_model,
                year=app_obj.vehicle_year,
                color="—",
                category=app_obj.vehicle_category,
            )
            db.add(vehicle_row)

    await db.commit()
    await db.refresh(app_obj)

    # Sprint 56 — email notification on final decision
    if new_status in ("approved", "rejected"):
        _user_row = await db.execute(select(User).where(User.id == app_obj.user_id))
        _user = _user_row.scalar_one_or_none()
        if _user is not None:
            user_name = getattr(_user, "full_name", None) or _user.email.split("@")[0]
            if new_status == "approved":
                await _push_notification(
                    db, app_obj.user_id,
                    "application_approved",
                    "✅ Application approved — account activated",
                    "Your application has been approved. Your Ziza account is now active!",
                    data={"user_name": user_name},
                )
            else:
                await _push_notification(
                    db, app_obj.user_id,
                    "application_rejected",
                    "❌ Application not approved",
                    "Your application was not approved."
                    + (f" Reason: {notes_admin}" if notes_admin else ""),
                    data={
                        "user_name": user_name,
                        "reason": notes_admin or "",
                    },
                )

    return _application_to_dict(app_obj)


def _application_to_dict(app_obj: DriverApplication) -> dict:
    """Serialize a DriverApplication to a plain dict."""
    return {
        "application_id": str(app_obj.id),
        "user_id": str(app_obj.user_id),
        "status": app_obj.status,
        "full_name": app_obj.full_name,
        "phone": app_obj.phone,
        "license_number": app_obj.license_number,
        "vehicle_make": app_obj.vehicle_make,
        "vehicle_model": app_obj.vehicle_model,
        "vehicle_plate": app_obj.vehicle_plate,
        "vehicle_year": app_obj.vehicle_year,
        "vehicle_category": app_obj.vehicle_category,
        "notes_admin": app_obj.notes_admin,
        "reviewed_at": app_obj.reviewed_at.isoformat() if app_obj.reviewed_at else None,
        "submitted_at": app_obj.submitted_at.isoformat(),
    }


# ---------------------------------------------------------------------------
# Sprint 31 — Feature Flags
# ---------------------------------------------------------------------------

async def _ensure_flag_defaults(db: AsyncSession) -> None:
    """Seed default feature flags on first use."""
    count = await db.scalar(select(func.count()).select_from(FeatureFlag))
    if count and count > 0:
        return
    now = datetime.now(timezone.utc)
    for flag_def in DEFAULT_FLAGS:
        flag = FeatureFlag(
            name=flag_def["name"],
            enabled=flag_def["enabled"],
            rollout_pct=flag_def["rollout_pct"],
            description=flag_def["description"],
            updated_at=now,
        )
        db.add(flag)
    await db.commit()


async def get_feature_flags(db: AsyncSession) -> list[dict]:
    """List all feature flags (seeds defaults on first call)."""
    await _ensure_flag_defaults(db)
    rows = (await db.execute(select(FeatureFlag).order_by(FeatureFlag.name))).scalars().all()
    return [_flag_to_dict(f) for f in rows]


async def get_feature_flag(db: AsyncSession, name: str) -> dict | None:
    """Get a single feature flag by name."""
    await _ensure_flag_defaults(db)
    flag = await db.scalar(select(FeatureFlag).where(FeatureFlag.name == name))
    if flag is None:
        return None
    return _flag_to_dict(flag)


async def set_feature_flag(
    db: AsyncSession,
    name: str,
    enabled: bool,
    rollout_pct: int = 0,
    description: str | None = None,
) -> dict:
    """Create or update a feature flag."""
    flag = await db.scalar(select(FeatureFlag).where(FeatureFlag.name == name))
    if flag is None:
        flag = FeatureFlag(name=name)
        db.add(flag)
    flag.enabled = enabled
    flag.rollout_pct = rollout_pct
    flag.updated_at = datetime.now(timezone.utc)
    if description is not None:
        flag.description = description
    await db.commit()
    await db.refresh(flag)
    return _flag_to_dict(flag)


def _flag_to_dict(flag: FeatureFlag) -> dict:
    return {
        "name": flag.name,
        "enabled": flag.enabled,
        "rollout_pct": flag.rollout_pct,
        "description": flag.description,
        "updated_at": flag.updated_at.isoformat(),
    }


# ---------------------------------------------------------------------------
# Sprint 31 — Invite Codes
# ---------------------------------------------------------------------------

async def create_invite_code(db: AsyncSession, code: str, max_uses: int = 1) -> dict:
    """Create a new invite code."""
    invite = InviteCode(
        code=code,
        max_uses=max_uses,
        used_count=0,
        created_at=datetime.now(timezone.utc),
    )
    db.add(invite)
    await db.commit()
    await db.refresh(invite)
    return _invite_to_dict(invite)


async def use_invite_code(db: AsyncSession, code: str) -> dict:
    """Consume one use of an invite code; raise 422 on invalid/exhausted codes."""
    invite = await db.scalar(select(InviteCode).where(InviteCode.code == code))
    if invite is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid invite code.",
        )
    now = datetime.now(timezone.utc)
    if invite.expires_at and invite.expires_at < now:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invite code has expired.",
        )
    if invite.used_count >= invite.max_uses:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invite code has been exhausted.",
        )
    invite.used_count += 1
    await db.commit()
    await db.refresh(invite)
    return _invite_to_dict(invite)


def _invite_to_dict(invite: InviteCode) -> dict:
    return {
        "id": str(invite.id),
        "code": invite.code,
        "max_uses": invite.max_uses,
        "used_count": invite.used_count,
        "created_at": invite.created_at.isoformat(),
        "expires_at": invite.expires_at.isoformat() if invite.expires_at else None,
    }


# ---------------------------------------------------------------------------
# Sprint 31 — Live drivers (admin map view)
# ---------------------------------------------------------------------------

async def list_live_drivers(db: AsyncSession) -> list[dict]:
    """Return all drivers currently online with their last known position."""
    rows = (await db.execute(
        select(Driver, User, DriverLocation)
        .join(User, User.id == Driver.user_id)
        .outerjoin(DriverLocation, DriverLocation.driver_id == Driver.id)
        .where(Driver.is_online.is_(True))
    )).all()

    result = []
    for driver, user, loc in rows:
        result.append({
            "driver_id": str(driver.id),
            "email": user.email,
            "status": driver.status,
            "is_online": bool(driver.is_online),
            "lat": loc.lat if loc else None,
            "lng": loc.lng if loc else None,
            "last_seen_at": loc.updated_at.isoformat() if loc and loc.updated_at else None,
        })
    return result


# ---------------------------------------------------------------------------
# Sprint 31 — Admin role management
# ---------------------------------------------------------------------------

async def admin_set_user_role(
    db: AsyncSession,
    user_id: uuid.UUID,
    new_role: str,
    admin_user_id: uuid.UUID,
) -> dict:
    """Admin changes a user's role. Cannot self-promote."""
    if user_id == admin_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="An admin cannot change their own role.",
        )
    valid_roles = {"customer", "driver", "admin"}
    if new_role not in valid_roles:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid role: {new_role!r}. Valid values: {sorted(valid_roles)}",
        )
    user = await db.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    user.role = new_role
    await db.commit()
    return {"user_id": str(user.id), "email": user.email, "role": user.role}


# ---------------------------------------------------------------------------
# Sprint 31 — Dispatch radius filter helper
# ---------------------------------------------------------------------------

def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Return great-circle distance between two points in kilometres."""
    import math
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlng / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))


# ---------------------------------------------------------------------------
# Sprint 32 — Multi-city & Geofencing
# ---------------------------------------------------------------------------

from app.models.city import City, ServiceZone, DEFAULT_CITIES  # noqa: E402


def _city_to_dict(city: City) -> dict:
    return {
        "city_id": str(city.id),
        "name": city.name,
        "country": city.country,
        "zone_type": getattr(city, "zone_type", "city"),
        "center_lat": city.center_lat,
        "center_lng": city.center_lng,
        "radius_km": city.radius_km,
        "active": city.active,
        "created_at": city.created_at.isoformat(),
    }


def _zone_to_dict(zone: ServiceZone, city_name: str = "") -> dict:
    return {
        "zone_id": str(zone.id),
        "city_id": str(zone.city_id),
        "city_name": city_name,
        "name": zone.name,
        "polygon_geojson": zone.polygon_geojson,
        "active": zone.active,
        "created_at": zone.created_at.isoformat(),
    }


async def _ensure_city_defaults(db: AsyncSession) -> None:
    """Seed default cities on first call (idempotent)."""
    count = await db.scalar(select(func.count()).select_from(City))
    if count and count > 0:
        return
    for c in DEFAULT_CITIES:
        city = City(**c)
        db.add(city)
    await db.commit()


async def list_cities(db: AsyncSession, include_inactive: bool = False) -> list[dict]:
    """List cities. Public: active only. Admin: all."""
    await _ensure_city_defaults(db)
    stmt = select(City)
    if not include_inactive:
        stmt = stmt.where(City.active.is_(True))
    stmt = stmt.order_by(City.name)
    rows = (await db.scalars(stmt)).all()
    return [_city_to_dict(c) for c in rows]


async def get_city(db: AsyncSession, city_id: uuid.UUID) -> dict:
    """Get a single city by ID (404 if not found)."""
    city = await db.scalar(select(City).where(City.id == city_id))
    if city is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="City not found.")
    return _city_to_dict(city)


async def create_city(
    db: AsyncSession,
    name: str,
    country: str,
    center_lat: float,
    center_lng: float,
    radius_km: float,
    active: bool = True,
    zone_type: str = "city",
) -> dict:
    """Create a new city/state/country zone. 409 if name already exists."""
    existing = await db.scalar(select(City).where(City.name == name))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A zone named '{name}' already exists.",
        )
    city = City(
        name=name,
        country=country,
        zone_type=zone_type,
        center_lat=center_lat,
        center_lng=center_lng,
        radius_km=radius_km,
        active=active,
    )
    db.add(city)
    await db.commit()
    await db.refresh(city)
    return _city_to_dict(city)


async def update_city(
    db: AsyncSession,
    city_id: uuid.UUID,
    **updates: object,
) -> dict:
    """Update city fields. Returns updated city dict. 404 if not found."""
    city = await db.scalar(select(City).where(City.id == city_id))
    if city is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="City not found.")
    allowed = {"name", "country", "zone_type", "center_lat", "center_lng", "radius_km", "active"}
    for key, val in updates.items():
        if key in allowed and val is not None:
            setattr(city, key, val)
    await db.commit()
    await db.refresh(city)
    return _city_to_dict(city)


async def list_service_zones(
    db: AsyncSession,
    city_id: uuid.UUID | None = None,
    include_inactive: bool = False,
) -> list[dict]:
    """List service zones, optionally filtered by city."""
    stmt = (
        select(ServiceZone, City.name.label("city_name"))
        .join(City, ServiceZone.city_id == City.id)
    )
    if city_id:
        stmt = stmt.where(ServiceZone.city_id == city_id)
    if not include_inactive:
        stmt = stmt.where(ServiceZone.active.is_(True))
    stmt = stmt.order_by(City.name, ServiceZone.name)
    rows = (await db.execute(stmt)).all()
    return [_zone_to_dict(zone, city_name) for zone, city_name in rows]


async def create_service_zone(
    db: AsyncSession,
    city_id: uuid.UUID,
    name: str,
    polygon_geojson: str | None = None,
    active: bool = True,
) -> dict:
    """Create a service zone. 404 if city doesn't exist."""
    city = await db.scalar(select(City).where(City.id == city_id))
    if city is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="City not found.")
    zone = ServiceZone(
        city_id=city_id,
        name=name,
        polygon_geojson=polygon_geojson,
        active=active,
    )
    db.add(zone)
    await db.commit()
    await db.refresh(zone)
    return _zone_to_dict(zone, city.name)


def point_in_city_radius(lat: float, lng: float, city: City) -> bool:
    """Return True if the point is within the city's service radius."""
    dist = _haversine_km(lat, lng, city.center_lat, city.center_lng)
    return dist <= city.radius_km


async def find_city_for_point(
    db: AsyncSession,
    lat: float,
    lng: float,
) -> City | None:
    """Return the first active city whose radius covers the given point, or None."""
    stmt = select(City).where(City.active.is_(True))
    cities = (await db.scalars(stmt)).all()
    for city in cities:
        if point_in_city_radius(lat, lng, city):
            return city
    return None


async def _check_zone_coverage(
    db: AsyncSession,
    lat: float,
    lng: float,
) -> None:
    """Raise HTTP 422 if the point is outside all active service cities.

    Sprint 45 — zone enforcement.
    No-op when no active cities are configured (backward-compatible with
    environments that have not set up any zones yet).
    """
    active_count = await db.scalar(
        select(func.count()).select_from(City).where(City.active.is_(True))
    )
    if not active_count:
        return  # No zones configured — allow all locations
    city = await find_city_for_point(db, lat, lng)
    if city is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "This location is outside our service area. "
                "Please choose an address within a covered zone."
            ),
        )


async def update_service_zone(
    db: AsyncSession,
    zone_id: uuid.UUID,
    name: str | None = None,
    active: bool | None = None,
) -> dict:
    """Update a service zone's name and/or active status. 404 if not found."""
    zone = await db.scalar(select(ServiceZone).where(ServiceZone.id == zone_id))
    if zone is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found.")
    if name is not None:
        zone.name = name
    if active is not None:
        zone.active = active
    await db.commit()
    await db.refresh(zone)
    city = await db.scalar(select(City).where(City.id == zone.city_id))
    city_name = city.name if city else ""
    return _zone_to_dict(zone, city_name)


async def delete_service_zone(
    db: AsyncSession,
    zone_id: uuid.UUID,
) -> None:
    """Delete a service zone. 404 if not found."""
    zone = await db.scalar(select(ServiceZone).where(ServiceZone.id == zone_id))
    if zone is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found.")
    await db.delete(zone)
    await db.commit()


async def delete_city(
    db: AsyncSession,
    city_id: uuid.UUID,
) -> None:
    """Delete a city and all its service zones (CASCADE). 404 if not found."""
    city = await db.scalar(select(City).where(City.id == city_id))
    if city is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="City not found.")
    await db.delete(city)
    await db.commit()


# ---------------------------------------------------------------------------
# Sprint 33 — Customer Wallet
# ---------------------------------------------------------------------------

from app.models.wallet import Wallet, WalletTransaction  # noqa: E402
from app.models.wallet_topup import WalletTopup  # noqa: E402  — WS2 (Sprint 68)
from datetime import datetime as _dt, timezone as _tz  # noqa: E402


def _wallet_to_dict(wallet: Wallet) -> dict:
    return {
        "wallet_id": str(wallet.id),
        "user_id": str(wallet.user_id),
        "balance_cents": wallet.balance_cents,
        "created_at": wallet.created_at.isoformat(),
        "updated_at": wallet.updated_at.isoformat(),
    }


def _tx_to_dict(tx: WalletTransaction) -> dict:
    return {
        "tx_id": str(tx.id),
        "wallet_id": str(tx.wallet_id),
        "tx_type": tx.tx_type,
        "amount_cents": tx.amount_cents,
        "reason": tx.reason,
        "reference_id": tx.reference_id,
        "note": tx.note,
        "balance_after": tx.balance_after,
        "created_at": tx.created_at.isoformat(),
    }


async def _get_or_create_wallet(db: AsyncSession, user_id: uuid.UUID) -> Wallet:
    """Return existing wallet or create a new one with 0 balance."""
    wallet = await db.scalar(select(Wallet).where(Wallet.user_id == user_id))
    if wallet is None:
        wallet = Wallet(user_id=user_id, balance_cents=0.0)
        db.add(wallet)
        await db.commit()
        await db.refresh(wallet)
    return wallet


async def get_wallet(db: AsyncSession, auth_id: str) -> dict:
    """Return the user's wallet (creates it if it doesn't exist)."""
    user = await _get_user_by_auth_id(db, auth_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    wallet = await _get_or_create_wallet(db, user.id)
    return _wallet_to_dict(wallet)


async def _credit_wallet(
    db: AsyncSession,
    user_id: uuid.UUID,
    amount_cents: float,
    reason: str,
    reference_id: str | None = None,
    note: str | None = None,
) -> tuple[Wallet, WalletTransaction]:
    """Credit a wallet and record an immutable ledger transaction."""
    wallet = await _get_or_create_wallet(db, user_id)
    wallet.balance_cents += amount_cents
    wallet.updated_at = _dt.now(_tz.utc)
    tx = WalletTransaction(
        wallet_id=wallet.id,
        tx_type="credit",
        amount_cents=amount_cents,
        reason=reason,
        reference_id=reference_id,
        note=note,
        balance_after=wallet.balance_cents,
    )
    db.add(tx)
    await db.commit()
    await db.refresh(wallet)
    await db.refresh(tx)
    return wallet, tx


def _topup_to_dict(topup: WalletTopup) -> dict:
    return {
        "topup_id": str(topup.id),
        "amount_cents": topup.amount_cents,
        "currency": topup.currency,
        "provider": topup.provider,
        "provider_ref": topup.provider_ref,
        "status": topup.status,
        "checkout_url": topup.checkout_url,
    }


async def create_wallet_topup(
    db: AsyncSession,
    auth_id: str,
    amount_cents: int,
    adapter,
    return_url: str = "https://app.ziza.ci/wallet/return",
) -> dict:
    """WS2 — Start a real wallet top-up.

    Creates a ``pending`` top-up and a provider checkout session. The wallet is
    credited only later, when the provider confirms via webhook (idempotently).
    """
    if amount_cents <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Top-up amount must be positive.",
        )
    from app.config import settings as _s  # noqa: PLC0415
    if amount_cents > _s.topup_max_single_cents:  # WS5 — AML cap
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Top-up exceeds the per-transaction limit ({_s.topup_max_single_cents})",
        )
    user = await _get_user_by_auth_id(db, auth_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    topup = WalletTopup(
        user_id=user.id,
        amount_cents=int(amount_cents),
        provider=getattr(adapter, "_provider_name", "mock"),
    )
    db.add(topup)
    await db.flush()  # get the UUID for the provider ref

    checkout = await adapter.create_checkout(
        amount_cents=int(amount_cents),
        ref=str(topup.id),
        return_url=return_url,
    )
    topup.provider_ref = checkout["provider_ref"]
    topup.checkout_url = checkout["checkout_url"]
    await db.commit()
    await db.refresh(topup)
    return _topup_to_dict(topup)


async def _confirm_wallet_topup(
    db: AsyncSession, provider_ref: str, new_status: str
) -> dict:
    """Apply a webhook result to a wallet top-up (idempotent). 404 if unknown."""
    topup = await db.scalar(
        select(WalletTopup).where(WalletTopup.provider_ref == provider_ref)
    )
    if topup is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No payment intent found for provider_ref {provider_ref!r}",
        )

    # Idempotency + state guard — never credit a wallet twice on webhook replay.
    if topup.status == new_status or topup.status == "paid":
        return {"intent_id": str(topup.id), "status": topup.status}

    topup.status = new_status
    if new_status == "paid":
        await _credit_wallet(
            db, topup.user_id, topup.amount_cents,
            reason="topup", reference_id=str(topup.id),
        )  # commits the credit + the topup.status change in one transaction
        try:
            await _push_notification(
                db, topup.user_id, "wallet_topup", "💰 Wallet topped up",
                f"Your wallet has been credited with ${topup.amount_cents / 100:,.2f}.",
            )
        except Exception:
            pass
    else:
        await db.commit()
    return {"intent_id": str(topup.id), "status": topup.status}


async def wallet_pay_trip(
    db: AsyncSession,
    auth_id: str,
    trip_id: uuid.UUID,
    amount_cents: float,
) -> dict:
    """Debit wallet for a trip payment. 402 if insufficient balance."""
    if amount_cents <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Payment amount must be positive.",
        )
    user = await _get_user_by_auth_id(db, auth_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    wallet = await _get_or_create_wallet(db, user.id)
    if wallet.balance_cents < amount_cents:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Insufficient balance: {wallet.balance_cents:.0f} available, {amount_cents:.0f} required.",
        )
    wallet.balance_cents -= amount_cents
    wallet.updated_at = _dt.now(_tz.utc)
    tx = WalletTransaction(
        wallet_id=wallet.id,
        tx_type="debit",
        amount_cents=amount_cents,
        reason="trip_payment",
        reference_id=str(trip_id),
        balance_after=wallet.balance_cents,
    )
    db.add(tx)
    await db.commit()
    await db.refresh(wallet)
    await db.refresh(tx)
    return {"wallet": _wallet_to_dict(wallet), "transaction": _tx_to_dict(tx)}


async def wallet_refund(
    db: AsyncSession,
    user_id: uuid.UUID,
    amount_cents: float,
    reason: str = "trip_refund",
    reference_id: str | None = None,
    note: str | None = None,
) -> dict:
    """Credit wallet with a refund (e.g. cancelled trip)."""
    if amount_cents <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Refund amount must be positive.",
        )
    wallet = await _get_or_create_wallet(db, user_id)
    wallet.balance_cents += amount_cents
    wallet.updated_at = _dt.now(_tz.utc)
    tx = WalletTransaction(
        wallet_id=wallet.id,
        tx_type="refund",
        amount_cents=amount_cents,
        reason=reason,
        reference_id=reference_id,
        note=note,
        balance_after=wallet.balance_cents,
    )
    db.add(tx)
    await db.commit()
    await db.refresh(wallet)
    await db.refresh(tx)
    return {"wallet": _wallet_to_dict(wallet), "transaction": _tx_to_dict(tx)}


async def get_wallet_transactions(
    db: AsyncSession,
    auth_id: str,
    limit: int = 20,
    offset: int = 0,
) -> list[dict]:
    """Return paginated transaction history for the user's wallet."""
    user = await _get_user_by_auth_id(db, auth_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    wallet = await _get_or_create_wallet(db, user.id)
    stmt = (
        select(WalletTransaction)
        .where(WalletTransaction.wallet_id == wallet.id)
        .order_by(WalletTransaction.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    txs = (await db.scalars(stmt)).all()
    return [_tx_to_dict(t) for t in txs]


async def admin_adjust_wallet(
    db: AsyncSession,
    target_user_id: uuid.UUID,
    amount_cents: float,
    note: str | None = None,
) -> dict:
    """Admin manual credit (positive) or debit (negative) to a wallet."""
    wallet = await _get_or_create_wallet(db, target_user_id)
    new_balance = wallet.balance_cents + amount_cents
    if new_balance < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Adjustment cannot bring the balance below zero (current balance: {wallet.balance_cents:.0f}).",
        )
    wallet.balance_cents = new_balance
    wallet.updated_at = _dt.now(_tz.utc)
    tx_type = "credit" if amount_cents >= 0 else "debit"
    tx = WalletTransaction(
        wallet_id=wallet.id,
        tx_type=tx_type,
        amount_cents=abs(amount_cents),
        reason="admin_debit" if amount_cents < 0 else "topup",
        note=note,
        balance_after=wallet.balance_cents,
    )
    db.add(tx)
    await db.commit()
    await db.refresh(wallet)
    return _wallet_to_dict(wallet)


# ---------------------------------------------------------------------------
# Sprint 34 — Advanced Analytics
# ---------------------------------------------------------------------------

async def get_revenue_by_period(
    db: AsyncSession,
    period: str = "day",  # "day" | "week" | "month"
    limit: int = 30,
) -> list[dict]:
    """Return revenue (XOF) aggregated by time period from completed trips.

    Uses Python-side grouping so it works with both SQLite (tests) and PostgreSQL.
    """
    from app.models.trip import Trip  # noqa: PLC0415

    stmt = (
        select(
            Trip.created_at,
            Trip.fare_cents,
            Trip.category,
        )
        .where(Trip.status == "completed")
        .where(Trip.fare_cents.isnot(None))
        .order_by(Trip.created_at.desc())
        .limit(limit * 100)  # fetch more to group
    )
    rows = (await db.execute(stmt)).all()

    def _period_key(dt: datetime) -> str:
        if isinstance(dt, str):
            dt = datetime.fromisoformat(dt)
        if period == "day":
            return dt.strftime("%Y-%m-%d")
        elif period == "week":
            return dt.strftime("%Y-W%W")
        else:  # month
            return dt.strftime("%Y-%m")

    groups: dict[str, dict] = {}
    for created_at, fare, category in rows:
        key = _period_key(created_at)
        if key not in groups:
            groups[key] = {"period": key, "revenue_cents": 0.0, "trip_count": 0}
        groups[key]["revenue_cents"] += fare or 0.0
        groups[key]["trip_count"] += 1

    result = sorted(groups.values(), key=lambda x: x["period"], reverse=True)
    return result[:limit]


async def get_driver_performance(
    db: AsyncSession,
    limit: int = 20,
) -> list[dict]:
    """Return per-driver stats: trip count, total earnings, avg rating."""
    from app.models.trip import Trip  # noqa: PLC0415
    from app.models.rating import Rating  # noqa: PLC0415

    stmt = (
        select(
            Driver.id,
            User.email,
            func.count(Trip.id).label("trip_count"),
            func.coalesce(func.sum(Trip.fare_cents), 0).label("total_revenue_cents"),
            func.coalesce(func.avg(Rating.stars), 0).label("avg_rating"),
        )
        .join(User, Driver.user_id == User.id)
        .outerjoin(Trip, Trip.driver_id == Driver.id)
        .outerjoin(Rating, Rating.driver_id == Driver.id)
        .group_by(Driver.id, User.email)
        .order_by(func.count(Trip.id).desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()
    return [
        {
            "driver_id": str(r.id),
            "email": r.email,
            "trip_count": r.trip_count or 0,
            "total_revenue_cents": float(r.total_revenue_cents or 0),
            "avg_rating": round(float(r.avg_rating or 0), 2),
        }
        for r in rows
    ]


async def get_category_breakdown(db: AsyncSession) -> list[dict]:
    """Return trip and revenue counts by category."""
    from app.models.trip import Trip  # noqa: PLC0415

    stmt = (
        select(
            Trip.category,
            func.count(Trip.id).label("trip_count"),
            func.coalesce(func.sum(Trip.fare_cents), 0).label("total_revenue_cents"),
            func.coalesce(func.avg(Trip.fare_cents), 0).label("avg_fare_cents"),
        )
        .where(Trip.status == "completed")
        .group_by(Trip.category)
        .order_by(func.count(Trip.id).desc())
    )
    rows = (await db.execute(stmt)).all()
    return [
        {
            "category": r.category or "unknown",
            "trip_count": r.trip_count or 0,
            "total_revenue_cents": float(r.total_revenue_cents or 0),
            "avg_fare_cents": round(float(r.avg_fare_cents or 0), 0),
        }
        for r in rows
    ]


async def get_hourly_demand(db: AsyncSession) -> list[dict]:
    """Return trip count by hour of day (0–23) across all completed trips."""
    from app.models.trip import Trip  # noqa: PLC0415

    stmt = (
        select(Trip.created_at)
        .where(Trip.status == "completed")
        .order_by(Trip.created_at)
    )
    rows = (await db.scalars(stmt)).all()

    hourly: dict[int, int] = {h: 0 for h in range(24)}
    for dt in rows:
        if isinstance(dt, str):
            dt = datetime.fromisoformat(dt)
        if dt:
            hourly[dt.hour] += 1

    return [{"hour": h, "trip_count": cnt} for h, cnt in sorted(hourly.items())]


async def get_top_customers(db: AsyncSession, limit: int = 10) -> list[dict]:
    """Return customers ranked by number of completed trips."""
    from app.models.trip import Trip  # noqa: PLC0415

    stmt = (
        select(
            User.id,
            User.email,
            func.count(Trip.id).label("trip_count"),
            func.coalesce(func.sum(Trip.fare_cents), 0).label("total_spent_cents"),
        )
        .join(Trip, Trip.customer_id == User.id)
        .where(Trip.status == "completed")
        .group_by(User.id, User.email)
        .order_by(func.count(Trip.id).desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()
    return [
        {
            "user_id": str(r.id),
            "email": r.email,
            "trip_count": r.trip_count or 0,
            "total_spent_cents": float(r.total_spent_cents or 0),
        }
        for r in rows
    ]


async def get_platform_kpis(db: AsyncSession) -> dict:
    """Return high-level platform KPIs for the admin dashboard."""
    from app.models.trip import Trip  # noqa: PLC0415
    from app.models.rating import Rating  # noqa: PLC0415

    total_users = await db.scalar(select(func.count()).select_from(User)) or 0
    total_drivers = await db.scalar(select(func.count()).select_from(Driver)) or 0
    online_drivers = await db.scalar(
        select(func.count()).select_from(Driver).where(Driver.is_online.is_(True))
    ) or 0
    total_trips = await db.scalar(select(func.count()).select_from(Trip)) or 0
    completed_trips = await db.scalar(
        select(func.count()).select_from(Trip).where(Trip.status == "completed")
    ) or 0
    total_revenue = await db.scalar(
        select(func.coalesce(func.sum(Trip.fare_cents), 0))
        .where(Trip.status == "completed")
    ) or 0.0
    avg_rating = await db.scalar(
        select(func.coalesce(func.avg(Rating.stars), 0))
    ) or 0.0

    return {
        "total_users": total_users,
        "total_drivers": total_drivers,
        "online_drivers": online_drivers,
        "total_trips": total_trips,
        "completed_trips": completed_trips,
        "completion_rate_pct": round(
            (completed_trips / total_trips * 100) if total_trips > 0 else 0, 1
        ),
        "total_revenue_cents": float(total_revenue),
        "avg_rating": round(float(avg_rating), 2),
    }


# ---------------------------------------------------------------------------
# Sprint 36 — Service activation flags
# ---------------------------------------------------------------------------

_SERVICE_FLAG_KEYS = {
    "rideshare_customer":  "service.rideshare.customer",
    "rideshare_driver":    "service.rideshare.driver",
}


async def get_service_flags(db: AsyncSession) -> dict[str, bool]:
    """Return all service on/off flags from platform_settings (defaults to True)."""
    rows = (
        await db.execute(
            select(PlatformSetting).where(
                PlatformSetting.key.in_(list(_SERVICE_FLAG_KEYS.values()))
            )
        )
    ).scalars().all()
    stored = {r.key: r.value for r in rows}
    return {
        field: stored.get(db_key, "true").lower() == "true"
        for field, db_key in _SERVICE_FLAG_KEYS.items()
    }


async def set_service_flags(db: AsyncSession, updates: dict[str, bool]) -> dict[str, bool]:
    """Upsert one or more service flags and return the full current state."""
    now = datetime.now(timezone.utc)
    for field, new_val in updates.items():
        db_key = _SERVICE_FLAG_KEYS[field]
        result = await db.execute(
            select(PlatformSetting).where(PlatformSetting.key == db_key)
        )
        row = result.scalar_one_or_none()
        if row is None:
            row = PlatformSetting(key=db_key, value=str(new_val).lower(), updated_at=now)
            db.add(row)
        else:
            row.value = str(new_val).lower()
            row.updated_at = now
    if updates:
        await db.commit()
    return await get_service_flags(db)


# ===========================================================================
# Sprint 47 — Ziza Craft marketplace
# ===========================================================================

from app.models.craft import CraftBid, CraftRequest, CraftPhoto, Professional  # noqa: E402
from app.models.professional_payout_request import (  # noqa: E402
    ProfessionalPayoutRequest as ProPayoutModel,
)


async def get_user_db_id(db: AsyncSession, auth_user_id: str) -> uuid.UUID:
    """Resolve an auth_user_id string to the user's DB primary-key UUID.

    Raises HTTP 404 if the user has not yet called POST /v1/auth/register.
    Use this instead of uuid.UUID(claims.sub) — Claims has no ``sub`` field.
    """
    user = await _get_user_by_auth_id(db, auth_user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found — call POST /v1/auth/register first",
        )
    return user.id


def _professional_to_dict(p: Professional) -> dict:
    return {
        "professional_id": str(p.id),
        "user_id": str(p.user_id),
        "specialties": p.specialties,
        "bio": p.bio,
        "status": p.status,
        "is_online": p.is_online,
        "current_lat": p.current_lat,
        "current_lng": p.current_lng,
        "created_at": p.created_at.isoformat(),
    }


def _craft_request_to_dict(r: CraftRequest, distance_km: float | None = None) -> dict:
    return {
        "request_id": str(r.id),
        "customer_id": str(r.customer_id),
        "category": r.category,
        "description": r.description,
        "lat": r.lat,
        "lng": r.lng,
        "address": r.address,
        "status": r.status,
        "bid_deadline": r.bid_deadline.isoformat() if r.bid_deadline else None,
        "selected_bid_id": str(r.selected_bid_id) if r.selected_bid_id else None,
        "verification_code": getattr(r, "verification_code", None),
        "paid_at": r.paid_at.isoformat() if getattr(r, "paid_at", None) else None,
        "created_at": r.created_at.isoformat(),
        "updated_at": r.updated_at.isoformat(),
        "distance_km": round(distance_km, 2) if distance_km is not None else None,
    }


def _craft_bid_to_dict(b: CraftBid, distance_km: float | None = None) -> dict:
    return {
        "bid_id": str(b.id),
        "request_id": str(b.request_id),
        "professional_id": str(b.professional_id),
        "price_cents": b.price_cents,
        "eta_min": b.eta_min,
        "note": b.note,
        "professional_lat": b.professional_lat,
        "professional_lng": b.professional_lng,
        "status": b.status,
        "created_at": b.created_at.isoformat(),
        "distance_km": round(distance_km, 2) if distance_km is not None else None,
    }


# ---------------------------------------------------------------------------
# Professional CRUD
# ---------------------------------------------------------------------------

async def register_professional(
    db: AsyncSession,
    user_id: uuid.UUID,
    specialties: str = "",
    bio: str | None = None,
) -> dict:
    """Create or return existing professional profile."""
    existing = await db.scalar(
        select(Professional).where(Professional.user_id == user_id)
    )
    if existing:
        return _professional_to_dict(existing)
    prof = Professional(
        user_id=user_id,
        specialties=specialties,
        bio=bio,
        status="pending_docs",  # Sprint 54 — blocked until docs validated
        created_at=datetime.now(timezone.utc),
    )
    db.add(prof)
    await db.commit()
    await db.refresh(prof)
    return _professional_to_dict(prof)


async def get_professional_by_user(
    db: AsyncSession, user_id: uuid.UUID
) -> Professional | None:
    return await db.scalar(
        select(Professional).where(Professional.user_id == user_id)
    )


async def update_professional(
    db: AsyncSession,
    user_id: uuid.UUID,
    specialties: str | None = None,
    bio: str | None = None,
    is_online: bool | None = None,
    current_lat: float | None = None,
    current_lng: float | None = None,
) -> dict:
    prof = await db.scalar(
        select(Professional).where(Professional.user_id == user_id)
    )
    if prof is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Professional profile not found.")
    if specialties is not None:
        prof.specialties = specialties
    if bio is not None:
        prof.bio = bio
    if is_online is not None:
        prof.is_online = is_online
    if current_lat is not None:
        prof.current_lat = current_lat
    if current_lng is not None:
        prof.current_lng = current_lng
    await db.commit()
    await db.refresh(prof)
    return _professional_to_dict(prof)


# ---------------------------------------------------------------------------
# CraftRequest CRUD
# ---------------------------------------------------------------------------

async def create_craft_request(
    db: AsyncSession,
    customer_id: uuid.UUID,
    category: str,
    description: str,
    lat: float,
    lng: float,
    address: str | None = None,
    bid_deadline_minutes: int = 30,
) -> dict:
    from app.models.craft import CRAFT_CATEGORIES
    if category not in CRAFT_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid category. Must be one of: {', '.join(CRAFT_CATEGORIES)}",
        )
    now = datetime.now(timezone.utc)
    deadline = now + timedelta(minutes=bid_deadline_minutes)
    req = CraftRequest(
        customer_id=customer_id,
        category=category,
        description=description,
        lat=lat,
        lng=lng,
        address=address,
        status="open",
        bid_deadline=deadline,
        created_at=now,
        updated_at=now,
    )
    db.add(req)
    await db.commit()
    await db.refresh(req)
    return _craft_request_to_dict(req)


async def get_craft_request(
    db: AsyncSession, request_id: uuid.UUID
) -> CraftRequest:
    req = await db.scalar(
        select(CraftRequest).where(CraftRequest.id == request_id)
    )
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Craft request not found.")
    return req


async def list_open_craft_requests(
    db: AsyncSession,
    lat: float,
    lng: float,
    limit: int = 20,
    offset: int = 0,
) -> list[dict]:
    """List open craft requests ranked by a blend of proximity + recency.

    The closer the request to the professional AND the more recent it is, the
    higher it ranks. Score = distance_km + (age_minutes × 0.5) — lower is
    better; each minute of age costs the equivalent of 0.5 km.
    """
    result = await db.execute(
        select(CraftRequest)
        .where(CraftRequest.status == "open")
        .order_by(CraftRequest.created_at.desc())
        .limit(200)
    )
    requests = list(result.scalars())
    now = datetime.now(timezone.utc)
    scored = []
    for r in requests:
        dist = _haversine_km(lat, lng, r.lat, r.lng)
        age_min = max(0.0, (now - _utc(r.created_at)).total_seconds() / 60.0)
        score = (dist if dist is not None else 9999) + age_min * 0.5
        scored.append((score, dist, r))
    scored.sort(key=lambda x: x[0])
    page = scored[offset:offset + limit]
    return [_craft_request_to_dict(r, dist) for _score, dist, r in page]


async def list_customer_craft_requests(
    db: AsyncSession,
    customer_id: uuid.UUID,
    limit: int = 20,
    offset: int = 0,
) -> list[dict]:
    result = await db.execute(
        select(CraftRequest)
        .where(CraftRequest.customer_id == customer_id)
        .order_by(CraftRequest.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return [_craft_request_to_dict(r) for r in result.scalars()]


async def cancel_craft_request(
    db: AsyncSession,
    request_id: uuid.UUID,
    user_id: uuid.UUID,
    is_admin: bool = False,
) -> dict:
    req = await get_craft_request(db, request_id)
    if not is_admin and req.customer_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your request.")
    if req.status in ("completed", "cancelled"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot cancel a request with status '{req.status}'.",
        )
    req.status = "cancelled"
    req.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(req)
    return _craft_request_to_dict(req)


# ---------------------------------------------------------------------------
# CraftBid CRUD
# ---------------------------------------------------------------------------

async def create_craft_bid(
    db: AsyncSession,
    request_id: uuid.UUID,
    professional_id: uuid.UUID,
    price_cents: int,
    eta_min: int = 0,
    note: str | None = None,
    professional_lat: float | None = None,
    professional_lng: float | None = None,
) -> dict:
    req = await get_craft_request(db, request_id)
    if req.status != "open":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot bid on a request with status '{req.status}'.",
        )
    # Check if this professional already bid on this request
    existing = await db.scalar(
        select(CraftBid).where(
            CraftBid.request_id == request_id,
            CraftBid.professional_id == professional_id,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already submitted a bid for this request.",
        )
    if price_cents <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Price must be greater than zero.",
        )
    # ETA is computed by the system from the professional's position to the
    # customer's location. Falls back to the caller-supplied value only when no
    # professional position is available.
    final_eta = eta_min
    if professional_lat is not None and professional_lng is not None:
        from app.pricing import get_route_info  # noqa: PLC0415
        route = await get_route_info(professional_lat, professional_lng, req.lat, req.lng)
        if route.duration_min and route.duration_min > 0:
            final_eta = route.duration_min
    if final_eta is None or final_eta <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not determine an ETA — provide the professional's position.",
        )
    bid = CraftBid(
        request_id=request_id,
        professional_id=professional_id,
        price_cents=price_cents,
        eta_min=final_eta,
        note=note,
        professional_lat=professional_lat,
        professional_lng=professional_lng,
        status="pending",
        created_at=datetime.now(timezone.utc),
    )
    db.add(bid)
    await db.commit()
    await db.refresh(bid)
    # Compute distance from professional to customer
    dist = None
    if professional_lat is not None and professional_lng is not None:
        dist = _haversine_km(professional_lat, professional_lng, req.lat, req.lng)
    return _craft_bid_to_dict(bid, dist)


async def list_bids_for_request(
    db: AsyncSession,
    request_id: uuid.UUID,
    customer_lat: float | None = None,
    customer_lng: float | None = None,
) -> list[dict]:
    result = await db.execute(
        select(CraftBid)
        .where(CraftBid.request_id == request_id)
        .order_by(CraftBid.created_at.asc())
    )
    bids = list(result.scalars())
    out = []
    for b in bids:
        dist = None
        if (
            customer_lat is not None
            and customer_lng is not None
            and b.professional_lat is not None
            and b.professional_lng is not None
        ):
            dist = _haversine_km(
                customer_lat, customer_lng, b.professional_lat, b.professional_lng
            )
        out.append(_craft_bid_to_dict(b, dist))
    return out


async def list_professional_bids(
    db: AsyncSession,
    professional_id: uuid.UUID,
    limit: int = 20,
    offset: int = 0,
) -> list[dict]:
    result = await db.execute(
        select(CraftBid)
        .where(CraftBid.professional_id == professional_id)
        .order_by(CraftBid.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return [_craft_bid_to_dict(b) for b in result.scalars()]


# ---------------------------------------------------------------------------
# Sprint 66 — admin per-entity history & earnings
# ---------------------------------------------------------------------------

async def resolve_driver_auth_id(db: AsyncSession, entity_id_str: str) -> str:
    """Resolve a Driver DB id (UUID string) to the driver's auth ``user_id``.

    Lets admin endpoints reuse the existing self-service driver crud
    (``list_driver_trip_history`` / ``get_driver_earnings``).
    """
    try:
        entity_uuid = uuid.UUID(entity_id_str)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid driver id format")
    driver = await db.scalar(select(Driver).where(Driver.id == entity_uuid))
    if driver is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found")
    user = await db.scalar(select(User).where(User.id == driver.user_id))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver user not found")
    return user.user_id


async def admin_professional_summary(db: AsyncSession, entity_id_str: str) -> dict:
    """Return a professional's accepted interventions + total earnings (USD cents)."""
    try:
        entity_uuid = uuid.UUID(entity_id_str)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid professional id format")
    pro = await db.scalar(select(Professional).where(Professional.id == entity_uuid))
    if pro is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Professional not found")
    rows = await db.execute(
        select(CraftBid)
        .where(CraftBid.professional_id == pro.id, CraftBid.status == "accepted")
        .order_by(CraftBid.created_at.desc())
    )
    bids = list(rows.scalars())
    interventions = [
        {
            "bid_id": str(b.id),
            "request_id": str(b.request_id),
            "price_cents": b.price_cents,
            "eta_min": b.eta_min,
            "created_at": _utc(b.created_at).isoformat(),
        }
        for b in bids
    ]
    total = sum(b.price_cents for b in bids)
    return {
        "total_earnings_cents": total,
        "intervention_count": len(bids),
        "interventions": interventions,
    }


# ---------------------------------------------------------------------------
# Professional payouts (withdrawals) — Sprint 67. Isolated from driver flow.
# ---------------------------------------------------------------------------

#: Pro payout statuses that count against available balance (mirror driver).
_ACTIVE_PRO_PAYOUT_STATUSES = ("pending", "approved", "processed")


async def _require_professional(db: AsyncSession, auth_user_id: str) -> Professional:
    """Resolve the authenticated user to their professional profile (404 if none)."""
    user_id = await get_user_db_id(db, auth_user_id)
    prof = await get_professional_by_user(db, user_id)
    if prof is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Professional profile not found.",
        )
    return prof


async def _professional_gains_and_payouts(
    db: AsyncSession, prof: Professional
) -> tuple[int, int, int]:
    """Return ``(gains_cents, committed_cents, disponible_cents)`` for a pro.

    ``gains`` = Σ price_cents of accepted bids (matches admin_professional_summary).
    ``committed`` = Σ amount_cents of non-rejected payout requests.
    ``disponible = gains - committed`` (not clamped).
    """
    gains_row = await db.execute(
        select(func.coalesce(func.sum(CraftBid.price_cents), 0)).where(
            CraftBid.professional_id == prof.id, CraftBid.status == "accepted"
        )
    )
    gains = int(gains_row.scalar_one() or 0)

    committed_row = await db.execute(
        select(func.coalesce(func.sum(ProPayoutModel.amount_cents), 0)).where(
            ProPayoutModel.professional_id == prof.id,
            ProPayoutModel.status.in_(_ACTIVE_PRO_PAYOUT_STATUSES),
        )
    )
    committed = int(committed_row.scalar_one() or 0)
    return gains, committed, gains - committed


async def get_professional_balance(db: AsyncSession, auth_user_id: str) -> dict:
    """Return a professional's available withdrawal balance (USD cents)."""
    prof = await _require_professional(db, auth_user_id)
    gains, committed, disponible = await _professional_gains_and_payouts(db, prof)
    # Sprint 70 — the pro's bid is transferred to their Connect account at charge
    # time; expose that (real, withdrawable) balance.
    from app.payment import stripe_connect  # noqa: PLC0415
    connect = stripe_connect.get_balance(prof.stripe_account_id or "")
    return {
        "professional_id": str(prof.id),
        "gains_cents": gains,
        "retraits_cents": committed,
        "disponible_cents": max(disponible, 0),
        "connect_available_cents": connect["available_cents"],
        "connect_pending_cents": connect["pending_cents"],
    }


async def create_professional_payout_request(
    db: AsyncSession, auth_user_id: str, amount_cents: int
) -> ProPayoutModel:
    """Professional requests a withdrawal, capped at their available balance."""
    prof = await _require_professional(db, auth_user_id)
    if amount_cents <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="amount_cents must be greater than 0",
        )
    await _enforce_withdrawal_limits(db, ProPayoutModel, ProPayoutModel.professional_id, prof.id, amount_cents)
    _gains, _committed, disponible = await _professional_gains_and_payouts(db, prof)
    disponible = max(disponible, 0)
    if amount_cents > disponible:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Amount exceeds available balance ({disponible})",
        )
    req = ProPayoutModel(
        professional_id=prof.id,
        amount_cents=amount_cents,
        status="pending",
    )
    db.add(req)
    await db.commit()
    await db.refresh(req)
    return req


async def list_professional_payout_requests(
    db: AsyncSession, auth_user_id: str
) -> list[ProPayoutModel]:
    """Return all payout requests for the authenticated professional, newest first."""
    prof = await _require_professional(db, auth_user_id)
    result = await db.execute(
        select(ProPayoutModel)
        .where(ProPayoutModel.professional_id == prof.id)
        .order_by(ProPayoutModel.created_at.desc())
    )
    return list(result.scalars().all())


async def select_craft_bid(
    db: AsyncSession,
    request_id: uuid.UUID,
    bid_id: uuid.UUID,
    customer_id: uuid.UUID,
) -> dict:
    """Customer selects a bid — closes bidding, assigns the professional."""
    req = await get_craft_request(db, request_id)
    if req.customer_id != customer_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your request.")
    if req.status not in ("open", "bidding_closed"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot select a bid when request status is '{req.status}'.",
        )
    # Verify bid belongs to this request
    bid = await db.scalar(
        select(CraftBid).where(
            CraftBid.id == bid_id,
            CraftBid.request_id == request_id,
        )
    )
    if bid is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bid not found for this request.")
    # Mark selected bid as accepted, others as rejected
    all_bids_result = await db.execute(
        select(CraftBid).where(CraftBid.request_id == request_id)
    )
    for b in all_bids_result.scalars():
        b.status = "accepted" if b.id == bid_id else "rejected"
    # Update request — assign + generate the shared pickup verification code
    req.selected_bid_id = bid_id
    req.status = "assigned"
    req.verification_code = f"{secrets.randbelow(10000):04d}"
    req.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(req)
    # Notify the selected professional
    prof = await db.get(Professional, bid.professional_id)
    if prof is not None:
        await _push_notification(
            db, prof.user_id,
            "craft_bid_accepted",
            "🛠️ Your bid was accepted",
            "A customer selected your offer. Open the request to navigate to them.",
        )
    return _craft_request_to_dict(req)


# ---------------------------------------------------------------------------
# Craft job lifecycle (after a bid is selected)
#   assigned → arrived (pro) → in_progress (customer) → pro_done (pro)
#            → completed (customer)
# ---------------------------------------------------------------------------

async def _assigned_bid(db: AsyncSession, req: CraftRequest) -> CraftBid | None:
    if req.selected_bid_id is None:
        return None
    return await db.get(CraftBid, req.selected_bid_id)


async def _require_assigned_pro(db: AsyncSession, req: CraftRequest, auth_user_id: str) -> Professional:
    prof = await _require_professional(db, auth_user_id)
    bid = await _assigned_bid(db, req)
    if bid is None or bid.professional_id != prof.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This request is not assigned to you.",
        )
    return prof


async def _craft_pro_user_id(db: AsyncSession, req: CraftRequest) -> uuid.UUID | None:
    bid = await _assigned_bid(db, req)
    if bid is None:
        return None
    prof = await db.get(Professional, bid.professional_id)
    return prof.user_id if prof else None


async def professional_mark_arrived(db: AsyncSession, request_id: uuid.UUID, auth_user_id: str) -> dict:
    """Pro confirms arrival at the customer's location → arrived."""
    req = await get_craft_request(db, request_id)
    await _require_assigned_pro(db, req, auth_user_id)
    if req.status != "assigned":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot mark arrival when status is '{req.status}'.",
        )
    req.status = "arrived"
    req.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(req)
    await _push_notification(
        db, req.customer_id,
        "craft_pro_arrived",
        "📍 Your professional has arrived",
        "Confirm their arrival so they can start the job.",
    )
    return _craft_request_to_dict(req)


async def customer_confirm_craft_arrival(db: AsyncSession, request_id: uuid.UUID, customer_id: uuid.UUID) -> dict:
    """Customer validates the pro has arrived → in_progress (work starts)."""
    req = await get_craft_request(db, request_id)
    if req.customer_id != customer_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your request.")
    if req.status != "arrived":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot confirm arrival when status is '{req.status}'.",
        )
    req.status = "in_progress"
    req.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(req)
    pro_uid = await _craft_pro_user_id(db, req)
    if pro_uid is not None:
        await _push_notification(
            db, pro_uid,
            "craft_started",
            "✅ Customer confirmed your arrival",
            "You can start the work now.",
        )
    return _craft_request_to_dict(req)


async def professional_work_done(db: AsyncSession, request_id: uuid.UUID, auth_user_id: str) -> dict:
    """Pro confirms the work is finished → pro_done (awaiting customer)."""
    req = await get_craft_request(db, request_id)
    await _require_assigned_pro(db, req, auth_user_id)
    if req.status != "in_progress":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot mark work done when status is '{req.status}'.",
        )
    req.status = "pro_done"
    req.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(req)
    await _push_notification(
        db, req.customer_id,
        "craft_work_done",
        "🔧 Work completed",
        "Your professional marked the job as done — please confirm.",
    )
    return _craft_request_to_dict(req)


async def customer_complete_craft(db: AsyncSession, request_id: uuid.UUID, customer_id: uuid.UUID) -> dict:
    """Customer confirms the work is finished → completed (ready for payment)."""
    req = await get_craft_request(db, request_id)
    if req.customer_id != customer_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your request.")
    if req.status != "pro_done":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot complete when status is '{req.status}'.",
        )
    req.status = "completed"
    req.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(req)
    pro_uid = await _craft_pro_user_id(db, req)
    if pro_uid is not None:
        await _push_notification(
            db, pro_uid,
            "craft_completed",
            "🎉 Job confirmed complete",
            "The customer confirmed completion. Payment will follow.",
        )
    return _craft_request_to_dict(req)


# ---------------------------------------------------------------------------
# Craft photos (before / after)
# ---------------------------------------------------------------------------

def _craft_photo_to_dict(p: CraftPhoto) -> dict:
    return {
        "photo_id": str(p.id),
        "request_id": str(p.request_id),
        "kind": p.kind,
        "url": signed_read_url(p.url),
        "created_at": p.created_at.isoformat(),
    }


async def add_craft_photo(
    db: AsyncSession, request_id: uuid.UUID, kind: str, url: str, uploaded_by: uuid.UUID
) -> dict:
    if kind not in ("before", "after"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="kind must be 'before' or 'after'.",
        )
    photo = CraftPhoto(
        request_id=request_id, kind=kind, url=url,
        uploaded_by=uploaded_by, created_at=datetime.now(timezone.utc),
    )
    db.add(photo)
    await db.commit()
    await db.refresh(photo)
    return _craft_photo_to_dict(photo)


async def list_craft_photos(db: AsyncSession, request_id: uuid.UUID) -> list[dict]:
    result = await db.execute(
        select(CraftPhoto).where(CraftPhoto.request_id == request_id).order_by(CraftPhoto.created_at)
    )
    return [_craft_photo_to_dict(p) for p in result.scalars()]


# ---------------------------------------------------------------------------
# Craft payments (reuse the trip PaymentIntent / checkout infrastructure)
# ---------------------------------------------------------------------------

async def create_craft_payment_intent(
    db: AsyncSession,
    claims: Claims,
    request_id: str,
    adapter,
    return_url: str = "https://app.ziza.live/payment/return",
    notify_url: str | None = None,
) -> dict:
    """Create (or return existing) PaymentIntent for a completed craft job.

    Amount = the accepted bid's price. Customer-only; idempotent.
    """
    user = await _get_user_by_auth_id(db, claims.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    try:
        rid = uuid.UUID(request_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid request id")
    req = await db.get(CraftRequest, rid)
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Craft request not found")
    if req.customer_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not own this request")
    if req.status != "completed":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"The job must be completed to pay (current status: {req.status!r})",
        )

    existing = await db.scalar(
        select(PaymentIntent).where(PaymentIntent.craft_request_id == rid)
    )
    if existing is not None:
        return _intent_to_dict(existing)

    bid = await _assigned_bid(db, req)
    if bid is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No accepted bid to charge for this request.",
        )

    # Sprint 70 — split at charge time (Connect destination charge). Customer
    # pays bid + platform fee + tax; the professional receives 100 % of the bid;
    # Ziza keeps fee + tax. The professional must be onboarded to Connect.
    from app.payment.split import compute_craft_split  # noqa: PLC0415
    from app.models.craft import Professional  # noqa: PLC0415

    cfg = await load_payment_config(db)
    split = compute_craft_split(bid.price_cents, cfg)
    destination = await _require_payee_connect_account(
        db, Professional, bid.professional_id, "professional"
    )

    intent = PaymentIntent(
        craft_request_id=rid,
        amount_cents=split.total_client_cents,
        provider=getattr(adapter, "_provider_name", "mock"),
        base_cents=split.base_cents,
        platform_fee_cents=split.platform_fee_cents,
        tax_cents=split.tax_cents,
        stripe_fee_est_cents=split.stripe_fee_est_cents,
        payee_amount_cents=split.pro_amount_cents,
        platform_amount_cents=split.platform_amount_cents,
        payee_account_id=destination,
    )
    db.add(intent)
    await db.flush()
    checkout = await adapter.create_checkout(
        amount_cents=split.total_client_cents, ref=str(intent.id),
        return_url=return_url, notify_url=notify_url or None,
        destination=destination, application_fee_cents=split.platform_amount_cents,
    )
    intent.provider_ref = checkout["provider_ref"]
    intent.checkout_url = checkout["checkout_url"]
    await db.commit()
    await db.refresh(intent)
    return _intent_to_dict(intent)


async def get_craft_payment_for_request(db: AsyncSession, claims: Claims, request_id: str) -> dict | None:
    """Return the PaymentIntent for a craft request, or None. Customer-only."""
    user = await _get_user_by_auth_id(db, claims.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    try:
        rid = uuid.UUID(request_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid request id")
    req = await db.get(CraftRequest, rid)
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Craft request not found")
    if req.customer_id != user.id and claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your request")
    intent = await db.scalar(
        select(PaymentIntent).where(PaymentIntent.craft_request_id == rid)
    )
    return _intent_to_dict(intent) if intent else None


# ---------------------------------------------------------------------------
# Admin Craft helpers
# ---------------------------------------------------------------------------

async def admin_list_craft_requests(
    db: AsyncSession,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    result = await db.execute(
        select(CraftRequest)
        .order_by(CraftRequest.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return [_craft_request_to_dict(r) for r in result.scalars()]


async def admin_list_professionals(
    db: AsyncSession,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    result = await db.execute(
        select(Professional)
        .order_by(Professional.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return [_professional_to_dict(p) for p in result.scalars()]


# ---------------------------------------------------------------------------
# Onboarding review — Sprint 57
# ---------------------------------------------------------------------------

async def admin_list_onboarding(db: AsyncSession) -> list[dict]:
    """Return all drivers + professionals with status='pending_docs', each with doc counts."""
    out: list[dict] = []

    # --- Drivers pending_docs ---
    d_result = await db.execute(
        select(Driver, User)
        .join(User, Driver.user_id == User.id)
        .where(Driver.status == "pending_docs")
        .order_by(Driver.created_at.desc())
    )
    for driver, user in d_result.all():
        r_counts = await db.execute(
            select(DriverDocument.status, func.count(DriverDocument.id))
            .where(DriverDocument.driver_id == driver.id)
            .group_by(DriverDocument.status)
        )
        dc = {row[0]: row[1] for row in r_counts.all()}
        out.append({
            "entity_type": "driver",
            "entity_id": str(driver.id),
            "user_id": user.user_id,
            "email": user.email,
            "name": user.name or user.email.split("@")[0],
            "status": driver.status,
            "doc_counts": {
                "pending": dc.get("pending", 0),
                "approved": dc.get("approved", 0),
                "rejected": dc.get("rejected", 0),
                "needs_resubmission": dc.get("needs_resubmission", 0),
                "total": sum(dc.values()),
            },
            "created_at": _utc(driver.created_at).isoformat(),
        })

    # --- Professionals pending_docs ---
    from app.models.craft import Professional as _Prof
    p_result = await db.execute(
        select(_Prof, User)
        .join(User, _Prof.user_id == User.id)
        .where(_Prof.status == "pending_docs")
        .order_by(_Prof.created_at.desc())
    )
    for prof, user in p_result.all():
        r_counts = await db.execute(
            select(ProfessionalDocument.status, func.count(ProfessionalDocument.id))
            .where(ProfessionalDocument.professional_id == prof.id)
            .group_by(ProfessionalDocument.status)
        )
        dc = {row[0]: row[1] for row in r_counts.all()}
        out.append({
            "entity_type": "professional",
            "entity_id": str(prof.id),
            "user_id": user.user_id,
            "email": user.email,
            "name": user.name or user.email.split("@")[0],
            "status": prof.status,
            "doc_counts": {
                "pending": dc.get("pending", 0),
                "approved": dc.get("approved", 0),
                "rejected": dc.get("rejected", 0),
                "needs_resubmission": dc.get("needs_resubmission", 0),
                "total": sum(dc.values()),
            },
            "created_at": _utc(prof.created_at).isoformat(),
        })

    return out


async def admin_get_onboarding_detail(
    db: AsyncSession,
    entity_id_str: str,
    entity_type: str,
) -> dict:
    """Return an onboarding user's profile + all submitted KYC documents."""
    if entity_type not in {"driver", "professional"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="entity_type must be 'driver' or 'professional'",
        )
    try:
        entity_uuid = uuid.UUID(entity_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid entity_id format",
        )

    if entity_type == "driver":
        driver = await db.scalar(select(Driver).where(Driver.id == entity_uuid))
        if driver is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found")
        user_row = await db.execute(select(User).where(User.id == driver.user_id))
        user = user_row.scalar_one_or_none()

        # Documents
        r_docs = await db.execute(
            select(DriverDocument)
            .where(DriverDocument.driver_id == driver.id)
            .order_by(DriverDocument.created_at.desc())
        )
        docs = [
            {
                "document_id": str(d.id),
                "type": d.type,
                "url": signed_read_url(d.url),
                "status": d.status,
                "note_admin": d.note_admin,
                "created_at": _utc(d.created_at).isoformat(),
                "updated_at": _utc(d.updated_at).isoformat(),
            }
            for d in r_docs.scalars().all()
        ]

        # Sprint 63 — Vehicle
        vehicle_row = await db.scalar(select(Vehicle).where(Vehicle.driver_id == driver.id))
        vehicle_data = None
        if vehicle_row:
            vehicle_data = {
                "plate": vehicle_row.plate,
                "make": vehicle_row.make,
                "model": vehicle_row.model,
                "year": vehicle_row.year,
                "color": vehicle_row.color,
                "category": vehicle_row.category,
            }

        # Sprint 63 — Rating stats
        r_rating = await db.execute(
            select(func.avg(Rating.stars), func.count(Rating.id))
            .where(Rating.driver_id == driver.id)
        )
        avg_stars, total_ratings = r_rating.one()

        # Sprint 63 — Completed trip count
        total_trips = await db.scalar(
            select(func.count(Trip.id))
            .where(Trip.driver_id == driver.id, Trip.status == "completed")
        ) or 0

        return {
            "entity_type": "driver",
            "entity_id": str(driver.id),
            "email": user.email if user else "",
            "name": (user.name or user.email.split("@")[0]) if user else "",
            "phone": user.phone if user else None,
            "first_name": user.first_name if user else None,
            "last_name": user.last_name if user else None,
            "date_of_birth": user.date_of_birth if user else None,
            "status": driver.status,
            "is_online": driver.is_online,
            "license_number": driver.license_number,
            "created_at": _utc(driver.created_at).isoformat(),
            "vehicle": vehicle_data,
            "avg_rating": round(float(avg_stars), 2) if avg_stars is not None else None,
            "total_ratings": int(total_ratings) if total_ratings else 0,
            "total_trips": int(total_trips),
            "documents": docs,
        }

    else:  # professional
        from app.models.craft import Professional as _Prof
        prof = await db.scalar(select(_Prof).where(_Prof.id == entity_uuid))
        if prof is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Professional not found")
        user_row = await db.execute(select(User).where(User.id == prof.user_id))
        user = user_row.scalar_one_or_none()
        r_docs = await db.execute(
            select(ProfessionalDocument)
            .where(ProfessionalDocument.professional_id == prof.id)
            .order_by(ProfessionalDocument.created_at.desc())
        )
        docs = [
            {
                "document_id": str(d.id),
                "type": d.type,
                "url": signed_read_url(d.url),
                "status": d.status,
                "note_admin": d.note_admin,
                "created_at": _utc(d.created_at).isoformat(),
                "updated_at": _utc(d.updated_at).isoformat(),
            }
            for d in r_docs.scalars().all()
        ]
        return {
            "entity_type": "professional",
            "entity_id": str(prof.id),
            "email": user.email if user else "",
            "name": (user.name or user.email.split("@")[0]) if user else "",
            "phone": user.phone if user else None,
            "first_name": user.first_name if user else None,
            "last_name": user.last_name if user else None,
            "date_of_birth": user.date_of_birth if user else None,
            "status": prof.status,
            "specialties": prof.specialties,
            "documents": docs,
        }


# ---------------------------------------------------------------------------
# Landing content — Sprint 51
# Reuses PlatformSetting (key-value table) with a "landing." key prefix so
# no new migration is needed.
# ---------------------------------------------------------------------------

_LANDING_PREFIX = "landing."


async def get_landing_content(db: AsyncSession) -> dict[str, str]:
    """Return all landing page content blocks as ``{key: html}``."""
    result = await db.execute(
        select(PlatformSetting).where(
            PlatformSetting.key.like(f"{_LANDING_PREFIX}%")
        )
    )
    return {
        row.key[len(_LANDING_PREFIX):]: row.value
        for row in result.scalars()
    }


async def set_landing_content(
    db: AsyncSession,
    content: dict[str, str],
) -> dict[str, str]:
    """Upsert landing page content blocks; returns the full saved dict."""
    for key, value in content.items():
        full_key = f"{_LANDING_PREFIX}{key}"
        existing = await db.get(PlatformSetting, full_key)
        if existing is None:
            db.add(PlatformSetting(key=full_key, value=value))
        else:
            existing.value = value
    await db.commit()
    return await get_landing_content(db)


# ---------------------------------------------------------------------------
# Professional Documents (KYC) — Sprint 54
# ---------------------------------------------------------------------------

async def _get_professional_by_auth_id(
    db: AsyncSession, auth_user_id: str
) -> Professional | None:
    """Return the Professional row for a given auth user_id string."""
    user = await _get_user_by_auth_id(db, auth_user_id)
    if user is None:
        return None
    from app.models.craft import Professional as _Prof  # local import to avoid circular
    return await db.scalar(select(_Prof).where(_Prof.user_id == user.id))


async def submit_professional_document(
    db: AsyncSession,
    auth_user_id: str,
    doc_type: str,
    url: str,
) -> ProfessionalDocument:
    """Professional submits or replaces a KYC document.

    Sprint 59: upsert by (professional_id, type) — re-uploading the same type
    updates the existing record in place (resets status → pending, clears
    note_admin) rather than accumulating duplicate rows.
    Sprint 61: images are converted to PDF before storage.
    """
    url = _ensure_pdf(url)
    prof = await _get_professional_by_auth_id(db, auth_user_id)
    if prof is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Professional profile not found — call POST /v1/craft/professionals/register first",
        )
    if doc_type not in DOCUMENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid document type '{doc_type}'. Valid: {sorted(DOCUMENT_TYPES)}",
        )

    existing = await db.scalar(
        select(ProfessionalDocument).where(
            ProfessionalDocument.professional_id == prof.id,
            ProfessionalDocument.type == doc_type,
        )
    )

    if existing is not None:
        existing.url = url
        existing.status = "pending"
        existing.note_admin = None
        await db.commit()
        await db.refresh(existing)
        return existing

    doc = ProfessionalDocument(
        professional_id=prof.id,
        type=doc_type,
        url=url,
        status="pending",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


async def list_professional_documents(
    db: AsyncSession,
    auth_user_id: str,
) -> list[ProfessionalDocument]:
    """Return all KYC documents submitted by this professional, newest first."""
    prof = await _get_professional_by_auth_id(db, auth_user_id)
    if prof is None:
        return []
    result = await db.execute(
        select(ProfessionalDocument)
        .where(ProfessionalDocument.professional_id == prof.id)
        .order_by(ProfessionalDocument.created_at.desc())
    )
    return list(result.scalars().all())


async def admin_update_professional_document_status(
    db: AsyncSession,
    document_id_str: str,
    new_status: str,
    note_admin: str | None = None,
) -> dict:
    """Admin approves or rejects a professional KYC document.

    Returns a dict compatible with DocumentResponse / AdminDocumentRecord.
    """
    if new_status not in {"approved", "rejected", "needs_resubmission"}:  # Sprint 56
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid status '{new_status}'. Valid: approved, rejected, needs_resubmission",
        )
    try:
        doc_uuid = uuid.UUID(document_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid document_id format",
        )
    result = await db.execute(
        select(ProfessionalDocument).where(ProfessionalDocument.id == doc_uuid)
    )
    doc: ProfessionalDocument | None = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Professional document not found",
        )
    doc.status = new_status
    if note_admin is not None:
        doc.note_admin = note_admin
    doc.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(doc)

    # Sprint 56: notify the professional (mirrored from driver doc logic)
    from app.models.craft import Professional as _Prof
    prof_result = await db.execute(select(_Prof).where(_Prof.id == doc.professional_id))
    reviewed_prof = prof_result.scalar_one_or_none()
    if reviewed_prof is not None:
        doc_type_label = {
            "license": "Professional License",
            "insurance": "Vehicle Insurance",
            "registration": "Vehicle Registration",
            "id_card": "Government ID",
        }.get(doc.type, doc.type)

        _user_row = await db.execute(select(User).where(User.id == reviewed_prof.user_id))
        _user = _user_row.scalar_one_or_none()
        user_name = getattr(_user, "full_name", None) or (getattr(_user, "email", "") or "").split("@")[0]

        if new_status == "approved":
            await _push_notification(
                db, reviewed_prof.user_id,
                "document_approved",
                "✅ Document approved",
                f"Your {doc_type_label} has been approved by the Ziza team.",
            )
        elif new_status == "needs_resubmission":
            await _push_notification(
                db, reviewed_prof.user_id,
                "document_needs_resubmission",
                "🔄 Action required — document update",
                f"Please resubmit your {doc_type_label}."
                + (f" Note: {note_admin}" if note_admin else ""),
                data={
                    "user_name": user_name,
                    "doc_type": doc.type,
                    "note": note_admin or "",
                },
            )
        else:
            note_suffix = f" — {note_admin}" if note_admin else ""
            await _push_notification(
                db, reviewed_prof.user_id,
                "document_rejected",
                "❌ Document rejected",
                f"Your {doc_type_label} was rejected{note_suffix}. Please submit a new document.",
            )

    return {
        "document_id": str(doc.id),
        "driver_id": str(doc.professional_id),  # reuse driver_id field for admin response
        "type": doc.type,
        "url": signed_read_url(doc.url),
        "status": doc.status,
        "note_admin": doc.note_admin,
        "owner_type": "professional",
        "created_at": _utc(doc.created_at).isoformat(),
        "updated_at": _utc(doc.updated_at).isoformat(),
    }


# ---------------------------------------------------------------------------
# In-app messaging — Sprint 66 (trip & craft-request conversations)
# ---------------------------------------------------------------------------

def _message_to_dict(m: Message, my_user_id=None) -> dict:
    return {
        "message_id": str(m.id),
        "sender_role": m.sender_role,
        "body": m.body,
        "created_at": _utc(m.created_at).isoformat(),
        "read": m.read_at is not None,
        "mine": my_user_id is not None and m.sender_user_id == my_user_id,
    }


async def _trip_participant_ids(db: AsyncSession, trip: Trip) -> set:
    ids = {trip.customer_id}
    if trip.driver_id is not None:
        driver = await db.scalar(select(Driver).where(Driver.id == trip.driver_id))
        if driver is not None:
            ids.add(driver.user_id)
    return ids


async def _request_participant_ids(db: AsyncSession, request: CraftRequest) -> set:
    ids = {request.customer_id}
    if request.selected_bid_id is not None:
        bid = await db.scalar(select(CraftBid).where(CraftBid.id == request.selected_bid_id))
        if bid is not None:
            pro = await db.scalar(select(Professional).where(Professional.id == bid.professional_id))
            if pro is not None:
                ids.add(pro.user_id)
    return ids


async def _conversation_context(db: AsyncSession, *, trip_id=None, craft_request_id=None):
    """Return (column filter, participant user-id set) for a trip or request."""
    if trip_id is not None:
        trip = await db.scalar(select(Trip).where(Trip.id == trip_id))
        if trip is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found")
        return Message.trip_id == trip_id, await _trip_participant_ids(db, trip)
    req = await db.scalar(select(CraftRequest).where(CraftRequest.id == craft_request_id))
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    return Message.craft_request_id == craft_request_id, await _request_participant_ids(db, req)


async def send_message(
    db: AsyncSession, *, sender_auth_id: str, sender_role: str, body: str,
    trip_id=None, craft_request_id=None,
) -> dict:
    """Post a message to a trip/request conversation. Only participants may send."""
    body = (body or "").strip()
    if not body:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Message body is required")
    sender = await _get_user_by_auth_id(db, sender_auth_id)
    if sender is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    _filter, participants = await _conversation_context(db, trip_id=trip_id, craft_request_id=craft_request_id)
    if sender.id not in participants:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a participant of this conversation")
    msg = Message(
        trip_id=trip_id, craft_request_id=craft_request_id,
        sender_user_id=sender.id, sender_role=sender_role, body=body[:4000],
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    for uid in participants:
        if uid != sender.id:
            try:
                await _push_notification(db, uid, "message", "💬 New message", body[:120])
            except Exception:
                pass
    return _message_to_dict(msg, my_user_id=sender.id)


async def list_messages(
    db: AsyncSession, *, requester_auth_id: str, requester_role: str,
    trip_id=None, craft_request_id=None, limit: int = 50, offset: int = 0,
) -> list[dict]:
    """List a conversation's messages (oldest first). Participants or admins only.

    Marks the other party's messages as read for a participant viewer.
    """
    requester = await _get_user_by_auth_id(db, requester_auth_id)
    is_admin = requester_role == "admin"
    col_filter, participants = await _conversation_context(db, trip_id=trip_id, craft_request_id=craft_request_id)
    if not is_admin and (requester is None or requester.id not in participants):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a participant of this conversation")
    rows = await db.execute(
        select(Message).where(col_filter)
        .order_by(Message.created_at.asc())
        .limit(min(limit, 200)).offset(offset)
    )
    msgs = list(rows.scalars())
    my_id = requester.id if requester else None
    if not is_admin and my_id is not None:
        now = datetime.now(timezone.utc)
        changed = False
        for m in msgs:
            if m.read_at is None and m.sender_user_id != my_id:
                m.read_at = now
                changed = True
        if changed:
            await db.commit()
    return [_message_to_dict(m, my_user_id=my_id) for m in msgs]


async def admin_update_professional_status(
    db: AsyncSession,
    professional_id_str: str,
    new_status: str,
) -> dict:
    """Admin sets a professional's status (active | inactive | suspended | pending_docs)."""
    valid = {"active", "inactive", "suspended", "pending_docs"}
    if new_status not in valid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid status '{new_status}'. Valid: {sorted(valid)}",
        )
    try:
        prof_uuid = uuid.UUID(professional_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid professional_id format",
        )
    from app.models.craft import Professional as _Prof
    prof = await db.scalar(select(_Prof).where(_Prof.id == prof_uuid))
    if prof is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Professional not found",
        )
    prof.status = new_status
    await db.commit()
    await db.refresh(prof)
    return _professional_to_dict(prof)
