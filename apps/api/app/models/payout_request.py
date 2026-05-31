"""PayoutRequest and CommissionSetting models — Sprint 15 → Sprint 29.

PayoutRequest: a driver requests withdrawal of accumulated earnings.
CommissionSetting: configurable platform commission rate per vehicle category.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Sprint 29 — Commission settings
# ---------------------------------------------------------------------------

#: Categories recognised by the commission system.
COMMISSION_CATEGORIES = frozenset(
    {"economy", "comfort", "premium", "default"}
)


class CommissionSetting(Base):
    """Platform commission rate per vehicle / service category.

    rate_pct is an integer percentage, e.g. 15 = 15%.
    One row per category; upserted by admin via POST /v1/admin/commission.
    """

    __tablename__ = "commission_settings"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    # "economy" | "comfort" | "premium" | "default"
    category: Mapped[str] = mapped_column(
        String(32), nullable=False, unique=True, index=True
    )
    # Integer percentage, e.g. 15 = 15%
    rate_pct: Mapped[int] = mapped_column(Integer, nullable=False, default=15)
    effective_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    def __repr__(self) -> str:
        return (
            f"<CommissionSetting category={self.category!r} rate={self.rate_pct}%>"
        )


class PayoutRequest(Base):
    """A driver's request to withdraw earnings.

    Lifecycle: pending → approved | rejected  (admin action).
    """

    __tablename__ = "payout_requests"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    driver_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("drivers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    amount_xof: Mapped[int] = mapped_column(Integer, nullable=False)
    # pending | approved | rejected | processed | failed
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="pending", server_default="pending"
    )
    # Optional admin note (reason for rejection, etc.)
    note_admin: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Sprint 29 — commission and batch payout fields
    commission_xof: Mapped[int | None] = mapped_column(Integer, nullable=True)
    net_amount_xof: Mapped[int | None] = mapped_column(Integer, nullable=True)
    provider_ref: Mapped[str | None] = mapped_column(String(128), nullable=True)
    processed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    def __repr__(self) -> str:
        return (
            f"<PayoutRequest id={self.id!r} amount={self.amount_xof} "
            f"status={self.status!r}>"
        )
