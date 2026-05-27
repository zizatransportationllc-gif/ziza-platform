"""FastAPI auth dependencies — Sprint 2.

Usage:
    @app.get("/v1/me")
    def me(claims: Claims = Depends(get_current_user)): ...

    @app.get("/v1/driver/trips")
    def trips(claims: Claims = Depends(require_role("driver"))): ...
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.base import AuthAdapter, Claims
from app.config import settings

bearer_scheme = HTTPBearer(auto_error=False)


def get_auth_adapter() -> AuthAdapter:
    """Return the adapter matching the current environment."""
    if settings.environment == "prod":
        from app.auth.firebase_adapter import FirebaseAdapter  # noqa: PLC0415
        return FirebaseAdapter()
    from app.auth.dev_adapter import DevAdapter  # noqa: PLC0415
    return DevAdapter()


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> Claims:
    """Dependency: verify Bearer token, return Claims. Raises 401 on failure."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    adapter = get_auth_adapter()
    return adapter.verify(credentials.credentials)


def require_role(*roles: str):
    """Dependency factory: verify token AND assert the caller has one of *roles*.

    Usage::
        @app.get("/v1/admin/kpis")
        def kpis(claims: Claims = Depends(require_role("admin"))): ...
    """
    def _dependency(claims: Claims = Depends(get_current_user)) -> Claims:
        if claims.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{claims.role}' is not authorised for this resource.",
            )
        return claims

    return _dependency
