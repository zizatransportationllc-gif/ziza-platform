"""Ziza API — Sprint 54.

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
  GET   /v1/trips/active                           customer's current active trip (or null)
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
  POST  /v1/trips/{trip_id}/rate                   customer rates a completed trip (1-5 stars)
  GET   /v1/trips/{trip_id}/rating                 get the rating for a trip
  GET   /v1/drivers/me/rating                      driver's own rating statistics
  GET   /v1/admin/drivers                          admin lists all drivers
  GET   /v1/drivers/me/earnings                    driver's earnings summary (total, today, week)
  GET   /v1/admin/stats                            platform-wide statistics
  GET   /v1/admin/trips                            all trips paginated (admin view)
  POST  /v1/drivers/me/vehicle                     driver registers / updates their vehicle
  GET   /v1/drivers/me/vehicle                     driver gets their current vehicle
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
  GET   /v1/places/autocomplete?q=                 geocode a free-text address query via Nominatim (Sprint 43)
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
  POST  /v1/craft/professionals/register          register as a professional (Sprint 47)
  GET   /v1/craft/professionals/me                get my professional profile (Sprint 47)
  PATCH /v1/craft/professionals/me                update professional profile / go online (Sprint 47)
  POST  /v1/craft/requests                        customer creates a craft request (Sprint 47)
  GET   /v1/craft/requests                        professional lists nearby open requests (Sprint 47)
  GET   /v1/craft/requests/mine                   customer lists their own requests (Sprint 47)
  GET   /v1/craft/requests/{id}                   get craft request detail (Sprint 47)
  POST  /v1/craft/requests/{id}/bids              professional submits a bid (Sprint 47)
  GET   /v1/craft/requests/{id}/bids              list bids for a request (Sprint 47)
  POST  /v1/craft/requests/{id}/select            customer selects a bid (Sprint 47)
  POST  /v1/craft/requests/{id}/cancel            cancel a craft request (Sprint 47)
  GET   /v1/admin/craft/requests                  admin lists all craft requests (Sprint 47)
  GET   /v1/admin/craft/professionals             admin lists all professionals (Sprint 47)
  GET   /v1/stats                                 public: trips + driver counts for landing page (Sprint 51)
  GET   /v1/landing/content                       public: landing page editable content blocks (Sprint 51)
  PATCH /v1/landing/content                       admin: upsert landing page content blocks (Sprint 51)
  POST  /v1/drivers/me/documents                  driver OR professional submits a KYC document (Sprint 54, no url max_length)
  GET   /v1/drivers/me/documents                  driver OR professional lists their KYC documents (Sprint 54)
  PATCH /v1/admin/professionals/{id}/status       admin sets professional status (Sprint 54)
  GET   /v1/admin/onboarding                      admin lists pending_docs drivers + professionals with doc counts (Sprint 57)
  GET   /v1/admin/onboarding/{entity_id}          admin gets full profile + documents for a pending user (Sprint 57)
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

import sqlalchemy as _sa
from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.storage import signed_read_url  # F1 (Sprint 68) — private KYC reads
from app.auth.base import Claims
from app.auth.dependencies import get_current_user
from app.config import settings
from app.db import get_db, get_db_optional
from app.middleware.logging import RequestLoggingMiddleware
from app.middleware.rate_limit import RateLimitMiddleware, set_rate_limit_enabled
from app.notifications.dispatcher import register_channel

# Observability (Phase 4) — initialise Sentry as early as possible. No-op when
# SENTRY_DSN is unset, so dev/CI are unaffected and the import stays optional.
if settings.sentry_dsn:
    import sentry_sdk  # noqa: PLC0415

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        release=settings.app_version,
        traces_sample_rate=settings.sentry_traces_sample_rate,
    )

app = FastAPI(
    title="Ziza API",
    version=settings.app_version,
    description="Ziza Transportation backend API",
)

# Sprint 25: activate rate limiter if enabled in settings
if settings.rate_limit_enabled:
    set_rate_limit_enabled(True)

# Sprint 39: Expo Push channel — always active, no credentials required
from app.notifications.expo_push import ExpoPushChannel  # noqa: E402
register_channel(ExpoPushChannel())

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
# In dev/staging, allow all origins so every newly-deployed frontend (e.g.
# ziza-web-craft) works without having to update the CORS whitelist.
# In production, only the explicitly listed origins are allowed.
if settings.environment == "prod":
    _cors_origins: list[str] = settings.cors_origins
    _cors_credentials: bool = True
else:
    _cors_origins = ["*"]
    _cors_credentials = False  # required by CORS spec when allow_origins="*"

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_cors_credentials,
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

    # Sprint 49: seeded users use the shared dev password; locally-created
    # accounts are verified against their bcrypt hash stored in the DB.
    auth_user_id: str
    if body.email in SEEDED_USERS:
        access_token = DevAdapter().issue(body.email, body.password)
        auth_user_id = SEEDED_USERS[body.email]["user_id"]
    else:
        # Local (signed-up) user — verify bcrypt hash from DB
        if db is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
            )
        import bcrypt as _bcrypt  # noqa: PLC0415
        db_user = await crud.get_user_by_email(db, body.email)
        if (
            db_user is None
            or not db_user.password_hash
            or not _bcrypt.checkpw(body.password.encode(), db_user.password_hash.encode())
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
            )
        access_token = DevAdapter().issue_raw(db_user.email, db_user.user_id, db_user.role)
        auth_user_id = db_user.user_id

    # Issue a refresh token only when a DB session is available
    raw_refresh = None
    if db is not None:
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
# Auth — POST /v1/auth/signup  (Sprint 49 — local account creation)
# ---------------------------------------------------------------------------

class SignupRequest(BaseModel):
    email: str
    password: str
    name: str | None = None
    phone: str | None = None
    first_name: str | None = None   # Sprint 64
    last_name: str | None = None    # Sprint 64
    date_of_birth: str | None = None  # Sprint 64 — ISO date string YYYY-MM-DD
    role: str = "customer"        # customer | driver | professional | admin
    admin_code: str | None = None  # required when role == "admin"


@app.post("/v1/auth/signup", tags=["auth"], summary="Create a new account")
async def signup_create(
    body: SignupRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Register a new user account and return a JWT access token.

    Available in DEV/staging only — returns 404 in production (Firebase handles
    identity there).  Passwords are hashed with bcrypt and stored in the DB.

    Allowed roles: customer, driver, professional, admin.
    Creating an admin account requires passing the correct ``admin_code``
    (configured via the ADMIN_SIGNUP_CODE env var, default ZIZA-ADMIN-2024).
    """
    if settings.environment == "prod":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    # --- validate role -------------------------------------------------------
    _ALLOWED_ROLES = {"customer", "driver", "professional", "admin"}
    if body.role not in _ALLOWED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"role must be one of: {', '.join(sorted(_ALLOWED_ROLES))}",
        )
    if body.role == "admin" and body.admin_code != settings.admin_signup_code:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid admin registration code",
        )

    # --- password strength ---------------------------------------------------
    if len(body.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must be at least 6 characters",
        )

    # --- check for duplicate email -------------------------------------------
    existing = await crud.get_user_by_email(db, body.email)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    # --- hash password -------------------------------------------------------
    import bcrypt as _bcrypt  # noqa: PLC0415
    hashed_pw = _bcrypt.hashpw(body.password.encode(), _bcrypt.gensalt()).decode()

    # --- create user in DB ---------------------------------------------------
    import uuid as _uuid  # noqa: PLC0415
    new_user_id = f"usr_{_uuid.uuid4().hex[:12]}"
    await crud.create_local_user(
        db,
        user_id=new_user_id,
        email=body.email,
        password_hash=hashed_pw,
        role=body.role,
        name=body.name,
        phone=body.phone,
        first_name=body.first_name,
        last_name=body.last_name,
        date_of_birth=body.date_of_birth,
    )

    # --- issue token ---------------------------------------------------------
    from app.auth.dev_adapter import DevAdapter  # noqa: PLC0415
    access_token = DevAdapter().issue_raw(body.email, new_user_id, body.role)
    raw_refresh, _ = await crud.create_refresh_token(db, new_user_id)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.jwt_access_ttl_min * 60,
        refresh_token=raw_refresh,
    )


class FirebaseTokenRequest(BaseModel):
    id_token: str
    role: str = "customer"            # customer | driver | professional | admin
    admin_code: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    date_of_birth: str | None = None
    phone: str | None = None
    name: str | None = None


@app.post("/v1/auth/firebase", tags=["auth"],
          summary="Exchange a Firebase ID token for a Ziza JWT + refresh token")
async def auth_firebase(
    body: FirebaseTokenRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Vérifie l'ID token Firebase, upsert le User (rôle en DB), émet le JWT maison."""
    _ALLOWED_ROLES = {"customer", "driver", "professional", "admin"}
    if body.role not in _ALLOWED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"role must be one of: {', '.join(sorted(_ALLOWED_ROLES))}",
        )

    from app.auth.firebase_adapter import FirebaseAdapter  # noqa: PLC0415
    identity = FirebaseAdapter().verify(body.id_token)   # raises 401 if invalid

    # Identity resolution. The Firebase uid is authoritative — the caller owns
    # that account. On an existing user the DB role governs (anti-escalation):
    # the client-supplied role is ignored.
    user = await crud._get_user_by_auth_id(db, identity.user_id)
    if user is None:
        # No account for this uid yet. Guard against email collisions: e-mail is
        # unique, so a different uid claiming an already-registered e-mail is
        # only allowed to LINK to it when Firebase vouches for the e-mail.
        # Otherwise it is an account-takeover attempt (and would also violate the
        # unique constraint with a 500) — reject it cleanly.
        email_owner = (
            await crud.get_user_by_email(db, identity.email)
            if identity.email else None
        )
        if email_owner is not None:
            if not identity.email_verified:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Email already registered; verify your email to link this account",
                )
            user = email_owner  # verified e-mail → log in as the existing account
        else:
            # Brand-new account: apply the admin gate, then create.
            if body.role == "admin" and body.admin_code != settings.admin_signup_code:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Invalid admin registration code",
                )
            user = await crud.create_firebase_user(
                db, uid=identity.user_id, email=identity.email, role=body.role,
                first_name=body.first_name, last_name=body.last_name,
                date_of_birth=body.date_of_birth, phone=body.phone, name=body.name,
            )
    elif identity.email and identity.email != user.email and identity.email_verified:
        # The e-mail on the Firebase account changed (verifyBeforeUpdateEmail)
        # and Firebase has verified the new address — sync it into the Ziza
        # account, guarding against taking over another user's e-mail. (Sprint 67)
        collision = await crud.get_user_by_email(db, identity.email)
        if collision is not None and collision.user_id != user.user_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already in use by another account",
            )
        user = await crud.update_user_email(db, user.user_id, identity.email)

    # E-mail verification gate — mandatory in prod (see settings). The user is
    # already persisted above (so profile fields entered at signup are kept); we
    # simply refuse to issue a session until Firebase confirms the e-mail. The
    # client surfaces this as a "verify your e-mail" prompt. (Sprint 67)
    if settings.require_email_verification and not identity.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="EMAIL_NOT_VERIFIED",
        )

    from app.auth.dev_adapter import DevAdapter  # noqa: PLC0415
    access_token = DevAdapter().issue_raw(user.email, user.user_id, user.role)
    raw_refresh, _ = await crud.create_refresh_token(db, user.user_id)
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.jwt_access_ttl_min * 60,
        refresh_token=raw_refresh,
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
    first_name: str | None = None   # Sprint 64
    last_name: str | None = None    # Sprint 64
    date_of_birth: str | None = None  # Sprint 64
    avatar_url: str | None = None   # Sprint 69 — signed read URL of the profile photo
    home_address: str | None = None  # customer's saved home address
    created_at: str


class UserProfileUpdateRequest(BaseModel):
    name: str | None = Field(None, max_length=128, description="Display name (null = leave unchanged)")
    phone: str | None = Field(None, max_length=32, description="Phone number (null = leave unchanged)")
    first_name: str | None = Field(None, max_length=64, description="First name (null = leave unchanged)")
    last_name: str | None = Field(None, max_length=64, description="Last name (null = leave unchanged)")
    date_of_birth: str | None = Field(None, max_length=10, description="YYYY-MM-DD (null = leave unchanged)")
    avatar_url: str | None = Field(None, max_length=512, description="Profile photo object URL (null = leave unchanged)")
    home_address: str | None = Field(None, max_length=255, description="Home address (null = leave unchanged)")


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
    profile = await crud.update_user_profile(
        db, claims.user_id, body.name, body.phone,
        first_name=body.first_name, last_name=body.last_name, date_of_birth=body.date_of_birth,
        avatar_url=body.avatar_url, home_address=body.home_address,
    )
    return UserProfileResponse(**profile)


# ---------------------------------------------------------------------------
# Sprint 69 — Profile photo upload + bank account (payout destination)
# ---------------------------------------------------------------------------

class AvatarUploadUrlRequest(BaseModel):
    filename: str = Field(..., max_length=200)
    content_type: str = Field("image/jpeg", max_length=100)


class AvatarUploadUrlResponse(BaseModel):
    upload_url: str   # PUT the image here
    final_url: str    # store this via PATCH /v1/profile { avatar_url }


_ALLOWED_AVATAR_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic"}


@app.post("/v1/profile/avatar-upload-url", tags=["profile"], status_code=200)
async def profile_avatar_upload_url(
    body: AvatarUploadUrlRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AvatarUploadUrlResponse:
    """Sprint 69 — Return a signed URL to upload a profile photo directly to GCS."""
    if body.content_type not in _ALLOWED_AVATAR_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"content_type must be one of {sorted(_ALLOWED_AVATAR_TYPES)}",
        )
    user = await crud.get_user_db_id(db, claims.user_id)
    import uuid as _uuid  # noqa: PLC0415
    safe_name = body.filename.replace("/", "_").replace("\\", "_")
    key = f"avatars/{user}/{_uuid.uuid4()}/{safe_name}"
    from app.storage import signed_upload_url  # noqa: PLC0415
    upload_url, object_ref = signed_upload_url(key, body.content_type)
    return AvatarUploadUrlResponse(upload_url=upload_url, final_url=object_ref)


class BankAccountResponse(BaseModel):
    account_holder_name: str
    bank_name: str | None = None
    routing_number: str
    account_number_last4: str
    account_type: str
    country: str
    updated_at: str


class BankAccountUpdateRequest(BaseModel):
    account_holder_name: str = Field(..., max_length=128)
    routing_number: str = Field(..., max_length=34)
    account_number: str = Field(..., max_length=64)
    bank_name: str | None = Field(None, max_length=128)
    account_type: str = Field("checking", max_length=16)
    country: str = Field("US", max_length=2)


@app.get("/v1/profile/bank-account", tags=["profile"])
async def get_my_bank_account(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BankAccountResponse:
    """Sprint 69 — Return the user's bank account (masked: only last 4 digits)."""
    ba = await crud.get_bank_account(db, claims.user_id)
    if ba is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No bank account on file")
    return BankAccountResponse(**ba)


@app.put("/v1/profile/bank-account", tags=["profile"])
async def set_my_bank_account(
    body: BankAccountUpdateRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BankAccountResponse:
    """Sprint 69 — Create or replace the user's bank account (payout destination)."""
    ba = await crud.upsert_bank_account(
        db, claims.user_id,
        account_holder_name=body.account_holder_name,
        routing_number=body.routing_number,
        account_number=body.account_number,
        bank_name=body.bank_name,
        account_type=body.account_type,
        country=body.country,
    )
    return BankAccountResponse(**ba)


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
    fare_cents: int
    label: str        # "Économique" / "Confort" / "Premium"
    description: str  # short description
    multiplier: float


class EstimateResponse(BaseModel):
    estimate_id: str
    distance_km: float
    duration_min: int
    fare_cents: int          # economy fare (backward compat)
    currency: str = "USD"
    surge_multiplier: float
    distance_source: str   # "mapbox" | "google_maps" | "haversine"
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

    # Sprint 45: enforce service zone restrictions (no-op if no active cities)
    await crud._check_zone_coverage(db, body.origin_lat, body.origin_lng)
    await crud._check_zone_coverage(db, body.dest_lat, body.dest_lng)

    route = await get_route_info(
        body.origin_lat, body.origin_lng,
        body.dest_lat, body.dest_lng,
    )
    surge = await crud.get_surge_multiplier(db)  # Sprint 16: read from DB (falls back to config)
    cfg = await crud.get_pricing_config(db)  # admin-configurable fare formula (USD cents)
    fare = calculate_fare(
        route.distance_km,
        cfg["base_fare_cents"],
        cfg["per_mile_cents"],
        surge,
        per_minute_cents=cfg["per_minute_cents"],
        duration_min=route.duration_min,
        min_fare_cents=cfg["min_fare_cents"],
    )

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
        fare_cents=fare,
        surge_multiplier=surge,
        distance_source=route.source,
        created_at=now,
        expires_at=expires,
    )
    db.add(est)
    await db.commit()
    await db.refresh(est)

    # Sprint 21: compute per-category fares using the configurable multipliers
    cat_multipliers = await crud.get_category_multipliers(db)
    category_options = {
        cat: CategoryFareOption(
            fare_cents=max(1, round(est.fare_cents * mult)),
            label=crud.CATEGORY_LABELS[cat],
            description=crud.CATEGORY_DESCRIPTIONS[cat],
            multiplier=mult,
        )
        for cat, mult in cat_multipliers.items()
    }

    return EstimateResponse(
        estimate_id=str(est.id),
        distance_km=est.distance_km,
        duration_min=est.duration_min,
        fare_cents=est.fare_cents,
        currency="USD",
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
    # The address text the customer selected, so the driver sees the same label
    origin_address: str | None = None
    dest_address: str | None = None


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
    fare_cents: int | None = None
    distance_km: float | None = None
    duration_min: int | None = None
    verification_code: str | None = None  # shared pickup code (customer ↔ driver)
    estimate_id: str | None = None
    origin_lat: float | None = None
    origin_lng: float | None = None
    dest_lat: float | None = None
    dest_lng: float | None = None
    origin_address: str | None = None   # customer-entered pickup label
    dest_address: str | None = None     # customer-entered drop-off label
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
        fare_cents=trip.fare_cents,
        distance_km=trip.distance_km,
        duration_min=trip.duration_min,
        verification_code=getattr(trip, "verification_code", None),
        estimate_id=str(trip.estimate_id) if trip.estimate_id else None,
        origin_lat=trip.origin_lat,
        origin_lng=trip.origin_lng,
        dest_lat=trip.dest_lat,
        dest_lng=trip.dest_lng,
        origin_address=getattr(trip, "origin_address", None),
        dest_address=getattr(trip, "dest_address", None),
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
    Blocked with HTTP 503 when the admin has disabled ride-share for customers.
    """
    flags = await crud.get_service_flags(db)
    if not flags["rideshare_customer"]:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The rideshare service is temporarily unavailable for customers.",
        )
    trip = await crud.create_trip(
        db, claims, body.estimate_id,
        promo_code=body.promo_code,
        category=body.category,
        origin_address=body.origin_address,
        dest_address=body.dest_address,
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


class ActiveTripWrap(BaseModel):
    """Wraps a user's current active trip (or None when there is none)."""
    trip: TripResponse | None = None


@app.get("/v1/trips/active", tags=["rides"])
async def get_customer_active_trip(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ActiveTripWrap:
    """Return the customer's current trip (pending/accepted/arrived/in_progress), or null.

    Lets the app restore live tracking after a reload instead of dropping the
    ride. Registered before ``/v1/trips/{trip_id}`` so "active" is not captured
    as a trip id.
    """
    trip = await crud.get_customer_active_trip(db, claims.user_id)
    if trip:
        vehicle = await crud.get_vehicle_for_driver_uuid(db, trip.driver_id)
        return ActiveTripWrap(trip=_trip_response(trip, vehicle=vehicle))
    return ActiveTripWrap(trip=None)


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
    fare_cents: int | None = None
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
            fare_cents=t.fare_cents,
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
    """Driver accepts a pending trip → accepted.
    Blocked with HTTP 503 when the admin has disabled ride-share for drivers.
    """
    if claims.role != "driver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers can accept trips",
        )
    flags = await crud.get_service_flags(db)
    if not flags["rideshare_driver"]:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The rideshare service is temporarily unavailable for drivers.",
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


@app.patch("/v1/trips/{trip_id}/arrived", tags=["drivers"])
async def mark_trip_arrived(
    trip_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TripResponse:
    """Driver confirms arrival at the pickup point → arrived (end of leg 1).

    The trip then waits for the customer to confirm they are on board before
    leg 2 (pickup → destination) can begin.
    """
    if claims.role != "driver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers can confirm arrival",
        )
    trip = await crud.mark_trip_arrived(db, trip_id, claims.user_id)
    return _trip_response(trip)


@app.patch("/v1/trips/{trip_id}/board", tags=["rides"])
async def confirm_trip_onboard(
    trip_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TripResponse:
    """Customer confirms they are in the car → in_progress (starts leg 2).

    Only allowed once the driver has marked arrival. This is the gate: leg 2
    cannot start until the customer confirms pickup.
    """
    trip = await crud.confirm_trip_onboard(db, trip_id, claims.user_id)
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



# ---------------------------------------------------------------------------
# Driver Earnings — Sprint 11
# ---------------------------------------------------------------------------

class EarningsTripRecord(BaseModel):
    trip_id: str
    fare_cents: int | None
    distance_km: float | None
    duration_min: int | None
    completed_at: str


class DriverEarningsSummary(BaseModel):
    total_cents: int
    total_trips: int
    today_cents: int
    today_trips: int
    week_cents: int
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
        total_cents=data["total_cents"],
        total_trips=data["total_trips"],
        today_cents=data["today_cents"],
        today_trips=data["today_trips"],
        week_cents=data["week_cents"],
        week_trips=data["week_trips"],
        recent_trips=[
            EarningsTripRecord(
                trip_id=str(t.id),
                fare_cents=t.fare_cents,
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
    drivers: dict
    payments: dict | None = None  # Sprint 24: payment totals


class AdminTripRecord(BaseModel):
    trip_id: str
    status: str
    fare_cents: int | None = None
    distance_km: float | None = None
    duration_min: int | None = None
    customer_email: str
    driver_id: str | None = None
    category: str = "economy"  # Sprint 21
    paid_at: str | None = None  # Sprint 42: ISO-8601 UTC timestamp when payment confirmed
    created_at: str
    updated_at: str


@app.get("/v1/admin/stats", tags=["admin"])
async def admin_get_stats(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AdminStats:
    """Admin: platform-wide statistics (trips, drivers, revenue)."""
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
# Admin — User List — Sprint 12
# ---------------------------------------------------------------------------

class AdminUserRecord(BaseModel):
    user_id: str
    email: str
    role: str
    provider: str
    created_at: str
    name: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    date_of_birth: str | None = None
    phone: str | None = None


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
    status: Literal["active", "inactive", "suspended", "pending_docs"]


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
    """Admin: set a driver's status (active | inactive | suspended | pending_docs)."""
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
    amount_cents: Annotated[int, Field(ge=1, description="Amount in XOF to withdraw")]


class PayoutResponse(BaseModel):
    payout_id: str
    driver_id: str
    amount_cents: int
    status: str
    note_admin: str | None = None
    created_at: str
    updated_at: str


def _payout_response(req) -> PayoutResponse:
    return PayoutResponse(
        payout_id=str(req.id),
        driver_id=str(req.driver_id),
        amount_cents=req.amount_cents,
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
    req = await crud.create_payout_request(db, claims.user_id, body.amount_cents)
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
    amount_cents: int
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
# Professional Payout Requests — Sprint 67 (isolated from driver payouts)
# ---------------------------------------------------------------------------

class ProPayoutCreateRequest(BaseModel):
    amount_cents: Annotated[int, Field(ge=1, description="Amount in USD cents to withdraw")]


class ProPayoutResponse(BaseModel):
    payout_id: str
    professional_id: str
    amount_cents: int
    status: str
    note_admin: str | None = None
    created_at: str
    updated_at: str


class ProBalanceResponse(BaseModel):
    professional_id: str
    gains_cents: int
    retraits_cents: int
    disponible_cents: int
    # Sprint 70 — real money in the pro's Stripe Connect account (from split-at-
    # charge destination charges). Defaults keep older callers/tests compatible.
    connect_available_cents: int = 0
    connect_pending_cents: int = 0


def _pro_payout_response(req) -> ProPayoutResponse:
    return ProPayoutResponse(
        payout_id=str(req.id),
        professional_id=str(req.professional_id),
        amount_cents=req.amount_cents,
        status=req.status,
        note_admin=req.note_admin,
        created_at=req.created_at.isoformat(),
        updated_at=req.updated_at.isoformat(),
    )


@app.get("/v1/craft/professionals/me/balance", tags=["payouts"])
async def get_my_professional_balance(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProBalanceResponse:
    """Professional: available withdrawal balance (USD cents)."""
    if claims.role != "professional":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only professionals can view their balance",
        )
    result = await crud.get_professional_balance(db, claims.user_id)
    return ProBalanceResponse(**result)


@app.post(
    "/v1/craft/professionals/me/payout-requests",
    tags=["payouts"],
    status_code=201,
)
async def create_pro_payout_request(
    body: ProPayoutCreateRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProPayoutResponse:
    """Professional requests a payout, capped at their available balance."""
    if claims.role != "professional":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only professionals can create payout requests",
        )
    req = await crud.create_professional_payout_request(
        db, claims.user_id, body.amount_cents
    )
    return _pro_payout_response(req)


@app.get("/v1/craft/professionals/me/payout-requests", tags=["payouts"])
async def list_pro_payout_requests(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ProPayoutResponse]:
    """Professional: list all their payout requests, newest first."""
    if claims.role != "professional":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only professionals can view payout requests",
        )
    reqs = await crud.list_professional_payout_requests(db, claims.user_id)
    return [_pro_payout_response(r) for r in reqs]


# ---------------------------------------------------------------------------
# WS3 (Sprint 68) — Stripe Connect onboarding (driver + professional)
# ---------------------------------------------------------------------------

class ConnectOnboardResponse(BaseModel):
    account_id: str
    onboarding_url: str


class ConnectStatusResponse(BaseModel):
    account_id: str | None = None
    onboarded: bool
    payouts_enabled: bool
    # Whether the connected account's card_issuing capability is active — lets the
    # UI offer "Get my card" only when a card can actually be issued.
    card_issuing_active: bool = False


@app.post("/v1/payouts/connect/onboard", tags=["payouts"], status_code=201)
async def connect_onboard(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ConnectOnboardResponse:
    """Driver/professional: start (or resume) Stripe Connect onboarding to receive payouts."""
    if claims.role not in ("driver", "professional"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers and professionals can set up payouts",
        )
    result = await crud.start_connect_onboarding(db, claims.user_id, claims.role)
    return ConnectOnboardResponse(**result)


@app.get("/v1/payouts/connect/status", tags=["payouts"])
async def connect_status(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ConnectStatusResponse:
    """Driver/professional: whether their payout account is onboarded and enabled."""
    if claims.role not in ("driver", "professional"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers and professionals can set up payouts",
        )
    result = await crud.get_connect_status(db, claims.user_id, claims.role)
    return ConnectStatusResponse(**result)


# ---------------------------------------------------------------------------
# Sprint 70 — Stripe Issuing debit card (spend the Connect balance)
# ---------------------------------------------------------------------------

class IssuingCardResponse(BaseModel):
    card_id: str
    last4: str | None = None
    status: str            # active | inactive
    owner_role: str
    created_at: str
    updated_at: str


class IssuingCardStatusRequest(BaseModel):
    active: bool


def _require_payee_role(claims: Claims) -> None:
    if claims.role not in ("driver", "professional"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers and professionals have a debit card",
        )


@app.post("/v1/payouts/issuing/card", tags=["payouts"], status_code=201)
async def issue_issuing_card(
    request: Request,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IssuingCardResponse:
    """Driver/professional: issue (or return the existing) Stripe Issuing debit
    card to spend their Connect balance. Requires completed onboarding (409).

    Issuing a card records the payee's acceptance of Stripe's Issuing Authorized
    User Terms, captured from the request IP.
    """
    _require_payee_role(claims)
    terms_ip = request.client.host if request.client else None
    data = await crud.issue_issuing_card(db, claims.user_id, claims.role, terms_ip=terms_ip)
    return IssuingCardResponse(**data)


@app.get("/v1/payouts/issuing/card", tags=["payouts"])
async def get_issuing_card(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IssuingCardResponse:
    """Driver/professional: return their debit card (404 if none issued yet)."""
    _require_payee_role(claims)
    data = await crud.get_issuing_card(db, claims.user_id, claims.role)
    if data is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No card issued yet")
    return IssuingCardResponse(**data)


@app.patch("/v1/payouts/issuing/card/status", tags=["payouts"])
async def set_issuing_card_status(
    body: IssuingCardStatusRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IssuingCardResponse:
    """Driver/professional: activate or freeze their debit card."""
    _require_payee_role(claims)
    data = await crud.set_issuing_card_status(db, claims.user_id, claims.role, body.active)
    return IssuingCardResponse(**data)


# ---------------------------------------------------------------------------
# WS3 (Sprint 68) — Admin: professional payout processing
# ---------------------------------------------------------------------------

class AdminProPayoutRecord(BaseModel):
    payout_id: str
    professional_id: str
    professional_email: str
    amount_cents: int
    status: str
    note_admin: str | None = None
    created_at: str
    updated_at: str


class ProPayoutBatchResponse(BaseModel):
    processed: int
    failed: int
    total_net_cents: int


@app.get("/v1/admin/professional-payout-requests", tags=["payouts"])
async def admin_list_professional_payouts(
    limit: int = 50,
    offset: int = 0,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AdminProPayoutRecord]:
    """Admin: list all professional payout requests (newest first)."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    rows = await crud.admin_list_professional_payouts(db, limit=min(limit, 200), offset=offset)
    return [AdminProPayoutRecord(**r) for r in rows]


@app.patch("/v1/admin/professional-payout-requests/{payout_id}/status", tags=["payouts"])
async def admin_update_professional_payout(
    payout_id: str,
    body: AdminPayoutStatusRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AdminProPayoutRecord:
    """Admin: approve or reject a professional payout request."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    result = await crud.admin_update_professional_payout_status(
        db, payout_id, body.status, body.note_admin
    )
    return AdminProPayoutRecord(**result)


@app.post("/v1/admin/professional-payouts/run", tags=["payouts"], status_code=200)
async def admin_run_professional_payout_batch(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProPayoutBatchResponse:
    """Admin: process all approved professional payouts via Stripe Connect transfers."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    result = await crud.run_professional_payout_batch(db)
    return ProPayoutBatchResponse(**result)


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
# Admin — base fare & per-mile pricing (USD cents), Sprint 66
# ---------------------------------------------------------------------------

class PricingResponse(BaseModel):
    base_fare_cents: int       # base fare in USD cents (e.g. 250 = $2.50)
    per_mile_cents: int        # rate per mile in USD cents (e.g. 175 = $1.75)
    per_minute_cents: int      # rate per minute in USD cents (0 = time component off)
    min_fare_cents: int        # minimum fare floor in USD cents
    category_multipliers: dict[str, float]  # economy / comfort / premium
    currency: str = "USD"


class PricingUpdateRequest(BaseModel):
    base_fare_cents: Annotated[
        int, Field(ge=1, le=100_000, description="Base fare in USD cents")
    ]
    per_mile_cents: Annotated[
        int, Field(ge=1, le=100_000, description="Rate per mile in USD cents")
    ]
    per_minute_cents: Annotated[
        int, Field(ge=0, le=100_000, description="Rate per minute in USD cents")
    ] = 0
    min_fare_cents: Annotated[
        int | None, Field(default=None, ge=1, le=100_000, description="Minimum fare floor in USD cents")
    ] = None
    category_multipliers: dict[str, float] | None = None


async def _pricing_response(db: AsyncSession) -> PricingResponse:
    cfg = await crud.get_pricing_config(db)
    mults = await crud.get_category_multipliers(db)
    return PricingResponse(**cfg, category_multipliers=mults)


@app.get("/v1/admin/settings/pricing", tags=["admin"])
async def admin_get_pricing(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PricingResponse:
    """Admin: return the full fare formula (base, per-mile, per-minute, minimum,
    and per-category multipliers)."""
    if claims.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return await _pricing_response(db)


@app.patch("/v1/admin/settings/pricing", tags=["admin"])
async def admin_set_pricing(
    body: PricingUpdateRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PricingResponse:
    """Admin: set the fare formula coefficients (USD cents) + per-category
    multipliers. Takes effect immediately on subsequent POST /v1/estimate calls.
    """
    if claims.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    await crud.set_pricing_config(
        db,
        body.base_fare_cents,
        body.per_mile_cents,
        per_minute_cents=body.per_minute_cents,
        min_fare_cents=body.min_fare_cents,
        category_multipliers=body.category_multipliers,
    )
    return await _pricing_response(db)


# ---------------------------------------------------------------------------
# Admin — payment split settings (taxes, platform fee, Stripe fee), Sprint 70
# ---------------------------------------------------------------------------

class PaymentSettingsResponse(BaseModel):
    ride_tax_flat_cents: int       # flat per-ride levy in USD cents
    ride_driver_split_pct: int     # driver share of the ride net (%)
    craft_platform_fee_pct: float  # Ziza fee added on top of a craft bid (%)
    craft_tax_pct: float           # sales tax on craft services (%)
    stripe_fee_pct: float          # Stripe fee estimate — percent of total (%)
    stripe_fee_fixed_cents: int    # Stripe fee estimate — fixed component (cents)


class PaymentSettingsUpdateRequest(BaseModel):
    """All fields optional — only provided keys are updated."""
    ride_tax_flat_cents: int | None = Field(None, ge=0, le=100_000)
    ride_driver_split_pct: int | None = Field(None, ge=0, le=100)
    craft_platform_fee_pct: float | None = Field(None, ge=0, le=100)
    craft_tax_pct: float | None = Field(None, ge=0, le=100)
    stripe_fee_pct: float | None = Field(None, ge=0, le=100)
    stripe_fee_fixed_cents: int | None = Field(None, ge=0, le=100_000)


@app.get("/v1/admin/settings/payments", tags=["admin"])
async def admin_get_payment_settings(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PaymentSettingsResponse:
    """Admin: return the payment-split settings (taxes, fees, Stripe estimate)."""
    if claims.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return PaymentSettingsResponse(**await crud.get_payment_settings(db))


@app.patch("/v1/admin/settings/payments", tags=["admin"])
async def admin_set_payment_settings(
    body: PaymentSettingsUpdateRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PaymentSettingsResponse:
    """Admin: update any subset of the payment-split settings.

    Takes effect immediately on subsequent payment intents (ride and craft).
    """
    if claims.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    merged = await crud.set_payment_settings(
        db,
        ride_tax_flat_cents=body.ride_tax_flat_cents,
        ride_driver_split_pct=body.ride_driver_split_pct,
        craft_platform_fee_pct=body.craft_platform_fee_pct,
        craft_tax_pct=body.craft_tax_pct,
        stripe_fee_pct=body.stripe_fee_pct,
        stripe_fee_fixed_cents=body.stripe_fee_fixed_cents,
    )
    return PaymentSettingsResponse(**merged)


# ---------------------------------------------------------------------------
# Driver Documents (KYC) — Sprint 17
# ---------------------------------------------------------------------------

DocumentType = Literal["license", "insurance", "registration", "id_card"]


# Sprint 66 — KYC doc URLs are rendered in the admin panel. Only allow http(s)
# links and base64 data URLs for images/PDF; reject script-bearing schemes
# (javascript:, data:text/html, SVG, etc.) that would yield stored XSS.
_SAFE_DOC_DATA_PREFIXES = (
    "data:image/png",
    "data:image/jpeg",
    "data:image/jpg",
    "data:image/webp",
    "data:application/pdf",
)


class DocumentSubmitRequest(BaseModel):
    type: DocumentType = Field(
        ..., description="license | insurance | registration | id_card"
    )
    # Sprint 54: no max_length — accepts base64 data URLs (can be several MB)
    url: str = Field(..., min_length=1, description="URL or base64 data URL of the document scan")

    @field_validator("url")
    @classmethod
    def _validate_url(cls, v: str) -> str:
        s = v.strip()
        low = s.lower()
        if low.startswith(("http://", "https://")):
            return s
        if low.startswith("data:"):
            if low.startswith(_SAFE_DOC_DATA_PREFIXES):
                return s
            raise ValueError(
                "data: URL must be an image (png/jpeg/webp) or PDF"
            )
        raise ValueError(
            "url must be an http(s) link or a safe data: image/PDF URL"
        )


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
    driver_id: str            # driver_id for drivers, professional_id for professionals
    driver_email: str         # email of the owner (driver or professional)
    type: str
    url: str
    status: str
    note_admin: str | None = None
    owner_type: str = "driver"   # Sprint 54: "driver" | "professional"
    created_at: str
    updated_at: str


class AdminDocumentStatusRequest(BaseModel):
    status: Literal["approved", "rejected", "needs_resubmission"]  # Sprint 56
    note_admin: str | None = None


class AdminPendingCounts(BaseModel):
    payout_requests: int
    documents: int
    onboarding: int = 0  # Sprint 57 — pending_docs drivers + professionals


def _document_response(doc) -> DocumentResponse:
    return DocumentResponse(
        document_id=str(doc.id),
        driver_id=str(doc.driver_id),
        type=doc.type,
        url=signed_read_url(doc.url),
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
    """Driver or professional submits a KYC document for admin review.

    Type must be one of: license, insurance, registration, id_card.
    Multiple submissions of the same type are allowed (e.g. resubmit after rejection).
    Sprint 54: accepts base64 data URLs (no size limit); open to professional role too.
    """
    if claims.role == "driver":
        doc = await crud.submit_driver_document(db, claims.user_id, body.type, body.url)
        return _document_response(doc)
    elif claims.role == "professional":
        doc = await crud.submit_professional_document(db, claims.user_id, body.type, body.url)
        return DocumentResponse(
            document_id=str(doc.id),
            driver_id=str(doc.professional_id),
            type=doc.type,
            url=signed_read_url(doc.url),
            status=doc.status,
            note_admin=doc.note_admin,
            created_at=doc.created_at.isoformat(),
            updated_at=doc.updated_at.isoformat(),
        )
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Only drivers and professionals can submit documents",
    )


@app.get("/v1/drivers/me/documents", tags=["documents"])
async def list_my_documents(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[DocumentResponse]:
    """Driver or professional: list all submitted KYC documents, newest first."""
    if claims.role == "driver":
        docs = await crud.list_driver_documents(db, claims.user_id)
        return [_document_response(d) for d in docs]
    elif claims.role == "professional":
        docs = await crud.list_professional_documents(db, claims.user_id)
        return [
            DocumentResponse(
                document_id=str(d.id),
                driver_id=str(d.professional_id),
                type=d.type,
                url=signed_read_url(d.url),
                status=d.status,
                note_admin=d.note_admin,
                created_at=d.created_at.isoformat(),
                updated_at=d.updated_at.isoformat(),
            )
            for d in docs
        ]
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Only drivers and professionals can view their documents",
    )


@app.get("/v1/admin/documents", tags=["admin"])
async def admin_list_documents(
    limit: int = 50,
    offset: int = 0,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AdminDocumentRecord]:
    """Admin: list all KYC documents from drivers and professionals (newest first, paginated).

    Sprint 54: includes professional documents alongside driver documents.
    """
    if claims.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    limit = min(limit, 200)
    # Driver documents
    driver_rows = await crud.admin_list_documents(db, limit=limit, offset=offset)
    driver_records = [
        AdminDocumentRecord(owner_type="driver", **r) for r in driver_rows
    ]
    # Professional documents (Sprint 54)
    from app.models.professional_document import ProfessionalDocument as _PD
    from app.models.craft import Professional as _Prof
    from app.models.user import User as _User
    from sqlalchemy import select as _select
    prof_result = await db.execute(
        _select(_PD, _Prof, _User)
        .join(_Prof, _PD.professional_id == _Prof.id)
        .join(_User, _Prof.user_id == _User.id)
        .order_by(_PD.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    prof_records = [
        AdminDocumentRecord(
            document_id=str(doc.id),
            driver_id=str(doc.professional_id),
            driver_email=user.email,
            type=doc.type,
            url=signed_read_url(doc.url),
            status=doc.status,
            note_admin=doc.note_admin,
            owner_type="professional",
            created_at=doc.created_at.isoformat(),
            updated_at=doc.updated_at.isoformat(),
        )
        for doc, prof, user in prof_result.all()
    ]
    # Merge and re-sort by created_at descending, apply pagination
    all_records = sorted(
        driver_records + prof_records,
        key=lambda r: r.created_at,
        reverse=True,
    )[:limit]
    return all_records


@app.patch("/v1/admin/documents/{document_id}/status", tags=["admin"])
async def admin_update_document_status(
    document_id: str,
    body: AdminDocumentStatusRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentResponse:
    """Admin: approve or reject a driver or professional KYC document.

    Sprint 54: tries driver documents first, then professional documents.
    Optionally attach a note explaining the decision.
    """
    if claims.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    # Try driver document first
    from app.models.driver_document import DriverDocument as _DD
    import uuid as _uuid
    try:
        doc_uuid = _uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid document_id")
    from sqlalchemy import select as _select
    driver_doc = await db.scalar(_select(_DD).where(_DD.id == doc_uuid))
    if driver_doc is not None:
        result = await crud.admin_update_document_status(
            db, document_id, body.status, body.note_admin
        )
        return DocumentResponse(**result)
    # Try professional document
    result = await crud.admin_update_professional_document_status(
        db, document_id, body.status, body.note_admin
    )
    return DocumentResponse(
        document_id=result["document_id"],
        driver_id=result["driver_id"],
        type=result["type"],
        url=result["url"],
        status=result["status"],
        note_admin=result["note_admin"],
        created_at=result["created_at"],
        updated_at=result["updated_at"],
    )


@app.get("/v1/admin/pending-counts", tags=["admin"])
async def admin_pending_counts(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AdminPendingCounts:
    """Admin: return counts of items awaiting action (payouts + KYC documents + onboarding)."""
    if claims.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    counts = await crud.admin_get_pending_counts(db)
    return AdminPendingCounts(**counts)


# ---------------------------------------------------------------------------
# Onboarding review — Sprint 57
# ---------------------------------------------------------------------------

class OnboardingDocCounts(BaseModel):
    pending: int = 0
    approved: int = 0
    rejected: int = 0
    needs_resubmission: int = 0
    total: int = 0


class OnboardingRecord(BaseModel):
    entity_type: str  # "driver" | "professional"
    entity_id: str
    user_id: str
    email: str
    name: str
    status: str
    doc_counts: OnboardingDocCounts
    created_at: str


class OnboardingDocRecord(BaseModel):
    document_id: str
    type: str
    url: str
    status: str
    note_admin: str | None = None
    created_at: str
    updated_at: str


class VehicleDetail(BaseModel):
    plate: str
    make: str | None = None
    model: str | None = None
    year: int | None = None
    color: str | None = None
    category: str = "economy"


class OnboardingDetailResponse(BaseModel):
    entity_type: str
    entity_id: str
    email: str
    name: str
    status: str
    # Sprint 63: driver-specific fields
    phone: str | None = None
    is_online: bool = False
    license_number: str | None = None
    created_at: str | None = None
    vehicle: VehicleDetail | None = None
    avg_rating: float | None = None
    total_ratings: int = 0
    total_trips: int = 0
    # Sprint 64: identity fields (driver + professional)
    first_name: str | None = None
    last_name: str | None = None
    date_of_birth: str | None = None
    # Professional-specific
    specialties: str | None = None
    documents: list[OnboardingDocRecord]


@app.get("/v1/admin/onboarding", tags=["admin"])
async def admin_list_onboarding(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[OnboardingRecord]:
    """Admin: list all drivers + professionals awaiting document review (status=pending_docs)."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    rows = await crud.admin_list_onboarding(db)
    return [
        OnboardingRecord(
            **{k: v for k, v in row.items() if k != "doc_counts"},
            doc_counts=OnboardingDocCounts(**row["doc_counts"]),
        )
        for row in rows
    ]


@app.get("/v1/admin/onboarding/{entity_id}", tags=["admin"])
async def admin_get_onboarding_detail(
    entity_id: str,
    entity_type: str = "driver",
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OnboardingDetailResponse:
    """Admin: get full profile + documents for a pending_docs driver or professional."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    detail = await crud.admin_get_onboarding_detail(db, entity_id, entity_type)
    docs = [OnboardingDocRecord(**d) for d in detail.pop("documents")]
    return OnboardingDetailResponse(**detail, documents=docs)


# ---------------------------------------------------------------------------
# Admin — per-driver history & earnings, per-professional summary (Sprint 66)
# ---------------------------------------------------------------------------

@app.get("/v1/admin/drivers/{entity_id}/history", tags=["admin"])
async def admin_driver_history(
    entity_id: str,
    limit: int = 20,
    offset: int = 0,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[DriverTripRecord]:
    """Admin: a specific driver's completed/cancelled trips, newest first."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    auth_id = await crud.resolve_driver_auth_id(db, entity_id)
    trips = await crud.list_driver_trip_history(db, auth_id, limit=min(limit, 100), offset=offset)
    return [
        DriverTripRecord(
            trip_id=str(t.id), status=t.status, fare_cents=t.fare_cents,
            distance_km=t.distance_km, duration_min=t.duration_min,
            created_at=t.created_at.isoformat(), updated_at=t.updated_at.isoformat(),
        )
        for t in trips
    ]


@app.get("/v1/admin/drivers/{entity_id}/earnings", tags=["admin"])
async def admin_driver_earnings(
    entity_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Admin: a specific driver's earnings summary (total / today / week)."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    auth_id = await crud.resolve_driver_auth_id(db, entity_id)
    data = await crud.get_driver_earnings(db, auth_id)
    data.pop("recent_trips", None)  # ORM Trip objects; use the /history endpoint instead
    return data


@app.get("/v1/admin/professionals/{entity_id}/summary", tags=["admin"])
async def admin_professional_summary(
    entity_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Admin: a professional's accepted interventions + total earnings (USD cents)."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return await crud.admin_professional_summary(db, entity_id)


# ---------------------------------------------------------------------------
# In-app messaging — Sprint 66 (trip & craft-request conversations, polling)
# ---------------------------------------------------------------------------

def _parse_uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid id format")


class MessageSendRequest(BaseModel):
    body: str = Field(..., min_length=1, max_length=4000)


class MessageRecord(BaseModel):
    message_id: str
    sender_role: str
    body: str
    created_at: str
    read: bool
    mine: bool


@app.post("/v1/trips/{trip_id}/messages", tags=["messaging"], status_code=201)
async def send_trip_message(
    trip_id: str,
    body: MessageSendRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageRecord:
    """Send a message in a ride conversation (customer ↔ assigned driver)."""
    msg = await crud.send_message(
        db, sender_auth_id=claims.user_id, sender_role=claims.role,
        body=body.body, trip_id=_parse_uuid(trip_id),
    )
    return MessageRecord(**msg)


@app.get("/v1/trips/{trip_id}/messages", tags=["messaging"])
async def list_trip_messages(
    trip_id: str,
    limit: int = 50,
    offset: int = 0,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MessageRecord]:
    """List a ride conversation (participants or admin). Marks incoming as read."""
    msgs = await crud.list_messages(
        db, requester_auth_id=claims.user_id, requester_role=claims.role,
        trip_id=_parse_uuid(trip_id), limit=limit, offset=offset,
    )
    return [MessageRecord(**m) for m in msgs]


@app.post("/v1/craft/requests/{request_id}/messages", tags=["messaging"], status_code=201)
async def send_request_message(
    request_id: str,
    body: MessageSendRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageRecord:
    """Send a message in an intervention conversation (customer ↔ professional)."""
    msg = await crud.send_message(
        db, sender_auth_id=claims.user_id, sender_role=claims.role,
        body=body.body, craft_request_id=_parse_uuid(request_id),
    )
    return MessageRecord(**msg)


@app.get("/v1/craft/requests/{request_id}/messages", tags=["messaging"])
async def list_request_messages(
    request_id: str,
    limit: int = 50,
    offset: int = 0,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MessageRecord]:
    """List an intervention conversation (participants or admin)."""
    msgs = await crud.list_messages(
        db, requester_auth_id=claims.user_id, requester_role=claims.role,
        craft_request_id=_parse_uuid(request_id), limit=limit, offset=offset,
    )
    return [MessageRecord(**m) for m in msgs]


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


@app.delete("/v1/notifications/{notification_id}", status_code=204, tags=["notifications"])
async def delete_notification(
    notification_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Delete one of the authenticated user's notifications (404 if not theirs)."""
    deleted = await crud.delete_notification(db, claims.user_id, notification_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )
    return Response(status_code=204)


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
# Address autocomplete — Sprint 43 (Nominatim / OpenStreetMap proxy)
# ---------------------------------------------------------------------------

class PlaceSearchResult(BaseModel):
    place_id: str
    name: str           # clean label (primary line), used as the trip location name
    address: str        # full address string
    primary: str        # main line, e.g. "123 Main Street" (Google-style)
    secondary: str      # context line, e.g. "Newark, New Jersey"
    lat: float
    lng: float


# New Jersey bounding box for Nominatim (lon_left, lat_top, lon_right, lat_bottom)
_NJ_VIEWBOX = "-75.60,41.36,-73.89,38.93"


def _format_place(item: dict) -> PlaceSearchResult:
    """Build a Google-Maps-style result (primary + secondary lines) from a
    Nominatim row with addressdetails."""
    addr = item.get("address", {}) or {}
    full = item.get("display_name", "")
    parts = [p.strip() for p in full.split(",") if p.strip()]

    road = addr.get("road")
    house = addr.get("house_number")
    if road:
        primary = f"{house} {road}".strip() if house else road
    elif item.get("name"):
        primary = item["name"]
    else:
        primary = parts[0] if parts else full

    city = (
        addr.get("city") or addr.get("town") or addr.get("village")
        or addr.get("hamlet") or addr.get("suburb") or addr.get("county")
    )
    secondary = ", ".join(p for p in (city, addr.get("state")) if p)

    return PlaceSearchResult(
        place_id=str(item["place_id"]),
        name=primary if not secondary else f"{primary}, {secondary}",
        address=full,
        primary=primary,
        secondary=secondary,
        lat=float(item["lat"]),
        lng=float(item["lon"]),
    )


@app.get("/v1/places/autocomplete", tags=["places"])
async def search_places_autocomplete(
    q: str,
    _: Claims = Depends(get_current_user),
) -> list[PlaceSearchResult]:
    """Geocode a free-text address query via Nominatim (OpenStreetMap).

    Results are restricted to the state of New Jersey, USA. Returns up to 5
    matches sorted by relevance. Requires at least 3 characters.
    """
    if len(q.strip()) < 3:
        return []
    import httpx  # noqa: PLC0415
    async with httpx.AsyncClient(
        timeout=6.0,
        headers={"User-Agent": "ZizaPlatform/1.0 (team@ziza.live)"},
    ) as client:
        resp = await client.get(
            "https://nominatim.openstreetmap.org/search",
            params={
                "q": q,
                "format": "json",
                "limit": 10,
                "addressdetails": 1,
                "countrycodes": "us",
                "viewbox": _NJ_VIEWBOX,
                "bounded": 1,          # restrict results to the NJ viewbox
            },
        )
        resp.raise_for_status()
        data = resp.json()

    results: list[PlaceSearchResult] = []
    for item in data:
        # Keep only New Jersey results (the bounded box can clip border areas)
        if (item.get("address", {}) or {}).get("state") != "New Jersey":
            continue
        results.append(_format_place(item))
        if len(results) >= 5:
            break
    return results


@app.get("/v1/places/reverse", tags=["places"])
async def reverse_geocode_place(
    lat: float,
    lng: float,
    _: Claims = Depends(get_current_user),
) -> PlaceSearchResult | None:
    """Reverse-geocode a GPS point to a human-readable address (Nominatim).

    Used so a GPS-picked pickup shows a real street address (the same label the
    driver sees) instead of raw coordinates. Returns null if not resolvable.
    """
    import httpx  # noqa: PLC0415
    async with httpx.AsyncClient(
        timeout=6.0,
        headers={"User-Agent": "ZizaPlatform/1.0 (team@ziza.live)"},
    ) as client:
        resp = await client.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={"lat": lat, "lon": lng, "format": "json", "addressdetails": 1},
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
    if not data or "error" in data or "place_id" not in data:
        return None
    return _format_place(data)


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
    trip_id: str | None = None
    craft_request_id: str | None = None
    amount_cents: int   # Sprint 70: total charged to the customer (base + fee + tax)
    currency: str = "USD"
    provider: str
    provider_ref: str | None = None
    status: str   # pending | paid | failed | refunded
    checkout_url: str | None = None
    # Sprint 70 — split breakdown (null for pre-redesign intents)
    base_cents: int | None = None
    platform_fee_cents: int | None = None
    tax_cents: int | None = None
    stripe_fee_est_cents: int | None = None
    payee_amount_cents: int | None = None
    platform_amount_cents: int | None = None
    payee_account_id: str | None = None
    created_at: str
    updated_at: str


class WebhookResponse(BaseModel):
    received: bool = True
    intent_id: str
    status: str


# ---------------------------------------------------------------------------
# Saved cards — Stripe Customer + PaymentMethods (Sprint 73, ride payments)
# ---------------------------------------------------------------------------

class SetupIntentResponse(BaseModel):
    client_secret: str
    customer_id: str


class SavedCard(BaseModel):
    id: str
    brand: str | None = None
    last4: str | None = None
    exp_month: int | None = None
    exp_year: int | None = None
    is_default: bool = False


@app.post("/v1/payments/methods/setup-intent", tags=["payments"], status_code=201)
async def create_pm_setup_intent(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SetupIntentResponse:
    """Return a SetupIntent client_secret so the client can save a card via
    Stripe Elements / the mobile SDK. Creates the Stripe Customer on first use.

    Cards are entered client-side and tokenized by Stripe — the raw card number
    never reaches Ziza's servers."""
    data = await crud.create_card_setup_intent(db, claims.user_id)
    return SetupIntentResponse(**data)


@app.get("/v1/payments/methods", tags=["payments"])
async def list_saved_cards(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[SavedCard]:
    """List the caller's saved cards (brand + last 4 only)."""
    return [SavedCard(**c) for c in await crud.list_cards(db, claims.user_id)]


@app.post("/v1/payments/methods/{pm_id}/default", tags=["payments"])
async def set_default_saved_card(
    pm_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set the caller's default card (used for the ride hold at driver-accept)."""
    await crud.set_default_card(db, claims.user_id, pm_id)
    return {"ok": True}


@app.delete("/v1/payments/methods/{pm_id}", tags=["payments"], status_code=204)
async def delete_saved_card(
    pm_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a saved card from the caller's account."""
    await crud.delete_card(db, claims.user_id, pm_id)


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
        notify_url=settings.payment_notify_url or None,
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
    # WS5 — in production a signing provider is mandatory; the mock adapter does
    # not verify signatures, so reject it to prevent forged webhooks.
    if settings.environment == "prod" and getattr(adapter, "_provider_name", "mock") == "mock":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payment provider not configured for production (signed webhooks required)",
        )
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


@app.post("/v1/admin/payments/{intent_id}/refund", tags=["payments"])
async def admin_refund_payment(
    intent_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PaymentIntentResponse:
    """WS4 — Admin refunds a paid trip payment (idempotent)."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    from app.payment import get_adapter  # noqa: PLC0415
    result = await crud.refund_payment(db, intent_id, get_adapter())
    return PaymentIntentResponse(**result)


@app.get("/v1/admin/finance/reconciliation", tags=["payments"])
async def admin_finance_reconciliation(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """WS4 — Admin financial integrity report (payments, payouts, top-ups, wallet ledger)."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return await crud.finance_reconciliation(db)


@app.get("/v1/admin/finance/fee-reconciliation", tags=["payments"])
async def admin_finance_fee_reconciliation(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Sprint 70 — Reconcile estimated vs actual Stripe fees on split payments.

    Fetches the provider's real fee for each paid split payment and reports the
    drift; ``within_tolerance`` is False when the total drift should be acted on
    (tune the fee estimate). No-op drift in dev/CI (mock provider)."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    from app.payment import get_adapter  # noqa: PLC0415
    return await crud.fee_reconciliation(db, get_adapter())


@app.get("/v1/admin/finance/metrics", tags=["payments"])
async def admin_finance_metrics(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """WS6 — Operational finance metrics (success rates, counts by status)."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return await crud.finance_metrics(db)


@app.get("/v1/admin/finance/transactions", tags=["payments"])
async def admin_finance_transactions(
    limit: int = 50,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """WS6 — Unified recent money-movement feed for the admin dashboard."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return await crud.finance_transactions(db, limit=min(limit, 200))


@app.get("/v1/admin/finance/alerts", tags=["payments"])
async def admin_finance_alerts(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """WS6 — Conditions needing operator attention (pollable by monitoring)."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return await crud.finance_alerts(db)


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
    final_url: str   # Private object reference; served later via signed read URLs (F1)


# Sprint 66 — restrict KYC uploads to document/image types. Prevents serving
# attacker-controlled HTML/SVG from the bucket and rejects executable types.
_ALLOWED_DOC_CONTENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
}


class UploadUrlRequest(BaseModel):
    filename: str    # e.g. "license.pdf"
    content_type: str = "application/pdf"

    @field_validator("filename")
    @classmethod
    def _safe_filename(cls, v: str) -> str:
        # Strip any directory components, then allow only safe characters so the
        # value cannot traverse or alter the server-built object key.
        base = v.replace("\\", "/").split("/")[-1]
        base = re.sub(r"[^A-Za-z0-9._-]", "_", base).lstrip(".")
        if not base:
            raise ValueError("invalid filename")
        return base[:128]

    @field_validator("content_type")
    @classmethod
    def _allowed_content_type(cls, v: str) -> str:
        if v not in _ALLOWED_DOC_CONTENT_TYPES:
            raise ValueError(
                "content_type must be one of: "
                + ", ".join(sorted(_ALLOWED_DOC_CONTENT_TYPES))
            )
        return v


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
        description="economy | comfort | premium | default",
    )
    rate_pct: Annotated[
        int,
        Field(ge=0, le=100, description="Commission rate in percent (0–100)"),
    ]


class DriverBalanceResponse(BaseModel):
    driver_id: str
    gains_bruts_cents: int
    commission_cents: int
    retraits_cents: int
    solde_net_cents: int
    # Sprint 67 — amount available to withdraw now (nets out pending/approved payouts)
    disponible_cents: int
    # Sprint 70 — real money in the driver's Stripe Connect account (from split-at-
    # charge destination charges). Defaults keep older callers/tests compatible.
    connect_available_cents: int = 0
    connect_pending_cents: int = 0


class PayoutBatchResponse(BaseModel):
    processed: int
    failed: int
    total_net_cents: int
    total_commission_cents: int


@app.get("/v1/drivers/me/balance", tags=["payouts"])
async def get_driver_balance(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DriverBalanceResponse:
    """Sprint 29 — Return the driver's net available balance.

    Breakdown:
    - ``gains_bruts_cents``: total gross earnings from completed trips
    - ``commission_cents``: platform fee (configurable per category)
    - ``retraits_cents``: total already paid out (processed payout requests)
    - ``solde_net_cents``: available balance = gains - commission - retraits
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

    Valid categories: economy, comfort, premium, default.
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
    zone_type: str = "city"
    center_lat: float
    center_lng: float
    radius_km: float
    active: bool
    created_at: str


class CreateCityRequest(BaseModel):
    name: str
    country: str = "United States"
    zone_type: str = "city"
    center_lat: float
    center_lng: float
    radius_km: float = 30.0
    active: bool = True


class UpdateCityRequest(BaseModel):
    name: str | None = None
    country: str | None = None
    zone_type: str | None = None
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
    seed: bool = True,  # Sprint 45: pass seed=false to get the raw list without auto-seeding
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only. Returns all cities.
    By default triggers default-city seeding on the first call.
    Pass seed=false to inspect the raw DB state without seeding."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    if seed:
        rows = await crud.list_cities(db, include_inactive=include_inactive)
    else:
        # Raw query — no auto-seed
        from sqlalchemy import select as _select  # noqa: PLC0415
        from app.models.city import City as _City  # noqa: PLC0415
        stmt = _select(_City)
        if not include_inactive:
            stmt = stmt.where(_City.active.is_(True))
        stmt = stmt.order_by(_City.name)
        rows_raw = (await db.scalars(stmt)).all()
        return [CityResponse(**crud._city_to_dict(c)) for c in rows_raw]
    return [CityResponse(**r) for r in rows]


@app.post("/v1/admin/cities/seed-defaults", response_model=list[CityResponse],
          summary="Admin: seed default cities (Sprint 45)")
async def admin_seed_default_cities(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only. Seeds the default cities (Abidjan, Bouaké, Yamoussoukro) if
    the cities table is empty, then returns all cities.  Idempotent — safe to
    call multiple times.  This is the explicit action that enables zone
    enforcement for the first time."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    rows = await crud.list_cities(db, include_inactive=True)  # triggers _ensure_city_defaults
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
        zone_type=body.zone_type,
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


@app.delete("/v1/admin/cities/{city_id}", status_code=204,
            summary="Admin: delete a zone (Sprint 46)")
async def admin_delete_city(
    city_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only. Deletes the zone and all its service sub-zones (CASCADE)."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    try:
        cid = uuid.UUID(city_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid UUID")
    await crud.delete_city(db, cid)


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


class UpdateServiceZoneRequest(BaseModel):
    name: str | None = None
    active: bool | None = None


@app.patch("/v1/admin/service-zones/{zone_id}", response_model=ServiceZoneResponse,
           summary="Admin: update a service zone (Sprint 45)")
async def admin_update_service_zone(
    zone_id: str,
    body: UpdateServiceZoneRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only. Update a zone's name and/or active status."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    try:
        zid = uuid.UUID(zone_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid zone_id UUID")
    result = await crud.update_service_zone(db, zid, name=body.name, active=body.active)
    return ServiceZoneResponse(**result)


@app.delete("/v1/admin/service-zones/{zone_id}", status_code=204,
            summary="Admin: delete a service zone (Sprint 45)")
async def admin_delete_service_zone(
    zone_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only. Permanently deletes a service zone."""
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    try:
        zid = uuid.UUID(zone_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid zone_id UUID")
    await crud.delete_service_zone(db, zid)


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
    balance_cents: float
    created_at: str
    updated_at: str


class WalletTransactionResponse(BaseModel):
    tx_id: str
    wallet_id: str
    tx_type: str      # credit | debit | refund
    amount_cents: float
    reason: str
    reference_id: str | None = None
    note: str | None = None
    balance_after: float
    created_at: str


class TopupRequest(BaseModel):
    amount_cents: float
    reference_id: str | None = None
    note: str | None = None


class WalletPayTripRequest(BaseModel):
    trip_id: str
    amount_cents: float


class AdminWalletAdjustRequest(BaseModel):
    amount_cents: float   # positive = credit, negative = debit
    note: str | None = None


class WalletWithTxResponse(BaseModel):
    wallet: WalletResponse
    transaction: WalletTransactionResponse


class WalletTopupResponse(BaseModel):
    """WS2 — a pending top-up. The wallet is credited only after the customer
    completes the checkout and the provider confirms via webhook."""
    topup_id: str
    amount_cents: int
    currency: str
    provider: str
    provider_ref: str | None = None
    status: str           # pending | paid | failed
    checkout_url: str | None = None


@app.get("/v1/wallet", response_model=WalletResponse,
         summary="Get current user's wallet (Sprint 33)")
async def get_my_wallet(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns wallet for the authenticated user (creates if first access)."""
    result = await crud.get_wallet(db, claims.user_id)
    return WalletResponse(**result)


@app.post("/v1/wallet/topup", response_model=WalletTopupResponse, status_code=201,
          summary="Start a wallet top-up via the payment provider (WS2)")
async def topup_wallet(
    body: TopupRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """WS2 — Start a real top-up: returns a ``checkout_url`` to pay. The wallet
    is credited only after the provider confirms the payment (webhook). 422 if
    amount <= 0."""
    from app.payment import get_adapter  # noqa: PLC0415
    result = await crud.create_wallet_topup(
        db, claims.user_id, int(body.amount_cents), get_adapter()
    )
    return WalletTopupResponse(**result)


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
    result = await crud.wallet_pay_trip(db, claims.user_id, trip_uuid, body.amount_cents)
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
    result = await crud.admin_adjust_wallet(db, uid, body.amount_cents, body.note)
    return WalletResponse(**result)


# ===========================================================================
# Sprint 34 — Advanced Analytics endpoints
# ===========================================================================

class RevenueByPeriodResponse(BaseModel):
    period: str
    revenue_cents: float
    trip_count: int


class DriverPerformanceResponse(BaseModel):
    driver_id: str
    email: str
    trip_count: int
    total_revenue_cents: float
    avg_rating: float


class CategoryBreakdownResponse(BaseModel):
    category: str
    trip_count: int
    total_revenue_cents: float
    avg_fare_cents: float


class HourlyDemandResponse(BaseModel):
    hour: int
    trip_count: int


class TopCustomerResponse(BaseModel):
    user_id: str
    email: str
    trip_count: int
    total_spent_cents: float


class PlatformKPIsResponse(BaseModel):
    total_users: int
    total_drivers: int
    online_drivers: int
    total_trips: int
    completed_trips: int
    completion_rate_pct: float
    total_revenue_cents: float
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


class ServiceFlagUpdateRequest(BaseModel):
    rideshare_customer: bool | None = None
    rideshare_driver: bool | None = None


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
    """
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    updates = body.model_dump(exclude_none=True)
    flags = await crud.set_service_flags(db, updates)
    return ServiceFlagsResponse(**flags)


# ===========================================================================
# Sprint 47 — Ziza Craft marketplace
# ===========================================================================

from app.models.craft import CRAFT_CATEGORIES  # noqa: E402

# ---------------------------------------------------------------------------
# Pydantic models — Craft
# ---------------------------------------------------------------------------


class ProfessionalResponse(BaseModel):
    professional_id: str
    user_id: str
    specialties: str
    bio: str | None
    status: str
    is_online: bool
    current_lat: float | None
    current_lng: float | None
    created_at: str


# ---------------------------------------------------------------------------
# Admin: set professional status — Sprint 54
# (placed here so ProfessionalResponse is already defined)
# ---------------------------------------------------------------------------

class ProfessionalStatusRequest(BaseModel):
    status: Literal["active", "inactive", "suspended", "pending_docs"]


@app.patch(
    "/v1/admin/professionals/{professional_id}/status",
    tags=["admin"],
    summary="Admin sets a professional's status (Sprint 54)",
)
async def admin_set_professional_status(
    professional_id: str,
    body: ProfessionalStatusRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProfessionalResponse:
    """Admin: set a professional's status (active | inactive | suspended | pending_docs)."""
    if claims.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    result = await crud.admin_update_professional_status(db, professional_id, body.status)
    return ProfessionalResponse(**result)


class RegisterProfessionalRequest(BaseModel):
    specialties: str = ""
    bio: str | None = None


class UpdateProfessionalRequest(BaseModel):
    specialties: str | None = None
    bio: str | None = None
    is_online: bool | None = None
    current_lat: float | None = None
    current_lng: float | None = None


class CraftRequestResponse(BaseModel):
    request_id: str
    customer_id: str
    category: str
    description: str
    lat: float
    lng: float
    address: str | None
    status: str
    bid_deadline: str | None
    selected_bid_id: str | None
    verification_code: str | None = None  # shared once a bid is selected
    paid_at: str | None = None            # set when the customer's payment clears
    created_at: str
    updated_at: str
    distance_km: float | None = None


class CreateCraftRequestBody(BaseModel):
    category: str
    description: str
    lat: float
    lng: float
    address: str | None = None
    bid_deadline_minutes: int = 30


class CraftBidResponse(BaseModel):
    bid_id: str
    request_id: str
    professional_id: str
    price_cents: int
    eta_min: int
    note: str | None
    professional_lat: float | None
    professional_lng: float | None
    status: str
    created_at: str
    distance_km: float | None = None


class CreateBidBody(BaseModel):
    price_cents: int
    eta_min: int = 0  # computed by the system from the pro's position when known
    note: str | None = None
    professional_lat: float | None = None
    professional_lng: float | None = None


class SelectBidBody(BaseModel):
    bid_id: str


# ---------------------------------------------------------------------------
# Professional endpoints
# ---------------------------------------------------------------------------


@app.post(
    "/v1/craft/professionals/register",
    response_model=ProfessionalResponse,
    status_code=201,
    summary="Register as a professional (Sprint 47)",
)
async def craft_register_professional(
    body: RegisterProfessionalRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProfessionalResponse:
    """Any authenticated user can register as a professional.
    Idempotent — returns existing profile if already registered.
    """
    user_db_id = await crud.get_user_db_id(db, claims.user_id)
    data = await crud.register_professional(
        db,
        user_id=user_db_id,
        specialties=body.specialties,
        bio=body.bio,
    )
    return ProfessionalResponse(**data)


@app.get(
    "/v1/craft/professionals/me",
    response_model=ProfessionalResponse,
    summary="Get my professional profile (Sprint 47)",
)
async def craft_get_my_professional(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProfessionalResponse:
    user_db_id = await crud.get_user_db_id(db, claims.user_id)
    prof = await crud.get_professional_by_user(db, user_db_id)
    if prof is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Professional profile not found.")
    from app.crud import _professional_to_dict
    return ProfessionalResponse(**_professional_to_dict(prof))


@app.patch(
    "/v1/craft/professionals/me",
    response_model=ProfessionalResponse,
    summary="Update professional profile / toggle online status (Sprint 47)",
)
async def craft_update_professional(
    body: UpdateProfessionalRequest,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProfessionalResponse:
    user_db_id = await crud.get_user_db_id(db, claims.user_id)
    data = await crud.update_professional(
        db,
        user_id=user_db_id,
        specialties=body.specialties,
        bio=body.bio,
        is_online=body.is_online,
        current_lat=body.current_lat,
        current_lng=body.current_lng,
    )
    return ProfessionalResponse(**data)


# ---------------------------------------------------------------------------
# Craft request endpoints
# ---------------------------------------------------------------------------


@app.post(
    "/v1/craft/requests",
    response_model=CraftRequestResponse,
    status_code=201,
    summary="Customer creates a craft request (Sprint 47)",
)
async def craft_create_request(
    body: CreateCraftRequestBody,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CraftRequestResponse:
    """Authenticated customer posts a request. Bidding window opens immediately."""
    customer_db_id = await crud.get_user_db_id(db, claims.user_id)
    data = await crud.create_craft_request(
        db,
        customer_id=customer_db_id,
        category=body.category,
        description=body.description,
        lat=body.lat,
        lng=body.lng,
        address=body.address,
        bid_deadline_minutes=body.bid_deadline_minutes,
    )
    return CraftRequestResponse(**data)


@app.get(
    "/v1/craft/requests",
    response_model=list[CraftRequestResponse],
    summary="Professional: list nearby open craft requests (Sprint 47)",
)
async def craft_list_open_requests(
    lat: float,
    lng: float,
    limit: int = 20,
    offset: int = 0,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CraftRequestResponse]:
    """Returns open requests sorted by distance from the professional's location."""
    items = await crud.list_open_craft_requests(db, lat=lat, lng=lng, limit=limit, offset=offset)
    return [CraftRequestResponse(**d) for d in items]


@app.get(
    "/v1/craft/requests/mine",
    response_model=list[CraftRequestResponse],
    summary="Customer: list my craft requests (Sprint 47)",
)
async def craft_list_my_requests(
    limit: int = 20,
    offset: int = 0,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CraftRequestResponse]:
    customer_db_id = await crud.get_user_db_id(db, claims.user_id)
    items = await crud.list_customer_craft_requests(
        db, customer_id=customer_db_id, limit=limit, offset=offset
    )
    return [CraftRequestResponse(**d) for d in items]


@app.get(
    "/v1/craft/requests/{request_id}",
    response_model=CraftRequestResponse,
    summary="Get craft request detail (Sprint 47)",
)
async def craft_get_request(
    request_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CraftRequestResponse:
    try:
        rid = uuid.UUID(request_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid UUID")
    req = await crud.get_craft_request(db, rid)
    from app.crud import _craft_request_to_dict
    return CraftRequestResponse(**_craft_request_to_dict(req))


class CraftTrackingResponse(BaseModel):
    """Live position of the assigned professional for an active assistance job."""

    request_id: str
    status: str
    pro_lat: float
    pro_lng: float
    distance_km: float
    eta_min: int


@app.get(
    "/v1/craft/requests/{request_id}/tracking",
    response_model=CraftTrackingResponse,
    summary="Customer polls the assigned professional's live position",
)
async def craft_get_tracking(
    request_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CraftTrackingResponse:
    """Customer tracks the assigned professional coming to them (polling).

    Returns the pro's latest GPS position and a fresh ETA to the customer.
    404 while the pro has not pushed any position yet (client retries).
    """
    if claims.role != "customer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only customers can track a request",
        )
    data = await crud.get_craft_tracking(db, claims, request_id)
    return CraftTrackingResponse(**data)


class CraftShareResponse(BaseModel):
    share_token: str


@app.post(
    "/v1/craft/requests/{request_id}/share",
    response_model=CraftShareResponse,
    summary="Customer creates a public share link for the intervention",
)
async def craft_create_share(
    request_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CraftShareResponse:
    """Return an opaque token for the public 'follow my intervention' page.

    Idempotent — the same token is returned on repeated calls.
    """
    if claims.role != "customer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only customers can share a request",
        )
    token = await crud.create_craft_share_token(db, claims, request_id)
    return CraftShareResponse(share_token=token)


class PublicCraftTrackResponse(BaseModel):
    status: str
    category: str
    customer_lat: float
    customer_lng: float
    pro_lat: float | None = None
    pro_lng: float | None = None
    eta_min: int | None = None


@app.get(
    "/v1/public/craft/track/{token}",
    response_model=PublicCraftTrackResponse,
    summary="Public (no-auth) live view of a shared intervention",
    tags=["public"],
)
async def public_craft_track(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> PublicCraftTrackResponse:
    """Live status + pro position for a shared assistance link — no auth.

    Only exposes the intervention location and the pro's live position/ETA.
    404 for an unknown token.
    """
    data = await crud.get_public_craft_track(db, token)
    return PublicCraftTrackResponse(**data)


class CraftRatingBody(BaseModel):
    stars: Annotated[int, Field(ge=1, le=5, description="Rating score (1 = worst, 5 = best)")]
    comment: str | None = None


class CraftRatingResponse(BaseModel):
    rating_id: str
    request_id: str
    stars: int
    comment: str | None = None
    created_at: str


@app.post(
    "/v1/craft/requests/{request_id}/rating",
    response_model=CraftRatingResponse,
    status_code=201,
    summary="Customer rates the professional after a completed job",
)
async def craft_create_rating(
    request_id: str,
    body: CraftRatingBody,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CraftRatingResponse:
    if claims.role != "customer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only customers can rate a professional",
        )
    data = await crud.create_craft_rating(db, claims, request_id, body.stars, body.comment)
    return CraftRatingResponse(**data)


@app.get(
    "/v1/craft/requests/{request_id}/rating",
    response_model=CraftRatingResponse | None,
    summary="Get the rating for a craft request (null if not rated yet)",
)
async def craft_get_rating(
    request_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CraftRatingResponse | None:
    data = await crud.get_craft_rating(db, request_id)
    return CraftRatingResponse(**data) if data is not None else None


@app.post(
    "/v1/craft/requests/{request_id}/cancel",
    response_model=CraftRequestResponse,
    summary="Cancel a craft request (Sprint 47)",
)
async def craft_cancel_request(
    request_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CraftRequestResponse:
    try:
        rid = uuid.UUID(request_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid UUID")
    is_admin = claims.role == "admin"
    user_db_id = await crud.get_user_db_id(db, claims.user_id)
    data = await crud.cancel_craft_request(db, rid, user_db_id, is_admin=is_admin)
    return CraftRequestResponse(**data)


# ---------------------------------------------------------------------------
# Craft bid endpoints
# ---------------------------------------------------------------------------


@app.post(
    "/v1/craft/requests/{request_id}/bids",
    response_model=CraftBidResponse,
    status_code=201,
    summary="Professional submits a bid (Sprint 47)",
)
async def craft_create_bid(
    request_id: str,
    body: CreateBidBody,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CraftBidResponse:
    """Professional must have a registered professional profile."""
    try:
        rid = uuid.UUID(request_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid UUID")
    user_db_id = await crud.get_user_db_id(db, claims.user_id)
    prof = await crud.get_professional_by_user(db, user_db_id)
    if prof is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must register as a professional before bidding.",
        )
    data = await crud.create_craft_bid(
        db,
        request_id=rid,
        professional_id=prof.id,
        price_cents=body.price_cents,
        eta_min=body.eta_min,
        note=body.note,
        professional_lat=body.professional_lat,
        professional_lng=body.professional_lng,
    )
    return CraftBidResponse(**data)


@app.get(
    "/v1/craft/requests/{request_id}/bids",
    response_model=list[CraftBidResponse],
    summary="List bids for a craft request (Sprint 47)",
)
async def craft_list_bids(
    request_id: str,
    customer_lat: float | None = None,
    customer_lng: float | None = None,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CraftBidResponse]:
    """Customer passes their lat/lng to get distance_km for each professional."""
    try:
        rid = uuid.UUID(request_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid UUID")
    items = await crud.list_bids_for_request(
        db, rid, customer_lat=customer_lat, customer_lng=customer_lng
    )
    return [CraftBidResponse(**d) for d in items]


@app.post(
    "/v1/craft/requests/{request_id}/select",
    response_model=CraftRequestResponse,
    summary="Customer selects a winning bid (Sprint 47)",
)
async def craft_select_bid(
    request_id: str,
    body: SelectBidBody,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CraftRequestResponse:
    try:
        rid = uuid.UUID(request_id)
        bid_id = uuid.UUID(body.bid_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid UUID")
    customer_db_id = await crud.get_user_db_id(db, claims.user_id)
    data = await crud.select_craft_bid(
        db, request_id=rid, bid_id=bid_id, customer_id=customer_db_id
    )
    return CraftRequestResponse(**data)


# ---------------------------------------------------------------------------
# Craft job lifecycle — arrival + completion handshake
# ---------------------------------------------------------------------------

def _craft_rid(request_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(request_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid UUID")


@app.patch(
    "/v1/craft/requests/{request_id}/arrived",
    response_model=CraftRequestResponse,
    summary="Professional confirms arrival at the customer (assigned → arrived)",
)
async def craft_mark_arrived(
    request_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CraftRequestResponse:
    data = await crud.professional_mark_arrived(db, _craft_rid(request_id), claims.user_id)
    return CraftRequestResponse(**data)


@app.patch(
    "/v1/craft/requests/{request_id}/confirm-arrival",
    response_model=CraftRequestResponse,
    summary="Customer validates the pro arrived (arrived → in_progress)",
)
async def craft_confirm_arrival(
    request_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CraftRequestResponse:
    customer_db_id = await crud.get_user_db_id(db, claims.user_id)
    data = await crud.customer_confirm_craft_arrival(db, _craft_rid(request_id), customer_db_id)
    return CraftRequestResponse(**data)


@app.patch(
    "/v1/craft/requests/{request_id}/work-done",
    response_model=CraftRequestResponse,
    summary="Professional confirms the work is finished (in_progress → pro_done)",
)
async def craft_work_done(
    request_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CraftRequestResponse:
    data = await crud.professional_work_done(db, _craft_rid(request_id), claims.user_id)
    return CraftRequestResponse(**data)


@app.patch(
    "/v1/craft/requests/{request_id}/complete",
    response_model=CraftRequestResponse,
    summary="Customer confirms the work is finished (pro_done → completed)",
)
async def craft_complete(
    request_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CraftRequestResponse:
    customer_db_id = await crud.get_user_db_id(db, claims.user_id)
    data = await crud.customer_complete_craft(db, _craft_rid(request_id), customer_db_id)
    return CraftRequestResponse(**data)


# ---------------------------------------------------------------------------
# Craft photos — before / after (professional uploads, both parties view)
# ---------------------------------------------------------------------------

_ALLOWED_CRAFT_PHOTO_TYPES = {"image/jpeg", "image/png", "image/webp"}


class CraftPhotoUploadUrlBody(BaseModel):
    kind: str                 # "before" | "after"
    content_type: str
    filename: str = "photo.jpg"


class CraftPhotoUploadUrlResponse(BaseModel):
    upload_url: str
    final_url: str


class CraftPhotoRecordBody(BaseModel):
    kind: str
    url: str


class CraftPhotoResponse(BaseModel):
    photo_id: str
    request_id: str
    kind: str
    url: str | None
    created_at: str


@app.post(
    "/v1/craft/requests/{request_id}/photos/upload-url",
    response_model=CraftPhotoUploadUrlResponse,
    summary="Pro: signed URL to upload a before/after photo",
)
async def craft_photo_upload_url(
    request_id: str,
    body: CraftPhotoUploadUrlBody,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CraftPhotoUploadUrlResponse:
    if body.kind not in ("before", "after"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="kind must be 'before' or 'after'.")
    if body.content_type not in _ALLOWED_CRAFT_PHOTO_TYPES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"content_type must be one of {sorted(_ALLOWED_CRAFT_PHOTO_TYPES)}")
    rid = _craft_rid(request_id)
    req = await crud.get_craft_request(db, rid)
    await crud._require_assigned_pro(db, req, claims.user_id)  # only the assigned pro
    import uuid as _uuid  # noqa: PLC0415
    safe_name = body.filename.replace("/", "_").replace("\\", "_")
    key = f"craft/{request_id}/{body.kind}/{_uuid.uuid4()}/{safe_name}"
    from app.storage import signed_upload_url  # noqa: PLC0415
    upload_url, object_ref = signed_upload_url(key, body.content_type)
    return CraftPhotoUploadUrlResponse(upload_url=upload_url, final_url=object_ref)


@app.post(
    "/v1/craft/requests/{request_id}/photos",
    response_model=CraftPhotoResponse,
    status_code=201,
    summary="Pro: record an uploaded before/after photo",
)
async def craft_photo_record(
    request_id: str,
    body: CraftPhotoRecordBody,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CraftPhotoResponse:
    rid = _craft_rid(request_id)
    req = await crud.get_craft_request(db, rid)
    await crud._require_assigned_pro(db, req, claims.user_id)
    uploader = await crud.get_user_db_id(db, claims.user_id)
    data = await crud.add_craft_photo(db, rid, body.kind, body.url, uploader)
    return CraftPhotoResponse(**data)


@app.get(
    "/v1/craft/requests/{request_id}/photos",
    response_model=list[CraftPhotoResponse],
    summary="List before/after photos for a craft request",
)
async def craft_photo_list(
    request_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CraftPhotoResponse]:
    rid = _craft_rid(request_id)
    req = await crud.get_craft_request(db, rid)
    # Visible to the request's customer, the assigned pro, or an admin.
    if claims.role != "admin":
        user_db_id = await crud.get_user_db_id(db, claims.user_id)
        if req.customer_id != user_db_id:
            await crud._require_assigned_pro(db, req, claims.user_id)
    items = await crud.list_craft_photos(db, rid)
    return [CraftPhotoResponse(**d) for d in items]


# ---------------------------------------------------------------------------
# Craft payment — customer pays for the assistance (reuses trip PaymentIntent)
# ---------------------------------------------------------------------------

@app.post(
    "/v1/craft/requests/{request_id}/payment-intent",
    response_model=PaymentIntentResponse,
    status_code=201,
    summary="Customer: pay for a completed assistance job",
)
async def craft_create_payment_intent(
    request_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PaymentIntentResponse:
    if claims.role != "customer":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only customers can initiate payment")
    from app.payment import get_adapter  # noqa: PLC0415
    adapter = get_adapter()
    data = await crud.create_craft_payment_intent(
        db, claims, request_id, adapter,
        return_url=settings.payment_return_url,
        notify_url=settings.payment_notify_url or None,
    )
    return PaymentIntentResponse(**data)


@app.get(
    "/v1/craft/requests/{request_id}/payment",
    response_model=PaymentIntentResponse | None,
    summary="Get the payment intent for a craft request (or null)",
)
async def craft_get_payment(
    request_id: str,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PaymentIntentResponse | None:
    data = await crud.get_craft_payment_for_request(db, claims, request_id)
    return PaymentIntentResponse(**data) if data else None


# ---------------------------------------------------------------------------
# Professional bids history
# ---------------------------------------------------------------------------


@app.get(
    "/v1/craft/bids/mine",
    response_model=list[CraftBidResponse],
    summary="Professional: list my submitted bids (Sprint 47)",
)
async def craft_list_my_bids(
    limit: int = 20,
    offset: int = 0,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CraftBidResponse]:
    user_db_id = await crud.get_user_db_id(db, claims.user_id)
    prof = await crud.get_professional_by_user(db, user_db_id)
    if prof is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Professional profile not found.")
    items = await crud.list_professional_bids(db, prof.id, limit=limit, offset=offset)
    return [CraftBidResponse(**d) for d in items]


# ---------------------------------------------------------------------------
# Admin Craft endpoints
# ---------------------------------------------------------------------------


@app.get(
    "/v1/admin/craft/requests",
    response_model=list[CraftRequestResponse],
    summary="Admin: list all craft requests (Sprint 47)",
)
async def admin_list_craft_requests(
    limit: int = 50,
    offset: int = 0,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CraftRequestResponse]:
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    items = await crud.admin_list_craft_requests(db, limit=limit, offset=offset)
    return [CraftRequestResponse(**d) for d in items]


@app.get(
    "/v1/admin/craft/professionals",
    response_model=list[ProfessionalResponse],
    summary="Admin: list all professionals (Sprint 47)",
)
async def admin_list_professionals(
    limit: int = 50,
    offset: int = 0,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ProfessionalResponse]:
    if claims.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    items = await crud.admin_list_professionals(db, limit=limit, offset=offset)
    return [ProfessionalResponse(**d) for d in items]


# ---------------------------------------------------------------------------
# Public stats — Sprint 51
# Lightweight public endpoint used by the landing page counter animation.
# ---------------------------------------------------------------------------

class PublicStatsResponse(BaseModel):
    total_trips: int    # completed trips ("Trips completed")
    total_drivers: int  # active drivers ("Active drivers")
    total_cities: int   # active service cities ("Cities served")


@app.get("/v1/stats", tags=["public"], summary="Public platform statistics (Sprint 51)")
async def public_stats(
    db: AsyncSession | None = Depends(get_db_optional),
) -> PublicStatsResponse:
    """Return aggregated counts for the landing page.  No auth required."""
    if db is None:
        return PublicStatsResponse(total_trips=0, total_drivers=0, total_cities=0)
    stats = await crud.get_public_stats(db)
    return PublicStatsResponse(
        total_trips=stats["total_trips"],
        total_drivers=stats["total_drivers"],
        total_cities=stats["total_cities"],
    )


# ---------------------------------------------------------------------------
# Landing content — Sprint 51
# ---------------------------------------------------------------------------

class LandingContentResponse(BaseModel):
    content: dict[str, str]


class LandingContentPatch(BaseModel):
    content: dict[str, str]


@app.get(
    "/v1/landing/content",
    tags=["landing"],
    summary="Public: landing page editable content (Sprint 51)",
)
async def get_landing_content(
    db: AsyncSession | None = Depends(get_db_optional),
) -> LandingContentResponse:
    """Return all persisted landing page content blocks.  No auth required.

    Returns an empty dict when the DB is unavailable so the page falls back
    to its built-in default HTML.
    """
    if db is None:
        return LandingContentResponse(content={})
    data = await crud.get_landing_content(db)
    return LandingContentResponse(content=data)


@app.patch(
    "/v1/landing/content",
    tags=["landing"],
    summary="Admin: upsert landing page content blocks (Sprint 51)",
)
async def patch_landing_content(
    body: LandingContentPatch,
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LandingContentResponse:
    """Admin only: save one or more landing page content blocks.

    The ``content`` dict maps each ``data-editable`` key (e.g. ``"hero-title"``)
    to its raw innerHTML value.  Existing keys are updated; new keys are
    created.  Keys absent from the request are left unchanged.
    """
    if claims.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    data = await crud.set_landing_content(db, body.content)
    return LandingContentResponse(content=data)
