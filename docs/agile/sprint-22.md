# Sprint 22 — Localisation chauffeur & ETA

**Période :** Sprint 22  
**Statut :** ✅ Livré

---

## Objectif

Permettre aux chauffeurs de partager leur position GPS en temps réel, et aux clients de consulter la distance et l'ETA (temps d'arrivée estimé) du chauffeur pour leur trajet actif.

---

## Fonctionnalités livrées

### Backend (API FastAPI)

| Endpoint | Rôle | Description |
|---|---|---|
| `PUT /v1/drivers/me/location` | driver | Upsert la position GPS du chauffeur (lat, lng) |
| `GET /v1/drivers/me/location` | driver | Consulte la dernière position enregistrée (404 si aucune) |
| `GET /v1/trips/{id}/eta` | customer | Calcule la distance et l'ETA entre le chauffeur et le point de prise en charge (ou destination) |

**Algorithme ETA :**
- Distance : formule de Haversine (grand cercle WGS-84)
- Vitesse moyenne en ville : 30 km/h
- `eta_min = max(1, round(distance_km / 30 × 60))`
- Référence : origine du trip si statut `accepted`, destination si `in_progress`

### Modèle de données

**Table `driver_locations`** (migration 0016) :
```
driver_id  UUID  FK drivers.id ON DELETE CASCADE  UNIQUE
lat        FLOAT
lng        FLOAT
updated_at DATETIME(tz)
```

Une seule ligne par chauffeur (upsert à chaque mise à jour).

### Frontend — web-driver

- Onglet **📍** dans les tabs → `LocationSection`
- Sélecteur de quartier Abidjan pour la mise à jour rapide (8 landmarks)
- Bouton **🛰️ GPS** → `navigator.geolocation.getCurrentPosition`
- Formulaire de coordonnées manuelles (avancé)
- Affichage de la position courante (lat, lng, heure de mise à jour)

### Frontend — web-customer

- Carte **ETA** affichée dans `BookingSection` quand le trip est `accepted` ou `in_progress`
- Rafraîchissement automatique toutes les 15 secondes
- Affiche : durée (~X min), distance (X.X km), contexte (avant prise en charge / avant arrivée)
- Masquée si le chauffeur n'a pas encore partagé sa position (graceful degradation)

---

## Tests

- **16 nouveaux tests** dans `tests/test_driver_location.py`
- Couverture : auth (PUT, GET, ETA), rôles, upsert idempotent, ETA pending → 404, happy path, distance plausible, shape response
- **Total suite :** 284 tests ✅ (0 échec)

---

## Migration DB

```
0016_add_driver_locations.py
  CREATE TABLE driver_locations (
    id         UUID PRIMARY KEY,
    driver_id  UUID NOT NULL FK drivers.id ON DELETE CASCADE UNIQUE,
    lat        FLOAT NOT NULL,
    lng        FLOAT NOT NULL,
    updated_at DATETIME(tz) NOT NULL
  )
```

---

## Fichiers modifiés

### API
- `app/models/driver_location.py` — modèle `DriverLocation` (NEW)
- `app/models/__init__.py` — import `DriverLocation`
- `app/crud.py` — `_haversine_km`, `upsert_driver_location`, `get_driver_location`, `get_trip_eta`, `CITY_SPEED_KMH`
- `app/main.py` — `LocationRequest`, `LocationResponse`, `EtaResponse`, 3 endpoints Sprint 22
- `alembic/versions/0016_add_driver_locations.py` — migration (NEW)
- `tests/test_driver_location.py` — 16 tests (NEW)

### Frontends
- `apps/web-driver/src/api.js` — `updateDriverLocation`, `getDriverLocation`
- `apps/web-driver/src/App.jsx` — `LocationSection`, onglet 📍, constantes Abidjan
- `apps/web-driver/src/styles.css` — `.location-*`
- `apps/web-customer/src/api.js` — `getTripEta`
- `apps/web-customer/src/App.jsx` — ETA polling dans `BookingSection`, carte ETA
- `apps/web-customer/src/styles.css` — `.eta-card`, `.eta-*`
