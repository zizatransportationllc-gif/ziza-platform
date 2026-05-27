"""Sprint 31 — Performance benchmark tests (4 tests).

These tests verify that key endpoints respond within acceptable latency budgets.
They run against the in-memory SQLite DB used in CI (no network round-trip).

Targets:
  - Single estimate < 100ms (relaxed from 50ms for SQLite overhead)
  - 10 sequential estimates complete in < 2s total
  - Driver location PUT < 200ms
  - List trips (dispatch) < 300ms

Note: fakeredis cache is NOT injected here — we test raw SQLite performance.
"""
import time
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

ESTIMATE_PAYLOAD = {
    "origin_lat": 5.3207,
    "origin_lng": -4.0175,
    "dest_lat": 5.3600,
    "dest_lng": -3.9801,
    "category": "economy",
}

LOCATION_PAYLOAD = {
    "lat": 5.3207,
    "lng": -4.0175,
    "heading": 45.0,
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _tok(email: str) -> str:
    r = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _setup_customer() -> str:
    tok = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    return tok


def _setup_driver() -> str:
    tok = _tok("driver@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    client.post("/v1/drivers/register", headers=_h(tok))
    return tok


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_single_estimate_latency():
    """Single /v1/estimate call completes within 100ms."""
    c_tok = _setup_customer()
    t0 = time.perf_counter()
    r = client.post("/v1/estimate", headers=_h(c_tok), json=ESTIMATE_PAYLOAD)
    elapsed_ms = (time.perf_counter() - t0) * 1000
    assert r.status_code == 200, r.text
    assert elapsed_ms < 100, f"Estimate took {elapsed_ms:.1f}ms (limit: 100ms)"


def test_ten_sequential_estimates_total_latency():
    """10 sequential estimate calls complete within 2 seconds total."""
    c_tok = _setup_customer()
    t0 = time.perf_counter()
    for _ in range(10):
        r = client.post("/v1/estimate", headers=_h(c_tok), json=ESTIMATE_PAYLOAD)
        assert r.status_code == 200
    elapsed = time.perf_counter() - t0
    assert elapsed < 2.0, f"10 estimates took {elapsed:.2f}s (limit: 2.0s)"


def test_driver_location_update_latency():
    """PUT /v1/drivers/me/location completes within 200ms."""
    d_tok = _setup_driver()
    t0 = time.perf_counter()
    r = client.put("/v1/drivers/me/location", headers=_h(d_tok), json=LOCATION_PAYLOAD)
    elapsed_ms = (time.perf_counter() - t0) * 1000
    assert r.status_code in (200, 201), r.text
    assert elapsed_ms < 200, f"Location update took {elapsed_ms:.1f}ms (limit: 200ms)"


def test_list_available_trips_latency():
    """GET /v1/trips/driver/available completes within 300ms."""
    d_tok = _setup_driver()
    client.put("/v1/drivers/me/online", headers=_h(d_tok), json={"online": True})
    t0 = time.perf_counter()
    r = client.get("/v1/trips/driver/available", headers=_h(d_tok))
    elapsed_ms = (time.perf_counter() - t0) * 1000
    assert r.status_code == 200, r.text
    assert elapsed_ms < 300, f"Available trips took {elapsed_ms:.1f}ms (limit: 300ms)"
