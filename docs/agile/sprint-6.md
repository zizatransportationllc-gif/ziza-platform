# Sprint 6 — Trip Booking State Machine

**Duration:** ~1 week
**Goal:** Customer books a ride from an estimate. First end-to-end booking loop: estimate → trip created → cancel if needed.

---

## Deliverables

| # | Livrable | Status |
|---|---|---|
| 1 | `app/models/trip.py` — add `estimate_id`, `fare_xof`, `distance_km`, `duration_min`; status default → `"pending"` | ✅ |
| 2 | Alembic migration `0003_add_trip_fare_fields` | ✅ |
| 3 | `app/crud.py` — `create_trip`, `get_trip`, `list_trips`, `cancel_trip` | ✅ |
| 4 | `POST /v1/trips` — book a trip from estimate_id (201) | ✅ |
| 5 | `GET /v1/trips` — list customer's trips (newest first) | ✅ |
| 6 | `GET /v1/trips/{id}` — trip detail + ordered event log | ✅ |
| 7 | `PATCH /v1/trips/{id}/cancel` — cancel pending/accepted trip | ✅ |
| 8 | web-customer: fare card + "Réserver" button → BookingSection with 5s polling + cancel | ✅ |
| 9 | Tests: 14 tests (state machine, auth, ownership, 409 on invalid cancel) | ✅ |

---

## Trip State Machine

```
         ┌─────────┐
    ┌───▶│ pending │◀── POST /v1/trips
    │    └────┬────┘
    │         │ driver accepts (Sprint 7)
    │    ┌────▼────┐
    │    │accepted │
    │    └────┬────┘
    │         │ driver starts (Sprint 7)
    │    ┌────▼────────┐
    │    │ in_progress │
    │    └────┬────────┘
    │         │ driver completes (Sprint 7)
    │    ┌────▼─────┐
    │    │completed │  (terminal)
    │    └──────────┘
    │
    └──▶ cancelled     (terminal — customer via PATCH …/cancel)
         from: pending | accepted only
```

---

## API Contract

### POST /v1/trips

```http
POST /v1/trips
Authorization: Bearer <token>
Content-Type: application/json

{ "estimate_id": "uuid" }
```

```json
HTTP 201
{
  "trip_id":     "uuid",
  "status":      "pending",
  "fare_xof":    1943,
  "distance_km": 9.62,
  "duration_min": 21,
  "estimate_id": "uuid",
  "origin_lat":  5.3207,
  "origin_lng":  -4.0175,
  "dest_lat":    5.3600,
  "dest_lng":    -3.9801,
  "created_at":  "2026-05-25T01:00:00+00:00",
  "events":      null
}
```

**Error cases:**
| Condition | Status |
|---|---|
| No auth | 401/403 |
| estimate_id not found | 404 |
| Estimate owned by another user | 403 |
| Estimate expired | 422 |
| User not registered | 404 |

### GET /v1/trips/{id}

Returns the trip with `events` list (ordered by `created_at`):

```json
{
  "trip_id": "uuid",
  "status": "pending",
  ...,
  "events": [
    { "event_type": "status_changed", "data": {"from": null, "to": "pending"}, "created_at": "..." }
  ]
}
```

### PATCH /v1/trips/{id}/cancel

Returns the updated trip (status = "cancelled").
Returns **409** if trip is in `in_progress`, `completed`, or already `cancelled`.

---

## Fare Snapshot

When a trip is created from an estimate, these fields are copied and frozen:
- `estimate_id` (reference)
- `fare_xof` (final price locked at booking time)
- `distance_km`
- `duration_min`

The fare cannot change after booking — even if the surge multiplier is updated later.

---

## Event Log

Every state transition appends a `TripEvent` row:

| `event_type` | `data` |
|---|---|
| `status_changed` | `{"from": null\|"pending"\|"accepted", "to": "pending"\|"cancelled"\|...}` |

---

## web-customer UI Flow

```
EstimateSection
  ↓ "Obtenir une estimation" → fare card appears
  ↓ "Réserver ce trajet" → POST /v1/trips
BookingSection (replaces EstimateSection)
  ↓ shows status badge + fare
  ↓ polls GET /v1/trips/{id} every 5 seconds
  ↓ "Annuler le trajet" button (if pending or accepted)
  ↓ terminal state → "Nouvelle estimation" button resets
```

---

## Test Coverage

| Test | Scenario |
|---|---|
| `test_create_trip_from_estimate` | Happy path — 201, trip_id, status=pending |
| `test_create_trip_copies_fare_and_route` | Fare/distance/duration match estimate |
| `test_create_trip_status_is_pending` | Initial status |
| `test_create_trip_requires_auth` | 401/403 without token |
| `test_create_trip_unknown_estimate` | 404 for random UUID |
| `test_create_trip_wrong_user_estimate` | 403 for another user's estimate |
| `test_get_trip_detail_and_events` | Events list with initial status_changed |
| `test_get_trip_wrong_user` | 403 for another user's trip |
| `test_get_trip_not_found` | 404 |
| `test_get_trip_requires_auth` | 401/403 |
| `test_cancel_pending_trip` | 200, status=cancelled |
| `test_cancel_already_cancelled_returns_409` | 409 on double-cancel |
| `test_cancel_trip_wrong_user` | 403 |
| `test_list_trips` | Returns list with ≥2 trips |
| `test_list_trips_requires_auth` | 401/403 |
