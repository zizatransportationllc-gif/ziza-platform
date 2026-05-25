"""Driver model — Sprint 4."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Driver(Base):
    """Driver profile linked to a User account.

    One-to-one with ``users``.  Created when a user with role="driver"
    completes on-boarding (Sprint 5+).
    """

    __tablename__ = "drivers"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    license_number: Mapped[str | None] = mapped_column(
        String(64), nullable=True
    )
    # active | inactive | suspended
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="active"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )

    def __repr__(self) -> str:
        return f"<Driver id={self.id!r} status={self.status!r}>"
