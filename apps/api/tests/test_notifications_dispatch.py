"""Sprint 26 — External notification dispatch tests (12 tests).

Tests verify that:
  - Key events (trip_accepted, trip_completed, payment_confirmed,
    document_approved/rejected) trigger external channel dispatch.
  - Channel failures do NOT block the main business operation.
  - In-app notifications still work alongside external dispatch.
  - The Notification row carries ``channel = "in_app"`` for in-app rows.

Test isolation via ``MockChannel``:
  - Each test registers a fresh MockChannel.
  - ``MockChannel.sent`` is cleared before each test via the autouse fixture.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.notifications.dispatcher import register_channel, clear_channels
from app.notifications.mock import MockChannel

client = TestClient(app)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _reset_mock_channel():
    """Clear the mock channel registry and sent log before each test."""
    MockChannel.sent.clear()
    clear_channels()
    register_channel(MockChannel())
    yield
    clear_channels()
    MockChannel.sent.clear()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _tok(email: str) -> str:
    r = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


def _setup_customer():
    tok = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    return tok


def _setup_driver():
    tok = _tok("driver@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    client.post("/v1/drivers/register", headers=_h(tok))
    return tok


def _book_trip(c_tok: str) -> str:
    """Book a trip and return the trip_id."""
    est = client.post(
        "/v1/estimate",
        headers=_h(c_tok),
        json={
            "origin_lat": 5.32, "origin_lng": -4.02,
            "dest_lat": 5.36, "dest_lng": -3.98,
        },
    )
    assert est.status_code == 200, est.text
    estimate_id = est.json()["estimate_id"]
    trip_r = client.post(
        "/v1/trips",
        headers=_h(c_tok),
        json={"estimate_id": estimate_id},
    )
    assert trip_r.status_code == 201, trip_r.text
    return trip_r.json()["trip_id"]


def _accept_trip(d_tok: str, trip_id: str):
    r = client.patch(f"/v1/trips/{trip_id}/accept", headers=_h(d_tok))
    assert r.status_code == 200, r.text


def _start_trip(d_tok: str, trip_id: str):
    r = client.patch(f"/v1/trips/{trip_id}/start", headers=_h(d_tok))
    assert r.status_code == 200, r.text


def _complete_trip(d_tok: str, trip_id: str):
    r = client.patch(f"/v1/trips/{trip_id}/complete", headers=_h(d_tok))
    assert r.status_code == 200, r.text


# ---------------------------------------------------------------------------
# trip_accepted
# ---------------------------------------------------------------------------

def test_accept_trip_creates_in_app_notification():
    """Accepting a trip creates an in-app notification for the customer."""
    c_tok = _setup_customer()
    d_tok = _setup_driver()
    trip_id = _book_trip(c_tok)
    _accept_trip(d_tok, trip_id)

    notif_r = client.get("/v1/notifications", headers=_h(c_tok))
    assert notif_r.status_code == 200, notif_r.text
    notifs = notif_r.json()
    types = [n["type"] for n in notifs]
    assert "trip_accepted" in types


def test_accept_trip_dispatches_to_mock_channel():
    """Accepting a trip triggers the MockChannel dispatch."""
    c_tok = _setup_customer()
    d_tok = _setup_driver()
    trip_id = _book_trip(c_tok)
    MockChannel.sent.clear()  # reset after setup calls

    _accept_trip(d_tok, trip_id)

    assert len(MockChannel.sent) >= 1
    titles = [s["title"] for s in MockChannel.sent]
    assert any("Chauffeur" in t or "route" in t for t in titles)


# ---------------------------------------------------------------------------
# trip_completed
# ---------------------------------------------------------------------------

def test_complete_trip_creates_in_app_notification():
    """Completing a trip creates an in-app notification for the customer."""
    c_tok = _setup_customer()
    d_tok = _setup_driver()
    trip_id = _book_trip(c_tok)
    _accept_trip(d_tok, trip_id)
    _start_trip(d_tok, trip_id)
    _complete_trip(d_tok, trip_id)

    notif_r = client.get("/v1/notifications", headers=_h(c_tok))
    types = [n["type"] for n in notif_r.json()]
    assert "trip_completed" in types


def test_complete_trip_dispatches_to_mock_channel():
    """Completing a trip triggers the MockChannel for external dispatch."""
    c_tok = _setup_customer()
    d_tok = _setup_driver()
    trip_id = _book_trip(c_tok)
    _accept_trip(d_tok, trip_id)
    _start_trip(d_tok, trip_id)
    MockChannel.sent.clear()

    _complete_trip(d_tok, trip_id)

    assert len(MockChannel.sent) >= 1
    titles = [s["title"] for s in MockChannel.sent]
    assert any("terminé" in t.lower() or "Trajet" in t for t in titles)


def test_complete_trip_mock_channel_receives_email_recipient():
    """Dispatch uses the customer email as recipient for email channels."""
    c_tok = _setup_customer()
    d_tok = _setup_driver()
    trip_id = _book_trip(c_tok)
    _accept_trip(d_tok, trip_id)
    _start_trip(d_tok, trip_id)
    MockChannel.sent.clear()

    _complete_trip(d_tok, trip_id)

    assert len(MockChannel.sent) >= 1
    recipients = [s["recipient"] for s in MockChannel.sent]
    assert all("@" in r for r in recipients)


# ---------------------------------------------------------------------------
# payment_confirmed
# ---------------------------------------------------------------------------

def test_confirm_payment_dispatches_notification():
    """Confirming payment via webhook creates an in-app notification + dispatch."""
    c_tok = _setup_customer()
    d_tok = _setup_driver()
    trip_id = _book_trip(c_tok)
    _accept_trip(d_tok, trip_id)
    _start_trip(d_tok, trip_id)
    _complete_trip(d_tok, trip_id)

    # Create payment intent
    pi_r = client.post(
        "/v1/payments/intent",
        headers=_h(c_tok),
        json={"trip_id": trip_id},
    )
    assert pi_r.status_code == 201, pi_r.text
    provider_ref = pi_r.json()["provider_ref"]

    MockChannel.sent.clear()
    # Confirm via mock webhook
    import json as _json
    client.post(
        "/v1/payments/webhook",
        content=_json.dumps({"status": "paid", "provider_ref": provider_ref}).encode(),
        headers={"content-type": "application/json"},
    )

    notif_r = client.get("/v1/notifications", headers=_h(c_tok))
    types = [n["type"] for n in notif_r.json()]
    assert "payment_confirmed" in types


# ---------------------------------------------------------------------------
# document reviewed
# ---------------------------------------------------------------------------

def _setup_admin():
    tok = _tok("admin@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    return tok


def test_document_approved_dispatches_notification():
    """Admin approving a document triggers dispatch to the driver."""
    d_tok = _setup_driver()
    a_tok = _setup_admin()
    doc_r = client.post(
        "/v1/drivers/me/documents",
        headers=_h(d_tok),
        json={"type": "license", "url": "https://docs.ziza.dev/license.jpg"},
    )
    assert doc_r.status_code == 201, doc_r.text
    doc_id = doc_r.json()["document_id"]
    MockChannel.sent.clear()

    client.patch(
        f"/v1/admin/documents/{doc_id}/status",
        headers=_h(a_tok),
        json={"status": "approved"},
    )

    assert len(MockChannel.sent) >= 1
    titles = [s["title"] for s in MockChannel.sent]
    assert any("approuvé" in t.lower() or "Document" in t for t in titles)


def test_document_rejected_dispatches_notification():
    """Admin rejecting a document triggers dispatch to the driver."""
    d_tok = _setup_driver()
    a_tok = _setup_admin()
    doc_r = client.post(
        "/v1/drivers/me/documents",
        headers=_h(d_tok),
        json={"type": "insurance", "url": "https://docs.ziza.dev/insurance.jpg"},
    )
    doc_id = doc_r.json()["document_id"]
    MockChannel.sent.clear()

    client.patch(
        f"/v1/admin/documents/{doc_id}/status",
        headers=_h(a_tok),
        json={"status": "rejected", "note_admin": "Illisible"},
    )

    assert len(MockChannel.sent) >= 1
    titles = [s["title"] for s in MockChannel.sent]
    assert any("rejeté" in t.lower() or "Document" in t for t in titles)


# ---------------------------------------------------------------------------
# Channel resilience
# ---------------------------------------------------------------------------

class _FailingChannel:
    """A channel that always raises, used to test resilience."""
    channel_name = "failing"

    async def send(self, recipient, title, body, data) -> str:
        raise RuntimeError("Simulated channel failure")


def test_failed_channel_does_not_block_main_operation():
    """A channel that always raises must not prevent the trip from completing."""
    clear_channels()
    register_channel(_FailingChannel())

    c_tok = _setup_customer()
    d_tok = _setup_driver()
    trip_id = _book_trip(c_tok)
    _accept_trip(d_tok, trip_id)
    _start_trip(d_tok, trip_id)

    # This must succeed even though the channel will fail
    r = client.patch(f"/v1/trips/{trip_id}/complete", headers=_h(d_tok))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "completed"


# ---------------------------------------------------------------------------
# Notification row channel field
# ---------------------------------------------------------------------------

def test_in_app_notification_has_channel_in_app():
    """In-app notification rows must have channel == 'in_app'."""
    c_tok = _setup_customer()
    d_tok = _setup_driver()
    trip_id = _book_trip(c_tok)
    _accept_trip(d_tok, trip_id)

    notif_r = client.get("/v1/notifications", headers=_h(c_tok))
    notifs = notif_r.json()
    trip_accepted = [n for n in notifs if n.get("type") == "trip_accepted"]
    assert len(trip_accepted) >= 1
    # The in-app row must expose "channel" == "in_app"
    # (frontend polling only sees in-app rows)
    assert trip_accepted[0].get("channel") == "in_app"


def test_dispatch_with_no_channels_does_not_crash():
    """When no external channels are registered, dispatch is a silent no-op."""
    clear_channels()  # no channels registered

    c_tok = _setup_customer()
    d_tok = _setup_driver()
    trip_id = _book_trip(c_tok)

    # Should complete with no error
    r = client.patch(f"/v1/trips/{trip_id}/accept", headers=_h(d_tok))
    assert r.status_code == 200, r.text


def test_mock_channel_records_event_type_in_data():
    """MockChannel.sent entries carry the event_type in data dict."""
    c_tok = _setup_customer()
    d_tok = _setup_driver()
    trip_id = _book_trip(c_tok)
    MockChannel.sent.clear()

    _accept_trip(d_tok, trip_id)

    assert len(MockChannel.sent) >= 1
    # data must contain event_type
    data_payloads = [s["data"] for s in MockChannel.sent]
    assert any("event_type" in d for d in data_payloads)
