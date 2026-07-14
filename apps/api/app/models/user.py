"""User model — Sprint 4 → Sprint 49."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    """Registered platform user (customer, driver, or admin).

    ``user_id`` is the external auth identifier (Firebase UID or dev seeded ID).
    ``email`` is the canonical identity key shown to the user.
    ``name`` and ``phone`` are optional profile fields added in Sprint 16.
    ``password_hash`` stores a bcrypt hash for locally-created accounts (Sprint 49).
    """

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[str] = mapped_column(
        String(128), unique=True, index=True, nullable=False
    )
    email: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    role: Mapped[str] = mapped_column(
        String(32), nullable=False, default="customer"
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    # Sprint 16: optional display name and phone number
    name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # Sprint 64: structured identity fields
    first_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    date_of_birth: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # Sprint 69: profile photo (GCS object reference; served via signed read URL)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # Customer home address (saved label; only meaningful for customers)
    home_address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Sprint 49: bcrypt hash for locally-created accounts (provider="local")
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Sprint 73: Stripe Customer id holding the user's saved cards (ride payments)
    stripe_customer_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    def __repr__(self) -> str:
        return f"<User id={self.user_id!r} email={self.email!r} role={self.role!r}>"
