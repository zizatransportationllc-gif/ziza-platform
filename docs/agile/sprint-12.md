# Sprint 12 — Vehicle Management · Customer Assistance History · Admin User List

**Status:** ✅ Done — 123/123 tests passing

---

## Objectifs

1. **Gestion du véhicule chauffeur** — enregistrement et mise à jour via `POST /v1/drivers/me/vehicle`, consultation via `GET /v1/drivers/me/vehicle`.
2. **Véhicule dans le trajet** — `GET /v1/trips/{id}` expose les infos véhicule après acceptation.
3. **Historique des assistances client** — `GET /v1/assistance` renvoie toutes les demandes du client connecté.
4. **Liste des utilisateurs admin** — `GET /v1/admin/users` liste tous les comptes.
5. **Frontend web-driver** — carte véhicule (vue + formulaire).
6. **Frontend web-customer** — badge véhicule dans la carte de réservation + onglet Historique.
7. **Frontend web-admin** — onglet Utilisateurs.

---

## Endpoints ajoutés / modifiés

| Méthode | Route                      | Rôle     | Description                              |
|---------|----------------------------|----------|------------------------------------------|
| POST    | `/v1/drivers/me/vehicle`   | driver   | Créer ou mettre à jour le véhicule       |
| GET     | `/v1/drivers/me/vehicle`   | driver   | Récupérer le véhicule actif              |
| GET     | `/v1/trips/{id}`           | customer | Inclut `vehicle` après acceptation       |
| GET     | `/v1/assistance`           | customer | Historique des demandes d'assistance     |
| GET     | `/v1/admin/users`          | admin    | Liste de tous les utilisateurs           |

---

## Modèle de données

### `vehicles` (table existante étendue)
- Ajout : `color VARCHAR(32) NULL`
- Migration : `0007_add_vehicle_color.py`

---

## Tests (12 nouveaux — `test_vehicles.py`)

| # | Test | Résultat |
|---|------|----------|
| 1 | `test_driver_register_vehicle` | ✅ |
| 2 | `test_driver_update_vehicle_is_idempotent` | ✅ |
| 3 | `test_driver_get_vehicle` | ✅ |
| 4 | `test_driver_get_vehicle_not_found_before_registration` | ✅ |
| 5 | `test_vehicle_duplicate_plate_returns_409` | ✅ |
| 6 | `test_vehicle_registration_requires_driver_role` | ✅ |
| 7 | `test_vehicle_appears_in_trip_detail_after_accept` | ✅ |
| 8 | `test_customer_assistance_history_empty` | ✅ |
| 9 | `test_customer_assistance_history_after_request` | ✅ |
| 10 | `test_customer_assistance_history_requires_auth` | ✅ |
| 11 | `test_admin_list_users` | ✅ |
| 12 | `test_admin_list_users_requires_admin_role` | ✅ |

**Total cumulatif : 123/123**

---

## Frontends

### web-driver
- `VehicleCard` : vue (immatriculation, couleur, marque, modèle, année) + formulaire d'édition.
- Ajout de `getMyVehicle`, `registerVehicle` dans `api.js`.

### web-customer
- Badge véhicule dans `BookingSection` quand le statut est `accepted` ou `in_progress`.
- Onglet **📋 Historique** avec `AssistanceHistory` (liste des demandes triées par date desc).
- Ajout de `listMyAssistance` dans `api.js`.

### web-admin
- Onglet **👥 Utilisateurs** avec `UsersPanel` (email, rôle coloré, provider, date).
- Ajout de `adminListUsers` dans `api.js`.

---

## Isolation frontends
Chaque frontend conserve son propre `api.js`, `App.jsx`, `styles.css`. Aucun code partagé.
