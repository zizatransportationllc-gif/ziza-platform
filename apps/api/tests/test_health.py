"""Sprint 19 — Enhanced health endpoint tests."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_ok():
    """GET /health returns status=ok."""
    r = client.get("/health")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "ok"


def test_health_returns_version():
    """GET /health includes app version."""
    r = client.get("/health")
    assert "version" in r.json()
    assert isinstance(r.json()["version"], str)


def test_health_returns_environment():
    """GET /health includes environment field."""
    r = client.get("/health")
    assert "environment" in r.json()


def test_health_returns_db_field():
    """GET /health includes db connectivity field."""
    r = client.get("/health")
    data = r.json()
    assert "db" in data
    # In test context SQLite is used; db status should be "ok"
    assert data["db"] in ("ok", "error")


def test_health_db_ok_with_test_db():
    """In the test environment the in-memory SQLite DB is reachable."""
    r = client.get("/health")
    assert r.json()["db"] == "ok"


def test_health_request_id_header():
    """Every response carries an X-Request-ID UUID header."""
    r = client.get("/health")
    req_id = r.headers.get("x-request-id")
    assert req_id is not None
    # Simple UUID format check
    assert len(req_id) == 36
    parts = req_id.split("-")
    assert len(parts) == 5
