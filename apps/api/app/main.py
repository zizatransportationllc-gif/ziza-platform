"""Ziza API - Sprint 1 minimal application.

Exposes two endpoints to validate the GitHub -> Docker -> GCP delivery chain:
- GET /health  : liveness probe
- GET /v1/demo : sample payload consumed by the three demo frontends
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

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


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    """Liveness probe used by Cloud Run health checks and CI smoke tests."""
    return {"status": "ok"}


@app.get("/v1/demo", tags=["demo"])
def demo() -> dict[str, str]:
    """Sample payload consumed by the three Sprint 1 demo frontends."""
    return {
        "app": settings.app_name,
        "message": "Hello from Ziza backend",
        "version": settings.app_version,
        "environment": settings.environment,
    }
