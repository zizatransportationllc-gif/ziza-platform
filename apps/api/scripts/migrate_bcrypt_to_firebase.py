"""Export local bcrypt accounts to a Firebase ``auth:import`` JSON file.

Phase 0 migration: ZIZA's locally-created accounts (``provider='local'``,
bcrypt ``password_hash``) are exported so they can be imported into Firebase
Auth with their existing passwords preserved.

Usage:
    # 1. Export (requires DATABASE_URL pointing at the source DB)
    python -m scripts.migrate_bcrypt_to_firebase > users_export.json

    # 2. Import into Firebase (recomputes nothing — same passwords keep working)
    firebase auth:import users_export.json \
        --hash-algo=BCRYPT --project <PROJECT_ID>

Each user's ``localId`` is set to the existing ZIZA ``user_id`` so that the
Firebase uid matches ``User.user_id`` in the DB — the auth endpoint then looks
users up by uid (no email fallback needed for migrated accounts).

IMPORTANT — hash encoding: ``firebase auth:import`` expects ``passwordHash`` as
base64-encoded bytes. This script base64-encodes the stored bcrypt string
(e.g. ``$2b$12$...``). Verify the exact expectation against your installed
Firebase CLI version before running against production; pass ``--raw`` to emit
the unencoded bcrypt string instead.

This is a dry-runnable, read-only export — it never writes to the DB.
"""
import argparse
import asyncio
import base64
import json
import sys

from app import crud
from app import db as _db


async def _export(raw: bool) -> dict:
    if _db._SessionLocal is None:
        sys.stderr.write(
            "DATABASE_URL is not set — cannot export. Point it at the source DB.\n"
        )
        raise SystemExit(2)

    async with _db._SessionLocal() as session:
        users = await crud.list_local_users(session)

    records = []
    for u in users:
        pw = u.password_hash
        password_hash = pw if raw else base64.b64encode(pw.encode()).decode()
        records.append(
            {"localId": u.user_id, "email": u.email, "passwordHash": password_hash}
        )
    return {"users": records}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--raw", action="store_true",
        help="Emit the unencoded bcrypt string instead of base64 (see docstring).",
    )
    args = parser.parse_args()
    payload = asyncio.run(_export(args.raw))
    json.dump(payload, sys.stdout)
    sys.stdout.write("\n")
    sys.stderr.write(f"Exported {len(payload['users'])} local account(s).\n")


if __name__ == "__main__":
    main()
