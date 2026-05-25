"""Ziza API — Sprint 12.

Endpoints:
  GET   /health                                    liveness probe
  GET   /v1/demo                                   Sprint 1 demo payload
  POST  /v1/token                                  [DEV only] exchange email+password for a JWT
  GET   /v1/me                                     return normalised claims for the authenticated user
  POST  /v1/auth/register                          upsert user in DB and return profile
  POST  /v1/estimate                               fare estimate for a ride (origin → destination)
  POST  /v1/trips                                  book a trip from a valid estimate
  GET   /v1/trips                                  list customer's trips
  GET   /v1/trips/driver/available                 pending trips (driver view)
  GET   /v1/trips/driver/active                    driver's current active trip
  GET   /v1/trips/{trip_id}                        trip detail + events
  PATCH /v1/trips/{trip_id}/cancel                 customer cancels a pending/accepted trip
  PATCH /v1/trips/{trip_id}/accept                 driver accepts a pending trip
  PATCH /v1/trips/{trip_id}/start                  driver starts an accepted trip
  PATCH /v1/trips/{trip_id}/complete               driver completes an in_progress trip
  POST  /v1/drivers/register                       create/upsert driver profile
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
  POST  /v1/drivers/me/vehicle                     driver registers / updates their vehicle
  GET   /v1/drivers/me/vehicle                     driver gets their current vehicle
  GET   /v1/assistance                             customer lists all their assistance requests
  GET   /v1/admin/users                            admin lists all registered users
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


class VehicleInfo(BaseModel):
    """Embedded vehicle snapshot included in trip responses once a driver is assigned."""
    plate: str
    make: str | None = None
    model: str | None = None
    year: int | None = None
    color: str | None = None


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
    created_at: str
    events: list[TripEventOut] | None = None


def _vehicle_info(v) -> VehicleInfo | None:
    if v is None:
        return None
    return VehicleInfo(plate=v.plate, make=v.make, model=v.model, year=v.year, color=v.color)


def _trip_response(trip, events=None, vehicle=None) -> TripResponse:
    """Convert a Trip ORM object (+ optional events list + optional vehicle) to a TripResponse."""
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
    if trip:
        vehicle = await crud.get_vehicle_for_driver_uuid(db, trip.driver_id)
        return ActiveTripWrap(trip=_trip_response(trip, vehicle=vehicle))
    return ActiveTripWrap(trip=None)


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


class AdminTripRecord(BaseModel):
    trip_id: str
    status: str
    fare_xof: int | None = None
    distance_km: float | None = None
    duration_min: int | None = None
    customer_email: str
    driver_id: str | None = None
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
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AdminTripRecord]:
    """Admin: all trips newest first, with customer email.

    Query params: limit (default 50, max 200) and offset for pagination.
    """
    if claims.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    limit = min(limit, 200)
    rows = await crud.admin_list_trips(db, limit=limit, offset=offset)
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


class VehicleResponse(BaseModel):
    vehicle_id: str
    plate: str
    make: str | None = None
    model: str | None = None
    year: int | None = None
    color: str | None = None
    status: str
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
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AdminUserRecord]:
    """Admin: list all registered users (newest first)."""
    if claims.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    users = await crud.admin_list_users(db)
    return [AdminUserRecord(**u) for u in users]
