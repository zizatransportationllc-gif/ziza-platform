"""PromoCode model — Sprint 14."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class PromoCode(Base):
    """Promotional discount code redeemable at trip booking.

    Lifecycle: active=True → customer books with code → uses++ →
    optionally deactivated by admin (active=False).
    """

    __tablename__ = "promo_codes"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    # Uppercase code, e.g. "ZIZA10"
    code: Mapped[str] = mapped_column(
        String(32), unique=True, nullable=False, index=True
    )
    # Discount expressed in whole percent (e.g. 10 = 10%)
    discount_pct: Mapped[int] = mapped_column(Integer, nullable=False)
    # None = unlimited uses
    max_uses: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Incremented atomically each time the code is applied
    uses: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )

    def __repr__(self) -> str:
        return f"<PromoCode code={self.code!r} pct={self.discount_pct} active={self.active}>"
