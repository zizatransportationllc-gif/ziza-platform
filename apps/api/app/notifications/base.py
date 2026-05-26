"""Notification channel protocol — Sprint 26.

Every external notification channel (FCM, email, SMS) must implement
the ``NotificationChannel`` protocol so the dispatcher can call them
uniformly.
"""
from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class NotificationChannel(Protocol):
    """Async interface for an external notification delivery channel.

    ``channel_name`` is a short identifier stored on the Notification row
    (e.g. ``"push"``, ``"email"``, ``"sms"``).

    ``send()`` delivers the message and returns a provider-side reference
    string (e.g. FCM message ID, SendGrid ID).  On failure it should raise
    an exception — the dispatcher catches it and records ``failed_at``.
    """

    channel_name: str  # class-level attribute

    async def send(
        self,
        recipient: str,       # email address or FCM token, depending on channel
        title: str,
        body: str,
        data: dict,           # arbitrary extra payload (trip_id, event_type …)
    ) -> str:
        """Deliver the notification.  Return a provider reference string."""
        ...
