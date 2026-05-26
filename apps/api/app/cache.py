"""Redis cache helpers — Sprint 31.

Provides a thin async wrapper around redis.asyncio (or fakeredis in tests).

Usage:
    from app.cache import cache_get, cache_set, cache_delete_pattern, get_cache_client

The cache is disabled when ``settings.redis_url`` is empty or
``settings.cache_enabled`` is False.  In that case, all operations are
no-ops so the rest of the application code remains unchanged.
"""
from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Client — lazy singleton
# ---------------------------------------------------------------------------

_client: Any | None = None  # redis.asyncio.Redis or fakeredis equivalent


def _make_client() -> Any | None:
    """Create a Redis client if configured; return None otherwise."""
    if not settings.redis_url or not settings.cache_enabled:
        return None
    try:
        import redis.asyncio as redis  # type: ignore[import]

        return redis.from_url(settings.redis_url, decode_responses=True)
    except ImportError:
        logger.warning("redis package not installed — caching disabled")
        return None


def get_cache_client() -> Any | None:
    """Return the shared Redis client (None if caching is disabled)."""
    global _client  # noqa: PLW0603
    if _client is None:
        _client = _make_client()
    return _client


def set_test_client(client: Any | None) -> None:
    """Override the Redis client for testing (fakeredis)."""
    global _client  # noqa: PLW0603
    _client = client


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------

async def cache_get(key: str) -> dict | None:
    """Return a cached dict, or None on miss / error."""
    client = get_cache_client()
    if client is None:
        return None
    try:
        raw = await client.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as exc:  # noqa: BLE001
        logger.debug("cache_get error: %s", exc)
        return None


async def cache_set(key: str, value: dict, ttl_seconds: int = 900) -> None:
    """Store a dict in the cache with an expiry (default 15 min)."""
    client = get_cache_client()
    if client is None:
        return
    try:
        await client.setex(key, ttl_seconds, json.dumps(value))
    except Exception as exc:  # noqa: BLE001
        logger.debug("cache_set error: %s", exc)


async def cache_delete_pattern(pattern: str) -> int:
    """Delete all keys matching a pattern. Returns number of deleted keys."""
    client = get_cache_client()
    if client is None:
        return 0
    try:
        keys = await client.keys(pattern)
        if keys:
            return await client.delete(*keys)
        return 0
    except Exception as exc:  # noqa: BLE001
        logger.debug("cache_delete_pattern error: %s", exc)
        return 0


def make_estimate_cache_key(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    category: str,
    surge: float,
) -> str:
    """Deterministic cache key for an estimate request."""
    raw = f"{origin_lat:.6f}|{origin_lng:.6f}|{dest_lat:.6f}|{dest_lng:.6f}|{category}|{surge:.2f}"
    return "estimate:" + hashlib.sha256(raw.encode()).hexdigest()[:32]
