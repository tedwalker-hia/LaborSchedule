/**
 * Spike: Prove exceljs preserves named ranges and column widths.
 *
 * Reproduces the patterns used in the legacy openpyxl output:
 *   - Named ranges defined at workbook scope (e.g. EmployeeList, WeekDates)
 *   - Per-column widths for the schedule layout (name col wide, date cols narrow)
 *
 * Protocol:
 *   1. Build a workbook with named ranges and explicit column widths
 *   2. Write to /tmp/excel-named-ranges-test.xlsx
 *   3. Read back with a fresh Workbook instance
 *   4. Assert named range references and column widths are preserved
 */

import ExcelJS from 'exceljs';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT_PATH = join(tmpdir(), 'excel-named-ranges-test.xlsx');
const SHEET = 'Schedule';

// Named ranges matching the legacy schedule layout.
const NAMED_RANGES: Record<string, string> = {
  EmployeeList: `'${SHEET}'!$A$3:$A$20`,
  WeekDates: `'${SHEET}'!$B$2:$H$2`,
};

// Column widths: A = employee name (wide), B–H = day columns (narrow).
const COLUMN_WIDTHS: Record<string, number> = {
  A: 25,
  B: 10,
  C: 10,
  D: 10,
  E: 10,
  F: 10,
  G: 10,
  H: 10,
};

// ── Write phase ───────────────────────────────────────────────────────────────

async function buildWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(SHEET);

  // Populate header row so the sheet is non-empty.
  sheet.getCell('A1').value = 'Employee';
  sheet.getCell('B1').value = 'Mon';
  sheet.getCell('C1').value = 'Tue';
  sheet.getCell('D1').value = 'Wed';
  sheet.getCell('E1').value = 'Thu';
  sheet.getCell('F1').value = 'Fri';
  sheet.getCell('G1').value = 'Sat';
  sheet.getCell('H1').value = 'Sun';

  // Populate week-date row.
  sheet.getCell('A2').value = 'Week of';
  sheet.getCell('B2').value = new Date('2025-01-06');
  sheet.getCell('H2').value = new Date('2025-01-12');

  // Populate a few employee rows so EmployeeList is non-trivial.
  ['Alice', 'Bob', 'Carol'].forEach((name, i) => {
    sheet.getCell(`A${3 + i}`).value = name;
  });

  // Set column widths.
  for (const [col, width] of Object.entries(COLUMN_WIDTHS)) {
    sheet.getColumn(col).width = width;
  }

  // Define named ranges at workbook scope.
  for (const [name, ref] of Object.entries(NAMED_RANGES)) {
    wb.definedNames.add(name, ref);
  }

  const buf = (await wb.xlsx.writeBuffer()) as Buffer;
  return buf;
}

// ── Read-back phase ───────────────────────────────────────────────────────────

interface RoundTripResult {
  namedRanges: Record<string, string[]>;
  columnWidths: Record<string, number | undefined>;
}

async function readBackResult(buf: Buffer): Promise<RoundTripResult> {
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(buf);

  const sheet = wb2.getWorksheet(SHEET);
  if (!sheet) throw new Error(`FAIL: "${SHEET}" sheet not found after round-trip`);

  // Collect named ranges.
  const namedRanges: Record<string, string[]> = {};
  for (const name of Object.keys(NAMED_RANGES)) {
    namedRanges[name] = wb2.definedNames.getRanges(name).ranges;
  }

  // Collect column widths.
  const columnWidths: Record<string, number | undefined> = {};
  for (const col of Object.keys(COLUMN_WIDTHS)) {
    columnWidths[col] = sheet.getColumn(col).width;
  }

  return { namedRanges, columnWidths };
}

// ── Assertions ────────────────────────────────────────────────────────────────

function assertResult(result: RoundTripResult): void {
  // Named ranges: each expected name must exist with a matching reference.
  for (const [name, expectedRef] of Object.entries(NAMED_RANGES)) {
    const ranges = result.namedRanges[name];
    if (!ranges || ranges.length === 0) {
      throw new Error(`FAIL: named range "${name}" not found after round-trip`);
    }
    // exceljs may normalise quote style; compare without surrounding quotes.
    const normalise = (r: string) => r.replace(/'/g, '');
    const match = ranges.some((r) => normalise(r) === normalise(expectedRef));
    if (!match) {
      throw new Error(
        `FAIL: named range "${name}" — expected "${expectedRef}", got ${JSON.stringify(ranges)}`,
      );
    }
  }

  // Column widths: allow ±0.1 tolerance for floating-point round-trips.
  for (const [col, expectedWidth] of Object.entries(COLUMN_WIDTHS)) {
    const actualWidth = result.columnWidths[col];
    if (actualWidth === undefined) {
      throw new Error(`FAIL: column "${col}" width not found after round-trip`);
    }
    if (Math.abs(actualWidth - expectedWidth) > 0.1) {
      throw new Error(
        `FAIL: column "${col}" width — expected ${expectedWidth}, got ${actualWidth}`,
      );
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('=== exceljs named-ranges + column-widths spike ===');
  console.log(`exceljs version: ${ExcelJS.version}`);
  console.log(`output: ${OUT_PATH}`);
  console.log('');

  // 1. Build + write to /tmp (for manual inspection in Excel desktop)
  const buf = await buildWorkbook();
  await writeFile(OUT_PATH, buf);
  console.log(`[write] wrote ${buf.length} bytes`);

  // 2. Read back from disk (simulates a real file round-trip)
  const diskBuf = await readFile(OUT_PATH);
  console.log(`[read]  read  ${diskBuf.length} bytes from disk`);

  // 3. Check named ranges + column widths
  const result = await readBackResult(diskBuf);
  console.log('[check] named ranges:', JSON.stringify(result.namedRanges, null, 2));
  console.log('[check] column widths:', JSON.stringify(result.columnWidths, null, 2));
  console.log('');

  assertResult(result);

  for (const [name, ref] of Object.entries(NAMED_RANGES)) {
    console.log(`[check] named range "${name}" → ${ref} ✓`);
  }
  for (const [col, width] of Object.entries(COLUMN_WIDTHS)) {
    console.log(`[check] column ${col} width=${width} ✓`);
  }

  // 4. Cleanup
  await unlink(OUT_PATH);

  console.log('');
  console.log('RESULT: PASS — exceljs preserves named ranges and column widths');
}

main().catch((err: unknown) => {
  console.error('');
  console.error(err instanceof Error ? err.message : String(err));
  console.error('');
  console.error('RESULT: FAIL — see error above');
  process.exitCode = 1;
});
