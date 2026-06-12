"""Sprint 66 — admin per-driver history/earnings + per-professional summary."""
import uuid

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _tok(email: str) -> str:
    r = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


ADMIN = "admin@ziza.dev"
CUSTOMER = "customer@ziza.dev"


# --- access control ----------------------------------------------------------

def test_driver_history_requires_admin():
    r = client.get(f"/v1/admin/drivers/{uuid.uuid4()}/history", headers=_h(_tok(CUSTOMER)))
    assert r.status_code == 403


def test_driver_earnings_requires_admin():
    r = client.get(f"/v1/admin/drivers/{uuid.uuid4()}/earnings", headers=_h(_tok(CUSTOMER)))
    assert r.status_code == 403


def test_professional_summary_requires_admin():
    r = client.get(f"/v1/admin/professionals/{uuid.uuid4()}/summary", headers=_h(_tok(CUSTOMER)))
    assert r.status_code == 403


# --- validation / not found --------------------------------------------------

def test_driver_history_invalid_id_422():
    r = client.get("/v1/admin/drivers/not-a-uuid/history", headers=_h(_tok(ADMIN)))
    assert r.status_code == 422


def test_driver_history_unknown_404():
    r = client.get(f"/v1/admin/drivers/{uuid.uuid4()}/history", headers=_h(_tok(ADMIN)))
    assert r.status_code == 404


def test_professional_summary_invalid_id_422():
    r = client.get("/v1/admin/professionals/not-a-uuid/summary", headers=_h(_tok(ADMIN)))
    assert r.status_code == 422


def test_professional_summary_unknown_404():
    r = client.get(f"/v1/admin/professionals/{uuid.uuid4()}/summary", headers=_h(_tok(ADMIN)))
    assert r.status_code == 404
