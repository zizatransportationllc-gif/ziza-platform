"""Cloud Storage helpers — F1 (Sprint 68).

KYC documents live in a **private** GCS bucket. They are never served via a
public URL; instead the API returns a short-lived **signed read URL** generated
on demand. The DB keeps the canonical object reference (the
``https://storage.googleapis.com/<bucket>/<key>`` URL captured at upload time);
this module turns that reference into a time-limited GET URL at serialization.

In dev / CI (``gcs_bucket_name`` unset) or for any URL that does not belong to
our bucket, the stored value is returned unchanged so nothing breaks locally.
"""
from __future__ import annotations

from datetime import timedelta

from app.config import settings

_GCS_PREFIX = "https://storage.googleapis.com/"


def _object_key(stored_url: str) -> str | None:
    """Return the object key if ``stored_url`` points at our configured bucket."""
    bucket = settings.gcs_bucket_name
    if not bucket:
        return None
    prefix = f"{_GCS_PREFIX}{bucket}/"
    if stored_url.startswith(prefix):
        return stored_url[len(prefix):]
    return None


def _sign(object_key: str, ttl_min: int) -> str:
    """Generate a v4 signed GET URL for ``object_key`` (network/IO)."""
    from google.cloud import storage as _gcs  # noqa: PLC0415

    client = _gcs.Client()
    blob = client.bucket(settings.gcs_bucket_name).blob(object_key)
    return blob.generate_signed_url(
        expiration=timedelta(minutes=ttl_min),
        method="GET",
        version="v4",
    )


def signed_upload_url(object_key: str, content_type: str, ttl_min: int = 15) -> tuple[str, str]:
    """Return ``(upload_url, object_ref)`` for a direct PUT upload.

    In dev / CI (no bucket) returns mock URLs so the flow works locally.
    ``object_ref`` is the canonical GCS URL stored in the DB and later turned
    into a signed read URL by :func:`signed_read_url`.
    """
    if not settings.gcs_bucket_name:
        return (f"http://localhost/mock-gcs-upload/{object_key}",
                f"http://localhost/mock-gcs/{object_key}")
    from google.cloud import storage as _gcs  # noqa: PLC0415

    client = _gcs.Client()
    blob = client.bucket(settings.gcs_bucket_name).blob(object_key)
    upload_url = blob.generate_signed_url(
        expiration=timedelta(minutes=ttl_min),
        method="PUT",
        content_type=content_type,
        version="v4",
    )
    object_ref = f"{_GCS_PREFIX}{settings.gcs_bucket_name}/{object_key}"
    return upload_url, object_ref


def signed_read_url(stored_url: str | None, ttl_min: int | None = None) -> str | None:
    """Return a short-lived signed read URL for a stored KYC document URL.

    - Empty / falsy input is returned as-is.
    - Dev/CI (no bucket) or a foreign URL → returned unchanged.
    - On any signing error the stored URL is returned (the private bucket makes
      it a non-loading link rather than a leak — we never expose more than the
      caller already had).
    """
    if not stored_url:
        return stored_url
    key = _object_key(stored_url)
    if key is None:
        return stored_url
    ttl = ttl_min if ttl_min is not None else settings.gcs_signed_url_ttl_min
    try:
        return _sign(key, ttl)
    except Exception:
        return stored_url
