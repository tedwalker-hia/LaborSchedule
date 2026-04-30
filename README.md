# Labor Schedule

Next.js application for managing hotel labor schedules across multiple tenants, hotels, and departments. Imports and exports Excel workbooks compatible with the legacy Python pipeline; layered RBAC, audit log, transactional services, and zod-validated API contract.

## Stack

- **Next.js 15** App Router (Node runtime)
- **Prisma 6** ORM, **SQL Server** (`sqlserver://`)
- **Zod 4** for env + body validation
- **JWT** sessions via `jose`; **Argon2id** for password hashing (bcrypt-legacy verify supported)
- **rate-limiter-flexible** with Redis (memory fallback in dev)
- **exceljs** for Excel import/export, **chokidar** for watcher
- **Vitest** + **Playwright**
- **Tailwind 4** + daisyUI

## Prerequisites

- Node ≥ 20
- SQL Server reachable (local container or shared)
- Optional: Redis (`REDIS_URL`) for cross-instance rate limiting
- Optional: podman/docker for integration + parity tests via testcontainers

## Setup

```bash
cp .env.example .env
# edit .env: set DATABASE_URL, JWT_SECRET (≥32 chars; openssl rand -base64 48)
npm install
npm run db:generate
npx prisma migrate deploy
npm run dev
```

App throws at boot if `JWT_SECRET` or `DATABASE_URL` is missing.

## Required env vars

| Var | Notes |
|-----|-------|
| `DATABASE_URL` | SQL Server connection string |
| `JWT_SECRET` | ≥32 chars; rotate per environment |
| `NODE_ENV` | `development` \| `production` \| `test` |
| `AUDIT_ENABLED` | `true`/`false`, default true. Set false if `HIALaborScheduleAudit` table not yet created |
| `REDIS_URL` | Optional. Required for multi-instance deploys (per-process memory limiter is bypassed by horizontal scaling) |
| `TEST_USER_PASSWORD`, `TEST_DB_SA_PASSWORD` | Test fixtures; safe defaults in `.env.example` |

## Scripts

### Run

- `npm run dev` — dev server
- `npm run build` — `prisma generate` + `next build`
- `npm start` — production server (after build)
- `npm run build:worker` — compile watcher worker
- `node workers/start.ts` — run watcher (chokidar → ImportService)

### Tests

- `npm test` — unit (vitest)
- `npm run test:watch` — unit watch
- `npm run test:integration` — integration via testcontainers (uses `DOCKER_HOST` from env, defaults to user podman socket)
- `npm run test:e2e` / `:ui` — Playwright

### Database

- `npm run db:generate` — Prisma client
- `npm run db:push` — push schema (dev only)
- `npx prisma migrate deploy` — apply migrations (prod path)
- `npm run db:dedupe-audit` — pre-deploy dedupe of `HIALaborSchedules` against the unique key constraint
- `npm run db:baseline-resolve` — baseline a fresh schema against existing migrations
- `npm run studio` — Prisma Studio

### Excel + parity

- `npm run template:generate` — generate blank workbook templates
- `npm run parity:import` — round-trip 20 fixture workbooks against a fresh container, zero-diff gate
- `npm run parity:template` — diff generated templates vs. legacy Python output
- `npm run parity:rbac` — enumerate active users + assert role/scope parity
- `npm run parity:baseline` — refresh Python baseline outputs (one-time per fixture set)
- `npm run check:excel-verdict` — validate Excel feasibility verdict still holds

### Code quality

- `npx tsc --noEmit` — type-check
- `npm run lint` — ESLint
- `npm run format` / `:check` — Prettier

## Project layout

```
app/
  (app)/               authenticated UI (schedule, users)
  api/                 route handlers (auth, schedule, employee, etc.)
  login, change-password
components/
  schedule/            grid, modals, hooks
  ui/                  primitives (Modal, Alert, etc.)
lib/
  auth/                rbac, hash, session, csrf, current-user
  domain/              business rules (extracted, pure)
  services/            ScheduleService, ImportService, GenerationService, etc.
  repositories/        Prisma adapters
  schemas/             zod body schemas
  excel/               parser + writer
  hooks/               useEmployees, useScheduleExport, useToggleSet
prisma/                schema + migrations
scripts/               parity, fixtures, templates, deploy helpers
workers/               watcher worker (chokidar → importService)
tests/
  unit/                vitest unit tests
  integration/         testcontainers + real Prisma
  spikes/              Excel feasibility one-offs
docs/                  rewrite plan, RBAC, user flows, status
```

## Authentication + RBAC

Roles: `SuperAdmin > CompanyAdmin > HotelAdmin > DeptAdmin`. Scope is enforced at three layers:

- **Route**: `getCurrentUser` + `getUserPermissions` + `await hasHotelAccess({hotel, usrSystemCompanyId})` for hotel-scoped paths
- **`deriveScheduleScope(usrSystemCompanyId)`** returns `null` (unrestricted), `[]` (forbidden), or `Array<{hotelName, deptName?}>`
- **Service** ANDs `scopeToWhere(scope)` into every mutating Prisma where clause

See `docs/rbac.md` for the full role matrix.

Session: 30 min idle / 12 h absolute, jti rotation, CSRF HMAC double-submit cookie, rate limit (10/min/IP, 5/min/email at login). Argon2id for new hashes; bcrypt verified-only for legacy rows.

## Audit log

Every mutating service call writes a `HIALaborScheduleAudit` row inside the same transaction with `oldJson`/`newJson` diff. Set `AUDIT_ENABLED=false` to disable temporarily if the audit table hasn't been provisioned.

## Deploy

- Reverse proxy must set `X-Forwarded-Proto` so `secure` cookie flag takes effect.
- Run parity gates before flipping the proxy: `npm run parity:import` (zero-diff), `npm run parity:rbac` (active users).
- For multi-instance: configure `REDIS_URL`. The memory limiter logs a warning when production falls back.
- Run `npx prisma migrate deploy` against the target DB. Migrations are never baked into the container image.

See `docs/rewrite-status.md` for the full pre-deploy checklist + post-merge follow-ups.

## Status

Phase 0–14 of `docs/rewrite-plan.md` complete. Phase 15 (RBAC parity script + cutover) deferred. Test suite: 311 pass / 2 skipped, tsc clean.

## Documentation

- `docs/rewrite-plan.md` — design + phasing
- `docs/rewrite-status.md` — current state, deploy prerequisites, follow-ups
- `docs/rbac.md` — role matrix
- `docs/user-flows.md` — Mermaid flow diagrams
- `docs/excel-feasibility.md` — Excel-on-Node verdict
