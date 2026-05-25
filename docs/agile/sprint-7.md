# Sprint 7 — Driver-side Flow

**Duration:** ~1 week
**Goal:** Driver can register a profile, browse available trips, and drive a full lifecycle: accept → start → complete.

---

## Deliverables

| # | Livrable | Status |
|---|---|---|
| 1 | `app/crud.py` — `upsert_driver`, `list_available_trips`, `get_driver_active_trip`, `accept_trip`, `start_trip`, `complete_trip` | ✅ |
| 2 | `POST /v1/drivers/register` — create/upsert driver profile (driver role only) | ✅ |
| 3 | `GET /v1/trips/driver/available` — pending trips marketplace | ✅ |
| 4 | `GET /v1/trips/driver/active` — driver's current accepted/in_progress trip | ✅ |
| 5 | `PATCH /v1/trips/{id}/accept` — pending → accepted + sets driver_id | ✅ |
| 6 | `PATCH /v1/trips/{id}/start` — accepted → in_progress | ✅ |
| 7 | `PATCH /v1/trips/{id}/complete` — in_progress → completed | ✅ |
| 8 | web-driver: dashboard with available trips list + accept + active trip card + start/complete | ✅ |
| 9 | Tests: 15 tests (driver register, marketplace, full lifecycle) | ✅ |
| 10 | Fix: `_utc()` applied in `get_driver_active_trip` (SQLite tz-naive datetimes) | ✅ |

---

## State Machine — complete picture after Sprint 7

```
POST /v1/trips
      │
      ▼
  ┌───────┐      PATCH …/accept (driver)     ┌──────────┐
  │pending│ ──────────────────────────────▶ │ accepted │
  └───┬───┘                                  └────┬─────┘
      │ PATCH …/cancel (customer)                 │ PATCH …/start (driver)
      │                                           ▼
      │                                    ┌─────────────┐
      │                                    │ in_progress │
      │                                    └──────┬──────┘
      │                                           │ PATCH …/complete (driver)
      │                                           ▼
      │                                    ┌───────────┐
      └──────────────────────────────────▶ │ cancelled │  (terminal)
        or PATCH …/cancel from accepted    └───────────┘
                                           ┌───────────┐
                                           │ completed │  (terminal)
                                           └───────────┘
```

---

## New API Endpoints

### POST /v1/drivers/register

Creates or returns the Driver profile for the authenticated driver user.
- Requires `role="driver"` (403 otherwise)
- Idempotent — safe to call on every login
- Returns `{ driver_id, user_id, status, license_number, created }`

### GET /v1/trips/driver/available

Returns all trips in `pending` status, newest first.
- Requires `role="driver"` (403 otherwise)
- No pagination (Sprint 8+)

### GET /v1/trips/driver/active

Returns `{ trip: TripResponse | null }`.
- `trip` is the driver's most-recently created accepted/in_progress trip
- `null` when driver is free

### PATCH /v1/trips/{id}/accept

- Driver must have an active driver profile
- Trip must be in `pending` status (409 otherwise)
- Sets `trip.driver_id`, transitions to `accepted`
- Logs `status_changed` event with driver_id

### PATCH /v1/trips/{id}/start

- Driver must own the trip (`driver_id == this driver`)
- Trip must be `accepted` (409 otherwise)
- Transitions to `in_progress`

### PATCH /v1/trips/{id}/complete

- Driver must own the trip
- Trip must be `in_progress` (409 otherwise)
- Transitions to `completed` (terminal)

---

## web-driver UI

```
Login screen
  ↓ auto-registers user row + driver profile on every login

Dashboard:
  ┌─ has active trip? ──────────────────────────┐
  │                                              │
  ▼ YES                                         ▼ NO
ActiveTripCard                          AvailableTripsSection
  ● status badge (accepted/in_progress)   ● live-polled every 5s
  ● fare + distance                        ● each card: fare + distance
  ● "Démarrer" (if accepted)               ● "Accepter" button
  ● "Terminer" (if in_progress)
  ● auto-clear 3s after completed/cancelled
```

---

## Test Coverage (`test_driver_trips.py`)

| Test | Scenario |
|---|---|
| `test_driver_register` | 200 + driver_id + status=active |
| `test_driver_register_is_idempotent` | Same driver_id, created=False |
| `test_driver_register_customer_role_forbidden` | 403 for customer |
| `test_list_available_trips_as_driver` | Returns pending trips |
| `test_list_available_trips_customer_forbidden` | 403 for customer |
| `test_accept_trip` | pending → accepted |
| `test_accept_already_accepted_trip_returns_409` | 409 |
| `test_accept_trip_customer_role_forbidden` | 403 |
| `test_start_trip` | accepted → in_progress |
| `test_start_pending_trip_returns_409` | 403/409 — wrong driver |
| `test_complete_trip` | in_progress → completed |
| `test_complete_accepted_trip_returns_409` | 409 |
| `test_driver_active_trip_after_accept` | Returns active trip |
| `test_completed_trip_not_in_active` | Completed trip excluded |
| `test_full_trip_lifecycle` | Events = [pending, accepted, in_progress, completed] |

**Total: 58 tests across all sprints — 58 passing.**
