# Sprint 11 — Driver Earnings & Admin Statistics

**Date:** 2026-05-25
**Status:** Done

## Objectif

Donner aux chauffeurs une vue de leurs gains (total, aujourd'hui, semaine)
et fournir à l'administrateur un tableau de bord avec des statistiques
plateforme et la liste complète des courses.

## Travail réalisé

### Backend (`apps/api`)

| Fichier | Changement |
|---|---|
| `app/crud.py` | 3 nouvelles fonctions : `get_driver_earnings`, `admin_get_stats`, `admin_list_trips` |
| `app/main.py` | 3 nouveaux endpoints + modèles Pydantic `DriverEarningsSummary`, `AdminStats`, `AdminTripRecord` |
| `tests/test_earnings.py` | 11 nouveaux tests |

### Endpoints

| Méthode | URL | Auth | Description |
|---|---|---|---|
| `GET` | `/v1/drivers/me/earnings` | driver | Résumé des gains (total · aujourd'hui · semaine · 10 dernières courses) |
| `GET` | `/v1/admin/stats` | admin | Statistiques plateforme (courses par statut, CA, assistances, chauffeurs) |
| `GET` | `/v1/admin/trips` | admin | Liste de toutes les courses avec email client (`?limit=50&offset=0`) |

### Structure de réponse

**`GET /v1/drivers/me/earnings`**
```json
{
  "total_xof": 45000,
  "total_trips": 12,
  "today_xof": 5000,
  "today_trips": 2,
  "week_xof": 18500,
  "week_trips": 6,
  "recent_trips": [{ "trip_id": "...", "fare_xof": 4200, "distance_km": 7.3, "duration_min": 18, "completed_at": "..." }]
}
```

**`GET /v1/admin/stats`**
```json
{
  "trips": { "total": 42, "by_status": { "completed": 30, "pending": 5, ... }, "total_revenue_xof": 210000 },
  "assistance": { "total": 8, "by_status": { "resolved": 5, "pending": 2, ... } },
  "drivers": { "total": 3, "by_status": { "active": 3 } }
}
```

### Tests (`tests/test_earnings.py`) — 11 tests

- `test_driver_earnings_zero_state` — shape, toutes les clés présentes
- `test_driver_earnings_after_completed_trip` — total augmente après complétion
- `test_driver_earnings_recent_trips_shape` — champs de chaque enregistrement
- `test_driver_earnings_requires_driver_role` — 403 pour customer
- `test_driver_earnings_requires_auth` — 401/403 sans token
- `test_admin_stats_shape` — sections trips/assistance/drivers présentes
- `test_admin_stats_reflects_completed_trip` — revenue augmente
- `test_admin_stats_requires_admin_role` — 403 pour driver
- `test_admin_trips_list` — liste avec champs requis
- `test_admin_trips_pagination` — limit/offset fonctionnent
- `test_admin_trips_requires_admin_role` — 403 pour driver

**Suite complète : 111/111 tests passent.**

### Frontend `web-driver`

- `EarningsCard` : total XOF gagné, compteur de courses, panels "Aujourd'hui" et "Cette semaine"
- Rechargement automatique après chaque course complétée (2s de délai)
- `api.js` : `getMyEarnings(token)`
- `styles.css` : `.earnings-card`, `.earnings-periods`, `.period-*`

### Frontend `web-admin` (extension Sprint 10)

- Navigation à 3 onglets : **📊 Stats** / **🚕 Courses** / **🧑‍✈️ Chauffeurs**
- `StatsPanel` : 4 cartes (Courses totales, CA, Assistances, Chauffeurs)
- `TripsPanel` : liste paginée de toutes les courses avec badge de statut, email client, montant, distance, date — 10 courses/page
- `api.js` : `adminGetStats()`, `adminListTrips(limit, offset)`
- `styles.css` : `.admin-tabs`, `.stats-grid`, `.stat-card`, `.trip-list-admin`, `.trip-row`, badges de statut, `.pagination`

## Critères d'acceptation

- [x] GET /v1/drivers/me/earnings → total_xof, today_xof, week_xof, recent_trips
- [x] Gains augmentent après complétion d'une course
- [x] GET /v1/admin/stats → counts par statut + revenue total
- [x] GET /v1/admin/trips → liste paginée avec customer_email
- [x] Tous les endpoints admin → 403 pour les non-admins
- [x] 111/111 tests verts en CI
- [x] web-driver : EarningsCard avec total + périodes
- [x] web-admin : 3 onglets, stats cards, trip list paginée
