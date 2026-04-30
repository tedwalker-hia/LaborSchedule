# Rewrite Audit: Next.js vs Legacy Flask

Comparison of `labor-schedule-nextjs` (current) against `../old-labor-schedule/LaborSchedule` (original Python/Flask).

Audit date: 2026-04-21. Branch: `audit-first-pass`.

## Summary

- UI-driven workflows: ~80% feature complete.
- Automation / batch operations: ~0% complete (all three Python scripts dropped with no replacement).
- Import flow is broken end-to-end (UI calls endpoints that do not exist).
- Authorization logic exists but is not enforced on most mutating routes.
- Not production-ready until import endpoints and authorization are wired.

## 1. Critical Gaps (missing features)

### 1.1 Import endpoints missing

`components/schedule/ImportModal.tsx:62,94` calls:

- `/api/schedule/import/preview`
- `/api/schedule/import`

Neither route handler exists under `app/api/schedule/`. Client-side parsing logic (`lib/excel-import.ts`) is in place, but server side is absent.

Old implementation: `app.py:1686-1814` (full bidirectional import).

### 1.2 Batch / CLI scripts removed

Three standalone Python scripts in OLD have no equivalent in NEW:

| Script | Purpose | Size |
|---|---|---|
| `generate_labor_schedules.py` | Timesheet template generation | ~320 lines |
| `generate_sop.py` | Word SOP documentation generation | — |
| `populate_schedules.py` | `watchdog`-based file-system watcher syncing Excel files to DB | — |

No CLI, cron, or file-watcher capability in NEW.

### 1.3 No scheduled/background work

OLD ran batch scripts via external cron or filesystem events. NEW has no scheduler, no job runner, no watcher.

## 2. Authorization Holes

`lib/permissions.ts` defines `PermissionChecker` with `hasScheduleAccess()`, ported from OLD's `_user_can_manage()` (`app.py:2008-2050`).

The class is **not invoked** in these mutating routes:

- `/api/schedule/export`
- `/api/schedule/lock`
- `/api/schedule/delete`
- `/api/schedule/clear`
- `/api/schedule/add`

Current enforcement: `x-user-id` header presence only. Already flagged in `TODO.md:16-17`.

## 3. Secrets / Auth Bugs

### 3.1 Secrets leaked to client bundle

`next.config.ts:6-9` inlines the following into the client bundle at build time via the `env` block:

- `DATABASE_URL`
- `JWT_SECRET`

### 3.2 JWT fallback secret

If `JWT_SECRET` is unset, code falls back to the literal string `'your-secret-key-change-in-production'`. Deployments missing the env var accept forged tokens.

### 3.3 Related issues (from `TODO.md`)

- Cookie `secure` flag depends on reverse proxy (line 13).
- CSRF gap on logout (line 27).
- Client-side JWT expiry check incomplete (line 24).

## 4. Behavioral Divergence

### 4.1 N+1 query in schedule generation

`app/api/schedule/generate/route.ts:60-202` runs `findFirst` inside the generation loop. OLD used a single aggregation in `populate_schedules.get_employee_history()`. Flagged in `TODO.md:15`.

### 4.2 No transaction on schedule save

Save flow deletes then inserts without wrapping in a Prisma transaction. Race condition on concurrent saves. `TODO.md:14`.

### 4.3 Missing DB indexes

No indexes on:

- `(hotelName, scheduleDate)`
- `usrSystemCompanyId`

Queries scan full tables. `TODO.md:18`.

## 5. Parity Matches

Correctly ported:

- Hour calculation: `_calc_hours` (Python) ↔ `calcHours` in `lib/schedule-utils.ts`. Same regex, same overnight-shift handling.
- Permission model logic (just not invoked in routes).
- Password hashing: `bcrypt` → `bcryptjs`.
- Employee payroll history: ported to `lib/payroll-history.ts`.
- User/page route coverage: login, schedule, users, change-password all present.

## 6. Stack Mapping

| OLD (Flask) | NEW (Next.js) | Notes |
|---|---|---|
| `app.py` Flask routes | `app/api/*/route.ts` + `app/*/page.tsx` | 1:1 endpoint mapping |
| `pyodbc` raw SQL | Prisma ORM (+ raw SQL for payroll tagged templates) | N+1 bugs introduced |
| `flask.session` + bcrypt | JWT in httpOnly cookie via `jose` + `bcryptjs` | Adds `mustChangePassword` flag |
| `openpyxl` | `exceljs` | Export only; import endpoints missing |
| `settings.ini` (ConfigParser) | `.env` + `lib/env.ts` | Secrets leaking via `next.config.ts` |
| `gunicorn` WSGI | Next.js built-in server | — |
| `generate_labor_schedules.py` | **orphaned** | Batch generation lost |
| `generate_sop.py` | **orphaned** | SOP doc generation lost |
| `populate_schedules.py` (watchdog) | **orphaned** | File-sync automation lost |

## 7. Prioritized Punch List

**Blockers:**

1. Implement `/api/schedule/import/preview` and `/api/schedule/import` route handlers.
2. Decide fate of the three orphaned Python scripts (port, replace with cron-triggered API, or formally deprecate).
3. Wire `PermissionChecker.hasScheduleAccess()` into all mutating routes listed in §2.
4. Remove `DATABASE_URL` / `JWT_SECRET` from `next.config.ts` env block; keep server-only.
5. Remove JWT fallback secret; fail-fast when `JWT_SECRET` unset.
6. Wrap schedule save (delete-then-insert) in a Prisma transaction.
7. Fix N+1 in `app/api/schedule/generate/route.ts` (batch the lookup).

**Medium:**

8. Add indexes on `(hotelName, scheduleDate)` and `usrSystemCompanyId`.
9. CSRF protection on logout.
10. Complete client-side JWT expiry handling.
