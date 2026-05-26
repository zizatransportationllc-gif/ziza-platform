"""Sprint 34 — Advanced Analytics tests (10 tests).

Covers:
  GET /v1/admin/analytics/kpis
  GET /v1/admin/analytics/revenue
  GET /v1/admin/analytics/drivers
  GET /v1/admin/analytics/categories
  GET /v1/admin/analytics/hourly
  GET /v1/admin/analytics/top-customers

Scenarios:
  - KPIs endpoint returns all expected fields
  - Revenue by day (empty = empty list)
  - Revenue period validation (invalid period → 422)
  - Driver performance returns list
  - Category breakdown returns list
  - Hourly demand returns exactly 24 entries
  - Top customers returns list
  - All endpoints require admin (non-admin → 403)
  - Invalid period string → 422
  - KPIs reflect registered users count
"""
import pytest
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


def _admin() -> str:
    tok = _tok("admin@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    return tok


def _customer() -> str:
    tok = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    return tok


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_platform_kpis_returns_all_fields():
    """GET /v1/admin/analytics/kpis returns all expected fields."""
    a_tok = _admin()
    r = client.get("/v1/admin/analytics/kpis", headers=_h(a_tok))
    assert r.status_code == 200, r.text
    data = r.json()
    expected_fields = [
        "total_users", "total_drivers", "online_drivers",
        "total_trips", "completed_trips", "completion_rate_pct",
        "total_revenue_xof", "avg_rating",
    ]
    for field in expected_fields:
        assert field in data, f"Missing field: {field}"


def test_platform_kpis_user_count_is_positive():
    """KPIs show at least 1 user (the admin who called the endpoint)."""
    a_tok = _admin()
    r = client.get("/v1/admin/analytics/kpis", headers=_h(a_tok))
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["total_users"] >= 1


def test_revenue_by_day_returns_list():
    """GET /v1/admin/analytics/revenue?period=day returns a list."""
    a_tok = _admin()
    r = client.get("/v1/admin/analytics/revenue?period=day", headers=_h(a_tok))
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


def test_revenue_invalid_period_returns_422():
    """GET /v1/admin/analytics/revenue?period=decade returns 422."""
    a_tok = _admin()
    r = client.get("/v1/admin/analytics/revenue?period=decade", headers=_h(a_tok))
    assert r.status_code == 422, r.text


def test_driver_performance_returns_list():
    """GET /v1/admin/analytics/drivers returns a list."""
    a_tok = _admin()
    r = client.get("/v1/admin/analytics/drivers", headers=_h(a_tok))
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


def test_category_breakdown_returns_list():
    """GET /v1/admin/analytics/categories returns a list."""
    a_tok = _admin()
    r = client.get("/v1/admin/analytics/categories", headers=_h(a_tok))
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


def test_hourly_demand_returns_24_entries():
    """GET /v1/admin/analytics/hourly returns exactly 24 entries (hours 0–23)."""
    a_tok = _admin()
    r = client.get("/v1/admin/analytics/hourly", headers=_h(a_tok))
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data) == 24
    hours = [entry["hour"] for entry in data]
    assert hours == list(range(24))


def test_top_customers_returns_list():
    """GET /v1/admin/analytics/top-customers returns a list."""
    a_tok = _admin()
    r = client.get("/v1/admin/analytics/top-customers", headers=_h(a_tok))
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


def test_non_admin_cannot_access_analytics():
    """Non-admin gets 403 on all analytics endpoints."""
    c_tok = _customer()
    endpoints = [
        "/v1/admin/analytics/kpis",
        "/v1/admin/analytics/revenue",
        "/v1/admin/analytics/drivers",
        "/v1/admin/analytics/categories",
        "/v1/admin/analytics/hourly",
        "/v1/admin/analytics/top-customers",
    ]
    for ep in endpoints:
        r = client.get(ep, headers=_h(c_tok))
        assert r.status_code == 403, f"Expected 403 for {ep}, got {r.status_code}"


def test_revenue_by_month_returns_list():
    """GET /v1/admin/analytics/revenue?period=month returns a list."""
    a_tok = _admin()
    r = client.get("/v1/admin/analytics/revenue?period=month", headers=_h(a_tok))
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)
