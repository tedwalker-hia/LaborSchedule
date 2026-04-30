/**
 * Spike: Prove exceljs preserves sheet protection with per-cell locked overrides.
 *
 * Reproduces the pattern used in the legacy openpyxl output:
 *   - Entire sheet protected (password-locked)
 *   - Input cells explicitly unlocked (locked: false) — editable when sheet is protected
 *   - Formula/header cells left at default locked state — not editable when sheet is protected
 *
 * Protocol:
 *   1. Build a workbook: one protected sheet with mixed locked/unlocked cells
 *   2. Write to /tmp/excel-sheet-protection-test.xlsx
 *   3. Read back with a fresh Workbook instance
 *   4. Assert sheet protection state and per-cell locked overrides are preserved
 */

import ExcelJS from 'exceljs';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT_PATH = join(tmpdir(), 'excel-sheet-protection-test.xlsx');
const PROTECTION_PASSWORD = 'test-password';

// ── Cell protection cases ─────────────────────────────────────────────────────

interface CellCase {
  cell: string;
  description: string;
  /** undefined = leave at Excel default (locked: true) */
  locked: boolean | undefined;
}

// Mirrors real labor-schedule pattern: headers + formula cells locked,
// employee input cells unlocked so users can type while sheet is protected.
const CELL_CASES: CellCase[] = [
  { cell: 'A1', description: 'Header (default locked)', locked: undefined },
  { cell: 'B1', description: 'Header (explicit locked)', locked: true },
  { cell: 'C1', description: 'Formula header (default locked)', locked: undefined },
  { cell: 'A2', description: 'Employee input — unlocked', locked: false },
  { cell: 'B2', description: 'Hours input — unlocked', locked: false },
  { cell: 'C2', description: 'Calculated total — locked', locked: true },
];

// ── Write phase ───────────────────────────────────────────────────────────────

async function buildWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Schedule');

  sheet.getCell('A1').value = 'Employee';
  sheet.getCell('B1').value = 'Hours';
  sheet.getCell('C1').value = 'Total';
  sheet.getCell('A2').value = 'Alice';
  sheet.getCell('B2').value = 8;
  sheet.getCell('C2').value = { formula: 'B2', result: 8 };

  // Apply per-cell protection overrides BEFORE enabling sheet protection.
  // Cells without an explicit override inherit Excel's default: locked=true.
  for (const { cell, locked } of CELL_CASES) {
    if (locked !== undefined) {
      sheet.getCell(cell).protection = { locked };
    }
  }

  // Enable sheet protection — makes locked cells uneditable in Excel desktop.
  await sheet.protect(PROTECTION_PASSWORD, {
    selectLockedCells: true,
    selectUnlockedCells: true,
  });

  const buf = (await wb.xlsx.writeBuffer()) as Buffer;
  return buf;
}

// ── Read-back phase ───────────────────────────────────────────────────────────

interface SheetProtectionResult {
  protected: boolean;
  selectLockedCells: boolean | undefined;
  selectUnlockedCells: boolean | undefined;
}

interface CellProtectionResult {
  cell: string;
  locked: boolean | undefined;
}

interface ReadBackResult {
  sheetProtection: SheetProtectionResult;
  cells: CellProtectionResult[];
}

async function readBackProtection(buf: Buffer): Promise<ReadBackResult> {
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(buf);

  const sheet = wb2.getWorksheet('Schedule');
  if (!sheet) throw new Error('FAIL: Schedule sheet not found after round-trip');

  const sp = sheet.sheetProtection as
    | {
        sheet?: boolean;
        selectLockedCells?: boolean;
        selectUnlockedCells?: boolean;
      }
    | undefined;

  const sheetProtection: SheetProtectionResult = {
    protected: sp?.sheet === true,
    selectLockedCells: sp?.selectLockedCells,
    selectUnlockedCells: sp?.selectUnlockedCells,
  };

  const cells: CellProtectionResult[] = CELL_CASES.map(({ cell }) => {
    const prot = sheet.getCell(cell).protection as { locked?: boolean } | undefined;
    return { cell, locked: prot?.locked };
  });

  return { sheetProtection, cells };
}

// ── Assertions ────────────────────────────────────────────────────────────────

function assertProtection(result: ReadBackResult): void {
  if (!result.sheetProtection.protected) {
    throw new Error('FAIL: sheet protection not set after round-trip');
  }

  for (const expected of CELL_CASES) {
    const actual = result.cells.find((c) => c.cell === expected.cell);
    if (!actual) throw new Error(`FAIL: no result record for cell ${expected.cell}`);

    if (expected.locked === false) {
      // Explicitly unlocked cells must round-trip as locked: false.
      if (actual.locked !== false) {
        throw new Error(
          `FAIL: ${expected.cell} (${expected.description}) — expected locked=false, got locked=${actual.locked}`,
        );
      }
    } else if (expected.locked === true) {
      // Explicitly locked: exceljs may store true or omit (both mean locked).
      if (actual.locked !== true && actual.locked !== undefined) {
        throw new Error(
          `FAIL: ${expected.cell} (${expected.description}) — expected locked=true or undefined, got locked=${actual.locked}`,
        );
      }
    }
    // undefined (default) — no assertion; Excel default applies
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('=== exceljs sheet-protection spike ===');
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

  // 3. Check protection state
  const result = await readBackProtection(diskBuf);
  console.log('[check] sheetProtection:', JSON.stringify(result.sheetProtection, null, 2));
  console.log('[check] cell protection results:');
  for (const c of result.cells) {
    const expected = CELL_CASES.find((x) => x.cell === c.cell);
    console.log(`  ${c.cell}: locked=${c.locked}  (expected: ${expected?.locked ?? 'default'})`);
  }
  console.log('');

  assertProtection(result);

  console.log('[check] sheet protection preserved ✓');
  for (const { cell, description } of CELL_CASES.filter((x) => x.locked === false)) {
    console.log(`[check] ${cell} (${description}) — locked=false preserved ✓`);
  }

  // 4. Cleanup
  await unlink(OUT_PATH);

  console.log('');
  console.log('RESULT: PASS — exceljs preserves sheet protection with per-cell locked overrides');
}

main().catch((err: unknown) => {
  console.error('');
  console.error(err instanceof Error ? err.message : String(err));
  console.error('');
  console.error('RESULT: FAIL — see error above');
  process.exitCode = 1;
});
