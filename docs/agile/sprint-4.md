# Sprint 4 — PostgreSQL + Core Schema

**Duration:** ~1 week
**Goal:** Persistent storage — Cloud SQL (PostgreSQL 16), SQLAlchemy async, Alembic migrations, real `/v1/auth/register` upsert.

---

## Deliverables

| # | Livrable | Status |
|---|---|---|
| 1 | `app/db.py` — async engine + `get_db` dependency | ✅ |
| 2 | SQLAlchemy models: `users`, `drivers`, `vehicles`, `trips`, `trip_events` | ✅ |
| 3 | `app/crud.py` — `upsert_user()` async helper | ✅ |
| 4 | `POST /v1/auth/register` — real DB upsert (idempotent) | ✅ |
| 5 | Alembic setup + migration `0001_initial_schema` | ✅ |
| 6 | `docker-compose.yml` — PostgreSQL 16 service added | ✅ |
| 7 | `infra/gcp/cloudsql.sh` — Cloud SQL provisioning script | ✅ |
| 8 | Deploy workflow updated with `DATABASE_URL` + Cloud SQL attach | ✅ |
| 9 | Tests updated — conftest with SQLite in-memory DB, idempotency test | ✅ |

---

## Database schema

```
users               ← upserted on every login (POST /v1/auth/register)
  id          UUID PK
  user_id     VARCHAR(128)  — Firebase UID or dev seeded ID
  email       VARCHAR(255)  — unique, indexed
  role        VARCHAR(32)   — customer | driver | admin
  provider    VARCHAR(32)   — dev | firebase
  created_at  TIMESTAMPTZ
  updated_at  TIMESTAMPTZ

drivers             ← created during driver on-boarding (Sprint 5+)
  id          UUID PK
  user_id     UUID FK → users.id
  license_number VARCHAR(64)
  status      VARCHAR(32)   — active | inactive | suspended
  created_at  TIMESTAMPTZ

vehicles            ← registered by drivers (Sprint 5+)
  id          UUID PK
  driver_id   UUID FK → drivers.id
  plate       VARCHAR(32)   — unique
  make / model / year
  status      VARCHAR(32)   — active | inactive
  created_at  TIMESTAMPTZ

trips               ← core ride entity (Sprint 6+)
  id          UUID PK
  customer_id UUID FK → users.id
  driver_id   UUID FK → drivers.id (nullable)
  status      VARCHAR(32)   — requested | accepted | in_progress | completed | cancelled
  origin_lat/lng, dest_lat/lng
  created_at, updated_at  TIMESTAMPTZ

trip_events         ← append-only audit log
  id          UUID PK
  trip_id     UUID FK → trips.id
  event_type  VARCHAR(64)
  data        JSON
  created_at  TIMESTAMPTZ
```

---

## Local development with PostgreSQL

```bash
# Start the full stack (API + Postgres + frontends)
docker compose up --build

# Run Alembic migrations (first time or after schema changes)
cd apps/api
DATABASE_URL="postgresql+asyncpg://ziza:ziza-local@localhost:5432/ziza" alembic upgrade head
```

`.env` file at repo root (gitignored):
```
DB_PASSWORD=ziza-local
AUTH_DEV_SECRET=dev-secret-change-me
```

---

## Cloud SQL activation (manual step)

When ready to connect production to a real Postgres:

1. Run the provisioning script:
   ```bash
   bash infra/gcp/cloudsql.sh
   ```
2. Copy the output values to GitHub:
   - **Secret** `DATABASE_URL` — the full `postgresql+asyncpg://...` URL
   - **Var** `CLOUD_SQL_INSTANCE` — `project:region:instance-name`
3. Run migrations against Cloud SQL:
   ```bash
   cd apps/api
   DATABASE_URL='<from step 2>' alembic upgrade head
   ```
4. Push to main — the deploy workflow attaches the Cloud SQL instance to `ziza-api` automatically.

---

## `/v1/auth/register` behaviour

| Call | Result |
|------|--------|
| First login (new user) | Insert row → `{ "created": true }` |
| Subsequent logins | Row found → `{ "created": false }` (fields synced if changed) |
| No `DATABASE_URL` set | HTTP 503 `"Database not configured"` |
| No auth token | HTTP 403 |
