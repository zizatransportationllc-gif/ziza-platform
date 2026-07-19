"""Craft (assistance) live tracking — customer follows the assigned professional.

The professional pushes their GPS position via PATCH /v1/craft/professionals/me;
the customer polls GET /v1/craft/requests/{id}/tracking to see it + a fresh ETA.
"""
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
        "category": "breakdown",
        "description": "Car won't start",
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


def test_tracking_returns_pro_position_and_eta():
    tc, tp, rid = _assigned_request()
    # Pro pushes a live GPS position.
    up = client.patch("/v1/craft/professionals/me", headers=_h(tp),
                      json={"is_online": True, "current_lat": 40.72, "current_lng": -74.05})
    assert up.status_code == 200, up.text

    tr = client.get(f"/v1/craft/requests/{rid}/tracking", headers=_h(tc))
    assert tr.status_code == 200, tr.text
    body = tr.json()
    assert body["request_id"] == rid
    assert body["status"] == "assigned"
    assert abs(body["pro_lat"] - 40.72) < 1e-6
    assert abs(body["pro_lng"] - (-74.05)) < 1e-6
    assert body["distance_km"] >= 0
    assert body["eta_min"] >= 1


def test_tracking_forbidden_for_professional():
    tc, tp, rid = _assigned_request()
    client.patch("/v1/craft/professionals/me", headers=_h(tp),
                 json={"current_lat": 40.72, "current_lng": -74.05})
    tr = client.get(f"/v1/craft/requests/{rid}/tracking", headers=_h(tp))
    assert tr.status_code == 403, tr.text


def test_tracking_404_for_unknown_request():
    tc = _customer()
    tr = client.get("/v1/craft/requests/00000000-0000-0000-0000-000000000000/tracking",
                    headers=_h(tc))
    assert tr.status_code == 404, tr.text


def test_share_link_public_tracking_no_auth():
    tc, tp, rid = _assigned_request()
    client.patch("/v1/craft/professionals/me", headers=_h(tp),
                 json={"is_online": True, "current_lat": 40.72, "current_lng": -74.05})

    # Customer mints the share token (idempotent).
    s1 = client.post(f"/v1/craft/requests/{rid}/share", headers=_h(tc))
    assert s1.status_code == 200, s1.text
    token = s1.json()["share_token"]
    assert token
    s2 = client.post(f"/v1/craft/requests/{rid}/share", headers=_h(tc))
    assert s2.json()["share_token"] == token  # same token on repeat

    # A relative opens the public page — NO auth header.
    pub = client.get(f"/v1/public/craft/track/{token}")
    assert pub.status_code == 200, pub.text
    body = pub.json()
    assert body["status"] == "assigned"
    assert body["category"] == "breakdown"
    assert abs(body["pro_lat"] - 40.72) < 1e-6
    assert body["eta_min"] >= 1


def test_share_forbidden_for_professional():
    tc, tp, rid = _assigned_request()
    r = client.post(f"/v1/craft/requests/{rid}/share", headers=_h(tp))
    assert r.status_code in (403, 404), r.text


def test_public_track_404_for_unknown_token():
    pub = client.get("/v1/public/craft/track/does-not-exist")
    assert pub.status_code == 404, pub.text
