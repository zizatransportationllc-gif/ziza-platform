"""Sprint 31 — Redis cache tests (8 tests).

Uses fakeredis to test cache logic without a real Redis instance.

Covers:
  - cache_get miss (key not found)
  - cache_set + cache_get hit
  - cache_delete_pattern removes matching keys
  - cache is a no-op when client is None (disabled)
  - make_estimate_cache_key produces deterministic keys
  - Surge change invalidates estimate cache
  - cache_set with custom TTL
  - Different inputs produce different cache keys
"""
import asyncio
import pytest

import fakeredis.aioredis as fake_aioredis

from app import cache as cache_module
from app.cache import (
    cache_get,
    cache_set,
    cache_delete_pattern,
    make_estimate_cache_key,
    set_test_client,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run(coro):
    return asyncio.run(coro)


@pytest.fixture(autouse=True)
def _inject_fakeredis():
    """Inject a fresh fakeredis client before each test; restore None after."""
    fake = fake_aioredis.FakeRedis(decode_responses=True)
    set_test_client(fake)
    yield fake
    set_test_client(None)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_cache_miss_returns_none():
    """cache_get returns None for a key that was never set."""
    result = _run(cache_get("nonexistent_key"))
    assert result is None


def test_cache_set_and_get():
    """cache_set stores a value; cache_get retrieves it."""
    data = {"fare": 1500, "category": "economy"}
    _run(cache_set("estimate:test", data, ttl_seconds=300))
    result = _run(cache_get("estimate:test"))
    assert result == data


def test_cache_delete_pattern():
    """cache_delete_pattern removes all matching keys."""
    _run(cache_set("estimate:route1", {"fare": 1000}, ttl_seconds=300))
    _run(cache_set("estimate:route2", {"fare": 2000}, ttl_seconds=300))
    _run(cache_set("other:key", {"data": True}, ttl_seconds=300))

    deleted = _run(cache_delete_pattern("estimate:*"))
    assert deleted >= 2

    assert _run(cache_get("estimate:route1")) is None
    assert _run(cache_get("estimate:route2")) is None
    # Non-matching key should still be there
    assert _run(cache_get("other:key")) == {"data": True}


def test_cache_disabled_is_noop():
    """When client is None (disabled), cache_get always returns None."""
    # Temporarily disable cache
    set_test_client(None)
    try:
        # Set should silently do nothing
        _run(cache_set("estimate:disabled", {"fare": 999}, ttl_seconds=300))
        result = _run(cache_get("estimate:disabled"))
        assert result is None
    finally:
        # Restore — the autouse fixture's teardown will run set_test_client(None) again
        pass


def test_make_estimate_cache_key_deterministic():
    """Same inputs always produce the same cache key."""
    key1 = make_estimate_cache_key(5.32, -4.01, 5.36, -3.98, "economy", 1.0)
    key2 = make_estimate_cache_key(5.32, -4.01, 5.36, -3.98, "economy", 1.0)
    assert key1 == key2
    assert key1.startswith("estimate:")


def test_make_estimate_cache_key_different_for_different_inputs():
    """Different inputs produce different cache keys."""
    key1 = make_estimate_cache_key(5.32, -4.01, 5.36, -3.98, "economy", 1.0)
    key2 = make_estimate_cache_key(5.32, -4.01, 5.36, -3.98, "premium", 1.0)
    assert key1 != key2


def test_surge_change_invalidates_cache():
    """After deleting estimate:* keys (simulating surge change), cache misses."""
    _run(cache_set("estimate:origin_dest", {"fare": 2500, "surge": 1.0}, ttl_seconds=300))

    # Simulate surge change invalidation
    _run(cache_delete_pattern("estimate:*"))

    result = _run(cache_get("estimate:origin_dest"))
    assert result is None


def test_cache_set_custom_ttl():
    """cache_set accepts a custom TTL parameter and data is retrievable."""
    _run(cache_set("estimate:custom_ttl", {"fare": 3000}, ttl_seconds=60))
    result = _run(cache_get("estimate:custom_ttl"))
    assert result is not None
    assert result["fare"] == 3000
