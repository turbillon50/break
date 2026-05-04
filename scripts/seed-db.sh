#!/usr/bin/env bash
# =============================================================================
# seed-db.sh — apply schema + seed to the Break database
# =============================================================================
# Usage:   DATABASE_URL_BREAK=... bash scripts/seed-db.sh [--force]
# Effects: 1) ensures connectivity   2) applies schema.sql (idempotent)
#          3) applies seed.sql, refusing if identity already has rows unless
#             --force is passed.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCHEMA="$ROOT/src/db/schema.sql"
SEED="$ROOT/src/db/seed.sql"

if [[ -z "${DATABASE_URL_BREAK:-}" ]]; then
  if [[ -f "$ROOT/.env" ]]; then
    # shellcheck disable=SC1091
    set -a; source "$ROOT/.env"; set +a
  fi
fi

if [[ -z "${DATABASE_URL_BREAK:-}" ]]; then
  echo "ERROR: DATABASE_URL_BREAK is not set." >&2
  echo "Either export it or put it in $ROOT/.env" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql is not on PATH. Install postgres client tools." >&2
  exit 1
fi

FORCE=0
if [[ "${1:-}" == "--force" ]]; then FORCE=1; fi

echo "==> Verifying DB connectivity"
psql "$DATABASE_URL_BREAK" -c 'SELECT 1' >/dev/null
echo "    OK"

echo "==> Applying schema: $SCHEMA"
psql "$DATABASE_URL_BREAK" -v ON_ERROR_STOP=1 -f "$SCHEMA"
echo "    OK"

echo "==> Checking whether seed has already run"
EXISTING_COUNT=$(psql "$DATABASE_URL_BREAK" -t -A -c \
  "SELECT COUNT(*) FROM break_memory.identity")
if [[ "$EXISTING_COUNT" -gt 0 && $FORCE -eq 0 ]]; then
  echo "    identity table already has $EXISTING_COUNT rows."
  echo "    Refusing to seed. Pass --force to override (will create duplicates)."
  exit 0
fi

echo "==> Applying seed: $SEED"
psql "$DATABASE_URL_BREAK" -v ON_ERROR_STOP=1 -f "$SEED"
echo "    OK"

echo "==> Done. Final counts:"
psql "$DATABASE_URL_BREAK" -c "
  SELECT
    (SELECT COUNT(*) FROM break_memory.identity) AS identity,
    (SELECT COUNT(*) FROM break_memory.relationships) AS relationships,
    (SELECT COUNT(*) FROM break_memory.lessons) AS lessons,
    (SELECT COUNT(*) FROM break_memory.decisions) AS decisions,
    (SELECT COUNT(*) FROM break_memory.technical_notes) AS technical_notes,
    (SELECT COUNT(*) FROM break_memory.session_snapshots) AS snapshots,
    (SELECT COUNT(*) FROM break_memory.free_memory) AS free_memory
"
