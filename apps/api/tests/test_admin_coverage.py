"""Admin-configurable service coverage (covered US states)."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _tok(email: str) -> str:
    r = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


def test_coverage_defaults_to_new_jersey():
    a = _tok("admin@ziza.dev")
    r = client.get("/v1/admin/settings/coverage", headers=_h(a))
    assert r.status_code == 200, r.text
    assert r.json()["states"] == ["New Jersey"]


def test_admin_can_set_covered_states():
    a = _tok("admin@ziza.dev")
    r = client.patch("/v1/admin/settings/coverage", headers=_h(a),
                     json={"states": ["New Jersey", "New York", "New York"]})
    assert r.status_code == 200, r.text
    # duplicates dropped, order preserved
    assert r.json()["states"] == ["New Jersey", "New York"]
    # persisted on read
    g = client.get("/v1/admin/settings/coverage", headers=_h(a))
    assert g.json()["states"] == ["New Jersey", "New York"]


def test_empty_coverage_rejected():
    a = _tok("admin@ziza.dev")
    r = client.patch("/v1/admin/settings/coverage", headers=_h(a), json={"states": []})
    assert r.status_code == 422, r.text


def test_coverage_requires_admin():
    c = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(c))
    r = client.get("/v1/admin/settings/coverage", headers=_h(c))
    assert r.status_code == 403, r.text
