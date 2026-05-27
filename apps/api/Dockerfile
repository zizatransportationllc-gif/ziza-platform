FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

WORKDIR /app

# Install dependencies first (better layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app ./app

# Copy Alembic config + migrations (needed for migrate-on-startup)
COPY alembic.ini .
COPY alembic ./alembic

# Run as non-root
RUN useradd --create-home --shell /bin/bash ziza && chown -R ziza:ziza /app
USER ziza

EXPOSE 8000

# On startup: attempt DB migrations (non-fatal — API starts even if DB is unreachable).
# Alembic is idempotent so concurrent restarts are safe.
# If DATABASE_URL is not set, migrations are skipped entirely.
CMD ["sh", "-c", "if [ -n \"$DATABASE_URL\" ]; then alembic upgrade head || echo '[WARN] Alembic migration failed — starting API in degraded mode'; fi && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
