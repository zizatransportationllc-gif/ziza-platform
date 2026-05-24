# Ziza Platform — Product Roadmap

**Product:** Ride-share & road-side assistance platform
**Actors:** Customer · Driver · Admin
**Stack:** FastAPI · React/Vite · Cloud Run · PostgreSQL · Firebase · React Native

> Each sprint = ~1 week. Definition of Done (global): code merged to `main`, CI green,
> deployed to Cloud Run dev, smoke test passes, README/docs updated.

---

## Phase 0 — Foundation ✅

### Sprint 1 — Delivery chain ✅ DONE
**Goal:** GitHub → Docker → GCP pipeline end-to-end.
- 4 services deployed on Cloud Run (api, web-customer, web-driver, web-admin)
- CI (pytest + Docker builds + isolation guard) green
- Workload Identity Federation (keyless GCP auth)

---

## Phase 1 — Auth & Identity

### Sprint 2 — Auth DEV + role abstraction
**Goal:** backend authenticates requests; frontends have a login flow.
- `AuthAdapter` interface: `verify(token) → Claims(user_id, email, role, provider)`
- `DevAdapter`: PyJWT, secret from env, 3 seeded users
- `POST /v1/token` (dev only) — email + password → JWT
- `GET /v1/me` — protected endpoint, returns normalized claims
- 3 frontends: login form, JWT in localStorage, role-based UI guard
- Tests: token issue, /v1/me valid, 401 no token, 403 wrong role

### Sprint 3 — Auth PROD (Firebase)
**Goal:** replace DevAdapter with Firebase in production; user registration flow.
- `FirebaseAdapter`: verifies Google Identity Platform ID tokens
- `POST /v1/auth/register` — creates user record in DB (Sprint 4 prereq, stub first)
- Frontend: Google Sign-In button, token refresh
- CI: tests run with DevAdapter; prod uses `ENVIRONMENT=prod` env var
- Update `gcp-dev.md` with Firebase config vars

---

## Phase 2 — Data Layer

### Sprint 4 — PostgreSQL + core schema
**Goal:** persistent data; all state from Sprint 1–3 survives restarts.
- Cloud SQL (PostgreSQL 16) provisioned in `us-central1` via `infra/gcp/cloudsql.sh`
- Alembic migrations: `users`, `drivers`, `vehicles`, `trips`, `trip_events`
- SQLAlchemy async session wired into FastAPI
- User record created/updated on first Firebase login (`/v1/auth/register`)
- Driver record: status (`pending | active | suspended`), vehicle info
- Smoke tests updated: DB connectivity check
- Local: PostgreSQL container added to `docker-compose.yml`

---

## Phase 3 — Core Ride-share Loop

### Sprint 5 — Pricing & estimate
**Goal:** customer can get a fare estimate before booking.
- `POST /v1/estimate` — origin + destination → `{distance_km, duration_min, fare_xof}`
- Fare matrix in config (base fare, per-km rate, surge multiplier placeholder)
- Google Maps Distance Matrix API or straight-line fallback for dev
- web-customer: estimate form (map pins → fare card)
- Tests: fare calc unit tests, API contract test

### Sprint 6 — Trip booking state machine
**Goal:** customer books a trip; it progresses through a lifecycle.
- Trip states: `PENDING → ACCEPTED → IN_PROGRESS → COMPLETED | CANCELLED`
- `POST /v1/trips` — create trip (customer, origin, destination, estimate_id)
- `GET /v1/trips/{id}` — trip detail + current state
- `PATCH /v1/trips/{id}/cancel` — customer cancels before ACCEPTED
- `trip_events` table logs every state transition with timestamp + actor
- web-customer: booking flow (confirm estimate → trip created → waiting screen)
- Tests: state machine transitions, invalid transitions return 409

### Sprint 7 — Driver dispatch & acceptance
**Goal:** a driver can see pending trips, accept one, and complete it.
- `GET /v1/dispatch/available` — driver sees trips near their location (simple radius filter)
- `POST /v1/dispatch/{trip_id}/accept` — trip moves to ACCEPTED, assigned to driver
- `POST /v1/trips/{id}/start` — driver starts the trip (IN_PROGRESS)
- `POST /v1/trips/{id}/complete` — driver marks trip done (COMPLETED)
- web-driver: dispatch list, accept button, start/complete buttons
- web-customer: polling-based status updates (Sprint 8 replaces with push)
- Tests: dispatch assignment, concurrency (two drivers try to accept same trip → one 409)

### Sprint 8 — Real-time location & tracking
**Goal:** customer sees driver moving on a map in real time.
- Driver app: `POST /v1/drivers/location` (every 5s, lat/lng)
- `GET /v1/trips/{id}/tracking` — returns current driver lat/lng
- Customer app: map view, polling /tracking every 5s (WebSocket in Sprint 15)
- `drivers` table: `current_lat`, `current_lng`, `last_seen_at`
- `/v1/dispatch/available` uses real driver locations for proximity sort
- Tests: location update, tracking endpoint, stale location handling

---

## Phase 4 — Road-side Assistance

### Sprint 9 — Roadside request flow
**Goal:** customer can request roadside help (breakdown, flat tyre, tow).
- New entity: `assistance_requests` (type, location, status, assigned_driver)
- Types: `BREAKDOWN | FLAT_TYRE | TOW | FUEL | LOCKOUT`
- `POST /v1/assistance` — customer creates request
- `GET /v1/assistance/{id}` — status tracking
- Same state machine as trips: `PENDING → ACCEPTED → IN_PROGRESS → RESOLVED`
- web-customer: "Need help?" button → type picker → request created
- web-driver: unified dispatch list (trips + assistance, tagged)
- Tests: full lifecycle, type validation

### Sprint 10 — Roadside provider specialisation
**Goal:** drivers declare which assistance types they handle; dispatch filters accordingly.
- `driver_capabilities` table: which types each driver handles
- Dispatch filters by capability + proximity
- Estimated arrival time on assistance request
- Admin: approve/revoke capabilities per driver
- web-admin: driver capability management UI

---

## Phase 5 — Payments

### Sprint 11 — Customer payment
**Goal:** customer pays for completed trips and assistance.
- Stripe integration (or Orange Money / Wave for West Africa — TBD)
- `payment_intents` table linked to trips/assistance
- `POST /v1/payments/intent` — creates payment intent after trip COMPLETED
- Webhook handler: Stripe confirms → mark paid
- web-customer: payment screen (card or mobile money)
- Smoke test: payment intent creation (Stripe test mode)

### Sprint 12 — Driver payouts
**Goal:** drivers receive their earnings.
- `payouts` table: amount, status (`pending | processed | failed`), driver_id
- Earnings = completed trip fares − platform commission (configurable %)
- `GET /v1/drivers/earnings` — driver sees balance + history
- Admin: `POST /v1/admin/payouts/run` — batch payout (weekly)
- web-driver: earnings dashboard
- web-admin: payout management (approve, retry failed)
- Tests: earnings calc, payout batch, commission config

---

## Phase 6 — Admin & Operations

### Sprint 13 — Admin dashboard
**Goal:** admin has full operational visibility.
- `GET /v1/admin/trips` — paginated, filterable by status/date/driver/customer
- `GET /v1/admin/users` — user list + role management
- `GET /v1/admin/kpis` — daily rides, revenue, active drivers, completion rate
- web-admin: full dashboard (table views, KPI cards, live map of active trips)
- Role guard: all `/v1/admin/*` routes require `role=admin`

### Sprint 14 — Driver onboarding
**Goal:** new drivers go through a structured approval process.
- Driver application form: name, phone, vehicle (make, model, plate, year), licence
- `driver_applications` table: status `SUBMITTED → UNDER_REVIEW → APPROVED | REJECTED`
- Document upload (licence photo, vehicle photo) to Cloud Storage
- Admin reviews and approves/rejects via web-admin
- Approved driver → `drivers` record created, `ACTIVE` status
- Email notification on decision (Sprint 15 prereq, stub first)
- web-customer: "Become a driver" CTA → application form

---

## Phase 7 — Notifications

### Sprint 15 — Push + email + SMS
**Goal:** users receive timely notifications at key state transitions.
- Firebase Cloud Messaging (FCM) for push (mobile, Sprint 16+) and web push
- SendGrid or Mailgun for transactional email
- Twilio or AfricasTalking for SMS (West Africa coverage)
- `notification_log` table (channel, recipient, event, status)
- Events: trip accepted, driver arriving, trip completed, payment confirmed, payout processed, application decision
- web-customer / web-driver: browser notification permission prompt
- Tests: notification dispatch mocked, delivery log

---

## Phase 8 — Mobile Apps

### Sprint 16 — Mobile customer app (React Native)
**Goal:** customer app on iOS + Android, feature-parity with web-customer.
- `apps/mobile-customer/` — React Native + Expo
- Google Sign-In, trip booking, real-time map, payment
- Deep link support for trip status
- Push notifications via FCM
- CI: EAS Build for iOS + Android (Expo)

### Sprint 17 — Mobile driver app (React Native)
**Goal:** driver app on iOS + Android, feature-parity with web-driver.
- `apps/mobile-driver/` — React Native + Expo
- Background location tracking (react-native-background-geolocation)
- Dispatch notifications (high-priority FCM)
- Navigation integration (Google Maps / Waze deep link)
- Earnings dashboard
- CI: EAS Build

---

## Phase 9 — Production Hardening

### Sprint 18 — Security & secrets hardening
**Goal:** production-ready security posture.
- Secret Manager for all secrets (DB passwords, Stripe keys, Firebase creds)
- Cloud Armor WAF on API ingress (rate limiting, IP allowlist for admin)
- OWASP Top-10 review of all API endpoints
- JWT expiry + refresh token flow
- Dependency audit (`pip-audit`, `npm audit`)
- Penetration test (manual or automated with OWASP ZAP)

### Sprint 19 — Observability & SRE
**Goal:** on-call team can detect, diagnose, and resolve incidents in <15 min.
- Cloud Logging structured logs on all services (request_id, user_id, trip_id)
- Cloud Error Reporting wired to Slack/PagerDuty
- Cloud Trace for API latency profiling
- Uptime checks on all 4 Cloud Run services
- SLOs: API p99 < 500 ms, availability > 99.5%
- Runbooks in `docs/ops/`
- `min-instances=1` on ziza-api in prod (eliminate cold starts)

### Sprint 20 — Performance & cost optimisation
**Goal:** system handles 1 000 concurrent users without degradation.
- Load test with Locust (booking flow, location updates)
- Connection pooling (PgBouncer or Cloud SQL Connector)
- Redis cache for `/v1/estimate` (same route → same fare for 10 min)
- CDN (Cloud CDN) in front of Cloud Run for frontend static assets
- Cloud Storage + Load Balancer for frontends (optional, replaces Cloud Run for static)
- Cost review: right-size Cloud Run instances, Artifact Registry cleanup policy

---

## Phase 10 — Launch

### Sprint 21 — Closed beta (pilot city)
**Goal:** 50 real users, 10 real drivers, 1 city, 2 weeks.
- Feature flags for gradual rollout
- Feedback form in all apps
- Daily standup + incident log
- Hotfix process documented

### Sprint 22 — General Availability
**Goal:** public launch.
- Marketing landing page (static, `apps/web-landing/`)
- App Store + Play Store submissions
- Press kit + social accounts
- SLA published
- Support channel (Intercom or Crisp)
- Post-launch monitoring sprint (week 1 on-call rotation)

---

## Summary

| Phase | Sprints | Theme |
|---|---|---|
| 0 | S1 ✅ | Foundation — delivery chain |
| 1 | S2–S3 | Auth (DEV mock → Firebase PROD) |
| 2 | S4 | Database (PostgreSQL + schema) |
| 3 | S5–S8 | Core ride-share loop (estimate → book → dispatch → track) |
| 4 | S9–S10 | Road-side assistance |
| 5 | S11–S12 | Payments & payouts |
| 6 | S13–S14 | Admin dashboard & driver onboarding |
| 7 | S15 | Notifications (push + email + SMS) |
| 8 | S16–S17 | Mobile apps (customer + driver) |
| 9 | S18–S20 | Production hardening (security + SRE + perf) |
| 10 | S21–S22 | Launch (beta → GA) |

**Total: 22 sprints (~5–6 months at 1 sprint/week)**

At the end of Sprint 8, the web product is a functional ride-share MVP.
At the end of Sprint 12, it's revenue-generating.
At the end of Sprint 22, it's a launched product.
