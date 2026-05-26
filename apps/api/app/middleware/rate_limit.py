"""Rate limiting middleware — Sprint 25.

Simple in-memory sliding-window rate limiter.

Design notes:
- Module-level ``_enabled`` flag — toggled to True in production via
  ``settings.rate_limit_enabled``.  Default is False so dev/CI tests
  (which call /v1/token many times) are never throttled.
- Module-level ``_counters`` dict — clearable between test cases via
  ``clear_rate_limit_store()``.
- ``ROUTE_LIMITS`` dict — patchable with ``unittest.mock.patch.dict``
  in rate-limit tests.

Only POST requests (and /v1/payments/intent regardless of method) are
subject to per-route limits.  All other requests count against the
global limit only when the global limit is enabled.
"""
from __future__ import annotations

import time
from collections import deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

# ---------------------------------------------------------------------------
# Mutable module-level state — safe to patch in tests
# ---------------------------------------------------------------------------

#: Set to True in production (via ``settings.rate_limit_enabled``).
_enabled: bool = False

#: (IP, path) → deque of timestamps of recent requests inside the window.
_counters: dict[str, deque] = {}

#: Per-route limits: path → (max_requests, window_seconds).
ROUTE_LIMITS: dict[str, tuple[int, int]] = {
    "/v1/token":              (5, 60),
    "/v1/auth/refresh":       (10, 60),
    "/v1/payments/intent":    (3, 60),
}

#: Global fallback limit applied to all other routes.
GLOBAL_LIMIT: tuple[int, int] = (120, 60)


# ---------------------------------------------------------------------------
# Control functions (used by production startup and tests)
# ---------------------------------------------------------------------------

def set_rate_limit_enabled(value: bool) -> None:
    """Enable or disable rate limiting at runtime."""
    global _enabled
    _enabled = value


def clear_rate_limit_store() -> None:
    """Reset all in-memory counters — call between test cases."""
    _counters.clear()


# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------

class RateLimitMiddleware(BaseHTTPMiddleware):
    """Sliding-window rate limiter applied per (client_ip, path).

    Returns HTTP 429 with a ``Retry-After`` header when the limit is
    exceeded.  Bypassed entirely when ``_enabled`` is False.
    """

    async def dispatch(self, request: Request, call_next):
        if not _enabled:
            return await call_next(request)

        path = request.url.path

        # Determine the applicable limit for this path
        limit, window = GLOBAL_LIMIT
        for route_prefix, (rl, rw) in ROUTE_LIMITS.items():
            if path == route_prefix or path.startswith(route_prefix + "/"):
                limit, window = rl, rw
                break

        # Client IP — respect X-Forwarded-For from load balancers
        forwarded = request.headers.get("X-Forwarded-For", "")
        if forwarded:
            ip = forwarded.split(",")[0].strip()
        elif request.client:
            ip = request.client.host
        else:
            ip = "unknown"

        key = f"{ip}:{path}"
        now = time.time()
        window_start = now - window

        if key not in _counters:
            _counters[key] = deque()

        # Evict timestamps outside the current window
        q = _counters[key]
        while q and q[0] < window_start:
            q.popleft()

        if len(q) >= limit:
            # Calculate how many seconds until the oldest entry leaves the window
            retry_after = max(1, int(window - (now - q[0])) + 1)
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests — please slow down"},
                headers={"Retry-After": str(retry_after)},
            )

        q.append(now)
        return await call_next(request)
