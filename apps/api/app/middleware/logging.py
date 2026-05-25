"""Structured JSON request-logging middleware — Sprint 19.

For every HTTP request the middleware:
  1. Generates a UUID ``request_id``.
  2. Attaches it as the ``X-Request-ID`` response header (useful for
     correlating Cloud Run logs with client-side error reports).
  3. Emits a single JSON log line to stdout after the response is sent:

     {"request_id": "...", "method": "GET", "path": "/health",
      "status_code": 200, "duration_ms": 4.2}

  Stdout is picked up verbatim by Cloud Logging when the service runs on
  Cloud Run with the default JSON driver.
"""
from __future__ import annotations

import json
import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("ziza.access")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Attach X-Request-ID and emit structured access logs."""

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = str(uuid.uuid4())
        start = time.perf_counter()

        response: Response = await call_next(request)

        duration_ms = round((time.perf_counter() - start) * 1000, 1)
        response.headers["X-Request-ID"] = request_id

        record = {
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": duration_ms,
        }
        logger.info(json.dumps(record))

        return response
