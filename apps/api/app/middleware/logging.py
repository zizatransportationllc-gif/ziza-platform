"""Structured JSON request-logging middleware — Sprint 19 → Sprint 23.

For every HTTP request the middleware:
  1. Generates a UUID ``request_id``.
  2. Attaches it as the ``X-Request-ID`` response header (useful for
     correlating Cloud Run logs with client-side error reports).
  3. Emits a single JSON log line to stdout after the response is sent:

     {"request_id": "...", "method": "GET", "path": "/v1/trips/abc/tracking",
      "status_code": 200, "duration_ms": 4.2,
      "user_id": "sub-claim-from-jwt", "trip_id": "abc..."}

  Sprint 23 additions:
  - ``user_id``  — extracted from the JWT ``sub`` claim (base64-decode of the
    payload segment).  Absent / null when the request carries no valid Bearer
    token (e.g. /health).
  - ``trip_id``  — parsed from the URL path when the route looks like
    ``/v1/trips/{uuid}/...``.  Absent / null for all other routes.

  Stdout is picked up verbatim by Cloud Logging when the service runs on
  Cloud Run with the default JSON driver.
"""
from __future__ import annotations

import base64
import json
import logging
import re
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("ziza.access")

# Matches /v1/trips/<uuid>/anything  (capturing the UUID part)
_TRIP_ID_RE = re.compile(r"^/v1/trips/([0-9a-f-]{36})(?:/|$)", re.IGNORECASE)


def _extract_user_id(request: Request) -> str | None:
    """Return the ``sub`` claim from a Bearer JWT without verifying its signature.

    This is intentionally lightweight — we only need the claim for logging
    correlation.  The real verification happens in ``get_current_user``.
    Returns ``None`` on any error (missing header, malformed token, etc.).
    """
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[7:]
    parts = token.split(".")
    if len(parts) != 3:
        return None
    try:
        # JWT payload is base64url-encoded (no padding)
        payload_b64 = parts[1]
        # Add padding so Python's base64 is happy
        padding = "=" * (-len(payload_b64) % 4)
        payload_bytes = base64.urlsafe_b64decode(payload_b64 + padding)
        payload = json.loads(payload_bytes)
        return payload.get("sub")
    except Exception:
        return None


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Attach X-Request-ID and emit structured access logs."""

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = str(uuid.uuid4())
        start = time.perf_counter()

        response: Response = await call_next(request)

        duration_ms = round((time.perf_counter() - start) * 1000, 1)
        response.headers["X-Request-ID"] = request_id

        record: dict = {
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": duration_ms,
        }

        # Sprint 23 — enrich with user_id and trip_id when available
        user_id = _extract_user_id(request)
        if user_id:
            record["user_id"] = user_id

        m = _TRIP_ID_RE.match(request.url.path)
        if m:
            record["trip_id"] = m.group(1)

        logger.info(json.dumps(record))

        return response
