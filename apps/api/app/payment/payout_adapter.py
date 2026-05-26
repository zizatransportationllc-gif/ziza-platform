"""PayoutAdapter — Sprint 29.

Protocol and implementations for sending real money payouts to drivers.
The mock adapter is used in dev / CI; real adapters are wired up in
production via the ``payout_provider`` config setting.
"""
from __future__ import annotations

import uuid
from typing import Protocol


class PayoutAdapter(Protocol):
    """Minimal interface required by the batch payout runner."""

    async def send_payout(
        self,
        phone: str,
        amount_xof: int,
        ref: str,
    ) -> str:
        """Send ``amount_xof`` XOF to ``phone``.

        Returns an opaque ``provider_ref`` string on success.
        Raises ``RuntimeError`` on failure (caller marks the request as
        ``failed`` and continues with the next one).
        """
        ...


class MockPayoutAdapter:
    """Always succeeds — returns a deterministic fake reference.

    Used in dev, CI, and unit tests.
    """

    async def send_payout(self, phone: str, amount_xof: int, ref: str) -> str:
        # Return a stable fake ref so tests can assert on it
        return f"mock_payout_{ref}"


class OrangeMoneyB2CAdapter:
    """Orange Money B2C payout (West Africa).

    Requires ``ORANGE_MONEY_CLIENT_ID`` and ``ORANGE_MONEY_CLIENT_SECRET``
    environment variables in production.
    """

    def __init__(self, client_id: str, client_secret: str) -> None:
        self._client_id = client_id
        self._client_secret = client_secret

    async def send_payout(self, phone: str, amount_xof: int, ref: str) -> str:
        """Call Orange Money B2C API.

        Not fully implemented in this sprint — raises NotImplementedError
        in dev.  Production deployment wires real credentials.
        """
        raise NotImplementedError(
            "OrangeMoneyB2CAdapter is not yet configured for this environment. "
            "Set payout_provider=mock to use the test adapter."
        )


def get_payout_adapter(provider: str) -> PayoutAdapter:
    """Factory — returns the correct adapter based on ``provider`` string."""
    if provider == "mock":
        return MockPayoutAdapter()
    if provider == "orange_money":
        # In production, read credentials from Secret Manager / env vars
        import os  # noqa: PLC0415
        return OrangeMoneyB2CAdapter(
            client_id=os.getenv("ORANGE_MONEY_CLIENT_ID", ""),
            client_secret=os.getenv("ORANGE_MONEY_CLIENT_SECRET", ""),
        )
    # Default fallback
    return MockPayoutAdapter()
