#!/usr/bin/env bash
# Start the full Ziza stack locally with docker compose.
#
# Services démarrés :
#   db           → PostgreSQL 16              → localhost:5432
#   migrate      → alembic upgrade head       → (s'arrête après succès)
#   api          → FastAPI                    → http://localhost:8000
#   web-landing  → Landing page               → http://localhost:3000
#   web-customer → Application client         → http://localhost:3001
#   web-driver   → Application chauffeur      → http://localhost:3002
#   web-admin    → Tableau de bord admin      → http://localhost:3003
#   web-craft    → Portail professionnels      → http://localhost:3004
#
# Usage :
#   ./scripts/dev/up.sh            # mode attaché (logs en direct)
#   ./scripts/dev/up.sh -d         # mode détaché (arrière-plan)
#   ./scripts/dev/up.sh api        # démarrer un seul service
set -euo pipefail
cd "$(dirname "$0")/../.."
docker compose up --build "$@"
