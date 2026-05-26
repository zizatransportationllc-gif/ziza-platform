"""AfricasTalking SMS notification channel — Sprint 26.

Sends SMS messages via the AfricasTalking API, which has strong coverage
across West Africa (Ivory Coast, Senegal, Ghana, Nigeria, Kenya, …).

Prerequisites (production):
  - ``africastalking`` Python package installed.
  - ``africas_talking_api_key`` and ``africas_talking_username`` set in settings.

The ``recipient`` parameter is the user's phone number in E.164 format
(e.g. "+2250700000000" for a Côte d'Ivoire number).
"""
from __future__ import annotations


class AfricasTalkingChannel:
    """AfricasTalking SMS channel.

    ``send()`` delivers an SMS and returns the provider's messageId.
    """

    channel_name: str = "sms"

    def __init__(self, api_key: str = "", username: str = "sandbox") -> None:
        self._api_key = api_key
        self._username = username

    async def send(
        self,
        recipient: str,   # phone number in E.164 format
        title: str,
        body: str,
        data: dict,
    ) -> str:
        """Send an SMS via AfricasTalking.  Returns the first message ID."""
        try:
            import africastalking  # noqa: PLC0415
        except ImportError as exc:
            raise RuntimeError("africastalking package is not installed") from exc

        africastalking.initialize(self._username, self._api_key)
        sms = africastalking.SMS
        # body is the SMS text (title + " — " + body to stay under 160 chars)
        message = f"{title} — {body}"[:160]
        response = sms.send(message, [recipient])
        recipients_data = response.get("SMSMessageData", {}).get("Recipients", [])
        if recipients_data:
            return recipients_data[0].get("messageId", "unknown")
        return "unknown"
