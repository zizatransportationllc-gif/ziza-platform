"""Ziza API — Sprint 9.

Endpoints:
  GET   /health                          liveness probe
  GET   /v1/demo                         Sprint 1 demo payload
  POST  /v1/token                        [DEV only] exchange email+password for a JWT
  GET   /v1/me                           return normalised claims for the authenticated user
  POST  /v1/auth/register                upsert user in DB and return profile
  POST  /v1/estimate                     fare estimate for a ride (origin → destination)
  POST  /v1/trips                        book a trip from a valid estimate
  GET   /v1/trips                        list customer's trips
  GET   /v1/trips/driver/available       pending trips (driver view)
  GET   /v1/trips/driver/active          driver's current active trip
  GET   /v1/trips/{trip_id}              trip detail + events
  PATCH /v1/trips/{trip_id}/cancel       customer cancels a pending/accepted trip
  PATCH /v1/trips/{trip_id}/accept       driver accepts a pending trip
  PATCH /v1/trips/{trip_id}/start        driver starts an accepted trip
  PATCH /v1/trips/{trip_id}/complete     driver completes an in_progress trip
  POST  /v1/drivers/register             create/upsert driver profile
  POST  /v1/trips/{trip_id}/rate         customer rates a completed trip (1-5 stars)
  GET   /v1/trips/{trip_id}/rating       get the rating for a trip
  GET   /v1/drivers/me/rating            driver's own rating statistics
  POST  /v1/assistance                   customer creates a roadside assistance request
  GET   /v1/assistance/driver/available  pending assistance requests (driver view)
  GET   /v1/assistance/driver/active     driver's current active assistance request
  GET   /v1/assistance/{req_id}          customer views their assistance request
  PATCH /v1/assistance/{req_id}/cancel   customer cancels a pending request
  PATCH /v1/assistance/{req_id}/accept   driver accepts a pending request
  PATCH /v1/assistance/{req_id}/start    driver starts the intervention
  PATCH /v1/assistance/{req_id}/resolve  driver resolves the intervention
"""
from __future__ import annotations

from datetime import timedelta, timezone
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.auth.base import Claims
from app.auth.dependencies import get_current_user
from app.config import settings
from app.db import get_db

app = FastAPI(
    title="Ziza API",
    version=settings.app_version,
    description="Ziza Transportation backend API",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# System
# ---------------------------------------------------------------------------

@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    """Liveness probe used by Cloud Run and CI smoke tests."""
    return {"status": "ok"}


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


@app.post(
    "/v1/token",
    tags=["auth"],
    summary="[DEV] Exchange email+password for a JWT",
    include_in_schema=True,
)
def issue_token(body: TokenRequest) -> TokenResponse:
    """DEV-only endpoint.  Returns 404 in production."""
    if settings.environment == "prod":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    from app.auth.dev_adapter import DevAdapter  # noqa: PLC0415
    token = DevAdapter().issue(body.email, body.password)
    return TokenResponse(access_token=token)


# ---------------------------------------------------------------------------
# Auth — GET /v1/me
# ---------------------------------------------------------------------------

class MeResponse(BaseModel):
    user_id: str
    email: str
    role: str
    provider: str


@app.get("/v1/me", tags=["auth"])
def me(claims: Claims = Depends(get_current_user)) -> MeResponse:
    """Return normalised claims for the currently authenticated user."""
    return MeResponse(
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
# Rides — POST /v1/estimate  (Sprint 5)
# ---------------------------------------------------------------------------

class EstimateRequest(BaseModel):
    origin_lat: Annotated[float, Field(ge=-90, le=90, description="Origin latitude")]
    origin_lng: Annotated[float, Field(ge=-180, le=180, description="Origin longitude")]
    dest_lat: Annotated[float, Field(ge=-90, le=90, description="Destination latitude")]
    dest_lng: Annotated[float, Field(ge=-180, le=180, description="Destination longitude")]


class EstimateResponse(BaseModel):
    estimate_id: str
    distance_km: float
    duration_min: int
    fare_xof: int
    currency: str = "XOF"
    surge_multiplier: float
    distance_source: str  # "google_maps" | "haversine"
    expires_at: str       # ISO-8601 UTC


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
    surge = settings.fare_surge_multiplier
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

    return EstimateResponse(
        estimate_id=str(est.id),
        distance_km=est.distance_km,
        duration_min=est.duration_min,
        fare_xof=est.fare_xof,
        currency="XOF",
        surge_multiplier=est.surge_multiplier,
        distance_source=est.distance_source,
        expires_at=est.expires_at.isoformat(),
    )


# ---------------------------------------------------------------------------
# Rides — Trip booking (Sprint 6)
# ---------------------------------------------------------------------------

class TripRequest(BaseModel):
    estimate_id: str


class TripEventOut(BaseModel):
    event_type: str
    data: dict | None
    created_at: str


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
    created_at: str
    events: list[TripEventOut] | None = None


def _trip_response(trip, events=None) -> TripResponse:
    """Convert a Trip ORM object (+ optional events list) to a TripResponse."""
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
        created_at=trip.created_at.isoformat(),
        events=[
            TripEventOut(
                event_type=e.event_type,
                data=e.data,
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
    """Book a trip from a previously created (non-expired) estimate."""
    trip = await crud.create_trip(db, claims, body.estimate_id)
    return _trip_response(trip)


@app.get("/v1/trips", tags=["rides"])
async def list_trips(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TripResponse]:
    """List all trips for the authenticated customer, newest first."""
    trips = await crud.list_trips(db, claims.user_id)
    return [_trip_response(t) for t in trips]


@app.get("/v1/trips/{trip_id}", tags=["rides"])
async def get_trip(
    trip_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TripResponse:
    """Return full trip detail including the ordered event log."""
    trip, events = await crud.get_trip(db, trip_id, claims.user_id)
    return _trip_response(trip, events)


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
    trips = await crud.list_available_trips(db)
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
    return ActiveTripWrap(trip=_trip_response(trip) if trip else None)


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
    """List all pending assistance requests (driver marketplace view).

    Only drivers may call this endpoint.
    """
    if claims.role != "driver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers can view available assistance requests",
        )
    requests = await crud.list_available_assistance(db)
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
