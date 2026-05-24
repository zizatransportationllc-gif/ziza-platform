# Sprint 3 — Auth PROD (Firebase)

**Duration:** ~1 week
**Goal:** Production auth path via Firebase; Google Sign-In on all frontends.

---

## Deliverables

| # | Livrable | Status |
|---|---|---|
| 1 | `FirebaseAdapter` complete (firebase-admin SDK) | ✅ |
| 2 | `POST /v1/auth/register` — upsert stub (DB in Sprint 4) | ✅ |
| 3 | Firebase JS SDK added to all 3 frontends | ✅ |
| 4 | `auth.js` module per frontend (lazy, isolated) | ✅ |
| 5 | Google Sign-In button (shown only when `VITE_FIREBASE_*` configured) | ✅ |
| 6 | Dockerfiles updated with Firebase build args | ✅ |
| 7 | Tests for `/v1/auth/register` | ✅ |

---

## Firebase activation (manual step)

When ready to enable Google Sign-In in production:

1. Go to [Firebase Console](https://console.firebase.google.com) → Add project → **import existing GCP project** `ziza-platform`
2. Enable **Authentication → Google** provider
3. Add Cloud Run URLs as **Authorized Domains**
4. Copy the Firebase web config and add GitHub vars:

```
VITE_FIREBASE_API_KEY     = AIza...
VITE_FIREBASE_AUTH_DOMAIN = ziza-platform.firebaseapp.com
VITE_FIREBASE_PROJECT_ID  = ziza-platform
```

5. Redeploy (frontends rebuild with Firebase config baked in)
6. Set `ENVIRONMENT=prod` on Cloud Run API → switches to `FirebaseAdapter`

---

## Auth flow summary

| Environment | Login method | Token type | Adapter |
|---|---|---|---|
| `dev` | email+password → `POST /v1/token` | HMAC JWT (24h) | `DevAdapter` |
| `prod` | Google Sign-In (Firebase popup) | Firebase ID token (1h) | `FirebaseAdapter` |

Both token types flow identically: `Authorization: Bearer <token>` on every API call.
