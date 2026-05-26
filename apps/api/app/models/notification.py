"""Notification model — Sprint 18 → Sprint 26."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Notification(Base):
    """Notification delivered to a platform user.

    Persisted in DB; frontends poll GET /v1/notifications.
    Notifications are created automatically when key events occur:
      - trip accepted → customer notified
      - trip completed → customer notified
      - document approved/rejected → driver notified
      - payment confirmed → customer notified (Sprint 26)

    Sprint 26 additions: ``channel`` tracks the delivery channel
    (in_app | push | email | sms), and delivery status fields allow
    the dispatcher to record outcomes.
    """

    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # FK to users.id (UUID primary key)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # e.g. "trip_accepted", "trip_completed", "document_approved", "document_rejected"
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    read: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0"
    )
    # Sprint 26: delivery channel — "in_app" | "push" | "email" | "sms"
    channel: Mapped[str] = mapped_column(
        String(16), nullable=False, default="in_app", server_default="in_app"
    )
    # Sprint 26: external provider reference (FCM message ID, SendGrid ID …)
    provider_ref: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    # Sprint 26: delivery timestamps
    delivered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )
    failed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )
    retry_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
