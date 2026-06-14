"""Sprint 17 — Admin pending counts tests."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

SAMPLE_URL = "https://storage.ziza.dev/docs/sample.jpg"


def _tok(email: str) -> str:
    r = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_admin_pending_counts_shape():
    """GET /v1/admin/pending-counts returns expected fields."""
    a_tok = _tok("admin@ziza.dev")
    client.post("/v1/auth/register", headers=_h(a_tok))
    r = client.get("/v1/admin/pending-counts", headers=_h(a_tok))
    assert r.status_code == 200, r.text
    data = r.json()
    assert "payout_requests" in data
    assert "documents" in data
    assert isinstance(data["payout_requests"], int)
    assert isinstance(data["documents"], int)


def test_admin_pending_counts_requires_admin():
    """Non-admin cannot access pending counts."""
    c_tok = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(c_tok))
    r = client.get("/v1/admin/pending-counts", headers=_h(c_tok))
    assert r.status_code == 403, r.text


def test_admin_pending_counts_reflects_state():
    """After creating a payout and a document, counts increase by at least 1 each."""
    a_tok = _tok("admin@ziza.dev")
    d_tok = _tok("driver@ziza.dev")
    client.post("/v1/auth/register", headers=_h(a_tok))
    client.post("/v1/auth/register", headers=_h(d_tok))
    client.post("/v1/drivers/register", headers=_h(d_tok))

    # Sprint 67 — payouts are capped at available balance, so give the driver
    # earnings via a completed trip first.
    c_tok = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(c_tok))
    est = client.post("/v1/estimate", headers=_h(c_tok), json={
        "origin_lat": 5.3207, "origin_lng": -4.0175,
        "dest_lat": 5.3600, "dest_lng": -3.9801,
    }).json()["estimate_id"]
    trip_id = client.post("/v1/trips", headers=_h(c_tok), json={
        "estimate_id": est, "category": "economy",
    }).json()["trip_id"]
    client.patch(f"/v1/trips/{trip_id}/accept", headers=_h(d_tok))
    client.patch(f"/v1/trips/{trip_id}/start", headers=_h(d_tok))
    client.patch(f"/v1/trips/{trip_id}/complete", headers=_h(d_tok))

    # Baseline counts
    before = client.get("/v1/admin/pending-counts", headers=_h(a_tok)).json()

    # Create a payout request (within balance)
    client.post(
        "/v1/drivers/me/payout-requests",
        headers=_h(d_tok),
        json={"amount_cents": 100},
    )

    # Submit a document
    client.post(
        "/v1/drivers/me/documents",
        headers=_h(d_tok),
        json={"type": "license", "url": SAMPLE_URL},
    )

    after = client.get("/v1/admin/pending-counts", headers=_h(a_tok)).json()
    assert after["payout_requests"] >= before["payout_requests"] + 1
    assert after["documents"] >= before["documents"] + 1
