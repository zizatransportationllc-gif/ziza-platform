"""Sprint 56 — Onboarding email notification tests (10 tests).

Verifies that the correct email events are fired when:
  - A driver submits their first KYC document (application_submitted)
  - An admin approves a document (document_approved)
  - An admin requests resubmission (document_needs_resubmission)
  - An admin rejects a document (document_rejected)
  - An admin approves a driver application (application_approved)
  - An admin rejects a driver application (application_rejected)
  - A customer submits a driver application form (application_submitted)

Uses MockChannel to capture outgoing notifications without real network calls.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.notifications.mock import MockChannel
from app.notifications.dispatcher import register_channel, clear_channels

client = TestClient(app)

SAMPLE_URL = "https://storage.ziza.dev/docs/test-001.jpg"

VALID_APPLICATION = {
    "full_name": "Test Applicant",
    "phone": "+22507111222",
    "license_number": "LIC-56001",
    "vehicle_make": "Kia",
    "vehicle_model": "Sportage",
    "vehicle_plate": "SP 5600 CI",
    "vehicle_year": 2022,
    "vehicle_category": "economy",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _tok(email: str) -> str:
    r = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _setup_driver(email: str = "driver@ziza.dev") -> str:
    tok = _tok(email)
    client.post("/v1/auth/register", headers=_h(tok))
    client.post("/v1/drivers/register", headers=_h(tok))
    return tok


def _setup_admin(email: str = "admin@ziza.dev") -> str:
    tok = _tok(email)
    client.post("/v1/auth/register", headers=_h(tok))
    return tok


def _setup_customer(email: str = "customer@ziza.dev") -> str:
    tok = _tok(email)
    client.post("/v1/auth/register", headers=_h(tok))
    return tok


def _with_mock_channel():
    """Register a fresh MockChannel and return it; clears the channel registry."""
    MockChannel.sent.clear()
    clear_channels()
    channel = MockChannel()
    register_channel(channel)
    return channel


def _teardown_channel():
    """Remove test channels so other tests are unaffected."""
    clear_channels()
    MockChannel.sent.clear()


# ---------------------------------------------------------------------------
# Document submission → application_submitted
# ---------------------------------------------------------------------------

def test_first_document_submission_fires_application_submitted():
    """Submitting the first KYC document fires an application_submitted notification."""
    channel = _with_mock_channel()
    try:
        d_tok = _setup_driver()
        r = client.post(
            "/v1/drivers/me/documents",
            headers=_h(d_tok),
            json={"type": "license", "url": SAMPLE_URL},
        )
        assert r.status_code == 201, r.text
        types = [n["data"].get("event_type", "") for n in MockChannel.sent]
        assert "application_submitted" in types, f"Sent: {types}"
    finally:
        _teardown_channel()


def test_second_document_submission_does_not_refire_submitted():
    """Submitting a second document must NOT fire application_submitted again."""
    channel = _with_mock_channel()
    try:
        d_tok = _setup_driver()
        client.post("/v1/drivers/me/documents",
                    headers=_h(d_tok), json={"type": "license", "url": SAMPLE_URL})
        MockChannel.sent.clear()  # reset after first submission

        client.post("/v1/drivers/me/documents",
                    headers=_h(d_tok), json={"type": "insurance", "url": SAMPLE_URL})

        types = [n["data"].get("event_type", "") for n in MockChannel.sent]
        assert "application_submitted" not in types, "Should not re-fire on 2nd submission"
    finally:
        _teardown_channel()


# ---------------------------------------------------------------------------
# Admin document review notifications
# ---------------------------------------------------------------------------

def test_admin_approve_document_fires_document_approved():
    """Admin approving a document fires a document_approved notification."""
    channel = _with_mock_channel()
    try:
        d_tok = _setup_driver()
        a_tok = _setup_admin()
        # Submit doc
        r = client.post("/v1/drivers/me/documents",
                        headers=_h(d_tok), json={"type": "registration", "url": SAMPLE_URL})
        doc_id = r.json()["document_id"]
        MockChannel.sent.clear()

        client.patch(f"/v1/admin/documents/{doc_id}/status",
                     headers=_h(a_tok), json={"status": "approved"})

        types = [n["data"].get("event_type", "") for n in MockChannel.sent]
        assert "document_approved" in types, f"Sent: {types}"
    finally:
        _teardown_channel()


def test_admin_needs_resubmission_fires_correct_notification():
    """Admin flagging needs_resubmission fires a document_needs_resubmission notification."""
    channel = _with_mock_channel()
    try:
        d_tok = _setup_driver()
        a_tok = _setup_admin()
        r = client.post("/v1/drivers/me/documents",
                        headers=_h(d_tok), json={"type": "id_card", "url": SAMPLE_URL})
        doc_id = r.json()["document_id"]
        MockChannel.sent.clear()

        client.patch(
            f"/v1/admin/documents/{doc_id}/status",
            headers=_h(a_tok),
            json={"status": "needs_resubmission", "note_admin": "Photo obscure"},
        )

        types = [n["data"].get("event_type", "") for n in MockChannel.sent]
        assert "document_needs_resubmission" in types, f"Sent: {types}"
    finally:
        _teardown_channel()


def test_admin_reject_document_fires_document_rejected():
    """Admin rejecting a document fires a document_rejected notification."""
    channel = _with_mock_channel()
    try:
        d_tok = _setup_driver()
        a_tok = _setup_admin()
        r = client.post("/v1/drivers/me/documents",
                        headers=_h(d_tok), json={"type": "insurance", "url": SAMPLE_URL})
        doc_id = r.json()["document_id"]
        MockChannel.sent.clear()

        client.patch(f"/v1/admin/documents/{doc_id}/status",
                     headers=_h(a_tok), json={"status": "rejected", "note_admin": "Expiré"})

        types = [n["data"].get("event_type", "") for n in MockChannel.sent]
        assert "document_rejected" in types, f"Sent: {types}"
    finally:
        _teardown_channel()


# ---------------------------------------------------------------------------
# Application form (Sprint 30) notifications
# ---------------------------------------------------------------------------

def test_submit_application_form_fires_application_submitted():
    """Customer submitting a driver application form fires application_submitted."""
    channel = _with_mock_channel()
    try:
        c_tok = _setup_customer()
        r = client.post("/v1/drivers/apply", headers=_h(c_tok), json=VALID_APPLICATION)
        # 201 on first submit or 409 if already exists from another test
        assert r.status_code in (201, 409), r.text
        if r.status_code == 201:
            types = [n["data"].get("event_type", "") for n in MockChannel.sent]
            assert "application_submitted" in types, f"Sent: {types}"
    finally:
        _teardown_channel()


def test_admin_approve_application_fires_application_approved():
    """Admin approving an application fires an application_approved notification."""
    channel = _with_mock_channel()
    try:
        c_tok = _setup_customer()
        a_tok = _setup_admin()
        r = client.post("/v1/drivers/apply", headers=_h(c_tok), json=VALID_APPLICATION)
        if r.status_code == 201:
            app_id = r.json()["application_id"]
        else:
            # existing application — get its ID
            st = client.get("/v1/drivers/apply/status", headers=_h(c_tok))
            app_id = st.json()["application_id"]

        MockChannel.sent.clear()
        client.patch(f"/v1/admin/applications/{app_id}/review",
                     headers=_h(a_tok), json={"status": "approved"})

        types = [n["data"].get("event_type", "") for n in MockChannel.sent]
        assert "application_approved" in types, f"Sent: {types}"
    finally:
        _teardown_channel()


def test_admin_reject_application_fires_application_rejected():
    """Admin rejecting an application fires an application_rejected notification."""
    channel = _with_mock_channel()
    try:
        c_tok = _setup_customer()
        a_tok = _setup_admin()
        r = client.post("/v1/drivers/apply", headers=_h(c_tok), json=VALID_APPLICATION)
        if r.status_code == 201:
            app_id = r.json()["application_id"]
        else:
            st = client.get("/v1/drivers/apply/status", headers=_h(c_tok))
            app_id = st.json()["application_id"]

        MockChannel.sent.clear()
        client.patch(
            f"/v1/admin/applications/{app_id}/review",
            headers=_h(a_tok),
            json={"status": "rejected", "notes_admin": "Dossier incomplet"},
        )

        types = [n["data"].get("event_type", "") for n in MockChannel.sent]
        assert "application_rejected" in types, f"Sent: {types}"
    finally:
        _teardown_channel()


# ---------------------------------------------------------------------------
# Email template unit tests
# ---------------------------------------------------------------------------

def test_email_templates_return_html():
    """email_templates.get_html_for_event returns non-empty HTML for all 4 events."""
    from app.notifications.email_templates import get_html_for_event

    events = [
        ("application_submitted", {}, True),
        ("application_approved", {"user_name": "Alice"}, True),
        ("application_rejected", {"user_name": "Bob", "reason": "Doc expired"}, True),
        ("document_needs_resubmission", {"doc_type": "license", "note": "Blurry"}, True),
        ("some_other_event", {}, False),  # unknown event → None
    ]
    for event_type, extra_data, expect_html in events:
        data = {"event_type": event_type, **extra_data}
        html = get_html_for_event(event_type, "title", "body", data)
        if expect_html:
            assert html is not None and "<!DOCTYPE html>" in html, \
                f"Expected HTML for {event_type}"
        else:
            assert html is None, f"Expected None for {event_type}"
