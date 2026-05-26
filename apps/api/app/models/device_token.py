"""DeviceToken model — Sprint 26.

Stores FCM / web-push device tokens so the notification dispatcher
can deliver push messages to authenticated users across platforms.

One user may have multiple tokens (web, iOS, Android).
Tokens are unique across the platform; re-registering the same token
is idempotent (upsert by token value).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class DeviceToken(Base):
    """FCM / web-push device token for a platform user.

    ``token`` is the raw FCM registration token or Web Push endpoint.
    ``platform`` indicates the originating client: ``web`` | ``ios`` | ``android``.
    """

    __tablename__ = "device_tokens"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    platform: Mapped[str] = mapped_column(
        String(16), nullable=False, default="web", server_default="web"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
