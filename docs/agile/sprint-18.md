# Sprint 18 — Système de notifications in-app

**Durée :** 1 semaine  
**Statut :** ✅ Terminé

---

## Objectifs

Informer automatiquement les utilisateurs des événements clés via un système de notifications persisté en base de données et consultable en temps réel par polling.

---

## Fonctionnalités livrées

### Backend (FastAPI)

| Endpoint | Méthode | Description |
|---|---|---|
| `GET /v1/notifications` | GET | Liste des notifications (plus récentes en premier, paginé) |
| `GET /v1/notifications/unread-count` | GET | Nombre de notifications non lues |
| `PATCH /v1/notifications/read-all` | PATCH | Marquer toutes les notifications comme lues |

**Déclencheurs automatiques :**

| Événement | Destinataire | Type |
|---|---|---|
| Driver accepte un trajet | Client | `trip_accepted` |
| Driver termine un trajet | Client | `trip_completed` |
| Admin approuve un document KYC | Chauffeur | `document_approved` |
| Admin rejette un document KYC | Chauffeur | `document_rejected` |

### Modèle `Notification`

- Table `notifications`
- Clé étrangère `user_id` → `users.id` (CASCADE)
- Champs : `id`, `user_id`, `type`, `title`, `body`, `read`, `created_at`
- Migration Alembic : `0013_add_notifications.py`

### Helper interne `_push_notification(db, user_uuid, type, title, body)`

- Appelé après `await db.commit()` dans les fonctions CRUD existantes
- Fire-and-forget : les erreurs sont swallowed pour ne jamais bloquer le flux principal

### Frontend web-customer

- Bouton cloche 🔔 dans le header avec badge rouge (compteur non lus)
- Nouvel onglet "🔔 Notifs" avec badge inline
- `NotificationsSection` : liste paginée, bouton "Tout marquer lu"
- Icônes par type : 🚗 trip_accepted, ✅ trip_completed
- Styles : `.notif-item.notif-unread` (bordure bleue), `.notif-item.notif-read` (opacité réduite)

### Frontend web-driver

- Bouton cloche 🔔 dans le header avec badge rouge
- Onglet 🔔 dans la navigation avec badge inline
- `DriverNotificationsSection` avec même UI
- Icônes par type : ✅ document_approved, ❌ document_rejected

---

## Tests (216 passés)

Nouveau fichier : `tests/test_notifications.py` — 11 tests :
- `test_list_notifications_requires_auth` / `test_unread_count_requires_auth` / `test_mark_all_read_requires_auth`
- `test_list_notifications_empty_for_new_user` / `test_unread_count_shape`
- `test_driver_notified_on_document_approved`
- `test_driver_notified_on_document_rejected`
- `test_customer_notified_on_trip_accepted`
- `test_customer_notified_on_trip_completed`
- `test_mark_all_read_clears_unread_count`
- `test_notifications_are_user_isolated`

---

## Migration base de données

```bash
alembic upgrade head  # 0013_add_notifications
```

---

## Architecture de notification

```
CRUD event (accept_trip) ──► await db.commit()
                          └──► _push_notification(db, customer_uuid, ...)
                                  └──► INSERT INTO notifications
                                  └──► await db.commit()

Frontend (polling) ──► GET /v1/notifications/unread-count (on tab change)
                    └──► GET /v1/notifications (when user opens panel)
                    └──► PATCH /v1/notifications/read-all (mark as read)
```
