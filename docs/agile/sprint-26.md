# Sprint 26 — Notifications Externes

**Durée :** ~1 semaine  
**Objectif :** Envoyer des notifications réelles aux utilisateurs via FCM (push web), SendGrid (email) et AfricasTalking (SMS) lors des événements clés du cycle de vie. Les notifications in-app existantes restent en place et sont enrichies d'un champ `channel`.  
**Gap adressé :** #13 — FCM/email/SMS absents (roadmap Phase 7, Sprint 15)

---

## Livrables

| # | Livrable | Statut |
|---|---|---|
| 1 | `app/models/device_token.py` — modèle `DeviceToken` | ✅ |
| 2 | `app/models/notification.py` — colonnes `channel`, `provider_ref`, `delivered_at`, `failed_at`, `retry_count` | ✅ |
| 3 | `app/notifications/` — package : base (Protocol), mock, fcm, sendgrid, africas_talking, dispatcher | ✅ |
| 4 | `app/crud.py` — `register_device_token`, `deregister_device_token`, hook dispatcher dans `_push_notification` | ✅ |
| 5 | `POST /v1/devices/register` — enregistre un token FCM / web-push (idempotent) | ✅ |
| 6 | `DELETE /v1/devices/{token}` — révoque un token (déconnexion) | ✅ |
| 7 | Paiement confirmé → notification in-app + dispatch externe | ✅ |
| 8 | Migration Alembic `0022_notifications_v2_device_tokens` | ✅ |
| 9 | web-customer : demande permission push + `sw.js` | ✅ |
| 10 | web-driver : demande permission push + `sw.js` | ✅ |
| 11 | Tests : 18 nouveaux → **356 tests au total** | ✅ |

---

## Modèle de données

### Table `device_tokens` (migration 0022)

```
id          UUID          PK
user_id     UUID          FK users.id ON DELETE CASCADE  INDEX
token       TEXT          NOT NULL  UNIQUE  -- FCM token ou endpoint web-push
platform    VARCHAR(16)   NOT NULL  DEFAULT 'web'  -- "web" | "ios" | "android"
created_at  DATETIME(tz)  NOT NULL  DEFAULT now()
```

### Table `notifications` — colonnes ajoutées (migration 0022)

```
channel       VARCHAR(16)   NOT NULL  DEFAULT 'in_app'  -- "in_app" | "push" | "email" | "sms" | "mock"
provider_ref  TEXT          NULL      -- ID FCM, SendGrid X-Message-Id …
delivered_at  DATETIME(tz)  NULL
failed_at     DATETIME(tz)  NULL
retry_count   INTEGER       NOT NULL  DEFAULT 0
```

**Note :** `GET /v1/notifications` filtre désormais sur `channel = 'in_app'` pour que les frontends ne voient pas les lignes de dispatch externe.

---

## Architecture du dispatcher

```
_push_notification(db, user_uuid, type, title, body)
  ├── Crée une Notification row  channel="in_app"  (comportement existant)
  └── _dispatch_external(db, user_uuid, …)  [fire-and-forget]
        ├── Résout l'email de l'utilisateur (SELECT users)
        └── dispatch_external(db, user_uuid, recipient=email, …)
              ├── Pour chaque channel dans _channels :
              │     channel.send(recipient, title, body, data)
              │       → succès : Notification row  delivered_at=now
              │       → échec  : Notification row  failed_at=now, retry_count=1
              └── Jamais d'exception propagée (fire-and-forget)
```

### Adaptateurs

| Classe | `channel_name` | Canal | Prérequis prod |
|--------|---------------|-------|----------------|
| `MockChannel` | `mock` | Test / dev | aucun |
| `FCMChannel` | `push` | Firebase Cloud Messaging | `firebase-admin` + credentials |
| `SendGridChannel` | `email` | Email transactionnel | `sendgrid` + `SENDGRID_API_KEY` |
| `AfricasTalkingChannel` | `sms` | SMS Afrique de l'Ouest | `africastalking` + clé API |

### Enregistrement au démarrage (`main.py`)

```python
if settings.sendgrid_api_key:
    register_channel(SendGridChannel(settings.sendgrid_api_key, settings.sendgrid_from_email))

if settings.africas_talking_api_key:
    register_channel(AfricasTalkingChannel(
        settings.africas_talking_api_key,
        settings.africas_talking_username,
    ))
```

En dev/CI aucun canal n'est enregistré → `_dispatch_external` est un no-op silencieux.

---

## Endpoints API

| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| `POST` | `/v1/devices/register` | customer/driver | Enregistre un token FCM / web-push |
| `DELETE` | `/v1/devices/{token}` | customer/driver | Révoque un token |

**Règles métier :**
- Double enregistrement du même token → idempotent (200, pas de doublon en DB)
- Token inconnu ou appartenant à un autre user → 404
- Auth requise pour les deux endpoints

---

## Matrice événements × dispatch

| Événement | in-app | External (prod) |
|-----------|:------:|:---------------:|
| `trip_accepted` → customer | ✅ | ✅ push + email |
| `trip_completed` → customer | ✅ | ✅ push + email |
| `payment_confirmed` → customer | ✅ (Sprint 26) | ✅ push + email |
| `document_approved` → driver | ✅ | ✅ push + email |
| `document_rejected` → driver | ✅ | ✅ push + email |

---

## Web Push — Service Workers

Deux Service Workers créés :

| Fichier | Frontend | Rôle |
|---------|----------|------|
| `apps/web-customer/public/sw.js` | web-customer | Affiche la notification push, focus/ouvre l'app au clic |
| `apps/web-driver/public/sw.js` | web-driver | Idem + vibration pattern longue pour alertes mission |

Enregistrement dans `App.jsx` (les deux frontends) :
```javascript
Notification.requestPermission().then(async (permission) => {
  if (permission !== "granted") return;
  const reg = await navigator.serviceWorker.register("/sw.js");
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true });
  const deviceToken = sub ? sub.endpoint : `web-${user.user_id}`;
  await registerDeviceToken(token, deviceToken, "web");
});
```

---

## Couverture tests

| Fichier | Tests | Détail |
|---------|-------|--------|
| `tests/test_device_tokens.py` | 6 | register customer, register driver, double register idempotent, requires auth→401, deregister→204, unknown token→404 |
| `tests/test_notifications_dispatch.py` | 12 | accept_trip→in_app, accept_trip→mock_push, complete_trip→in_app, complete_trip→mock_push, email recipient correct, confirm_payment→notification, doc_approved→dispatch, doc_rejected→dispatch, channel failure non bloquant, channel in_app sur row in-app, no channels→no crash, event_type dans data |

**Total : 338 + 18 = 356 tests.**

---

## Critères de validation

- [x] `POST /v1/devices/register` → 200, idempotent
- [x] `DELETE /v1/devices/{token}` → 204 ; token inconnu → 404
- [x] `accept_trip` → MockChannel.sent contient la notification
- [x] `complete_trip` → MockChannel.sent contient la notification
- [x] `confirm_payment` webhook → notification in-app `payment_confirmed`
- [x] `document_approved/rejected` → MockChannel.sent contient la notification
- [x] Channel qui lève une exception → trip/document opération réussit quand même
- [x] `GET /v1/notifications` ne retourne que les rows `channel = 'in_app'`
- [x] Row in-app a `channel == "in_app"` dans la réponse API

---

## GCP — activation en production

### 1. Provisionner les secrets notification

```bash
# SendGrid
echo -n "SG.xxxx" | gcloud secrets create ziza-sendgrid-api-key --data-file=-

# AfricasTalking
echo -n "AT_API_KEY" | gcloud secrets create ziza-africas-talking-api-key --data-file=-
echo -n "ziza_prod" | gcloud secrets create ziza-africas-talking-username --data-file=-
```

### 2. Mettre à jour Cloud Run

```bash
gcloud run services update ziza-api \
  --update-secrets SENDGRID_API_KEY=ziza-sendgrid-api-key:latest \
  --update-secrets AFRICAS_TALKING_API_KEY=ziza-africas-talking-api-key:latest \
  --update-secrets AFRICAS_TALKING_USERNAME=ziza-africas-talking-username:latest \
  --update-env-vars SENDGRID_FROM_EMAIL=noreply@ziza.ci
```

### 3. FCM

Les credentials FCM utilisent le service account Firebase configuré en Sprint 3.
Aucune configuration supplémentaire requise si `ENVIRONMENT=prod` et Firebase est déjà configuré.

### 4. VAPID key (web push production)

Pour une vraie subscription web-push (au lieu de l'endpoint simulé), générer une paire VAPID :
```bash
npx web-push generate-vapid-keys
# Ajouter VITE_VAPID_PUBLIC_KEY dans les frontends
# Ajouter VAPID_PRIVATE_KEY dans les secrets Cloud Run
```
