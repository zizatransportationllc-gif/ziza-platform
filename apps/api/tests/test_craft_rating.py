"""Craft (assistance) rating — customer rates the professional after the job."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _tok(email: str) -> str:
    r = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


def _customer() -> str:
    t = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(t))
    return t


def _professional() -> str:
    t = _tok("professional@ziza.dev")
    client.post("/v1/auth/register", headers=_h(t))
    client.post("/v1/craft/professionals/register", headers=_h(t),
                json={"specialties": "breakdown,tow", "bio": "Test pro"})
    return t


def _assigned_request():
    tc, tp = _customer(), _professional()
    rid = client.post("/v1/craft/requests", headers=_h(tc), json={
        "category": "breakdown", "description": "Car won't start",
        "lat": 40.7357, "lng": -74.1724, "address": "Newark, NJ",
    }).json()["request_id"]
    bid = client.post(f"/v1/craft/requests/{rid}/bids", headers=_h(tp), json={
        "price_cents": 8000, "note": "On my way",
        "professional_lat": 40.72, "professional_lng": -74.05,
    })
    assert bid.status_code == 201, bid.text
    sel = client.post(f"/v1/craft/requests/{rid}/select", headers=_h(tc),
                      json={"bid_id": bid.json()["bid_id"]})
    assert sel.status_code == 200, sel.text
    return tc, tp, rid


def _drive_to_completed(tc, tp, rid):
    client.patch(f"/v1/craft/requests/{rid}/arrived", headers=_h(tp))
    client.patch(f"/v1/craft/requests/{rid}/confirm-arrival", headers=_h(tc))
    client.patch(f"/v1/craft/requests/{rid}/work-done", headers=_h(tp))
    client.patch(f"/v1/craft/requests/{rid}/complete", headers=_h(tc))


def test_customer_rates_completed_job():
    tc, tp, rid = _assigned_request()
    _drive_to_completed(tc, tp, rid)

    r = client.post(f"/v1/craft/requests/{rid}/rating", headers=_h(tc),
                    json={"stars": 5, "comment": "Fast and friendly"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["stars"] == 5
    assert body["comment"] == "Fast and friendly"

    # Duplicate rating → 409.
    dup = client.post(f"/v1/craft/requests/{rid}/rating", headers=_h(tc), json={"stars": 3})
    assert dup.status_code == 409, dup.text

    # GET returns the stored rating.
    g = client.get(f"/v1/craft/requests/{rid}/rating", headers=_h(tc))
    assert g.status_code == 200 and g.json()["stars"] == 5


def test_cannot_rate_before_completed():
    tc, tp, rid = _assigned_request()  # status: assigned
    r = client.post(f"/v1/craft/requests/{rid}/rating", headers=_h(tc), json={"stars": 5})
    assert r.status_code == 422, r.text


def test_rating_forbidden_for_professional():
    tc, tp, rid = _assigned_request()
    _drive_to_completed(tc, tp, rid)
    r = client.post(f"/v1/craft/requests/{rid}/rating", headers=_h(tp), json={"stars": 5})
    assert r.status_code in (403, 404), r.text


def test_stars_out_of_range_rejected():
    tc, tp, rid = _assigned_request()
    _drive_to_completed(tc, tp, rid)
    r = client.post(f"/v1/craft/requests/{rid}/rating", headers=_h(tc), json={"stars": 6})
    assert r.status_code == 422, r.text


def test_get_rating_null_when_absent():
    tc, tp, rid = _assigned_request()
    _drive_to_completed(tc, tp, rid)
    g = client.get(f"/v1/craft/requests/{rid}/rating", headers=_h(tc))
    assert g.status_code == 200
    assert g.json() is None


def test_bid_list_shows_professional_average_rating():
    # First job: complete and rate the pro 5 stars.
    tc, tp, rid = _assigned_request()
    _drive_to_completed(tc, tp, rid)
    assert client.post(f"/v1/craft/requests/{rid}/rating", headers=_h(tc),
                       json={"stars": 5}).status_code == 201

    # Second job: the same pro bids; the customer's bid list carries the rating.
    rid2 = client.post("/v1/craft/requests", headers=_h(tc), json={
        "category": "breakdown", "description": "Another issue",
        "lat": 40.73, "lng": -74.17,
    }).json()["request_id"]
    b = client.post(f"/v1/craft/requests/{rid2}/bids", headers=_h(tp), json={
        "price_cents": 5000, "professional_lat": 40.72, "professional_lng": -74.05,
    })
    assert b.status_code == 201, b.text

    bids = client.get(f"/v1/craft/requests/{rid2}/bids", headers=_h(tc)).json()
    assert len(bids) >= 1
    bid = bids[0]
    assert bid["professional_rating"] == 5.0
    assert bid["professional_rating_count"] == 1
    assert bid["professional_name"]  # non-empty display name


def test_professional_sees_own_rating_stats():
    tc, tp, rid = _assigned_request()
    _drive_to_completed(tc, tp, rid)
    assert client.post(f"/v1/craft/requests/{rid}/rating", headers=_h(tc),
                       json={"stars": 4}).status_code == 201

    stats = client.get("/v1/craft/professionals/me/rating", headers=_h(tp))
    assert stats.status_code == 200, stats.text
    body = stats.json()
    assert body["average_stars"] == 4.0
    assert body["total_ratings"] == 1
