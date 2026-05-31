#!/usr/bin/env bash
# Arrêter et supprimer la stack Ziza (conteneurs + volume PostgreSQL).
#
# Services arrêtés :
#   db, migrate, api,
#   web-landing, web-customer, web-driver, web-admin, web-craft
#
# Usage :
#   ./scripts/dev/down.sh          # supprime les conteneurs et le volume DB
#   ./scripts/dev/down.sh --no-volumes  # conserve le volume DB (données persistées)
set -euo pipefail
cd "$(dirname "$0")/../.."
docker compose down -v "$@"
