#!/usr/bin/env bash
# One-shot: mark the baseline migration as already applied on the target database.
#
# Runs:
#   prisma migrate resolve --applied 20260422010135_baseline
#   prisma migrate status
#
# Requires DATABASE_URL to be set in the environment (standard Prisma convention).
# Do NOT pass a raw connection string as a positional arg — set it in the shell:
#
#   DATABASE_URL="sqlserver://..." bash scripts/baseline-resolve.sh
#   DATABASE_URL="sqlserver://..." npm run db:baseline-resolve
#
# Safety: this command is idempotent once the _prisma_migrations row exists.
# Running it twice does no harm (Prisma will report it's already recorded).
set -euo pipefail

BASELINE="20260422010135_baseline"

if [[ -z "${DATABASE_URL:-}" ]]; then
  cat >&2 <<EOF
ERROR: DATABASE_URL is not set.

Export it before running this script:
  export DATABASE_URL="sqlserver://<host>:<port>;database=<db>;user=<u>;password=<p>;encrypt=true"
  bash scripts/baseline-resolve.sh

Or inline it:
  DATABASE_URL="sqlserver://..." npm run db:baseline-resolve
EOF
  exit 1
fi

echo "=== Baseline resolve: $BASELINE ==="
echo

npx prisma migrate resolve --applied "$BASELINE"

echo
echo "=== Migration status ==="
npx prisma migrate status
