#!/usr/bin/env bash
# Start the full Ziza stack locally with docker compose.
set -euo pipefail
cd "$(dirname "$0")/../.."
docker compose up --build "$@"
