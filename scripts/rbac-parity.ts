/**
 * RBAC parity harness: enumerates (tenant, hotel, dept) visibility for all
 * active users via the Next.js PermissionChecker and optionally compares
 * against the legacy Flask scope enumeration endpoint.
 *
 * Usage:
 *   node --experimental-strip-types scripts/rbac-parity.ts              # compare
 *   node --experimental-strip-types scripts/rbac-parity.ts --nextjs-only # skip Flask
 *   node --experimental-strip-types scripts/rbac-parity.ts --inject-divergence # test non-zero exit
 *
 * Env vars:
 *   DATABASE_URL       Production DB connection string (read-only)
 *   FLASK_BASE_URL     Legacy Flask base URL, e.g. http://localhost:5000
 *   FLASK_ADMIN_TOKEN  Bearer token for Flask /api/rbac/scope endpoint
 *
 * Flask endpoint contract:
 *   GET {FLASK_BASE_URL}/api/rbac/scope?userId={id}
 *   Response: { unlimited: true } | { tuples: { tenant, hotelName, deptName }[] }
 *
 * Output:
 *   stdout  machine-parseable JSON
 *   stderr  human-readable progress + summary
 *
 * Exit codes: 0 = no diffs, 1 = diffs found, 2 = fatal error
 */

import { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Inline copy of PermissionChecker from lib/auth/rbac.ts.
// Excluded: getUserPermissions (imports @/lib/prisma, unresolvable in scripts).
// Keep in sync with lib/auth/rbac.ts when RBAC logic changes.
// ---------------------------------------------------------------------------

type Role = 'SuperAdmin' | 'CompanyAdmin' | 'HotelAdmin' | 'DeptAdmin';

interface UserForChecker {
  userId: number;
  role: Role;
  isActive: boolean;
  tenants: { tenant: string }[];
  hotels: {
    tenant: string;
    hotelName: string;
    usrSystemCompanyId: string | null;
    branchId: number | null;
  }[];
  departments: { tenant: string; hotelName: string; deptName: string }[];
}

class PermissionChecker {
  constructor(private user: UserForChecker) {}

  isSuperAdmin(): boolean {
    return this.user.role === 'SuperAdmin';
  }

  hasScheduleAccess(target: {
    hotel?: string | null;
    tenant?: string | null;
    dept?: string;
  }): boolean {
    if (this.isSuperAdmin()) return true;

    const { hotel, tenant, dept } = target;

    if (!hotel) {
      return (
        this.user.tenants.length > 0 ||
        this.user.hotels.length > 0 ||
        this.user.departments.length > 0
      );
    }

    if (this.user.role === 'CompanyAdmin') {
      if (this.user.hotels.some((h) => h.hotelName === hotel)) return true;
      if (tenant) {
        return this.user.tenants.some((t) => t.tenant === tenant);
      }
      return false;
    }

    if (this.user.role === 'HotelAdmin') {
      return this.user.hotels.some((h) => h.hotelName === hotel);
    }

    if (this.user.role === 'DeptAdmin' && dept) {
      return this.user.departments.some((d) => d.hotelName === hotel && d.deptName === dept);
    }

    return false;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScopeTuple {
  tenant: string;
  hotelName: string;
  deptName: string; // empty string = hotel-level (no dept constraint)
}

interface UserRecord {
  userId: number;
  email: string;
  role: string;
  isActive: boolean;
  tenants: { tenant: string }[];
  hotels: {
    tenant: string;
    hotelName: string;
    usrSystemCompanyId: string | null;
    branchId: number | null;
  }[];
  departments: { tenant: string; hotelName: string; deptName: string }[];
}

interface UserDiff {
  userId: number;
  email: string;
  onlyInNextjs: string[];
  onlyInFlask: string[];
}

interface ParityResult {
  timestamp: string;
  userCount: number;
  mode: 'full' | 'nextjs-only';
  diffs: UserDiff[];
  summary: {
    usersChecked: number;
    usersWithDiffs: number;
    totalExtraTuples: number;
  };
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ARGV = new Set(process.argv.slice(2));
const NEXTJS_ONLY = ARGV.has('--nextjs-only');
const INJECT_DIVERGENCE = ARGV.has('--inject-divergence');
const CONCURRENCY = 8;

const FLASK_BASE_URL = process.env.FLASK_BASE_URL;
const FLASK_ADMIN_TOKEN = process.env.FLASK_ADMIN_TOKEN;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tupleKey(t: ScopeTuple): string {
  return `${t.tenant}::${t.hotelName}::${t.deptName}`;
}

function setDiff(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((x) => !b.has(x)).sort();
}

function log(msg: string): void {
  process.stderr.write(msg + '\n');
}

function warn(msg: string): void {
  process.stderr.write(`[warn] ${msg}\n`);
}

function buildNextjsScope(user: UserRecord, universe: ScopeTuple[]): Set<string> | 'unlimited' {
  const checker = new PermissionChecker({
    userId: user.userId,
    role: user.role as Role,
    isActive: user.isActive,
    tenants: user.tenants,
    hotels: user.hotels,
    departments: user.departments,
  });

  if (checker.isSuperAdmin()) return 'unlimited';

  const result = new Set<string>();
  for (const tuple of universe) {
    if (
      checker.hasScheduleAccess({
        hotel: tuple.hotelName,
        tenant: tuple.tenant,
        dept: tuple.deptName || undefined,
      })
    ) {
      result.add(tupleKey(tuple));
    }
  }
  return result;
}

async function fetchFlaskScope(userId: number): Promise<Set<string> | 'unlimited'> {
  const url = `${FLASK_BASE_URL}/api/rbac/scope?userId=${userId}`;
  const headers: Record<string, string> = {};
  if (FLASK_ADMIN_TOKEN) headers['Authorization'] = `Bearer ${FLASK_ADMIN_TOKEN}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Flask scope fetch failed userId=${userId}: HTTP ${res.status}`);
  }

  const data = (await res.json()) as { unlimited?: boolean; tuples?: ScopeTuple[] };
  if (data.unlimited) return 'unlimited';
  if (!data.tuples) throw new Error(`Flask response missing 'tuples' for userId=${userId}`);
  return new Set<string>(data.tuples.map(tupleKey));
}

function diffScopes(
  nextjs: Set<string> | 'unlimited',
  flask: Set<string> | 'unlimited',
): { onlyInNextjs: string[]; onlyInFlask: string[] } {
  if (nextjs === 'unlimited' && flask === 'unlimited') {
    return { onlyInNextjs: [], onlyInFlask: [] };
  }
  if (nextjs === 'unlimited') return { onlyInNextjs: ['__UNLIMITED__'], onlyInFlask: [] };
  if (flask === 'unlimited') return { onlyInNextjs: [], onlyInFlask: ['__UNLIMITED__'] };
  return { onlyInNextjs: setDiff(nextjs, flask), onlyInFlask: setDiff(flask, nextjs) };
}

async function runBatch<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const worker = async (): Promise<void> => {
    while (i < items.length) {
      const item = items[i++]!;
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const prisma = new PrismaClient({ log: ['error'] });

  try {
    log('Loading active users...');
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: {
        userId: true,
        email: true,
        role: true,
        isActive: true,
        tenants: { select: { tenant: true } },
        hotels: {
          select: {
            tenant: true,
            hotelName: true,
            usrSystemCompanyId: true,
            branchId: true,
          },
        },
        departments: { select: { tenant: true, hotelName: true, deptName: true } },
      },
      orderBy: { email: 'asc' },
    });
    log(`  ${users.length} active user(s)`);

    log('Building scope universe...');
    const [rawHotels, rawDepts] = await Promise.all([
      prisma.userHotel.findMany({ select: { tenant: true, hotelName: true } }),
      prisma.userDept.findMany({ select: { tenant: true, hotelName: true, deptName: true } }),
    ]);

    const universeMap = new Map<string, ScopeTuple>();
    for (const h of rawHotels) {
      const t: ScopeTuple = { tenant: h.tenant, hotelName: h.hotelName, deptName: '' };
      universeMap.set(tupleKey(t), t);
    }
    for (const d of rawDepts) {
      const t: ScopeTuple = { tenant: d.tenant, hotelName: d.hotelName, deptName: d.deptName };
      universeMap.set(tupleKey(t), t);
    }
    const universe = [...universeMap.values()];
    log(`  ${universe.length} distinct (tenant, hotel, dept) tuples in universe`);

    const mode: 'full' | 'nextjs-only' = !NEXTJS_ONLY && FLASK_BASE_URL ? 'full' : 'nextjs-only';
    if (mode === 'nextjs-only' && !NEXTJS_ONLY) {
      warn('FLASK_BASE_URL not set — running nextjs-only (no Flask comparison)');
    }
    if (INJECT_DIVERGENCE) {
      warn(
        '--inject-divergence active — a synthetic diff will be appended to verify non-zero exit',
      );
    }
    log(`Mode: ${mode}`);

    const diffs: UserDiff[] = [];

    await runBatch(users as UserRecord[], CONCURRENCY, async (user) => {
      const nextjsScope = buildNextjsScope(user, universe);

      if (mode === 'full') {
        const flaskScope = await fetchFlaskScope(user.userId);
        const { onlyInNextjs, onlyInFlask } = diffScopes(nextjsScope, flaskScope);
        if (onlyInNextjs.length > 0 || onlyInFlask.length > 0) {
          diffs.push({ userId: user.userId, email: user.email, onlyInNextjs, onlyInFlask });
        }
      }
      // nextjs-only: enumerate without comparison (validates enumeration runs clean)
    });

    // Inject a synthetic diff after real processing to verify non-zero exit behavior.
    if (INJECT_DIVERGENCE && users.length > 0) {
      const target = users[0]!;
      diffs.push({
        userId: target.userId,
        email: target.email,
        onlyInNextjs: ['__INJECTED__::fake-hotel::fake-dept'],
        onlyInFlask: [],
      });
    }

    const result: ParityResult = {
      timestamp: new Date().toISOString(),
      userCount: users.length,
      mode,
      diffs,
      summary: {
        usersChecked: users.length,
        usersWithDiffs: diffs.length,
        totalExtraTuples: diffs.reduce(
          (n, d) => n + d.onlyInNextjs.length + d.onlyInFlask.length,
          0,
        ),
      },
    };

    process.stdout.write(JSON.stringify(result, null, 2) + '\n');

    log('');
    log('=== RBAC Parity Summary ===');
    log(`Mode:          ${mode}`);
    log(`Users checked: ${result.summary.usersChecked}`);
    log(`Diffs found:   ${result.summary.usersWithDiffs}`);

    if (diffs.length > 0) {
      log('');
      for (const d of diffs) {
        log(`  ${d.email} (userId=${d.userId})`);
        for (const t of d.onlyInNextjs) log(`    + nextjs: ${t}`);
        for (const t of d.onlyInFlask) log(`    - flask:  ${t}`);
      }
    }

    log('');
    if (diffs.length === 0) {
      log('OK: zero diffs');
      process.exit(0);
    } else {
      log('FAIL: diffs detected — see above');
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`[fatal] ${String(err)}\n`);
  if (err instanceof Error && err.stack) process.stderr.write(err.stack + '\n');
  process.exit(2);
});
