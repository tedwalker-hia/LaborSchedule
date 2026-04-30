# Amplify Deployment Caveats

Source: build failure analysis 2026-04-30 (commits `ceb3ae9`, `11d0a26`).
Tracks Amplify Hosting + Next.js + Prisma + Redis pitfalls beyond the
immediate build-log errors.

## Status snapshot (2026-04-30)

| Item | Status |
|------|--------|
| A. Tailwind/devDeps | Resolved (`ceb3ae9`) |
| B. TypeScript/devDeps | Resolved (`11d0a26`) |
| 1. Prisma binary target | Resolved (`<pending commit>`) |
| 2. Env vars / SSM | Resolved — populated via Amplify Console |
| 9. Node 20 pin | Resolved — `nvm use 20` in `amplify.yml` |
| 3. jose / edge runtime | Open — verify on first runtime smoke-test |
| 4. Redis VPC reachability | Open — depends on Redis host |
| 5. DB connection pooling (SQL Server) | Open — see notes below |
| 6. Argon2 native binary | Open — verify post-deploy |
| 7. `sharp` for `next/image` | Not in scope yet |

## Build-time issues (resolved or in flight)

### A. Tailwind v4 + devDependencies (resolved — `ceb3ae9`)

- **Symptom:** `Cannot find module '@tailwindcss/postcss'` during
  `next build` PostCSS pass.
- **Cause:** Build deps lived in `devDependencies`. Amplify install runs
  with `NODE_ENV=production`, dropping devDeps.
- **Fix applied:** Moved `@tailwindcss/postcss`, `tailwindcss`, `daisyui`
  from `devDependencies` to `dependencies`.

### B. Missing `@types/*` and TypeScript at build time (resolved — `11d0a26`)

- **Symptom:** `It looks like you're trying to use TypeScript but do not
  have the required package(s) installed. Please install @types/react
  and @types/node...`
- **Cause:** Same `NODE_ENV=production` dropping devDeps.
- **Fix applied:** Added `amplify.yml` that exports
  `NODE_ENV=development` and `NPM_CONFIG_PRODUCTION=false` for the
  install phase, then restores `NODE_ENV=production` for the build.
- **Optional follow-up:** Could revert `ceb3ae9` once `amplify.yml`
  proven stable (devDeps now installed unconditionally), but harmless to
  leave Tailwind in `dependencies`.

## Runtime issues (likely to bite next)

### 1. Prisma binary target (resolved)

- Amplify build image is Amazon Linux 2023 → Prisma engine needs
  `rhel-openssl-3.0.x` binary or runtime fails with
  `PrismaClientInitializationError: Query engine library for current
  platform "rhel-openssl-3.0.x" could not be found`.
- **Fix applied:** `prisma/schema.prisma` `generator client` now lists
  `binaryTargets = ["native", "rhel-openssl-3.0.x"]`. Verified locally:
  `node_modules/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node`
  is generated.

### 2. SSM secrets path empty (resolved via Console env vars)

- Build log: `Failed to set up process.env.secrets`, path
  `/amplify/d2k311ev8ppndo/main/`.
- **Status:** Env vars populated via Amplify Console → App settings →
  Environment variables. Console-injected vars are independent of the
  SSM path lookup, so the build-log warning may persist but is harmless
  as long as `process.env.DATABASE_URL`, JWT secret, Redis URL, etc.
  resolve at runtime. Smoke-test via `/api/health` post-deploy to
  confirm.
- If we ever want the SSM warning gone: populate SSM at
  `/amplify/d2k311ev8ppndo/main/` and grant the Amplify role
  `ssm:GetParametersByPath`.

### 3. Edge runtime + `jose` JWE compression

- Warnings during build:
  `A Node.js API is used (CompressionStream / DecompressionStream)
  which is not supported in the Edge Runtime` — pulled in via
  `lib/session.ts` → `jose/dist/webapi/...`.
- If `middleware.ts` imports `lib/session.ts`, the edge bundle will
  attempt to load these APIs and fail at runtime in some environments.
- **Fix options:**
  - Force Node runtime for middleware:
    ```ts
    export const config = { runtime: 'nodejs', /* matcher etc. */ };
    ```
  - Or avoid `jose` JWE compression code paths (use compact JWS only).

### 4. Redis (ioredis) connectivity

- Amplify Compute runs in an AWS-managed VPC. It cannot reach private
  ElastiCache / RDS without an explicit VPC connector.
- **Fix options:**
  - Use a public Redis (Upstash, Redis Cloud) with TLS + auth.
  - Configure VPC connectivity (well supported in Amplify Gen 2; Gen 1
    is limited).

### 5. Database connection storm (Prisma + serverless, SQL Server)

- DB is SQL Server (`prisma/schema.prisma` datasource provider =
  `sqlserver`), not Postgres — RDS Proxy / PgBouncer advice does not
  apply directly.
- Each Lambda warm pool still opens its own Prisma pool. SQL Server
  connection caps are typically generous (default 32767) but per-DB
  limits + memory per connection still matter.
- **Mitigations:**
  - Set `DATABASE_URL` with `?connectionLimit=1&poolTimeout=20`
    (Prisma SQL Server URL params).
  - Watch SQL Server `sys.dm_exec_connections` after first traffic.
  - If pooling becomes an issue, front with a proxy that speaks TDS
    (less common — most teams just tune connection limit per Lambda).

### 6. Native modules — `@node-rs/argon2`

- Rust prebuilt; needs the correct platform tarball (Linux x64 GNU).
- **Verify post-install:** `node_modules/@node-rs/argon2-linux-x64-gnu`
  exists.
- **Fallback:** `bcryptjs` is already a dep; switch hashing path if
  argon2 binary fails.

### 7. Image optimization (`sharp`)

- If `next/image` is used at runtime, Amplify Compute needs `sharp`
  available. Add `sharp` to `dependencies` if image optimization is in
  scope.

### 8. `output: 'standalone'`

- Already set in `next.config.ts`. Amplify Hosting Compute supports it.
- Watch artifact path: with standalone, Amplify normally auto-detects.
  If a deploy ever produces a 404 on every route, double-check
  `amplify.yml` `baseDirectory` and the standalone output layout.

### 9. Node version (resolved)

- `package.json` engines: `>=20`. Amplify default build image used to
  ship Node 18.
- **Fix applied:** `amplify.yml` preBuild now runs
  `nvm use 20 || nvm install 20` then `node -v`. Verify the printed
  Node version on the next build log.
- Alternative (if `nvm` ever missing from build image): pin Node 20 via
  Amplify Console → Build settings → Build image settings.

### 10. Middleware bundle size

- Edge middleware capped at ~1 MB. Currently
  `ƒ Middleware  66.9 kB` — fine.
- Re-check after adding session/JWT logic, feature flags, etc.

### 11. Build memory / time

- Currently 8 GiB / 4 vCPU / 128 GB disk. Adequate for current build.
- If OOM later (Prisma generate + large Next build), bump compute size
  in Amplify Console.

### 12. CSP `connect-src 'self'`

- `next.config.ts` sets a strict `connect-src 'self'`. Blocks any
  external fetches from the browser (Upstash REST, analytics, Sentry,
  etc.).
- Adjust the directive when integrating any external origin.

### 13. CodeBuild artifact location

- `amplify.yml` `baseDirectory: .next`. Amplify Hosting Compute handles
  standalone Next.js automatically.
- If switching to static export later, change to `out`.

## Action priority

1. **Pre-runtime (done):**
   - ~~#1 Prisma binary target~~ — fixed in schema.
   - ~~#2 Populate env vars / SSM secrets~~ — done via Amplify Console.
   - ~~#9 Pin Node 20 in build image~~ — fixed in `amplify.yml`.
2. **At runtime smoke-test (next):**
   - #3 Middleware edge runtime / `jose`.
   - #4 Redis connectivity.
   - #5 DB connection pooling.
3. **Hardening / nice-to-haves:**
   - #6 Argon2 binary verify.
   - #7 `sharp` if `next/image` used.
   - #12 CSP review when adding external origins.

## Smoke-test checklist (post-deploy)

- Hit `/api/health` — confirms env vars + DB reachable.
- Login flow — confirms `lib/session.ts` / jose works (catches #3).
- Any Redis-backed action — rate limiter, queue (catches #4).
- Tail Amplify logs for `PrismaClientInitializationError`,
  `argon2`, `ECONNREFUSED`, `EAI_AGAIN`.

## Related commits

- `ceb3ae9` — `fix(build): move tailwind build deps to dependencies for Amplify`
- `11d0a26` — `fix(build): add amplify.yml forcing dev deps install`
- `<pending>` — `fix(deploy): pin Node 20 + Prisma rhel binary target`
