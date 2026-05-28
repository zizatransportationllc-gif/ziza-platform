"""Ziza API — Sprint 36.

Endpoints:
  GET   /health                                    liveness probe
  GET   /v1/demo                                   Sprint 1 demo payload
  POST  /v1/token                                  [DEV only] exchange email+password for a JWT
  GET   /v1/me                                     return normalised claims for the authenticated user
  POST  /v1/auth/register                          upsert user in DB and return profile
  GET   /v1/profile                                authenticated user's profile (name, phone)
  PATCH /v1/profile                                update user's name and/or phone
  POST  /v1/estimate                               fare estimate for a ride (origin → destination)
  POST  /v1/trips                                  book a trip from a valid estimate
  GET   /v1/trips                                  list customer's trips (paginated)
  GET   /v1/trips/driver/available                 pending trips (driver view)
  GET   /v1/trips/driver/active                    driver's current active trip
  GET   /v1/trips/driver/history                   driver's completed/cancelled trips (paginated)
  GET   /v1/trips/{trip_id}                        trip detail + events
  PATCH /v1/trips/{trip_id}/cancel                 customer cancels a pending/accepted trip
  PATCH /v1/trips/{trip_id}/accept                 driver accepts a pending trip
  PATCH /v1/trips/{trip_id}/start                  driver starts an accepted trip
  PATCH /v1/trips/{trip_id}/complete               driver completes an in_progress trip
  POST  /v1/drivers/register                       create/upsert driver profile
  GET   /v1/drivers/me/profile                     driver profile (is_online, status)
  PUT   /v1/drivers/me/online                      toggle driver online/offline presence
  GET   /v1/drivers/me/capabilities                driver reads their capability set
  PUT   /v1/drivers/me/capabilities                driver replaces their capability set
  POST  /v1/trips/{trip_id}/rate                   customer rates a completed trip (1-5 stars)
  GET   /v1/trips/{trip_id}/rating                 get the rating for a trip
  GET   /v1/drivers/me/rating                      driver's own rating statistics
  POST  /v1/assistance                             customer creates a roadside assistance request
  GET   /v1/assistance/driver/available            pending assistance requests, filtered by capabilities
  GET   /v1/assistance/driver/active               driver's current active assistance request
  GET   /v1/assistance/{req_id}                    customer views their assistance request
  PATCH /v1/assistance/{req_id}/cancel             customer cancels a pending request
  PATCH /v1/assistance/{req_id}/accept             driver accepts a pending request (stores ETA)
  PATCH /v1/assistance/{req_id}/start              driver starts the intervention
  PATCH /v1/assistance/{req_id}/resolve            driver resolves the intervention
  GET   /v1/admin/drivers                          admin lists all drivers + capabilities
  PUT   /v1/admin/drivers/{driver_id}/capabilities admin sets capabilities for a driver
  GET   /v1/drivers/me/earnings                    driver's earnings summary (total, today, week)
  GET   /v1/admin/stats                            platform-wide statistics
  GET   /v1/admin/trips                            all trips paginated (admin view)
  GET   /v1/admin/assistance                       all assistance requests paginated (admin view)
  POST  /v1/drivers/me/vehicle                     driver registers / updates their vehicle
  GET   /v1/drivers/me/vehicle                     driver gets their current vehicle
  GET   /v1/assistance                             customer lists all their assistance requests
  GET   /v1/admin/users                            admin lists all registered users
  POST  /v1/admin/promos                           admin creates a promo code
  GET   /v1/admin/promos                           admin lists all promo codes
  DELETE /v1/admin/promos/{code}                   admin deactivates a promo code
  PATCH /v1/admin/drivers/{driver_id}/status       admin sets driver status
  POST  /v1/promos/validate                        customer validates a promo code
  POST  /v1/drivers/me/payout-requests             driver creates a payout request
  GET   /v1/drivers/me/payout-requests             driver lists their payout requests
  GET   /v1/admin/payout-requests                  admin lists all payout requests
  PATCH /v1/admin/payout-requests/{id}/status      admin approves or rejects a payout
  GET   /v1/admin/ratings                          admin lists all ratings
  GET   /v1/admin/settings/surge                   admin reads the surge multiplier
  PATCH /v1/admin/settings/surge                   admin sets the surge multiplier (1.0-5.0)
  POST  /v1/drivers/me/documents                   driver submits a KYC document (type + URL)
  GET   /v1/drivers/me/documents                   driver lists their submitted documents
  GET   /v1/admin/documents                        admin lists all driver documents (paginated)
  PATCH /v1/admin/documents/{id}/status            admin approves or rejects a document
  GET   /v1/admin/pending-counts                   admin pending-action item counts
  GET   /v1/notifications                          list user's notifications (newest first)
  GET   /v1/notifications/unread-count             count of unread notifications
  PATCH /v1/notifications/read-all                 mark all notifications as read
  GET   /v1/admin/trips (filters)                  status, customer_email, date_from, date_to
  GET   /v1/admin/users (filters)                  role, email
  PUT   /v1/drivers/me/location                    driver updates their GPS position
  GET   /v1/drivers/me/location                    driver retrieves their last GPS position
  GET   /v1/trips/{trip_id}/eta                    customer gets driver ETA for an active trip
  GET   /v1/places                                 list authenticated user's saved places
  POST  /v1/places                                 create a saved place (max 10)
  PATCH /v1/places/{place_id}                      update a saved place (label/name/lat/lng)
  DELETE /v1/places/{place_id}                     delete a saved place
  GET   /v1/categories                             list vehicle categories + fare multipliers
  GET   /v1/trips/{trip_id}/tracking               customer polls driver live position (Sprint 23)
  POST  /v1/payments/intent                        customer creates a payment intent for a completed trip (Sprint 24)
  GET   /v1/payments/{intent_id}                   customer reads their payment intent status (Sprint 24)
  POST  /v1/payments/webhook                       payment provider confirms or rejects a payment (Sprint 24)
  GET   /v1/trips/{trip_id}/payment                shortcut: payment status for a trip (Sprint 24)
  POST  /v1/auth/refresh                           exchange a valid refresh token for a new token pair (Sprint 25)
  POST  /v1/auth/logout                            revoke the active refresh token (Sprint 25)
  POST  /v1/drivers/me/documents/upload-url        get a signed GCS URL for direct document upload (Sprint 25)
  POST  /v1/devices/register                       register a FCM / web-push device token (Sprint 26)
  DELETE /v1/devices/{token}                       revoke a device token on logout (Sprint 26)
  GET   /v1/drivers/me/balance                     driver's net available balance after commission (Sprint 29)
  GET   /v1/admin/commission                       list platform commission rates per category (Sprint 29)
  POST  /v1/admin/commission                       create/update a commission rate (Sprint 29)
  POST  /v1/admin/payouts/run                      run batch payout for all approved requests (Sprint 29)
  POST  /v1/drivers/apply                          customer submits a driver application (Sprint 30)
  GET   /v1/drivers/apply/status                   customer reads their own application status (Sprint 30)
  GET   /v1/admin/applications                     admin lists all applications, filterable by status (Sprint 30)
  GET   /v1/admin/applications/{id}               admin reads a single application detail (Sprint 30)
  PATCH /v1/admin/applications/{id}/review        admin approves or rejects an application (Sprint 30)
  GET   /v1/admin/flags                           list all feature flags (Sprint 31)
  PATCH /v1/admin/flags/{name}                    enable/disable a feature flag (Sprint 31)
  GET   /v1/flags/{name}                          public read of a single flag (Sprint 31)
  GET   /v1/admin/drivers/live                    list online drivers with last position (Sprint 31)
  PATCH /v1/admin/users/{user_id}/role            admin changes a user's role (Sprint 31)
  POST  /v1/admin/invite-codes                    create an invite code (Sprint 31)
  POST  /v1/invite-codes/use                      consume an invite code (Sprint 31)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

import sqlalchemy as _sa
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.auth.base import Claims
from app.auth.dependencies import get_current_user
from app.config import settings
from app.db import get_db, get_db_optional
from app.middleware.logging import RequestLoggingMiddleware
from app.middleware.rate_limit import RateLimitMiddleware, set_rate_limit_enabled
from app.notifications.dispatcher import register_channel

app = FastAPI(
    title="Ziza API",
    version=settings.app_version,
    description="Ziza Transportation backend API",
)

# Sprint 25: activate rate limiter if enabled in settings
if settings.rate_limit_enabled:
    set_rate_limit_enabled(True)

# Sprint 26: register external notification channels when credentials are set
if settings.sendgrid_api_key:
    from app.notifications.sendgrid_channel import SendGridChannel  # noqa: PLC0415
    register_channel(SendGridChannel(settings.sendgrid_api_key, settings.sendgrid_from_email))

if settings.africas_talking_api_key:
    from app.notifications.africas_talking import AfricasTalkingChannel  # noqa: PLC0415
    register_channel(AfricasTalkingChannel(
        settings.africas_talking_api_key,
        settings.africas_talking_username,
    ))

# Middleware order: CORSMiddleware first (outermost), then rate limiter, then logging
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RateLimitMiddleware)   # Sprint 25 — disabled by default
app.add_middleware(RequestLoggingMiddleware)


# ---------------------------------------------------------------------------
# System
# ---------------------------------------------------------------------------

@app.get("/health", tags=["system"])
async def health() -> dict:
    """Liveness + readiness probe — Sprint 19.

    Returns app metadata and an optional live DB connectivity check.
    Always returns HTTP 200 so Cloud Run health checks never fail on startup.
    CI smoke tests assert ``status == "ok"``.

    DB status values:
      "ok"           — connected and responsive
      "error"        — configured but not reachable
      "unconfigured" — DATABASE_URL not set (safe degraded mode)
    """
    from app.db import _SessionLocal  # noqa: PLC0415 — avoid circular at module level

    db_status: str
    if _SessionLocal is None:
        db_status = "unconfigured"
    else:
        db_status = "error"
        try:
            async with _SessionLocal() as _db:
                await _db.execute(_sa.text("SELECT 1"))
            db_status = "ok"
        except Exception:
            pass

    return {
        "status": "ok",
        "version": settings.app_version,
        "environment": settings.environment,
        "db": db_status,
    }


# ---------------------------------------------------------------------------
# Demo (Sprint 1 — kept for backwards-compat)
# ---------------------------------------------------------------------------

@app.get("/v1/demo", tags=["demo"])
def demo() -> dict[str, str]:
    """Sample payload consumed by the three demo frontends."""
    return {
        "app": settings.app_name,
        "message": "Hello from Ziza backend",
        "version": settings.app_version,
        "environment": settings.environment,
    }


# ---------------------------------------------------------------------------
# Auth — POST /v1/token  (DEV only)
# ---------------------------------------------------------------------------

class TokenRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int | None = None        # seconds until access token expires (Sprint 25)
    refresh_token: str | None = None     # opaque refresh token (Sprint 25)


@app.post(
    "/v1/token",
    tags=["auth"],
    summary="[DEV] Exchange email+password for a JWT + refresh token",
    include_in_schema=True,
)
async def issue_token(
    body: TokenRequest,
    db: AsyncSession | None = Depends(get_db_optional),
) -> TokenResponse:
    """DEV-only endpoint.  Returns 404 in production.

    Sprint 25: also issues a refresh token (30-day TTL) and includes
    ``expires_in`` (seconds until access token expires).

    When DATABASE_URL is not configured the endpoint still returns a valid
    access token; the refresh_token field is omitted (None).  This allows
    local front-end development without a running PostgreSQL instance.
    """
    if settings.environment == "prod":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    from app.auth.dev_adapter import DevAdapter, SEEDED_USERS  # noqa: PLC0415
    access_token = DevAdapter().issue(body.email, body.password)

    # Issue a refresh token only when a DB session is available
    raw_refresh = None
    if db is not None:
        user_data = SEEDED_USERS.get(body.email, {})
        auth_user_id = user_data.get("user_id", body.email)
        raw_refresh, _expires = await crud.create_refresh_token(db, auth_user_id)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.jwt_access_ttl_min * 60,
        refresh_token=raw_refresh,
    )


# ---------------------------------------------------------------------------
# Auth — GET /v1/me
# ---------------------------------------------------------------------------

class MeResponse(BaseModel):
    id: str
    user_id: str
    email: str
    role: str
    provider: str


@app.get("/v1/me", tags=["auth"])
async def me(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession | None = Depends(get_db_optional),
) -> MeResponse:
    """Return normalised claims for the currently authenticated user.

    ``id`` is the database UUID of the user record (needed for admin endpoints
    like role management and wallet adjust that address users by DB UUID).
    Falls back to ``claims.user_id`` (auth_id) when the user has not yet
    called /v1/auth/register, has no DB record, or DATABASE_URL is not set.
    """
    db_id = claims.user_id  # safe default — no DB or user not yet registered
    if db is not None:
        user = await crud._get_user_by_auth_id(db, claims.user_id)
        if user is not None:
            db_id = str(user.id)
    return MeResponse(
        id=db_id,
        user_id=claims.user_id,
        email=claims.email,
        role=claims.role,
        provider=claims.provider,
    )


# ---------------------------------------------------------------------------
# Auth — POST /v1/auth/register
# ---------------------------------------------------------------------------

class RegisterResponse(BaseModel):
    user_id: str
    email: str
    role: str
    provider: str
    created: bool


@app.post("/v1/auth/register", tags=["auth"])
async def register(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RegisterResponse:
    """Upsert the authenticated user in the database."""
    user, created = await crud.upsert_user(db, claims)
    return RegisterResponse(
        user_id=user.user_id,
        email=user.email,
        role=user.role,
        provider=user.provider,
        created=created,
    )


# ---------------------------------------------------------------------------
# User Profile — GET/PATCH /v1/profile  (Sprint 16)
# ---------------------------------------------------------------------------

class UserProfileResponse(BaseModel):
    user_id: str
    email: str
    role: str
    name: str | None = None
    phone: str | None = None
    created_at: str


class UserProfileUpdateRequest(BaseModel):
    name: str | None = Field(None, max_length=128, description="Display name (null = leave unchanged)")
    phone: str | None = Field(None, max_length=32, description="Phone number (null = leave unchanged)")


@app.get("/v1/profile", tags=["profile"])
async def get_profile(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserProfileResponse:
    """Return the authenticated user's profile including optional name and phone."""
    profile = await crud.get_user_profile(db, claims.user_id)
    return UserProfileResponse(**profile)


@app.patch("/v1/profile", tags=["profile"])
async def update_profile(
    body: UserProfileUpdateRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserProfileResponse:
    """Update the authenticated user's display name and/or phone number.

    Omit a field (or send null) to leave it unchanged.
    Send an empty string to clear a field.
    """
    profile = await crud.update_user_profile(db, claims.user_id, body.name, body.phone)
    return UserProfileResponse(**profile)


# ---------------------------------------------------------------------------
# Rides — POST /v1/estimate  (Sprint 5)
# ---------------------------------------------------------------------------

class EstimateRequest(BaseModel):
    origin_lat: Annotated[float, Field(ge=-90, le=90, description="Origin latitude")]
    origin_lng: Annotated[float, Field(ge=-180, le=180, description="Origin longitude")]
    dest_lat: Annotated[float, Field(ge=-90, le=90, description="Destination latitude")]
    dest_lng: Annotated[float, Field(ge=-180, le=180, description="Destination longitude")]


class CategoryFareOption(BaseModel):
    """Per-category fare info returned inside EstimateResponse."""
    fare_xof: int
    label: str        # "Économique" / "Confort" / "Premium"
    description: str  # short description
    multiplier: float


class EstimateResponse(BaseModel):
    estimate_id: str
    distance_km: float
    duration_min: int
    fare_xof: int          # economy fare (backward compat)
    currency: str = "XOF"
    surge_multiplier: float
    distance_source: str   # "google_maps" | "haversine"
    expires_at: str        # ISO-8601 UTC
    # Sprint 21: per-category fare options
    categories: dict[str, CategoryFareOption]


@app.post("/v1/estimate", tags=["rides"])
async def estimate(
    body: EstimateRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EstimateResponse:
    """Return a fare estimate for a ride from origin to destination.

    Saves the estimate in the DB so Sprint 6 can reference it by ID when
    creating a trip.  Estimates expire after ``fare_estimate_ttl_minutes``
    (default: 15 min).
    """
    from datetime import datetime  # noqa: PLC0415
    from app.pricing import get_route_info, calculate_fare  # noqa: PLC0415
    from app.models.estimate import Estimate  # noqa: PLC0415

    route = await get_route_info(
        body.origin_lat, body.origin_lng,
        body.dest_lat, body.dest_lng,
    )
    surge = await crud.get_surge_multiplier(db)  # Sprint 16: read from DB (falls back to config)
    fare = calculate_fare(route.distance_km, surge)

    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=settings.fare_estimate_ttl_minutes)

    est = Estimate(
        user_id=claims.user_id,
        origin_lat=body.origin_lat,
        origin_lng=body.origin_lng,
        dest_lat=body.dest_lat,
        dest_lng=body.dest_lng,
        distance_km=route.distance_km,
        duration_min=route.duration_min,
        fare_xof=fare,
        surge_multiplier=surge,
        distance_source=route.source,
        created_at=now,
        expires_at=expires,
    )
    db.add(est)
    await db.commit()
    await db.refresh(est)

    # Sprint 21: compute per-category fares
    category_options = {
        cat: CategoryFareOption(
            fare_xof=max(1, round(est.fare_xof * mult)),
            label=crud.CATEGORY_LABELS[cat],
            description=crud.CATEGORY_DESCRIPTIONS[cat],
            multiplier=mult,
        )
        for cat, mult in crud.CATEGORY_MULTIPLIERS.items()
    }

    return EstimateResponse(
        estimate_id=str(est.id),
        distance_km=est.distance_km,
        duration_min=est.duration_min,
        fare_xof=est.fare_xof,
        currency="XOF",
        surge_multiplier=est.surge_multiplier,
        distance_source=est.distance_source,
        expires_at=est.expires_at.isoformat(),
        categories=category_options,
    )


# ---------------------------------------------------------------------------
# Rides — Trip booking (Sprint 6)
# ---------------------------------------------------------------------------

class TripRequest(BaseModel):
    estimate_id: str
    promo_code: str | None = None  # Sprint 14: optional promo discount
    category: str = "economy"      # Sprint 21: vehicle category


class TripEventOut(BaseModel):
    event_type: str
    data: dict | None
    actor: str | None = None  # Sprint 23: "customer" | "driver" | "system"
    created_at: str


class VehicleInfo(BaseModel):
    """Embedded vehicle snapshot included in trip responses once a driver is assigned."""
    plate: str
    make: str | None = None
    model: str | None = None
    year: int | None = None
    color: str | None = None
    category: str = "economy"  # Sprint 21


class TripResponse(BaseModel):
    trip_id: str
    status: str
    fare_xof: int | None = None
    distance_km: float | None = None
    duration_min: int | None = None
    estimate_id: str | None = None
    origin_lat: float | None = None
    origin_lng: float | None = None
    dest_lat: float | None = None
    dest_lng: float | None = None
    vehicle: VehicleInfo | None = None  # populated once driver accepts — Sprint 12
    promo_code: str | None = None       # Sprint 14: applied promo code
    discount_pct: int | None = None     # Sprint 14: discount applied
    category: str = "economy"           # Sprint 21: chosen vehicle category
    paid_at: str | None = None          # Sprint 24: ISO-8601 UTC timestamp when payment confirmed
    created_at: str
    events: list[TripEventOut] | None = None


def _vehicle_info(v) -> VehicleInfo | None:
    if v is None:
        return None
    return VehicleInfo(
        plate=v.plate, make=v.make, model=v.model, year=v.year, color=v.color,
        category=getattr(v, "category", "economy"),
    )


def _trip_response(trip, events=None, vehicle=None) -> TripResponse:
    """Convert a Trip ORM object (+ optional events list + optional vehicle) to a TripResponse."""
    paid_at_raw = getattr(trip, "paid_at", None)
    return TripResponse(
        trip_id=str(trip.id),
        status=trip.status,
        fare_xof=trip.fare_xof,
        distance_km=trip.distance_km,
        duration_min=trip.duration_min,
        estimate_id=str(trip.estimate_id) if trip.estimate_id else None,
        origin_lat=trip.origin_lat,
        origin_lng=trip.origin_lng,
        dest_lat=trip.dest_lat,
        dest_lng=trip.dest_lng,
        vehicle=_vehicle_info(vehicle),
        promo_code=trip.promo_code,
        discount_pct=trip.discount_pct,
        category=getattr(trip, "category", "economy"),
        paid_at=paid_at_raw.isoformat() if paid_at_raw is not None else None,  # Sprint 24
        created_at=trip.created_at.isoformat(),
        events=[
            TripEventOut(
                event_type=e.event_type,
                data=e.data,
                actor=getattr(e, "actor", None),  # Sprint 23
                created_at=e.created_at.isoformat(),
            )
            for e in events
        ] if events is not None else None,
    )


@app.post("/v1/trips", tags=["rides"], status_code=201)
async def create_trip(
    body: TripRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TripResponse:
    """Book a trip from a previously created (non-expired) estimate.

    ``category`` selects the vehicle class (economy / comfort / premium) and
    adjusts the fare accordingly.  Defaults to economy.
    """
    trip = await crud.create_trip(
        db, claims, body.estimate_id,
        promo_code=body.promo_code,
        category=body.category,
    )
    return _trip_response(trip)


@app.get("/v1/trips", tags=["rides"])
async def list_trips(
    limit: int = 50,
    offset: int = 0,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TripResponse]:
    """List all trips for the authenticated customer, newest first (paginated)."""
    limit = min(limit, 200)
    trips = await crud.list_trips(db, claims.user_id, limit=limit, offset=offset)
    return [_trip_response(t) for t in trips]


@app.get("/v1/trips/{trip_id}", tags=["rides"])
async def get_trip(
    trip_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TripResponse:
    """Return full trip detail including the ordered event log and driver vehicle."""
    trip, events = await crud.get_trip(db, trip_id, claims.user_id)
    vehicle = await crud.get_vehicle_for_driver_uuid(db, trip.driver_id)
    return _trip_response(trip, events, vehicle=vehicle)


@app.patch("/v1/trips/{trip_id}/cancel", tags=["rides"])
async def cancel_trip(
    trip_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TripResponse:
    """Cancel a pending or accepted trip (customer action)."""
    trip = await crud.cancel_trip(db, trip_id, claims.user_id)
    return _trip_response(trip)


# ---------------------------------------------------------------------------
# Drivers — Sprint 7
# ---------------------------------------------------------------------------

class DriverResponse(BaseModel):
    driver_id: str
    user_id: str          # auth string (e.g. "usr_002")
    status: str
    license_number: str | None = None
    created: bool


class ActiveTripWrap(BaseModel):
    """Wraps the driver's active trip (or None when the driver is free)."""
    trip: TripResponse | None = None


@app.post("/v1/drivers/register", tags=["drivers"])
async def register_driver(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DriverResponse:
    """Create or return the Driver profile for the authenticated user.

    Only users with role='driver' may call this endpoint.
    Idempotent — safe to call on every login.
    """
    if claims.role != "driver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only driver accounts can register a driver profile",
        )
    driver, created = await crud.upsert_driver(db, claims)
    return DriverResponse(
        driver_id=str(driver.id),
        user_id=claims.user_id,
        status=driver.status,
        license_number=driver.license_number,
        created=created,
    )


class DriverProfileResponse(BaseModel):
    driver_id: str
    status: str
    is_online: bool
    avg_rating: float | None = None   # Sprint 15: average rating from customers
    total_ratings: int = 0            # Sprint 15: number of ratings received
    registered_at: str


@app.get("/v1/drivers/me/profile", tags=["drivers"])
async def get_driver_profile(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DriverProfileResponse:
    """Return the driver's profile including online status."""
    if claims.role != "driver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers can access this endpoint",
        )
    profile = await crud.get_driver_profile(db, claims.user_id)
    return DriverProfileResponse(**profile)


class DriverOnlineRequest(BaseModel):
    online: bool


class DriverOnlineResponse(BaseModel):
    driver_id: str
    is_online: bool


@app.put("/v1/drivers/me/online", tags=["drivers"])
async def set_driver_online(
    body: DriverOnlineRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DriverOnlineResponse:
    """Toggle the driver's online/offline presence flag."""
    if claims.role != "driver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers can update online status",
        )
    result = await crud.set_driver_online(db, claims.user_id, body.online)
    return DriverOnlineResponse(**result)


@app.get("/v1/trips/driver/available", tags=["drivers"])
async def list_available_trips(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TripResponse]:
    """List all pending trips (driver marketplace view).

    Only drivers may call this endpoint.
    """
    if claims.role != "driver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers can view available trips",
        )
    # Sprint 23: pass driver's user_id so crud can sort by proximity
    trips = await crud.list_available_trips(db, auth_user_id=claims.user_id)
    return [_trip_response(t) for t in trips]


@app.get("/v1/trips/driver/active", tags=["drivers"])
async def get_driver_active_trip(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ActiveTripWrap:
    """Return the driver's current trip (accepted or in_progress), or null."""
    if claims.role != "driver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers can access this endpoint",
        )
    trip = await crud.get_driver_active_trip(db, claims.user_id)
    if trip:
        vehicle = await crud.get_vehicle_for_driver_uuid(db, trip.driver_id)
        return ActiveTripWrap(trip=_trip_response(trip, vehicle=vehicle))
    return ActiveTripWrap(trip=None)


class DriverTripRecord(BaseModel):
    trip_id: str
    status: str
    fare_xof: int | None = None
    distance_km: float | None = None
    duration_min: int | None = None
    created_at: str
    updated_at: str


@app.get("/v1/trips/driver/history", tags=["drivers"])
async def list_driver_trip_history(
    limit: int = 20,
    offset: int = 0,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[DriverTripRecord]:
    """Return the driver's completed/cancelled trips, newest first."""
    if claims.role != "driver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers can access this endpoint",
        )
    limit = min(limit, 100)
    trips = await crud.list_driver_trip_history(db, claims.user_id, limit=limit, offset=offset)
    return [
        DriverTripRecord(
            trip_id=str(t.id),
            status=t.status,
            fare_xof=t.fare_xof,
            distance_km=t.distance_km,
            duration_min=t.duration_min,
            created_at=t.created_at.isoformat(),
            updated_at=t.updated_at.isoformat(),
        )
        for t in trips
    ]


@app.patch("/v1/trips/{trip_id}/accept", tags=["drivers"])
async def accept_trip(
    trip_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TripResponse:
    """Driver accepts a pending trip → accepted."""
    if claims.role != "driver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers can accept trips",
        )
    trip = await crud.accept_trip(db, trip_id, claims.user_id)
    return _trip_response(trip)


@app.patch("/v1/trips/{trip_id}/start", tags=["drivers"])
async def start_trip(
    trip_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TripResponse:
    """Driver starts their accepted trip → in_progress."""
    if claims.role != "driver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers can start trips",
        )
    trip = await crud.start_trip(db, trip_id, claims.user_id)
    return _trip_response(trip)


@app.patch("/v1/trips/{trip_id}/complete", tags=["drivers"])
async def complete_trip(
    trip_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TripResponse:
    """Driver completes their in_progress trip → completed."""
    if claims.role != "driver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers can complete trips",
        )
    trip = await crud.complete_trip(db, trip_id, claims.user_id)
    return _trip_response(trip)


# ---------------------------------------------------------------------------
# Driver Capabilities — Sprint 10
# ---------------------------------------------------------------------------

class CapabilitiesRequest(BaseModel):
    capabilities: list[str] = Field(
        default_factory=list,
        description="Assistance types this driver handles. Empty = handles all.",
    )


class CapabilitiesResponse(BaseModel):
    capabilities: list[str]


@app.get("/v1/drivers/me/capabilities", tags=["capabilities"])
async def get_my_capabilities(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CapabilitiesResponse:
    """Return the authenticated driver's declared capability set.

    Empty list means the driver handles all assistance types.
    """
    if claims.role != "driver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers can access this endpoint",
        )
    caps = await crud.get_driver_capabilities(db, claims.user_id)
    return CapabilitiesResponse(capabilities=caps)


@app.put("/v1/drivers/me/capabilities", tags=["capabilities"])
async def set_my_capabilities(
    body: CapabilitiesRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CapabilitiesResponse:
    """Replace the authenticated driver's capability set.

    Send an empty list to remove all filters (handle everything).
    Valid types: breakdown, flat_tyre, tow, fuel, lockout.
    """
    if claims.role != "driver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers can update capabilities",
        )
    caps = await crud.set_driver_capabilities(db, claims.user_id, body.capabilities)
    return CapabilitiesResponse(capabilities=caps)


# ---------------------------------------------------------------------------
# Ratings — Sprint 8
# ---------------------------------------------------------------------------

class RatingRequest(BaseModel):
    stars: Annotated[int, Field(ge=1, le=5, description="Rating score (1 = worst, 5 = best)")]
    comment: str | None = None


class RatingResponse(BaseModel):
    rating_id: str
    trip_id: str
    stars: int
    comment: str | None = None
    created_at: str


class DriverRatingStats(BaseModel):
    driver_id: str
    average_stars: float | None = None   # None when no ratings yet
    total_ratings: int


def _rating_response(r) -> RatingResponse:
    return RatingResponse(
        rating_id=str(r.id),
        trip_id=str(r.trip_id),
        stars=r.stars,
        comment=r.comment,
        created_at=r.created_at.isoformat(),
    )


@app.post("/v1/trips/{trip_id}/rate", tags=["ratings"], status_code=201)
async def rate_trip(
    trip_id: str,
    body: RatingRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RatingResponse:
    """Customer submits a 1–5 star rating for a completed trip.

    Only the customer who took the trip may rate it.
    Each trip can only be rated once (409 on duplicate).
    """
    r = await crud.create_rating(db, claims, trip_id, body.stars, body.comment)
    return _rating_response(r)


@app.get("/v1/trips/{trip_id}/rating", tags=["ratings"])
async def get_trip_rating(
    trip_id: str,
    claims: Claims = Depends(get_current_user),  # noqa: ARG001 — auth guard only
    db: AsyncSession = Depends(get_db),
) -> RatingResponse:
    """Return the rating for a completed trip.  404 if not yet rated."""
    r = await crud.get_trip_rating(db, trip_id)
    if r is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not rated yet")
    return _rating_response(r)


@app.get("/v1/drivers/me/rating", tags=["ratings"])
async def get_my_rating(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DriverRatingStats:
    """Return the authenticated driver's average rating and total review count."""
    if claims.role != "driver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers can access this endpoint",
        )
    avg, total = await crud.get_driver_rating_stats(db, claims.user_id)
    # Return driver_id as the auth string for simplicity (driver knows their own id)
    return DriverRatingStats(
        driver_id=claims.user_id,
        average_stars=round(avg, 2) if avg is not None else None,
        total_ratings=total,
    )


# ---------------------------------------------------------------------------
# Roadside Assistance — Sprint 9
# ---------------------------------------------------------------------------

AssistanceType = Literal["breakdown", "flat_tyre", "tow", "fuel", "lockout"]


class AssistanceCreateRequest(BaseModel):
    type: AssistanceType = Field(..., description="breakdown | flat_tyre | tow | fuel | lockout")
    lat: Annotated[float, Field(ge=-90, le=90, description="Customer latitude")]
    lng: Annotated[float, Field(ge=-180, le=180, description="Customer longitude")]
    note: str | None = Field(None, max_length=500)


class AssistanceResponse(BaseModel):
    request_id: str
    type: str
    status: str
    lat: float
    lng: float
    note: str | None = None
    eta_min: int | None = None   # set when driver accepts (Sprint 10)
    created_at: str


class ActiveAssistanceWrap(BaseModel):
    """Wraps the driver's active assistance request (or None when the driver is free)."""
    request: AssistanceResponse | None = None


def _assistance_response(req) -> AssistanceResponse:
    return AssistanceResponse(
        request_id=str(req.id),
        type=req.type,
        status=req.status,
        lat=req.lat,
        lng=req.lng,
        note=req.note,
        eta_min=req.eta_min,
        created_at=req.created_at.isoformat(),
    )


@app.post("/v1/assistance", tags=["assistance"], status_code=201)
async def create_assistance_request(
    body: AssistanceCreateRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AssistanceResponse:
    """Customer creates a roadside assistance request.

    Type must be one of: breakdown, flat_tyre, tow, fuel, lockout.
    """
    req = await crud.create_assistance_request(
        db, claims, body.type, body.lat, body.lng, body.note
    )
    return _assistance_response(req)


# IMPORTANT: literal paths (/driver/available, /driver/active) must be
# registered BEFORE the parameterised path (/{req_id}) to avoid shadowing.

@app.get("/v1/assistance/driver/available", tags=["assistance"])
async def list_available_assistance(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AssistanceResponse]:
    """List pending assistance requests filtered by the driver's declared capabilities.

    Only drivers may call this endpoint.
    If the driver has no capabilities declared, all pending requests are returned.
    """
    if claims.role != "driver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers can view available assistance requests",
        )
    requests = await crud.list_available_assistance(db, auth_user_id=claims.user_id)
    return [_assistance_response(r) for r in requests]


@app.get("/v1/assistance/driver/active", tags=["assistance"])
async def get_driver_active_assistance(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ActiveAssistanceWrap:
    """Return the driver's current assistance request (accepted or in_progress), or null."""
    if claims.role != "driver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers can access this endpoint",
        )
    req = await crud.get_driver_active_assistance(db, claims.user_id)
    return ActiveAssistanceWrap(request=_assistance_response(req) if req else None)


@app.get("/v1/assistance/{req_id}", tags=["assistance"])
async def get_assistance_request(
    req_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AssistanceResponse:
    """Return the customer's assistance request detail."""
    req = await crud.get_assistance_request(db, req_id, claims.user_id)
    return _assistance_response(req)


@app.patch("/v1/assistance/{req_id}/cancel", tags=["assistance"])
async def cancel_assistance(
    req_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AssistanceResponse:
    """Customer cancels a pending assistance request."""
    req = await crud.cancel_assistance(db, req_id, claims.user_id)
    return _assistance_response(req)


@app.patch("/v1/assistance/{req_id}/accept", tags=["assistance"])
async def accept_assistance(
    req_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AssistanceResponse:
    """Driver accepts a pending assistance request → accepted."""
    if claims.role != "driver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers can accept assistance requests",
        )
    req = await crud.accept_assistance(db, req_id, claims.user_id)
    return _assistance_response(req)


@app.patch("/v1/assistance/{req_id}/start", tags=["assistance"])
async def start_assistance(
    req_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AssistanceResponse:
    """Driver starts the intervention → in_progress."""
    if claims.role != "driver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers can start an assistance",
        )
    req = await crud.start_assistance(db, req_id, claims.user_id)
    return _assistance_response(req)


@app.patch("/v1/assistance/{req_id}/resolve", tags=["assistance"])
async def resolve_assistance(
    req_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AssistanceResponse:
    """Driver resolves the intervention → resolved."""
    if claims.role != "driver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers can resolve an assistance",
        )
    req = await crud.resolve_assistance(db, req_id, claims.user_id)
    return _assistance_response(req)


# ---------------------------------------------------------------------------
# Admin — Sprint 10
# ---------------------------------------------------------------------------

class AdminDriverRecord(BaseModel):
    driver_id: str
    user_id: str
    email: str
    status: str
    license_number: str | None = None
    capabilities: list[str]
    avg_rating: float | None = None   # Sprint 15
    total_ratings: int = 0            # Sprint 15
    created_at: str


@app.get("/v1/admin/drivers", tags=["admin"])
async def admin_list_drivers(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AdminDriverRecord]:
    """Admin: list all registered drivers with their capability sets."""
    if claims.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    rows = await crud.admin_list_drivers(db)
    return [AdminDriverRecord(**r) for r in rows]


@app.put("/v1/admin/drivers/{driver_id}/capabilities", tags=["admin"])
async def admin_set_driver_capabilities(
    driver_id: str,
    body: CapabilitiesRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CapabilitiesResponse:
    """Admin: replace the capability set for any driver.

    Valid types: breakdown, flat_tyre, tow, fuel, lockout.
    Empty list removes all filters (driver handles everything).
    """
    if claims.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    caps = await crud.admin_set_driver_capabilities(db, driver_id, body.capabilities)
    return CapabilitiesResponse(capabilities=caps)


# ---------------------------------------------------------------------------
# Driver Earnings — Sprint 11
# ---------------------------------------------------------------------------

class EarningsTripRecord(BaseModel):
    trip_id: str
    fare_xof: int | None
    distance_km: float | None
    duration_min: int | None
    completed_at: str


class DriverEarningsSummary(BaseModel):
    total_xof: int
    total_trips: int
    today_xof: int
    today_trips: int
    week_xof: int
    week_trips: int
    recent_trips: list[EarningsTripRecord]


@app.get("/v1/drivers/me/earnings", tags=["earnings"])
async def get_my_earnings(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DriverEarningsSummary:
    """Return the authenticated driver's earnings summary.

    Includes all-time totals, today (UTC), and current week (Mon–Sun),
    plus the last 10 completed trips.
    """
    if claims.role != "driver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers can access this endpoint",
        )
    data = await crud.get_driver_earnings(db, claims.user_id)
    return DriverEarningsSummary(
        total_xof=data["total_xof"],
        total_trips=data["total_trips"],
        today_xof=data["today_xof"],
        today_trips=data["today_trips"],
        week_xof=data["week_xof"],
        week_trips=data["week_trips"],
        recent_trips=[
            EarningsTripRecord(
                trip_id=str(t.id),
                fare_xof=t.fare_xof,
                distance_km=t.distance_km,
                duration_min=t.duration_min,
                completed_at=t.updated_at.isoformat(),
            )
            for t in data["recent_trips"]
        ],
    )


# ---------------------------------------------------------------------------
# Admin Statistics & Trip List — Sprint 11
# ---------------------------------------------------------------------------

class AdminStats(BaseModel):
    trips: dict
    assistance: dict
    drivers: dict
    payments: dict | None = None  # Sprint 24: payment totals


class AdminTripRecord(BaseModel):
    trip_id: str
    status: str
    fare_xof: int | None = None
    distance_km: float | None = None
    duration_min: int | None = None
    customer_email: str
    driver_id: str | None = None
    category: str = "economy"  # Sprint 21
    created_at: str
    updated_at: str


@app.get("/v1/admin/stats", tags=["admin"])
async def admin_get_stats(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AdminStats:
    """Admin: platform-wide statistics (trips, assistance, drivers, revenue)."""
    if claims.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    stats = await crud.admin_get_stats(db)
    return AdminStats(**stats)


@app.get("/v1/admin/trips", tags=["admin"])
async def admin_list_trips(
    limit: int = 50,
    offset: int = 0,
    status_filter: str | None = None,
    customer_email: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AdminTripRecord]:
    """Admin: all trips newest first, with customer email.

    Optional filters (Sprint 19):
      - status_filter: pending|accepted|in_progress|completed|cancelled
      - customer_email: partial case-insensitive match
      - date_from / date_to: ISO-8601 datetime (e.g. 2024-01-01T00:00:00)
    """
    if claims.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    limit = min(limit, 200)
    rows = await crud.admin_list_trips(
        db,
        limit=limit,
        offset=offset,
        status=status_filter,
        customer_email=customer_email,
        date_from=date_from,
        date_to=date_to,
    )
    return [AdminTripRecord(**r) for r in rows]


# ---------------------------------------------------------------------------
# Vehicle Management — Sprint 12
# ---------------------------------------------------------------------------

class VehicleRequest(BaseModel):
    plate: Annotated[str, Field(min_length=2, max_length=32, description="License plate")]
    make: str | None = Field(None, max_length=64, description="Manufacturer (e.g. Toyota)")
    model: str | None = Field(None, max_length=64, description="Model (e.g. Corolla)")
    year: Annotated[int | None, Field(None, ge=1980, le=2100)] = None
    color: str | None = Field(None, max_length=32, description="Color (e.g. Blanc)")
    category: str = "economy"  # Sprint 21: economy | comfort | premium


class VehicleResponse(BaseModel):
    vehicle_id: str
    plate: str
    make: str | None = None
    model: str | None = None
    year: int | None = None
    color: str | None = None
    status: str
    category: str = "economy"  # Sprint 21
    created: bool


def _vehicle_response(v, created: bool = False) -> VehicleResponse:
    return VehicleResponse(
        vehicle_id=str(v.id),
        plate=v.plate,
        make=v.make,
        model=v.model,
        year=v.year,
        color=v.color,
        status=v.status,
        category=getattr(v, "category", "economy"),
        created=created,
    )


# NOTE: literal paths before parameterised paths — /me/vehicle before /{trip_id}/...
# Driver capability endpoints already registered; vehicle endpoints added here.

@app.post("/v1/drivers/me/vehicle", tags=["vehicles"], status_code=201)
async def register_vehicle(
    body: VehicleRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VehicleResponse:
    """Driver registers or updates their active vehicle.

    Idempotent: updates the existing vehicle if one is already registered.
    Returns 409 if the plate belongs to another driver.
    """
    if claims.role != "driver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers can register a vehicle",
        )
    vehicle, created = await crud.upsert_vehicle(
        db, claims.user_id,
        plate=body.plate,
        make=body.make,
        model_name=body.model,
        year=body.year,
        color=body.color,
        category=body.category,
    )
    return _vehicle_response(vehicle, created=created)


@app.get("/v1/drivers/me/vehicle", tags=["vehicles"])
async def get_my_vehicle(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VehicleResponse:
    """Return the authenticated driver's current active vehicle.  404 if none registered."""
    if claims.role != "driver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers can access this endpoint",
        )
    vehicle = await crud.get_driver_vehicle(db, claims.user_id)
    if vehicle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No vehicle registered — call POST /v1/drivers/me/vehicle",
        )
    return _vehicle_response(vehicle)


# ---------------------------------------------------------------------------
# Customer Assistance History — Sprint 12
# ---------------------------------------------------------------------------

@app.get("/v1/assistance", tags=["assistance"])
async def list_my_assistance(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AssistanceResponse]:
    """Customer: list all their assistance requests, newest first."""
    requests = await crud.list_customer_assistance(db, claims.user_id)
    return [_assistance_response(r) for r in requests]


# ---------------------------------------------------------------------------
# Admin — User List — Sprint 12
# ---------------------------------------------------------------------------

class AdminUserRecord(BaseModel):
    user_id: str
    email: str
    role: str
    provider: str
    created_at: str


@app.get("/v1/admin/users", tags=["admin"])
async def admin_list_users(
    role: str | None = None,
    email: str | None = None,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AdminUserRecord]:
    """Admin: list all registered users (newest first).

    Optional filters (Sprint 19):
      - role: admin|driver|customer
      - email: partial case-insensitive match
    """
    if claims.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    users = await crud.admin_list_users(db, role=role, email=email)
    return [AdminUserRecord(**u) for u in users]


# ---------------------------------------------------------------------------
# Admin — Assistance List — Sprint 13
# ---------------------------------------------------------------------------

class AdminAssistanceRecord(BaseModel):
    request_id: str
    type: str
    status: str
    lat: float
    lng: float
    note: str | None = None
    eta_min: int | None = None
    customer_email: str
    driver_id: str | None = None
    created_at: str
    updated_at: str


@app.get("/v1/admin/assistance", tags=["admin"])
async def admin_list_assistance(
    limit: int = 50,
    offset: int = 0,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AdminAssistanceRecord]:
    """Admin: list all assistance requests (newest first, paginated)."""
    if claims.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    limit = min(limit, 200)
    rows = await crud.admin_list_assistance(db, limit=limit, offset=offset)
    return [AdminAssistanceRecord(**r) for r in rows]


# ---------------------------------------------------------------------------
# Promo codes — Sprint 14
# ---------------------------------------------------------------------------

class PromoRequest(BaseModel):
    code: str = Field(..., min_length=2, max_length=32)
    discount_pct: int = Field(..., ge=1, le=100)
    max_uses: int | None = Field(None, ge=1)
    expires_at: str | None = None  # ISO8601 datetime string, optional


class PromoResponse(BaseModel):
    promo_id: str
    code: str
    discount_pct: int
    max_uses: int | None = None
    uses: int
    active: bool
    expires_at: str | None = None
    created_at: str


def _promo_response(p) -> PromoResponse:
    return PromoResponse(
        promo_id=str(p.id),
        code=p.code,
        discount_pct=p.discount_pct,
        max_uses=p.max_uses,
        uses=p.uses,
        active=p.active,
        expires_at=p.expires_at.isoformat() if p.expires_at else None,
        created_at=p.created_at.isoformat(),
    )


class PromoValidateRequest(BaseModel):
    code: str


class PromoValidateResponse(BaseModel):
    valid: bool
    code: str
    discount_pct: int


@app.post("/v1/admin/promos", tags=["promos"], status_code=201)
async def admin_create_promo(
    body: PromoRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PromoResponse:
    """Admin: create a promotional discount code."""
    if claims.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    from datetime import datetime as _dt
    expires_at = None
    if body.expires_at:
        try:
            expires_at = _dt.fromisoformat(body.expires_at.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="expires_at must be a valid ISO8601 datetime string",
            )
    promo = await crud.create_promo(
        db, body.code, body.discount_pct, body.max_uses, expires_at
    )
    return _promo_response(promo)


@app.get("/v1/admin/promos", tags=["promos"])
async def admin_list_promos(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PromoResponse]:
    """Admin: list all promotional codes."""
    if claims.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    promos = await crud.list_promos(db)
    return [_promo_response(p) for p in promos]


@app.delete("/v1/admin/promos/{code}", tags=["promos"])
async def admin_deactivate_promo(
    code: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PromoResponse:
    """Admin: deactivate a promo code (sets active=False, preserves history)."""
    if claims.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    promo = await crud.deactivate_promo(db, code)
    return _promo_response(promo)


@app.post("/v1/promos/validate", tags=["promos"])
async def validate_promo(
    body: PromoValidateRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PromoValidateResponse:
    """Customer: check whether a promo code is valid before booking."""
    result = await crud.validate_promo(db, body.code)
    return PromoValidateResponse(**result)


# ---------------------------------------------------------------------------
# Admin driver status management — Sprint 14
# ---------------------------------------------------------------------------

class DriverStatusRequest(BaseModel):
    status: Literal["active", "inactive", "suspended"]


class DriverStatusResponse(BaseModel):
    driver_id: str
    status: str


@app.patch("/v1/admin/drivers/{driver_id}/status", tags=["admin"])
async def admin_set_driver_status(
    driver_id: str,
    body: DriverStatusRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DriverStatusResponse:
    """Admin: set a driver's status (active | inactive | suspended)."""
    if claims.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    result = await crud.admin_set_driver_status(db, driver_id, body.status)
    return DriverStatusResponse(**result)


# ---------------------------------------------------------------------------
# Driver Payout Requests — Sprint 15
# ---------------------------------------------------------------------------

class PayoutCreateRequest(BaseModel):
    amount_xof: Annotated[int, Field(ge=1, description="Amount in XOF to withdraw")]


class PayoutResponse(BaseModel):
    payout_id: str
    driver_id: str
    amount_xof: int
    status: str
    note_admin: str | None = None
    created_at: str
    updated_at: str


def _payout_response(req) -> PayoutResponse:
    return PayoutResponse(
        payout_id=str(req.id),
        driver_id=str(req.driver_id),
        amount_xof=req.amount_xof,
        status=req.status,
        note_admin=req.note_admin,
        created_at=req.created_at.isoformat(),
        updated_at=req.updated_at.isoformat(),
    )


@app.post("/v1/drivers/me/payout-requests", tags=["payouts"], status_code=201)
async def create_payout_request(
    body: PayoutCreateRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PayoutResponse:
    """Driver requests a payout of their accumulated earnings.

    Amount must be at least 1 XOF.  Admin will review and approve or reject.
    """
    if claims.role != "driver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers can create payout requests",
        )
    req = await crud.create_payout_request(db, claims.user_id, body.amount_xof)
    return _payout_response(req)


@app.get("/v1/drivers/me/payout-requests", tags=["payouts"])
async def list_payout_requests(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PayoutResponse]:
    """Driver: list all their payout requests, newest first."""
    if claims.role != "driver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers can view payout requests",
        )
    reqs = await crud.list_driver_payout_requests(db, claims.user_id)
    return [_payout_response(r) for r in reqs]


class AdminPayoutRecord(BaseModel):
    payout_id: str
    driver_id: str
    driver_email: str
    amount_xof: int
    status: str
    note_admin: str | None = None
    created_at: str
    updated_at: str


class AdminPayoutStatusRequest(BaseModel):
    status: Literal["approved", "rejected"]
    note_admin: str | None = None


@app.get("/v1/admin/payout-requests", tags=["payouts"])
async def admin_list_payout_requests(
    limit: int = 50,
    offset: int = 0,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AdminPayoutRecord]:
    """Admin: list all payout requests (newest first, paginated)."""
    if claims.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    limit = min(limit, 200)
    rows = await crud.admin_list_payout_requests(db, limit=limit, offset=offset)
    return [AdminPayoutRecord(**r) for r in rows]


@app.patch("/v1/admin/payout-requests/{payout_id}/status", tags=["payouts"])
async def admin_update_payout_status(
    payout_id: str,
    body: AdminPayoutStatusRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PayoutResponse:
    """Admin: approve or reject a driver payout request.

    Optionally attach a note (e.g. reason for rejection).
    """
    if claims.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    result = await crud.admin_update_payout_status(
        db, payout_id, body.status, body.note_admin
    )
    return PayoutResponse(**result)


# ---------------------------------------------------------------------------
# Admin Ratings View — Sprint 15
# ---------------------------------------------------------------------------

class AdminRatingRecord(BaseModel):
    rating_id: str
    trip_id: str
    driver_id: str
    customer_email: str
    stars: int
    comment: str | None = None
    created_at: str


@app.get("/v1/admin/ratings", tags=["admin"])
async def admin_list_ratings(
    limit: int = 50,
    offset: int = 0,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AdminRatingRecord]:
    """Admin: list all customer ratings (newest first, paginated)."""
    if claims.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    limit = min(limit, 200)
    rows = await crud.admin_list_ratings(db, limit=limit, offset=offset)
    return [AdminRatingRecord(**r) for r in rows]


# ---------------------------------------------------------------------------
# Admin Surge Pricing — Sprint 16
# ---------------------------------------------------------------------------

class SurgeResponse(BaseModel):
    surge_multiplier: float


class SurgeUpdateRequest(BaseModel):
    surge_multiplier: Annotated[
        float,
        Field(ge=1.0, le=5.0, description="Surge multiplier (1.0 = normal, max 5.0)"),
    ]


@app.get("/v1/admin/settings/surge", tags=["admin"])
async def admin_get_surge(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SurgeResponse:
    """Admin: return the current fare surge multiplier."""
    if claims.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    value = await crud.get_surge_multiplier(db)
    return SurgeResponse(surge_multiplier=value)


@app.patch("/v1/admin/settings/surge", tags=["admin"])
async def admin_set_surge(
    body: SurgeUpdateRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SurgeResponse:
    """Admin: set the fare surge multiplier (1.0 = normal pricing, max 5.0).

    The new value takes effect immediately on subsequent calls to POST /v1/estimate.
    """
    if claims.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    value = await crud.set_surge_multiplier(db, body.surge_multiplier)
    return SurgeResponse(surge_multiplier=value)


# ---------------------------------------------------------------------------
# Driver Documents (KYC) — Sprint 17
# ---------------------------------------------------------------------------

DocumentType = Literal["license", "insurance", "registration", "id_card"]


class DocumentSubmitRequest(BaseModel):
    type: DocumentType = Field(
        ..., description="license | insurance | registration | id_card"
    )
    url: str = Field(..., min_length=1, max_length=2048, description="URL of the document scan")


class DocumentResponse(BaseModel):
    document_id: str
    driver_id: str
    type: str
    url: str
    status: str
    note_admin: str | None = None
    created_at: str
    updated_at: str


class AdminDocumentRecord(BaseModel):
    document_id: str
    driver_id: str
    driver_email: str
    type: str
    url: str
    status: str
    note_admin: str | None = None
    created_at: str
    updated_at: str


class AdminDocumentStatusRequest(BaseModel):
    status: Literal["approved", "rejected"]
    note_admin: str | None = None


class AdminPendingCounts(BaseModel):
    payout_requests: int
    documents: int


def _document_response(doc) -> DocumentResponse:
    return DocumentResponse(
        document_id=str(doc.id),
        driver_id=str(doc.driver_id),
        type=doc.type,
        url=doc.url,
        status=doc.status,
        note_admin=doc.note_admin,
        created_at=doc.created_at.isoformat(),
        updated_at=doc.updated_at.isoformat(),
    )


@app.post("/v1/drivers/me/documents", tags=["documents"], status_code=201)
async def submit_document(
    body: DocumentSubmitRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentResponse:
    """Driver submits a KYC document for admin review.

    Type must be one of: license, insurance, registration, id_card.
    Multiple submissions of the same type are allowed (e.g. resubmit after rejection).
    """
    if claims.role != "driver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers can submit documents",
        )
    doc = await crud.submit_driver_document(db, claims.user_id, body.type, body.url)
    return _document_response(doc)


@app.get("/v1/drivers/me/documents", tags=["documents"])
async def list_my_documents(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[DocumentResponse]:
    """Driver: list all submitted KYC documents, newest first."""
    if claims.role != "driver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers can view their documents",
        )
    docs = await crud.list_driver_documents(db, claims.user_id)
    return [_document_response(d) for d in docs]


@app.get("/v1/admin/documents", tags=["admin"])
async def admin_list_documents(
    limit: int = 50,
    offset: int = 0,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AdminDocumentRecord]:
    """Admin: list all KYC documents (newest first, paginated)."""
    if claims.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    limit = min(limit, 200)
    rows = await crud.admin_list_documents(db, limit=limit, offset=offset)
    return [AdminDocumentRecord(**r) for r in rows]


@app.patch("/v1/admin/documents/{document_id}/status", tags=["admin"])
async def admin_update_document_status(
    document_id: str,
    body: AdminDocumentStatusRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentResponse:
    """Admin: approve or reject a driver KYC document.

    Optionally attach a note explaining the decision.
    """
    if claims.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    result = await crud.admin_update_document_status(
        db, document_id, body.status, body.note_admin
    )
    return DocumentResponse(**result)


@app.get("/v1/admin/pending-counts", tags=["admin"])
async def admin_pending_counts(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AdminPendingCounts:
    """Admin: return counts of items awaiting action (payouts + KYC documents)."""
    if claims.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    counts = await crud.admin_get_pending_counts(db)
    return AdminPendingCounts(**counts)


# ---------------------------------------------------------------------------
# Notifications — Sprint 18
# ---------------------------------------------------------------------------

class NotificationRecord(BaseModel):
    notification_id: str
    type: str
    title: str
    body: str
    read: bool
    created_at: str
    channel: str = "in_app"   # Sprint 26


class UnreadCountResponse(BaseModel):
    count: int


class MarkReadResponse(BaseModel):
    marked: int


@app.get("/v1/notifications/unread-count", tags=["notifications"])
async def notifications_unread_count(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UnreadCountResponse:
    """Return the number of unread notifications for the authenticated user.

    Declared BEFORE /v1/notifications so the literal path wins over query params.
    """
    count = await crud.get_unread_count(db, claims.user_id)
    return UnreadCountResponse(count=count)


@app.get("/v1/notifications", tags=["notifications"])
async def list_notifications(
    limit: int = 20,
    offset: int = 0,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[NotificationRecord]:
    """List notifications for the authenticated user, newest first."""
    notifs = await crud.list_notifications(db, claims.user_id, limit, offset)
    return [
        NotificationRecord(
            notification_id=str(n.id),
            type=n.type,
            title=n.title,
            body=n.body,
            read=n.read,
            created_at=n.created_at.isoformat(),
            channel=getattr(n, "channel", "in_app"),  # Sprint 26
        )
        for n in notifs
    ]


@app.patch("/v1/notifications/read-all", tags=["notifications"])
async def mark_all_notifications_read(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MarkReadResponse:
    """Mark all of the authenticated user's unread notifications as read."""
    marked = await crud.mark_all_notifications_read(db, claims.user_id)
    return MarkReadResponse(marked=marked)


# ---------------------------------------------------------------------------
# Saved places — Sprint 20
# ---------------------------------------------------------------------------

class SavedPlaceResponse(BaseModel):
    place_id: str
    label: str          # "home" | "work" | "other"
    name: str           # human-readable address
    lat: float
    lng: float
    created_at: str


class CreateSavedPlaceRequest(BaseModel):
    label: str = "other"
    name: str
    lat: float
    lng: float


class UpdateSavedPlaceRequest(BaseModel):
    label: str | None = None
    name: str | None = None
    lat: float | None = None
    lng: float | None = None


def _place_to_response(p) -> SavedPlaceResponse:
    return SavedPlaceResponse(
        place_id=str(p.id),
        label=p.label,
        name=p.name,
        lat=p.lat,
        lng=p.lng,
        created_at=p.created_at.isoformat(),
    )


@app.get("/v1/places", tags=["places"])
async def list_places(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[SavedPlaceResponse]:
    """List the authenticated user's saved places (oldest first, max 10)."""
    places = await crud.list_saved_places(db, claims.user_id)
    return [_place_to_response(p) for p in places]


@app.post("/v1/places", tags=["places"], status_code=201)
async def create_place(
    body: CreateSavedPlaceRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SavedPlaceResponse:
    """Create a saved place for the authenticated user.

    Returns 422 if the label is invalid or the user already has 10 saved places.
    """
    place = await crud.create_saved_place(
        db, claims.user_id, body.label, body.name, body.lat, body.lng
    )
    return _place_to_response(place)


@app.patch("/v1/places/{place_id}", tags=["places"])
async def update_place(
    place_id: str,
    body: UpdateSavedPlaceRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SavedPlaceResponse:
    """Update one or more fields of a saved place.

    Only the owner can update their own places.  Returns 404 if not found.
    """
    place = await crud.update_saved_place(
        db, claims.user_id, place_id,
        label=body.label, name=body.name, lat=body.lat, lng=body.lng,
    )
    return _place_to_response(place)


@app.delete("/v1/places/{place_id}", tags=["places"], status_code=204,
            response_model=None)
async def delete_place(
    place_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a saved place.  Only the owner can delete their own places."""
    from fastapi.responses import Response as _Response  # noqa: PLC0415
    await crud.delete_saved_place(db, claims.user_id, place_id)
    return _Response(status_code=204)


# ---------------------------------------------------------------------------
# Vehicle categories — Sprint 21
# ---------------------------------------------------------------------------

class CategoryInfo(BaseModel):
    category: str
    label: str
    description: str
    multiplier: float


@app.get("/v1/categories", tags=["rides"])
async def list_categories(
    _: Claims = Depends(get_current_user),
) -> list[CategoryInfo]:
    """Return the list of available vehicle categories with their fare multipliers.

    Useful for clients that want to display options before requesting an estimate.
    """
    return [
        CategoryInfo(
            category=cat,
            label=crud.CATEGORY_LABELS[cat],
            description=crud.CATEGORY_DESCRIPTIONS[cat],
            multiplier=crud.CATEGORY_MULTIPLIERS[cat],
        )
        for cat in ("economy", "comfort", "premium")
    ]


# ---------------------------------------------------------------------------
# Driver location & ETA — Sprint 22
# ---------------------------------------------------------------------------

class LocationRequest(BaseModel):
    lat: float
    lng: float


class LocationResponse(BaseModel):
    driver_id: str
    lat: float
    lng: float
    updated_at: str


class EtaResponse(BaseModel):
    distance_km: float
    eta_min: int
    driver_lat: float
    driver_lng: float
    updated_at: str


class TrackingResponse(BaseModel):
    """Sprint 23 — live driver position for customer tracking."""

    trip_id: str
    status: str
    driver_lat: float
    driver_lng: float
    eta_min: int | None = None
    updated_at: str | None = None


def _location_response(loc) -> LocationResponse:
    return LocationResponse(
        driver_id=str(loc.driver_id),
        lat=loc.lat,
        lng=loc.lng,
        updated_at=loc.updated_at.isoformat(),
    )


@app.put("/v1/drivers/me/location", tags=["drivers"])
async def update_driver_location(
    body: LocationRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LocationResponse:
    """Driver pushes their current GPS position.

    Creates the location record on first call; updates it on subsequent calls.
    Requires driver role.
    """
    if claims.role != "driver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers can update their location",
        )
    loc = await crud.upsert_driver_location(db, claims, body.lat, body.lng)
    return _location_response(loc)


@app.get("/v1/drivers/me/location", tags=["drivers"])
async def get_my_location(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LocationResponse:
    """Driver retrieves their last recorded GPS position (404 if not set yet).

    Requires driver role.
    """
    if claims.role != "driver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers can read their location",
        )
    loc = await crud.get_driver_location(db, claims)
    return _location_response(loc)


@app.get("/v1/trips/{trip_id}/eta", tags=["rides"])
async def get_trip_eta(
    trip_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EtaResponse:
    """Customer gets the driver's distance and ETA for their active trip.

    Only the trip's customer can call this.
    Trip must be in 'accepted' or 'in_progress' status and the driver must have
    pushed at least one location update.

    ETA is computed using Haversine distance ÷ 30 km/h average city speed.
    """
    if claims.role != "customer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only customers can query trip ETA",
        )
    data = await crud.get_trip_eta(db, claims, trip_id)
    return EtaResponse(**data)


@app.get("/v1/trips/{trip_id}/tracking", tags=["rides"])
async def get_trip_tracking(
    trip_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TrackingResponse:
    """Sprint 23 — Customer polls driver's live GPS position during a trip.

    Returns the driver's latest latitude / longitude together with a fresh ETA.
    Returns 404 when the driver has not yet pushed any location update (client
    should retry on the next polling tick).

    Only the customer who owns the trip may call this endpoint.
    Trip must be in 'accepted' or 'in_progress' status.
    """
    if claims.role != "customer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only customers can track a trip",
        )
    data = await crud.get_trip_tracking(db, claims, trip_id)
    return TrackingResponse(**data)


# ---------------------------------------------------------------------------
# Payment — Sprint 24
# ---------------------------------------------------------------------------

class PaymentIntentRequest(BaseModel):
    trip_id: str


class PaymentIntentResponse(BaseModel):
    intent_id: str
    trip_id: str
    amount_xof: int
    currency: str = "XOF"
    provider: str
    provider_ref: str | None = None
    status: str   # pending | paid | failed | refunded
    checkout_url: str | None = None
    created_at: str
    updated_at: str


class WebhookResponse(BaseModel):
    received: bool = True
    intent_id: str
    status: str


@app.post("/v1/payments/intent", tags=["payments"], status_code=201)
async def create_payment_intent(
    body: PaymentIntentRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PaymentIntentResponse:
    """Sprint 24 — Customer initiates payment for a completed trip.

    Creates (or returns an existing) PaymentIntent linked to the trip.
    The response contains a ``checkout_url`` the customer should visit to
    complete the payment via the configured provider (CinetPay / Stripe / mock).

    Rules:
    - Trip must be in ``completed`` status (422 otherwise).
    - Only the trip's customer can call this endpoint (403 otherwise).
    - Idempotent: calling twice returns the same intent.
    """
    if claims.role != "customer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only customers can initiate payment",
        )
    from app.payment import get_adapter  # noqa: PLC0415
    adapter = get_adapter()
    intent_data = await crud.create_payment_intent(
        db, claims, body.trip_id, adapter,
        return_url=settings.payment_return_url,
    )
    return PaymentIntentResponse(**intent_data)


@app.get("/v1/payments/{intent_id}", tags=["payments"])
async def get_payment_intent(
    intent_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PaymentIntentResponse:
    """Sprint 24 — Return a payment intent by ID.

    Only the customer who owns the linked trip can read their intent.
    """
    intent_data = await crud.get_payment_intent(db, claims, intent_id)
    return PaymentIntentResponse(**intent_data)


@app.post("/v1/payments/webhook", tags=["payments"])
async def payment_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> WebhookResponse:
    """Sprint 24 — Inbound webhook from the payment provider.

    Called by CinetPay / Stripe after a payment event.  No authentication
    header — the provider signs the payload instead (signature is verified
    inside the adapter).

    On success:
    - Intent status transitions to ``paid`` or ``failed``.
    - When ``paid``: ``trips.paid_at`` is set to the current timestamp.

    Returns 400 if the signature is invalid or the payload is malformed.
    """
    from app.payment import get_adapter  # noqa: PLC0415
    adapter = get_adapter()
    payload = await request.body()
    headers = dict(request.headers)
    try:
        intent_data = await crud.confirm_payment(db, payload, headers, adapter)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )
    return WebhookResponse(
        received=True,
        intent_id=intent_data["intent_id"],
        status=intent_data["status"],
    )


@app.get("/v1/trips/{trip_id}/payment", tags=["payments"])
async def get_trip_payment(
    trip_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PaymentIntentResponse:
    """Sprint 24 — Shortcut: payment status for a trip.

    Returns the PaymentIntent linked to the trip, or 404 when no payment
    has been initiated yet.  Only the trip's customer can call this.
    """
    intent_data = await crud.get_trip_payment(db, claims, trip_id)
    if intent_data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No payment intent found for this trip",
        )
    return PaymentIntentResponse(**intent_data)


# ---------------------------------------------------------------------------
# Auth — Refresh & Logout (Sprint 25)
# ---------------------------------------------------------------------------

class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


@app.post("/v1/auth/refresh", tags=["auth"])
async def refresh_token(
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Sprint 25 — Exchange a valid refresh token for a new token pair.

    Token rotation: the supplied refresh token is revoked and a brand-new
    refresh token is issued alongside a fresh access token (15-min TTL).

    Returns 401 if the refresh token is invalid, expired, or already revoked.
    """
    from app.auth.dev_adapter import DevAdapter  # noqa: PLC0415

    rotation = await crud.use_refresh_token(db, body.refresh_token)
    auth_user_id = rotation["auth_user_id"]

    # Issue a new access token for the same user
    new_access = DevAdapter().issue_for_user_id(auth_user_id)

    return TokenResponse(
        access_token=new_access,
        token_type="bearer",
        expires_in=settings.jwt_access_ttl_min * 60,
        refresh_token=rotation["new_refresh_token"],
    )


@app.post("/v1/auth/logout", tags=["auth"], status_code=204, response_model=None)
async def logout(
    body: LogoutRequest,
    db: AsyncSession = Depends(get_db),
):
    """Sprint 25 — Revoke the active refresh token (logout).

    Returns 204 No Content on success.
    Returns 404 if the refresh token is not found.
    """
    from fastapi.responses import Response as _Response  # noqa: PLC0415
    found = await crud.revoke_refresh_token(db, body.refresh_token)
    if not found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Refresh token not found",
        )
    return _Response(status_code=204)


# ---------------------------------------------------------------------------
# Driver document upload URL (Sprint 25 — Cloud Storage signed URL)
# ---------------------------------------------------------------------------

class UploadUrlResponse(BaseModel):
    upload_url: str  # PUT this URL to upload the file directly to GCS
    final_url: str   # Public URL of the file after upload


class UploadUrlRequest(BaseModel):
    filename: str    # e.g. "license.pdf"
    content_type: str = "application/octet-stream"


@app.post(
    "/v1/drivers/me/documents/upload-url",
    tags=["drivers"],
    status_code=200,
)
async def get_document_upload_url(
    body: UploadUrlRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UploadUrlResponse:
    """Sprint 25 — Return a pre-signed GCS URL for direct document upload.

    The client uploads the file by making a PUT request to ``upload_url``
    (no auth header required — the signature embeds the permissions).

    After upload the file is accessible at ``final_url``.

    In dev / CI (``gcs_bucket_name`` not set) a mock URL is returned.
    """
    if claims.role != "driver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers can request upload URLs",
        )

    # Resolve driver profile
    driver_data = await crud.get_driver_profile(db, claims.user_id)
    driver_id = driver_data["driver_id"]

    import uuid as _uuid  # noqa: PLC0415
    file_key = f"driver-docs/{driver_id}/{_uuid.uuid4()}/{body.filename}"

    if settings.gcs_bucket_name:
        # Production: generate a real GCS signed URL
        try:
            from google.cloud import storage as _gcs  # noqa: PLC0415
            from datetime import timedelta as _td  # noqa: PLC0415
            gcs_client = _gcs.Client()
            bucket = gcs_client.bucket(settings.gcs_bucket_name)
            blob = bucket.blob(file_key)
            upload_url = blob.generate_signed_url(
                expiration=_td(minutes=15),
                method="PUT",
                content_type=body.content_type,
                version="v4",
            )
            final_url = f"https://storage.googleapis.com/{settings.gcs_bucket_name}/{file_key}"
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Cloud Storage unavailable: {exc}",
            )
    else:
        # Dev / CI: return mock URLs
        upload_url = f"http://localhost/mock-gcs-upload/{file_key}"
        final_url = f"http://localhost/mock-gcs/{file_key}"

    return UploadUrlResponse(upload_url=upload_url, final_url=final_url)


# ---------------------------------------------------------------------------
# Device tokens — Sprint 26
# ---------------------------------------------------------------------------

class DeviceRegisterRequest(BaseModel):
    token: str
    platform: str = "web"   # "web" | "ios" | "android"


class DeviceRegisterResponse(BaseModel):
    token: str
    platform: str
    user_id: str


@app.post(
    "/v1/devices/register",
    tags=["notifications"],
    status_code=200,
)
async def register_device(
    body: DeviceRegisterRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DeviceRegisterResponse:
    """Sprint 26 — Register a FCM / web-push device token.

    Idempotent: re-registering the same token is a no-op.
    The token is tied to the authenticated user and used by the notification
    dispatcher to deliver push messages.
    """
    result = await crud.register_device_token(db, claims, body.token, body.platform)
    return DeviceRegisterResponse(**result)


@app.delete(
    "/v1/devices/{token}",
    tags=["notifications"],
    status_code=204,
    response_model=None,
)
async def deregister_device(
    token: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Sprint 26 — Remove a device token (called on logout / account switch).

    Returns 204 on success.
    Returns 404 if the token does not belong to the authenticated user.
    """
    from fastapi.responses import Response as _Response  # noqa: PLC0415
    found = await crud.deregister_device_token(db, claims, token)
    if not found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device token not found",
        )
    return _Response(status_code=204)


# ---------------------------------------------------------------------------
# Commission & Payout Batch — Sprint 29
# ---------------------------------------------------------------------------

class CommissionSettingResponse(BaseModel):
    category: str
    rate_pct: int
    effective_from: str


class SetCommissionRequest(BaseModel):
    category: str = Field(
        ...,
        description="economy | comfort | premium | assistance | default",
    )
    rate_pct: Annotated[
        int,
        Field(ge=0, le=100, description="Commission rate in percent (0–100)"),
    ]


class DriverBalanceResponse(BaseModel):
    driver_id: str
    gains_bruts_xof: int
    commission_xof: int
    retraits_xof: int
    solde_net_xof: int


class PayoutBatchResponse(BaseModel):
    processed: int
    failed: int
    total_net_xof: int
    total_commission_xof: int


@app.get("/v1/drivers/me/balance", tags=["payouts"])
async def get_driver_balance(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DriverBalanceResponse:
    """Sprint 29 — Return the driver's net available balance.

    Breakdown:
    - ``gains_bruts_xof``: total gross earnings from completed trips
    - ``commission_xof``: platform fee (configurable per category)
    - ``retraits_xof``: total already paid out (processed payout requests)
    - ``solde_net_xof``: available balance = gains - commission - retraits
    """
    if claims.role != "driver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers can access their balance",
        )
    data = await crud.get_driver_balance(db, claims.user_id)
    return DriverBalanceResponse(**data)


@app.get("/v1/admin/commission", tags=["admin"])
async def admin_get_commission(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CommissionSettingResponse]:
    """Sprint 29 — Admin: list all platform commission rates per category."""
    if claims.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    rows = await crud.get_commission_settings(db)
    return [CommissionSettingResponse(**r) for r in rows]


@app.post("/v1/admin/commission", tags=["admin"], status_code=200)
async def admin_set_commission(
    body: SetCommissionRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CommissionSettingResponse:
    """Sprint 29 — Admin: create or update a commission rate for a category.

    Valid categories: economy, comfort, premium, assistance, default.
    The new rate takes effect immediately on subsequent balance calculations.
    """
    if claims.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    result = await crud.set_commission(db, body.category, body.rate_pct, claims.user_id)
    return CommissionSettingResponse(**result)


@app.post("/v1/admin/payouts/run", tags=["payouts"], status_code=200)
async def admin_run_payout_batch(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PayoutBatchResponse:
    """Sprint 29 — Admin: run the batch payout for all approved requests.

    For every ``payout_request`` with status ``approved``:
    1. Deducts platform commission.
    2. Calls the configured ``PayoutAdapter`` to initiate the transfer.
    3. On success → status ``processed``, ``provider_ref`` + ``processed_at`` set.
    4. On provider error → status ``failed`` (batch continues, no rollback).

    Returns a summary: number of requests processed / failed + total amounts.
    """
    if claims.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    result = await crud.run_payout_batch(db)
    return PayoutBatchResponse(**result)


# ===========================================================================
# Sprint 30 — Driver Application Workflow
# ===========================================================================

class ApplicationRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=128)
    phone: str = Field(..., min_length=8, max_length=32)
    license_number: str = Field(..., min_length=3, max_length=64)
    vehicle_make: str = Field(..., min_length=1, max_length=64)
    vehicle_model: str = Field(..., min_length=1, max_length=64)
    vehicle_plate: str = Field(..., min_length=2, max_length=32)
    vehicle_year: int = Field(..., ge=1990, le=2030)
    vehicle_category: str = Field(default="economy")


class ReviewApplicationRequest(BaseModel):
    status: str  # "approved" | "rejected" | "under_review"
    notes_admin: str | None = None


class ApplicationResponse(BaseModel):
    application_id: str
    user_id: str
    status: str
    full_name: str
    phone: str
    license_number: str
    vehicle_make: str
    vehicle_model: str
    vehicle_plate: str
    vehicle_year: int
    vehicle_category: str
    notes_admin: str | None
    reviewed_at: str | None
    submitted_at: str


@app.post("/v1/drivers/apply", response_model=ApplicationResponse, status_code=status.HTTP_201_CREATED,
          summary="Submit a driver application (Sprint 30)")
async def submit_driver_application(
    body: ApplicationRequest,
    claims: Annotated[Claims, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Any authenticated user can submit one driver application.

    Returns 409 if they already have an application.
    """
    result = await crud.create_application(db, claims.user_id, body.model_dump())
    return ApplicationResponse(**result)


@app.get("/v1/drivers/apply/status", response_model=ApplicationResponse | None,
         summary="Read own application status (Sprint 30)")
async def get_my_application_status(
    claims: Annotated[Claims, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Return the authenticated user's application, or null if none."""
    result = await crud.get_my_application(db, claims.user_id)
    if result is None:
        return None
    return ApplicationResponse(**result)


@app.get("/v1/admin/applications", response_model=list[ApplicationResponse],
         summary="Admin: list all driver applications (Sprint 30)")
async def admin_list_applications(
    status_filter: str | None = None,
    limit: int = 50,
    offset: int = 0,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only. Filterable by status: submitted | under_review | approved | rejected."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    rows = await crud.admin_list_applications(db, status_filter=status_filter, limit=limit, offset=offset)
    return [ApplicationResponse(**r) for r in rows]


@app.get("/v1/admin/applications/{application_id}", response_model=ApplicationResponse,
         summary="Admin: get a single application (Sprint 30)")
async def admin_get_application(
    application_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only. Returns 404 if not found."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    try:
        app_id = uuid.UUID(application_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid UUID")
    result = await crud.admin_get_application(db, app_id)
    return ApplicationResponse(**result)


@app.patch("/v1/admin/applications/{application_id}/review", response_model=ApplicationResponse,
           summary="Admin: approve or reject an application (Sprint 30)")
async def admin_review_application(
    application_id: str,
    body: ReviewApplicationRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only. On approval, automatically creates the Driver + Vehicle records."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    try:
        app_id = uuid.UUID(application_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid UUID")
    # Resolve admin's DB UUID for audit trail (reviewed_by is a UUID column)
    admin_user = await crud._get_user_by_auth_id(db, claims.user_id)
    admin_uuid = admin_user.id if admin_user is not None else None
    result = await crud.admin_review_application(
        db, app_id, body.status, body.notes_admin, admin_uuid
    )
    return ApplicationResponse(**result)


# ===========================================================================
# Sprint 31 — Feature Flags, Live Drivers, Role Management, Invite Codes
# ===========================================================================

class FeatureFlagResponse(BaseModel):
    name: str
    enabled: bool
    rollout_pct: int
    description: str | None
    updated_at: str


class SetFlagRequest(BaseModel):
    enabled: bool
    rollout_pct: int = 0
    description: str | None = None


class LiveDriverResponse(BaseModel):
    driver_id: str
    email: str
    status: str
    is_online: bool
    lat: float | None
    lng: float | None
    last_seen_at: str | None


class SetRoleRequest(BaseModel):
    role: str  # "customer" | "driver" | "admin"


class InviteCodeResponse(BaseModel):
    id: str
    code: str
    max_uses: int
    used_count: int
    created_at: str
    expires_at: str | None


class CreateInviteCodeRequest(BaseModel):
    code: str
    max_uses: int = 1


class UseInviteCodeRequest(BaseModel):
    code: str


# ── Sprint 32 — Multi-city & Geofencing ────────────────────────────────────

class CityResponse(BaseModel):
    city_id: str
    name: str
    country: str
    center_lat: float
    center_lng: float
    radius_km: float
    active: bool
    created_at: str


class CreateCityRequest(BaseModel):
    name: str
    country: str = "Côte d'Ivoire"
    center_lat: float
    center_lng: float
    radius_km: float = 30.0
    active: bool = True


class UpdateCityRequest(BaseModel):
    name: str | None = None
    country: str | None = None
    center_lat: float | None = None
    center_lng: float | None = None
    radius_km: float | None = None
    active: bool | None = None


class ServiceZoneResponse(BaseModel):
    zone_id: str
    city_id: str
    city_name: str
    name: str
    polygon_geojson: str | None = None
    active: bool
    created_at: str


class CreateServiceZoneRequest(BaseModel):
    city_id: str
    name: str
    polygon_geojson: str | None = None
    active: bool = True


class PointInCityResponse(BaseModel):
    lat: float
    lng: float
    in_service: bool
    city_name: str | None = None
    city_id: str | None = None


@app.get("/v1/admin/flags", response_model=list[FeatureFlagResponse],
         summary="List all feature flags (Sprint 31)")
async def admin_list_flags(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only. Seeds defaults on first call."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    flags = await crud.get_feature_flags(db)
    return [FeatureFlagResponse(**f) for f in flags]


@app.patch("/v1/admin/flags/{flag_name}", response_model=FeatureFlagResponse,
           summary="Enable/disable a feature flag (Sprint 31)")
async def admin_set_flag(
    flag_name: str,
    body: SetFlagRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only. Creates the flag if it does not exist."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    result = await crud.set_feature_flag(
        db, flag_name, body.enabled, body.rollout_pct, body.description
    )
    return FeatureFlagResponse(**result)


@app.get("/v1/flags/{flag_name}", response_model=FeatureFlagResponse | None,
         summary="Public read of a single feature flag (Sprint 31)")
async def get_flag(
    flag_name: str,
    db: AsyncSession = Depends(get_db),
):
    """No auth required. Returns null if the flag does not exist."""
    result = await crud.get_feature_flag(db, flag_name)
    if result is None:
        return None
    return FeatureFlagResponse(**result)


@app.get("/v1/admin/drivers/live", response_model=list[LiveDriverResponse],
         summary="List online drivers with last GPS position (Sprint 31)")
async def admin_list_live_drivers(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only. Returns all drivers where is_online=True."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    rows = await crud.list_live_drivers(db)
    return [LiveDriverResponse(**r) for r in rows]


@app.patch("/v1/admin/users/{user_id}/role", response_model=dict,
           summary="Admin changes a user's role (Sprint 31)")
async def admin_change_user_role(
    user_id: str,
    body: SetRoleRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only. Cannot self-promote."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid UUID")
    # Resolve admin's DB UUID (needed for the self-promotion check and audit trail)
    admin_user = await crud._get_user_by_auth_id(db, claims.user_id)
    if admin_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin non enregistré en base.")
    return await crud.admin_set_user_role(db, uid, body.role, admin_user.id)


@app.post("/v1/admin/invite-codes", response_model=InviteCodeResponse, status_code=201,
          summary="Create an invite code (Sprint 31)")
async def admin_create_invite_code(
    body: CreateInviteCodeRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only. Creates a new invite code."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    result = await crud.create_invite_code(db, body.code, body.max_uses)
    return InviteCodeResponse(**result)


@app.post("/v1/invite-codes/use", response_model=InviteCodeResponse,
          summary="Consume an invite code (Sprint 31)")
async def use_invite_code(
    body: UseInviteCodeRequest,
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint. Consumes an invite code. 422 on invalid/exhausted."""
    result = await crud.use_invite_code(db, body.code)
    return InviteCodeResponse(**result)


# ===========================================================================
# Sprint 32 — Multi-city & Geofencing endpoints
# ===========================================================================

@app.get("/v1/cities", response_model=list[CityResponse],
         summary="List active cities (Sprint 32)")
async def list_cities(
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint. Returns only active cities."""
    rows = await crud.list_cities(db, include_inactive=False)
    return [CityResponse(**r) for r in rows]


@app.get("/v1/admin/cities", response_model=list[CityResponse],
         summary="Admin: list all cities including inactive (Sprint 32)")
async def admin_list_cities(
    include_inactive: bool = True,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only. Returns all cities."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    rows = await crud.list_cities(db, include_inactive=include_inactive)
    return [CityResponse(**r) for r in rows]


@app.post("/v1/admin/cities", response_model=CityResponse, status_code=201,
          summary="Admin: create a new city (Sprint 32)")
async def admin_create_city(
    body: CreateCityRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only. 409 if city name already exists."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    result = await crud.create_city(
        db,
        name=body.name,
        country=body.country,
        center_lat=body.center_lat,
        center_lng=body.center_lng,
        radius_km=body.radius_km,
        active=body.active,
    )
    return CityResponse(**result)


@app.patch("/v1/admin/cities/{city_id}", response_model=CityResponse,
           summary="Admin: update a city (Sprint 32)")
async def admin_update_city(
    city_id: str,
    body: UpdateCityRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only. Partial update — only non-null fields are changed."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    try:
        cid = uuid.UUID(city_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid UUID")
    result = await crud.update_city(
        db, cid, **body.model_dump(exclude_none=True)
    )
    return CityResponse(**result)


@app.get("/v1/cities/{city_id}", response_model=CityResponse,
         summary="Get a single city (Sprint 32)")
async def get_city(
    city_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Public. 404 if not found."""
    try:
        cid = uuid.UUID(city_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid UUID")
    result = await crud.get_city(db, cid)
    return CityResponse(**result)


@app.get("/v1/service-zones", response_model=list[ServiceZoneResponse],
         summary="List active service zones (Sprint 32)")
async def list_service_zones(
    city_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Public. Optionally filter by city_id."""
    cid: uuid.UUID | None = None
    if city_id:
        try:
            cid = uuid.UUID(city_id)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid city_id UUID")
    rows = await crud.list_service_zones(db, city_id=cid, include_inactive=False)
    return [ServiceZoneResponse(**r) for r in rows]


@app.post("/v1/admin/service-zones", response_model=ServiceZoneResponse, status_code=201,
          summary="Admin: create a service zone (Sprint 32)")
async def admin_create_service_zone(
    body: CreateServiceZoneRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only. 404 if the city does not exist."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    try:
        cid = uuid.UUID(body.city_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid city_id UUID")
    result = await crud.create_service_zone(
        db,
        city_id=cid,
        name=body.name,
        polygon_geojson=body.polygon_geojson,
        active=body.active,
    )
    return ServiceZoneResponse(**result)


@app.get("/v1/admin/service-zones", response_model=list[ServiceZoneResponse],
         summary="Admin: list all service zones including inactive (Sprint 32)")
async def admin_list_service_zones(
    city_id: str | None = None,
    include_inactive: bool = True,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    cid: uuid.UUID | None = None
    if city_id:
        try:
            cid = uuid.UUID(city_id)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid city_id UUID")
    rows = await crud.list_service_zones(db, city_id=cid, include_inactive=include_inactive)
    return [ServiceZoneResponse(**r) for r in rows]


@app.get("/v1/geo/point-in-service", response_model=PointInCityResponse,
         summary="Check if a lat/lng is within any active city's service area (Sprint 32)")
async def point_in_service(
    lat: float,
    lng: float,
    db: AsyncSession = Depends(get_db),
):
    """Public. Returns in_service=True and city info if the point is covered."""
    city = await crud.find_city_for_point(db, lat, lng)
    if city is None:
        return PointInCityResponse(lat=lat, lng=lng, in_service=False)
    return PointInCityResponse(
        lat=lat,
        lng=lng,
        in_service=True,
        city_name=city.name,
        city_id=str(city.id),
    )


# ===========================================================================
# Sprint 33 — Customer Wallet Pydantic models & endpoints
# ===========================================================================

class WalletResponse(BaseModel):
    wallet_id: str
    user_id: str
    balance_xof: float
    created_at: str
    updated_at: str


class WalletTransactionResponse(BaseModel):
    tx_id: str
    wallet_id: str
    tx_type: str      # credit | debit | refund
    amount_xof: float
    reason: str
    reference_id: str | None = None
    note: str | None = None
    balance_after: float
    created_at: str


class TopupRequest(BaseModel):
    amount_xof: float
    reference_id: str | None = None
    note: str | None = None


class WalletPayTripRequest(BaseModel):
    trip_id: str
    amount_xof: float


class AdminWalletAdjustRequest(BaseModel):
    amount_xof: float   # positive = credit, negative = debit
    note: str | None = None


class WalletWithTxResponse(BaseModel):
    wallet: WalletResponse
    transaction: WalletTransactionResponse


@app.get("/v1/wallet", response_model=WalletResponse,
         summary="Get current user's wallet (Sprint 33)")
async def get_my_wallet(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns wallet for the authenticated user (creates if first access)."""
    result = await crud.get_wallet(db, claims.user_id)
    return WalletResponse(**result)


@app.post("/v1/wallet/topup", response_model=WalletWithTxResponse,
          summary="Top up wallet via mobile money (Sprint 33)")
async def topup_wallet(
    body: TopupRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Credit the authenticated user's wallet. 422 if amount <= 0."""
    result = await crud.wallet_topup(
        db, claims.user_id, body.amount_xof, body.reference_id, body.note
    )
    return WalletWithTxResponse(
        wallet=WalletResponse(**result["wallet"]),
        transaction=WalletTransactionResponse(**result["transaction"]),
    )


@app.post("/v1/wallet/pay-trip", response_model=WalletWithTxResponse,
          summary="Pay a trip from wallet (Sprint 33)")
async def wallet_pay_trip(
    body: WalletPayTripRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Debit wallet to pay for a trip. 402 if insufficient balance."""
    try:
        trip_uuid = uuid.UUID(body.trip_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid trip_id UUID")
    result = await crud.wallet_pay_trip(db, claims.user_id, trip_uuid, body.amount_xof)
    return WalletWithTxResponse(
        wallet=WalletResponse(**result["wallet"]),
        transaction=WalletTransactionResponse(**result["transaction"]),
    )


@app.get("/v1/wallet/transactions", response_model=list[WalletTransactionResponse],
         summary="Get wallet transaction history (Sprint 33)")
async def get_wallet_transactions(
    limit: int = 20,
    offset: int = 0,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns paginated transaction history, newest first."""
    rows = await crud.get_wallet_transactions(db, claims.user_id, limit, offset)
    return [WalletTransactionResponse(**r) for r in rows]


@app.post("/v1/admin/wallets/{user_id}/adjust", response_model=WalletResponse,
          summary="Admin manual wallet adjustment (Sprint 33)")
async def admin_adjust_wallet(
    user_id: str,
    body: AdminWalletAdjustRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only. Positive amount = credit, negative = debit. 422 if balance would go negative."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid UUID")
    result = await crud.admin_adjust_wallet(db, uid, body.amount_xof, body.note)
    return WalletResponse(**result)


# ===========================================================================
# Sprint 34 — Advanced Analytics endpoints
# ===========================================================================

class RevenueByPeriodResponse(BaseModel):
    period: str
    revenue_xof: float
    trip_count: int


class DriverPerformanceResponse(BaseModel):
    driver_id: str
    email: str
    trip_count: int
    total_revenue_xof: float
    avg_rating: float


class CategoryBreakdownResponse(BaseModel):
    category: str
    trip_count: int
    total_revenue_xof: float
    avg_fare_xof: float


class HourlyDemandResponse(BaseModel):
    hour: int
    trip_count: int


class TopCustomerResponse(BaseModel):
    user_id: str
    email: str
    trip_count: int
    total_spent_xof: float


class PlatformKPIsResponse(BaseModel):
    total_users: int
    total_drivers: int
    online_drivers: int
    total_trips: int
    completed_trips: int
    completion_rate_pct: float
    total_revenue_xof: float
    avg_rating: float


@app.get("/v1/admin/analytics/revenue", response_model=list[RevenueByPeriodResponse],
         summary="Revenue by time period (Sprint 34)")
async def admin_revenue_by_period(
    period: str = "day",
    limit: int = 30,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only. period: 'day' | 'week' | 'month'."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    if period not in ("day", "week", "month"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="period must be 'day', 'week', or 'month'")
    rows = await crud.get_revenue_by_period(db, period, limit)
    return [RevenueByPeriodResponse(**r) for r in rows]


@app.get("/v1/admin/analytics/drivers", response_model=list[DriverPerformanceResponse],
         summary="Driver performance ranking (Sprint 34)")
async def admin_driver_performance(
    limit: int = 20,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only. Ranked by trip count descending."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    rows = await crud.get_driver_performance(db, limit)
    return [DriverPerformanceResponse(**r) for r in rows]


@app.get("/v1/admin/analytics/categories", response_model=list[CategoryBreakdownResponse],
         summary="Trip and revenue breakdown by category (Sprint 34)")
async def admin_category_breakdown(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    rows = await crud.get_category_breakdown(db)
    return [CategoryBreakdownResponse(**r) for r in rows]


@app.get("/v1/admin/analytics/hourly", response_model=list[HourlyDemandResponse],
         summary="Trip demand by hour of day (Sprint 34)")
async def admin_hourly_demand(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only. Returns 24 entries (0–23)."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    rows = await crud.get_hourly_demand(db)
    return [HourlyDemandResponse(**r) for r in rows]


@app.get("/v1/admin/analytics/top-customers", response_model=list[TopCustomerResponse],
         summary="Top customers by completed trips (Sprint 34)")
async def admin_top_customers(
    limit: int = 10,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    rows = await crud.get_top_customers(db, limit)
    return [TopCustomerResponse(**r) for r in rows]


@app.get("/v1/admin/analytics/kpis", response_model=PlatformKPIsResponse,
         summary="High-level platform KPIs (Sprint 34)")
async def admin_platform_kpis(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only. Single-object summary of platform health."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    result = await crud.get_platform_kpis(db)
    return PlatformKPIsResponse(**result)


# ===========================================================================
# Sprint 36 — Service activation flags
# ===========================================================================

class ServiceFlagsResponse(BaseModel):
    rideshare_customer: bool
    rideshare_driver: bool
    assistance_customer: bool
    assistance_driver: bool


class ServiceFlagUpdateRequest(BaseModel):
    rideshare_customer: bool | None = None
    rideshare_driver: bool | None = None
    assistance_customer: bool | None = None
    assistance_driver: bool | None = None


@app.get("/v1/admin/services", response_model=ServiceFlagsResponse,
         summary="Get all service activation flags (Sprint 36)")
async def admin_get_services(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ServiceFlagsResponse:
    """Admin-only. Returns the current on/off state for each service × audience combination."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    flags = await crud.get_service_flags(db)
    return ServiceFlagsResponse(**flags)


@app.patch("/v1/admin/services", response_model=ServiceFlagsResponse,
           summary="Update service activation flags (Sprint 36)")
async def admin_set_services(
    body: ServiceFlagUpdateRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ServiceFlagsResponse:
    """Admin-only. Partial update — only supplied fields are changed.

    Fields:
      rideshare_customer  — ride-share available to customers
      rideshare_driver    — ride-share visible to drivers
      assistance_customer — assistance available to customers
      assistance_driver   — assistance jobs visible to drivers
    """
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    updates = body.model_dump(exclude_none=True)
    flags = await crud.set_service_flags(db, updates)
    return ServiceFlagsResponse(**flags)
