"""Firebase Cloud Messaging (FCM) notification channel — Sprint 26.

Sends push notifications to mobile / web clients via FCM using the
``firebase-admin`` SDK.

Prerequisites (production):
  - ``firebase-admin`` installed (it is already a transitive dependency
    via the FirebaseAdapter in Sprint 3).
  - ``fcm_credentials_json`` set in settings (path to service-account JSON
    or the JSON content itself as a string).
  - Device token registered via ``POST /v1/devices/register``.

The ``recipient`` parameter is the raw FCM registration token stored in
``device_tokens.token``.
"""
from __future__ import annotations


class FCMChannel:
    """Firebase Cloud Messaging channel.

    ``send()`` delivers a single push message to one FCM device token.
    It returns the FCM message ID on success.

    When no firebase-admin credentials are available (dev / CI) it raises
    an ImportError which the dispatcher converts to a failed notification
    (retry_count++, failed_at set).
    """

    channel_name: str = "push"

    def __init__(self, credentials_json: str = "") -> None:
        self._credentials_json = credentials_json

    async def send(
        self,
        recipient: str,   # FCM registration token
        title: str,
        body: str,
        data: dict,
    ) -> str:
        """Send a push notification via FCM.  Returns the FCM message ID."""
        try:
            import firebase_admin  # noqa: PLC0415
            from firebase_admin import messaging  # noqa: PLC0415
        except ImportError as exc:
            raise RuntimeError("firebase-admin is not installed") from exc

        message = messaging.Message(
            notification=messaging.Notification(title=title, body=body),
            data={k: str(v) for k, v in (data or {}).items()},
            token=recipient,
            android=messaging.AndroidConfig(priority="high"),
            apns=messaging.APNSConfig(
                headers={"apns-priority": "10"},
            ),
        )
        response = messaging.send(message)
        return response  # FCM message ID string
