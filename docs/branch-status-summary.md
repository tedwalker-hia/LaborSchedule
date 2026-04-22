# Labor Schedule Next.js — `audit-first-pass` branch status

**As of 2026-04-22. Branch not yet merged to `main`.**

## Context

The Next.js port of the legacy Flask labor-schedule app landed on `main` in a single "rewrite" commit. An audit pass on that rewrite found gaps that blocked production cutover: missing Excel import endpoints, secrets leaking into the client bundle, a hard-coded JWT fallback secret, authorization checks not invoked on mutating routes, an N+1 in schedule generation, a non-transactional save path, and no test coverage. The `audit-first-pass` branch is the remediation work.

## What's shipped (8 commits, 5 phases)

**Phase 0 — foundations.** Zod-validated env loader (`lib/config.ts`), Prettier, stricter ESLint/TypeScript config.

**Phase 1 — database migrations.** Replaced the hand-rolled `migration.sql` with a proper Prisma migrate workflow. Baselined against live schema, added cascade-FK and dedupe migrations, wrote audit/dedupe SQL scripts, and added a dedicated `migrate` container to `docker-compose.yml`.

**Phase 2 — Excel feasibility spike.** Six throwaway scripts in `tests/spikes/` proved `exceljs` can handle conditional formatting, data validation, frozen panes, named ranges, sheet protection, and `TIMEVALUE` formulas. Verdict memo in `docs/excel-feasibility.md`. No production code shipped — this was a go/no-go decision for keeping `exceljs`.

**Phase 3 — domain rules extraction + unit tests.** Pure business rules pulled out of route handlers into `lib/domain/{rules,types,payroll}.ts`. Vitest wired up, 9 unit test files covering `calcHours`, `cleanDeptName`, `roundToQuarter`, `shouldScheduleDow`, `startTimeForShift`, `validatePassword`, `buildHistory`, `isoWeek`, `toMondayBased`.

**Phase 4 (partial) — service/repository layering.** Route handlers were becoming 150–300 line "god functions" mixing auth, validation, SQL, and business rules. Introduced:

- `lib/repositories/` — `schedules`, `users`, `payroll`, `org`, `audit`. Thin Prisma wrappers, one per domain.
- `lib/services/` — `schedule`, `generation`, `import`, `export`, `payroll`, `user`, `audit`. Business logic lives here.
- `lib/http/map-error.ts` — typed error classes → HTTP status codes, so routes are now ~20–40 lines each.
- Audit fixes landed: `/api/schedule/save` now wraps delete-then-insert in a Prisma transaction; `/api/payroll/seed` rewritten as an upsert; N+1 in generation fixed via `payrollRepo.findPayrollWindows`; new covering-index migration after a `distinct`/`groupBy` review (memo in `docs/distinct-groupby-review.md`).
- Tests: Testcontainers-based MSSQL 2022 integration harness in `tests/integration/`, plus unit tests for services and repositories. Current state: **142 / 149 unit tests pass**. 7 failures (5 in generation-service, 2 in user-service) tracked as debt.

## Planning docs in the branch

- `docs/rewrite-audit.md` — the gap analysis against the legacy Flask app.
- `docs/rewrite-plan.md` — the v3 refactor plan driving this branch.
- `docs/excel-feasibility.md` — Phase 2 verdict.
- `docs/distinct-groupby-review.md` — Phase 4 query-plan review.

## Known debt at branch HEAD

1. 7 failing unit tests (generation-service, user-service).
2. Phase 4 task 71 — per-service integration tests — unfinished; 3 untracked integration test files (`audit`, `export`, `import`) are on disk but not committed.
3. One uncommitted edit in `lib/services/generation-service.ts`.
4. `eslint.config`: `no-explicit-any` downgraded from error to warn (consistent with Phase 0 "warn rather than block" policy).

## What the branch does *not* do

No new user-facing features. Dark mode and the collapsible sidebar were already on `main`. This branch is de-risking the cutover: closing security gaps, fixing correctness bugs, replacing hand-rolled plumbing with layered code and tests, and getting the app to a state where the remaining audit blockers (missing Excel import endpoints, orphaned Python batch scripts, full RBAC enforcement) can be finished confidently.

## Recommended next steps

1. Fix the 7 failing unit tests and commit Phase 4 remainder (integration tests for audit/export/import).
2. Merge `audit-first-pass` → `main` once green.
3. Pick up the remaining Phase 5+ audit blockers: implement `/api/schedule/import/preview` and `/api/schedule/import`, decide fate of the three orphaned Python batch scripts, wire `PermissionChecker` into the five mutating routes still missing it, remove `DATABASE_URL`/`JWT_SECRET` from `next.config.ts`, kill the JWT fallback secret.
