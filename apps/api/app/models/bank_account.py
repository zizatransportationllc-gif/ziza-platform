"""BankAccount model — Sprint 69.

One payout/banking destination per user (customer, driver, professional).

SECURITY: ``account_number`` is sensitive. It is **never** returned by the API
(reads expose only the last 4 digits). Field-level encryption at rest (KMS /
Fernet) is a REQUIRED hardening step before production — see the API layer notes.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class BankAccount(Base):
    """A user's bank account (used as a payout destination)."""

    __tablename__ = "bank_accounts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,   # one bank account per user
        nullable=False,
        index=True,
    )
    account_holder_name: Mapped[str] = mapped_column(String(128), nullable=False)
    bank_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # Public bank identifier (US ABA routing number or local bank code).
    routing_number: Mapped[str] = mapped_column(String(34), nullable=False)
    # SENSITIVE — never returned by the API (only last 4 exposed).
    account_number: Mapped[str] = mapped_column(String(64), nullable=False)
    # "checking" | "savings"
    account_type: Mapped[str] = mapped_column(String(16), nullable=False, default="checking")
    country: Mapped[str] = mapped_column(String(2), nullable=False, default="US")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    def __repr__(self) -> str:
        return f"<BankAccount user_id={self.user_id!r} ****{self.account_number[-4:]}>"
