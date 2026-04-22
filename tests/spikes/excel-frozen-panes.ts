/**
 * Spike: Prove exceljs preserves frozen panes at G3.
 *
 * Reproduces the pattern used in the legacy openpyxl output:
 *   - Rows 1-2 frozen vertically (ySplit=2)
 *   - Columns A-F frozen horizontally (xSplit=6)
 *   - Top-left cell of the scrollable pane is G3
 *
 * Protocol:
 *   1. Build a workbook with a sheet whose view is frozen at G3
 *   2. Write to /tmp/excel-frozen-panes-test.xlsx
 *   3. Read back with a fresh Workbook instance
 *   4. Assert frozen-pane state is preserved (state, xSplit, ySplit, topLeftCell)
 */

import ExcelJS from 'exceljs';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT_PATH = join(tmpdir(), 'excel-frozen-panes-test.xlsx');

// Expected frozen-pane spec matching legacy openpyxl output.
const FROZEN_PANE = {
  state: 'frozen' as const,
  xSplit: 6, // columns A–F frozen
  ySplit: 2, // rows 1–2 frozen
  topLeftCell: 'G3',
};

// ── Write phase ───────────────────────────────────────────────────────────────

async function buildWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Schedule');

  // Populate enough cells so the freeze boundary is meaningful.
  sheet.getCell('A1').value = 'Employee';
  sheet.getCell('B1').value = 'Dept';
  sheet.getCell('C1').value = 'Role';
  sheet.getCell('D1').value = 'Mon';
  sheet.getCell('E1').value = 'Tue';
  sheet.getCell('F1').value = 'Wed';
  sheet.getCell('G1').value = '08:00';

  sheet.getCell('A2').value = 'Week of';
  sheet.getCell('G2').value = 'Thu';

  sheet.getCell('A3').value = 'Alice';
  sheet.getCell('G3').value = 8;

  // Apply frozen panes: rows 1-2 and columns A-F are frozen.
  // xSplit=6 → freeze after column 6 (F); ySplit=2 → freeze after row 2.
  sheet.views = [
    {
      state: FROZEN_PANE.state,
      xSplit: FROZEN_PANE.xSplit,
      ySplit: FROZEN_PANE.ySplit,
      topLeftCell: FROZEN_PANE.topLeftCell,
    },
  ];

  const buf = (await wb.xlsx.writeBuffer()) as Buffer;
  return buf;
}

// ── Read-back phase ───────────────────────────────────────────────────────────

interface FrozenPaneResult {
  state: string | undefined;
  xSplit: number | undefined;
  ySplit: number | undefined;
  topLeftCell: string | undefined;
}

async function readBackFrozenPane(buf: Buffer): Promise<FrozenPaneResult> {
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(buf);

  const sheet = wb2.getWorksheet('Schedule');
  if (!sheet) throw new Error('FAIL: Schedule sheet not found after round-trip');

  const view = sheet.views?.[0] as
    | {
        state?: string;
        xSplit?: number;
        ySplit?: number;
        topLeftCell?: string;
      }
    | undefined;

  return {
    state: view?.state,
    xSplit: view?.xSplit,
    ySplit: view?.ySplit,
    topLeftCell: view?.topLeftCell,
  };
}

// ── Assertions ────────────────────────────────────────────────────────────────

function assertFrozenPane(result: FrozenPaneResult): void {
  if (result.state !== FROZEN_PANE.state) {
    throw new Error(
      `FAIL: view.state — expected "${FROZEN_PANE.state}", got "${result.state}"`,
    );
  }
  if (result.xSplit !== FROZEN_PANE.xSplit) {
    throw new Error(
      `FAIL: view.xSplit — expected ${FROZEN_PANE.xSplit}, got ${result.xSplit}`,
    );
  }
  if (result.ySplit !== FROZEN_PANE.ySplit) {
    throw new Error(
      `FAIL: view.ySplit — expected ${FROZEN_PANE.ySplit}, got ${result.ySplit}`,
    );
  }
  if (result.topLeftCell !== FROZEN_PANE.topLeftCell) {
    throw new Error(
      `FAIL: view.topLeftCell — expected "${FROZEN_PANE.topLeftCell}", got "${result.topLeftCell}"`,
    );
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('=== exceljs frozen-panes spike ===');
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

  // 3. Check frozen-pane state
  const result = await readBackFrozenPane(diskBuf);
  console.log('[check] frozen pane view:', JSON.stringify(result, null, 2));
  console.log('');

  assertFrozenPane(result);

  console.log(`[check] state="${result.state}" ✓`);
  console.log(`[check] xSplit=${result.xSplit} (columns A–F frozen) ✓`);
  console.log(`[check] ySplit=${result.ySplit} (rows 1–2 frozen) ✓`);
  console.log(`[check] topLeftCell="${result.topLeftCell}" ✓`);

  // 4. Cleanup
  await unlink(OUT_PATH);

  console.log('');
  console.log('RESULT: PASS — exceljs preserves frozen panes at G3');
}

main().catch((err: unknown) => {
  console.error('');
  console.error(err instanceof Error ? err.message : String(err));
  console.error('');
  console.error('RESULT: FAIL — see error above');
  process.exitCode = 1;
});
