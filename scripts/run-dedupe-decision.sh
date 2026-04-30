#!/usr/bin/env bash
# Run duplicate audit against HIALaborSchedules and apply the <1% decision rule.
#
# Connects via sqlcmd. Omit -U/-P for Windows auth / trusted connection.
#
# Decision rule:
#   DupeRate < 0.01  => print dedupe instructions (keep latest Id per group)
#   DupeRate >= 0.01 => print escalation memo; unique-index task dropped from scope
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Usage ────────────────────────────────────────────────────────────────────
usage() {
  cat >&2 <<EOF
Usage: $0 -S <server> -d <database> [-U <user> -P <password>]

  -S  SQL Server hostname or DSN
  -d  Database name
  -U  SQL login (omit for Windows / trusted auth)
  -P  SQL password (omit for Windows / trusted auth)

Example (SQL auth):
  $0 -S localhost,1433 -d LaborSchedule -U sa -P secret

Example (trusted auth):
  $0 -S myserver -d LaborSchedule
EOF
  exit 1
}

SERVER="" DATABASE="" SQLCMD_USER_ARGS=""
while getopts "S:d:U:P:h" opt; do
  case $opt in
    S) SERVER="$OPTARG" ;;
    d) DATABASE="$OPTARG" ;;
    U) SQLCMD_USER_ARGS="$SQLCMD_USER_ARGS -U $OPTARG" ;;
    P) SQLCMD_USER_ARGS="$SQLCMD_USER_ARGS -P $OPTARG" ;;
    h) usage ;;
    *) usage ;;
  esac
done

[[ -z "$SERVER" || -z "$DATABASE" ]] && usage

if ! command -v sqlcmd &>/dev/null; then
  echo "ERROR: sqlcmd not found in PATH." >&2
  echo "Install: https://learn.microsoft.com/sql/tools/sqlcmd/sqlcmd-utility" >&2
  exit 1
fi

TODAY="$(date +%Y-%m-%d)"

# ── Step 1: run audit ─────────────────────────────────────────────────────────
echo "=== Duplicate Audit: HIALaborSchedules ==="
echo "Server: $SERVER   Database: $DATABASE   Date: $TODAY"
echo

# shellcheck disable=SC2086
AUDIT_OUTPUT="$(
  sqlcmd -S "$SERVER" -d "$DATABASE" $SQLCMD_USER_ARGS \
    -i "$SCRIPT_DIR/audit-duplicates.sql" \
    -W -s "|" -h -1 2>&1
)"

echo "$AUDIT_OUTPUT"
echo

# ── Step 2: extract rate line ─────────────────────────────────────────────────
# audit-duplicates.sql step-3 outputs a line containing one of:
#   BELOW THRESHOLD — proceed with dedupe
#   AT OR ABOVE THRESHOLD — escalate, drop unique-index task from scope
#   NO DATA
RATE_LINE="$(
  echo "$AUDIT_OUTPUT" \
    | grep -E 'BELOW THRESHOLD|AT OR ABOVE THRESHOLD|NO DATA' \
    | tail -1 \
  || true
)"

if [[ -z "$RATE_LINE" ]]; then
  echo "ERROR: Could not parse audit output." >&2
  echo "Run scripts/audit-duplicates.sql manually and record results in prisma/migrations/README.md." >&2
  exit 1
fi

EXCESS_ROWS="$(echo "$RATE_LINE" | cut -d'|' -f1 | tr -d ' ')"
TOTAL_ROWS="$(echo  "$RATE_LINE" | cut -d'|' -f2 | tr -d ' ')"
DUPE_RATE="$(echo   "$RATE_LINE" | cut -d'|' -f3 | tr -d ' ')"

# ── Step 3: apply decision rule ───────────────────────────────────────────────
echo "=== Decision ==="
echo "ExcessRows: $EXCESS_ROWS   TotalRows: $TOTAL_ROWS   DupeRate: $DUPE_RATE"
echo

if echo "$RATE_LINE" | grep -q "BELOW THRESHOLD"; then
  cat <<EOF
RESULT: DupeRate < 1% — proceed with dedupe.

Next steps:
  1. Preview rows to be deleted (SELECT block runs automatically):
       sqlcmd -S "$SERVER" -d "$DATABASE" $SQLCMD_USER_ARGS \\
         -i scripts/dedupe-labor-schedules.sql

  2. Verify the SELECT row count matches ExcessRows ($EXCESS_ROWS).

  3. Edit scripts/dedupe-labor-schedules.sql:
       • Uncomment the DELETE block
       • Change ROLLBACK to COMMIT

  4. Re-run in maintenance window to commit the delete.

  5. Paste the following into prisma/migrations/README.md under "Audit Results":

--- paste ---
ExcessRows | TotalRows | DupeRate | Recommendation
$EXCESS_ROWS | $TOTAL_ROWS | $DUPE_RATE | BELOW THRESHOLD
--- end paste ---

  6. Under "Decision":
     DupeRate = $DUPE_RATE ($EXCESS_ROWS excess rows / $TOTAL_ROWS total). Proceeding with dedupe script and unique index.

  7. Under "Dedupe Applied" (after maintenance window):
     $TODAY maintenance window. Deleted $EXCESS_ROWS excess rows. Verified with SELECT COUNT(*) = 0 on duplicate query.

  8. Proceed with unique-index follow-up migration.
EOF

elif echo "$RATE_LINE" | grep -q "AT OR ABOVE THRESHOLD"; then
  cat <<EOF
RESULT: DupeRate >= 1% — ESCALATE. Do NOT run dedupe script.

Escalation memo — copy into prisma/migrations/README.md under "Decision":

--- paste ---
DupeRate = $DUPE_RATE ($EXCESS_ROWS excess rows / $TOTAL_ROWS total rows).
Escalated to data owner on $TODAY. Root cause investigation required before
any row deletion. Unique-index task dropped from Phase 1 scope; logged as v2
debt.
--- end paste ---

Scope change:
  • Drop the unique-index follow-up migration from Phase 1.
  • Record task as blocked in task tracker (task 12 blocks list).
  • Non-unique index migrations and all other Phase 1 tasks are unaffected.
EOF

else
  echo "RESULT: NO DATA — HIALaborSchedules appears empty." >&2
  echo "Verify you connected to the correct database before proceeding." >&2
  exit 1
fi
