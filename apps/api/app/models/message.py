"""Message model — Sprint 66 (in-app messaging)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Message(Base):
    """A chat message in a trip or craft-request conversation.

    Exactly one of ``trip_id`` / ``craft_request_id`` is set — it scopes the
    conversation to a ride (customer ↔ driver) or a road-side intervention
    (customer ↔ professional). ``sender_user_id`` is the User DB id.
    """

    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    trip_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True, index=True)
    craft_request_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True, index=True)
    sender_user_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    sender_role: Mapped[str] = mapped_column(String(32), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, index=True
    )
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<Message id={self.id!r} sender={self.sender_user_id!r}>"
