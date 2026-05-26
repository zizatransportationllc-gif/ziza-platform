# Sprint 23 — Corrections techniques & alignement roadmap

**Période :** Sprint 23  
**Statut :** 🔲 Planifié  
**Origine :** Revue complète roadmap vs sprints livrés (Sprints 1–22)

---

## Contexte

Une revue systématique de la roadmap initiale vs les sprints effectivement livrés a révélé
des écarts techniques accumulés. Ce sprint les adresse par ordre de criticité, avant d'entamer
les grandes fonctionnalités manquantes (paiements, mobile, sécurité — Sprints 24+).

---

## Objectifs

1. **Tracking temps réel** — livrer les endpoints manquants du Sprint 8 roadmap (`GET /v1/trips/{id}/tracking`, colonnes `current_lat/lng/last_seen_at` sur `drivers`)
2. **Dispatch par proximité** — utiliser les positions réelles des chauffeurs dans le dispatch (Sprint 7 gap)
3. **ETA sur position réelle** — corriger le calcul ETA du Sprint 10 (fixé sur le centre d'Abidjan)
4. **Auditabilité** — ajouter le champ `actor` sur `trip_events` (Sprint 6 gap)
5. **Logs enrichis** — ajouter `user_id` et `trip_id` dans les logs structurés (Sprint 19 gap)
6. **Tests de robustesse** — test de concurrence multi-driver sur l'acceptation d'un trip (Sprint 7 gap)
7. **Token refresh** — documenter et tester le comportement du token Firebase (Sprint 3 gap)

---

## Endpoints ajoutés / modifiés

| Méthode | Route | Rôle | Description |
|---------|-------|------|-------------|
| `POST` | `/v1/drivers/me/location` | driver | Alias de `PUT /v1/drivers/me/location` — compatibilité roadmap Sprint 8 |
| `GET` | `/v1/trips/{id}/tracking` | customer | Retourne la position courante du chauffeur pour un trip actif |

> `PUT /v1/drivers/me/location` et `GET /v1/drivers/me/location` existent déjà (Sprint 22).  
> `GET /v1/trips/{id}/tracking` est le chaînon manquant côté customer.

---

## Modèle de données

### Table `drivers` — 3 colonnes ajoutées

```
current_lat     FLOAT       NULL  — latitude courante (mise à jour à chaque PUT location)
current_lng     FLOAT       NULL  — longitude courante
last_seen_at    DATETIME    NULL  — horodatage de la dernière mise à jour
```

Migration : `0017_add_driver_current_location.py`

> Ces colonnes coexistent avec `driver_locations` (Sprint 22). La table `driver_locations`
> reste l'historique ; `drivers.current_*` est le snapshot dénormalisé pour les requêtes rapides
> (dispatch, tracking).

### Table `trip_events` — 1 colonne ajoutée

```
actor    VARCHAR(16)   NULL  — "customer" | "driver" | "system"
```

Migration : `0018_add_trip_event_actor.py`

> `NULL` sur les lignes existantes — pas de rétro-compatibilité nécessaire, les anciennes lignes
> resteront sans acteur.

---

## Logique métier

### GET /v1/trips/{id}/tracking

```
- Vérifie que le trip appartient au customer authentifié
- Vérifie que le trip est en statut accepted ou in_progress
- Lit drivers.current_lat / current_lng / last_seen_at du chauffeur assigné
- Si driver_id null ou colonnes null → 404 { "detail": "Driver location not available" }
- Réponse : { driver_lat, driver_lng, last_seen_at, trip_status }
```

**Réponse HTTP 200 :**
```json
{
  "driver_lat": 5.3489,
  "driver_lng": -4.0167,
  "last_seen_at": "2026-05-26T10:32:15+00:00",
  "trip_status": "accepted"
}
```

### Synchronisation driver_locations → drivers

À chaque appel `PUT /v1/drivers/me/location` (existant Sprint 22), en plus de l'upsert dans
`driver_locations`, mettre à jour `drivers.current_lat / current_lng / last_seen_at`.

### Dispatch par proximité (GET /v1/trips/driver/available)

Modifier `list_available_trips` dans `crud.py` :
- Si le chauffeur a une position (`current_lat` non null) → trier les trips par distance
  haversine croissante entre l'origine du trip et la position du chauffeur
- Si pas de position connue → comportement actuel (tous les trips, sans tri)

```python
# Tri dans Python après fetch (pas de geo-index en SQLite)
if driver.current_lat is not None:
    trips.sort(key=lambda t: _haversine_km(
        driver.current_lat, driver.current_lng,
        t.origin_lat or 0, t.origin_lng or 0
    ))
```

### ETA Sprint 10 — position réelle

Modifier `accept_assistance` dans `crud.py` :
- Lire `driver.current_lat / current_lng` au lieu du centre d'Abidjan codé en dur
- Fallback sur le centre d'Abidjan si `current_lat` est null (comportement actuel préservé)

```python
driver_lat = getattr(driver, "current_lat", None) or 5.345317
driver_lng = getattr(driver, "current_lng", None) or -4.024429
eta_min = max(5, round(_haversine_km(driver_lat, driver_lng, req.lat, req.lng) / 30 * 60) + 5)
```

### Actor sur trip_events

Passer `actor` dans toutes les créations de `TripEvent` :

| Transition | Actor |
|---|---|
| `create_trip` | `"customer"` |
| `cancel_trip` | `"customer"` |
| `accept_trip` | `"driver"` |
| `start_trip` | `"driver"` |
| `complete_trip` | `"driver"` |
| Transitions système futures | `"system"` |

### Logs structurés enrichis

Modifier `RequestLoggingMiddleware` dans `app/middleware/logging.py` :

```python
log_entry = {
    "request_id": request_id,
    "method":     request.method,
    "path":       request.url.path,
    "status_code": response.status_code,
    "duration_ms": duration_ms,
    # Ajouts Sprint 23
    "user_id":    getattr(request.state, "user_id", None),
    "trip_id":    _extract_trip_id(request.url.path),
}
```

`_extract_trip_id` : regex simple sur le path (`/v1/trips/{uuid}/...` → extrait l'UUID).  
`user_id` : renseigné par un middleware aval qui lit le JWT si présent (header Authorization).

---

## Tests nouveaux

### `tests/test_tracking.py` — 8 tests

| # | Test |
|---|---|
| 1 | `test_tracking_returns_driver_location_on_accepted_trip` |
| 2 | `test_tracking_returns_location_on_in_progress_trip` |
| 3 | `test_tracking_returns_404_when_no_driver_location` |
| 4 | `test_tracking_returns_404_on_pending_trip` |
| 5 | `test_tracking_requires_auth` |
| 6 | `test_tracking_wrong_customer_returns_403` |
| 7 | `test_location_update_syncs_driver_current_position` |
| 8 | `test_dispatch_sorted_by_proximity_when_location_known` |

### `tests/test_concurrency.py` — 2 tests

| # | Test |
|---|---|
| 1 | `test_two_drivers_accept_same_trip_one_wins_one_409` |
| 2 | `test_two_drivers_accept_same_assistance_one_wins_one_409` |

### Modifications `tests/test_trip_events.py` — 3 tests ajoutés

| # | Test |
|---|---|
| 1 | `test_trip_event_actor_is_customer_on_create` |
| 2 | `test_trip_event_actor_is_driver_on_accept` |
| 3 | `test_trip_event_actor_is_driver_on_complete` |

### `tests/test_token_refresh.py` — 3 tests

| # | Test |
|---|---|
| 1 | `test_dev_token_expires_after_ttl` (mock time) |
| 2 | `test_expired_token_returns_401` |
| 3 | `test_firebase_adapter_rejects_expired_token` (mock firebase-admin) |

---

## Frontend web-customer

### Carte de tracking dans `BookingSection`

Quand le trip est `accepted` ou `in_progress` :
- Poll `GET /v1/trips/{id}/tracking` toutes les **5 secondes** (≠ ETA qui poll à 15s)
- Afficher un indicateur de position chauffeur :

```jsx
{driverLocation && (
  <div className="tracking-card">
    <span className="tracking-icon">📍</span>
    <div className="tracking-info">
      <span className="tracking-label">Position du chauffeur</span>
      <span className="tracking-coords">
        {driverLocation.driver_lat.toFixed(4)}, {driverLocation.driver_lng.toFixed(4)}
      </span>
      <span className="tracking-updated">
        Mis à jour {formatRelative(driverLocation.last_seen_at)}
      </span>
    </div>
  </div>
)}
```

- Arrêt du polling dès que le trip passe en `completed` ou `cancelled`
- Dégradation gracieuse si 404 (chauffeur n'a pas partagé sa position)

### Ajout dans `api.js`

```javascript
// ---------------------------------------------------------------------------
// Driver tracking — Sprint 23
// ---------------------------------------------------------------------------

export async function getTripTracking(token, tripId) {
  const res = await fetch(`${API_BASE}/v1/trips/${tripId}/tracking`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (res.status === 404) return null;
  return _json(res); // { driver_lat, driver_lng, last_seen_at, trip_status }
}
```

---

## Fichiers modifiés

### API
| Fichier | Changement |
|---------|-----------|
| `app/models/driver.py` | + `current_lat`, `current_lng`, `last_seen_at` |
| `app/models/trip.py` | + `actor` sur `TripEvent` |
| `app/crud.py` | `upsert_driver_location` sync drivers, `list_available_trips` tri proximité, `accept_assistance` ETA réel, `_append_event` passe actor |
| `app/main.py` | `TrackingResponse`, `GET /v1/trips/{id}/tracking` |
| `app/middleware/logging.py` | + `user_id`, `trip_id` dans log entry |
| `alembic/versions/0017_add_driver_current_location.py` | Nouvelle migration |
| `alembic/versions/0018_add_trip_event_actor.py` | Nouvelle migration |
| `tests/test_tracking.py` | Nouveau (8 tests) |
| `tests/test_concurrency.py` | Nouveau (2 tests) |
| `tests/test_trip_events.py` | +3 tests actor |
| `tests/test_token_refresh.py` | Nouveau (3 tests) |

### Frontend web-customer
| Fichier | Changement |
|---------|-----------|
| `apps/web-customer/src/api.js` | + `getTripTracking` |
| `apps/web-customer/src/App.jsx` | `BookingSection` : tracking poll 5s, `.tracking-card` |
| `apps/web-customer/src/styles.css` | `.tracking-card`, `.tracking-icon`, `.tracking-info`, `.tracking-coords`, `.tracking-updated` |

---

## Ce que ce sprint NE couvre pas (Sprints 24+)

Les items suivants ont été identifiés lors de la revue roadmap mais nécessitent chacun un sprint dédié :

| Item | Sprint cible suggéré |
|------|---------------------|
| 💳 Intégration paiement (Stripe / Orange Money) | Sprint 24 |
| 🔒 Security hardening (Secret Manager, WAF, JWT refresh, OWASP) | Sprint 25 |
| 🔔 Notifications externes (FCM push, email SendGrid, SMS AfricasTalking) | Sprint 26 |
| 📱 Application mobile customer (React Native + Expo) | Sprint 27 |
| 📱 Application mobile driver (React Native + Expo) | Sprint 28 |
| 💰 Payout batch avec commission configurable | Sprint 29 |
| 🧑‍💼 Workflow candidature chauffeur (driver_applications) | Sprint 30 |
| 📈 Performance (Redis cache, CDN, Locust, connection pooling) | Sprint 31 |

---

## Estimation tests

**Tests existants :** 284  
**Nouveaux tests Sprint 23 :** 16  
**Total cible :** 300 ✅
