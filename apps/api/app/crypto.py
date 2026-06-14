"""Field-level encryption at rest — Sprint 69.

Used to protect sensitive values (bank account numbers) in the database.

Encryption uses Fernet (AES-128-CBC + HMAC) with a key from
``settings.bank_encryption_key`` (urlsafe base64, 32 bytes — generate with
``Fernet.generate_key()`` and store in Secret Manager).

Encrypted values are prefixed with ``enc:`` so the layer is backward-compatible
and dev-safe:
  - key set   → ``encrypt`` returns ``"enc:<token>"``; ``decrypt`` reverses it.
  - no key    → values are stored/returned as-is (dev / CI only). Plaintext that
    was never encrypted decrypts to itself.
"""
from __future__ import annotations

from app.config import settings

_PREFIX = "enc:"


def _fernet():
    from cryptography.fernet import Fernet  # noqa: PLC0415
    return Fernet(settings.bank_encryption_key.encode())


def encrypt(plaintext: str) -> str:
    """Return an encrypted, prefixed token (or plaintext if no key configured)."""
    if not plaintext or not settings.bank_encryption_key:
        return plaintext
    token = _fernet().encrypt(plaintext.encode()).decode()
    return f"{_PREFIX}{token}"


def decrypt(value: str) -> str:
    """Reverse :func:`encrypt`. Non-encrypted values are returned unchanged."""
    if not value or not value.startswith(_PREFIX):
        return value
    if not settings.bank_encryption_key:
        # Encrypted data but no key available — cannot recover.
        raise RuntimeError("bank_encryption_key is required to decrypt this value")
    return _fernet().decrypt(value[len(_PREFIX):].encode()).decode()
