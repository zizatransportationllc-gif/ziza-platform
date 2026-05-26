"""Mock notification channel — Sprint 26.

Used in tests and when no external channel credentials are configured.
All sent notifications are recorded in a class-level list so tests can
assert on them.

Usage in tests::

    from app.notifications.mock import MockChannel
    from app.notifications.dispatcher import register_channel, clear_channels

    # In a pytest fixture or setup:
    MockChannel.sent.clear()
    clear_channels()
    register_channel(MockChannel())

    # After the operation under test:
    assert len(MockChannel.sent) >= 1
    assert MockChannel.sent[0]["title"] == "🚗 Chauffeur en route"
"""
from __future__ import annotations


class MockChannel:
    """In-memory notification channel that records every sent call.

    ``MockChannel.sent`` is a class-level list shared across all instances.
    Clear it with ``MockChannel.sent.clear()`` between test cases.
    """

    channel_name: str = "mock"

    #: Class-level store of every sent notification (survives instance GC).
    sent: list[dict] = []

    async def send(
        self,
        recipient: str,
        title: str,
        body: str,
        data: dict,
    ) -> str:
        entry = {
            "recipient": recipient,
            "title": title,
            "body": body,
            "data": data,
        }
        MockChannel.sent.append(entry)
        return f"mock-{len(MockChannel.sent)}"
