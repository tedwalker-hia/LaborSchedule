/**
 * Generates a blank schedule Excel template for a given tenant/hotel/date range.
 * Wraps lib/excel/template.ts; fetches the employee list from BI_Payroll via payrollService.
 *
 * Usage:
 *   npx tsx scripts/generate-templates.ts \
 *     --tenant <usrSystemCompanyId> \
 *     --hotel  <display name> \
 *     --start  YYYY-MM-DD \
 *     --end    YYYY-MM-DD \
 *     --out    <path/to/output.xlsx> \
 *     [--dept  <dept name>]
 *
 * Requires DATABASE_URL (and JWT_SECRET) in the shell environment.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import '../lib/config.ts'; // validate env vars early
import { generateBlankTemplate } from '../lib/excel/template.ts';
import { makePayrollService } from '../lib/services/payroll-service.ts';

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

interface Args {
  tenant: string;
  hotel: string;
  dept: string | undefined;
  start: string;
  end: string;
  out: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);

  function get(flag: string): string | undefined {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  }

  const tenant = get('--tenant');
  const hotel = get('--hotel');
  const dept = get('--dept');
  const start = get('--start');
  const end = get('--end');
  const out = get('--out');

  const missing: string[] = [];
  if (!tenant) missing.push('--tenant');
  if (!hotel) missing.push('--hotel');
  if (!start) missing.push('--start');
  if (!end) missing.push('--end');
  if (!out) missing.push('--out');

  if (missing.length > 0) {
    console.error(`Missing required arguments: ${missing.join(', ')}`);
    console.error(
      'Usage: npx tsx scripts/generate-templates.ts' +
        ' --tenant <code> --hotel <name> --start YYYY-MM-DD --end YYYY-MM-DD --out <path>' +
        ' [--dept <dept>]',
    );
    process.exit(1);
  }

  return { tenant: tenant!, hotel: hotel!, dept, start: start!, end: end!, out: out! };
}

// ---------------------------------------------------------------------------
// Date range
// ---------------------------------------------------------------------------

function buildDateRange(start: string, end: string): Date[] {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);

  if (isNaN(s.getTime())) throw new Error(`Invalid --start: ${start}`);
  if (isNaN(e.getTime())) throw new Error(`Invalid --end: ${end}`);
  if (s > e) throw new Error(`--start must be ≤ --end (got ${start} > ${end})`);

  const dates: Date[] = [];
  const cur = new Date(s);
  while (cur <= e) {
    dates.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { tenant, hotel, dept, start, end, out } = parseArgs();

  let dates: Date[];
  try {
    dates = buildDateRange(start, end);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const svc = makePayrollService();
  const allEmployees = await svc.listEmployees({ usrSystemCompanyId: tenant });

  const employees = dept ? allEmployees.filter((e) => e.deptName === dept) : allEmployees;

  const buffer = await generateBlankTemplate({
    hotel,
    dates,
    employees: employees.map((e) => ({
      code: e.employeeCode,
      firstName: e.firstName,
      lastName: e.lastName,
      deptName: e.deptName,
      positionName: e.positionName,
    })),
  });

  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, buffer);

  console.log(`Written: ${out} (${employees.length} employees, ${dates.length} days)`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
