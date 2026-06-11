# Migration bcrypt → Firebase Auth (Phase 0)

One-shot migration to move ZIZA's locally-created accounts (`provider='local'`,
bcrypt `password_hash`) into Firebase Auth, preserving their passwords.

## Steps

1. **Export** (read-only; `DATABASE_URL` must point at the source DB):

   ```bash
   python -m scripts.migrate_bcrypt_to_firebase > users_export.json
   ```

   Each record uses the existing ZIZA `user_id` as Firebase `localId`, so the
   Firebase uid equals `User.user_id` in the DB. The auth endpoint
   (`POST /v1/auth/firebase`) then resolves migrated users by uid.

2. **Import** into the target Firebase project:

   ```bash
   firebase auth:import users_export.json --hash-algo=BCRYPT --project <PROJECT_ID>
   ```

## ⚠️ Hash encoding caveat — verify before prod

`firebase auth:import` expects `passwordHash` as **base64-encoded bytes**. The
script base64-encodes the stored bcrypt string by default. The exact expectation
can vary by Firebase CLI version — **validate on a throwaway Firebase project
first** (import one account, confirm the original password authenticates). Use
`--raw` to emit the unencoded bcrypt string if your CLI version expects that.

## Scope / safety

- The export is **read-only** — it never mutates the source DB.
- Only accounts with `provider='local'` AND a non-null `password_hash` are
  exported (seeded dev accounts and Firebase accounts are skipped).
- Run during a maintenance window at go-live, after the prod Firebase project
  and the new auth endpoint are deployed.

## Related security follow-up

The auth endpoint's email-based lookup fallback should require a verified email
(`email_verified`) before this migration is relied upon, to prevent account
takeover via an unverified Firebase email/password account matching an existing
DB email. See the design doc's follow-ups section.
