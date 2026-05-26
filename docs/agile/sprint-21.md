# Sprint 21 — Catégories de véhicules (Economy / Comfort / Premium)

**Période :** Sprint 21  
**Statut :** ✅ Livré

---

## Objectif

Permettre aux clients de choisir une catégorie de véhicule lors de la réservation d'un trajet, et aux chauffeurs de déclarer la catégorie de leur véhicule.  
Trois catégories sont disponibles : **Économique**, **Confort** et **Premium**, avec des multiplicateurs tarifaires distincts.

---

## Fonctionnalités livrées

### Backend (API FastAPI)

| Fonctionnalité | Détail |
|---|---|
| `GET /v1/categories` | Retourne les 3 catégories avec label, description, multiplicateur |
| `POST /v1/estimate` | Retourne maintenant un dict `categories` avec les tarifs par catégorie |
| `POST /v1/trips` | Accepte un paramètre `category` ("economy" \| "comfort" \| "premium") |
| `POST /v1/drivers/me/vehicle` | Accepte `category` pour déclarer le type de véhicule |
| Multiplicateurs | economy=1.0, comfort=1.4, premium=2.0 |
| Compatibilité descendante | Le champ `fare_xof` top-level reste le tarif économique |

### Modèles de données

- **`vehicles.category`** — colonne `VARCHAR(32)`, défaut `"economy"` (migration 0015)
- **`trips.category`** — colonne `VARCHAR(32)`, défaut `"economy"` (migration 0015)

### Frontend — web-customer

- Sélecteur de catégorie : 3 cartes (Économique / Confort / Premium) avec icône, tarif et description
- Réservation avec la catégorie sélectionnée
- Badge de catégorie affiché dans le suivi du trajet (vert/bleu/amber)
- Code promo appliqué au tarif de la catégorie choisie
- Picker de lieux enregistrés fonctionnel pour toutes les catégories

### Frontend — web-driver

- Sélecteur de catégorie dans le formulaire d'enregistrement du véhicule
- Affichage de la catégorie du véhicule enregistré
- Badge de catégorie sur les missions confort/premium dans la liste dispatch

---

## Multiplicateurs tarifaires

| Catégorie | Multiplicateur | Description |
|---|---|---|
| economy | ×1.0 | Trajet standard au meilleur prix |
| comfort | ×1.4 | Véhicule spacieux et climatisé |
| premium | ×2.0 | Berline haut de gamme |

> Les multiplicateurs sont appliqués sur le tarif de base (incluant le surge), avant application du code promo.

---

## Tests

- **16 nouveaux tests** dans `tests/test_vehicle_categories.py`
- Couverture : catégories listing, tarifs ordonnés, trips avec catégorie, véhicules avec catégorie, validation 422
- **Total suite :** 268 tests ✅ (0 échec)

---

## Migration DB

```
0015_add_vehicle_categories.py
  ALTER TABLE vehicles ADD COLUMN category VARCHAR(32) NOT NULL DEFAULT 'economy'
  ALTER TABLE trips    ADD COLUMN category VARCHAR(32) NOT NULL DEFAULT 'economy'
```

---

## Fichiers modifiés

### API
- `app/models/vehicle.py` — champ `category`
- `app/models/trip.py` — champ `category`
- `app/crud.py` — constantes catégories, `create_trip` + `upsert_vehicle` avec `category`
- `app/main.py` — `GET /v1/categories`, `EstimateResponse.categories`, `TripRequest.category`, `VehicleRequest.category`
- `alembic/versions/0015_add_vehicle_categories.py` — migration
- `tests/test_vehicle_categories.py` — 16 tests (NEW)
- `tests/test_vehicles.py` — assertion `created` assouplie (ordre alphabétique test DB partagé)

### Frontends
- `apps/web-customer/src/api.js` — `listCategories`, `createTrip` avec `category`
- `apps/web-customer/src/App.jsx` — sélecteur catégorie, badge suivi
- `apps/web-customer/src/styles.css` — `.category-picker`, `.category-card`, `.booking-category`
- `apps/web-driver/src/api.js` — `listCategories`, `registerVehicle` avec `category`
- `apps/web-driver/src/App.jsx` — sélecteur catégorie véhicule, badge dispatch
- `apps/web-driver/src/styles.css` — `.vehicle-category-*`, `.dispatch-category`
