# Sprint 10 — Driver Capability Specialisation

**Date:** 2026-05-25
**Status:** Done

## Objectif

Permettre aux chauffeurs de déclarer les types d'assistance qu'ils gèrent
(spécialisation), filtrer le dispatch en conséquence, calculer un temps
d'arrivée estimé (ETA) à l'acceptation, et donner à l'administrateur une
interface de gestion des compétences.

## Travail réalisé

### Backend (`apps/api`)

| Fichier | Changement |
|---|---|
| `app/models/driver_capability.py` | Nouveau modèle `DriverCapability` (id, driver_id, type, created_at) + contrainte unique (driver_id, type) |
| `app/models/assistance.py` | Colonne `eta_min` (Integer, nullable) |
| `app/models/__init__.py` | Export de `DriverCapability` |
| `alembic/versions/0006_add_driver_capabilities.py` | Migration : table `driver_capabilities` + index driver_id + colonne `eta_min` sur `assistance_requests` |
| `app/crud.py` | Helpers haversine + ETA · 5 nouvelles fonctions CRUD capabilities · `list_available_assistance` filtré · `accept_assistance` stocke eta_min |
| `app/main.py` | 4 nouveaux endpoints capabilities/admin · `AssistanceResponse` étendu avec `eta_min` |

### Types de compétences
Identiques aux types d'assistance : `breakdown` · `flat_tyre` · `tow` · `fuel` · `lockout`

### Logique de dispatch
- Chauffeur **sans compétences déclarées** → voit **toutes** les demandes pending
- Chauffeur **avec compétences** → voit uniquement les demandes des types correspondants

### Calcul ETA
Stocké lors de l'acceptation (`accept_assistance`) :
- Distance haversine entre le centre-ville d'Abidjan (lat 5.345317, lng -4.024429) et les coordonnées du client
- Formule : `max(5, round(dist_km / 30 * 60) + 5)` minutes (vitesse moy. 30 km/h + 5 min de base)

### Endpoints

| Méthode | URL | Auth | Description |
|---|---|---|---|
| `GET` | `/v1/drivers/me/capabilities` | driver | Liste ses compétences (vide = toutes) |
| `PUT` | `/v1/drivers/me/capabilities` | driver | Remplace ses compétences |
| `GET` | `/v1/admin/drivers` | admin | Liste tous les chauffeurs + compétences |
| `PUT` | `/v1/admin/drivers/{driver_id}/capabilities` | admin | Remplace les compétences d'un chauffeur |

### Tests (`tests/test_capabilities.py`) — 13 tests

- `test_driver_get_capabilities_empty` — capabilities vides par défaut
- `test_driver_set_capabilities` — set + GET confirm
- `test_driver_set_invalid_capability_returns_422`
- `test_capabilities_endpoint_requires_driver_role` — GET + PUT → 403 pour customer
- `test_dispatch_filters_by_capability` — [tow] ne voit pas breakdown
- `test_dispatch_no_filter_when_no_capabilities` — vide = tout visible
- `test_dispatch_matches_declared_capability` — [breakdown] voit breakdown
- `test_eta_set_on_accept` — eta_min > 0 dans la réponse accept
- `test_admin_list_drivers` — liste avec champ capabilities
- `test_admin_list_drivers_requires_admin_role` — 403 pour driver
- `test_admin_set_driver_capabilities` — admin peut modifier un chauffeur
- `test_admin_set_driver_capabilities_invalid_type_returns_422`
- `test_admin_set_capabilities_requires_admin_role` — 403 pour driver

**Suite complète : 100/100 tests passent.**

### Frontend `web-admin` (refonte complète)

- Dashboard admin entièrement reconstruit (Sprint 3 → Sprint 10)
- `DriversPanel` : liste tous les chauffeurs avec leurs compétences actuelles
- `DriverRow` : badge de statut (active/inactive/suspended), chips de compétences, bouton « Compétences »
- `CapabilityEditor` : éditeur inline avec 5 boutons toggle, sauvegarde via `PUT /v1/admin/drivers/{id}/capabilities`
- `api.js` : `adminListDrivers()`, `adminSetDriverCapabilities()`
- `styles.css` : layout admin (max-width 640px), `.driver-card`, `.driver-caps`, `.cap-chip`, `.cap-editor`, `.cap-grid`, `.cap-btn`

## Critères d'acceptation

- [x] GET/PUT /v1/drivers/me/capabilities — driver lit et modifie ses compétences
- [x] Type invalide → 422
- [x] Dispatch filtré : driver avec capabilities ne voit que les types correspondants
- [x] Dispatch non filtré : capabilities vides → tout visible
- [x] eta_min présent et > 0 après accept_assistance
- [x] GET /v1/admin/drivers → liste avec capabilities pour chaque chauffeur
- [x] PUT /v1/admin/drivers/{id}/capabilities → admin peut modifier n'importe quel chauffeur
- [x] 100/100 tests verts en CI
- [x] web-admin : liste chauffeurs, chips compétences, éditeur inline toggle
