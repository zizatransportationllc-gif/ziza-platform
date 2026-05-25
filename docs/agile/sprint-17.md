# Sprint 17 — Driver KYC Documents + Admin Pending Counts

**Durée :** 1 semaine  
**Statut :** ✅ Terminé

---

## Objectifs

Permettre aux chauffeurs de soumettre leurs documents KYC (permis, assurance, carte grise, carte d'identité) et donner à l'admin la capacité de les approuver ou rejeter. Ajouter des compteurs en temps réel des éléments en attente sur le tableau de bord admin.

---

## Fonctionnalités livrées

### Backend (FastAPI)

| Endpoint | Méthode | Description |
|---|---|---|
| `POST /v1/drivers/me/documents` | POST | Chauffeur soumet un document KYC |
| `GET /v1/drivers/me/documents` | GET | Chauffeur liste ses documents |
| `GET /v1/admin/documents` | GET | Admin liste tous les documents (paginé) |
| `PATCH /v1/admin/documents/{id}/status` | PATCH | Admin approuve ou rejette un document |
| `GET /v1/admin/pending-counts` | GET | Compteurs d'éléments en attente |

**Types de documents acceptés :** `license`, `insurance`, `registration`, `id_card`

**Statuts document :** `pending` → `approved` | `rejected`

### Modèle `DriverDocument`

- Table `driver_documents`
- Clé étrangère `driver_id` → `drivers.id` (CASCADE)
- Champs : `id`, `driver_id`, `type`, `url`, `status`, `note_admin`, `created_at`, `updated_at`
- Migration Alembic : `0012_add_driver_documents.py`

### Frontend web-driver

- Nouveau composant `DocumentsSection` : formulaire de soumission + liste des documents avec badges de statut
- 4 types de documents dans un sélecteur
- Statuts colorés : jaune (en attente), vert (approuvé), rouge (rejeté)
- Note admin affichée si présente
- Nouvel onglet "📄 Documents" (4e onglet)

### Frontend web-admin

- Nouveau composant `DocumentsPanel` : liste paginée des documents avec lien vers le fichier, boutons Approuver/Rejeter, champ note
- Badges de compteur sur les onglets "💸 Retraits" et "📄 Documents" (rafraîchis à chaque changement d'onglet)
- Nouvel onglet "📄 Documents" dans la navigation admin

---

## Tests (205 passés)

Nouveaux fichiers de tests :
- `tests/test_documents.py` — 13 tests (soumission, listage, admin review)
- `tests/test_pending_counts.py` — 3 tests (shape, RBAC, cohérence d'état)

---

## Règles de validation

- Type de document invalide → HTTP 422
- Statut de mise à jour invalide (`pending` non autorisé) → HTTP 422
- Document inexistant → HTTP 404
- Endpoints `/drivers/me/*` → rôle `driver` requis
- Endpoints `/admin/*` → rôle `admin` requis

---

## Migration base de données

```
alembic upgrade head  # 0012_add_driver_documents
```
