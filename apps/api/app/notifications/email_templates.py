"""Transactional email HTML templates — Sprint 56.

Each function returns a complete HTML string suitable for use as the
html_content of a SendGrid / MIME message.

Supported event types:
  application_submitted        — confirmation when user submits first KYC doc or application form
  application_approved         — account activated after admin validation
  application_rejected         — application refused with optional reason
  document_needs_resubmission  — a specific document must be replaced

Design: minimal inline-CSS, renders correctly in Gmail / Outlook / Apple Mail.
Language: English (platform standard).
"""
from __future__ import annotations

_BRAND_COLOR = "#1A56DB"   # Ziza blue
_WARN_COLOR  = "#F05252"   # Ziza red / rejection
_OK_COLOR    = "#0E9F6E"   # Ziza green / approval
_ORANGE      = "#FF8A4C"   # needs_resubmission highlight


def _wrap(content: str, preheader: str = "") -> str:
    """Wrap content in the shared Ziza email shell."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Ziza</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif;">
  {'<span style="display:none;max-height:0;overflow:hidden;">' + preheader + '</span>' if preheader else ''}
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
        <!-- Header -->
        <tr>
          <td style="background:{_BRAND_COLOR};padding:24px 32px;">
            <span style="color:#fff;font-size:22px;font-weight:700;letter-spacing:.5px;">🚗 Ziza</span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px 32px 24px;">
            {content}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#F9FAFB;padding:16px 32px;border-top:1px solid #E5E7EB;">
            <p style="margin:0;font-size:12px;color:#9CA3AF;">
              This email was sent by Ziza. If you did not request this, please ignore it.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def application_submitted(user_name: str = "") -> str:
    """Email sent when a driver or professional submits their first KYC document."""
    greeting = f"Hello{' ' + user_name if user_name else ''},"
    content = f"""
      <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">📋 Application received</h2>
      <p style="margin:0 0 12px;font-size:15px;color:#374151;">{greeting}</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;">
        Thank you for submitting your documents. Our team will review your application
        within <strong>24 to 48 hours</strong>.
      </p>
      <p style="margin:0 0 24px;font-size:15px;color:#374151;">
        You will receive an email as soon as a decision is made.
        In the meantime, you can check your document status in the app.
      </p>
      <table cellpadding="0" cellspacing="0">
        <tr>
          <td style="background:{_BRAND_COLOR};border-radius:6px;padding:12px 24px;">
            <span style="color:#fff;font-size:15px;font-weight:600;">Open the app</span>
          </td>
        </tr>
      </table>
    """
    return _wrap(content, preheader="Your application is under review — we'll get back to you shortly.")


def application_approved(user_name: str = "") -> str:
    """Email sent when admin approves a driver or professional account."""
    greeting = f"Hello{' ' + user_name if user_name else ''},"
    content = f"""
      <h2 style="margin:0 0 16px;font-size:20px;color:{_OK_COLOR};">✅ Account activated!</h2>
      <p style="margin:0 0 12px;font-size:15px;color:#374151;">{greeting}</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;">
        Great news — your application has been <strong>approved</strong>.
        Your account is now active and you can start accepting requests on Ziza.
      </p>
      <p style="margin:0 0 24px;font-size:15px;color:#374151;">
        Open the app, go online, and start earning!
      </p>
      <table cellpadding="0" cellspacing="0">
        <tr>
          <td style="background:{_OK_COLOR};border-radius:6px;padding:12px 24px;">
            <span style="color:#fff;font-size:15px;font-weight:600;">Start now →</span>
          </td>
        </tr>
      </table>
    """
    return _wrap(content, preheader="Your Ziza account is now active — start accepting requests!")


def application_rejected(user_name: str = "", reason: str = "") -> str:
    """Email sent when admin rejects a driver or professional application."""
    greeting = f"Hello{' ' + user_name if user_name else ''},"
    reason_block = ""
    if reason:
        reason_block = f"""
      <div style="background:#FEF2F2;border-left:4px solid {_WARN_COLOR};
                  padding:12px 16px;border-radius:0 4px 4px 0;margin:0 0 20px;">
        <p style="margin:0;font-size:14px;color:#991B1B;"><strong>Reason:</strong> {reason}</p>
      </div>"""
    content = f"""
      <h2 style="margin:0 0 16px;font-size:20px;color:{_WARN_COLOR};">❌ Application not approved</h2>
      <p style="margin:0 0 12px;font-size:15px;color:#374151;">{greeting}</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;">
        After reviewing your application, we are unable to approve your account at this time.
      </p>
      {reason_block}
      <p style="margin:0 0 24px;font-size:15px;color:#374151;">
        If you have questions or believe this is a mistake, please contact our support team.
      </p>
      <table cellpadding="0" cellspacing="0">
        <tr>
          <td style="background:#6B7280;border-radius:6px;padding:12px 24px;">
            <span style="color:#fff;font-size:15px;font-weight:600;">Contact support</span>
          </td>
        </tr>
      </table>
    """
    return _wrap(content, preheader="Update on your Ziza application.")


def document_needs_resubmission(
    user_name: str = "",
    doc_type: str = "",
    note: str = "",
) -> str:
    """Email sent when admin flags a specific document for resubmission."""
    greeting = f"Hello{' ' + user_name if user_name else ''},"
    doc_label = doc_type.replace("_", " ").title() if doc_type else "document"
    note_block = ""
    if note:
        note_block = f"""
      <div style="background:#FFF7ED;border-left:4px solid {_ORANGE};
                  padding:12px 16px;border-radius:0 4px 4px 0;margin:0 0 20px;">
        <p style="margin:0;font-size:14px;color:#92400E;"><strong>Admin note:</strong> {note}</p>
      </div>"""
    content = f"""
      <h2 style="margin:0 0 16px;font-size:20px;color:{_ORANGE};">🔄 Action required — document update</h2>
      <p style="margin:0 0 12px;font-size:15px;color:#374151;">{greeting}</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;">
        One of your documents requires attention:
      </p>
      <div style="background:#F3F4F6;border-radius:6px;padding:12px 20px;margin:0 0 16px;
                  font-size:15px;color:#111827;font-weight:600;">
        📄 {doc_label}
      </div>
      {note_block}
      <p style="margin:0 0 24px;font-size:15px;color:#374151;">
        Please upload a new version of this document in the app to continue your application.
      </p>
      <table cellpadding="0" cellspacing="0">
        <tr>
          <td style="background:{_ORANGE};border-radius:6px;padding:12px 24px;">
            <span style="color:#fff;font-size:15px;font-weight:600;">Upload new document →</span>
          </td>
        </tr>
      </table>
    """
    return _wrap(content, preheader=f"Please resubmit your {doc_label} — action required.")


# ---------------------------------------------------------------------------
# Public router
# ---------------------------------------------------------------------------

def get_html_for_event(
    event_type: str,
    title: str,  # noqa: ARG001 — kept for signature parity
    body: str,   # noqa: ARG001
    data: dict,
) -> str | None:
    """Return an HTML email body for onboarding events, or None for generic events.

    Called by SendGridChannel.send() — it passes ``data`` from the notification
    dispatcher, which always contains at least ``{"event_type": event_type}``.
    """
    user_name: str = data.get("user_name", "")

    if event_type == "application_submitted":
        return application_submitted(user_name=user_name)

    if event_type == "application_approved":
        return application_approved(user_name=user_name)

    if event_type == "application_rejected":
        return application_rejected(
            user_name=user_name,
            reason=data.get("reason", ""),
        )

    if event_type == "document_needs_resubmission":
        return document_needs_resubmission(
            user_name=user_name,
            doc_type=data.get("doc_type", ""),
            note=data.get("note", ""),
        )

    return None
