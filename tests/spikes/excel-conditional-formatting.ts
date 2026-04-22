/**
 * Spike: Prove exceljs preserves conditional formatting for weekend / past-date styling.
 *
 * Reproduces the patterns used in the legacy openpyxl output:
 *   - Weekend columns (Saturday/Sunday) highlighted via WEEKDAY formula rule
 *   - Past-date columns highlighted via TODAY() formula rule
 *
 * NOTE: exceljs ≥4.4.0 serialises formula-type conditional formatting to OOXML,
 * but the TODAY() function in CF formulae is known-partial in some 4.x versions.
 * This spike documents the exact round-trip behaviour so the feasibility memo can
 * record the result with a version pin.
 *
 * Protocol:
 *   1. Build a workbook with date headers (row 2) and two CF rules on data range
 *   2. Write to /tmp/excel-conditional-formatting-test.xlsx
 *   3. Read back with a fresh Workbook instance
 *   4. Assert CF rules and formulae are preserved in round-trip
 */

import ExcelJS from 'exceljs';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT_PATH = join(tmpdir(), 'excel-conditional-formatting-test.xlsx');
const SHEET = 'Schedule';

// Data range — rows 3–20, cols B–H (below the date-header row).
const DATA_REF = 'B3:H20';

// Rule 1: weekend. WEEKDAY mode 2 → 1=Mon … 6=Sat, 7=Sun. Row ref anchored.
const WEEKEND_FORMULA = 'WEEKDAY(B$2,2)>=6';

// Rule 2: past-date. TODAY() returns a serial number, B$2 stores a date serial.
const PAST_DATE_FORMULA = 'B$2<TODAY()';

// Week that includes both weekdays and a weekend (Mon 2025-01-06 → Sun 2025-01-12).
const DATES = [
  new Date('2025-01-06'), // Monday
  new Date('2025-01-07'), // Tuesday
  new Date('2025-01-08'), // Wednesday
  new Date('2025-01-09'), // Thursday
  new Date('2025-01-10'), // Friday
  new Date('2025-01-11'), // Saturday — weekend
  new Date('2025-01-12'), // Sunday   — weekend
];

// ── Write phase ───────────────────────────────────────────────────────────────

async function buildWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(SHEET);

  // Row 1: column headers.
  sheet.getCell('A1').value = 'Employee';
  const cols = ['B', 'C', 'D', 'E', 'F', 'G', 'H'];
  for (let i = 0; i < cols.length; i++) {
    sheet.getCell(`${cols[i]}1`).value = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i];
  }

  // Row 2: date values — anchored by the CF formulae ($2 row reference).
  for (let i = 0; i < cols.length; i++) {
    const cell = sheet.getCell(`${cols[i]}2`);
    cell.value = DATES[i];
    cell.numFmt = 'yyyy-mm-dd';
  }

  // Row 3: one data row so the sheet is non-trivial.
  sheet.getCell('A3').value = 'Alice';
  for (const col of cols) {
    sheet.getCell(`${col}3`).value = 8;
  }

  // CF rule 1: weekend columns — light grey fill.
  sheet.addConditionalFormatting({
    ref: DATA_REF,
    rules: [
      {
        type: 'expression',
        formulae: [WEEKEND_FORMULA],
        style: {
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } },
        },
        priority: 1,
      },
    ],
  });

  // CF rule 2: past-date columns — light orange fill.
  sheet.addConditionalFormatting({
    ref: DATA_REF,
    rules: [
      {
        type: 'expression',
        formulae: [PAST_DATE_FORMULA],
        style: {
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } },
        },
        priority: 2,
      },
    ],
  });

  const buf = (await wb.xlsx.writeBuffer()) as Buffer;
  return buf;
}

// ── Read-back phase ───────────────────────────────────────────────────────────

interface CFRule {
  ref: string;
  type: string;
  formulae: string[];
}

async function readBackCF(buf: Buffer): Promise<CFRule[]> {
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(buf);

  const sheet = wb2.getWorksheet(SHEET);
  if (!sheet) throw new Error(`FAIL: "${SHEET}" sheet not found after round-trip`);

  const rules: CFRule[] = [];
  for (const cf of sheet.conditionalFormattings) {
    for (const rule of cf.rules) {
      rules.push({
        ref: cf.ref,
        type: rule.type,
        formulae: ((rule as Record<string, unknown>)['formulae'] as string[] | undefined) ?? [],
      });
    }
  }
  return rules;
}

// ── Assertions ────────────────────────────────────────────────────────────────

function normalise(f: string): string {
  return f.trim().toUpperCase().replace(/\s+/g, '');
}

function assertCF(rules: CFRule[]): void {
  const allFormulae = rules.flatMap((r) => r.formulae.map(normalise));

  const weekendFound = allFormulae.some((f) => f === normalise(WEEKEND_FORMULA));
  if (!weekendFound) {
    throw new Error(
      `FAIL: weekend CF formula not found after round-trip.\n` +
        `  Expected: "${WEEKEND_FORMULA}"\n` +
        `  Got:      ${JSON.stringify(allFormulae)}`,
    );
  }

  const pastDateFound = allFormulae.some((f) => f === normalise(PAST_DATE_FORMULA));
  if (!pastDateFound) {
    throw new Error(
      `FAIL: past-date CF formula not found after round-trip.\n` +
        `  Expected: "${PAST_DATE_FORMULA}"\n` +
        `  Got:      ${JSON.stringify(allFormulae)}\n` +
        `  NOTE: TODAY() in CF formulae is known-partial in exceljs 4.x (see feasibility memo).`,
    );
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('=== exceljs conditional-formatting spike ===');
  console.log(`exceljs version: ${ExcelJS.version}`);
  console.log(`output: ${OUT_PATH}`);
  console.log('');
  console.log('Testing two CF rules:');
  console.log(`  1. Weekend:   formula="${WEEKEND_FORMULA}" ref="${DATA_REF}"`);
  console.log(`  2. Past-date: formula="${PAST_DATE_FORMULA}" ref="${DATA_REF}"`);
  console.log('');
  console.log('NOTE: TODAY() in CF formulae is known-partial in some exceljs 4.x builds.');
  console.log('Documenting actual round-trip behaviour for the feasibility memo.');
  console.log('');

  // 1. Build + write to /tmp (for manual inspection in Excel desktop).
  const buf = await buildWorkbook();
  await writeFile(OUT_PATH, buf);
  console.log(`[write] wrote ${buf.length} bytes`);

  // 2. Read back from disk (simulates a real file round-trip).
  const diskBuf = await readFile(OUT_PATH);
  console.log(`[read]  read  ${diskBuf.length} bytes from disk`);

  // 3. Check CF rules.
  const rules = await readBackCF(diskBuf);
  console.log(`[check] ${rules.length} CF rule(s) found after round-trip:`);
  for (const r of rules) {
    console.log(`  ref=${r.ref} type=${r.type} formulae=${JSON.stringify(r.formulae)}`);
  }
  console.log('');

  assertCF(rules);

  console.log(`[check] weekend formula "${WEEKEND_FORMULA}" preserved ✓`);
  console.log(`[check] past-date formula "${PAST_DATE_FORMULA}" preserved ✓`);

  // 4. Cleanup.
  await unlink(OUT_PATH);

  console.log('');
  console.log(
    'RESULT: PASS — exceljs preserves conditional formatting for weekend / past-date styling',
  );
}

main().catch((err: unknown) => {
  console.error('');
  console.error(err instanceof Error ? err.message : String(err));
  console.error('');
  console.error('RESULT: FAIL — see error above');
  process.exitCode = 1;
});
