# Roadmap correctif — Sprints 24 à 31

**Document :** Planification des sprints post-23  
**Statut :** 🔲 Planifié  
**Origine :** Revue roadmap vs sprints livrés (Sprints 1–22) + Sprint 23 (alignement technique)  
**Dernière mise à jour :** 2026-05-26

---

## Contexte

La revue exhaustive roadmap vs réalisé (effectuée en Sprint 23) a identifié huit grandes familles de fonctionnalités non livrées ou partiellement livrées.  
Ces fonctionnalités correspondent aux Phases 5 à 10 de la roadmap initiale.  
Elles sont adressées sur les Sprints 24 à 31 selon l'ordre de valeur métier et de dépendances techniques.

### Dépendances critiques

```
Sprint 24 (paiement)  ──► Sprint 29 (payout batch)
Sprint 25 (sécurité)  ──► Sprint 27/28 (mobile — secrets sécurisés)
Sprint 26 (notifs)    ──► Sprint 27/28 (mobile — FCM)
Sprint 27/28 (mobile) ──► Sprint 31 (beta — apps soumises)
Sprint 30 (candidature) ──► indépendant, peut être avancé
Sprint 31 (perf)      ──► dernier (nécessite feature freeze)
```

---

## Vue d'ensemble

| Sprint | Thème | Phase roadmap | Statut |
|--------|-------|---------------|--------|
| 24 | 💳 Paiement client (Orange Money / Stripe) | Phase 5 — Payments | 🔲 |
| 25 | 🔒 Security hardening | Phase 9 — Hardening | 🔲 |
| 26 | 🔔 Notifications externes (FCM + email + SMS) | Phase 7 — Notifications | 🔲 |
| 27 | 📱 Application mobile customer (React Native) | Phase 8 — Mobile | 🔲 |
| 28 | 📱 Application mobile driver (React Native) | Phase 8 — Mobile | 🔲 |
| 29 | 💰 Payout batch & commission chauffeur | Phase 5 — Payments | 🔲 |
| 30 | 🧑‍💼 Workflow candidature chauffeur | Phase 6 — Admin | 🔲 |
| 31 | 📈 Performance, beta fermée & GA | Phase 9–10 — Perf + Launch | 🔲 |

**Tests actuels (fin Sprint 23) : 300**  
**Cible fin Sprint 31 : ~460**

---

---

## Sprint 24 — 💳 Paiement client

**Objectif :** Le client peut payer un trajet terminé via un prestataire de paiement adapté au marché ivoirien (Orange Money / Wave / CinetPay) avec Stripe comme fallback pour les cartes bancaires.

**Origine roadmap :** Phase 5 — Sprint 11 (non livré — remplacé par le module earnings)

---

### Modèle de données

**Nouvelle table `payment_intents`** (migration 0019) :

```
id              UUID        PK
trip_id         UUID        FK trips.id
amount_xof      INTEGER     NOT NULL
currency        VARCHAR(8)  default "XOF"
provider        VARCHAR(32) -- "orange_money" | "wave" | "cinetpay" | "stripe"
provider_ref    VARCHAR(128) NULL  -- référence externe (transaction ID)
status          VARCHAR(32) -- pending | paid | failed | refunded
created_at      DATETIME(tz)
updated_at      DATETIME(tz)
```

**Table `trips`** — 1 colonne ajoutée (migration 0020) :

```
paid_at         DATETIME(tz) NULL  -- horodatage du paiement confirmé
```

---

### Endpoints

| Méthode | Route | Rôle | Description |
|---------|-------|------|-------------|
| `POST` | `/v1/payments/intent` | customer | Crée un intent de paiement pour un trip `completed` |
| `GET` | `/v1/payments/{intent_id}` | customer | Statut de l'intent |
| `POST` | `/v1/payments/webhook` | system | Webhook provider → confirme ou rejette le paiement |
| `GET` | `/v1/trips/{id}/payment` | customer | Raccourci : état de paiement du trip |

**Logique `POST /v1/payments/intent` :**
- Vérifie que le trip appartient au customer et est en statut `completed`
- Vérifie qu'aucun intent `paid` n'existe déjà pour ce trip (idempotence)
- Crée un `PaymentIntent` en statut `pending`
- Appelle l'adaptateur du prestataire configuré (env `PAYMENT_PROVIDER`)
- Retourne `{ intent_id, provider_url, amount_xof, status }`

**Adaptateurs :**
```python
class PaymentAdapter(Protocol):
    async def create_intent(self, amount_xof: int, ref: str) -> str: ...
    async def verify_webhook(self, payload: bytes, sig: str) -> dict: ...
```
Implémentations : `CinetPayAdapter`, `StripeAdapter`, `MockAdapter` (tests)

---

### Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `app/models/payment.py` | Nouveau — modèle `PaymentIntent` |
| `app/models/trip.py` | + colonne `paid_at` |
| `app/payment/base.py` | Nouveau — protocole `PaymentAdapter` |
| `app/payment/mock.py` | Nouveau — adaptateur mock pour les tests |
| `app/payment/cinetpay.py` | Nouveau — adaptateur CinetPay |
| `app/payment/stripe.py` | Nouveau — adaptateur Stripe |
| `app/crud.py` | + `create_payment_intent`, `confirm_payment`, `get_payment_intent` |
| `app/main.py` | + 4 endpoints paiement |
| `app/config.py` | + `payment_provider`, `cinetpay_api_key`, `stripe_secret_key` |
| `alembic/versions/0019_payment_intents.py` | Nouvelle migration |
| `alembic/versions/0020_trip_paid_at.py` | Nouvelle migration |
| `apps/web-customer/src/api.js` | + `createPaymentIntent`, `getPaymentStatus` |
| `apps/web-customer/src/App.jsx` | + `PaymentSection` (après trip completed) |
| `apps/web-customer/src/styles.css` | + `.payment-card`, `.payment-btn` |

---

### Tests (cible : +20 → 320)

| Fichier | Tests |
|---------|-------|
| `tests/test_payments.py` | 15 tests : intent creation, webhook confirm, idempotence, wrong user, wrong status, refund |
| `tests/test_trips.py` | +3 tests : `paid_at` renseigné après webhook, trip payment status |
| `tests/test_admin_stats.py` | +2 tests : stats incluent revenue encaissé |

---

### Critères de validation

- [ ] `POST /v1/payments/intent` crée un intent pour un trip `completed`
- [ ] Double appel retourne l'intent existant (idempotence)
- [ ] Webhook mock confirme → trip `paid_at` renseigné
- [ ] Webhook avec mauvaise signature retourne 400
- [ ] Frontend affiche le bouton "Payer" après `completed`
- [ ] Frontend affiche "Payé ✓" après confirmation

---

---

## Sprint 25 — 🔒 Security Hardening

**Objectif :** Posture de sécurité production : tous les secrets dans GCP Secret Manager, WAF sur l'API, JWT refresh, audit OWASP des endpoints critiques, dépendances auditées en CI.

**Origine roadmap :** Phase 9 — Sprint 18 (non livré)

---

### Périmètre

#### 1. GCP Secret Manager
- Tous les secrets sortent du code / `.env` : `DB_PASSWORD`, `JWT_SECRET`, `CINETPAY_API_KEY`, `STRIPE_SECRET_KEY`, `FIREBASE_CREDENTIALS`
- `app/config.py` lit les secrets via `google-cloud-secret-manager` si `ENVIRONMENT=prod`
- Fallback `.env` conservé pour dev/CI

#### 2. JWT Refresh Token
**Nouvelles tables** (migration 0021) :
```
refresh_tokens
  id          UUID        PK
  user_id     UUID        FK users.id ON DELETE CASCADE
  token_hash  VARCHAR(64) UNIQUE  -- sha256 du token
  expires_at  DATETIME(tz)
  revoked_at  DATETIME(tz) NULL
  created_at  DATETIME(tz)
```

**Nouveaux endpoints :**

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/v1/auth/refresh` | Échange un refresh token contre un nouvel access token (15 min TTL) |
| `POST` | `/v1/auth/logout` | Révoque le refresh token courant |

**Logique :** Access token TTL réduit à 15 min. Refresh token TTL : 30 jours. Rotation à chaque refresh.

#### 3. Rate limiting
- Middleware `slowapi` : 60 req/min global, 5 req/min sur `/v1/token` et `/v1/payments/intent`
- Retourne `429 Too Many Requests` avec header `Retry-After`

#### 4. Cloud Armor WAF
- Règle préconfigurée OWASP sur l'ingress API Cloud Run
- IP allowlist pour `/v1/admin/*` (CIDR bureau)
- Script `infra/gcp/cloud-armor.sh`

#### 5. Audit CI
- `pip-audit` ajouté au workflow CI (bloque si CVE critique)
- `npm audit --audit-level=high` sur les 3 frontends
- `bandit -r app/` (analyse statique Python)

---

### Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `app/models/auth.py` | Nouveau — modèle `RefreshToken` |
| `app/auth/base.py` | + `refresh_access_token`, `revoke_token` |
| `app/auth/dev.py` | Access token TTL 15 min, refresh token émis |
| `app/config.py` | + `jwt_access_ttl_min`, `jwt_refresh_ttl_days`, Secret Manager |
| `app/middleware/rate_limit.py` | Nouveau — `RateLimitMiddleware` (slowapi) |
| `app/main.py` | + `/v1/auth/refresh`, `/v1/auth/logout`, rate limit middleware |
| `alembic/versions/0021_refresh_tokens.py` | Nouvelle migration |
| `infra/gcp/cloud-armor.sh` | Nouveau — provisioning WAF |
| `.github/workflows/ci.yml` | + `pip-audit`, `npm audit`, `bandit` |

---

### Tests (cible : +15 → 335)

| Fichier | Tests |
|---------|-------|
| `tests/test_auth_refresh.py` | 10 tests : refresh valide, token révoqué, token expiré, double refresh, logout |
| `tests/test_rate_limit.py` | 3 tests : 60e req passe, 61e → 429, reset après 1 min (mock time) |
| `tests/test_token_refresh.py` | +2 tests : access token expiré → 401, refresh → nouveau token valide |

---

### Critères de validation

- [ ] Aucun secret en clair dans le repo ou les variables Cloud Run (hors dev)
- [ ] `/v1/auth/refresh` émet un nouvel access token avec le même `sub`
- [ ] Token révoqué → 401 sur tout endpoint protégé
- [ ] 61e requête sur `/v1/token` en 1 min → 429
- [ ] `pip-audit` et `npm audit` passent en CI sans CVE critique
- [ ] Cloud Armor activé sur l'ingress API en prod

---

---

## Sprint 26 — 🔔 Notifications Externes

**Objectif :** Les utilisateurs reçoivent des notifications push (FCM), email (SendGrid) et SMS (AfricasTalking) aux événements clés du cycle de vie d'un trajet.

**Origine roadmap :** Phase 7 — Sprint 15 (partiellement livré — table `notifications` créée mais pas d'envoi réel)

---

### Périmètre

La table `notifications` et les endpoints `/v1/notifications` existent (Sprint 18).  
Ce sprint ajoute l'envoi **effectif** via des prestataires externes.

#### Événements déclencheurs

| Événement | Customer | Driver |
|-----------|----------|--------|
| Trajet accepté par un chauffeur | ✅ push + SMS | — |
| Chauffeur en route (< 2 min ETA) | ✅ push | — |
| Trajet démarré | ✅ push | — |
| Trajet terminé | ✅ push + email (reçu) | ✅ push + email (gains) |
| Paiement confirmé | ✅ push + email | — |
| Virement émis (payout) | — | ✅ push + email + SMS |
| Candidature décision (Sprint 30) | — | ✅ email + SMS |

#### Adaptateurs

```python
class NotificationAdapter(Protocol):
    async def send_push(self, token: str, title: str, body: str, data: dict) -> bool: ...
    async def send_email(self, to: str, subject: str, html: str) -> bool: ...
    async def send_sms(self, phone: str, message: str) -> bool: ...
```

Implémentations : `FCMAdapter`, `SendGridAdapter`, `AfricasTalkingAdapter`, `MockAdapter`

#### Table `notifications` — colonnes ajoutées (migration 0022)

```
channel         VARCHAR(16)  -- "push" | "email" | "sms" | "in_app"
provider_ref    VARCHAR(128) NULL  -- ID de tracking externe
delivered_at    DATETIME(tz) NULL
failed_at       DATETIME(tz) NULL
retry_count     INTEGER      default 0
```

#### FCM Device Tokens

**Nouvelle table `device_tokens`** (migration 0022) :
```
id          UUID        PK
user_id     UUID        FK users.id ON DELETE CASCADE
token       TEXT        UNIQUE
platform    VARCHAR(16) -- "web" | "ios" | "android"
created_at  DATETIME(tz)
```

**Nouveaux endpoints :**

| Méthode | Route | Rôle | Description |
|---------|-------|------|-------------|
| `POST` | `/v1/devices/register` | customer/driver | Enregistre un FCM device token |
| `DELETE` | `/v1/devices/{token}` | customer/driver | Révoque un device token (logout) |

---

### Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `app/models/notification.py` | + `device_tokens`, colonnes `notifications` |
| `app/notifications/base.py` | Nouveau — protocole `NotificationAdapter` |
| `app/notifications/mock.py` | Nouveau — adaptateur mock |
| `app/notifications/fcm.py` | Nouveau — adaptateur Firebase Cloud Messaging |
| `app/notifications/sendgrid.py` | Nouveau — adaptateur SendGrid |
| `app/notifications/africas_talking.py` | Nouveau — adaptateur AfricasTalking |
| `app/notifications/dispatcher.py` | Nouveau — orchestrateur (choisit les canaux selon l'événement) |
| `app/crud.py` | Hooks dans `accept_trip`, `start_trip`, `complete_trip`, `confirm_payment` |
| `app/main.py` | + `/v1/devices/register`, `/v1/devices/{token}` |
| `app/config.py` | + `fcm_credentials`, `sendgrid_api_key`, `africas_talking_api_key` |
| `alembic/versions/0022_notifications_v2.py` | Nouvelle migration |
| `apps/web-customer/src/App.jsx` | + demande permission push (ServiceWorker) |
| `apps/web-driver/src/App.jsx` | + demande permission push |

---

### Tests (cible : +18 → 353)

| Fichier | Tests |
|---------|-------|
| `tests/test_notifications_dispatch.py` | 12 tests : push envoyé sur accept, email sur complete, SMS sur payout, mock adapter, retry |
| `tests/test_device_tokens.py` | 6 tests : register, deregister, double register, rôle, auth |

---

### Critères de validation

- [ ] `accept_trip` → notification push envoyée au customer (mock)
- [ ] `complete_trip` → email récapitulatif envoyé au customer (mock)
- [ ] Device token enregistré → visible en DB
- [ ] Device token révoqué → plus de push
- [ ] Erreur prestataire → retry_count incrémenté, notification non bloquante

---

---

## Sprint 27 — 📱 Application Mobile Customer (React Native)

**Objectif :** Application mobile iOS + Android pour les clients, feature-parity avec `web-customer`.

**Origine roadmap :** Phase 8 — Sprint 16 (non livré)

---

### Périmètre

**Nouveau répertoire :** `apps/mobile-customer/`  
**Stack :** React Native + Expo (SDK 51+), TypeScript

#### Fonctionnalités

| Feature | Description |
|---------|-------------|
| Auth | Google Sign-In via `expo-auth-session` + Firebase |
| Estimation | Formulaire origine/destination → carte de tarif |
| Réservation | Confirmation d'un trajet avec sélection de catégorie |
| Suivi temps réel | Carte MapView (react-native-maps) + polling tracking 5s |
| Paiement | Intégration web-view CinetPay ou Stripe Sheet |
| Notifications push | FCM via `expo-notifications`, registration automatique |
| Historique | Liste des trajets passés avec statuts et montants |
| Profil | Mise à jour nom, téléphone, lieux enregistrés |

#### Structure des fichiers

```
apps/mobile-customer/
  app.json              Expo config
  App.tsx               Root navigator (React Navigation)
  src/
    api.ts              Client API (même base que web-customer/api.js, TypeScript)
    screens/
      LoginScreen.tsx
      HomeScreen.tsx    Estimation + booking
      TrackingScreen.tsx
      PaymentScreen.tsx
      HistoryScreen.tsx
      ProfileScreen.tsx
    components/
      TripCard.tsx
      EtaCard.tsx
      TrackingMap.tsx
    hooks/
      useTrip.ts        Polling trip status
      useTracking.ts    Polling driver location
  eas.json              EAS Build config (iOS + Android)
```

#### CI

Ajout dans `.github/workflows/ci.yml` :
```yaml
- name: Build mobile-customer (iOS sim)
  run: cd apps/mobile-customer && npx expo export --platform ios
```

---

### Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `apps/mobile-customer/` | Nouveau répertoire complet |
| `.github/workflows/ci.yml` | + job `mobile-customer-build` |
| `apps/api/app/main.py` | Vérifier CORS pour origines Expo (pas de changement si `allow_origins=["*"]` en dev) |

---

### Tests (cible : +15 → 368)

Les tests mobiles sont des tests d'intégration E2E (Detox ou RNTL) :

| Fichier | Tests |
|---------|-------|
| `apps/mobile-customer/__tests__/auth.test.tsx` | 3 tests : login, logout, token stocké |
| `apps/mobile-customer/__tests__/booking.test.tsx` | 6 tests : estimation, booking, cancel, statuts |
| `apps/mobile-customer/__tests__/tracking.test.tsx` | 4 tests : polling, map update, ETA affichée |
| `apps/mobile-customer/__tests__/payment.test.tsx` | 2 tests : intent créé, webview ouverte |

---

### Critères de validation

- [ ] Build Expo sans erreur (iOS + Android)
- [ ] Google Sign-In fonctionne sur simulateur iOS
- [ ] Estimation → booking → suivi temps réel fonctionne de bout en bout
- [ ] Notification push reçue sur acceptation du trajet
- [ ] CI passe sur `main`

---

---

## Sprint 28 — 📱 Application Mobile Driver (React Native)

**Objectif :** Application mobile iOS + Android pour les chauffeurs, feature-parity avec `web-driver` + location en arrière-plan.

**Origine roadmap :** Phase 8 — Sprint 17 (non livré)

---

### Périmètre

**Nouveau répertoire :** `apps/mobile-driver/`  
**Stack :** React Native + Expo (SDK 51+), TypeScript

#### Fonctionnalités

| Feature | Description |
|---------|-------------|
| Auth | Google Sign-In + Firebase |
| Statut online/offline | Toggle avec envoi position immédiat |
| Location background | `expo-location` en mode `Background` — push toutes les 5s |
| Dispatch | Liste des trajets disponibles triés par proximité |
| Lifecycle trip | Accept → Start → Complete avec boutons dédiés |
| Assistance | Même liste unifiée (trajets + assistance) |
| Navigation | Deep link Google Maps / Waze vers l'origine |
| Earnings | Dashboard gains (jour, semaine, total) |
| Notifications push | FCM haute priorité pour nouveaux trajets |
| Profil | Licence, véhicule, documents KYC |

#### Structure des fichiers

```
apps/mobile-driver/
  app.json
  App.tsx
  src/
    api.ts
    screens/
      LoginScreen.tsx
      DispatchScreen.tsx    Liste trips + assistance
      ActiveTripScreen.tsx  Lifecycle en cours
      EarningsScreen.tsx
      ProfileScreen.tsx
      DocumentsScreen.tsx
    components/
      TripDispatchCard.tsx
      ActiveTripActions.tsx
      EarningsChart.tsx
    hooks/
      useLocation.ts        Background location + PUT /location
      useDispatch.ts        Polling dispatch toutes les 10s
    background/
      LocationTask.ts       expo-task-manager background task
  eas.json
```

#### Location background

```typescript
// LocationTask.ts — tourne même app fermée
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data }) => {
  const { locations } = data as LocationTaskData;
  const { latitude, longitude } = locations[0].coords;
  await api.updateLocation(getStoredToken(), latitude, longitude);
});
```

---

### Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `apps/mobile-driver/` | Nouveau répertoire complet |
| `.github/workflows/ci.yml` | + job `mobile-driver-build` |
| `apps/api/app/main.py` | Aucun changement API requis |

---

### Tests (cible : +15 → 383)

| Fichier | Tests |
|---------|-------|
| `apps/mobile-driver/__tests__/auth.test.tsx` | 3 tests |
| `apps/mobile-driver/__tests__/dispatch.test.tsx` | 5 tests : liste, accept, 409 concurrent |
| `apps/mobile-driver/__tests__/lifecycle.test.tsx` | 4 tests : start, complete, statuts |
| `apps/mobile-driver/__tests__/location.test.tsx` | 3 tests : push location, background task |

---

### Critères de validation

- [ ] Build Expo sans erreur (iOS + Android)
- [ ] Location poussée toutes les 5s quand app en arrière-plan (simulateur)
- [ ] Dispatch trié par proximité (driver position connue)
- [ ] Notification haute priorité reçue sur nouveau trajet
- [ ] CI passe sur `main`

---

---

## Sprint 29 — 💰 Payout Batch & Commission Chauffeur

**Objectif :** Le chauffeur dispose d'un solde net (après commission plateforme) et l'admin peut déclencher des virements réels via le prestataire de paiement.

**Origine roadmap :** Phase 5 — Sprint 12 (partiellement livré — payout requests manuelles, pas de batch réel)

---

### Périmètre

#### Ce qui existe déjà (Sprint 11)
- Table `payout_requests` : chauffeur crée une demande, admin l'approuve manuellement
- `GET /v1/drivers/me/earnings` : total brut, jour, semaine
- `GET /v1/admin/payout-requests` + `PATCH status`

#### Ce qui manque
1. Commission configurable par catégorie
2. Solde net disponible calculé en temps réel
3. Batch payout hebdomadaire déclenché par l'admin
4. Intégration prestataire de virement (Orange Money B2C / Stripe Connect)
5. Réconciliation : virement confirmé → payout marqué `processed`

#### Nouvelles tables (migration 0023)

**Table `commission_settings`** :
```
id              UUID        PK
category        VARCHAR(32) -- "economy" | "comfort" | "premium" | "assistance" | "default"
rate_pct        INTEGER     -- ex: 15 = 15%
effective_from  DATETIME(tz)
created_by      UUID        FK users.id
```

**Colonne ajoutée sur `payout_requests`** :
```
provider_ref    VARCHAR(128) NULL  -- référence virement externe
processed_at    DATETIME(tz) NULL
```

#### Nouveaux endpoints

| Méthode | Route | Rôle | Description |
|---------|-------|------|-------------|
| `GET` | `/v1/drivers/me/balance` | driver | Solde net disponible (gains - commission - retraits précédents) |
| `POST` | `/v1/admin/payouts/run` | admin | Déclenche le batch payout pour toutes les demandes `approved` |
| `GET` | `/v1/admin/commission` | admin | Liste les règles de commission |
| `POST` | `/v1/admin/commission` | admin | Crée/met à jour une règle de commission |

**Logique `GET /v1/drivers/me/balance` :**
```
gains_bruts = SUM(trip.fare_xof) pour les trips completed du driver
commission   = gains_bruts × commission_rate (selon catégorie)
retraits     = SUM(payout_request.amount_xof) pour les payouts processed
solde_net    = gains_bruts - commission - retraits
```

**Logique `POST /v1/admin/payouts/run` :**
- Récupère toutes les `payout_requests` en statut `approved`
- Pour chacune : appelle l'adaptateur de virement (`PayoutAdapter`)
- Succès → status `processed`, `processed_at` = now, `provider_ref` = ref externe
- Échec → status `failed`, log de l'erreur
- Retourne un rapport `{ processed: N, failed: M, total_xof: X }`

---

### Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `app/models/payout.py` | + `commission_settings`, colonne `payout_requests` |
| `app/payment/payout_adapter.py` | Nouveau — protocole `PayoutAdapter` + `MockPayoutAdapter` |
| `app/crud.py` | + `get_driver_balance`, `run_payout_batch`, `get_commission`, `set_commission` |
| `app/main.py` | + 4 endpoints |
| `app/config.py` | + `default_commission_pct` (défaut : 15) |
| `alembic/versions/0023_commission_payout_batch.py` | Nouvelle migration |
| `apps/web-driver/src/App.jsx` | `EarningsCard` affiche solde net + commission |
| `apps/web-admin/src/App.jsx` | Bouton "Lancer batch payout", tableau commission |

---

### Tests (cible : +18 → 401)

| Fichier | Tests |
|---------|-------|
| `tests/test_balance.py` | 8 tests : calcul net, commission economy/premium, solde après retrait |
| `tests/test_payout_batch.py` | 7 tests : batch run, rapport, provider error, idempotence |
| `tests/test_commission.py` | 3 tests : get/set, taux par catégorie |

---

### Critères de validation

- [ ] `GET /v1/drivers/me/balance` retourne un solde cohérent avec les trips et commission
- [ ] Commission 15% economy → solde = fare × 0.85
- [ ] `POST /v1/admin/payouts/run` traite toutes les demandes `approved` (mock)
- [ ] Rapport du batch indique processed/failed
- [ ] Taux de commission modifiable par l'admin sans redémarrage

---

---

## Sprint 30 — 🧑‍💼 Workflow Candidature Chauffeur

**Objectif :** Un utilisateur peut soumettre une candidature chauffeur en ligne (formulaire + documents). L'admin la traite et prend une décision. Le candidat est notifié.

**Origine roadmap :** Phase 6 — Sprint 14 (non livré — remplacé par KYC documents Sprint 17)

---

### Périmètre

#### Ce qui existe déjà (Sprint 17)
- `driver_documents` : chauffeur peut uploader des documents (type + URL)
- `PATCH /v1/admin/documents/{id}/status` : admin approuve/rejette

#### Ce qui manque
- **Workflow de candidature** : un utilisateur qui n'est pas encore chauffeur peut postuler
- Upload vers Cloud Storage (les URLs actuelles sont saisies manuellement)
- Décision admin → notification email + SMS → création automatique du profil driver
- Interface admin de gestion des candidatures

#### Nouvelle table `driver_applications` (migration 0024)

```
id              UUID        PK
user_id         UUID        FK users.id ON DELETE CASCADE  UNIQUE
status          VARCHAR(32) -- submitted | under_review | approved | rejected
full_name       VARCHAR(128)
phone           VARCHAR(32)
license_number  VARCHAR(64)
vehicle_make    VARCHAR(64)
vehicle_model   VARCHAR(64)
vehicle_plate   VARCHAR(32)
vehicle_year    INTEGER
notes_admin     TEXT        NULL  -- commentaire admin lors de la décision
submitted_at    DATETIME(tz)
reviewed_at     DATETIME(tz) NULL
reviewed_by     UUID        FK users.id NULL
```

#### Endpoints

| Méthode | Route | Rôle | Description |
|---------|-------|------|-------------|
| `POST` | `/v1/drivers/apply` | customer | Soumet une candidature chauffeur |
| `GET` | `/v1/drivers/apply/status` | customer | Consulte l'état de sa candidature |
| `GET` | `/v1/admin/applications` | admin | Liste les candidatures (filtrables par statut) |
| `GET` | `/v1/admin/applications/{id}` | admin | Détail d'une candidature |
| `PATCH` | `/v1/admin/applications/{id}/review` | admin | Approuve ou rejette (status + notes_admin) |
| `POST` | `/v1/drivers/apply/documents` | customer | Upload document vers Cloud Storage (signed URL) |

**Logique `PATCH .../review` avec `status=approved` :**
1. Met `driver_applications.status = approved`
2. Crée automatiquement un enregistrement `drivers` si absent
3. Set `drivers.status = active`
4. Envoie notification email + SMS au candidat (Sprint 26 requis)
5. Log dans `trip_events` n/a → log dans `notification_log`

#### Cloud Storage — Upload sécurisé

```python
# Génère une signed URL pour upload direct depuis le navigateur
async def generate_upload_url(filename: str, content_type: str) -> str:
    bucket = storage_client.bucket(settings.gcs_bucket)
    blob = bucket.blob(f"driver-docs/{uuid4()}/{filename}")
    return blob.generate_signed_url(expiration=timedelta(minutes=15), method="PUT")
```

---

### Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `app/models/application.py` | Nouveau — modèle `DriverApplication` |
| `app/crud.py` | + `create_application`, `get_application`, `list_applications`, `review_application` |
| `app/main.py` | + 6 endpoints |
| `app/config.py` | + `gcs_bucket` |
| `alembic/versions/0024_driver_applications.py` | Nouvelle migration |
| `apps/web-customer/src/App.jsx` | + section "Devenir chauffeur" avec formulaire multi-étapes |
| `apps/web-admin/src/App.jsx` | + onglet "Candidatures" avec liste + actions |

---

### Tests (cible : +20 → 421)

| Fichier | Tests |
|---------|-------|
| `tests/test_applications.py` | 14 tests : submit, double submit 409, statut, review approve/reject, listing admin, rôles |
| `tests/test_application_workflow.py` | 6 tests : approve → driver créé, reject → pas de driver, notification déclenchée (mock) |

---

### Critères de validation

- [ ] Un customer peut soumettre une candidature (une seule, 409 si doublon)
- [ ] Admin liste les candidatures filtrées par statut
- [ ] Approbation → profil `drivers` créé automatiquement avec `status=active`
- [ ] Rejet → candidat notifié, aucun profil créé
- [ ] Upload Cloud Storage : signed URL générée sans exposer les credentials

---

---

## Sprint 31 — 📈 Performance, Beta Fermée & GA

**Objectif :** Le système tient 1 000 utilisateurs simultanés. La beta fermée valide l'expérience en conditions réelles. Les apps mobiles sont soumises aux stores. Lancement GA.

**Origine roadmap :** Phase 9 (Sprint 20) + Phase 10 (Sprints 21–22) — non livrés

---

### Périmètre

#### 1. Performance backend

**Redis cache — `GET /v1/estimate`**
- Clé : `estimate:{hash(origin_lat,origin_lng,dest_lat,dest_lng,category)}`
- TTL : 10 minutes (identique à `fare_estimate_ttl_minutes`)
- Invalidation : surge multiplier modifié → flush du cache
- Librairie : `redis.asyncio` + `fakeredis` pour les tests

**Connection pooling**
- `asyncpg` connection pool configuré via `DATABASE_URL` (paramètre `pool_size=20`)
- `SQLALCHEMY_POOL_RECYCLE=3600` pour Cloud SQL
- Optionnel : PgBouncer en mode transaction si besoin

**CDN pour les frontends**
- Cloud CDN activé sur le Load Balancer devant les Cloud Run frontends
- Cache-Control : `max-age=3600` sur les assets Vite (JS/CSS)
- `/index.html` : `no-cache`

#### 2. Load testing

**Locust** — `infra/locust/locustfile.py` :
```
Scénario 1 : Booking flow
  POST /v1/estimate → POST /v1/trips → GET /v1/trips/{id} (poll 5s x6)
  Cible : 500 users, spawn 50/s, p99 < 500ms

Scénario 2 : Location flood
  PUT /v1/drivers/me/location toutes les 5s
  Cible : 200 drivers simultanés, p99 < 200ms
```

Rapport Locust généré et archivé dans `infra/locust/reports/`.

#### 3. Feature flags

Table `feature_flags` (migration 0025) :
```
name        VARCHAR(64)  PK
enabled     BOOLEAN      default false
rollout_pct INTEGER      default 0  -- 0-100 % des users
updated_at  DATETIME(tz)
```

`GET /v1/admin/flags` / `PATCH /v1/admin/flags/{name}` (admin uniquement)

Flags initiaux : `payment_enabled`, `mobile_tracking_v2`, `driver_application_flow`

#### 4. Beta fermée

- 50 clients + 10 chauffeurs invités (codes d'invitation)
- Formulaire de feedback intégré dans les apps web + mobile
- Incident log en `docs/ops/incidents/`
- Runbooks en `docs/ops/runbooks/`
- SLOs publiés : API p99 < 500ms, disponibilité > 99.5%

#### 5. General Availability

- App Store + Play Store submissions (EAS Submit)
- `min-instances=1` sur `ziza-api` en prod (éliminer les cold starts)
- Support channel configuré (Crisp ou Intercom)
- SLA publié dans `docs/sla.md`
- Post-launch monitoring : alertes Cloud Monitoring, runbook on-call

---

### Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `app/cache.py` | Nouveau — client Redis async + helpers `cache_get`/`cache_set` |
| `app/models/flag.py` | Nouveau — modèle `FeatureFlag` |
| `app/crud.py` | `create_estimate` : check cache avant calcul, mise en cache après |
| `app/main.py` | + `/v1/admin/flags`, `/v1/admin/flags/{name}`, pool config |
| `app/config.py` | + `redis_url`, `cache_enabled` |
| `alembic/versions/0025_feature_flags.py` | Nouvelle migration |
| `infra/locust/locustfile.py` | Nouveau — scénarios de charge |
| `infra/gcp/cdn.sh` | Nouveau — provisioning Cloud CDN |
| `docs/ops/runbooks/` | Nouveau — runbooks on-call |
| `docs/ops/sla.md` | Nouveau — SLA public |
| `.github/workflows/ci.yml` | + `fakeredis` dans les deps de test |

---

### Tests (cible : +40 → 461)

| Fichier | Tests |
|---------|-------|
| `tests/test_cache.py` | 8 tests : cache hit, cache miss, TTL, invalidation sur surge |
| `tests/test_feature_flags.py` | 5 tests : flag activé/désactivé, rollout pct, admin only |
| `tests/test_performance.py` | 3 tests : estimate < 50ms avec cache, 10 estimates parallèles |
| `infra/locust/locustfile.py` | 2 scénarios Locust (booking + location flood) |
| Intégration E2E beta | 24 tests Detox couvrant le flux complet customer + driver |

---

### Critères de validation

- [ ] `/v1/estimate` retourne depuis le cache en < 5ms (2e appel identique)
- [ ] Locust : 500 users simultanés, p99 < 500ms sur le booking flow
- [ ] Locust : 200 drivers simultanés, p99 < 200ms sur `PUT /v1/drivers/me/location`
- [ ] Feature flag `payment_enabled = false` → `/v1/payments/intent` retourne 503
- [ ] Apps iOS + Android soumises sur EAS Submit sans erreur de build
- [ ] `min-instances=1` vérifié sur Cloud Run (`gcloud run services describe`)

---

---

## Tableau de bord global

### Tests par sprint

| Sprint | Nouveaux tests | Total cumulé |
|--------|---------------|-------------|
| 23 (livré) | +16 | 300 |
| 24 | +20 | 320 |
| 25 | +15 | 335 |
| 26 | +18 | 353 |
| 27 | +15 | 368 |
| 28 | +15 | 383 |
| 29 | +18 | 401 |
| 30 | +20 | 421 |
| 31 | +40 | **461** |

### Migrations Alembic

| Migration | Sprint | Description |
|-----------|--------|-------------|
| 0019 | 24 | `payment_intents` |
| 0020 | 24 | `trips.paid_at` |
| 0021 | 25 | `refresh_tokens` |
| 0022 | 26 | `device_tokens` + `notifications` v2 |
| 0023 | 29 | `commission_settings` + `payout_requests` update |
| 0024 | 30 | `driver_applications` |
| 0025 | 31 | `feature_flags` |

### Dépendances de déploiement

| Service | Sprint requis | Raison |
|---------|--------------|--------|
| Redis (Memorystore) | 31 | Cache estimate |
| Cloud Storage (GCS) | 30 | Upload documents candidature |
| Cloud CDN | 31 | Performance frontends |
| Secret Manager | 25 | Tous les secrets prod |
| Cloud Armor | 25 | WAF sur API |
| FCM (Firebase) | 26 | Push notifications |
| SendGrid | 26 | Email transactionnel |
| AfricasTalking | 26 | SMS Afrique de l'Ouest |
| CinetPay / Stripe | 24 | Paiement client |
| EAS Build | 27–28 | CI mobile |

---

## Règles de processus (issues de la revue Sprint 23)

Pour éviter une nouvelle divergence roadmap vs réalisé :

1. **Sprint doc avant le code** — aucune ligne de code sans `sprint-N.md` validé
2. **Checklist 30 secondes au démarrage de chaque sprint** :
   - Ce sprint est-il dans la roadmap ?
   - La dépendance du sprint précédent est-elle livrée ?
   - Le sprint doc liste-t-il les migrations, endpoints, tests et fichiers modifiés ?
3. **Revue mensuelle de la roadmap** — comparer roadmap.md vs sprints livrés, mettre à jour les deux
4. **Tout pivot doit être documenté** dans un fichier `docs/agile/decision-YYYY-MM-DD-sujet.md`
5. **Ce document est vivant** — mettre à jour le statut de chaque sprint dès qu'il est livré
