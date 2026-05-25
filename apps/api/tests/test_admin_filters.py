"""Sprint 19 — Admin trip and user search/filter tests."""
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


def _register(token: str) -> None:
    client.post("/v1/auth/register", headers=_h(token))


def _setup_admin() -> str:
    tok = _tok("admin@ziza.dev")
    _register(tok)
    return tok


def _setup_customer() -> str:
    tok = _tok("customer@ziza.dev")
    _register(tok)
    return tok


def _setup_driver() -> str:
    tok = _tok("driver@ziza.dev")
    _register(tok)
    client.post("/v1/drivers/register", headers=_h(tok))
    return tok


def _book_trip(c_tok: str) -> dict:
    est = client.post(
        "/v1/estimate",
        headers=_h(c_tok),
        json={"origin_lat": 5.32, "origin_lng": -4.02, "dest_lat": 5.36, "dest_lng": -3.98},
    ).json()
    return client.post(
        "/v1/trips",
        headers=_h(c_tok),
        json={"estimate_id": est["estimate_id"]},
    ).json()


# ---------------------------------------------------------------------------
# GET /v1/admin/trips — filter by status
# ---------------------------------------------------------------------------

def test_admin_trips_no_filter_returns_list():
    """Unfiltered /v1/admin/trips returns a list."""
    a_tok = _setup_admin()
    r = client.get("/v1/admin/trips", headers=_h(a_tok))
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


def test_admin_trips_filter_by_status_pending():
    """Filter by status=pending only returns pending trips."""
    a_tok = _setup_admin()
    c_tok = _setup_customer()
    _book_trip(c_tok)  # creates a pending trip

    r = client.get("/v1/admin/trips?status_filter=pending", headers=_h(a_tok))
    assert r.status_code == 200, r.text
    trips = r.json()
    assert len(trips) >= 1
    assert all(t["status"] == "pending" for t in trips)


def test_admin_trips_filter_by_status_completed():
    """Filter by status=completed only returns completed trips."""
    a_tok = _setup_admin()
    c_tok = _setup_customer()
    d_tok = _setup_driver()

    trip = _book_trip(c_tok)
    tid = trip["trip_id"]
    client.patch(f"/v1/trips/{tid}/accept", headers=_h(d_tok))
    client.patch(f"/v1/trips/{tid}/start", headers=_h(d_tok))
    client.patch(f"/v1/trips/{tid}/complete", headers=_h(d_tok))

    r = client.get("/v1/admin/trips?status_filter=completed", headers=_h(a_tok))
    assert r.status_code == 200, r.text
    trips = r.json()
    assert len(trips) >= 1
    assert all(t["status"] == "completed" for t in trips)


def test_admin_trips_filter_by_customer_email():
    """Filter by customer_email (partial match) returns matching trips."""
    a_tok = _setup_admin()
    c_tok = _setup_customer()
    _book_trip(c_tok)

    r = client.get("/v1/admin/trips?customer_email=customer", headers=_h(a_tok))
    assert r.status_code == 200, r.text
    trips = r.json()
    assert len(trips) >= 1
    assert all("customer" in t["customer_email"] for t in trips)


def test_admin_trips_filter_unknown_email_returns_empty():
    """Filter by a non-existent email returns empty list."""
    a_tok = _setup_admin()
    r = client.get(
        "/v1/admin/trips?customer_email=nonexistent_xyz_nobody",
        headers=_h(a_tok),
    )
    assert r.status_code == 200, r.text
    assert r.json() == []


def test_admin_trips_filter_requires_admin():
    """Non-admin cannot filter trips."""
    c_tok = _setup_customer()
    r = client.get("/v1/admin/trips?status_filter=pending", headers=_h(c_tok))
    assert r.status_code == 403, r.text


# ---------------------------------------------------------------------------
# GET /v1/admin/users — filter by role / email
# ---------------------------------------------------------------------------

def test_admin_users_no_filter_returns_list():
    """Unfiltered /v1/admin/users returns a list."""
    a_tok = _setup_admin()
    r = client.get("/v1/admin/users", headers=_h(a_tok))
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


def test_admin_users_filter_by_role_customer():
    """role=customer returns only customers."""
    a_tok = _setup_admin()
    _setup_customer()

    r = client.get("/v1/admin/users?role=customer", headers=_h(a_tok))
    assert r.status_code == 200, r.text
    users = r.json()
    assert len(users) >= 1
    assert all(u["role"] == "customer" for u in users)


def test_admin_users_filter_by_role_driver():
    """role=driver returns only drivers."""
    a_tok = _setup_admin()
    _setup_driver()

    r = client.get("/v1/admin/users?role=driver", headers=_h(a_tok))
    assert r.status_code == 200, r.text
    users = r.json()
    assert len(users) >= 1
    assert all(u["role"] == "driver" for u in users)


def test_admin_users_filter_by_email_partial():
    """email filter does a case-insensitive partial match."""
    a_tok = _setup_admin()
    _setup_customer()

    r = client.get("/v1/admin/users?email=CUSTOMER", headers=_h(a_tok))
    assert r.status_code == 200, r.text
    users = r.json()
    assert len(users) >= 1
    assert all("customer" in u["email"].lower() for u in users)


def test_admin_users_filter_unknown_email_returns_empty():
    """Email filter with no match returns empty list."""
    a_tok = _setup_admin()
    r = client.get("/v1/admin/users?email=nobody_xyz_42", headers=_h(a_tok))
    assert r.status_code == 200, r.text
    assert r.json() == []


def test_admin_users_filter_requires_admin():
    """Non-admin cannot search users."""
    c_tok = _setup_customer()
    r = client.get("/v1/admin/users?role=driver", headers=_h(c_tok))
    assert r.status_code == 403, r.text
