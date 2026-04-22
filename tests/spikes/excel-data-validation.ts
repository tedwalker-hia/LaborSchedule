/**
 * Spike: Prove exceljs preserves cross-sheet data validation list.
 *
 * Reproduces the pattern used in the legacy openpyxl output:
 *   TimeValues!$A$1:$A$96  — 96 quarter-hour slots (00:00–23:45)
 *
 * Protocol:
 *   1. Build a workbook: TimeValues sheet + Schedule sheet with a list validation
 *   2. Write to /tmp/excel-data-validation-test.xlsx
 *   3. Read back with a fresh Workbook instance
 *   4. Assert the data validation on the target cell matches the original formula
 *
 * Historical bug: exceljs < 4.x dropped cross-sheet range references in the
 * dataValidation.formula1 field on round-trip.  This spike pins the version
 * and proves it is fixed (or flags the regression).
 */

import ExcelJS from 'exceljs';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT_PATH = join(tmpdir(), 'excel-data-validation-test.xlsx');

// ── Helpers ──────────────────────────────────────────────────────────────────

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/** Build the 96 quarter-hour label strings ("00:00", "00:15", ..., "23:45"). */
function buildTimeValues(): string[] {
  const values: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let q = 0; q < 4; q++) {
      values.push(`${pad(h)}:${pad(q * 15)}`);
    }
  }
  return values; // length === 96
}

// ── Write phase ───────────────────────────────────────────────────────────────

async function buildWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  // Sheet 1: TimeValues — the dropdown source list
  const tvSheet = wb.addWorksheet('TimeValues');
  const timeValues = buildTimeValues();
  timeValues.forEach((label, i) => {
    tvSheet.getCell(i + 1, 1).value = label; // A1:A96
  });

  // Sheet 2: Schedule — contains the cell with cross-sheet data validation
  const schedSheet = wb.addWorksheet('Schedule');
  schedSheet.getCell('B2').value = 'Start Time';

  // This is the feature under test: cross-sheet list validation
  schedSheet.getCell('C2').dataValidation = {
    type: 'list',
    allowBlank: true,
    showErrorMessage: true,
    errorStyle: 'error',
    errorTitle: 'Invalid time',
    error: 'Select a value from the list.',
    formulae: ['TimeValues!$A$1:$A$96'],
  };

  const buf = (await wb.xlsx.writeBuffer()) as Buffer;
  return buf;
}

// ── Read-back phase ───────────────────────────────────────────────────────────

interface DataValidationResult {
  found: boolean;
  type: string | undefined;
  formulae: string[] | undefined;
  formula1: string | undefined;
}

async function readBackValidation(buf: Buffer): Promise<DataValidationResult> {
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(buf);

  const sheet = wb2.getWorksheet('Schedule');
  if (!sheet) {
    return { found: false, type: undefined, formulae: undefined, formula1: undefined };
  }

  const cell = sheet.getCell('C2');
  const dv = cell.dataValidation as
    | {
        type?: string;
        formulae?: string[];
        formula1?: string;
      }
    | undefined;

  if (!dv) {
    return { found: false, type: undefined, formulae: undefined, formula1: undefined };
  }

  return {
    found: true,
    type: dv.type,
    formulae: dv.formulae,
    formula1: dv.formula1,
  };
}

// ── Assertions ────────────────────────────────────────────────────────────────

const EXPECTED_FORMULA = 'TimeValues!$A$1:$A$96';

function assertPreserved(result: DataValidationResult): void {
  if (!result.found) {
    throw new Error('FAIL: dataValidation not present on C2 after round-trip');
  }
  if (result.type !== 'list') {
    throw new Error(`FAIL: expected type "list", got "${result.type}"`);
  }

  // exceljs ≥ 4.x stores the formula in `formulae[0]`; older versions used `formula1`
  const actual = result.formulae?.[0] ?? result.formula1;
  if (!actual) {
    throw new Error('FAIL: formulae[0] and formula1 both undefined after round-trip');
  }
  if (actual !== EXPECTED_FORMULA) {
    throw new Error(`FAIL: expected "${EXPECTED_FORMULA}", got "${actual}"`);
  }
}

// ── TimeValues sheet integrity check ─────────────────────────────────────────

async function checkTimeValuesSheet(buf: Buffer): Promise<void> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);

  const sheet = wb.getWorksheet('TimeValues');
  if (!sheet) throw new Error('FAIL: TimeValues sheet not found after round-trip');

  const first = sheet.getCell('A1').value;
  const last = sheet.getCell('A96').value;
  const row97 = sheet.getCell('A97').value;

  if (first !== '00:00') throw new Error(`FAIL: A1 expected "00:00", got "${first}"`);
  if (last !== '23:45') throw new Error(`FAIL: A96 expected "23:45", got "${last}"`);
  if (row97 !== null && row97 !== undefined && row97 !== '') {
    throw new Error(`FAIL: A97 should be empty, got "${row97}"`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('=== exceljs data-validation spike ===');
  console.log(`exceljs version: ${ExcelJS.version}`);
  console.log(`output: ${OUT_PATH}`);
  console.log('');

  // 1. Build + write to /tmp (for manual inspection in Excel desktop)
  const buf = await buildWorkbook();
  await writeFile(OUT_PATH, buf);
  console.log(`[write] wrote ${buf.length} bytes`);

  // 2. Read the file bytes back from disk (simulates a real file round-trip)
  const diskBuf = await readFile(OUT_PATH);
  console.log(`[read]  read  ${diskBuf.length} bytes from disk`);

  // 3. Check TimeValues sheet integrity
  await checkTimeValuesSheet(diskBuf);
  console.log('[check] TimeValues!A1:A96 — 96 quarter-hour slots preserved ✓');

  // 4. Check data validation
  const result = await readBackValidation(diskBuf);
  console.log('[check] dataValidation raw result:', JSON.stringify(result, null, 2));
  assertPreserved(result);
  console.log(`[check] dataValidation formula preserved: "${EXPECTED_FORMULA}" ✓`);

  // 5. Cleanup
  await unlink(OUT_PATH);

  console.log('');
  console.log('RESULT: PASS — exceljs preserves cross-sheet list validation');
}

main().catch((err: unknown) => {
  console.error('');
  console.error(err instanceof Error ? err.message : String(err));
  console.error('');
  console.error('RESULT: FAIL — see error above');
  process.exitCode = 1;
});
