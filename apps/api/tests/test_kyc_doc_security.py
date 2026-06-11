"""Sprint 66 — KYC document input-validation hardening (security).

Covers:
  - POST /v1/drivers/me/documents : reject script-bearing URLs (stored XSS),
    accept safe http(s) and data: image/PDF URLs.
  - POST /v1/drivers/me/documents/upload-url : content_type allowlist +
    filename sanitisation (no path traversal / HTML served from the bucket).
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


def _setup_driver(email: str = "driver@ziza.dev") -> str:
    tok = _tok(email)
    client.post("/v1/auth/register", headers=_h(tok))
    client.post("/v1/drivers/register", headers=_h(tok))
    return tok


# --- document URL validation ------------------------------------------------

def test_submit_rejects_javascript_url():
    d = _setup_driver()
    r = client.post("/v1/drivers/me/documents", headers=_h(d),
                    json={"type": "license", "url": "javascript:alert(1)"})
    assert r.status_code == 422


def test_submit_rejects_html_data_url():
    d = _setup_driver()
    r = client.post("/v1/drivers/me/documents", headers=_h(d),
                    json={"type": "license", "url": "data:text/html,<script>alert(1)</script>"})
    assert r.status_code == 422


def test_submit_rejects_svg_data_url():
    d = _setup_driver()
    r = client.post("/v1/drivers/me/documents", headers=_h(d),
                    json={"type": "license", "url": "data:image/svg+xml,<svg onload=alert(1)>"})
    assert r.status_code == 422


def test_submit_accepts_https_url():
    d = _setup_driver()
    r = client.post("/v1/drivers/me/documents", headers=_h(d),
                    json={"type": "license", "url": "https://storage.ziza.dev/docs/license.jpg"})
    assert r.status_code == 201


def test_submit_accepts_png_data_url():
    d = _setup_driver()
    r = client.post("/v1/drivers/me/documents", headers=_h(d),
                    json={"type": "license", "url": "data:image/png;base64,iVBORw0KGgoAAAANS"})
    assert r.status_code == 201


# --- upload-url hardening ----------------------------------------------------

def test_upload_url_rejects_html_content_type():
    d = _setup_driver()
    r = client.post("/v1/drivers/me/documents/upload-url", headers=_h(d),
                    json={"filename": "x.html", "content_type": "text/html"})
    assert r.status_code == 422


def test_upload_url_sanitises_path_traversal_filename():
    d = _setup_driver()
    r = client.post("/v1/drivers/me/documents/upload-url", headers=_h(d),
                    json={"filename": "../../etc/passwd", "content_type": "application/pdf"})
    assert r.status_code == 200
    body = r.json()
    # traversal stripped to a safe basename
    assert ".." not in body["final_url"]
    assert body["final_url"].endswith("/passwd")


def test_upload_url_accepts_pdf():
    d = _setup_driver()
    r = client.post("/v1/drivers/me/documents/upload-url", headers=_h(d),
                    json={"filename": "license.pdf", "content_type": "application/pdf"})
    assert r.status_code == 200
    assert r.json()["final_url"].endswith("/license.pdf")
