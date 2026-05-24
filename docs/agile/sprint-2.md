# Sprint 2 — Auth DEV + Role Abstraction

**Duration:** ~1 week
**Goal:** Backend authenticates every request; frontends have a login flow with role guards.

---

## Deliverables

| # | Livrable | Status |
|---|---|---|
| 1 | `AuthAdapter` interface + `Claims` dataclass | ✅ |
| 2 | `DevAdapter` — PyJWT, HMAC-signed tokens | ✅ |
| 3 | `FirebaseAdapter` — stub ready for Sprint 3 | ✅ |
| 4 | `POST /v1/token` — DEV-only, email+password → JWT | ✅ |
| 5 | `GET /v1/me` — protected, returns normalised claims | ✅ |
| 6 | `require_role()` FastAPI dependency factory | ✅ |
| 7 | 3 seeded users: customer / driver / admin | ✅ |
| 8 | Login form + role guard on all 3 frontends | ✅ |
| 9 | 11 backend tests (token, /v1/me, 401, 403) | ✅ |
| 10 | `AUTH_DEV_SECRET` in GitHub Secrets + deploy workflow | ✅ |

---

## Seeded dev users

| Email | Password | Role |
|---|---|---|
| customer@ziza.dev | ziza2024 | customer |
| driver@ziza.dev | ziza2024 | driver |
| admin@ziza.dev | ziza2024 | admin |

---

## Architecture

```
POST /v1/token  →  DevAdapter.issue()  →  JWT (HS256, 24h TTL)
GET  /v1/me     →  Depends(get_current_user)
                     → get_auth_adapter()  [dev → DevAdapter, prod → FirebaseAdapter]
                     → adapter.verify(token)  →  Claims
```

---

## What changes in Sprint 3

- `FirebaseAdapter` fully implemented (firebase-admin SDK)
- `POST /v1/auth/register` upserts user in DB (Sprint 4 prereq)
- Google Sign-In button on frontends
- `ENVIRONMENT=prod` switches the adapter automatically
