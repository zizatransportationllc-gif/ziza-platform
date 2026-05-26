"""Sprint 25 — Rate limiting middleware tests (4 tests).

The rate limiter is disabled by default (``_enabled = False``) so that
all other tests are never throttled.  These tests temporarily enable it
and patch ``ROUTE_LIMITS`` to a very low threshold so we can hit the
limit in a small number of requests.

Test isolation is guaranteed by:
  - ``set_rate_limit_enabled(False)`` in teardown
  - ``clear_rate_limit_store()`` before/after each test
"""
import unittest.mock as mock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.middleware.rate_limit import (
    ROUTE_LIMITS,
    clear_rate_limit_store,
    set_rate_limit_enabled,
)

client = TestClient(app)

# We test against /health — a lightweight GET endpoint that requires no auth.
# We patch ROUTE_LIMITS to set a very low limit on it during tests.
_TEST_PATH = "/health"
_LOW_LIMIT = {"health": (2, 60)}  # 2 requests per 60 s


@pytest.fixture(autouse=True)
def _rate_limit_fixture():
    """Enable rate limiting with a low threshold, then clean up after each test."""
    clear_rate_limit_store()
    with mock.patch.dict(ROUTE_LIMITS, {_TEST_PATH: (2, 60)}):
        set_rate_limit_enabled(True)
        yield
    set_rate_limit_enabled(False)
    clear_rate_limit_store()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_below_limit_returns_200():
    """First request (below limit) → 200."""
    r = client.get(_TEST_PATH)
    assert r.status_code == 200, r.text


def test_at_limit_returns_200():
    """Requests up to the limit (inclusive) → 200."""
    r1 = client.get(_TEST_PATH)
    r2 = client.get(_TEST_PATH)
    assert r1.status_code == 200, r1.text
    assert r2.status_code == 200, r2.text


def test_over_limit_returns_429():
    """One request beyond the limit → 429 Too Many Requests."""
    client.get(_TEST_PATH)  # 1st — OK
    client.get(_TEST_PATH)  # 2nd — OK (at limit)
    r = client.get(_TEST_PATH)  # 3rd — over limit
    assert r.status_code == 429, r.text
    body = r.json()
    assert "detail" in body


def test_retry_after_header_present():
    """429 response must include a Retry-After header (positive integer)."""
    client.get(_TEST_PATH)
    client.get(_TEST_PATH)
    r = client.get(_TEST_PATH)
    assert r.status_code == 429, r.text
    assert "retry-after" in r.headers or "Retry-After" in r.headers
    retry_val = r.headers.get("retry-after") or r.headers.get("Retry-After")
    assert int(retry_val) > 0
