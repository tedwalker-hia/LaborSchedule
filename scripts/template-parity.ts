/**
 * Template parity harness. Generates blank schedule templates via
 * generateBlankTemplate() and asserts the workbook structure matches
 * expected semantic features: employee list, date headers, time dropdowns,
 * sheet protection, and hidden TimeValues sheet.
 *
 * No database or containers required — uses synthetic fixture employees
 * mirrored from scripts/generate-fixtures.py.
 *
 * Usage:
 *   node --experimental-strip-types scripts/template-parity.ts
 *
 * Invoke explicitly via:
 *   npm run parity:template
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { generateBlankTemplate } from '../lib/excel/template.ts';

// createRequire bypasses ESM/CJS interop issues with exceljs when loading
// through a chain of --experimental-strip-types TypeScript modules.
const _require = createRequire(fileURLToPath(import.meta.url));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ExcelJS = _require('exceljs') as typeof import('exceljs');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Employee {
  code: string;
  firstName: string;
  lastName: string;
  deptName: string;
  positionName: string;
}

interface TestCase {
  name: string;
  hotel: string;
  employees: Employee[];
  dates: Date[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDateRange(start: string, end: string): Date[] {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  const dates: Date[] = [];
  const cur = new Date(s);
  while (cur <= e) {
    dates.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

// Mirrors formatDateHeader() in lib/excel/writer.ts (local-time getters).
function expectedDateHeader(date: Date): string {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const mon = months[date.getMonth()]!;
  const day = date.getDate().toString().padStart(2, '0');
  const dow = days[date.getDay()]!;
  return `${mon} ${day} (${dow})`;
}

// ---------------------------------------------------------------------------
// Test cases — synthetic employees mirrored from generate-fixtures.py SPECS
// ---------------------------------------------------------------------------

const TEST_CASES: TestCase[] = [
  {
    name: 'alpha-fnb-w02 (8 employees, 7 days)',
    hotel: 'Alpha Hotel',
    dates: buildDateRange('2026-01-06', '2026-01-12'),
    employees: [
      {
        code: 'ALPHA-001',
        firstName: 'John',
        lastName: 'Smith',
        deptName: 'F&B',
        positionName: 'Server',
      },
      {
        code: 'ALPHA-002',
        firstName: 'Mary',
        lastName: 'Johnson',
        deptName: 'F&B',
        positionName: 'Bartender',
      },
      {
        code: 'ALPHA-003',
        firstName: 'Robert',
        lastName: 'Williams',
        deptName: 'F&B',
        positionName: 'Host',
      },
      {
        code: 'ALPHA-004',
        firstName: 'Patricia',
        lastName: 'Brown',
        deptName: 'F&B',
        positionName: 'Busser',
      },
      {
        code: 'ALPHA-005',
        firstName: 'Michael',
        lastName: 'Jones',
        deptName: 'Housekeeping',
        positionName: 'Room Attendant',
      },
      {
        code: 'ALPHA-006',
        firstName: 'Linda',
        lastName: 'Garcia',
        deptName: 'Housekeeping',
        positionName: 'Laundry',
      },
      {
        code: 'ALPHA-007',
        firstName: 'David',
        lastName: 'Martinez',
        deptName: 'Maintenance',
        positionName: 'Engineer',
      },
      {
        code: 'ALPHA-008',
        firstName: 'Barbara',
        lastName: 'Rodriguez',
        deptName: 'F&B',
        positionName: 'Server',
      },
    ],
  },
  {
    name: 'beta-frontdesk-w04 (3 employees, 7 days)',
    hotel: 'Beta Hotel',
    dates: buildDateRange('2026-01-20', '2026-01-26'),
    employees: [
      {
        code: 'BETA-001',
        firstName: 'Richard',
        lastName: 'Wilson',
        deptName: 'Front Desk',
        positionName: 'Agent',
      },
      {
        code: 'BETA-002',
        firstName: 'Maria',
        lastName: 'Anderson',
        deptName: 'Front Desk',
        positionName: 'Supervisor',
      },
      {
        code: 'BETA-003',
        firstName: 'Charles',
        lastName: 'Taylor',
        deptName: 'Concierge',
        positionName: 'Concierge',
      },
    ],
  },
  {
    name: 'delta-lean-w16 (3 employees, 5 days)',
    hotel: 'Delta Inn',
    dates: buildDateRange('2026-04-14', '2026-04-18'),
    employees: [
      {
        code: 'DELTA-003',
        firstName: 'Matthew',
        lastName: 'Wright',
        deptName: 'Front Desk',
        positionName: 'Agent',
      },
      {
        code: 'DELTA-007',
        firstName: 'Mark',
        lastName: 'Green',
        deptName: 'Maintenance',
        positionName: 'Engineer',
      },
      {
        code: 'DELTA-008',
        firstName: 'Rebecca',
        lastName: 'Adams',
        deptName: 'Front Desk',
        positionName: 'Supervisor',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Assertion
// ---------------------------------------------------------------------------

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// ---------------------------------------------------------------------------
// Per-case verification
// ---------------------------------------------------------------------------

async function verifyTemplate(tc: TestCase): Promise<void> {
  const buffer = await generateBlankTemplate({
    hotel: tc.hotel,
    dates: tc.dates,
    employees: tc.employees,
  });

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);

  // ----- Sheet existence ---------------------------------------------------
  const ws = wb.getWorksheet('Labor Schedule');
  assert(ws != null, 'Missing worksheet "Labor Schedule"');

  const tvSheet = wb.getWorksheet('TimeValues');
  assert(tvSheet != null, 'Missing worksheet "TimeValues"');
  assert(tvSheet!.state === 'hidden', '"TimeValues" sheet must be hidden');

  // ----- TimeValues content (96 quarter-hour entries) ----------------------
  const tvCount = tvSheet!.actualRowCount;
  assert(tvCount === 96, `TimeValues: expected 96 rows, got ${tvCount}`);

  // ----- Sheet protection --------------------------------------------------
  const protection = ws!.sheetProtection;
  assert(protection != null, 'Sheet "Labor Schedule" must be protected');

  // ----- Row 1: date headers -----------------------------------------------
  const FIXED_COLS = 5;
  for (let di = 0; di < tc.dates.length; di++) {
    const expectedHeader = expectedDateHeader(tc.dates[di]!);
    const baseCol = FIXED_COLS + di * 3 + 1;
    const cell = ws!.getCell(1, baseCol);
    // Merged cells: master cell holds value; others return undefined.
    const actual = String(cell.value ?? '');
    assert(
      actual === expectedHeader,
      `Row 1 date header col ${baseCol}: expected "${expectedHeader}", got "${actual}"`,
    );
  }

  // ----- Row 2: sub-headers In / Out / Hrs ---------------------------------
  const SUB_LABELS = ['In', 'Out', 'Hrs'];
  for (let di = 0; di < tc.dates.length; di++) {
    const baseCol = FIXED_COLS + di * 3 + 1;
    for (let si = 0; si < 3; si++) {
      const cell = ws!.getCell(2, baseCol + si);
      const actual = String(cell.value ?? '');
      assert(
        actual === SUB_LABELS[si],
        `Row 2 sub-header col ${baseCol + si}: expected "${SUB_LABELS[si]}", got "${actual}"`,
      );
    }
  }

  // ----- Rows 3+: employee data and dropdowns ------------------------------
  const DATA_START_ROW = 3;

  for (let ei = 0; ei < tc.employees.length; ei++) {
    const emp = tc.employees[ei]!;
    const row = DATA_START_ROW + ei;

    // Employee name (col A: "LastName, FirstName")
    const actualName = String(ws!.getCell(row, 1).value ?? '');
    const expectedName = `${emp.lastName}, ${emp.firstName}`;
    assert(
      actualName === expectedName,
      `Row ${row} name: expected "${expectedName}", got "${actualName}"`,
    );

    // Employee code (col B)
    const actualCode = String(ws!.getCell(row, 2).value ?? '');
    assert(actualCode === emp.code, `Row ${row} code: expected "${emp.code}", got "${actualCode}"`);

    // Department (col C)
    const actualDept = String(ws!.getCell(row, 3).value ?? '');
    assert(
      actualDept === emp.deptName,
      `Row ${row} dept: expected "${emp.deptName}", got "${actualDept}"`,
    );

    // Position (col D)
    const actualPos = String(ws!.getCell(row, 4).value ?? '');
    assert(
      actualPos === emp.positionName,
      `Row ${row} position: expected "${emp.positionName}", got "${actualPos}"`,
    );

    // In/Out cells: list data validation pointing to TimeValues sheet
    // generateBlankTemplate uses today=9999-12-31 so all dates are "future"
    // and every In/Out cell gets a dropdown.
    for (let di = 0; di < tc.dates.length; di++) {
      const baseCol = FIXED_COLS + di * 3 + 1;

      for (const colOffset of [0, 1] as const) {
        const cell = ws!.getCell(row, baseCol + colOffset);
        const dv = cell.dataValidation;
        const label = colOffset === 0 ? 'In' : 'Out';
        assert(
          dv != null && dv.type === 'list',
          `Row ${row} date-col ${di + 1} ${label}: missing list data validation`,
        );
        assert(
          dv?.formulae?.[0] === 'TimeValues!$A$1:$A$96',
          `Row ${row} date-col ${di + 1} ${label}: wrong formula "${dv?.formulae?.[0]}"`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`Template parity: ${TEST_CASES.length} cases\n`);

  const failures: string[] = [];

  for (const tc of TEST_CASES) {
    process.stdout.write(`  ${tc.name} ... `);
    try {
      await verifyTemplate(tc);
      const numDays = tc.dates.length;
      const numEmp = tc.employees.length;
      console.log(`ok (${numEmp} employees, ${numDays} days)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`FAIL: ${msg}`);
      failures.push(`${tc.name}: ${msg}`);
    }
  }

  console.log();
  if (failures.length > 0) {
    console.error(`${failures.length}/${TEST_CASES.length} cases failed:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log(`All ${TEST_CASES.length} cases passed.`);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
