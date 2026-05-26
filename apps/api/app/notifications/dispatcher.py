"""Notification dispatcher — Sprint 26.

Central orchestrator for multi-channel notification delivery.

Architecture
------------
- Module-level ``_channels`` list holds registered ``NotificationChannel``
  instances (FCM, SendGrid, AfricasTalking, or MockChannel in tests).
- ``dispatch_external()`` is fire-and-forget: it never raises, so a channel
  failure never breaks the business operation that triggered it.
- Each external delivery creates its own Notification row in the DB so the
  frontend can see the delivery history per channel.

Test isolation
--------------
Tests register a ``MockChannel`` before the operation and inspect
``MockChannel.sent`` after::

    from app.notifications.mock import MockChannel
    from app.notifications.dispatcher import register_channel, clear_channels

    MockChannel.sent.clear()
    clear_channels()
    register_channel(MockChannel())

    # … run the operation …

    assert any(n["title"] == "🚗 Chauffeur en route" for n in MockChannel.sent)

Configuration
-------------
In production, channels are registered at startup in ``app/main.py``
based on ``settings``:
  - ``settings.sendgrid_api_key`` → register SendGridChannel
  - ``settings.africas_talking_api_key`` → register AfricasTalkingChannel
  - FCM: always attempted (uses firebase-admin credentials from Sprint 3).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Module-level channel registry
# ---------------------------------------------------------------------------

_channels: list = []


def register_channel(channel) -> None:
    """Add a channel to the dispatcher registry."""
    _channels.append(channel)


def clear_channels() -> None:
    """Remove all registered channels (used in tests for isolation)."""
    _channels.clear()


def get_channels() -> list:
    """Return a snapshot of the currently registered channels."""
    return list(_channels)


# ---------------------------------------------------------------------------
# External dispatch (fire-and-forget)
# ---------------------------------------------------------------------------

async def dispatch_external(
    db,                         # AsyncSession
    user_uuid: uuid.UUID,       # users.id
    recipient: str,             # email or FCM token — channel-dependent
    event_type: str,
    title: str,
    body: str,
    data: dict | None = None,
) -> None:
    """Dispatch an event to all registered external channels.

    This function never raises.  Channel failures are recorded on the
    Notification row (``failed_at``, ``retry_count``) but do not propagate.

    For channels that need a device token (push) ``recipient`` should be
    the FCM token; for email/SMS it should be the user's email / phone.
    The caller (CRUD) resolves the correct identifier before calling this.

    Each channel creates its own Notification row so the history is
    per-channel in the DB.
    """
    if not _channels:
        return

    from app.models.notification import Notification  # noqa: PLC0415 (avoid circular)

    now = datetime.now(timezone.utc)
    payload = data or {}

    for channel in _channels:
        notif = Notification(
            user_id=user_uuid,
            type=event_type,
            title=title,
            body=body,
            channel=channel.channel_name,
        )
        try:
            provider_ref = await channel.send(recipient, title, body, payload)
            notif.provider_ref = provider_ref
            notif.delivered_at = now
        except Exception:
            notif.failed_at = now
            notif.retry_count = 1

        try:
            db.add(notif)
            await db.commit()
        except Exception:
            await db.rollback()
