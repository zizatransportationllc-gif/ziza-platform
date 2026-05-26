# Sprint 20 — Lieux enregistrés (Address Book)

**Période** : Sprint 20  
**Statut** : ✅ Complété

---

## Objectifs

Permettre aux clients de sauvegarder jusqu'à 10 adresses fréquentes (🏠 Domicile, 💼 Travail, 📍 Autre)
et de les utiliser en un clic pour pré-remplir le formulaire d'estimation de trajet.

---

## Fonctionnalités livrées

### Backend

#### Modèle `SavedPlace` (`app/models/saved_place.py`)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | UUID (PK) | Identifiant unique |
| `user_id` | UUID (FK → users.id, CASCADE) | Propriétaire |
| `label` | String(32) | `"home"` / `"work"` / `"other"` |
| `name` | String(256) | Adresse lisible (saisie libre) |
| `lat` | Float | Latitude |
| `lng` | Float | Longitude |
| `created_at` | DateTime(tz) | Date de création |

#### Migration `0014_add_saved_places.py`

#### Endpoints

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/v1/places` | Liste les lieux de l'utilisateur (oldest first) |
| `POST` | `/v1/places` | Crée un lieu (max 10, 422 si label invalide ou limite atteinte) |
| `PATCH` | `/v1/places/{place_id}` | Modifie label / name / lat / lng (404 si non propriétaire) |
| `DELETE` | `/v1/places/{place_id}` | Supprime (204, 404 si non propriétaire) |

**Règles métier :**
- Maximum 10 lieux par utilisateur — 422 si dépassé
- Labels valides : `home`, `work`, `other`
- Isolation stricte : seul le propriétaire peut modifier/supprimer ses lieux
- Toute requête PATCH/DELETE sur un lieu d'un autre utilisateur retourne 404 (pas 403) pour ne pas révéler l'existence du lieu

#### CRUD (`crud.py`)
- `list_saved_places(db, auth_user_id)`
- `create_saved_place(db, auth_user_id, label, name, lat, lng)`
- `update_saved_place(db, auth_user_id, place_id, label?, name?, lat?, lng?)`
- `delete_saved_place(db, auth_user_id, place_id)`

---

### Tests (18 nouveaux — `tests/test_saved_places.py`)

| Test | Scénario |
|------|---------|
| `test_list_places_requires_auth` | 401/403 sans token |
| `test_list_places_returns_list` | Retourne une liste |
| `test_create_place_requires_auth` | 401/403 sans token |
| `test_create_place_success` | Création OK avec les bons champs |
| `test_create_place_invalid_label_returns_422` | Label invalide → 422 |
| `test_create_place_all_labels_accepted` | home / work / other acceptés |
| `test_create_place_appears_in_list` | Lieu créé visible dans GET /v1/places |
| `test_create_place_enforces_max_10` | 11ème lieu → 422 |
| `test_update_place_name` | Modification du nom |
| `test_update_place_label` | Modification du type |
| `test_update_place_coordinates` | Modification des coordonnées |
| `test_update_place_not_found_returns_404` | UUID inexistant → 404 |
| `test_update_place_wrong_user_returns_404` | Autre utilisateur → 404 |
| `test_update_place_invalid_label_returns_422` | Label invalide → 422 |
| `test_delete_place_success` | Suppression + confirmation disparition |
| `test_delete_place_not_found_returns_404` | UUID inexistant → 404 |
| `test_delete_place_wrong_user_returns_404` | Autre utilisateur → 404 |
| `test_delete_place_requires_auth` | 401/403 sans token |

**Total** : 252 tests — 252 ✅

---

### Frontend web-customer

#### Onglet "📍 Lieux" (`SavedPlacesSection`)
- Liste des lieux avec icône, nom, type (Domicile / Travail / Autre)
- Code couleur : 🏠 vert, 💼 bleu, 📍 accent
- Bouton **✎ Modifier** — ouvre le formulaire en mode édition in-place
- Bouton **🗑 Supprimer** — retire le lieu de la liste
- Formulaire **✚ Ajouter / Modifier** :
  - Select type (🏠 Domicile / 💼 Travail / 📍 Autre)
  - Input nom (adresse libre)
  - Select quartier (pré-remplit lat/lng depuis `ABIDJAN_LOCATIONS`)
  - Inputs lat/lng éditables (précision 4 décimales)
- Message « Limite de 10 lieux atteinte » quand plein

#### Quick-pick dans le formulaire d'estimation (`EstimateSection`)
- Bouton `📍 Mes lieux enregistrés ▼` — accordion collapsible
- Pour chaque lieu : bouton **Départ** et bouton **Arrivée**
- Sélectionner un lieu :
  - Désactive le dropdown correspondant (grisé)
  - Affiche un chip : `📍 Départ : <nom>  ✕`
  - Clicker ✕ réactive le dropdown standard
- Permet de mixer : lieu enregistré pour le départ + dropdown pour l'arrivée

#### API (`api.js`)
```javascript
export async function listPlaces(token)
export async function createPlace(token, label, name, lat, lng)
export async function updatePlace(token, placeId, fields)
export async function deletePlace(token, placeId)
```

#### Styles (`styles.css`)
Place picker : `.place-picker-bar`, `.place-picker-toggle`, `.place-picker-list`,
`.place-picker-item`, `.place-picker-name`, `.place-picker-btn`, `.place-chips`,
`.place-chip`, `.place-chip-clear`

Saved places section : `.places-section`, `.places-header`, `.places-add-btn`,
`.place-form`, `.place-form-title`, `.place-form-row`, `.place-form-label`,
`.place-form-input`, `.place-form-select`, `.place-form-coords`, `.place-form-coord-input`,
`.place-form-actions`, `.place-save-btn`, `.place-cancel-btn`, `.place-list`,
`.place-card`, `.place-card-home/work/other`, `.place-card-main`, `.place-card-icon`,
`.place-card-info`, `.place-card-name`, `.place-card-meta`, `.place-card-actions`,
`.place-edit-btn`, `.place-delete-btn`, `.place-limit-hint`

---

## Fichiers modifiés

| Fichier | Type |
|---------|------|
| `apps/api/app/models/saved_place.py` | Nouveau |
| `apps/api/app/models/__init__.py` | Modifié |
| `apps/api/alembic/versions/0014_add_saved_places.py` | Nouveau |
| `apps/api/app/crud.py` | Modifié |
| `apps/api/app/main.py` | Modifié |
| `apps/api/tests/test_saved_places.py` | Nouveau |
| `apps/web-customer/src/api.js` | Modifié |
| `apps/web-customer/src/App.jsx` | Modifié |
| `apps/web-customer/src/styles.css` | Modifié |
| `docs/agile/sprint-20.md` | Nouveau |

---

## Décisions techniques

- **Isolation 404 vs 403** : Les endpoints PATCH/DELETE retournent 404 (pas 403) quand le lieu
  appartient à un autre utilisateur, conformément au principe de ne pas révéler l'existence de ressources
  d'autres utilisateurs.
- **Max 10 lieux** : Valeur constante `MAX_SAVED_PLACES = 10` dans crud.py, vérifiée côté serveur.
- **Quick-pick non-bloquant** : L'accordion de sélection de lieux est optionnel — le formulaire
  d'estimation fonctionne exactement comme avant si l'utilisateur n'a aucun lieu enregistré.
- **Pré-remplissage depuis quartier** : Le select quartier (`ABIDJAN_LOCATIONS`) dans le formulaire
  d'ajout pré-remplit lat/lng pour faciliter la saisie, tout en laissant la possibilité d'entrer
  des coordonnées précises.
