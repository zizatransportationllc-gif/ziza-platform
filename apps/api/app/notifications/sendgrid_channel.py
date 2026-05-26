"""SendGrid email notification channel — Sprint 26.

Sends transactional emails via the SendGrid API.

Prerequisites (production):
  - ``sendgrid`` Python package installed.
  - ``sendgrid_api_key`` set in settings.
  - ``sendgrid_from_email`` set in settings (e.g. "noreply@ziza.ci").

The ``recipient`` parameter is the user's email address.
"""
from __future__ import annotations


class SendGridChannel:
    """SendGrid transactional email channel.

    ``send()`` delivers an HTML/plain-text email and returns the
    SendGrid X-Message-Id header on success.
    """

    channel_name: str = "email"

    def __init__(self, api_key: str = "", from_email: str = "noreply@ziza.ci") -> None:
        self._api_key = api_key
        self._from_email = from_email

    async def send(
        self,
        recipient: str,   # user email address
        title: str,
        body: str,
        data: dict,
    ) -> str:
        """Send an email via SendGrid.  Returns the message ID."""
        try:
            from sendgrid import SendGridAPIClient  # noqa: PLC0415
            from sendgrid.helpers.mail import Mail  # noqa: PLC0415
        except ImportError as exc:
            raise RuntimeError("sendgrid package is not installed") from exc

        mail = Mail(
            from_email=self._from_email,
            to_emails=recipient,
            subject=title,
            plain_text_content=body,
        )
        sg = SendGridAPIClient(self._api_key)
        # Use synchronous client — wrap in executor for true async if needed
        response = sg.send(mail)
        msg_id = response.headers.get("X-Message-Id", "unknown")
        return msg_id
