# Sprint 5 — Pricing & Estimate

**Duration:** ~1 week
**Goal:** Customer gets a fare estimate before booking. First step of the ride-share loop.

---

## Deliverables

| # | Livrable | Status |
|---|---|---|
| 1 | `app/pricing.py` — Haversine + Google Maps Distance Matrix fallback | ✅ |
| 2 | `app/models/estimate.py` — Estimate model (15 min TTL) | ✅ |
| 3 | `POST /v1/estimate` — returns `{distance_km, duration_min, fare_xof, estimate_id}` | ✅ |
| 4 | Fare config in `Settings` (`fare_base_xof`, `fare_per_km_xof`, `fare_surge_multiplier`) | ✅ |
| 5 | Alembic migration `0002_add_estimates` | ✅ |
| 6 | web-customer: estimate form with 8 Abidjan landmarks + fare card | ✅ |
| 7 | Tests: 11 tests (unit pricing + API contract) | ✅ |

---

## Fare formula

```
fare_xof = max(base_fare, round((base_fare + distance_km × per_km_rate) × surge))
```

| Parameter | Default | Description |
|---|---|---|
| `fare_base_xof` | 500 XOF | Minimum / base fare (~$0.85) |
| `fare_per_km_xof` | 150 XOF | Rate per kilometre (~$0.25) |
| `fare_surge_multiplier` | 1.0 | Peak-hour multiplier (placeholder) |
| `fare_estimate_ttl_minutes` | 15 | Estimate validity window |

**Example:** Plateau → Cocody (~8 km road) → **1 700 XOF** (~$2.85)

---

## Distance source

| Condition | Source | Distance |
|---|---|---|
| `GOOGLE_MAPS_API_KEY` set | Google Maps Distance Matrix API | Real road distance + traffic |
| No API key (dev / CI) | Haversine × 1.30 road factor | Estimated road distance |

To enable Google Maps: add `GOOGLE_MAPS_API_KEY` as a GitHub secret and pass it to the API deploy step.

---

## API contract

```http
POST /v1/estimate
Authorization: Bearer <token>
Content-Type: application/json

{
  "origin_lat": 5.3207,
  "origin_lng": -4.0175,
  "dest_lat":   5.3600,
  "dest_lng":  -3.9801
}
```

```json
{
  "estimate_id":     "uuid",
  "distance_km":     9.62,
  "duration_min":    21,
  "fare_xof":        1943,
  "currency":        "XOF",
  "surge_multiplier": 1.0,
  "distance_source": "haversine",
  "expires_at":      "2026-05-25T01:15:00+00:00"
}
```

`estimate_id` will be used by `POST /v1/trips` in Sprint 6.

---

## web-customer UI

After login, the dashboard shows an **estimate form** with:
- Départ / Arrivée dropdowns — 8 Abidjan landmarks
- "Obtenir une estimation" button
- Fare card showing: **amount in XOF**, distance, duration, surge indicator
