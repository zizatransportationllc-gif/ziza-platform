"""Sprint 23 — Concurrency / double-action protection tests (1 test).

Verifies that accepting the same trip twice results in a 409 on the second
call, preventing data corruption when two drivers race to accept the same job.

Sprint 48 hotfix: removed assistance double-accept test (feature removed in Sprint 48).
"""
import uuid

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _tok(email: str) -> str:
    r = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _setup_customer(tok: str) -> None:
    client.post("/v1/auth/register", headers=_h(tok))


def _setup_driver(tok: str) -> None:
    client.post("/v1/auth/register", headers=_h(tok))
    client.post("/v1/drivers/register", headers=_h(tok))


def _book_trip(customer_tok: str) -> str:
    est = client.post(
        "/v1/estimate",
        headers=_h(customer_tok),
        json={
            "origin_lat": 5.32, "origin_lng": -4.02,
            "dest_lat": 5.36, "dest_lng": -3.98,
        },
    )
    assert est.status_code == 200, est.text
    trip = client.post("/v1/trips", headers=_h(customer_tok),
                       json={"estimate_id": est.json()["estimate_id"]})
    assert trip.status_code == 201, trip.text
    return trip.json()["trip_id"]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_accept_trip_twice_second_returns_409():
    """Accepting the same trip twice → second call returns 409."""
    tc = _tok("customer@ziza.dev")
    td = _tok("driver@ziza.dev")
    _setup_customer(tc)
    _setup_driver(td)

    trip_id = _book_trip(tc)

    # First accept succeeds
    r1 = client.patch(f"/v1/trips/{trip_id}/accept", headers=_h(td))
    assert r1.status_code == 200, r1.text

    # Second accept on the same trip must be rejected
    r2 = client.patch(f"/v1/trips/{trip_id}/accept", headers=_h(td))
    assert r2.status_code == 409, r2.text


