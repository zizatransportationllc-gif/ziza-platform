"""SavedPlace model — Sprint 20."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class SavedPlace(Base):
    """A named location saved by a user for quick re-use when booking.

    Each user can store up to 10 places.  ``label`` is a short tag such as
    "home", "work" or "other".  ``name`` is a free-form human-readable address.
    """

    __tablename__ = "saved_places"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # "home" | "work" | "other"
    label: Mapped[str] = mapped_column(String(32), nullable=False, default="other")
    # Human-readable address / place name
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )

    def __repr__(self) -> str:
        return f"<SavedPlace id={self.id!r} label={self.label!r} name={self.name!r}>"
