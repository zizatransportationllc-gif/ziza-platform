"""Craft (assistance) job lifecycle — arrival + completion handshake.

State machine:
  open → assigned (bid selected) → arrived (pro) → in_progress (customer)
       → pro_done (pro) → completed (customer)
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
    """Create a request, bid as pro, select the bid → returns (tc, tp, rid, code)."""
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
    assert bid.json()["eta_min"] > 0  # system-computed from positions
    sel = client.post(f"/v1/craft/requests/{rid}/select", headers=_h(tc),
                      json={"bid_id": bid.json()["bid_id"]})
    assert sel.status_code == 200, sel.text
    body = sel.json()
    assert body["status"] == "assigned"
    code = body["verification_code"]
    assert isinstance(code, str) and len(code) == 4 and code.isdigit()
    return tc, tp, rid, code


def test_full_happy_path():
    tc, tp, rid, _code = _assigned_request()
    # Pro arrives
    r = client.patch(f"/v1/craft/requests/{rid}/arrived", headers=_h(tp))
    assert r.status_code == 200 and r.json()["status"] == "arrived", r.text
    # Customer validates arrival → work starts
    r = client.patch(f"/v1/craft/requests/{rid}/confirm-arrival", headers=_h(tc))
    assert r.status_code == 200 and r.json()["status"] == "in_progress", r.text
    # Pro marks work done
    r = client.patch(f"/v1/craft/requests/{rid}/work-done", headers=_h(tp))
    assert r.status_code == 200 and r.json()["status"] == "pro_done", r.text
    # Customer confirms completion
    r = client.patch(f"/v1/craft/requests/{rid}/complete", headers=_h(tc))
    assert r.status_code == 200 and r.json()["status"] == "completed", r.text


def test_customer_cannot_confirm_arrival_before_pro_arrives():
    tc, tp, rid, _ = _assigned_request()
    r = client.patch(f"/v1/craft/requests/{rid}/confirm-arrival", headers=_h(tc))
    assert r.status_code == 409, r.text


def test_pro_cannot_finish_before_work_starts():
    tc, tp, rid, _ = _assigned_request()
    client.patch(f"/v1/craft/requests/{rid}/arrived", headers=_h(tp))
    r = client.patch(f"/v1/craft/requests/{rid}/work-done", headers=_h(tp))
    assert r.status_code == 409, r.text


def test_only_assigned_pro_can_mark_arrived():
    tc, tp, rid, _ = _assigned_request()
    # The customer (not a professional) cannot mark arrival
    r = client.patch(f"/v1/craft/requests/{rid}/arrived", headers=_h(tc))
    assert r.status_code in (403, 404), r.text


def test_before_after_photos_flow():
    tc, tp, rid, _ = _assigned_request()
    # Pro requests a signed upload URL
    u = client.post(f"/v1/craft/requests/{rid}/photos/upload-url", headers=_h(tp),
                    json={"kind": "before", "content_type": "image/jpeg", "filename": "x.jpg"})
    assert u.status_code == 200, u.text
    final_url = u.json()["final_url"]
    # Pro records the uploaded photo
    rec = client.post(f"/v1/craft/requests/{rid}/photos", headers=_h(tp),
                      json={"kind": "before", "url": final_url})
    assert rec.status_code == 201, rec.text
    assert rec.json()["kind"] == "before"
    # Customer can view it
    lst = client.get(f"/v1/craft/requests/{rid}/photos", headers=_h(tc))
    assert lst.status_code == 200, lst.text
    assert any(p["kind"] == "before" for p in lst.json())


def test_customer_cannot_upload_photo():
    tc, tp, rid, _ = _assigned_request()
    r = client.post(f"/v1/craft/requests/{rid}/photos", headers=_h(tc),
                    json={"kind": "after", "url": "http://x/y"})
    assert r.status_code in (403, 404), r.text
