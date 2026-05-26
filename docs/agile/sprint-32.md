# Sprint 32 — Multi-ville & Géofencing

## Objectif

Étendre la plateforme Ziza au-delà d'Abidjan en introduisant un système de gestion des villes desservies et des zones de service géographiques. Les courses et estimations pourront être filtrées par ville. L'admin peut activer/désactiver des villes et créer des zones de service.

**Gaps adressés : #15**  
**Origine roadmap : Phase 7, Sprint 16**

---

## Modèles de données

### Nouvelle table `cities` (migration 0026)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | UUID PK | Identifiant |
| `name` | String(64) UNIQUE | Nom de la ville |
| `country` | String(64) | Pays (défaut: Côte d'Ivoire) |
| `center_lat` | Float | Latitude du centre |
| `center_lng` | Float | Longitude du centre |
| `radius_km` | Float | Rayon de service en km |
| `active` | Boolean | Ville active ou non |
| `created_at` | DateTime | Date de création |

### Nouvelle table `service_zones` (migration 0026)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | UUID PK | Identifiant |
| `city_id` | UUID FK | Référence à la ville (CASCADE delete) |
| `name` | String(128) | Nom de la zone (ex: "Zone Centre-ville") |
| `polygon_geojson` | Text | Polygone GeoJSON (optionnel) |
| `active` | Boolean | Zone active ou non |
| `created_at` | DateTime | Date de création |

### Villes par défaut seedées

| Ville | Centre | Rayon | Active |
|-------|--------|-------|--------|
| Abidjan | 5.3364, -4.0267 | 40 km | ✅ |
| Bouaké | 7.6906, -5.0298 | 20 km | ❌ |
| Yamoussoukro | 6.8276, -5.2893 | 20 km | ❌ |

---

## Endpoints API

### Public
- `GET /v1/cities` — liste les villes actives (seed auto si vide)
- `GET /v1/cities/{id}` — détail d'une ville
- `GET /v1/service-zones` — liste les zones actives (filtrable par city_id)
- `GET /v1/geo/point-in-service?lat=&lng=` — vérifie si un point est dans une zone de service

### Admin
- `GET  /v1/admin/cities` — liste toutes les villes (actives + inactives)
- `POST /v1/admin/cities` — crée une nouvelle ville (409 si nom déjà pris)
- `PATCH /v1/admin/cities/{id}` — mise à jour partielle (activer/désactiver, changer rayon)
- `POST /v1/admin/service-zones` — crée une zone de service
- `GET  /v1/admin/service-zones` — liste toutes les zones (actives + inactives)

---

## Fonctionnalités géospatiales

### Helper `_haversine_km(lat1, lng1, lat2, lng2)`
Calcul de distance sphérique entre deux points (formule de Haversine). Utilisé pour :
- Vérifier si un point est dans le rayon d'une ville
- Filtre dispatch par rayon (Sprint 31)

### `point_in_city_radius(lat, lng, city) → bool`
Retourne True si le point est dans le rayon de service de la ville.

### `find_city_for_point(db, lat, lng) → City | None`
Cherche la première ville active qui couvre le point. Utilisé par l'endpoint `/v1/geo/point-in-service`.

---

## Frontend web-admin

### CitiesPanel (nouveau)
- Liste toutes les villes avec leur statut (active/inactive)
- Formulaire création ville (nom, pays, lat/lng, rayon)
- Bouton toggle active/inactive par ville
- Onglet "🌍 Villes" dans la navigation

---

## Tests (18 nouveaux)

| Fichier | Tests | Contenu |
|---------|-------|---------|
| `test_cities.py` | 6 | CRUD villes, guards, 409, 403 |
| `test_service_zones.py` | 5 | CRUD zones, public active only, admin all |
| `test_geo_filter.py` | 7 | Haversine, point_in_radius, city detail, 404, 422 |

---

## Résumé des fichiers modifiés/créés

```
apps/api/
  app/models/city.py                          (NOUVEAU)
  app/models/__init__.py                      (modifié — City, ServiceZone)
  alembic/versions/0026_cities_service_zones.py (NOUVEAU)
  app/crud.py                                 (modifié — Sprint 32 CRUD)
  app/main.py                                 (modifié — Sprint 32 endpoints)
  tests/test_cities.py                        (NOUVEAU)
  tests/test_service_zones.py                 (NOUVEAU)
  tests/test_geo_filter.py                    (NOUVEAU)

apps/web-admin/
  src/App.jsx    (modifié — CitiesPanel, onglet Villes, subtitle Sprint 32)
  src/api.js     (modifié — adminListCities, adminCreateCity, adminUpdateCity, listCities, checkPointInService)
  src/styles.css (modifié — Sprint 32 CSS)

apps/web-customer/src/App.jsx  (subtitle + footer Sprint 32)
apps/web-driver/src/App.jsx    (subtitle + footer Sprint 32)

docs/agile/sprint-32.md  (CE FICHIER)
```

---

*Sprint 32 terminé — 2026-05-26*
