"""Two-leg trip flow — driver arrival + customer onboard confirmation.

State machine:
  accepted → arrived            (driver: PATCH /trips/{id}/arrived)
  arrived  → in_progress        (customer: PATCH /trips/{id}/board)  ← the gate
  in_progress → completed       (driver: PATCH /trips/{id}/complete)
"""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _tok(email: str) -> str:
    r = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _customer() -> str:
    tok = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    return tok


def _driver() -> str:
    tok = _tok("driver@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    client.post("/v1/drivers/register", headers=_h(tok))
    return tok


def _new_accepted_trip(tc: str, td: str) -> str:
    est = client.post(
        "/v1/estimate",
        json={"origin_lat": 5.3207, "origin_lng": -4.0175, "dest_lat": 5.36, "dest_lng": -3.98},
        headers=_h(tc),
    ).json()["estimate_id"]
    trip_id = client.post("/v1/trips", json={"estimate_id": est}, headers=_h(tc)).json()["trip_id"]
    acc = client.patch(f"/v1/trips/{trip_id}/accept", headers=_h(td))
    assert acc.status_code == 200, acc.text
    return trip_id


def test_two_leg_happy_path():
    tc, td = _customer(), _driver()
    trip_id = _new_accepted_trip(tc, td)

    # Leg 1 done: driver confirms arrival
    r = client.patch(f"/v1/trips/{trip_id}/arrived", headers=_h(td))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "arrived"

    # Gate: customer confirms onboard → leg 2 starts
    r = client.patch(f"/v1/trips/{trip_id}/board", headers=_h(tc))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "in_progress"

    # Leg 2 done: driver completes
    r = client.patch(f"/v1/trips/{trip_id}/complete", headers=_h(td))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "completed"


def test_board_blocked_before_driver_arrives():
    """Customer cannot start leg 2 until the driver has marked arrival."""
    tc, td = _customer(), _driver()
    trip_id = _new_accepted_trip(tc, td)  # status: accepted
    r = client.patch(f"/v1/trips/{trip_id}/board", headers=_h(tc))
    assert r.status_code == 409, r.text


def test_driver_cannot_confirm_onboard():
    """The board (onboard) confirmation is a customer-only action."""
    tc, td = _customer(), _driver()
    trip_id = _new_accepted_trip(tc, td)
    client.patch(f"/v1/trips/{trip_id}/arrived", headers=_h(td))
    r = client.patch(f"/v1/trips/{trip_id}/board", headers=_h(td))
    assert r.status_code != 200


def test_arrived_requires_accepted_status():
    """Marking arrival twice (already 'arrived') is rejected."""
    tc, td = _customer(), _driver()
    trip_id = _new_accepted_trip(tc, td)
    assert client.patch(f"/v1/trips/{trip_id}/arrived", headers=_h(td)).status_code == 200
    r = client.patch(f"/v1/trips/{trip_id}/arrived", headers=_h(td))
    assert r.status_code == 409, r.text
