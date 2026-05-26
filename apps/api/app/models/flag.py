"""FeatureFlag and InviteCode models — Sprint 31.

FeatureFlag: named boolean toggle with optional rollout percentage.
InviteCode: one-time-use UUID for the closed beta phase.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class FeatureFlag(Base):
    __tablename__ = "feature_flags"

    name: Mapped[str] = mapped_column(String(64), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    rollout_pct: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )


class InviteCode(Base):
    __tablename__ = "invite_codes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    max_uses: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    used_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


# Default feature flags to seed on first use
DEFAULT_FLAGS = [
    {"name": "payment_enabled",     "enabled": True,  "rollout_pct": 100, "description": "CinetPay / Stripe payment flow"},
    {"name": "mobile_app_enabled",  "enabled": True,  "rollout_pct": 100, "description": "React Native mobile apps"},
    {"name": "driver_apply_enabled","enabled": True,  "rollout_pct": 100, "description": "Driver application workflow"},
    {"name": "batch_payout_enabled","enabled": True,  "rollout_pct": 100, "description": "Admin batch payout runner"},
    {"name": "beta_invite_only",    "enabled": False, "rollout_pct": 0,   "description": "Restrict new signups to invite codes"},
]
