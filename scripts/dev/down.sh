#!/usr/bin/env bash
# Stop and remove the Ziza stack.
set -euo pipefail
cd "$(dirname "$0")/../.."
docker compose down -v "$@"
