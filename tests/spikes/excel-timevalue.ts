/**
 * Spike: Prove exceljs preserves TIMEVALUE formula on round-trip.
 *
 * Reproduces the pattern used in the legacy openpyxl output:
 *   =TIMEVALUE("HH:MM") — converts quarter-hour time strings to Excel serial
 *   fractions (minutes-since-midnight / 1440).
 *
 * Protocol:
 *   1. Build a workbook with TIMEVALUE formulas + cached results in several cells
 *   2. Write to /tmp/excel-timevalue-test.xlsx
 *   3. Read back with a fresh Workbook instance
 *   4. Assert each formula string AND cached numeric result are preserved
 *
 * Note: exceljs does not recalculate formulas on read — it stores the caller-
 * supplied `result` in the xlsx <c><v> element.  If either the formula string
 * or cached result is lost, Excel will show a stale or missing value.
 */

import ExcelJS from 'exceljs';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT_PATH = join(tmpdir(), 'excel-timevalue-test.xlsx');

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Excel serial time fraction: minutes-since-midnight / 1440. */
function timeSerial(h: number, m: number): number {
  return (h * 60 + m) / 1440;
}

interface FormulaCase {
  cell: string;
  timeLabel: string; // the HH:MM string embedded in the formula
  formula: string;
  result: number; // cached result to embed
}

const CASES: FormulaCase[] = [
  {
    cell: 'A1',
    timeLabel: '00:00',
    formula: 'TIMEVALUE("00:00")',
    result: timeSerial(0, 0),
  },
  {
    cell: 'A2',
    timeLabel: '00:15',
    formula: 'TIMEVALUE("00:15")',
    result: timeSerial(0, 15),
  },
  {
    cell: 'A3',
    timeLabel: '08:00',
    formula: 'TIMEVALUE("08:00")',
    result: timeSerial(8, 0),
  },
  {
    cell: 'A4',
    timeLabel: '09:30',
    formula: 'TIMEVALUE("09:30")',
    result: timeSerial(9, 30),
  },
  {
    cell: 'A5',
    timeLabel: '12:00',
    formula: 'TIMEVALUE("12:00")',
    result: timeSerial(12, 0),
  },
  {
    cell: 'A6',
    timeLabel: '23:45',
    formula: 'TIMEVALUE("23:45")',
    result: timeSerial(23, 45),
  },
];

// ── Write phase ───────────────────────────────────────────────────────────────

async function buildWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('TimeValues');

  for (const { cell, formula, result } of CASES) {
    sheet.getCell(cell).value = { formula, result };
    sheet.getCell(cell).numFmt = 'h:mm'; // render as HH:MM in Excel desktop
  }

  const buf = (await wb.xlsx.writeBuffer()) as Buffer;
  return buf;
}

// ── Read-back phase ───────────────────────────────────────────────────────────

interface CellResult {
  cell: string;
  formula: string | undefined;
  result: number | undefined;
}

async function readBackFormulas(buf: Buffer): Promise<CellResult[]> {
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(buf);

  const sheet = wb2.getWorksheet('TimeValues');
  if (!sheet) throw new Error('FAIL: TimeValues sheet not found after round-trip');

  return CASES.map(({ cell }) => {
    const v = sheet.getCell(cell).value;
    if (v !== null && typeof v === 'object' && 'formula' in v) {
      const fv = v as { formula?: string; result?: unknown };
      return {
        cell,
        formula: typeof fv.formula === 'string' ? fv.formula : undefined,
        result: typeof fv.result === 'number' ? fv.result : undefined,
      };
    }
    return { cell, formula: undefined, result: undefined };
  });
}

// ── Assertions ────────────────────────────────────────────────────────────────

const EPSILON = 1e-10; // tolerance for floating-point serial fractions

function assertRoundTrip(results: CellResult[]): void {
  for (const expected of CASES) {
    const actual = results.find((r) => r.cell === expected.cell);
    if (!actual) throw new Error(`FAIL: no result record for cell ${expected.cell}`);

    if (actual.formula === undefined) {
      throw new Error(
        `FAIL: ${expected.cell} — formula not preserved after round-trip (got undefined)`,
      );
    }
    if (actual.formula !== expected.formula) {
      throw new Error(
        `FAIL: ${expected.cell} — formula mismatch\n` +
          `  expected: "${expected.formula}"\n` +
          `  got:      "${actual.formula}"`,
      );
    }

    if (actual.result === undefined) {
      throw new Error(
        `FAIL: ${expected.cell} — cached result not preserved after round-trip`,
      );
    }
    if (Math.abs(actual.result - expected.result) > EPSILON) {
      throw new Error(
        `FAIL: ${expected.cell} — result mismatch\n` +
          `  expected: ${expected.result}\n` +
          `  got:      ${actual.result}`,
      );
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('=== exceljs TIMEVALUE formula spike ===');
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

  // 3. Check formula + result preservation
  const results = await readBackFormulas(diskBuf);

  console.log('[check] round-trip results:');
  for (const r of results) {
    console.log(`  ${r.cell}: formula="${r.formula}"  result=${r.result}`);
  }
  console.log('');

  assertRoundTrip(results);

  for (const { cell, formula, result } of CASES) {
    console.log(`[check] ${cell} — "${formula}" => ${result} ✓`);
  }

  // 4. Cleanup
  await unlink(OUT_PATH);

  console.log('');
  console.log('RESULT: PASS — exceljs preserves TIMEVALUE formula and cached result');
}

main().catch((err: unknown) => {
  console.error('');
  console.error(err instanceof Error ? err.message : String(err));
  console.error('');
  console.error('RESULT: FAIL — see error above');
  process.exitCode = 1;
});
