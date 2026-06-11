"""Auth abstraction layer — Sprint 2.

AuthAdapter is the single interface every auth backend must implement.
Business logic only ever sees Claims; it never imports a concrete adapter.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class Claims:
    """Normalised identity claims returned by any AuthAdapter."""
    user_id: str
    email: str
    role: str       # "customer" | "driver" | "admin"
    provider: str   # "dev" | "firebase"
    email_verified: bool = False  # True only when the IdP vouches for the email


class AuthAdapter(ABC):
    """Abstract base for all auth backends."""

    @abstractmethod
    def verify(self, token: str) -> Claims:
        """Verify *token* and return Claims.

        Raises:
            fastapi.HTTPException 401 — token invalid or expired.
        """
