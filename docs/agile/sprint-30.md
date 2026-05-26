# Sprint 30 — Workflow candidature chauffeur

## Objectif

Permettre à n'importe quel utilisateur authentifié de postuler pour devenir chauffeur Ziza via un formulaire structuré. L'admin traite les candidatures (submitted → under_review → approved|rejected). L'approbation crée automatiquement le profil `Driver` et le `Vehicle` associé. Le candidat peut suivre le statut de sa candidature en temps réel.

**Gaps adressés : #12**  
**Origine roadmap : Phase 6, Sprint 14**

---

## Modèle de données

### Nouvelle table `driver_applications` (migration 0024)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | UUID PK | Identifiant |
| `user_id` | UUID FK UNIQUE | Un utilisateur = une candidature max |
| `status` | String(32) | `submitted` → `under_review` → `approved` \| `rejected` |
| `full_name` | String(128) | Nom complet du candidat |
| `phone` | String(32) | Téléphone |
| `license_number` | String(64) | Numéro de permis de conduire |
| `vehicle_make` | String(64) | Marque du véhicule |
| `vehicle_model` | String(64) | Modèle |
| `vehicle_plate` | String(32) | Plaque d'immatriculation |
| `vehicle_year` | Integer | Année |
| `vehicle_category` | String(32) | `economy` \| `comfort` \| `premium` |
| `notes_admin` | Text nullable | Raison du rejet ou commentaire admin |
| `reviewed_at` | DateTime TZ nullable | Date de décision |
| `reviewed_by` | UUID FK nullable | Admin ayant décidé |
| `submitted_at` | DateTime TZ | Date de soumission |

**Contrainte** : `UNIQUE(user_id)` — une seule candidature par utilisateur.

---

## Endpoints

| Méthode | Route | Rôle | Description |
|---------|-------|------|-------------|
| `POST` | `/v1/drivers/apply` | any auth | Soumet une candidature — 201, 409 si déjà existante |
| `GET` | `/v1/drivers/apply/status` | any auth | Lit sa propre candidature (null si aucune) |
| `GET` | `/v1/admin/applications` | admin | Liste paginée, filtrable par `status_filter` |
| `GET` | `/v1/admin/applications/{id}` | admin | Détail d'une candidature, 404 si absente |
| `PATCH` | `/v1/admin/applications/{id}/review` | admin | Décision : `approved` \| `rejected` \| `under_review` |

### Logique d'approbation automatique

Sur `PATCH .../review` avec `status=approved` :
1. Vérifie si un `Driver` existe déjà pour cet `user_id`
2. Si non → crée `Driver(status="active", license_number=...)`
3. Vérifie si un `Vehicle` existe déjà pour ce `driver_id`
4. Si non → crée `Vehicle(plate, make, model, year, category)`

Le tout est idempotent — appeler approve deux fois ne crée pas de doublons.

---

## Frontend web-customer

### `src/api.js`

| Fonction | Endpoint |
|----------|----------|
| `submitApplication(token, data)` | `POST /v1/drivers/apply` |
| `getApplicationStatus(token)` | `GET /v1/drivers/apply/status` |

### `src/App.jsx`

Nouveau composant `ApplicationSection` + onglet **🧑‍✈️ Devenir chauffeur** dans le Dashboard :

- **Formulaire multi-champs** : nom, téléphone, permis, marque/modèle/plaque/année/catégorie
- **Affichage du statut** avec badge coloré (submitted / under_review / approved / rejected)
- **Note admin visible** si présente
- **Message de bienvenue** si approuvé

### `src/styles.css`

Classes : `.application-section`, `.application-status-*`, `.application-form`, `.application-fieldset`, `.application-grid2`, `.application-submit-btn`

---

## Frontend web-admin

### `src/api.js`

| Fonction | Endpoint |
|----------|----------|
| `adminListApplications(token, statusFilter, limit, offset)` | `GET /v1/admin/applications` |
| `adminGetApplication(token, applicationId)` | `GET /v1/admin/applications/{id}` |
| `adminReviewApplication(token, applicationId, newStatus, notesAdmin)` | `PATCH /v1/admin/applications/{id}/review` |

### `src/App.jsx`

Nouveau composant `ApplicationsPanel` + onglet **📝 Candidatures** (12 onglets au total) :

- Filtre par statut (toutes / soumises / en révision / approuvées / rejetées)
- Chaque ligne affiche : statut coloré, nom, téléphone, véhicule, date
- Actions inline : **🔍 En révision** / **✅ Approuver** / **✗ Rejeter** + champ note
- Pagination 10 par page

### `src/styles.css`

Classes : `.applications-panel`, `.application-row-admin`, `.application-row-*` (statut), `.application-admin-*`

---

## Tests

**Cible : +22 tests → total 429**

### `tests/test_applications.py` (14 tests)

| Test | Scénario |
|------|----------|
| `test_submit_application_returns_201` | POST renvoie 201 avec les données |
| `test_double_submit_returns_409` | Deuxième soumission → 409 |
| `test_get_status_no_application_returns_null` | Statut sans candidature → null |
| `test_get_status_after_submit` | Statut après soumission → submitted |
| `test_admin_list_applications` | Admin liste toutes les candidatures |
| `test_admin_list_applications_filter_by_status` | Filtre par statut |
| `test_admin_get_application_detail` | GET detail par ID |
| `test_admin_get_application_not_found` | GET ID inconnu → 404 |
| `test_admin_approve_application` | Approve → status approved |
| `test_admin_reject_application_with_note` | Reject + note → status rejected |
| `test_admin_list_applications_requires_admin` | Customer/driver → 403 |
| `test_review_requires_admin` | Non-admin → 403 |
| `test_unauthenticated_cannot_apply` | Non-authentifié → 401 |
| `test_invalid_status_in_review_returns_422` | Statut invalide → 422 |

### `tests/test_application_workflow.py` (8 tests)

| Test | Scénario |
|------|----------|
| `test_approve_creates_driver_with_active_status` | Approbation → driver visible dans liste admin |
| `test_approve_creates_vehicle_with_correct_data` | Approbation → véhicule créé |
| `test_approve_idempotent_when_driver_already_exists` | Double approbation → pas d'erreur |
| `test_reject_does_not_create_driver` | Rejet → pas de driver créé |
| `test_reject_stores_note` | Note admin stockée correctement |
| `test_customer_sees_approved_status` | Customer voit approved après décision |
| `test_customer_sees_rejected_status` | Customer voit rejected après décision |
| `test_under_review_status_change` | Transition vers under_review |

---

## Compteur de tests global

| Suite | Tests |
|-------|-------|
| Backend Python (pytest) | 398 |
| Mobile customer (Jest/TS) | 16 |
| Mobile driver (Jest/TS) | 15 |
| **Total** | **429** |

---

## Frontends web mis à jour

Sous-titres et footers mis à jour vers `Sprint 30 — Candidature chauffeur` :
- `apps/web-customer/src/App.jsx`
- `apps/web-driver/src/App.jsx`
- `apps/web-admin/src/App.jsx`

---

## Points d'attention architecturaux

1. **Contrainte UNIQUE** : un seul enregistrement par `user_id` — garanti par contrainte SQL + vérification applicative (409 côté API).
2. **Idempotence approbation** : le CRUD vérifie l'existence du `Driver` et du `Vehicle` avant création — approbations multiples sans effet de bord.
3. **Séparation des rôles** : la soumission est ouverte à tout utilisateur authentifié ; la gestion des candidatures est strictement admin.
4. **Pas de notification** : le système de notification (Sprint 26) est déjà en place — les hooks `dispatcher.send()` peuvent être branchés sans modifier la logique métier.
