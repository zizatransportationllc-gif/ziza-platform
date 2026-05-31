"""DriverCapability model — Sprint 10."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class DriverCapability(Base):
    """Records driver capability types (legacy table, kept for schema compatibility).

    One row per (driver_id, type) pair.
    """

    __tablename__ = "driver_capabilities"
    __table_args__ = (
        UniqueConstraint("driver_id", "type", name="uq_driver_type"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    driver_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("drivers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )

    def __repr__(self) -> str:
        return f"<DriverCapability driver_id={self.driver_id!r} type={self.type!r}>"
