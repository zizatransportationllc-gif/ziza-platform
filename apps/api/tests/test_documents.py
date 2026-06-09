"""Sprint 17 + Sprint 25 — Driver KYC documents tests."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

SAMPLE_URL = "https://storage.ziza.dev/docs/license-001.jpg"


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


def _setup_admin(email: str = "admin@ziza.dev") -> str:
    tok = _tok(email)
    client.post("/v1/auth/register", headers=_h(tok))
    return tok


# ---------------------------------------------------------------------------
# POST /v1/drivers/me/documents
# ---------------------------------------------------------------------------

def test_driver_submit_document():
    """Driver submits a license document → 201, status=pending."""
    d_tok = _setup_driver()
    r = client.post(
        "/v1/drivers/me/documents",
        headers=_h(d_tok),
        json={"type": "license", "url": SAMPLE_URL},
    )
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["type"] == "license"
    assert data["url"] == SAMPLE_URL
    assert data["status"] == "pending"
    assert "document_id" in data
    assert data["note_admin"] is None


def test_driver_submit_all_types():
    """Driver can submit all four document types."""
    d_tok = _setup_driver()
    for doc_type in ("license", "insurance", "registration", "id_card"):
        r = client.post(
            "/v1/drivers/me/documents",
            headers=_h(d_tok),
            json={"type": doc_type, "url": f"https://docs.ziza.dev/{doc_type}.jpg"},
        )
        assert r.status_code == 201, f"{doc_type}: {r.text}"
        assert r.json()["type"] == doc_type


def test_driver_submit_invalid_type_returns_422():
    """An unknown document type is rejected with 422."""
    d_tok = _setup_driver()
    r = client.post(
        "/v1/drivers/me/documents",
        headers=_h(d_tok),
        json={"type": "selfie", "url": SAMPLE_URL},
    )
    assert r.status_code == 422, r.text


def test_driver_submit_requires_driver_role():
    """A customer cannot submit driver documents."""
    c_tok = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(c_tok))
    r = client.post(
        "/v1/drivers/me/documents",
        headers=_h(c_tok),
        json={"type": "license", "url": SAMPLE_URL},
    )
    assert r.status_code == 403, r.text


def test_driver_submit_requires_auth():
    """No token → 401."""
    r = client.post("/v1/drivers/me/documents", json={"type": "license", "url": SAMPLE_URL})
    assert r.status_code == 401, r.text


# ---------------------------------------------------------------------------
# GET /v1/drivers/me/documents
# ---------------------------------------------------------------------------

def test_driver_list_documents():
    """After submitting, the driver can list their documents."""
    d_tok = _setup_driver()
    client.post(
        "/v1/drivers/me/documents",
        headers=_h(d_tok),
        json={"type": "insurance", "url": SAMPLE_URL},
    )
    r = client.get("/v1/drivers/me/documents", headers=_h(d_tok))
    assert r.status_code == 200, r.text
    docs = r.json()
    assert isinstance(docs, list)
    assert len(docs) >= 1
    assert all("document_id" in d for d in docs)


def test_driver_list_documents_requires_auth():
    """No token → 401."""
    r = client.get("/v1/drivers/me/documents")
    assert r.status_code == 401, r.text


# ---------------------------------------------------------------------------
# GET /v1/admin/documents
# ---------------------------------------------------------------------------

def test_admin_list_documents():
    """Admin list includes driver_email field."""
    _setup_driver()
    a_tok = _setup_admin()
    client.post(
        "/v1/drivers/me/documents",
        headers=_h(_tok("driver@ziza.dev")),
        json={"type": "id_card", "url": SAMPLE_URL},
    )
    r = client.get("/v1/admin/documents", headers=_h(a_tok))
    assert r.status_code == 200, r.text
    docs = r.json()
    assert isinstance(docs, list)
    assert len(docs) >= 1
    assert "driver_email" in docs[0]
    assert "type" in docs[0]
    assert "status" in docs[0]


def test_admin_list_documents_requires_admin():
    """Non-admin → 403."""
    c_tok = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(c_tok))
    r = client.get("/v1/admin/documents", headers=_h(c_tok))
    assert r.status_code == 403, r.text


# ---------------------------------------------------------------------------
# PATCH /v1/admin/documents/{id}/status
# ---------------------------------------------------------------------------

def _submit_doc(d_tok: str, doc_type: str = "license") -> str:
    r = client.post(
        "/v1/drivers/me/documents",
        headers=_h(d_tok),
        json={"type": doc_type, "url": SAMPLE_URL},
    )
    assert r.status_code == 201, r.text
    return r.json()["document_id"]


def test_admin_approve_document():
    """Admin approves a pending document → status=approved."""
    d_tok = _setup_driver()
    a_tok = _setup_admin()
    doc_id = _submit_doc(d_tok, "registration")
    r = client.patch(
        f"/v1/admin/documents/{doc_id}/status",
        headers=_h(a_tok),
        json={"status": "approved"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "approved"


def test_admin_reject_document_with_note():
    """Admin rejects a document with a note."""
    d_tok = _setup_driver()
    a_tok = _setup_admin()
    doc_id = _submit_doc(d_tok, "insurance")
    r = client.patch(
        f"/v1/admin/documents/{doc_id}/status",
        headers=_h(a_tok),
        json={"status": "rejected", "note_admin": "Document illisible"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "rejected"
    assert data["note_admin"] == "Document illisible"


def test_admin_needs_resubmission_document():
    """Admin sets a document to needs_resubmission with a note → status reflects it."""
    d_tok = _setup_driver()
    a_tok = _setup_admin()
    doc_id = _submit_doc(d_tok, "license")
    r = client.patch(
        f"/v1/admin/documents/{doc_id}/status",
        headers=_h(a_tok),
        json={"status": "needs_resubmission", "note_admin": "Photo trop floue"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "needs_resubmission"
    assert data["note_admin"] == "Photo trop floue"


def test_admin_document_invalid_status_returns_422():
    """Invalid status value → 422 (e.g. 'pending' is not admin-settable)."""
    d_tok = _setup_driver()
    a_tok = _setup_admin()
    doc_id = _submit_doc(d_tok)
    r = client.patch(
        f"/v1/admin/documents/{doc_id}/status",
        headers=_h(a_tok),
        json={"status": "pending"},
    )
    assert r.status_code == 422, r.text


def test_admin_document_not_found_returns_404():
    """Random UUID → 404."""
    import uuid
    a_tok = _setup_admin()
    r = client.patch(
        f"/v1/admin/documents/{uuid.uuid4()}/status",
        headers=_h(a_tok),
        json={"status": "approved"},
    )
    assert r.status_code == 404, r.text


# ---------------------------------------------------------------------------
# POST /v1/drivers/me/documents/upload-url  (Sprint 25)
# ---------------------------------------------------------------------------

def test_upload_url_requires_driver_role():
    """A customer calling the upload-url endpoint → 403."""
    c_tok = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(c_tok))
    r = client.post(
        "/v1/drivers/me/documents/upload-url",
        headers=_h(c_tok),
        json={"filename": "license.pdf", "content_type": "application/pdf"},
    )
    assert r.status_code == 403, r.text


def test_upload_url_returns_urls():
    """A driver gets back upload_url and final_url (mock mode in CI)."""
    d_tok = _setup_driver()
    r = client.post(
        "/v1/drivers/me/documents/upload-url",
        headers=_h(d_tok),
        json={"filename": "insurance.jpg", "content_type": "image/jpeg"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "upload_url" in body
    assert "final_url" in body
    # In CI / dev mode gcs_bucket_name is empty → mock localhost URLs
    assert len(body["upload_url"]) > 0
    assert len(body["final_url"]) > 0
    assert "insurance.jpg" in body["upload_url"]
