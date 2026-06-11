"""Firebase auth adapter — Sprint 3.

Verifies Firebase ID tokens issued by Google Identity Platform.
Requires FIREBASE_PROJECT_ID to be set in the environment.
"""
from app.auth.base import AuthAdapter, Claims


class FirebaseAdapter(AuthAdapter):
    """Verifies Firebase ID tokens via firebase-admin SDK."""

    def __init__(self) -> None:
        # Sprint 3: initialised lazily to avoid import cost in dev
        import firebase_admin  # noqa: PLC0415
        from firebase_admin import auth as fb_auth  # noqa: PLC0415

        if not firebase_admin._apps:
            firebase_admin.initialize_app()
        self._fb_auth = fb_auth

    def verify(self, token: str) -> Claims:
        from fastapi import HTTPException, status  # noqa: PLC0415

        try:
            decoded = self._fb_auth.verify_id_token(token)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Firebase token invalid: {exc}",
                headers={"WWW-Authenticate": "Bearer"},
            ) from exc

        # Firebase custom claims carry the Ziza role; fall back to "customer"
        role = decoded.get("role", "customer")
        return Claims(
            user_id=decoded["uid"],
            email=decoded.get("email", ""),
            role=role,
            provider="firebase",
            email_verified=bool(decoded.get("email_verified", False)),
        )
