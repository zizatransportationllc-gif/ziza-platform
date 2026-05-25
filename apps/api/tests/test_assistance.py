"""Sprint 9 — roadside assistance tests (16 tests).

Scenarios covered:
  POST /v1/assistance             — happy path (all fields), note optional,
                                    invalid type (422), requires auth
  GET  /v1/assistance/{id}        — 200 own request, 403 wrong user, 404 not found
  PATCH /v1/assistance/{id}/cancel — pending → cancelled, 409 after acceptance
  GET  /v1/assistance/driver/available — driver sees pending, 403 for customer
  Driver lifecycle                — accept (200), duplicate accept (409),
                                    wrong role (403), start (200), resolve (200)
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_token(email: str = "customer@ziza.dev") -> str:
    r = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _register_user(token: str) -> None:
    r = client.post("/v1/auth/register", headers=_headers(token))
    assert r.status_code == 200, r.text


def _register_driver(token: str) -> None:
    r = client.post("/v1/drivers/register", headers=_headers(token))
    assert r.status_code == 200, r.text


def _pending_assistance() -> tuple[str, str]:
    """Returns (req_id, customer_token) for a fresh pending assistance request."""
    tc = _get_token("customer@ziza.dev")
    _register_user(tc)
    r = client.post(
        "/v1/assistance",
        json={"type": "breakdown", "lat": 5.3207, "lng": -4.0175},
        headers=_headers(tc),
    )
    assert r.status_code == 201, r.text
    return r.json()["request_id"], tc


def _accepted_assistance() -> tuple[str, str, str]:
    """Returns (req_id, customer_token, driver_token) after driver accepts."""
    req_id, tc = _pending_assistance()
    td = _get_token("driver@ziza.dev")
    _register_user(td)
    _register_driver(td)
    r = client.patch(f"/v1/assistance/{req_id}/accept", headers=_headers(td))
    assert r.status_code == 200, r.text
    return req_id, tc, td


# ---------------------------------------------------------------------------
# POST /v1/assistance
# ---------------------------------------------------------------------------

def test_create_assistance_breakdown() -> None:
    tc = _get_token("customer@ziza.dev")
    _register_user(tc)
    r = client.post(
        "/v1/assistance",
        json={"type": "breakdown", "lat": 5.3207, "lng": -4.0175},
        headers=_headers(tc),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["request_id"]
    assert body["type"] == "breakdown"
    assert body["status"] == "pending"
    assert body["lat"] == pytest.approx(5.3207)
    assert body["lng"] == pytest.approx(-4.0175)
    assert body["note"] is None


def test_create_assistance_with_note() -> None:
    tc = _get_token("customer@ziza.dev")
    _register_user(tc)
    r = client.post(
        "/v1/assistance",
        json={"type": "flat_tyre", "lat": 5.36, "lng": -3.98, "note": "Roue avant gauche"},
        headers=_headers(tc),
    )
    assert r.status_code == 201
    assert r.json()["note"] == "Roue avant gauche"
    assert r.json()["type"] == "flat_tyre"


def test_create_assistance_invalid_type_returns_422() -> None:
    tc = _get_token("customer@ziza.dev")
    _register_user(tc)
    r = client.post(
        "/v1/assistance",
        json={"type": "flying_car", "lat": 5.3207, "lng": -4.0175},
        headers=_headers(tc),
    )
    assert r.status_code == 422


def test_create_assistance_requires_auth() -> None:
    r = client.post(
        "/v1/assistance",
        json={"type": "tow", "lat": 5.3207, "lng": -4.0175},
    )
    assert r.status_code in {401, 403}


# ---------------------------------------------------------------------------
# GET /v1/assistance/{req_id}
# ---------------------------------------------------------------------------

def test_get_assistance_request() -> None:
    req_id, tc = _pending_assistance()
    r = client.get(f"/v1/assistance/{req_id}", headers=_headers(tc))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["request_id"] == req_id
    assert body["type"] == "breakdown"
    assert body["status"] == "pending"


def test_get_assistance_wrong_user_returns_403() -> None:
    req_id, _ = _pending_assistance()
    # driver user is a different user — will not own this request
    other_token = _get_token("driver@ziza.dev")
    r = client.get(f"/v1/assistance/{req_id}", headers=_headers(other_token))
    assert r.status_code == 403


def test_get_assistance_not_found_returns_404() -> None:
    tc = _get_token("customer@ziza.dev")
    _register_user(tc)
    fake_id = "00000000-0000-0000-0000-000000000000"
    r = client.get(f"/v1/assistance/{fake_id}", headers=_headers(tc))
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /v1/assistance/{req_id}/cancel
# ---------------------------------------------------------------------------

def test_cancel_pending_assistance() -> None:
    req_id, tc = _pending_assistance()
    r = client.patch(f"/v1/assistance/{req_id}/cancel", headers=_headers(tc))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "cancelled"


def test_cancel_accepted_assistance_returns_409() -> None:
    req_id, tc, _ = _accepted_assistance()
    r = client.patch(f"/v1/assistance/{req_id}/cancel", headers=_headers(tc))
    assert r.status_code == 409


# ---------------------------------------------------------------------------
# GET /v1/assistance/driver/available
# ---------------------------------------------------------------------------

def test_list_available_assistance_as_driver() -> None:
    _pending_assistance()  # ensure at least one pending request exists
    td = _get_token("driver@ziza.dev")
    _register_user(td)
    _register_driver(td)
    r = client.get("/v1/assistance/driver/available", headers=_headers(td))
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body, list)
    assert len(body) >= 1
    assert all(item["status"] == "pending" for item in body)


def test_list_available_assistance_customer_forbidden() -> None:
    tc = _get_token("customer@ziza.dev")
    r = client.get("/v1/assistance/driver/available", headers=_headers(tc))
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Driver lifecycle: accept → start → resolve
# ---------------------------------------------------------------------------

def test_accept_assistance() -> None:
    req_id, _ = _pending_assistance()
    td = _get_token("driver@ziza.dev")
    _register_user(td)
    _register_driver(td)
    r = client.patch(f"/v1/assistance/{req_id}/accept", headers=_headers(td))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "accepted"


def test_accept_already_accepted_returns_409() -> None:
    req_id, _, td = _accepted_assistance()
    r = client.patch(f"/v1/assistance/{req_id}/accept", headers=_headers(td))
    assert r.status_code == 409


def test_accept_requires_driver_role() -> None:
    req_id, tc = _pending_assistance()
    r = client.patch(f"/v1/assistance/{req_id}/accept", headers=_headers(tc))
    assert r.status_code == 403


def test_start_assistance() -> None:
    req_id, _, td = _accepted_assistance()
    r = client.patch(f"/v1/assistance/{req_id}/start", headers=_headers(td))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "in_progress"


def test_resolve_assistance() -> None:
    req_id, _, td = _accepted_assistance()
    client.patch(f"/v1/assistance/{req_id}/start", headers=_headers(td))
    r = client.patch(f"/v1/assistance/{req_id}/resolve", headers=_headers(td))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "resolved"
