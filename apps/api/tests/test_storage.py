"""F1 (Sprint 68) — signed read URLs for private KYC documents."""
import app.storage as storage


def test_no_bucket_returns_url_unchanged(monkeypatch):
    """Dev/CI (no bucket configured) → the stored URL is returned as-is."""
    monkeypatch.setattr(storage.settings, "gcs_bucket_name", "", raising=False)
    url = "http://localhost/mock-gcs/driver-docs/abc/file.pdf"
    assert storage.signed_read_url(url) == url


def test_empty_input_returned_asis(monkeypatch):
    monkeypatch.setattr(storage.settings, "gcs_bucket_name", "ziza-kyc", raising=False)
    assert storage.signed_read_url("") == ""
    assert storage.signed_read_url(None) is None


def test_foreign_url_not_signed(monkeypatch):
    """A URL that does not belong to our bucket is left untouched."""
    monkeypatch.setattr(storage.settings, "gcs_bucket_name", "ziza-kyc", raising=False)
    monkeypatch.setattr(storage, "_sign", lambda key, ttl: f"SIGNED::{key}")
    other = "https://storage.googleapis.com/some-other-bucket/x/y.pdf"
    assert storage.signed_read_url(other) == other


def test_matching_url_is_signed(monkeypatch):
    """A URL in our bucket is replaced by a freshly generated signed URL."""
    monkeypatch.setattr(storage.settings, "gcs_bucket_name", "ziza-kyc", raising=False)
    monkeypatch.setattr(storage, "_sign", lambda key, ttl: f"SIGNED::{key}::{ttl}")
    monkeypatch.setattr(storage.settings, "gcs_signed_url_ttl_min", 15, raising=False)
    stored = "https://storage.googleapis.com/ziza-kyc/driver-docs/d1/uuid/license.pdf"
    out = storage.signed_read_url(stored)
    assert out == "SIGNED::driver-docs/d1/uuid/license.pdf::15"


def test_signing_error_falls_back_to_stored(monkeypatch):
    """If signing raises, return the stored URL (private bucket → non-loading, no leak)."""
    monkeypatch.setattr(storage.settings, "gcs_bucket_name", "ziza-kyc", raising=False)

    def _boom(key, ttl):
        raise RuntimeError("no signing creds")

    monkeypatch.setattr(storage, "_sign", _boom)
    stored = "https://storage.googleapis.com/ziza-kyc/driver-docs/d1/x/license.pdf"
    assert storage.signed_read_url(stored) == stored
