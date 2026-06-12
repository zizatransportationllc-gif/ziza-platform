"""Sprint 66 — in-app messaging (trip conversations)."""
import uuid

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _tok(email: str) -> str:
    r = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


def _accepted_trip():
    """Create a trip accepted by a driver; return (trip_id, customer_tok, driver_tok)."""
    tc = _tok("customer@ziza.dev")
    td = _tok("driver@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tc))
    client.post("/v1/auth/register", headers=_h(td))
    client.post("/v1/drivers/register", headers=_h(td))
    est = client.post(
        "/v1/estimate",
        json={"origin_lat": 5.32, "origin_lng": -4.01, "dest_lat": 5.36, "dest_lng": -3.98},
        headers=_h(tc),
    ).json()["estimate_id"]
    trip = client.post("/v1/trips", json={"estimate_id": est}, headers=_h(tc))
    assert trip.status_code == 201, trip.text
    tid = trip.json()["trip_id"]
    acc = client.patch(f"/v1/trips/{tid}/accept", headers=_h(td))
    assert acc.status_code == 200, acc.text
    return tid, tc, td


def test_send_and_list_trip_message():
    tid, tc, td = _accepted_trip()
    r = client.post(f"/v1/trips/{tid}/messages", json={"body": "On my way?"}, headers=_h(tc))
    assert r.status_code == 201, r.text
    assert r.json()["mine"] is True
    assert r.json()["sender_role"] == "customer"
    # the driver sees it from the other side
    r2 = client.get(f"/v1/trips/{tid}/messages", headers=_h(td))
    assert r2.status_code == 200
    msgs = r2.json()
    assert len(msgs) == 1
    assert msgs[0]["body"] == "On my way?"
    assert msgs[0]["mine"] is False


def test_non_participant_forbidden():
    tid, tc, td = _accepted_trip()
    other = _tok("professional@ziza.dev")
    client.post("/v1/auth/register", headers=_h(other))
    assert client.get(f"/v1/trips/{tid}/messages", headers=_h(other)).status_code == 403
    assert client.post(f"/v1/trips/{tid}/messages", json={"body": "hi"}, headers=_h(other)).status_code == 403


def test_admin_can_read_conversation():
    tid, tc, td = _accepted_trip()
    client.post(f"/v1/trips/{tid}/messages", json={"body": "hello"}, headers=_h(tc))
    a = _tok("admin@ziza.dev")
    client.post("/v1/auth/register", headers=_h(a))
    r = client.get(f"/v1/trips/{tid}/messages", headers=_h(a))
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_empty_body_rejected():
    tid, tc, td = _accepted_trip()
    r = client.post(f"/v1/trips/{tid}/messages", json={"body": "   "}, headers=_h(tc))
    assert r.status_code == 422


def test_unknown_trip_404():
    tc = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tc))
    r = client.get(f"/v1/trips/{uuid.uuid4()}/messages", headers=_h(tc))
    assert r.status_code == 404


def test_invalid_trip_id_422():
    tc = _tok("customer@ziza.dev")
    r = client.get("/v1/trips/not-a-uuid/messages", headers=_h(tc))
    assert r.status_code == 422
