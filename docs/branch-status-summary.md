# Labor Schedule rewrite — status

**Branch:** `audit-first-pass`. **Date:** 2026-04-22. Not yet merged to `main`.

## Why this branch exists

The Flask → Next.js rewrite landed on `main` but wasn't production-ready. Audit found: missing Excel import endpoints, secrets leaked into the client bundle, a hard-coded fallback JWT secret, RBAC checks written but never called, a broken save path (no transaction), and zero tests. This branch is the cleanup.

## What's done

| Phase | What | Status |
|---|---|---|
| 0 | Foundations: zod env loader, Prettier, strict ESLint/TS | done |
| 1 | Prisma migrations baseline + dedupe + cascade FKs | done |
| 2 | Excel feasibility spike — `exceljs` verdict = go | done |
| 3 | Domain rules extracted to `lib/domain/`, unit tests | done |
| 4 | Service + repository layering, transaction fix, N+1 fix | ~95% done (7 failing tests, integration tests uncommitted) |

**Test coverage today:** 142 of 149 unit tests passing.

## What's next

| Phase | What | Why it matters |
|---|---|---|
| 5 | Runtime pins + zod request validation + toast UI | Prevents bad input reaching services; consistent error feedback |
| 6 | Auth hardening: session TTL, CSRF, login rate limit, argon2 | Closes the audit security gaps |
| 7 | RBAC wiring into every mutating route | Currently unenforced; this is a production blocker |
| 8 | Audit log on every mutation | Compliance + forensics |
| 9 | Excel import endpoints (`/api/schedule/import`) | Import button in UI currently 404s |
| 10 | Excel export parity (formulas, protection, styling) | Match legacy output byte-for-byte |
| 11 | Import parity harness — 20 real workbooks, zero diff | Cutover gate |
| 12 | File-watcher worker (replaces legacy Python `populate_schedules.py`) | Restores lost automation |
| 13 | Blank-template CLI (replaces `generate_labor_schedules.py`) | Restores lost automation |
| 14 | Shared UI primitives + wizard refactor | Cleanup; not a cutover gate |
| 15 | RBAC parity script against prod users | Cutover gate |
| 16 | Parallel deploy + 48h bake + reverse-proxy cutover | Go live |

Phases 5–8 are the remaining security and correctness work. Phases 9–13 restore functionality that was dropped in the original rewrite. Phases 14–16 are cutover.

## Bottom line

No new user features on this branch — it's de-risking the cutover. Security holes closed, correctness bugs fixed, testable code in place. Roughly halfway through the full refactor plan; the remaining phases are scoped and sequenced in `docs/rewrite-plan.md`.
