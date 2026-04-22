# Migration History

This directory contains managed Prisma migration files.
See `docs/rewrite-plan.md` §7.2 and §14 for background.

---

## Duplicate Audit — HIALaborSchedules

**Candidate unique key:** `(UsrSystemCompanyID, EmployeeCode, ScheduleDate, PositionName)`

**Audit script:** `scripts/audit-duplicates.sql`
**Dedupe script:** `scripts/dedupe-labor-schedules.sql`
**Runner script:** `scripts/run-dedupe-decision.sh` (executes audit via `sqlcmd`, parses DupeRate, prints next steps)

### Methodology

1. Run the decision runner against production (read-only audit, no writes):
   ```bash
   # SQL auth
   bash scripts/run-dedupe-decision.sh -S <server> -d <database> -U <user> -P <password>

   # Windows / trusted auth
   bash scripts/run-dedupe-decision.sh -S <server> -d <database>

   # via npm (passes args after --)
   npm run db:dedupe-audit -- -S <server> -d <database>
   ```
2. The runner prints audit output and a **RESULT** block with copy-paste text for this README.
3. Decision rule applied automatically:
   - `DupeRate < 0.01` (< 1%) → runner prints dedupe instructions (keep latest `Id` per group); apply in maintenance window, then proceed with unique index migration.
   - `DupeRate >= 0.01` (≥ 1%) → runner prints escalation memo; drop unique-index follow-up from Phase 1 scope; log as v2 debt.

### Audit Results

> **TODO:** Paste `sqlcmd` or SSMS output here after running `scripts/audit-duplicates.sql` against production.

```
-- Step 1: TotalRows
TotalRows
---------
<FILL IN>

-- Step 2: Duplicate groups (omit if none)
UsrSystemCompanyID | EmployeeCode | ScheduleDate | PositionName | DupeCount | OldestId | LatestId
<FILL IN or "No duplicates found">

-- Step 3: Duplicate rate
ExcessRows | TotalRows | DupeRate | Recommendation
<FILL IN>
```

### Decision

> **TODO:** Record decision here after reviewing audit results.
> Example: "DupeRate = 0.00 (0 excess rows / 12 345 total). Proceeding with dedupe script and unique index."
> Example: "DupeRate = 0.023 (≥ 1%). Escalated to data owner on 2026-04-21. Unique-index task dropped from Phase 1 scope."

### Dedupe Applied

> **TODO:** If dedupe was applied, record date, window, and row count deleted.
> Example: "2026-04-22 maintenance window. Deleted 3 excess rows. Verified with SELECT COUNT(*) = 0 on duplicate query."

---

## Baseline Migration

Generated on 2026-04-22 via:
```
prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script \
  > prisma/migrations/20260422010135_baseline/migration.sql
```

Migration file: `prisma/migrations/20260422010135_baseline/migration.sql`

Covers all 5 tables: `HIALaborSchedules`, `HIALaborSchedulesUsers`, `HIALaborSchedulesUserTenants`, `HIALaborSchedulesUserHotels`, `HIALaborSchedulesUserDepts` — plus the `Email` unique index and 3 FK constraints.

On production (one-time, marks baseline as already applied without re-running DDL):
```
prisma migrate resolve --applied 20260422010135_baseline
```

---

## Dockerfile Audit

**Audited:** 2026-04-21

**Result:** PASS — `prisma migrate deploy` is NOT baked into any Dockerfile build stage.

**Verified:**
- `Dockerfile:14` runs `RUN npx prisma generate` (builder stage) — reads `schema.prisma`, generates TS client, no DB connection required.
- `package.json` `build` script: `prisma generate && next build` — no `prisma migrate` call.
- No `DATABASE_URL` ARG/ENV injected at build time.
- `scripts/verify-no-baked-migrations.sh` guards this invariant in CI: exits 1 if any `RUN/CMD/ENTRYPOINT` line contains `prisma migrate deploy`.

**Enforcement:** Add `bash scripts/verify-no-baked-migrations.sh` to CI pipeline to prevent regressions.

---

## Follow-up Migrations

These run as separate `prisma migrate dev` migrations after the baseline is applied:

| Migration | Depends on |
|-----------|------------|
| Unique index `(UsrSystemCompanyID, EmployeeCode, ScheduleDate, PositionName)` on `HIALaborSchedules` | Dedupe applied OR escalation confirmed |
| Non-unique indexes: `(HotelName, ScheduleDate)`, `UsrSystemCompanyID`, `(Tenant, HotelName, DeptName)` — `20260422030000_non_unique_indexes_labor_schedules` | Baseline |
| `HIALaborScheduleAudit` table | Baseline |
| `HIALaborSchedulesUsers.UserID` FK → `onDelete: Cascade` | Baseline |
| `BI_Payroll_Seed` unique constraint | Baseline |

> **Note:** `PositionName` is nullable. If NULL values cause unique index conflicts on MSSQL,
> use a filtered index: `WHERE PositionName IS NOT NULL` and handle the NULL case in application logic.
