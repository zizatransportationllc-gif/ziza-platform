"""Sprint 1 backend tests - validates /health and /v1/demo endpoints."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_ok() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    # Sprint 19: health now returns additional fields (version, environment, db)
    assert response.json()["status"] == "ok"


def test_demo_returns_expected_payload() -> None:
    response = client.get("/v1/demo")
    assert response.status_code == 200
    body = response.json()
    assert body["app"] == "ziza-api"
    assert body["message"] == "Hello from Ziza backend"
    assert "version" in body
    assert "environment" in body


def test_cors_preflight_allowed_for_customer_origin() -> None:
    response = client.options(
        "/v1/demo",
        headers={
            "Origin": "http://localhost:3001",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    # In prod: specific origin reflected. In dev/test: "*" wildcard — both are valid.
    assert response.headers.get("access-control-allow-origin") in [
        "http://localhost:3001",
        "*",
    ]
