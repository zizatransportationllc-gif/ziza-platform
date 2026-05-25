# Sprint 9 — Roadside Assistance

**Date:** 2026-05-25
**Status:** Done

## Objectif

Permettre aux clients de créer une demande d'assistance routière (panne,
pneu crevé, remorquage, carburant, clés perdues) et aux chauffeurs de
traiter ces demandes dans un dispatch unifié avec les trajets normaux.

## Travail réalisé

### Backend (`apps/api`)

| Fichier | Changement |
|---|---|
| `app/models/assistance.py` | Nouveau modèle `AssistanceRequest` (id, customer_id, driver_id, type, status, lat, lng, note, timestamps) |
| `app/models/__init__.py` | Export de `AssistanceRequest` |
| `alembic/versions/0005_add_assistance_requests.py` | Migration : table `assistance_requests` + index customer_id, driver_id, status |
| `app/crud.py` | 9 nouvelles fonctions CRUD assistance |
| `app/main.py` | 8 nouveaux endpoints assistance |

### Types d'assistance
`breakdown` · `flat_tyre` · `tow` · `fuel` · `lockout`

### State machine
`pending → accepted → in_progress → resolved | cancelled`

### Endpoints

| Méthode | URL | Auth | Description |
|---|---|---|---|
| `POST` | `/v1/assistance` | customer | Crée une demande (type + lat/lng + note opt.) |
| `GET` | `/v1/assistance/driver/available` | driver | Demandes pending (marketplace) |
| `GET` | `/v1/assistance/driver/active` | driver | Demande active du chauffeur |
| `GET` | `/v1/assistance/{id}` | customer | Détail de sa demande |
| `PATCH` | `/v1/assistance/{id}/cancel` | customer | Annule si pending (409 sinon) |
| `PATCH` | `/v1/assistance/{id}/accept` | driver | Accepte → accepted |
| `PATCH` | `/v1/assistance/{id}/start` | driver | Démarre → in_progress |
| `PATCH` | `/v1/assistance/{id}/resolve` | driver | Résout → resolved |

### Tests (`tests/test_assistance.py`) — 16 tests

- `test_create_assistance_breakdown` — 201, tous les champs
- `test_create_assistance_with_note` — note optionnelle
- `test_create_assistance_invalid_type_returns_422`
- `test_create_assistance_requires_auth`
- `test_get_assistance_request` — 200 avec données correctes
- `test_get_assistance_wrong_user_returns_403`
- `test_get_assistance_not_found_returns_404`
- `test_cancel_pending_assistance` — → cancelled
- `test_cancel_accepted_assistance_returns_409`
- `test_list_available_assistance_as_driver`
- `test_list_available_assistance_customer_forbidden`
- `test_accept_assistance` — → accepted
- `test_accept_already_accepted_returns_409`
- `test_accept_requires_driver_role`
- `test_start_assistance` — → in_progress
- `test_resolve_assistance` — → resolved

**Suite complète : 87/87 tests passent.**

### Frontend `web-customer`

- Deux onglets dans le Dashboard : **🚕 Trajet** / **🆘 Assistance**
- `AssistanceSection` : sélecteur de type (5 boutons), sélecteur de lieu, note optionnelle
- `AssistanceStatusCard` : badge de type, statut en temps réel (polling 5s), bouton annuler si pending
- `api.js` : `createAssistanceRequest()`, `getAssistanceRequest()`, `cancelAssistanceRequest()`
- `styles.css` : `.mode-tabs`, `.type-grid`, `.assistance-card`, badges de statut

### Frontend `web-driver`

- Dispatch unifié : `AvailableTripsSection` affiche maintenant les trajets ET les demandes d'assistance dans une seule liste
- `ActiveAssistanceCard` : affiche l'intervention en cours avec boutons Démarrer / Terminer
- Le `Dashboard` gère deux états actifs indépendants : `activeTrip` et `activeAssistance`
- `api.js` : `listAvailableAssistance()`, `getActiveAssistance()`, `acceptAssistance()`, `startAssistance()`, `resolveAssistance()`
- `styles.css` : `.dispatch-tag`, `.tag-ride`, `.tag-assist`, `.assist-card`

## Critères d'acceptation

- [x] POST /v1/assistance → 201 pour les 5 types valides
- [x] Type invalide → 422
- [x] Seul le client propriétaire peut voir/annuler → 403 sinon
- [x] Annulation uniquement si pending → 409 sinon
- [x] Cycle driver complet : accept → start → resolve
- [x] 87/87 tests verts en CI
- [x] Frontend customer : onglets trajet/assistance, form type picker, statut polling
- [x] Frontend driver : dispatch unifié, carte intervention active
