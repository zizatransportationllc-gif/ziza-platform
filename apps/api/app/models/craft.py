"""Craft models — Sprint 47 (Ziza Craft marketplace).

New role: 'professional'
Models:
  Professional  — profile linked to a User with role='professional'
  CraftRequest  — customer request for a professional intervention
  CraftBid      — professional's bid on a CraftRequest

Status flows:
  CraftRequest : open → bidding_closed → assigned → in_progress → completed | cancelled
  CraftBid     : pending → accepted | rejected
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


CRAFT_CATEGORIES = [
    "breakdown",    # General breakdown / car won't start
    "flat_tyre",    # Flat or punctured tire
    "tow",          # Towing to garage or safe location
    "fuel",         # Out of fuel — emergency delivery
    "lockout",      # Keys locked inside the vehicle
    "battery",      # Dead battery — jump-start or replacement
    "accident",     # Post-accident assistance / scene management
    "diagnostics",  # On-site electronic/OBD diagnostics
    "other",        # Any other vehicle intervention
]


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Professional(Base):
    """Professional service provider profile — Sprint 47.

    One-to-one with ``users``. Created when a user registers as a professional
    (role stays 'professional' after registration).
    """

    __tablename__ = "professionals"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    # Comma-separated list of CRAFT_CATEGORIES values
    specialties: Mapped[str] = mapped_column(
        String(512), nullable=False, default=""
    )
    bio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # active | inactive | suspended
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="active"
    )
    is_online: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0"
    )
    # Live position snapshot (updated when professional is online)
    current_lat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    current_lng: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # WS3 (Sprint 68) — Stripe Connect (Express) account for real payouts.
    stripe_account_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )


class CraftRequest(Base):
    """Customer request for a professional intervention — Sprint 47."""

    __tablename__ = "craft_requests"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    address: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    # open | bidding_closed | assigned | in_progress | completed | cancelled
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="open"
    )
    bid_deadline: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Stored as plain UUID — no FK constraint to avoid circular dependency
    # with craft_bids (both tables reference each other).
    selected_bid_id: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True)
    # Short code generated when a bid is selected, shown to both the customer
    # and the assigned professional so they can confirm they're meeting the
    # right person on site.
    verification_code: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    # Opaque token for the public "share this intervention" live page. Generated
    # on demand when the customer taps Share; lets a relative follow the job
    # (pro position + ETA) without an account. Distinct from verification_code,
    # which is a secret used on-site — never expose that publicly.
    share_token: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, unique=True, index=True)
    # Set when the customer's payment for the assistance is confirmed.
    paid_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )


class CraftPhoto(Base):
    """Before/after photo a professional attaches to a craft job."""

    __tablename__ = "craft_photos"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    request_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("craft_requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # "before" (initial situation) | "after" (resolution)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    # Canonical GCS object ref (or mock URL in dev) — read via signed_read_url
    url: Mapped[str] = mapped_column(String(1024), nullable=False)
    uploaded_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )


class CraftBid(Base):
    """Professional's bid on a CraftRequest — Sprint 47."""

    __tablename__ = "craft_bids"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    request_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("craft_requests.id", ondelete="CASCADE"), nullable=False
    )
    professional_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("professionals.id", ondelete="CASCADE"), nullable=False
    )
    # Price in USD cents (divide by 100 for display)
    price_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    # Estimated travel time to reach customer (minutes)
    eta_min: Mapped[int] = mapped_column(Integer, nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Professional GPS position at bid time (for distance calculation)
    professional_lat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    professional_lng: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # pending | accepted | rejected
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="pending"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
