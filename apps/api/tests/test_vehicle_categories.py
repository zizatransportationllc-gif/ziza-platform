"""Sprint 21 — Vehicle categories tests (economy / comfort / premium)."""
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


def _setup(email: str) -> str:
    tok = _tok(email)
    client.post("/v1/auth/register", headers=_h(tok))
    return tok


def _estimate(tok: str) -> dict:
    r = client.post(
        "/v1/estimate",
        headers=_h(tok),
        json={"origin_lat": 5.32, "origin_lng": -4.02,
              "dest_lat": 5.36, "dest_lng": -3.98},
    )
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------------------
# GET /v1/categories
# ---------------------------------------------------------------------------

def test_list_categories_requires_auth():
    r = client.get("/v1/categories")
    assert r.status_code in (401, 403)


def test_list_categories_returns_three():
    tok = _setup("customer@ziza.dev")
    r = client.get("/v1/categories", headers=_h(tok))
    assert r.status_code == 200, r.text
    cats = r.json()
    assert len(cats) == 3
    slugs = {c["category"] for c in cats}
    assert slugs == {"economy", "comfort", "premium"}


def test_list_categories_shape():
    tok = _setup("customer@ziza.dev")
    cats = client.get("/v1/categories", headers=_h(tok)).json()
    for c in cats:
        assert "category" in c
        assert "label" in c
        assert "description" in c
        assert "multiplier" in c
        assert isinstance(c["multiplier"], float)


def test_category_multipliers_ordered():
    """economy < comfort < premium."""
    tok = _setup("customer@ziza.dev")
    cats = {c["category"]: c for c in client.get("/v1/categories", headers=_h(tok)).json()}
    assert cats["economy"]["multiplier"] < cats["comfort"]["multiplier"]
    assert cats["comfort"]["multiplier"] < cats["premium"]["multiplier"]


# ---------------------------------------------------------------------------
# POST /v1/estimate — categories dict
# ---------------------------------------------------------------------------

def test_estimate_includes_categories():
    tok = _setup("customer@ziza.dev")
    est = _estimate(tok)
    assert "categories" in est
    assert "economy" in est["categories"]
    assert "comfort" in est["categories"]
    assert "premium" in est["categories"]


def test_estimate_category_shape():
    tok = _setup("customer@ziza.dev")
    est = _estimate(tok)
    for cat_name, cat_data in est["categories"].items():
        assert "fare_cents" in cat_data
        assert "label" in cat_data
        assert "description" in cat_data
        assert "multiplier" in cat_data
        assert cat_data["fare_cents"] >= 1


def test_estimate_category_fares_ordered():
    """Premium fare > comfort fare > economy fare."""
    tok = _setup("customer@ziza.dev")
    est = _estimate(tok)
    cats = est["categories"]
    assert cats["economy"]["fare_cents"] <= cats["comfort"]["fare_cents"]
    assert cats["comfort"]["fare_cents"] <= cats["premium"]["fare_cents"]


def test_estimate_economy_fare_matches_top_level():
    """The top-level fare_cents must equal the economy category fare."""
    tok = _setup("customer@ziza.dev")
    est = _estimate(tok)
    assert est["fare_cents"] == est["categories"]["economy"]["fare_cents"]


# ---------------------------------------------------------------------------
# POST /v1/trips — category field
# ---------------------------------------------------------------------------

def test_trip_defaults_to_economy():
    tok = _setup("customer@ziza.dev")
    est = _estimate(tok)
    r = client.post("/v1/trips", headers=_h(tok),
                    json={"estimate_id": est["estimate_id"]})
    assert r.status_code == 201, r.text
    assert r.json()["category"] == "economy"


def test_trip_with_comfort_category():
    tok = _setup("customer@ziza.dev")
    est = _estimate(tok)
    r = client.post("/v1/trips", headers=_h(tok),
                    json={"estimate_id": est["estimate_id"], "category": "comfort"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["category"] == "comfort"
    # Comfort fare should be >= economy fare from the same estimate
    comfort_fare = est["categories"]["comfort"]["fare_cents"]
    assert body["fare_cents"] == comfort_fare


def test_trip_with_premium_category():
    tok = _setup("customer@ziza.dev")
    est = _estimate(tok)
    r = client.post("/v1/trips", headers=_h(tok),
                    json={"estimate_id": est["estimate_id"], "category": "premium"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["category"] == "premium"
    premium_fare = est["categories"]["premium"]["fare_cents"]
    assert body["fare_cents"] == premium_fare


def test_trip_invalid_category_returns_422():
    tok = _setup("customer@ziza.dev")
    est = _estimate(tok)
    r = client.post("/v1/trips", headers=_h(tok),
                    json={"estimate_id": est["estimate_id"], "category": "vip_gold"})
    assert r.status_code == 422, r.text


# ---------------------------------------------------------------------------
# Vehicle — category field
# ---------------------------------------------------------------------------

def test_vehicle_default_category_is_economy():
    tok = _tok("driver@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    client.post("/v1/drivers/register", headers=_h(tok))
    client.post(
        "/v1/drivers/me/vehicle",
        headers=_h(tok),
        json={"plate": "CAT-ECO-01", "make": "Toyota", "model": "Corolla", "year": 2022},
    )
    r = client.get("/v1/drivers/me/vehicle", headers=_h(tok))
    assert r.status_code == 200, r.text
    assert r.json()["category"] == "economy"


def test_vehicle_register_comfort_category():
    tok = _tok("driver@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    client.post("/v1/drivers/register", headers=_h(tok))
    r = client.post(
        "/v1/drivers/me/vehicle",
        headers=_h(tok),
        json={"plate": "CAT-CMF-02", "make": "Mercedes", "model": "E-Class",
              "year": 2023, "category": "comfort"},
    )
    assert r.status_code in (200, 201), r.text
    assert r.json()["category"] == "comfort"


def test_vehicle_register_premium_category():
    tok = _tok("driver@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    client.post("/v1/drivers/register", headers=_h(tok))
    r = client.post(
        "/v1/drivers/me/vehicle",
        headers=_h(tok),
        json={"plate": "CAT-PRE-03", "make": "BMW", "model": "7 Series",
              "year": 2024, "category": "premium"},
    )
    assert r.status_code in (200, 201), r.text
    assert r.json()["category"] == "premium"


def test_vehicle_invalid_category_returns_422():
    tok = _tok("driver@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    client.post("/v1/drivers/register", headers=_h(tok))
    r = client.post(
        "/v1/drivers/me/vehicle",
        headers=_h(tok),
        json={"plate": "CAT-BAD-99", "make": "X", "model": "Y",
              "year": 2020, "category": "luxury_plus"},
    )
    assert r.status_code == 422, r.text
