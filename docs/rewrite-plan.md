# Labor Schedule — Next.js Refactor Plan (v3)

Supersedes v2 (`rewrite-plan.md` history) and `../old-labor-schedule/NEXTJS_REBUILD_PLAN.md`. Framing change: this is a **refactor of the existing Next.js app on `audit-first-pass`**, not a greenfield build. Scaffold, UI, most route handlers, Prisma schema, auth context, theme provider, and navigation shell are already in place. Remaining work is architectural (service/repository layering, domain-rules extraction), security (CSRF, rate limiting, idle timeout, secrets), automation (Excel import server path, watcher worker, CLIs), and verification (tests, parity harnesses).

Companion documents:

- `docs/rewrite-audit.md` — gap analysis against the legacy Flask app (current as of 2026-04-21).
- `../old-labor-schedule/REBUILD_PLAN.md` — domain rules (§6), schema changes (§7), REST surface (§8), cutover strategy (§11). Referenced, not repeated.
- `TODO.md` — prioritized defect list from the first audit pass.

## 1. Purpose and Scope

Bring the existing Next.js app to feature and behavior parity with the legacy Flask monolith, then cut over. No new product features in v1. All business rules in `REBUILD_PLAN.md` §6 are preserved verbatim.

Two carve-outs from strict parity, already shipped in the app and kept:

- Light/dark theme toggle (`lib/theme-provider.tsx` + `TopNavigation.tsx`). UX polish, not a parity requirement.
- Collapsible sidebar + top nav shell (`components/navigation/Sidebar.tsx`, `TopNavigation.tsx`). Matches the two-peer URL layout `/schedule` + `/users`.

## 2. Current State Inventory

Snapshot of the app on `audit-first-pass` as of 2026-04-21. See `docs/rewrite-audit.md` for the full gap analysis against the Flask original; this section summarizes what exists in the Next.js tree today.

### 2.1 Pages

| Path | File | Status |
|------|------|--------|
| `/` | `app/page.tsx` | redirect to `/schedule` |
| `/login` | `app/login/page.tsx` | done |
| `/change-password` | `app/change-password/page.tsx` | done |
| `/schedule` | `app/(app)/schedule/page.tsx` | done (editor) |
| `/users` | `app/(app)/users/page.tsx` | done |
| `(app)` layout | `app/(app)/layout.tsx` | done (auth guard via context, sidebar + top nav) |

### 2.2 REST routes (`app/api/**`)

See §5 for the per-route audit table. All route handlers return JSON; none declare `runtime` or `dynamic`; two (`/api/schedule/import/preview`, `/api/schedule/import`) are missing.

### 2.3 Libraries

| File | Role | Disposition |
|------|------|-------------|
| `lib/prisma.ts` | Prisma singleton | keep |
| `lib/env.ts` | env reader (unsafe fallback secret) | **replace** with `lib/config.ts` (zod) |
| `lib/auth-context.tsx` | client auth context + `/api/auth/me` bootstrap | keep; complete JWT-expiry handling |
| `lib/theme-provider.tsx` | light/dark toggle | keep |
| `lib/permissions.ts` | RBAC helpers (`getUserPermissions`, role checks) | **move** to `lib/auth/rbac.ts` |
| `lib/schedule-utils.ts` | `calcHours`, `cleanDeptName`, misc helpers | **split** — pure rules → `lib/domain/rules.ts`, keep thin helpers here or delete |
| `lib/payroll-history.ts` | Prisma `$queryRaw` + pure DOW math | **split** — SQL → `lib/repositories/payroll-repo.ts`; `buildHistory`/`toMondayBased`/`isoWeek`/`EmployeeHistory` → `lib/domain/rules.ts` (or `lib/domain/payroll.ts`) |
| `lib/excel-import.ts` | client-side `exceljs` parser | **move** to `lib/excel/parser.ts`, run server-side |
| `lib/excel-export.ts` | `exceljs` workbook writer | **move** to `lib/excel/writer.ts` |

New files required (enumerated in §3 target layout): `lib/config.ts`, `lib/session.ts`, `lib/csrf.ts`, `lib/rate-limit.ts`, `lib/logger.ts`, `lib/auth/hash.ts`, `lib/auth/current-user.ts`, `lib/auth/rbac.ts`, `lib/domain/rules.ts`, `lib/domain/types.ts`, `lib/services/*`, `lib/repositories/*`, `lib/excel/template.ts`.

### 2.4 Components

| Path | Status |
|------|--------|
| `components/navigation/Sidebar.tsx` | done — collapsible, two nav items (`Schedule`, `Users`) |
| `components/navigation/TopNavigation.tsx` | done — user name + role chip, theme toggle, logout |
| `components/schedule/ScheduleGrid.tsx` | done |
| `components/schedule/FilterBar.tsx` | done |
| `components/schedule/ActionBar.tsx` | done |
| `components/schedule/{Add,Clear,Delete,Generate,Import,RefreshEmployees,SeedEmployees}Modal.tsx` | done (Import 404s server-side) |
| `components/schedule/useScheduleState.ts` | done |
| `components/users/UserModal.tsx` | done |
| `components/users/UserTable.tsx` | done |
| `components/ui/Modal.tsx` | done |
| `components/ui/{Button,Spinner,Alert,TextField,SelectField,DateField,DateRangeField,Badge,Chip,Wizard,ConfirmModal,EmployeeCheckboxList,DataTable}` | **missing** — primitives/hooks/wizard refactor (TODO.md "Reusable components") |

### 2.5 Tech stack (as-implemented)

| Layer | Current | Plan disposition |
|-------|---------|-------------------|
| Language | TypeScript 5.x | keep; enable `noUncheckedIndexedAccess` |
| Framework | Next.js 15 App Router | keep |
| Runtime | Node 20+ (engines pin `>=20.0.0`) | keep; document Node 22 LTS as recommended |
| DB driver | Prisma 6.x on `sqlserver` provider | keep |
| Migrations | one hand-rolled `prisma/migration.sql` | **adopt `prisma migrate` workflow**; baseline from live schema |
| Auth (session) | JWT via `jose` in `httpOnly` cookie | keep shape; **add idle + absolute TTL enforcement** |
| Password hashing | `bcryptjs` | keep verify; **add `argon2` for new hashes + upgrade-on-login** |
| CSRF | none | **add double-submit cookie, enforced in middleware** |
| Rate limit | none | **add `rate-limiter-flexible`** (memory in dev, Redis in prod) on `/api/auth/login` |
| Validation | none | **add `zod`** for request bodies + env loader |
| Client data | controlled state + direct `fetch` | keep for now; consider `@tanstack/react-query` post-cutover |
| Toast / feedback | `react-hot-toast` in `package.json`, **unused** | **wire in**; mount `<Toaster>` in `app/layout.tsx`, use on every mutation |
| UI | Tailwind v4 + DaisyUI 5 + lucide-react | keep |
| Theming | `lib/theme-provider.tsx` (localStorage + `prefers-color-scheme`) | keep |
| Excel | `exceljs` (client-side parse + server-side write) | keep; **spike feasibility** (§9) |
| File watcher | none | **add `chokidar` in `workers/watcher.ts`** |
| Logging | `console.*` | **add `pino` structured logger** |
| Tests | none | **add Vitest + Playwright + Testcontainers (MSSQL 2022)** |
| Lint/format | `next lint` (ESLint flat config) | **add Prettier + stricter TS config** |
| Container | single `Dockerfile` (web only), `output: 'standalone'` enabled | keep web image; **add worker image** |
| Package manager | npm | keep |

Deliberately avoided: Drizzle / raw `mssql`, `iron-session`, Server Actions, NextAuth, Vercel-specific primitives. Rationale in v2 plan §3; unchanged.

## 3. Target Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Next.js 15 (App Router, Node runtime)                       │
│    app/page.tsx                    ← redirect → /schedule    │
│    app/login/                      ← login page              │
│    app/change-password/            ← forced password change  │
│    app/(app)/                      ← authenticated shell     │
│      layout.tsx                    ← AuthProvider, Theme,    │
│                                      Sidebar, TopNavigation  │
│      schedule/page.tsx             ← schedule editor         │
│      users/page.tsx                ← user admin              │
│    app/api/**/route.ts             ← REST per REBUILD §8     │
│    middleware.ts                   ← session + CSRF + idle   │
└────────────────────┬─────────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────────┐
│  lib/services/   (pure TS, no HTTP, no Excel SDK imports)    │
│    scheduleService, importService, exportService,            │
│    generationService, payrollService, userService,           │
│    auditService                                              │
└────────────────────┬─────────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────────┐
│  lib/repositories/  (Prisma client + raw SQL escape hatch)   │
│    schedulesRepo, usersRepo, payrollRepo, orgRepo, auditRepo │
└────────────────────┬─────────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────────┐
│  MS SQL Server (BISource) — schema per REBUILD_PLAN §7       │
└──────────────────────────────────────────────────────────────┘

Separate Node process: workers/watcher.ts   ← chokidar → importService
Separate CLI:          scripts/generate-templates.ts
Separate CLIs:         scripts/import-parity.ts, scripts/rbac-parity.ts
```

Layering rules:

- Route handlers do HTTP only (parse, validate, authz check, serialize). They call services.
- Services hold business rules. No `exceljs`, no Prisma client imports, no `Request`/`Response` references in service bodies. Services accept a repository interface and a clock as dependencies so they can be unit-tested without a DB.
- Repositories are the only layer that imports `@prisma/client`. Raw SQL is permitted in repositories for hot paths via `$queryRaw` / `$executeRaw`.
- Excel parsing/writing lives in `lib/excel/` behind a narrow interface.
- Every `route.ts` under `app/api/**` declares `export const runtime = 'nodejs'` and `export const dynamic = 'force-dynamic'`.
- Every page that touches the DB declares `export const runtime = 'nodejs'`.

### 3.1 Target tree

```
labor-schedule-nextjs/
├── package.json
├── tsconfig.json
├── next.config.ts                 # NOTE: remove the `env` block
├── middleware.ts                  # session + CSRF + idle check
├── Dockerfile                     # web image
├── docker-compose.yml             # mssql + web + worker + redis (optional)
├── .env.example
├── prisma/
│   ├── schema.prisma
│   └── migrations/                # managed by `prisma migrate`
├── app/
│   ├── layout.tsx                 # <Toaster> mount here
│   ├── page.tsx                   # redirect → /schedule
│   ├── login/page.tsx
│   ├── change-password/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx             # AuthProvider, ThemeProvider, Sidebar, TopNavigation
│   │   ├── schedule/page.tsx
│   │   └── users/page.tsx
│   └── api/
│       ├── auth/{login,logout,me,change-password}/route.ts
│       ├── tenants/route.ts
│       ├── hotels/[tenant]/route.ts
│       ├── departments/route.ts
│       ├── positions/route.ts
│       ├── schedule/
│       │   ├── route.ts                   # GET
│       │   ├── save/route.ts
│       │   ├── add/route.ts
│       │   ├── lock/route.ts
│       │   ├── clear/route.ts
│       │   ├── delete/route.ts
│       │   ├── generate/route.ts
│       │   ├── check-locked/route.ts
│       │   ├── export/route.ts
│       │   ├── import/preview/route.ts    # ← NEW (multipart)
│       │   └── import/route.ts            # ← NEW
│       ├── employees/{route,refresh,refresh-preview}/route.ts
│       ├── employee/update/route.ts
│       ├── users/{route,[id]}/route.ts
│       ├── payroll/{tenants,employees,seed}/route.ts
│       └── health/route.ts
├── components/
│   ├── navigation/{Sidebar,TopNavigation}.tsx
│   ├── schedule/                  # existing grid, filter, action bar, modals
│   ├── users/                     # existing UserModal, UserTable
│   └── ui/                        # Modal exists; add Button, Spinner, Alert,
│                                  #   TextField, SelectField, DateField,
│                                  #   DateRangeField, Badge, Chip, Wizard,
│                                  #   ConfirmModal, EmployeeCheckboxList, DataTable
├── lib/
│   ├── config.ts                  # ← NEW, zod-validated env (replaces lib/env.ts)
│   ├── prisma.ts                  # exists
│   ├── session.ts                 # ← NEW, JWT + idle/absolute TTL
│   ├── csrf.ts                    # ← NEW, double-submit helpers
│   ├── rate-limit.ts              # ← NEW
│   ├── logger.ts                  # ← NEW, pino
│   ├── auth-context.tsx           # exists; complete expiry handling
│   ├── theme-provider.tsx         # exists
│   ├── auth/
│   │   ├── hash.ts                # ← NEW, bcrypt verify + argon2 hash/upgrade
│   │   ├── current-user.ts        # ← NEW
│   │   └── rbac.ts                # folds in lib/permissions.ts
│   ├── domain/
│   │   ├── rules.ts               # ← NEW, pure rules (§7 table)
│   │   ├── types.ts
│   │   └── payroll.ts             # ← NEW, DOW math from lib/payroll-history.ts
│   ├── services/
│   │   ├── schedule-service.ts
│   │   ├── generation-service.ts
│   │   ├── import-service.ts
│   │   ├── export-service.ts
│   │   ├── payroll-service.ts
│   │   ├── user-service.ts
│   │   └── audit-service.ts
│   ├── repositories/
│   │   ├── schedules-repo.ts
│   │   ├── users-repo.ts
│   │   ├── payroll-repo.ts        # raw SQL from lib/payroll-history.ts
│   │   ├── org-repo.ts
│   │   └── audit-repo.ts
│   └── excel/
│       ├── template.ts            # blank template (replaces generate_labor_schedules.py)
│       ├── parser.ts              # promoted from lib/excel-import.ts, server-side
│       └── writer.ts              # promoted from lib/excel-export.ts
├── workers/
│   ├── watcher.ts                 # ← NEW, chokidar → importService
│   └── Dockerfile                 # ← NEW, separate image
├── scripts/
│   ├── generate-templates.ts      # ← NEW, CLI wrapper around lib/excel/template.ts
│   ├── rbac-parity.ts             # ← NEW, cutover gate (REBUILD_PLAN §11.4)
│   └── import-parity.ts           # ← NEW, golden-file harness (REBUILD_PLAN §11.3)
└── tests/
    ├── unit/                      # Vitest
    ├── integration/               # Testcontainers MSSQL
    ├── e2e/                       # Playwright
    └── fixtures/
        ├── excel/                 # 20 golden workbooks
        └── payroll/               # seed JSON
```

## 4. File Migration Map

Every source file currently in the tree whose target location or shape changes. Net-new files are captured in §3.1, not repeated here.

| Source | Target | Transform |
|--------|--------|-----------|
| `lib/env.ts` | `lib/config.ts` | rewrite as zod schema; throw at boot when `JWT_SECRET` or `DATABASE_URL` missing; delete literal fallback secret |
| `lib/permissions.ts` | `lib/auth/rbac.ts` | move + re-export in Phase 0/4; semantic fix (empty-array → `{ unlimited: true }`) in Phase 7; unit-test matrix added |
| `lib/schedule-utils.ts` | `lib/domain/rules.ts` + (slim leftover) | extract `calcHours`, `cleanDeptName`, start-time bucket, rounding as pure functions; leftover utility helpers stay in lib root or fold into `lib/domain/rules.ts` in full |
| `lib/payroll-history.ts` | `lib/repositories/payroll-repo.ts` + `lib/domain/payroll.ts` | split: SQL (`getEmployeeHistory`, `getEmployeeHistoryByPosition`) → repo; pure transforms (`buildHistory`, `toMondayBased`, `isoWeek`, `EmployeeHistory` type) → domain; orchestrator `payrollService.getHistory` = repo call + `buildHistory` |
| `lib/excel-import.ts` | `lib/excel/parser.ts` | move; adapt for server-side execution (Node `Buffer` vs browser `ArrayBuffer`); keep response shape identical to what `ImportModal.tsx` expects |
| `lib/excel-export.ts` | `lib/excel/writer.ts` | move; `xlsx.writeBuffer()` stream path |
| `app/api/schedule/generate/route.ts` (inline generation rules, lines 60–202) | `lib/services/generation-service.ts` + `lib/domain/rules.ts` | lift rules out; route becomes thin HTTP wrapper; fix N+1 (one bulk `findMany` through `payrollRepo.findPayrollWindows(companyId, employeeCodes[])`) |
| `app/api/schedule/save/route.ts` | `lib/services/schedule-service.ts` | move logic; wrap delete-then-insert in `prisma.$transaction` |
| `app/api/payroll/tenants/route.ts`, `app/api/payroll/employees/route.ts` (raw SQL) | `lib/repositories/payroll-repo.ts` | move tagged-template `$queryRaw` calls; routes call `payrollService` |
| `app/api/**/*/route.ts` (all handlers) | same path | add `export const runtime = 'nodejs'` + `export const dynamic = 'force-dynamic'`; replace inline DB with service calls; enforce RBAC on mutating routes (§5); add zod body validation |
| `prisma/migration.sql` | `prisma/migrations/<timestamp>_baseline/migration.sql` | fold into managed history via `prisma migrate diff --from-empty --to-schema-datamodel` + `prisma migrate resolve --applied` on prod; follow-up migration adds PK unique index, supporting indexes, `HIALaborScheduleAudit` table, FK cascade flip |
| `next.config.ts` | same | remove `env` block (leaks `DATABASE_URL` + `JWT_SECRET` to client bundle); add `headers()` block for HSTS + frame + content-type + referrer + permissions-policy |
| `middleware.ts` | same | exact-match path allowlist (replace `startsWith('/change-password')`); add CSRF verify on mutating `/api/**`; add idle + absolute TTL check; rotate cookie on activity |
| `lib/auth-context.tsx` | same | finish JWT-expiry detection + forced logout (TODO "Force client-side logout when the JWT expires") |
| `tsconfig.json` | same | enable `noUncheckedIndexedAccess` |
| `package.json` | same | add `argon2`, `chokidar`, `pino`, `rate-limiter-flexible`, `zod`, `vitest`, `@playwright/test`, `testcontainers`, `prettier`; wire `<Toaster>` import in `app/layout.tsx` (dep already present) |

## 5. Route Audit

State of every `/api/**` handler on `audit-first-pass`. Columns: **RT** = `export const runtime = 'nodejs'`, **Dyn** = `export const dynamic = 'force-dynamic'`, **RBAC** = `getUserPermissions`/`PermissionChecker` invoked, **Validate** = zod body validation, **Svc** = logic in service layer, **Audit** = audit-log row written.

| Route | Method | Exists | RT | Dyn | RBAC | Validate | Svc | Audit | Notes |
|-------|--------|--------|----|----|------|----------|-----|-------|-------|
| `/api/auth/login` | POST | ✓ | ✗ | ✗ | — | ✗ | ✗ | ✗ | rate-limit missing |
| `/api/auth/logout` | POST | ✓ | ✗ | ✗ | — | ✗ | ✗ | ✗ | CSRF gating required |
| `/api/auth/me` | GET | ✓ | ✗ | ✗ | — | — | ✗ | — | — |
| `/api/auth/change-password` | POST | ✓ | ✗ | ✗ | — | ✗ | ✗ | ✗ | — |
| `/api/tenants` | GET | ✓ | ✗ | ✗ | ✓ | — | ✗ | — | — |
| `/api/hotels/[tenant]` | GET | ✓ | ✗ | ✗ | ✓ | — | ✗ | — | — |
| `/api/departments` | GET | ✓ | ✗ | ✗ | ✓ | — | ✗ | — | — |
| `/api/positions` | GET | ✓ | ✗ | ✗ | ✗ | — | ✗ | — | — |
| `/api/schedule` | GET | ✓ | ✗ | ✗ | ✓ | — | ✗ | — | — |
| `/api/schedule/save` | POST | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | delete-then-insert not wrapped in transaction (TODO:14) |
| `/api/schedule/add` | POST | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | — |
| `/api/schedule/lock` | POST | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | — |
| `/api/schedule/clear` | POST | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | — |
| `/api/schedule/delete` | POST | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | — |
| `/api/schedule/generate` | POST | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | N+1 in loop (TODO:15); rules inlined |
| `/api/schedule/check-locked` | POST | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | — | — |
| `/api/schedule/export` | GET | ✓ | ✗ | ✗ | ✗ | — | ✗ | — | stream, no authz (TODO:16) |
| `/api/schedule/import/preview` | POST | ✗ | — | — | — | — | — | — | **missing**; UI posts here (ImportModal) |
| `/api/schedule/import` | POST | ✗ | — | — | — | — | — | — | **missing** |
| `/api/employees` | GET | ✓ | ✗ | ✗ | ✗ | — | ✗ | — | — |
| `/api/employees/refresh` | POST | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | — |
| `/api/employees/refresh-preview` | POST | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | — | — |
| `/api/employee/update` | POST | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | — |
| `/api/users` | GET/POST | ✓ | ✗ | ✗ | ✓ (role check) | ✗ | ✗ | ✗ | — |
| `/api/users/[id]` | PATCH/DELETE | ✓ | ✗ | ✗ | ✓ (role check) | ✗ | ✗ | ✗ | — |
| `/api/payroll/tenants` | GET | ✓ | ✗ | ✗ | ✗ | — | ✗ (raw SQL inline) | — | — |
| `/api/payroll/employees` | GET | ✓ | ✗ | ✗ | ✗ | — | ✗ (raw SQL inline) | — | — |
| `/api/payroll/seed` | POST | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | — |
| `/api/health` | GET | ✓ | ✗ | ✗ | — | — | — | — | — |

Summary: 0/29 routes declare runtime pins, 0/29 use zod validation, 0/29 live behind a service layer, 0/29 write audit rows, 6/29 enforce RBAC, 2/29 missing entirely.

## 6. Next.js-Specific Concerns

### 6.1 Runtime pinning

Every `route.ts` under `app/api/**` gets `runtime = 'nodejs'` + `dynamic = 'force-dynamic'`. Every page that touches the DB gets `runtime = 'nodejs'`. Middleware runs on Node. Add a codegen or lint check to enforce.

### 6.2 Session (JWT + server-side idle / revocation)

- Cookie `auth-token`, `httpOnly`, `secure` in prod, `sameSite=lax`, `path=/`. Already wired.
- Payload includes `userId`, `email`, `role`, `mustChangePassword`, plus new `issuedAt`, `lastActivityAt`, `jti` claims.
- Idle timeout 30 min: `middleware.ts` checks `lastActivityAt` vs `now`, rotates the cookie on every authenticated request with an updated `lastActivityAt`. If stale, clears the cookie and returns 401.
- Absolute 12h: `issuedAt` vs `now`. Same handling.
- Client also detects expiry and forces logout (complete `lib/auth-context.tsx`; see TODO "Force client-side logout when the JWT expires").
- Forced logout: Redis-backed revocation list. On logout or password reset, add `jti` to a set with TTL = remaining token life. Middleware checks set membership. Phase 2 if Redis deploy is not ready.

### 6.3 CSRF (double-submit)

- `middleware.ts` sets a `csrf_token` cookie on GET requests to authenticated pages. Value is `HMAC(session_jti, server_key)` — readable by JS (not `httpOnly`) so the client can echo it.
- Client reads the cookie and sends it back as `X-CSRF-Token` on every mutating request. A `<meta name="csrf">` tag rendered by the root layout is a fallback for page-initiated forms.
- Middleware verifies on `POST`/`PUT`/`PATCH`/`DELETE` to any `/api/**` except `/api/auth/login` (rate-limit + credentials) and `/api/health`.
- Include `/api/auth/logout` in the CSRF set (open TODO "Decide whether CSRF protection is needed for logout" resolves to "yes, gate it").

### 6.4 Rate limiting

- `rate-limiter-flexible`. Memory backend in dev, Redis in prod (shared across web workers).
- `/api/auth/login`: 10/min per IP, 5/min per email (from `REBUILD_PLAN.md` §10).
- Applied before any DB call in the handler.

### 6.5 File upload (import preview)

- `/api/schedule/import/preview` uses `request.formData()` to read a single `file` field.
- Reject > 25 MB before parsing.
- Parse in-memory via `exceljs` (`lib/excel/parser.ts`); no temp file on disk.
- Response shape identical to the legacy Flask JSON (see `REBUILD_PLAN.md` §8). `components/schedule/ImportModal.tsx` already expects that shape — verify in Playwright once wired.

### 6.6 File download (export)

- `/api/schedule/export` returns `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and `Content-Disposition: attachment`.
- Body: stream from `exceljs` `xlsx.writeBuffer()`. Stream directly; do not buffer the full workbook twice.
- Must pass RBAC check (`hasScheduleAccess`) against requested scope before streaming (TODO "Add role/authorization checks to export").

### 6.7 Toast / feedback

Mount `<Toaster position="top-right" />` once in `app/layout.tsx`. Replace inline error panels and `alert()` usages in schedule and user-admin flows with `toast.success` / `toast.error`. Keep inline validation messages (field-level errors) in forms; toasts are for transient async outcomes.

### 6.8 Navigation shell

`(app)/layout.tsx` wraps everything in `AuthProvider` and `ThemeProvider`, renders `<Sidebar>` (collapsible, nav items `Schedule` + `Users`, `localStorage`-persisted collapse state is a P2 polish item), `<TopNavigation>` (user name, role chip, theme toggle, logout), and a `<main>` scroll container. Root `/` redirects to `/schedule` via `app/page.tsx`.

### 6.9 Deploy topology

- Target: self-hosted container(s).
- Two containers from one repo: `web` (Next.js standalone server, port 3000) and `worker` (`node dist/workers/watcher.js`, mounts the `populateschedule/` volume).
- `docker-compose.yml` for dev: `mssql`, `web`, `worker`, optional `redis`.
- Reverse proxy (nginx/Caddy) terminates TLS and forwards `/` to `web`. Must set `X-Forwarded-Proto` so the `secure` cookie flag is effective (TODO "Verify HTTPS handling in production").
- Rollback: keep old Flask container warm for 48h.

## 7. Database

### 7.1 Prisma client

- `lib/prisma.ts` — singleton, `globalThis` stash in dev for hot-reload safety (already in place).
- Connection string via `DATABASE_URL`. Current `next.config.ts` `env` block inlines this into the client bundle — remove it (TODO "Remove `env` block from `next.config.ts`"). Next.js reads `DATABASE_URL` from `process.env` in server code without any `env` config.
- Connection string must honor `encrypt=true` and an opt-in `trustServerCertificate=false` default. Document the flip from the legacy `TrustServerCertificate=yes` with ops before cutover.

### 7.2 Schema and migrations

- `prisma/schema.prisma` declares all models. `LaborSchedule` already has surrogate `Id` PK (added by `prisma/migration.sql`).
- Add unique index on `(UsrSystemCompanyID, EmployeeCode, ScheduleDate, PositionName)` (REBUILD_PLAN §7). **Audit for duplicates before applying** — legacy table had no PK historically.
- Add non-unique indexes on `(HotelName, ScheduleDate)`, `UsrSystemCompanyID` (single column), and `(Tenant, HotelName, DeptName)` (TODO "Add an index on (hotelName, scheduleDate) and on usrSystemCompanyId"). Verify effectiveness against an `EXPLAIN` / query plan after Phase 1; drop any that don't improve real queries.
- Add unique constraint on `BI_Payroll_Seed` natural key (TODO "Prevent duplicate rows in `app/api/payroll/seed`") OR rewrite the seed insert as `upsert` keyed on the natural key in Phase 4. Decide based on whether the table is shared with other writers; if shared, upsert is safer.
- Add `HIALaborScheduleAudit` model: `AuditID`, `ScheduleID`, `ChangedByUserID`, `ChangedAt`, `Action`, `OldJson`, `NewJson`.
- Flip assignment-table relations from `onDelete: NoAction` to `onDelete: Cascade` on `HIALaborSchedulesUsers.UserID` (REBUILD_PLAN §7).
- Adopt managed migration history:
  1. `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` — baseline.
  2. Mark applied on prod via `prisma migrate resolve --applied <baseline>` so drift matches reality.
  3. Follow-up migration adds the unique index (after dedupe), supporting indexes, audit table, FK flips.
- Run migrations from a one-shot container / job, never from app start with multiple replicas.

### 7.3 Query style

- Routes call services. Services call repositories. Repositories use the Prisma client.
- Hot paths use `prisma.$executeRaw` / `$queryRaw` with tagged-template parameters. Two existing raw-SQL sites (`app/api/payroll/tenants/route.ts`, `app/api/payroll/employees/route.ts`) migrate into `lib/repositories/payroll-repo.ts` unchanged.
- Transactions via `prisma.$transaction([...])` for multi-statement flows. Wrap the delete-then-insert in `/api/schedule/save` (TODO "Wrap the delete-then-insert flow ... in a `prisma.$transaction`") — correctness bug today, not a nicety.
- Fix the N+1 in `/api/schedule/generate` (TODO "Batch the N+1 queries in generate") by adding `payrollRepo.findPayrollWindows(companyId, employeeCodes[])` and folding `buildHistory` locally per employee.

## 8. Domain Rules Port (REBUILD_PLAN §6)

Every rule in `REBUILD_PLAN.md` §6 lives as a pure function in `lib/domain/rules.ts` (or `lib/services/generation-service.ts` for orchestration) with a table-driven unit test. Current state: `lib/schedule-utils.ts` has `calcHours`; generation rules are inlined in `app/api/schedule/generate/route.ts:60-202`; DOW math is in `lib/payroll-history.ts`. Split per §4.

"`rules.*`" = `lib/domain/rules.ts`. "`payroll.*`" = `lib/domain/payroll.ts`.

| Rule | Function |
|------|----------|
| 30-day REGULAR history window | `payrollRepo.findPayrollWindow(companyId, employeeCode)` |
| DOW averaging, skip < 0.5h | `payroll.buildHistory` (avg by DOW), `rules.shouldScheduleDow` |
| Start-time buckets (≥8 → 7am, 6–8 → 8am, <6 → 9am) | `rules.startTimeForShift` |
| 0.25h rounding | `rules.roundToQuarter` |
| Multi-position split (≥2 combos, skip < 0.25h) | `generationService.splitByPosition` |
| Lock semantics (gen → unlocked, manual → locked, `overwriteLocked`) | `scheduleService.save`, `importService.commit` |
| Dept name cleaning (`/` split, `Administrati`, `Comp Food*`) | `rules.cleanDeptName` |
| Hour calculation (HH:MM AM/PM range, overnight wrap) | `rules.calcHours` |
| RBAC hierarchy + scope | `lib/auth/rbac.ts` (folds `lib/permissions.ts`) |
| Password regex | `rules.validatePassword` (zod issue list) |
| `MustChangePassword=1` on create/reset | `userService.createUser`, `userService.resetPassword` |
| Excel template structure | `lib/excel/template.ts` |

Shared types (`Shift`, `ScheduleRow`, `EmployeeHistory`, `Role`, `Scope`) live in `lib/domain/types.ts` and are imported by both `rules.ts` and `payroll.ts`.

Regression tests pinning every rule are a cutover gate.

## 9. Excel Handling (Critical Risk Area)

Legacy workbooks are produced by openpyxl. `exceljs` cannot match byte layout. Goal is semantic parity.

1. **Feasibility spike (Phase 2).** Prove `exceljs` can produce and consume a workbook that preserves:
   - Data validation list referencing another sheet (`TimeValues!$A$1:$A$96`).
   - `TIMEVALUE` formula.
   - Sheet protection with per-cell `locked` overrides.
   - Frozen panes at `G3`.
   - Named ranges and defined column widths.
   - Conditional formatting for weekend / past-date styling if present in legacy templates.
   Output: a feasibility memo in `docs/excel-feasibility.md` with one of {proceed, proceed-with-fallback, escalate}.
2. **Server-side import.** Implement `/api/schedule/import/preview` (multipart, 25 MB cap, parse in-memory) and `/api/schedule/import` (commit). Promote `lib/excel-import.ts` to `lib/excel/parser.ts` and run server-side.
3. **Golden-file harness (`scripts/import-parity.ts`).**
   - Load 20 historical workbooks from `tests/fixtures/excel/`.
   - Run `importService.commit` against a Testcontainers MSSQL snapshot.
   - Snapshot the resulting `HIALaborSchedules` rows as JSON.
   - Compare against a baseline snapshot produced by running the legacy `populate_schedules.py` against the same DB snapshot.
   - Zero row diffs is the go/no-go gate.
4. **Round-trip check.** `export → import` of the same schedule must not mutate any row.
5. **Fallback.** If `exceljs` misses a required feature, prefer `xlsx-populate`. Last resort is shelling out to a Python sidecar inside the worker container for export only — logged as debt.

## 10. Phases

Re-sequenced from v2 to match current app state. Ordering is the **hybrid** track — cheap cleanup first, highest-risk spike in parallel, structural refactor before hardening. Phases are refactor deltas, not greenfield builds.

Size column uses T-shirt sizing, not days. Rubric: **S** = mechanical or single file set; **M** = cross-cutting refactor or new subsystem; **L** = multi-layer refactor with tests. Not calibrated to any specific team velocity — treat as relative effort only. Recalibrate after Phase 0 actual lands.

Parallel tracks:

- Phase 0 is serial, first.
- Phase 1 and Phase 2 run parallel on separate branches (no file overlap).
- Phase 2 has a hard exit gate: if the spike memo lands "escalate", stop and re-plan before starting Phase 3.
- Phases 3 → 16 are serial unless noted.

| # | Phase | Content | Size |
|---|-------|---------|------|
| 0 | Foundations | Remove `env` block from `next.config.ts`. Replace `lib/env.ts` with `lib/config.ts` (zod, fail-fast). Delete fallback secret literal. Refresh `.env.example`. Tighten `tsconfig.json` (`noUncheckedIndexedAccess`). Add Prettier + stricter ESLint. | S |
| 1 | Migrations baseline (parallel w/ 2) | Dedupe audit on `HIALaborSchedules` for candidate unique index. Baseline via `prisma migrate diff` + `resolve --applied`. Follow-up migration: unique index, supporting indexes, `HIALaborScheduleAudit` table, FK cascade flip, payroll-seed unique constraint. One-shot migrate container in compose. Verify `Dockerfile` `prisma generate` step needs no live DB and does not bake in `prisma migrate deploy` (TODO "Confirm the Dockerfile `prisma generate` step"). | S |
| 2 | Excel spike (parallel w/ 1) | Feasibility spike per §9. Memo committed to `docs/excel-feasibility.md`. Hard exit gate: `escalate` → stop and re-plan. | S |
| 3 | Domain rules extract | Split `lib/payroll-history.ts` (SQL → repo, math → domain). Lift generation rules out of `/api/schedule/generate/route.ts` into `lib/domain/rules.ts` + `lib/services/generation-service.ts`. Extract `calcHours`/`cleanDeptName` from `lib/schedule-utils.ts`. Vitest unit tests pinning every number. | M |
| 4 | Repositories + services | Create `lib/repositories/*` and `lib/services/*`. Move route logic into services. Fix `/save` transaction + `/generate` N+1. Rewrite `/api/payroll/seed` as `upsert` on natural key (TODO "Prevent duplicate rows in payroll/seed"). Review `distinct` / `groupBy` usage in `/api/employees`, `/api/positions`, `/api/departments` — rewrite as aggregations or add supporting indexes (TODO "Review distinct / groupBy usage"). Integration tests with Testcontainers MSSQL. | L |
| 5 | Runtime + validation pass | Add `runtime = 'nodejs'` + `dynamic = 'force-dynamic'` to every `/api/**` route. Add zod request-body validation. Wire `<Toaster>` in `app/layout.tsx` and replace inline error UI on mutations. | S |
| 6 | Auth hardening | `lib/session.ts` with idle / absolute TTL. CSRF double-submit middleware. `rate-limiter-flexible` on login. `argon2` upgrade-on-login path. Fix `middleware.ts` path allowlist. Complete client-side expiry handling in `lib/auth-context.tsx`. Security headers via `next.config.ts` `headers()`. | M |
| 7 | RBAC wiring | Invoke `hasScheduleAccess` (now in `lib/auth/rbac.ts`) in every mutating route: `export`, `lock`, `delete`, `clear`, `add`, `save`, `generate`, `check-locked`, `employee/update`, `employees/refresh*`, `payroll/seed`. Replace empty-array-means-unlimited convention with explicit `{ unlimited: true }` variant so "no restrictions" and "no access" are distinguishable (TODO "Replace the empty-array-means-unlimited convention"). RBAC matrix Vitest suite. | S |
| 8 | Audit log | `auditService.record` threaded through every schedule mutation and every user-admin mutation. Payload diff for `OldJson` / `NewJson`. | S |
| 9 | Excel server-side import | `/api/schedule/import/preview` + `/api/schedule/import`. Unblocks `ImportModal.tsx`. Playwright end-to-end test. | M |
| 10 | Excel export parity | Streaming + dropdowns, protection, weekend/past styling, frozen panes. Round-trip test. | M |
| 11 | Import parity harness | `scripts/import-parity.ts` with 20 real workbooks. Zero-diff gate. Only depends on Phase 9; can run in parallel with Phase 10 if capacity allows. | M |
| 12 | Watcher worker | `workers/watcher.ts` (`chokidar` → `importService`). Worker Dockerfile. Compose wiring. End-to-end file-drop integration test. | M |
| 13 | Blank-template CLI | `scripts/generate-templates.ts`. Parity check against legacy `generate_labor_schedules.py` output. | S |
| 14 | Primitives / hooks / wizard | `<Button>`, `<Spinner>`, `<Alert>`, field primitives, `<Wizard>` / `useWizard`, `<ConfirmModal>`, `<DataTable>`, `postJson`, `useEmployees`, `useToggleSet`. Not a cutover gate; schedule before or after cutover. | M |
| 15 | RBAC parity script | `scripts/rbac-parity.ts`. Run against prod user set. | S |
| 16 | Parallel deploy + cutover | 48h bake, reverse-proxy flip, legacy decom. | M |

Alternative orderings (named so they can be referenced, not described in detail): **security-first** — pull Phases 0 + 5 + 6 + 7 to the front before Phase 3/4. Chosen if incident-driven priority shifts. **risk-first** — run Phase 2 solo before anything else, park other work until the memo lands. Chosen if the Excel spike is genuinely existential. Current default assumes it is not.

## 11. Testing Strategy

- **Unit (Vitest).** Every function in `lib/domain/rules.ts` and `lib/domain/payroll.ts` has a table-driven test. Services tested with repository fakes.
- **Integration (Vitest + Testcontainers `mcr.microsoft.com/mssql/server:2022-latest`).** Each test spins up a fresh DB, runs seed fixtures from `tests/fixtures/payroll/*.json`, exercises services, asserts rows.
- **Golden-file (`scripts/import-parity.ts`).** 20 real workbooks in `tests/fixtures/excel/`. Compare row-for-row against the Python baseline snapshot.
- **RBAC matrix.** One Vitest suite enumerates `(role × scope × endpoint)` and asserts allow/deny. Same matrix fed to `scripts/rbac-parity.ts` for the live cutover check.
- **E2E (Playwright).** login → view schedule → edit a cell → save → log out; generate flow; import flow; user-admin flow. Runs against a `docker compose up` stack in CI.
- **Smoke.** `/api/health` hits DB via a trivial query, returns 200.
- **Load (optional, post-cutover).** k6 against `/api/schedule?...` for a typical tenant.

## 12. Security Requirements

Per `REBUILD_PLAN.md` §10, adapted. Items marked ⚠ are unresolved in the current repo. Phase column maps each item to the §10 phase that lands it.

| ⚠ | Item | Phase |
|---|------|-------|
| ⚠ | **Secrets hygiene.** Remove `env` block from `next.config.ts`. Replace `lib/env.ts` with `lib/config.ts` that **throws at boot** when `JWT_SECRET` or `DATABASE_URL` is missing; delete the fallback literal `'your-secret-key-change-in-production'` in `middleware.ts` + `lib/env.ts`. See `TODO.md` "Secrets bleed to client" and "JWT fallback secret" items. | 0 |
| ⚠ | **`noUncheckedIndexedAccess`** in `tsconfig.json`. | 0 |
| ⚠ | **`parseInt` guards** in auth routes. | 0 or 5 |
| ⚠ | **Runtime pins** on every `/api/**` route. | 5 |
| ⚠ | **zod validation** on every mutating request body. | 5 |
| ⚠ | **Session flags + idle 30m + absolute 12h** (§6.2). Current cookie flags are correct; idle/absolute enforcement is missing. | 6 |
| ⚠ | **CSRF middleware** on all mutating `/api/**` routes (§6.3). | 6 |
| ⚠ | **Rate limit on `/api/auth/login`** (§6.4). | 6 |
| ⚠ | **Argon2** for new hashes; verify bcrypt legacy and upgrade on next successful login. | 6 |
| ⚠ | **Tight middleware path check.** Replace `pathname.startsWith('/change-password')` in `middleware.ts` with an exact match or allowlist. | 6 |
| ⚠ | **Client-side JWT expiry handling** in `lib/auth-context.tsx`. | 6 |
| ⚠ | **Security headers** via `next.config.ts` `headers()`: HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, minimal `Permissions-Policy`. | 6 |
| ⚠ | **HTTPS handling.** Confirm reverse proxy sets `X-Forwarded-Proto` so `secure` cookie flag is effective. Ops coordination, not a code change. | 16 (cutover) |
| ⚠ | **RBAC enforcement** on `/api/schedule/export`, `/lock`, `/delete`, `/clear`, `/add`, `/save`, `/generate`, `/check-locked`, `/employee/update`, `/employees/refresh*`, `/payroll/seed`. | 7 |
| ⚠ | **Audit log** row from every service mutation (§8). | 8 |

Non-goals for v1: 2FA, SSO, forced logout without Redis. Deferred to v2 (post-cutover).

## 13. Migration and Cutover Strategy

Inherits `REBUILD_PLAN.md` §11 with these changes:

- Step 2 (schema migration): run via `prisma migrate deploy` from a one-shot migrate container. Idempotent, logged. Never run from `next start`.
- Step 3 (regression harness): `scripts/import-parity.ts`, zero row diffs across 20 workbooks.
- Step 4 (RBAC parity): `scripts/rbac-parity.ts` — enumerates `(user, tenant, hotel, dept)` visibility under old Flask vs new Next.js, asserts set equality.
- Step 5 (watcher swap): stop `populate_schedules.py`, start `workers/watcher.ts`. Move any `.xlsx` sitting in `populateschedule/` (not in `processed/` or `imported/`) to a side folder before the swap so nothing is double-processed.
- Step 6 (web swap): reverse-proxy flip from Flask container to Next.js container. Keep Flask warm for 48h rollback.
- Step 7 (decommission): archive old repo; keep SOP docx and `generate_sop.py` in the archive — regeneration is a phase-2 concern.

## 14. Risks and Open Questions

- **Excel feature coverage (highest risk).** `exceljs` may miss a detail the downstream consumer depends on. Mitigation: Phase 2 spike de-risks this. Fallback: `xlsx-populate` or a Python export sidecar, accepted as debt.
- **Import endpoints currently wired to a UI that has no server.** `components/schedule/ImportModal.tsx` posts to `/api/schedule/import/preview` and `/api/schedule/import`; both 404 today. Until Phase 9 lands, the Import button in the UI is broken end-to-end.
- **No tests today.** Adding a test framework mid-flight risks drift while tests are being back-filled. Mitigation: gate every subsequent phase on the rules added in Phase 3 + the services added in Phase 4 having passing tests before the next phase starts.
- **JWT without idle/absolute enforcement.** Today a token valid at issue remains usable for its full signed lifetime regardless of activity. Phase 6 closes this.
- **Duplicate rows in `HIALaborSchedules`.** Legacy table has no PK historically. Adding the unique index on `(UsrSystemCompanyID, EmployeeCode, ScheduleDate, PositionName)` fails if dupes exist. Audit before Phase 1 migration; dedupe if <1% dupes, otherwise ship non-unique and log a follow-up.
- **`TrustServerCertificate` flip.** Default `false` breaks prod if the SQL Server cert isn't trusted. Confirm with ops; ship the env override with the new default explicit in prod config.
- **`%#I` strftime equivalent.** Python `%#I` is Windows-only; the port uses `date-fns` `format(d, 'h:mm a')`, cross-platform, no workaround needed. Verify in the golden-file harness.
- **Prisma migration diff vs live schema.** The legacy table is missing an `Id` column the current `schema.prisma` declares. The ad-hoc `prisma/migration.sql` adds it; the baseline migration must reproduce exactly what was applied to prod or `prisma migrate` will attempt a destructive re-baseline.
- **Single Prisma pool across route handlers.** Under high concurrency the pool must be sized to match handler throughput. Tune after a load test.
- **Sidebar collapse state** lives in React state only and resets on navigation. `localStorage` persistence is a P2 polish item, not part of v1 parity.

## 15. Out of Scope, Logged for Later

Labels: **v2** = post-cutover follow-up release. **opportunistic** = land when convenient, no owner. **v3+** = longer horizon.

- Audit log viewer UI (v2).
- Async job queue for large imports (v2).
- 2FA / SSO (v2).
- Redis-backed session revocation for forced logout (v2 if Redis isn't available at cutover).
- `@tanstack/react-query` migration (opportunistic).
- `react-hook-form` + zod resolver on user admin forms (opportunistic).
- Schedule conflict detection, notifications, shift templates (v3+).
- Move off SQL Server (not planned).
- `generate_sop.py` docx regeneration — archived, not ported.
- Sidebar collapse persistence + breadcrumb in top nav (UX polish, post-cutover).

---

**Definition of done.** The Next.js container and the new worker container together serve all legacy routes and process file drops identically to the Flask app. `scripts/import-parity.ts` shows zero row diffs across 20 historical workbooks. `scripts/rbac-parity.ts` shows zero scope diffs across all existing users. The legacy Flask container and the legacy Python daemon are turned off. 48 hours of clean audit-log entries from real users.

Stretch (not cutover gates): Lighthouse on the schedule editor page ≥ 80 performance and ≥ 95 accessibility. Measure once post-cutover; log regressions, don't block release on them.
