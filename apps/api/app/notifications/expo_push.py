"""Expo Push Notification channel — Sprint 39.

Sends push notifications via the Expo Push Notification Service (no credentials
required). Works with ExponentPushToken[...] values registered by the
expo-notifications SDK on mobile clients.

The Expo service forwards to FCM (Android) and APNs (iOS) transparently,
so no google-services.json or Apple certificates are needed server-side.

API reference: https://docs.expo.dev/push-notifications/sending-notifications/
"""
from __future__ import annotations

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


class ExpoPushChannel:
    """Expo Push Notification channel.

    ``send()`` delivers a push notification to a single ExponentPushToken.
    Non-Expo tokens (native FCM tokens, email addresses, etc.) are silently
    skipped so the channel can coexist with email/SMS channels that share the
    same dispatcher call.
    """

    channel_name: str = "push"

    async def send(
        self,
        recipient: str,   # ExponentPushToken[...] or skip silently
        title: str,
        body: str,
        data: dict,
    ) -> str:
        """Send via the Expo Push API.  Returns the Expo ticket ID."""
        # Only handle Expo push tokens; let other channels handle emails/phones
        if not recipient.startswith("ExponentPushToken["):
            return "skipped"

        import httpx  # noqa: PLC0415

        payload = {
            "to": recipient,
            "title": title,
            "body": body,
            "data": data or {},
            "sound": "default",
            "priority": "high",
            "channelId": "default",   # Android notification channel
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                EXPO_PUSH_URL,
                json=payload,
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip, deflate",
                    "Content-Type": "application/json",
                },
            )
            resp.raise_for_status()
            result = resp.json()

        tickets = result.get("data", [])
        ticket = tickets[0] if tickets else {}
        if ticket.get("status") == "error":
            raise RuntimeError(
                f"Expo push error: {ticket.get('message', 'unknown')}"
            )

        return ticket.get("id", "ok")
