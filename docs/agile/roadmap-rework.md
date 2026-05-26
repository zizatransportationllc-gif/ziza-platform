# Roadmap Rework — Analyse exhaustive & plan correctif Sprints 24–31

**Document :** Analyse complète roadmap vs sprints livrés (Sprints 1–23)  
**Statut :** 🔲 Planifié  
**Méthode :** Lecture ligne par ligne de chaque sprint doc vs roadmap.md  
**Dernière mise à jour :** 2026-05-26

---

## Partie 1 — Matrice de comparaison Sprint par Sprint

> Légende : ✅ Livré conforme · ⚠️ Livré partiellement · ❌ Non livré · 🔄 Remplacé par autre chose

---

### Sprint 1 — Foundation (pipeline CI/CD)

| Roadmap attendait | Livré | Statut |
|---|---|---|
| Repo initialisé avec structure cible | ✅ | ✅ |
| 4 services Docker (API + 3 frontends) | ✅ | ✅ |
| CI GitHub Actions vert (lint + test + build + isolation guard) | ✅ | ✅ |
| 4 services Cloud Run déployés | ✅ | ✅ |
| docker compose up stack locale | ✅ | ✅ |
| Documentation complète et reproductible | ✅ | ✅ |

**Verdict Sprint 1 : ✅ Conforme.**

---

### Sprint 2 — Auth DEV + Role Abstraction

| Roadmap attendait | Livré | Statut |
|---|---|---|
| Interface `AuthAdapter` + dataclass `Claims` | ✅ | ✅ |
| `DevAdapter` (PyJWT, HMAC-signed) | ✅ | ✅ |
| `POST /v1/token` (dev only) | ✅ | ✅ |
| `GET /v1/me` endpoint protégé | ✅ | ✅ |
| `require_role()` dépendance FastAPI | ✅ (inline) | ⚠️ |
| 3 utilisateurs seedés (customer/driver/admin) | ✅ | ✅ |
| Login form + role guard sur les 3 frontends | ✅ | ✅ |
| 11 tests backend | ✅ | ✅ |

**Verdict Sprint 2 : ✅ Conforme.** `require_role()` implémenté en inline plutôt qu'en dépendance — décision de style, aucun impact fonctionnel.

---

### Sprint 3 — Auth PROD (Firebase)

| Roadmap attendait | Livré | Statut |
|---|---|---|
| `FirebaseAdapter` complet (firebase-admin SDK) | ✅ | ✅ |
| `POST /v1/auth/register` (upsert user) | ✅ | ✅ |
| Google Sign-In sur les 3 frontends | ✅ | ✅ |
| Module `auth.js` par frontend (isolé) | ✅ | ✅ |
| **Token refresh flow** | ❌ Non livré | ❌ |
| CI : tests avec DevAdapter, prod avec ENVIRONMENT=prod | ✅ | ✅ |

**GAP #1 — Token refresh absent :**
Le token Firebase dure 1h et le dev token 24h. Aucun mécanisme de refresh n'a été implémenté. La roadmap mentionnait explicitement "token refresh" en Sprint 3 puis à nouveau en Sprint 18. Les utilisateurs sont déconnectés brutalement à l'expiration.

---

### Sprint 4 — PostgreSQL + Core Schema

| Roadmap attendait | Livré | Statut |
|---|---|---|
| Cloud SQL PostgreSQL 16 + `infra/gcp/cloudsql.sh` | ✅ | ✅ |
| Migrations Alembic : users, drivers, vehicles, trips, trip_events | ✅ | ✅ |
| SQLAlchemy async session | ✅ | ✅ |
| `POST /v1/auth/register` upsert réel | ✅ | ✅ |
| PostgreSQL dans docker-compose.yml | ✅ | ✅ |
| Smoke tests connectivité DB | ✅ | ✅ |

**Verdict Sprint 4 : ✅ Conforme.**

---

### Sprint 5 — Pricing & Estimate

| Roadmap attendait | Livré | Statut |
|---|---|---|
| `POST /v1/estimate` → distance_km, duration_min, fare_xof | ✅ | ✅ |
| Fare matrix configurable (base, per_km, surge) | ✅ | ✅ |
| Google Maps Distance Matrix ou Haversine fallback | ✅ | ✅ |
| web-customer : formulaire estimation + carte tarif | ✅ | ✅ |
| Tests unitaires tarification + contract API | ✅ | ✅ |

**Verdict Sprint 5 : ✅ Conforme.**

---

### Sprint 6 — Trip Booking State Machine

| Roadmap attendait | Livré | Statut |
|---|---|---|
| États : pending→accepted→in_progress→completed\|cancelled | ✅ | ✅ |
| `POST /v1/trips`, `GET /v1/trips/{id}`, `PATCH cancel` | ✅ | ✅ |
| `trip_events` log chaque transition avec timestamp | ✅ | ✅ |
| **Champ `actor` sur `trip_events`** | ❌ Non livré | ❌ |
| web-customer : booking flow (confirm → waiting screen) | ✅ | ✅ |
| Tests : state machine, transitions invalides → 409 | ✅ | ✅ |

**GAP #2 — Champ `actor` absent de `trip_events` dès Sprint 6 :**
La roadmap Sprint 6 spécifiait "trip_events logs every state transition with timestamp + actor". Le champ `actor` n'a été ajouté qu'en Sprint 23 (migration 0018). Les 284 premières lignes de `trip_events` n'ont aucun actor (NULL).

---

### Sprint 7 — Driver Dispatch & Acceptance

| Roadmap attendait | Livré | Statut |
|---|---|---|
| `GET /v1/dispatch/available` — trips proches (radius filter) | ⚠️ `/v1/trips/driver/available`, sans radius | ⚠️ |
| `POST /v1/dispatch/{trip_id}/accept` | ✅ (`PATCH /v1/trips/{id}/accept`) | ✅ |
| `POST /v1/trips/{id}/start` | ✅ | ✅ |
| `POST /v1/trips/{id}/complete` | ✅ | ✅ |
| web-driver : dispatch list, accept, start/complete | ✅ | ✅ |
| web-customer : polling status (remplacement temporaire push) | ✅ | ✅ |
| **Test concurrence : 2 drivers → 1 win, 1 × 409** | ⚠️ Test 1 driver, pas 2 drivers distincts | ⚠️ |

**GAP #3 — Filtre par rayon (radius filter) jamais livré :**
La roadmap demandait un filtre géographique sur le dispatch dès Sprint 7 ("trips near their location — simple radius filter"). Le dispatch a montré tous les trips `pending` sans aucun filtre géographique jusqu'au Sprint 23 (où un tri par proximité a été ajouté, mais pas un filtre radius).

**GAP #4 — Test de concurrence multi-driver incomplet :**
La roadmap Sprint 7 demandait "concurrency: two drivers try to accept same trip → one 409". Le test livré (`test_accept_already_accepted_trip_returns_409`) teste qu'un driver ne peut pas accepter un trip qu'il a déjà accepté, mais pas le scénario de **deux drivers distincts** en race condition. Ce test a été ajouté en Sprint 23 (`test_concurrency.py`).

---

### Sprint 8 — Real-time Location & Tracking

| Roadmap attendait | Livré | Statut |
|---|---|---|
| `POST /v1/drivers/location` (every 5s, lat/lng) | ❌ | 🔄 |
| `GET /v1/trips/{id}/tracking` — driver lat/lng | ❌ | 🔄 |
| Customer app : map view, polling /tracking every 5s | ❌ | 🔄 |
| `drivers` table : `current_lat`, `current_lng`, `last_seen_at` | ❌ | 🔄 |
| `/v1/dispatch/available` : tri par position réelle | ❌ | 🔄 |
| WebSocket Sprint 15 | ❌ | ❌ |
| Tests : location update, tracking, stale location | ❌ | 🔄 |

**GAP #5 — Sprint 8 entièrement remplacé :**
Le Sprint 8 **livré** a implémenté le **système de notation** (ratings), qui n'était pas dans la roadmap avant Sprint 8. Tous les éléments de localisation temps réel ont été reportés :
- `PUT /v1/drivers/me/location` → livré en Sprint 22
- `GET /v1/trips/{id}/tracking` → livré en Sprint 23
- `drivers.current_lat/lng/last_seen_at` → livré en Sprint 23
- Tri par position réelle dans le dispatch → livré en Sprint 23
- Map view customer (carte interactive) → **jamais livré** (Sprint 24+)
- WebSocket → **jamais livré** (Sprint 24+)
- Gestion des positions périmées (stale location) → **jamais livré**

---

### Sprint 9 — Roadside Assistance

| Roadmap attendait | Livré | Statut |
|---|---|---|
| `assistance_requests` (type, location, status, driver) | ✅ | ✅ |
| Types : BREAKDOWN\|FLAT_TYRE\|TOW\|FUEL\|LOCKOUT | ✅ | ✅ |
| État : pending→accepted→in_progress→resolved | ✅ | ✅ |
| `POST /v1/assistance`, `GET /v1/assistance/{id}` | ✅ | ✅ |
| web-customer : bouton "Besoin d'aide" + type picker | ✅ | ✅ |
| web-driver : dispatch unifié (trips + assistance) | ✅ | ✅ |
| Tests complets | ✅ | ✅ |

**Verdict Sprint 9 : ✅ Conforme.**

---

### Sprint 10 — Roadside Provider Specialisation

| Roadmap attendait | Livré | Statut |
|---|---|---|
| `driver_capabilities` table | ✅ | ✅ |
| Dispatch filtré par capability + **proximité** | ⚠️ Filtré par type, pas par proximité | ⚠️ |
| ETA à l'acceptation | ✅ (mais calculé depuis centre-ville codé en dur) | ⚠️ |
| Admin : approve/revoke capabilities | ✅ | ✅ |
| web-admin : gestion des compétences | ✅ | ✅ |

**GAP #6 — Dispatch non filtré par proximité géographique :**
La roadmap Sprint 10 demandait "dispatch filters by capability + proximity". Le filtrage par proximité géographique (distance chauffeur ↔ client) n'a jamais été implémenté dans le dispatch assistance. Seul le filtrage par type de compétence fonctionne.

**GAP #7 — ETA calculé depuis un point fixe :**
L'ETA calculé lors d'`accept_assistance` utilisait le centre d'Abidjan (5.345317, -4.024429) comme position du chauffeur au lieu de sa position réelle. Corrigé en Sprint 23 (`accept_assistance` lit maintenant `driver.current_lat/lng`), mais seulement si le chauffeur a poussé sa position via `PUT /v1/drivers/me/location`.

---

### Sprint 11 — Payments (roadmap) → Earnings & Admin Stats (livré)

| Roadmap attendait | Livré | Statut |
|---|---|---|
| **Intégration Stripe / Orange Money** | ❌ | 🔄 |
| **Table `payment_intents`** | ❌ | 🔄 |
| **`POST /v1/payments/intent`** | ❌ | 🔄 |
| **Webhook handler paiement** | ❌ | 🔄 |
| **web-customer : écran de paiement** | ❌ | 🔄 |
| **Smoke test Stripe test mode** | ❌ | 🔄 |
| `GET /v1/drivers/me/earnings` (total, aujourd'hui, semaine) | ✅ (livré à la place) | 🔄 |
| `GET /v1/admin/stats` | ✅ (livré à la place) | 🔄 |
| `GET /v1/admin/trips` paginé | ✅ (livré à la place) | 🔄 |

**GAP #8 — Paiement client jamais implémenté :**
L'intégralité de la Phase 5 Paiements (Stripe/Orange Money) a été remplacée par les gains chauffeur et les stats admin. Aucune notion de paiement réel n'existe dans la plateforme :
- Pas de table `payment_intents`
- Pas d'appel prestataire de paiement
- Pas de webhook de confirmation
- Les trajets complétés ne sont jamais "payés" en base de données
- Le client ne peut payer nulle part dans l'interface

---

### Sprint 12 — Payouts (roadmap) → Vehicle + Assistance History + Admin Users (livré)

| Roadmap attendait | Livré | Statut |
|---|---|---|
| **Table `payouts`** (amount, status, driver_id) | ❌ | 🔄 |
| **Gains = fares - commission %** | ❌ | 🔄 |
| **`GET /v1/drivers/earnings` avec commission** | ❌ (gains bruts seulement) | ⚠️ |
| **`POST /v1/admin/payouts/run` (batch hebdo)** | ❌ | 🔄 |
| **web-driver : earnings dashboard avec commission** | ❌ | 🔄 |
| **web-admin : payout management (approve, retry failed)** | ❌ | 🔄 |
| `POST /v1/drivers/me/vehicle`, `GET /v1/drivers/me/vehicle` | ✅ (livré à la place) | 🔄 |
| `GET /v1/assistance` (historique client) | ✅ (livré à la place) | 🔄 |
| `GET /v1/admin/users` | ✅ (livré à la place) | 🔄 |

**GAP #9 — Commission plateforme et batch payout absents :**
- Les gains affichés au chauffeur sont **bruts** (100% du fare_xof sans déduction de commission)
- La commission plateforme (typiquement 15–20%) n'est jamais calculée ni déduite
- Le batch payout hebdomadaire administrateur n'existe pas
- Il n'y a aucune intégration avec un prestataire de virement réel
- Le module `payout_requests` (Sprint 15) est manuel et sans intégration financière

---

### Sprint 13 — Admin Dashboard (roadmap) → History + Online + Admin Assistance (livré)

| Roadmap attendait | Livré | Statut |
|---|---|---|
| `GET /v1/admin/trips` filtrable | ✅ (Sprint 11 + 19) | ✅ |
| `GET /v1/admin/users` + gestion des rôles | ✅ (Sprint 12) | ⚠️ |
| **`GET /v1/admin/kpis`** (rides quotidiens, revenue, chauffeurs actifs, taux complétion) | ✅ (Sprint 11 `/v1/admin/stats`) | ⚠️ |
| **web-admin : live map des trajets actifs** | ❌ | ❌ |
| Driver online toggle | ✅ (livré à la place) | 🔄 |
| Historique courses driver | ✅ (livré à la place) | 🔄 |
| Admin gestion des rôles utilisateurs | ❌ | ❌ |

**GAP #10 — Carte temps réel des trajets actifs jamais livrée :**
La roadmap attendait une carte interactive dans l'interface admin montrant les trajets en cours et les chauffeurs en ligne. Cette feature n'existe nulle part.

**GAP #11 — Gestion des rôles utilisateurs par l'admin :**
La roadmap mentionnait "GET /v1/admin/users — user list + role management". La liste est livrée mais la **modification de rôle** d'un utilisateur par l'admin n'a jamais été implémentée.

---

### Sprint 14 — Driver Onboarding (roadmap) → Promo Codes + Driver Status (livré)

| Roadmap attendait | Livré | Statut |
|---|---|---|
| **Table `driver_applications`** (SUBMITTED→UNDER_REVIEW→APPROVED\|REJECTED) | ❌ | 🔄 |
| **Upload de documents vers Cloud Storage** | ❌ | 🔄 |
| **Admin review & approve/reject application** | ❌ (uniquement docs KYC, Sprint 17) | 🔄 |
| **Approved driver → `drivers` record créé automatiquement** | ❌ | 🔄 |
| **Email de notification sur décision** | ❌ | 🔄 |
| **web-customer : CTA "Devenir chauffeur"** | ❌ | 🔄 |
| Codes promo + remises | ✅ (livré à la place) | 🔄 |
| Gestion du statut chauffeur (admin) | ✅ (livré à la place) | 🔄 |

**GAP #12 — Workflow candidature chauffeur absent :**
Un utilisateur ne peut pas postuler pour devenir chauffeur depuis l'application. Il n'y a pas de formulaire de candidature, pas d'état `under_review`, pas de transition automatique vers la création d'un profil driver. L'upload de documents (Sprint 17) est une URL saisie manuellement — il n'y a pas de vrai upload vers Cloud Storage.

---

### Sprint 15 — Notifications push/email/SMS (roadmap) → Payouts manuels + Admin ratings (livré)

| Roadmap attendait | Livré | Statut |
|---|---|---|
| **FCM push (mobile et web push)** | ❌ | 🔄 |
| **SendGrid/Mailgun email transactionnel** | ❌ | 🔄 |
| **AfricasTalking SMS (couverture Afrique de l'Ouest)** | ❌ | 🔄 |
| **`notification_log` avec channel, recipient, event, status** | ❌ (table `notifications` sans canal) | ⚠️ |
| **Events : trip_accepted, driver_arriving, payment_confirmed, payout** | ❌ partiellement | ⚠️ |
| **web-customer/driver : permission push browser** | ❌ | 🔄 |
| `POST/GET /v1/drivers/me/payout-requests` | ✅ (livré à la place) | 🔄 |
| `GET /v1/admin/payout-requests` + PATCH status | ✅ (livré à la place) | 🔄 |
| `GET /v1/admin/ratings` | ✅ (livré à la place) | 🔄 |

**GAP #13 — Notifications externes (FCM/email/SMS) absentes :**
La table `notifications` créée en Sprint 18 est une table de notifications **in-app** consultées par polling. Il n'y a :
- Aucun FCM push (ni web push, ni mobile push)
- Aucun email transactionnel (pas de SendGrid, Mailgun)
- Aucun SMS (pas d'AfricasTalking, Twilio)
- Aucun device_token enregistré
- La colonne `channel` n'existe pas dans `notifications`
- Aucune demande de permission push dans les frontends

---

### Sprint 16 — Mobile Customer App (roadmap) → Profil + Surge (livré)

| Roadmap attendait | Livré | Statut |
|---|---|---|
| **`apps/mobile-customer/` React Native + Expo** | ❌ | 🔄 |
| **Google Sign-In mobile** | ❌ | 🔄 |
| **Carte trajet temps réel** | ❌ | 🔄 |
| **Paiement in-app** | ❌ | 🔄 |
| **Deep links** | ❌ | 🔄 |
| **Push FCM** | ❌ | 🔄 |
| **CI : EAS Build iOS + Android** | ❌ | 🔄 |
| `GET/PATCH /v1/profile` (nom, téléphone) | ✅ (livré à la place) | 🔄 |
| `GET/PATCH /v1/admin/settings/surge` | ✅ (livré à la place) | 🔄 |

**GAP #14 — Application mobile customer absente.**

---

### Sprint 17 — Mobile Driver App (roadmap) → KYC Documents + Admin Pending Counts (livré)

| Roadmap attendait | Livré | Statut |
|---|---|---|
| **`apps/mobile-driver/` React Native + Expo** | ❌ | 🔄 |
| **Background location tracking** | ❌ | 🔄 |
| **Dispatch notifications haute priorité (FCM)** | ❌ | 🔄 |
| **Navigation deep link Google Maps / Waze** | ❌ | 🔄 |
| **Earnings dashboard mobile** | ❌ | 🔄 |
| **CI : EAS Build iOS + Android** | ❌ | 🔄 |
| `POST /v1/drivers/me/documents` (KYC) | ✅ (livré à la place) | 🔄 |
| `PATCH /v1/admin/documents/{id}/status` | ✅ (livré à la place) | 🔄 |
| `GET /v1/admin/pending-counts` | ✅ (livré à la place) | 🔄 |

**GAP #15 — Application mobile driver absente.**

---

### Sprint 18 — Security Hardening (roadmap) → In-app Notifications (livré)

| Roadmap attendait | Livré | Statut |
|---|---|---|
| **GCP Secret Manager pour tous les secrets** | ❌ | 🔄 |
| **Cloud Armor WAF sur l'ingress API** | ❌ | 🔄 |
| **OWASP Top-10 review de tous les endpoints** | ❌ | 🔄 |
| **JWT expiry + refresh token flow** | ❌ | 🔄 |
| **`pip-audit`, `npm audit` en CI** | ❌ | 🔄 |
| **Penetration test (manuel ou OWASP ZAP)** | ❌ | 🔄 |
| `GET/PATCH /v1/notifications`, unread-count, read-all | ✅ (livré à la place) | 🔄 |
| Déclenchement auto sur accept/complete/document | ✅ (livré à la place) | 🔄 |

**GAP #16 — Security hardening entièrement absent :**
- Tous les secrets (DB_PASSWORD, JWT_SECRET, Firebase credentials) sont dans des variables d'environnement Cloud Run en clair, pas dans Secret Manager
- Aucun WAF devant l'API
- Aucun rate limiting sur les endpoints sensibles (`/v1/token`, `/v1/payments`)
- L'access token dure 24h sans refresh possible
- Aucun audit de dépendances en CI (pip-audit, npm audit, bandit)
- Aucun test de pénétration effectué

---

### Sprint 19 — SRE & Observabilité (roadmap) → Observabilité partielle + Filtres admin (livré)

| Roadmap attendait | Livré | Statut |
|---|---|---|
| Logs structurés JSON (request_id, user_id, trip_id) | ⚠️ request_id seulement (user_id/trip_id ajoutés Sprint 23) | ⚠️ |
| **Cloud Error Reporting → Slack/PagerDuty** | ❌ | ❌ |
| **Cloud Trace pour le profiling de latence API** | ❌ | ❌ |
| **Uptime checks sur les 4 services Cloud Run** | ❌ | ❌ |
| **SLOs : API p99 < 500ms, disponibilité > 99.5%** | ❌ (non documentés, non mesurés) | ❌ |
| Runbooks dans `docs/ops/` | ✅ | ✅ |
| **`min-instances=1` sur ziza-api en prod** | ❌ | ❌ |
| Header X-Request-ID | ✅ | ✅ |
| Filtres admin trips/users | ✅ (bonus) | ✅ |

**GAP #17 — SRE incomplet :**
- Cloud Error Reporting non branché (les erreurs ne remontent pas vers Slack/PagerDuty)
- Cloud Trace non activé (pas de profiling de latence)
- Aucun uptime check configuré (pas d'alertes sur les pannes)
- SLOs non définis ni mesurés formellement
- `min-instances=1` non configuré (cold starts possibles en prod)

---

### Sprint 20 — Performance (roadmap) → Saved Places (livré)

| Roadmap attendait | Livré | Statut |
|---|---|---|
| **Load test Locust (booking flow, location updates)** | ❌ | 🔄 |
| **Connection pooling (PgBouncer ou Cloud SQL Connector)** | ❌ | 🔄 |
| **Redis cache pour `/v1/estimate` (10 min TTL)** | ❌ | 🔄 |
| **CDN Cloud CDN devant les frontends** | ❌ | 🔄 |
| **Cost review : right-size Cloud Run, Artifact Registry cleanup** | ❌ | 🔄 |
| Lieux enregistrés (address book) | ✅ (livré à la place) | 🔄 |

**GAP #18 — Performance et optimisations coût absentes.**

---

### Sprint 21 — Closed Beta (roadmap) → Vehicle Categories (livré)

| Roadmap attendait | Livré | Statut |
|---|---|---|
| **50 vrais utilisateurs, 10 vrais chauffeurs, 1 ville, 2 semaines** | ❌ | 🔄 |
| **Feature flags pour rollout progressif** | ❌ | 🔄 |
| **Formulaire de feedback dans les apps** | ❌ | 🔄 |
| **Processus hotfix documenté** | ❌ | 🔄 |
| **Incident log** | ❌ | 🔄 |
| Catégories de véhicules (Economy/Comfort/Premium) | ✅ (livré à la place) | 🔄 |

**GAP #19 — Beta fermée jamais organisée.**

---

### Sprint 22 — General Availability (roadmap) → Location + ETA (livré)

| Roadmap attendait | Livré | Statut |
|---|---|---|
| **Marketing landing page (`apps/web-landing/`)** | ❌ | 🔄 |
| **App Store + Play Store submissions** | ❌ | 🔄 |
| **Press kit + comptes sociaux** | ❌ | 🔄 |
| **SLA publié** | ❌ | 🔄 |
| **Support channel (Intercom ou Crisp)** | ❌ | 🔄 |
| **Post-launch monitoring sprint** | ❌ | 🔄 |
| `PUT /v1/drivers/me/location`, `GET /v1/drivers/me/location` | ✅ (livré à la place) | 🔄 |
| `GET /v1/trips/{id}/eta` | ✅ (livré à la place) | 🔄 |

**GAP #20 — Aucun des éléments de lancement GA n'est livré.**

---

### Sprint 23 — Corrections techniques (hors roadmap initiale)

Sprint correctif non présent dans la roadmap originale. Livré :
- `GET /v1/trips/{id}/tracking` (comble Sprint 8 roadmap)
- `drivers.current_lat/lng/last_seen_at` (comble Sprint 8 roadmap)
- Tri par proximité dans le dispatch (comble Sprint 7/8 roadmap)
- `actor` sur `trip_events` (comble Sprint 6 roadmap)
- `user_id` + `trip_id` dans les logs (comble Sprint 19 roadmap)
- Test concurrence double-accept → 409 (comble Sprint 7 roadmap)
- ETA depuis position réelle chauffeur (comble Sprint 10 roadmap)

---

## Partie 2 — Récapitulatif des 20 gaps identifiés

| # | Gap | Origine roadmap | Criticité |
|---|-----|-----------------|-----------|
| 1 | Token refresh absent | Sprint 3 + Sprint 18 | 🔴 Haute |
| 2 | `actor` sur `trip_events` retardé | Sprint 6 | 🟡 Faible (corrigé Sprint 23) |
| 3 | Filtre radius dispatch jamais livré | Sprint 7 | 🟡 Moyenne |
| 4 | Test concurrence multi-driver incomplet | Sprint 7 | 🟡 Faible (corrigé Sprint 23) |
| 5 | Sprint 8 entier remplacé (tracking → ratings) | Sprint 8 | 🔴 Haute |
| 6 | Dispatch assistance non filtré par proximité | Sprint 10 | 🟡 Moyenne |
| 7 | ETA depuis point fixe (corrigé Sprint 23) | Sprint 10 | 🟡 Faible (corrigé Sprint 23) |
| 8 | Paiement client (Stripe/Orange Money) absent | Sprint 11 | 🔴 Critique |
| 9 | Commission plateforme et batch payout absents | Sprint 12 | 🔴 Haute |
| 10 | Carte live admin jamais livrée | Sprint 13 | 🟡 Moyenne |
| 11 | Gestion des rôles utilisateurs admin absente | Sprint 13 | 🟡 Faible |
| 12 | Workflow candidature chauffeur absent | Sprint 14 | 🔴 Haute |
| 13 | FCM/email/SMS absents (notifs in-app seulement) | Sprint 15 | 🔴 Haute |
| 14 | App mobile customer absente | Sprint 16 | 🔴 Critique |
| 15 | App mobile driver absente | Sprint 17 | 🔴 Critique |
| 16 | Security hardening absent | Sprint 18 | 🔴 Critique |
| 17 | SRE incomplet (Cloud Trace, alertes, SLOs, min-instances) | Sprint 19 | 🔴 Haute |
| 18 | Performance absente (Redis, Locust, CDN, pooling) | Sprint 20 | 🔴 Haute |
| 19 | Beta fermée jamais organisée | Sprint 21 | 🟡 Moyenne |
| 20 | GA : landing page, stores, SLA, support channel | Sprint 22 | 🔴 Haute |

---

## Partie 3 — Plan correctif Sprints 24–31

> Distribution par ordre de dépendances techniques et valeur métier.

---

### Sprint 24 — 💳 Paiement client

**Gaps adressés : #8**  
**Origine roadmap : Phase 5, Sprint 11**

#### Objectif
Le client peut payer un trajet terminé via un prestataire adapté au marché ivoirien (CinetPay / Orange Money) avec Stripe en fallback international. Le paiement est tracé en base de données et confirmé via webhook.

#### Modèle de données

**Table `payment_intents`** (migration 0019) :
```
id              UUID        PK
trip_id         UUID        FK trips.id  UNIQUE
amount_xof      INTEGER     NOT NULL
currency        VARCHAR(8)  default "XOF"
provider        VARCHAR(32) -- "cinetpay" | "orange_money" | "stripe" | "mock"
provider_ref    VARCHAR(128) NULL  -- ID transaction externe
status          VARCHAR(32) -- pending | paid | failed | refunded
checkout_url    TEXT        NULL  -- URL de paiement renvoyée au client
created_at      DATETIME(tz)
updated_at      DATETIME(tz)
```

**Table `trips`** — colonne ajoutée (migration 0020) :
```
paid_at         DATETIME(tz) NULL
```

#### Adaptateur de paiement

```python
class PaymentAdapter(Protocol):
    async def create_checkout(self, amount_xof: int, ref: str, return_url: str) -> dict:
        ...  # retourne { provider_ref, checkout_url }
    async def verify_webhook(self, payload: bytes, headers: dict) -> dict:
        ...  # retourne { status: "paid"|"failed", provider_ref }
```

Implémentations :
- `MockPaymentAdapter` — tests & dev (toujours paid après webhook simulé)
- `CinetPayAdapter` — intégration CinetPay (leader Afrique de l'Ouest)
- `StripeAdapter` — cartes bancaires internationales

#### Endpoints

| Méthode | Route | Rôle | Description |
|---------|-------|------|-------------|
| `POST` | `/v1/payments/intent` | customer | Crée un intent + URL de paiement pour un trip `completed` |
| `GET` | `/v1/payments/{intent_id}` | customer | Statut de l'intent |
| `POST` | `/v1/payments/webhook` | system | Callback prestataire → confirme ou rejette |
| `GET` | `/v1/trips/{trip_id}/payment` | customer | Raccourci : état de paiement du trip |

**Règles métier :**
- Trip doit être `completed` (422 sinon)
- Un seul intent `paid` par trip (idempotence — retourne l'existant si déjà créé)
- Webhook avec signature invalide → 400 (pas 422, c'est un signal de sécurité)
- Après confirmation webhook → `trips.paid_at` = now, `payment_intents.status = paid`
- Notification in-app + email au customer (déclenche hook Sprint 26)

#### Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `app/models/payment.py` | Nouveau — `PaymentIntent` |
| `app/models/trip.py` | + colonne `paid_at` |
| `app/payment/__init__.py` | Nouveau |
| `app/payment/base.py` | Protocole `PaymentAdapter` |
| `app/payment/mock.py` | Adaptateur mock |
| `app/payment/cinetpay.py` | Adaptateur CinetPay |
| `app/payment/stripe.py` | Adaptateur Stripe |
| `app/crud.py` | + `create_payment_intent`, `confirm_payment`, `get_payment_intent`, `get_trip_payment` |
| `app/main.py` | + 4 endpoints paiement |
| `app/config.py` | + `payment_provider`, `cinetpay_api_key`, `cinetpay_site_id`, `stripe_secret_key`, `stripe_webhook_secret` |
| `alembic/versions/0019_payment_intents.py` | Nouvelle migration |
| `alembic/versions/0020_trip_paid_at.py` | Nouvelle migration |
| `apps/web-customer/src/api.js` | + `createPaymentIntent`, `getPaymentStatus` |
| `apps/web-customer/src/App.jsx` | + `PaymentSection` affichée après `completed` |
| `apps/web-customer/src/styles.css` | + `.payment-section`, `.payment-card`, `.payment-btn`, `.payment-status-paid` |

#### Tests (cible : +20 → 320)

| Fichier | Tests | Détail |
|---------|-------|--------|
| `tests/test_payments.py` | 15 | intent création, trip non completed → 422, mauvais customer → 403, webhook confirm → paid, webhook mauvaise signature → 400, intent idempotent, GET statut, trip payment shortcut |
| `tests/test_trips.py` | +3 | `paid_at` renseigné après webhook, trip payment initial null, stats revenue inclut paid |
| `tests/test_admin_stats.py` | +2 | revenue total inclut trips payés, nombre de paiements |

#### Critères de validation

- [ ] `POST /v1/payments/intent` sur un trip `completed` → 201 avec `checkout_url`
- [ ] Double appel → retourne l'intent existant (idempotence)
- [ ] Webhook mock confirme → `trip.paid_at` renseigné
- [ ] Webhook avec signature invalide → 400
- [ ] Trip non `completed` → 422
- [ ] Frontend affiche bouton "Payer" après statut `completed`
- [ ] Frontend affiche "✅ Payé" après confirmation

---

### Sprint 25 — 🔒 Security Hardening

**Gaps adressés : #1, #16**  
**Origine roadmap : Sprint 3 (token refresh) + Sprint 18 (security)**

#### Objectif
Éliminer les failles de sécurité critiques : refresh token, Secret Manager, rate limiting, WAF, audit de dépendances.

#### 1. JWT Refresh Token (Gap #1)

**Nouvelle table `refresh_tokens`** (migration 0021) :
```
id          UUID        PK
user_id     UUID        FK users.id ON DELETE CASCADE
token_hash  VARCHAR(64) UNIQUE  -- sha256(raw_token)
expires_at  DATETIME(tz)        -- now + 30 jours
revoked_at  DATETIME(tz) NULL
created_at  DATETIME(tz)
```

**Nouveaux endpoints :**

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/v1/auth/refresh` | Échange un refresh token valide contre un nouvel access token (15 min) + nouveau refresh token (rotation) |
| `POST` | `/v1/auth/logout` | Révoque le refresh token actif |

**Changements auth :**
- Access token TTL : 24h → **15 min** (dev) / **1h Firebase** (prod)
- Refresh token TTL : **30 jours**
- Rotation obligatoire : chaque refresh révoque l'ancien token et émet un nouveau
- `POST /v1/token` retourne maintenant `{ access_token, refresh_token, expires_in }`

#### 2. Rate Limiting

Middleware `slowapi` (ou implémentation custom Redis) :

| Route | Limite |
|-------|--------|
| `POST /v1/token` | 5 req/min par IP |
| `POST /v1/auth/refresh` | 10 req/min par IP |
| `POST /v1/payments/intent` | 3 req/min par user |
| Global API | 120 req/min par IP |

Retourne `429 Too Many Requests` avec `Retry-After` header.

#### 3. GCP Secret Manager

Tous les secrets sortent des variables d'environnement Cloud Run en clair :

| Secret | Avant | Après |
|--------|-------|-------|
| `DATABASE_URL` | Env var Cloud Run | Secret Manager |
| `AUTH_DEV_SECRET` | Env var Cloud Run | Secret Manager |
| `CINETPAY_API_KEY` | Env var Cloud Run | Secret Manager |
| `STRIPE_SECRET_KEY` | Env var Cloud Run | Secret Manager |
| Firebase credentials | Env var Cloud Run | Secret Manager |

`app/config.py` : logique de lecture Secret Manager si `ENVIRONMENT=prod`, fallback `.env` pour dev/CI.

#### 4. Cloud Armor WAF

Script `infra/gcp/cloud-armor.sh` :
- Règle préconfigurée OWASP Top-10 sur l'ingress Cloud Run
- Rate limit IP-level sur `/v1/token` (Google Cloud Armor managed rule)
- IP allowlist pour `/v1/admin/*` (CIDR réseau bureau)

#### 5. Audit de dépendances en CI

Ajouts dans `.github/workflows/ci.yml` :
```yaml
- name: pip-audit
  run: pip-audit --requirement apps/api/requirements.txt --fail-on CRITICAL

- name: npm audit (customer)
  run: cd apps/web-customer && npm audit --audit-level=high

- name: npm audit (driver)
  run: cd apps/web-driver && npm audit --audit-level=high

- name: npm audit (admin)
  run: cd apps/web-admin && npm audit --audit-level=high

- name: bandit (Python static analysis)
  run: bandit -r apps/api/app/ -ll
```

#### 6. Upload documents Cloud Storage (Gap #12 partiel)

Actuellement : driver soumet une URL saisie manuellement dans `POST /v1/drivers/me/documents`.  
Sprint 25 : ajouter un endpoint de signed URL pour upload direct :

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/v1/drivers/me/documents/upload-url` | Retourne une GCS signed URL pour upload direct (15 min expiry) |

```python
# Génère une signed URL PUT → le navigateur upload directement vers GCS
blob = bucket.blob(f"driver-docs/{driver_id}/{uuid4()}/{filename}")
signed_url = blob.generate_signed_url(expiration=timedelta(minutes=15), method="PUT")
return { "upload_url": signed_url, "final_url": blob.public_url }
```

#### Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `app/models/auth.py` | Nouveau — `RefreshToken` |
| `app/auth/base.py` | + `issue_refresh_token`, `rotate_refresh_token`, `revoke_token` |
| `app/auth/dev.py` | Access token TTL 15 min, émission refresh token |
| `app/config.py` | + `jwt_access_ttl_min`, `jwt_refresh_ttl_days`, Secret Manager reader |
| `app/middleware/rate_limit.py` | Nouveau — rate limiting par route |
| `app/main.py` | + `/v1/auth/refresh`, `/v1/auth/logout`, `/v1/drivers/me/documents/upload-url` |
| `alembic/versions/0021_refresh_tokens.py` | Nouvelle migration |
| `infra/gcp/cloud-armor.sh` | Nouveau |
| `infra/gcp/secrets.sh` | Nouveau — provisioning Secret Manager |
| `.github/workflows/ci.yml` | + pip-audit, npm audit ×3, bandit |

#### Tests (cible : +18 → 338)

| Fichier | Tests |
|---------|-------|
| `tests/test_auth_refresh.py` | 12 tests : refresh valide, token révoqué → 401, token expiré → 401, double refresh (rotation), logout révoque, access expiré + refresh → nouveau access |
| `tests/test_rate_limit.py` | 4 tests : sous la limite → 200, à la limite → 200, dépassement → 429, header Retry-After présent |
| `tests/test_documents.py` | +2 tests : signed URL générée, upload-url requiert rôle driver |

---

### Sprint 26 — 🔔 Notifications Externes

**Gaps adressés : #13**  
**Origine roadmap : Phase 7, Sprint 15**

#### Objectif
Envoyer des notifications réelles via FCM (push), SendGrid (email) et AfricasTalking (SMS) aux moments clés du cycle de vie. Les notifications in-app existantes restent en place et sont enrichies d'un statut de livraison.

#### Enrichissement de la table `notifications` (migration 0022)

Colonnes ajoutées :
```
channel         VARCHAR(16)  -- "in_app" | "push" | "email" | "sms"
provider_ref    VARCHAR(128) NULL
delivered_at    DATETIME(tz) NULL
failed_at       DATETIME(tz) NULL
retry_count     INTEGER      default 0
```

#### Nouvelle table `device_tokens` (migration 0022)

```
id          UUID        PK
user_id     UUID        FK users.id ON DELETE CASCADE
token       TEXT        UNIQUE
platform    VARCHAR(16) -- "web" | "ios" | "android"
created_at  DATETIME(tz)
```

#### Adaptateurs de notification

```python
class NotificationChannel(Protocol):
    async def send(self, recipient: str, title: str, body: str, data: dict) -> str:
        ...  # retourne provider_ref ou lève une exception

class MockChannel: ...      # tests
class FCMChannel: ...        # firebase-admin push
class SendGridChannel: ...   # sendgrid email
class AfricasTalkingChannel: ...  # SMS
```

Dispatcher centralisé : `app/notifications/dispatcher.py` choisit les canaux selon l'événement et les préférences utilisateur.

#### Matrice des événements × canaux

| Événement | Customer push | Customer email | Customer SMS | Driver push | Driver email | Driver SMS |
|-----------|:---:|:---:|:---:|:---:|:---:|:---:|
| Trajet accepté | ✅ | | ✅ | | | |
| Trajet démarré | ✅ | | | | | |
| Trajet terminé | ✅ | ✅ (reçu) | | ✅ | ✅ (gains) | |
| Paiement confirmé | ✅ | ✅ | | | | |
| Virement émis | | | | ✅ | ✅ | ✅ |
| Document approuvé | | | | ✅ | ✅ | |
| Document rejeté | | | | ✅ | ✅ | |
| Candidature décision | | | | ✅ | ✅ | ✅ |

#### Endpoints

| Méthode | Route | Rôle | Description |
|---------|-------|------|-------------|
| `POST` | `/v1/devices/register` | customer/driver | Enregistre un FCM device token |
| `DELETE` | `/v1/devices/{token}` | customer/driver | Révoque un device token (déconnexion) |
| `GET` | `/v1/notifications` | customer/driver | Liste (inchangé) |
| `GET` | `/v1/notifications/unread-count` | customer/driver | Compteur (inchangé) |
| `PATCH` | `/v1/notifications/read-all` | customer/driver | Marquer lu (inchangé) |

#### Web push (frontends web)

Dans `web-customer` et `web-driver`, ajout d'une demande de permission push au login :
```javascript
// Demande permission + enregistre Service Worker
const registration = await navigator.serviceWorker.register('/sw.js');
const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, ... });
await api.registerDevice(token, subscription.endpoint, 'web');
```

#### Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `app/models/notification.py` | + colonnes `channel`, `provider_ref`, `delivered_at`, `failed_at`, `retry_count` |
| `app/models/device_token.py` | Nouveau |
| `app/notifications/__init__.py` | Nouveau |
| `app/notifications/base.py` | Protocole `NotificationChannel` |
| `app/notifications/mock.py` | Adaptateur mock |
| `app/notifications/fcm.py` | Adaptateur FCM |
| `app/notifications/sendgrid.py` | Adaptateur SendGrid |
| `app/notifications/africas_talking.py` | Adaptateur AfricasTalking |
| `app/notifications/dispatcher.py` | Orchestrateur multi-canal |
| `app/crud.py` | Hooks dans `accept_trip`, `complete_trip`, `confirm_payment`, `review_application` |
| `app/main.py` | + `/v1/devices/register`, `/v1/devices/{token}` |
| `app/config.py` | + `fcm_credentials_json`, `sendgrid_api_key`, `africas_talking_api_key`, `africas_talking_username` |
| `alembic/versions/0022_notifications_v2_device_tokens.py` | Nouvelle migration |
| `apps/web-customer/src/App.jsx` | + demande permission push, enregistrement device token |
| `apps/web-driver/src/App.jsx` | + demande permission push, enregistrement device token |
| `apps/web-customer/public/sw.js` | Nouveau — Service Worker push |
| `apps/web-driver/public/sw.js` | Nouveau — Service Worker push |

#### Tests (cible : +18 → 356)

| Fichier | Tests |
|---------|-------|
| `tests/test_device_tokens.py` | 6 tests : register, deregister, double register idempotent, rôle, auth |
| `tests/test_notifications_dispatch.py` | 12 tests : push sur accept (mock), email sur complete (mock), SMS sur payout (mock), échec provider → retry_count++, notification non bloquante |

---

### Sprint 27 — 📱 Application Mobile Customer

**Gaps adressés : #14**  
**Origine roadmap : Phase 8, Sprint 16**

#### Objectif
Application iOS + Android pour les clients avec feature-parity complète avec `web-customer`, carte temps réel, paiement in-app et push notifications.

#### Structure

**Nouveau répertoire :** `apps/mobile-customer/`  
**Stack :** React Native 0.74 + Expo SDK 51 + TypeScript

```
apps/mobile-customer/
  app.json                  Config Expo
  eas.json                  EAS Build (iOS + Android)
  App.tsx                   Root (React Navigation Stack)
  src/
    api.ts                  Client API (même contrat que web-customer/api.js)
    screens/
      LoginScreen.tsx       Google Sign-In
      HomeScreen.tsx        Estimation + choix catégorie + booking
      TrackingScreen.tsx    Carte MapView + polling driver position
      PaymentScreen.tsx     WebView CinetPay ou Stripe Sheet
      HistoryScreen.tsx     Liste des trajets passés
      AssistanceScreen.tsx  Demande d'assistance
      PlacesScreen.tsx      Lieux enregistrés
      ProfileScreen.tsx     Profil + téléphone + nom
      NotificationsScreen.tsx
    components/
      TripCard.tsx
      EtaCard.tsx
      TrackingMap.tsx       react-native-maps MapView
      CategoryPicker.tsx
      PromoInput.tsx
      StarPicker.tsx
    hooks/
      useTrip.ts            Polling statut trip 5s
      useTracking.ts        Polling position chauffeur 5s
      useNotifications.ts   Permission + device token FCM
    navigation/
      AppNavigator.tsx
```

#### Fonctionnalités clés

| Feature | Endpoint utilisé | Détail |
|---------|-----------------|--------|
| Auth Google | Firebase SDK natif | expo-auth-session + @react-native-firebase |
| Estimation | `POST /v1/estimate` | Avec sélection catégorie |
| Code promo | `POST /v1/promos/validate` | Avant booking |
| Booking | `POST /v1/trips` | Avec category + promo_code |
| Carte tracking | `GET /v1/trips/{id}/tracking` | MapView react-native-maps, polling 5s |
| ETA | `GET /v1/trips/{id}/eta` | Polling 15s |
| Paiement | `POST /v1/payments/intent` | WebView checkout_url |
| Notation | `POST /v1/trips/{id}/rate` | Après completed |
| Assistance | `POST /v1/assistance` | Type picker |
| Lieux | `GET/POST/PATCH/DELETE /v1/places` | Picker maps |
| Push | `POST /v1/devices/register` | @react-native-firebase/messaging |
| Notifications | `GET /v1/notifications` | Badge + liste |

#### Carte temps réel

```typescript
// TrackingMap.tsx
const TrackingMap = ({ tripId, token }) => {
  const [driverPos, setDriverPos] = useState(null);
  
  useEffect(() => {
    const interval = setInterval(async () => {
      const data = await api.getTripTracking(token, tripId);
      if (data) setDriverPos({ lat: data.driver_lat, lng: data.driver_lng });
    }, 5000);
    return () => clearInterval(interval);
  }, [tripId]);

  return (
    <MapView style={styles.map}>
      {driverPos && <Marker coordinate={{ latitude: driverPos.lat, longitude: driverPos.lng }} />}
    </MapView>
  );
};
```

#### CI EAS Build

```yaml
# .github/workflows/ci.yml — job ajouté
mobile-customer-build:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
    - name: Install deps
      run: cd apps/mobile-customer && npm ci
    - name: TypeScript check
      run: cd apps/mobile-customer && npx tsc --noEmit
    - name: Expo export (check build)
      run: cd apps/mobile-customer && npx expo export --platform android 2>&1 | tail -5
```

#### Tests (cible : +16 → 372)

| Fichier | Tests |
|---------|-------|
| `apps/mobile-customer/__tests__/auth.test.tsx` | 3 tests : login, token stocké AsyncStorage, logout efface token |
| `apps/mobile-customer/__tests__/booking.test.tsx` | 7 tests : estimation, catégorie, promo, booking, cancel, statuts polling |
| `apps/mobile-customer/__tests__/tracking.test.tsx` | 4 tests : polling démarre sur accepted, s'arrête sur terminal, coordonnées affichées, ETA affiché |
| `apps/mobile-customer/__tests__/payment.test.tsx` | 2 tests : intent créé, WebView ouverte avec checkout_url |

---

### Sprint 28 — 📱 Application Mobile Driver

**Gaps adressés : #15**  
**Origine roadmap : Phase 8, Sprint 17**

#### Objectif
Application iOS + Android pour les chauffeurs avec background location tracking, dispatch notifications haute priorité et navigation deep links.

#### Structure

**Nouveau répertoire :** `apps/mobile-driver/`  
**Stack :** React Native 0.74 + Expo SDK 51 + TypeScript

```
apps/mobile-driver/
  app.json
  eas.json
  App.tsx
  src/
    api.ts
    screens/
      LoginScreen.tsx
      DispatchScreen.tsx      Trips + assistance triés par proximité
      ActiveTripScreen.tsx    Cycle accept→start→complete
      LocationScreen.tsx      Saisie / GPS position actuelle
      EarningsScreen.tsx
      HistoryScreen.tsx
      DocumentsScreen.tsx
      ProfileScreen.tsx
      NotificationsScreen.tsx
    components/
      TripDispatchCard.tsx    Avec distance + catégorie + badge
      AssistanceDispatchCard.tsx
      ActiveTripActions.tsx
      EarningsChart.tsx
    hooks/
      useBackgroundLocation.ts  expo-location Background mode
      useDispatch.ts            Polling dispatch 10s
    background/
      LocationTask.ts           TaskManager background task
```

#### Background Location — fonctionnalité critique

```typescript
// LocationTask.ts — s'exécute même app fermée (iOS + Android)
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';

const LOCATION_TASK = 'background-location-task';

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) { console.error(error); return; }
  const { locations } = data as { locations: Location.LocationObject[] };
  const { latitude, longitude } = locations[0].coords;
  const token = await AsyncStorage.getItem('ziza_token');
  if (token) await api.updateLocation(token, latitude, longitude);
});

// Démarrage dans LocationScreen
await Location.startLocationUpdatesAsync(LOCATION_TASK, {
  accuracy: Location.Accuracy.High,
  timeInterval: 5000,       // toutes les 5 secondes
  distanceInterval: 20,     // ou tous les 20 mètres
  foregroundService: {
    notificationTitle: 'Ziza — position active',
    notificationBody: 'Votre position est partagée',
  },
});
```

#### Navigation deep link

```typescript
// Deep link vers Google Maps avec la destination
const openNavigation = (lat: number, lng: number) => {
  const googleMapsUrl = `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`;
  const wazeUrl = `waze://?ll=${lat},${lng}&navigate=yes`;
  const fallback = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  Linking.canOpenURL(googleMapsUrl)
    .then(supported => Linking.openURL(supported ? googleMapsUrl : wazeUrl))
    .catch(() => Linking.openURL(fallback));
};
```

#### Dispatch notifications haute priorité (FCM)

Pour les nouveaux trips disponibles, le serveur envoie une notification FCM avec `priority: high` qui réveille l'app même en arrière-plan :

```python
# dispatcher.py — pour les events "new_trip_available"
await fcm.send({
    "token": driver_device_token,
    "notification": { "title": "Nouvelle mission", "body": f"{trip.category} — {distance_km:.1f} km" },
    "android": { "priority": "high" },
    "apns": { "headers": { "apns-priority": "10" } },
    "data": { "trip_id": str(trip.id), "type": "new_trip" }
})
```

#### CI EAS Build

Identique au Sprint 27 mais pour mobile-driver.

#### Tests (cible : +15 → 387)

| Fichier | Tests |
|---------|-------|
| `apps/mobile-driver/__tests__/auth.test.tsx` | 3 tests |
| `apps/mobile-driver/__tests__/dispatch.test.tsx` | 5 tests : liste, accept, 409 concurrent, badge catégorie, tri proximité |
| `apps/mobile-driver/__tests__/lifecycle.test.tsx` | 4 tests : accept→start→complete, bouton navigation |
| `apps/mobile-driver/__tests__/location.test.tsx` | 3 tests : PUT location, background task démarre, position PUT visible côté API |

---

### Sprint 29 — 💰 Payout Batch & Commission

**Gaps adressés : #9**  
**Origine roadmap : Phase 5, Sprint 12**

#### Objectif
Implémenter la commission plateforme configurable, calculer le solde net des chauffeurs, et permettre à l'admin de déclencher des virements réels via le prestataire de paiement.

#### Ce qui existe déjà

- `GET /v1/drivers/me/earnings` — gains **bruts** (Sprint 11) ✅
- `payout_requests` — demandes manuelles, approbation admin (Sprint 15) ✅
- `PATCH /v1/admin/payout-requests/{id}/status` — approve/reject sans virement (Sprint 15) ✅

#### Ce qui manque

- Commission configurable par catégorie de trajet
- Solde **net** = gains bruts − commission − retraits déjà effectués
- Batch payout : virements réels pour toutes les demandes `approved`
- Intégration prestataire de virement (Orange Money B2C ou Stripe Connect)

#### Nouvelle table `commission_settings` (migration 0023)

```
id              UUID        PK
category        VARCHAR(32) -- "economy" | "comfort" | "premium" | "assistance" | "default"
rate_pct        INTEGER     -- 15 = 15% (entier pour éviter les virgules flottantes)
effective_from  DATETIME(tz)
created_by      UUID        FK users.id
```

Valeurs initiales seedées :
```
default     → 15%
economy     → 15%
comfort     → 18%
premium     → 20%
assistance  → 12%
```

#### Table `payout_requests` — colonnes ajoutées (migration 0023)

```
commission_xof  INTEGER     NULL  -- montant déduit
net_amount_xof  INTEGER     NULL  -- montant réellement viré
provider_ref    VARCHAR(128) NULL  -- référence virement externe
processed_at    DATETIME(tz) NULL
```

#### Adaptateur de virement

```python
class PayoutAdapter(Protocol):
    async def send_payout(self, phone: str, amount_xof: int, ref: str) -> str:
        ...  # retourne provider_ref ou lève une exception
```

Implémentations : `MockPayoutAdapter`, `OrangeMoneyB2CAdapter`, `StripeConnectAdapter`

#### Nouveaux endpoints

| Méthode | Route | Rôle | Description |
|---------|-------|------|-------------|
| `GET` | `/v1/drivers/me/balance` | driver | Solde net disponible (gains - commission - retraits effectués) |
| `POST` | `/v1/admin/payouts/run` | admin | Déclenche le batch pour toutes les demandes `approved` |
| `GET` | `/v1/admin/commission` | admin | Liste les règles de commission actuelles |
| `POST` | `/v1/admin/commission` | admin | Crée/met à jour une règle |

**Logique `GET /v1/drivers/me/balance` :**
```
gains_bruts   = SUM(fare_xof) FROM trips WHERE driver_id = ? AND status = 'completed'
commission    = SUM(fare_xof × commission_rate_for_category(category)) 
retraits      = SUM(net_amount_xof) FROM payout_requests WHERE driver_id = ? AND status = 'processed'
solde_net     = gains_bruts - commission - retraits
```

**Logique `POST /v1/admin/payouts/run` :**
1. Charge toutes les `payout_requests` en statut `approved`
2. Pour chaque demande :
   a. Calcule `commission_xof` = montant × taux selon les trips concernés
   b. Calcule `net_amount_xof` = amount_xof − commission_xof
   c. Appelle `PayoutAdapter.send_payout(driver.phone, net_amount_xof, payout_id)`
   d. Succès → status `processed`, `processed_at` = now, `provider_ref` = ref
   e. Échec → status `failed`, log erreur (sans bloquer les autres)
3. Retourne `{ processed: N, failed: M, total_net_xof: X, total_commission_xof: Y }`

#### Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `app/models/payout.py` | + `commission_settings`, colonnes `payout_requests` |
| `app/payment/payout_adapter.py` | Nouveau — protocole + MockPayoutAdapter |
| `app/payment/orange_money_b2c.py` | Nouveau — Orange Money B2C |
| `app/crud.py` | + `get_driver_balance`, `run_payout_batch`, `get_commission_settings`, `set_commission` |
| `app/main.py` | + 4 endpoints |
| `app/config.py` | + `default_commission_pct` (15), `payout_provider` |
| `alembic/versions/0023_commission_payout_batch.py` | Nouvelle migration |
| `apps/web-driver/src/App.jsx` | `EarningsCard` → affiche solde net + commission déduite |
| `apps/web-driver/src/api.js` | + `getDriverBalance` |
| `apps/web-admin/src/App.jsx` | + bouton "Lancer batch payout", tableau commission |
| `apps/web-admin/src/api.js` | + `runPayoutBatch`, `getCommissionSettings`, `setCommission` |

#### Tests (cible : +20 → 407)

| Fichier | Tests |
|---------|-------|
| `tests/test_balance.py` | 8 tests : solde zéro, après trip completed, commission déduite economy, commission déduite premium, après retrait processed, solde ne descend pas sous 0 (info), admin ne peut pas appeler balance chauffeur |
| `tests/test_payout_batch.py` | 8 tests : batch avec 0 demandes, batch avec 1 demande, rapport processed/failed, provider error → failed, idempotence (batch relancé sur déjà-processed), rapport résumé correct |
| `tests/test_commission.py` | 4 tests : GET commission, POST commission nouvelle règle, taux par catégorie, admin only |

---

### Sprint 30 — 🧑‍💼 Workflow Candidature Chauffeur

**Gaps adressés : #12**  
**Origine roadmap : Phase 6, Sprint 14**

#### Objectif
Un utilisateur peut postuler pour devenir chauffeur depuis l'application. L'admin traite la candidature. L'approbation crée automatiquement le profil driver. Le candidat est notifié par email et SMS.

#### Ce qui existe déjà (Sprint 17)

- `driver_documents` — driver peut soumettre des URLs de documents ✅
- `PATCH /v1/admin/documents/{id}/status` — admin approuve/rejette un document ✅
- Sprint 25 — signed URL pour upload réel vers Cloud Storage ✅

#### Ce qui manque

- Formulaire de candidature structuré (avant d'être chauffeur)
- Workflow d'instruction (submitted → under_review → approved|rejected)
- Création automatique du profil `drivers` lors de l'approbation
- Notification email + SMS sur décision
- Interface admin dédiée aux candidatures
- CTA "Devenir chauffeur" dans web-customer

#### Nouvelle table `driver_applications` (migration 0024)

```
id              UUID        PK
user_id         UUID        FK users.id ON DELETE CASCADE  UNIQUE (1 candidature max)
status          VARCHAR(32) -- submitted | under_review | approved | rejected
full_name       VARCHAR(128) NOT NULL
phone           VARCHAR(32)  NOT NULL
license_number  VARCHAR(64)  NOT NULL
vehicle_make    VARCHAR(64)  NOT NULL
vehicle_model   VARCHAR(64)  NOT NULL
vehicle_plate   VARCHAR(32)  NOT NULL
vehicle_year    INTEGER      NOT NULL
vehicle_category VARCHAR(32) default "economy"
notes_admin     TEXT         NULL  -- raison du rejet ou commentaire
submitted_at    DATETIME(tz)
reviewed_at     DATETIME(tz) NULL
reviewed_by     UUID         FK users.id NULL
```

#### Endpoints

| Méthode | Route | Rôle | Description |
|---------|-------|------|-------------|
| `POST` | `/v1/drivers/apply` | customer | Soumet une candidature (409 si déjà soumise) |
| `GET` | `/v1/drivers/apply/status` | customer | Statut de sa propre candidature |
| `GET` | `/v1/admin/applications` | admin | Liste paginée (filtrable par status) |
| `GET` | `/v1/admin/applications/{id}` | admin | Détail d'une candidature |
| `PATCH` | `/v1/admin/applications/{id}/review` | admin | Décision : body `{ status, notes_admin }` |

**Logique `PATCH .../review` avec `status=approved` :**
```python
async def approve_application(db, application_id, notes_admin, admin_user_id):
    app = await _get_application(db, application_id)
    app.status = "approved"
    app.reviewed_at = now()
    app.reviewed_by = admin_user_id
    app.notes_admin = notes_admin

    # 1. Créer le driver si absent
    existing = await _get_driver_by_user_id(db, app.user_id)
    if existing is None:
        driver = Driver(user_id=app.user_id, status="active", license_number=app.license_number)
        db.add(driver)
        await db.flush()
        # 2. Créer le véhicule
        vehicle = Vehicle(driver_id=driver.id, plate=app.vehicle_plate,
                          make=app.vehicle_make, model=app.vehicle_model,
                          year=app.vehicle_year, category=app.vehicle_category)
        db.add(vehicle)

    await db.commit()
    # 3. Notifier (Sprint 26)
    await dispatcher.send(app.user_id, "application_approved", channels=["push", "email", "sms"])
```

**Logique rejet :**
```python
app.status = "rejected"
# Notifier (Sprint 26)
await dispatcher.send(app.user_id, "application_rejected", channels=["push", "email", "sms"])
```

#### Frontend web-customer

Nouveau bouton "Devenir chauffeur" dans le menu de navigation (visible si `role=customer` et aucune candidature soumise) :
- Formulaire multi-étapes : infos personnelles → véhicule → confirmation
- Upload de la photo du permis et carte grise via signed URL (Sprint 25)
- Affichage du statut de candidature en cours (`submitted | under_review | approved | rejected`)
- Si `approved` → message "Reconnectez-vous avec le rôle chauffeur"

#### Frontend web-admin

Nouveau onglet "📝 Candidatures" :
- Liste paginée avec statut coloré, nom, téléphone, véhicule
- Filtre par statut (Toutes / En attente / En révision / Approuvées / Rejetées)
- Détail avec tous les champs du formulaire
- Boutons "Approuver" / "Rejeter" avec champ note obligatoire pour le rejet

#### Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `app/models/application.py` | Nouveau — `DriverApplication` |
| `app/crud.py` | + `create_application`, `get_application`, `list_applications`, `review_application` |
| `app/main.py` | + 5 endpoints |
| `alembic/versions/0024_driver_applications.py` | Nouvelle migration |
| `apps/web-customer/src/api.js` | + `submitApplication`, `getApplicationStatus` |
| `apps/web-customer/src/App.jsx` | + `ApplicationSection`, bouton "Devenir chauffeur" |
| `apps/web-customer/src/styles.css` | + `.application-form`, `.application-status`, `.application-step` |
| `apps/web-admin/src/api.js` | + `adminListApplications`, `adminGetApplication`, `adminReviewApplication` |
| `apps/web-admin/src/App.jsx` | + onglet Candidatures, `ApplicationsPanel`, `ApplicationDetail` |
| `apps/web-admin/src/styles.css` | + `.applications-panel`, `.application-row`, `.review-form` |

#### Tests (cible : +22 → 429)

| Fichier | Tests |
|---------|-------|
| `tests/test_applications.py` | 14 tests : submit, double submit → 409, GET statut, listing admin, filtre status, détail, approve, reject, rôle customer requis, rôle admin requis |
| `tests/test_application_workflow.py` | 8 tests : approve → driver créé avec status active, approve → véhicule créé, approve → user n'a pas déjà un driver (idempotence), reject → pas de driver, rejet avec note, statut candidature après approve = approved, statut après reject = rejected, notification déclenchée (mock) |

---

### Sprint 31 — 📈 Performance, SRE complet & GA

**Gaps adressés : #3, #10, #11, #17, #18, #19, #20**  
**Origine roadmap : Phase 9 (Sprint 19–20) + Phase 10 (Sprint 21–22)**

#### Objectif
Performance production (Redis, Locust, CDN, pooling), SRE complet (Cloud Trace, alertes, SLOs, min-instances), feature flags, beta fermée, GA (landing page, stores, SLA, support).

---

#### A. Performance (Gap #18)

**Redis cache — `GET /v1/estimate`**

Cache key : `sha256(origin_lat|origin_lng|dest_lat|dest_lng|category|surge_multiplier)`  
TTL : `fare_estimate_ttl_minutes` (15 min par défaut)  
Invalidation : toute modification du surge multiplier vide le cache

```python
# app/cache.py
import redis.asyncio as redis

async def cache_get(key: str) -> dict | None: ...
async def cache_set(key: str, value: dict, ttl_seconds: int) -> None: ...
async def cache_delete_pattern(pattern: str) -> None: ...
```

Tests : `fakeredis` en CI (`pip install fakeredis[aioredis]`)

**Connection pooling**

```python
# app/db.py — pool configuré pour Cloud SQL
engine = create_async_engine(
    settings.database_url,
    pool_size=10,          # connexions persistantes
    max_overflow=20,       # connexions supplémentaires si besoin
    pool_recycle=3600,     # recyclage après 1h (Cloud SQL idle timeout)
    pool_pre_ping=True,    # vérifie la connexion avant usage
)
```

**Cloud CDN**

Script `infra/gcp/cdn.sh` :
- Cloud CDN sur le Load Balancer devant les Cloud Run frontends
- `Cache-Control: max-age=31536000, immutable` sur les assets Vite hashés
- `Cache-Control: no-cache` sur `/index.html`

---

#### B. Locust Load Testing (Gap #18)

**Fichier `infra/locust/locustfile.py` :**

```python
class BookingUser(HttpUser):
    """Simule le flux complet customer : login → estimation → booking → suivi."""
    wait_time = between(1, 3)

    @task(3)
    def full_booking_flow(self):
        # POST /v1/token
        # POST /v1/estimate
        # POST /v1/trips
        # GET /v1/trips/{id} × 6 (polling 5s)
        ...

    @task(1)
    def estimate_only(self):
        # POST /v1/estimate (bénéficie du cache Redis)
        ...

class DriverLocationUser(HttpUser):
    """Simule 200 chauffeurs en ligne pushant leur position."""
    wait_time = between(4, 6)

    @task
    def push_location(self):
        # PUT /v1/drivers/me/location
        ...
```

Scénarios cibles :
- `--users 500 --spawn-rate 50` → p99 < 500ms sur booking flow
- `--users 200 --spawn-rate 20` (drivers seuls) → p99 < 200ms sur PUT location

Rapports générés dans `infra/locust/reports/YYYY-MM-DD/`.

---

#### C. SRE complet (Gap #17)

**Cloud Error Reporting → Slack**

```python
# app/middleware/error_reporting.py
class ErrorReportingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        try:
            return await call_next(request)
        except Exception as exc:
            # Envoie à Cloud Error Reporting
            error_client.report_exception()
            # Webhook Slack si sévérité >= ERROR
            if is_critical(exc):
                await slack_webhook.send(format_alert(exc, request))
            raise
```

**Cloud Trace**

```python
# Ajout opentelemetry-sdk + opentelemetry-exporter-gcp-trace
from opentelemetry import trace
from opentelemetry.exporter.cloud_trace import CloudTraceSpanExporter
# Configuré au démarrage de l'app
```

**Uptime Checks**

Script `infra/gcp/uptime.sh` — configure 4 uptime checks Cloud Monitoring :
- `https://ziza-api-xxx.run.app/health` — check toutes les 60s
- `https://customer.ziza.ci` — check toutes les 60s
- `https://driver.ziza.ci` — check toutes les 60s
- `https://admin.ziza.ci` — check toutes les 60s

Alerting policy : email + Slack si 2 checks consécutifs échouent.

**SLOs**

Fichier `docs/ops/slo.md` :
```
SLO 1 — Disponibilité API : 99.5% / 30 jours (= max 3h36 de downtime)
SLO 2 — Latence API p99 : < 500ms sur /v1/trips, /v1/estimate
SLO 3 — Latence location PUT p99 : < 200ms
SLO 4 — Disponibilité frontends : 99.9% / 30 jours

Error Budget = 1 - SLO
Mesure : Cloud Monitoring SLO policies
Révision : mensuelle en sprint review
```

**`min-instances=1` sur ziza-api**

```bash
gcloud run services update ziza-api \
  --min-instances=1 \
  --region=us-central1 \
  --project=ziza-platform
```

Ajouté dans `infra/gcp/deploy-prod.sh`.

---

#### D. Dispatch par rayon (Gap #3)

Correction du dispatch avec un filtre rayon en plus du tri par proximité (Sprint 23) :

```python
# crud.py — list_available_trips avec filtre radius
MAX_RADIUS_KM = 15.0  # configurable via settings

async def list_available_trips(db, auth_user_id=None, radius_km=MAX_RADIUS_KM):
    trips = await _fetch_all_pending(db)
    if auth_user_id and driver has position:
        # Filtre : exclure les trips trop loin
        trips = [t for t in trips
                 if _haversine_km(d_lat, d_lng, t.origin_lat, t.origin_lng) <= radius_km]
        # Tri par proximité croissante
        trips.sort(key=lambda t: _haversine_km(...))
    return trips
```

---

#### E. Gestion des rôles admin (Gap #11)

```python
# Nouveau endpoint
PATCH /v1/admin/users/{user_id}/role  # admin modifie le rôle d'un utilisateur
# Valeurs acceptées : "customer" | "driver" | "admin"
# Protégé : uniquement admin, pas de self-promotion
```

---

#### F. Carte live admin (Gap #10)

Section `LiveMapPanel` dans web-admin :
- Polling `GET /v1/admin/stats` + liste des drivers online toutes les 10s
- Carte Leaflet (leaflet.js — pas de clé API requise) affichant :
  - Marqueurs chauffeurs en ligne (avec `current_lat/lng` depuis la table `drivers`)
  - Trips actifs (`accepted`, `in_progress`) avec ligne origine → destination
- Nouveau endpoint `GET /v1/admin/drivers/live` (admin) : retourne chauffeurs online avec position

---

#### G. Feature Flags (Gap #19)

**Nouvelle table `feature_flags`** (migration 0025) :
```
name        VARCHAR(64)  PK
enabled     BOOLEAN      default false
rollout_pct INTEGER      default 0  -- 0-100 % des users
description TEXT         NULL
updated_at  DATETIME(tz)
```

Flags initiaux :
```
payment_enabled          false → true après Sprint 24 validé
mobile_app_enabled       false → true après Sprints 27-28 soumis stores
driver_apply_enabled     false → true après Sprint 30 validé
batch_payout_enabled     false → true après Sprint 29 validé
```

Endpoints :
```
GET  /v1/admin/flags          admin — liste tous les flags
PATCH /v1/admin/flags/{name}  admin — active/désactive + rollout_pct
GET  /v1/flags/{name}         tous — lit un flag (pour le frontend)
```

---

#### H. Beta fermée & GA (Gaps #19, #20)

**Beta fermée :**
- Codes d'invitation (table `invite_codes` — UUID + used_at + max_uses)
- Formulaire de feedback in-app dans web-customer et web-driver (Google Forms embed ou table `feedback`)
- Hotfix process documenté dans `docs/ops/runbooks/hotfix.md`
- Incident log template dans `docs/ops/incidents/`

**Landing page `apps/web-landing/` :**
```
apps/web-landing/
  Dockerfile           Nginx + Vite
  src/
    index.html        Page marketing statique
    styles.css
    main.js           Animations légères
```
Sections : Hero ("Votre trajet en quelques secondes"), Fonctionnalités, Téléchargez l'app, Devenez chauffeur, Contact.

**SLA publié :** `docs/sla.md`

**Support channel :** Crisp intégré dans web-customer (widget JS, clé API en env var).

**Soumission stores :** EAS Submit via CI :
```yaml
# .github/workflows/deploy-mobile.yml
- name: Submit iOS
  run: cd apps/mobile-customer && npx eas submit --platform ios --latest
- name: Submit Android  
  run: cd apps/mobile-customer && npx eas submit --platform android --latest
```

---

#### Fichiers modifiés (Sprint 31)

| Fichier | Changement |
|---------|-----------|
| `app/cache.py` | Nouveau — client redis.asyncio + helpers |
| `app/models/flag.py` | Nouveau — `FeatureFlag`, `InviteCode` |
| `app/middleware/error_reporting.py` | Nouveau — Cloud Error Reporting + Slack |
| `app/crud.py` | `create_estimate` → cache Redis ; `list_available_trips` → radius filter ; + `get_flags`, `set_flag`, `list_live_drivers` |
| `app/main.py` | + `/v1/admin/flags`, `/v1/flags/{name}`, `/v1/admin/drivers/live`, `PATCH /v1/admin/users/{id}/role` |
| `app/db.py` | Pool config (pool_size, max_overflow, pool_pre_ping) |
| `app/config.py` | + `redis_url`, `cache_enabled`, `slack_webhook_url`, `dispatch_radius_km` |
| `alembic/versions/0025_feature_flags.py` | Nouvelle migration |
| `infra/locust/locustfile.py` | Nouveau |
| `infra/gcp/cdn.sh` | Nouveau |
| `infra/gcp/uptime.sh` | Nouveau |
| `infra/gcp/deploy-prod.sh` | + `min-instances=1` |
| `docs/ops/slo.md` | Nouveau |
| `docs/sla.md` | Nouveau |
| `docs/ops/runbooks/hotfix.md` | Nouveau |
| `apps/web-landing/` | Nouveau |
| `apps/web-admin/src/App.jsx` | + LiveMapPanel, rôle management |
| `.github/workflows/ci.yml` | + fakeredis dans deps |
| `.github/workflows/deploy-mobile.yml` | Nouveau — EAS Submit |

#### Tests (cible : +44 → 473)

| Fichier | Tests |
|---------|-------|
| `tests/test_cache.py` | 8 tests : cache miss → calcul + store, cache hit → pas de recalcul, TTL, invalidation sur surge change, cache désactivé → calcul direct |
| `tests/test_feature_flags.py` | 6 tests : GET liste, GET flag unique, PATCH enable, PATCH disable, admin only, rollout_pct |
| `tests/test_admin_live_drivers.py` | 4 tests : liste vide, driver online visible, driver offline exclu, rôle admin requis |
| `tests/test_admin_role_management.py` | 5 tests : change role, self-promotion → 403, rôle invalide → 422, admin only, utilisateur inexistant → 404 |
| `tests/test_dispatch_radius.py` | 5 tests : driver sans position → tous les trips, driver avec position → trips dans rayon, trips hors rayon exclus, radius configurable |
| `tests/test_performance.py` | 4 tests : estimate < 50ms avec cache, 10 estimates parallèles, location PUT < 100ms, dispatch < 200ms |
| `tests/test_invite_codes.py` | 4 tests : code valide accepté, code épuisé → 422, code inexistant → 422, code déjà utilisé → 422 |
| `apps/mobile-customer/__tests__/e2e_full_flow.test.tsx` | 4 tests Detox : login → estimate → book → track |
| `apps/mobile-driver/__tests__/e2e_dispatch.test.tsx` | 4 tests Detox : login → online → accept → complete |

---

## Partie 4 — Tableau de bord global

### Tests par sprint

| Sprint | Gaps adressés | Tests cumulés | +nouveaux |
|--------|--------------|--------------|-----------|
| 23 (livré ✅) | #2, #3, #4, #6, #7 | 300 | +16 |
| 24 | #8 | 320 | +20 |
| 25 | #1, #16 + upload GCS | 338 | +18 |
| 26 | #13 | 356 | +18 |
| 27 | #14 | 372 | +16 |
| 28 | #15 | 387 | +15 |
| 29 | #9 | 407 | +20 |
| 30 | #12 | 429 | +22 |
| 31 | #3, #10, #11, #17, #18, #19, #20 | **473** | +44 |

### Migrations Alembic

| Migration | Sprint | Description |
|-----------|--------|-------------|
| 0017 | 23 ✅ | `drivers.current_lat/lng/last_seen_at` |
| 0018 | 23 ✅ | `trip_events.actor` |
| 0019 | 24 | `payment_intents` |
| 0020 | 24 | `trips.paid_at` |
| 0021 | 25 | `refresh_tokens` |
| 0022 | 26 | `device_tokens` + `notifications` v2 |
| 0023 | 29 | `commission_settings` + `payout_requests` update |
| 0024 | 30 | `driver_applications` |
| 0025 | 31 | `feature_flags` + `invite_codes` |

### Services GCP à provisionner

| Service GCP | Sprint | Script |
|-------------|--------|--------|
| Secret Manager | 25 | `infra/gcp/secrets.sh` |
| Cloud Armor WAF | 25 | `infra/gcp/cloud-armor.sh` |
| Cloud Storage bucket `driver-docs` | 25 | `infra/gcp/storage.sh` |
| Redis Memorystore | 31 | `infra/gcp/redis.sh` |
| Cloud CDN | 31 | `infra/gcp/cdn.sh` |
| Cloud Trace | 31 | activé via opentelemetry |
| Uptime checks | 31 | `infra/gcp/uptime.sh` |
| SLO policies | 31 | `infra/gcp/slo.sh` |

### Dépendances entre sprints

```
Sprint 24 (paiement)
  └──► Sprint 29 (payout batch — utilise le même PaymentAdapter)
  └──► Sprint 26 (notif "paiement confirmé" envoie email)

Sprint 25 (sécurité)
  └──► Sprint 26 (device tokens dans Secret Manager)
  └──► Sprint 27/28 (mobile — token refresh requis)
  └──► Sprint 30 (upload GCS — signed URLs)

Sprint 26 (notifs)
  └──► Sprint 27/28 (mobile — FCM requis pour push)
  └──► Sprint 30 (notification décision candidature)

Sprint 27/28 (mobile)
  └──► Sprint 31 (EAS Submit → stores)

Sprint 30 (candidatures)
  └──► indépendant (peut être avancé à Sprint 25 si besoin)

Sprint 31 (perf + GA)
  └──► dernier (feature freeze requis)
```

---

## Partie 5 — Règles de processus (prévention future)

Issues de la revue exhaustive, ces règles s'appliquent à partir du Sprint 24 :

1. **Sprint doc avant le code** — aucune branche de feature sans `sprint-N.md` rédigé et validé.

2. **Checklist 30 secondes au démarrage** :
   ```
   □ Ce sprint est-il dans la roadmap ou roadmap-rework.md ?
   □ La dépendance du sprint précédent est-elle livrée ?
   □ Le sprint doc liste-t-il : migrations, endpoints, fichiers, tests, critères de validation ?
   □ Les tests couvrent-ils les cas d'erreur (401, 403, 404, 409, 422) pas seulement le happy path ?
   ```

3. **Revue mensuelle de la roadmap** — comparer `roadmap-rework.md` vs sprints livrés, mettre à jour les statuts.

4. **Tout pivot documenté** — fichier `docs/agile/decision-YYYY-MM-DD-sujet.md` :
   ```
   # Décision : [titre]
   **Date :** ...
   **Contexte :** pourquoi le sprint prévu n'a pas été livré
   **Décision :** ce qui a été livré à la place
   **Impact roadmap :** sprint(s) décalé(s)
   **Prochaine action :** ...
   ```

5. **Mise à jour du statut dès la livraison** — ce document est vivant :
   ```
   🔲 Planifié → 🔄 En cours → ✅ Livré | ❌ Annulé
   ```
