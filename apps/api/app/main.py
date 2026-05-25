"""Ziza API — Sprint 4.

Endpoints:
  GET  /health             liveness probe
  GET  /v1/demo            Sprint 1 demo payload
  POST /v1/token           [DEV only] exchange email+password for a JWT
  GET  /v1/me              return normalised claims for the authenticated user
  POST /v1/auth/register   upsert user in DB and return profile
"""
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
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
# Auth — POST /v1/auth/register  (Sprint 4 — real DB upsert)
# ---------------------------------------------------------------------------

class RegisterResponse(BaseModel):
    user_id: str
    email: str
    role: str
    provider: str
    created: bool  # True = new user row, False = existing user (possibly updated)


@app.post("/v1/auth/register", tags=["auth"])
async def register(
    claims: Claims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RegisterResponse:
    """Upsert the authenticated user in the database.

    Called once after the first sign-in (any provider).
    Idempotent — safe to call on every login.
    """
    user, created = await crud.upsert_user(db, claims)
    return RegisterResponse(
        user_id=user.user_id,
        email=user.email,
        role=user.role,
        provider=user.provider,
        created=created,
    )
