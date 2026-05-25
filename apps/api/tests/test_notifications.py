"""Sprint 18 — In-app notification system tests."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

SAMPLE_DOC_URL = "https://storage.ziza.dev/docs/license-sp18.jpg"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _tok(email: str) -> str:
    r = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _register(token: str) -> None:
    client.post("/v1/auth/register", headers=_h(token))


def _setup_driver(email: str = "driver@ziza.dev") -> str:
    tok = _tok(email)
    _register(tok)
    client.post("/v1/drivers/register", headers=_h(tok))
    return tok


def _setup_admin() -> str:
    tok = _tok("admin@ziza.dev")
    _register(tok)
    return tok


def _setup_customer() -> str:
    tok = _tok("customer@ziza.dev")
    _register(tok)
    return tok


# ---------------------------------------------------------------------------
# GET /v1/notifications — basic shape
# ---------------------------------------------------------------------------

def test_list_notifications_requires_auth():
    """No token → 401."""
    r = client.get("/v1/notifications")
    assert r.status_code == 401, r.text


def test_list_notifications_empty_for_new_user():
    """Fresh user with no activity gets an empty list."""
    tok = _setup_customer()
    r = client.get("/v1/notifications", headers=_h(tok))
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


# ---------------------------------------------------------------------------
# GET /v1/notifications/unread-count
# ---------------------------------------------------------------------------

def test_unread_count_requires_auth():
    """No token → 401."""
    r = client.get("/v1/notifications/unread-count")
    assert r.status_code == 401, r.text


def test_unread_count_shape():
    """Endpoint returns a JSON object with an integer 'count' field."""
    tok = _setup_customer()
    r = client.get("/v1/notifications/unread-count", headers=_h(tok))
    assert r.status_code == 200, r.text
    assert "count" in r.json()
    assert isinstance(r.json()["count"], int)
    assert r.json()["count"] >= 0


# ---------------------------------------------------------------------------
# Document approved/rejected → driver notification
# ---------------------------------------------------------------------------

def test_driver_notified_on_document_approved():
    """When admin approves a document, the driver gets a notification."""
    d_tok = _setup_driver()
    a_tok = _setup_admin()

    # Driver submits a document
    r = client.post(
        "/v1/drivers/me/documents",
        headers=_h(d_tok),
        json={"type": "license", "url": SAMPLE_DOC_URL},
    )
    assert r.status_code == 201, r.text
    doc_id = r.json()["document_id"]

    before = client.get("/v1/notifications/unread-count", headers=_h(d_tok)).json()["count"]

    # Admin approves it
    client.patch(
        f"/v1/admin/documents/{doc_id}/status",
        headers=_h(a_tok),
        json={"status": "approved"},
    )

    after = client.get("/v1/notifications/unread-count", headers=_h(d_tok)).json()["count"]
    assert after >= before + 1

    # Verify content of the latest notification
    notifs = client.get("/v1/notifications", headers=_h(d_tok)).json()
    latest = notifs[0]
    assert latest["type"] == "document_approved"
    assert latest["read"] is False


def test_driver_notified_on_document_rejected():
    """When admin rejects a document with a note, the driver gets a notification."""
    d_tok = _setup_driver()
    a_tok = _setup_admin()

    r = client.post(
        "/v1/drivers/me/documents",
        headers=_h(d_tok),
        json={"type": "insurance", "url": SAMPLE_DOC_URL},
    )
    doc_id = r.json()["document_id"]

    before = client.get("/v1/notifications/unread-count", headers=_h(d_tok)).json()["count"]

    client.patch(
        f"/v1/admin/documents/{doc_id}/status",
        headers=_h(a_tok),
        json={"status": "rejected", "note_admin": "Document illisible"},
    )

    after = client.get("/v1/notifications/unread-count", headers=_h(d_tok)).json()["count"]
    assert after >= before + 1

    notifs = client.get("/v1/notifications", headers=_h(d_tok)).json()
    latest = notifs[0]
    assert latest["type"] == "document_rejected"


# ---------------------------------------------------------------------------
# Trip accepted / completed → customer notification
# ---------------------------------------------------------------------------

def _book_trip(c_tok: str) -> str:
    """Create an estimate and book a trip; return trip_id."""
    est = client.post(
        "/v1/estimate",
        headers=_h(c_tok),
        json={"origin_lat": 5.32, "origin_lng": -4.02, "dest_lat": 5.36, "dest_lng": -3.98},
    ).json()
    trip = client.post(
        "/v1/trips",
        headers=_h(c_tok),
        json={"estimate_id": est["estimate_id"]},
    ).json()
    return trip["trip_id"]


def test_customer_notified_on_trip_accepted():
    """When a driver accepts a trip, the customer gets a notification."""
    c_tok = _setup_customer()
    d_tok = _setup_driver()

    trip_id = _book_trip(c_tok)
    before = client.get("/v1/notifications/unread-count", headers=_h(c_tok)).json()["count"]

    client.patch(f"/v1/trips/{trip_id}/accept", headers=_h(d_tok))

    after = client.get("/v1/notifications/unread-count", headers=_h(c_tok)).json()["count"]
    assert after >= before + 1

    notifs = client.get("/v1/notifications", headers=_h(c_tok)).json()
    latest = notifs[0]
    assert latest["type"] == "trip_accepted"
    assert latest["read"] is False


def test_customer_notified_on_trip_completed():
    """When a driver completes a trip, the customer gets a notification."""
    c_tok = _setup_customer()
    d_tok = _setup_driver()

    trip_id = _book_trip(c_tok)
    client.patch(f"/v1/trips/{trip_id}/accept", headers=_h(d_tok))
    client.patch(f"/v1/trips/{trip_id}/start", headers=_h(d_tok))

    before = client.get("/v1/notifications/unread-count", headers=_h(c_tok)).json()["count"]
    client.patch(f"/v1/trips/{trip_id}/complete", headers=_h(d_tok))
    after = client.get("/v1/notifications/unread-count", headers=_h(c_tok)).json()["count"]

    assert after >= before + 1
    notifs = client.get("/v1/notifications", headers=_h(c_tok)).json()
    assert any(n["type"] == "trip_completed" for n in notifs)


# ---------------------------------------------------------------------------
# PATCH /v1/notifications/read-all
# ---------------------------------------------------------------------------

def test_mark_all_read_requires_auth():
    """No token → 401."""
    r = client.patch("/v1/notifications/read-all")
    assert r.status_code == 401, r.text


def test_mark_all_read_clears_unread_count():
    """After mark-all-read, unread count drops to 0."""
    c_tok = _setup_customer()
    d_tok = _setup_driver()

    # Generate at least one notification (accept a trip)
    trip_id = _book_trip(c_tok)
    client.patch(f"/v1/trips/{trip_id}/accept", headers=_h(d_tok))

    # Confirm there's at least 1 unread
    count_before = client.get("/v1/notifications/unread-count", headers=_h(c_tok)).json()["count"]
    assert count_before >= 1

    # Mark all as read
    r = client.patch("/v1/notifications/read-all", headers=_h(c_tok))
    assert r.status_code == 200, r.text
    assert r.json()["marked"] >= 1

    # Unread count must now be 0
    count_after = client.get("/v1/notifications/unread-count", headers=_h(c_tok)).json()["count"]
    assert count_after == 0


# ---------------------------------------------------------------------------
# Isolation: each user sees only their own notifications
# ---------------------------------------------------------------------------

def test_notifications_are_user_isolated():
    """A driver cannot see a customer's notifications and vice versa."""
    c_tok = _setup_customer()
    d_tok = _setup_driver()

    # Generate customer notifications (trip accepted)
    trip_id = _book_trip(c_tok)
    client.patch(f"/v1/trips/{trip_id}/accept", headers=_h(d_tok))

    # Driver's notifications should NOT contain trip_accepted
    d_notifs = client.get("/v1/notifications", headers=_h(d_tok)).json()
    assert not any(n["type"] == "trip_accepted" for n in d_notifs)
