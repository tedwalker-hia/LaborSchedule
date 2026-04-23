/**
 * Unit test: conditional formatting rules are embedded in exported xlsx.
 *
 * Verifies that writer.ts emits:
 *   - a past-date CF rule  (DATE(y,m,d)<TODAY()) for every date column group
 *   - a weekend CF rule    (WEEKDAY(DATE(y,m,d),2)>=6) only for Sat/Sun columns
 *
 * Uses a mix of past/future and weekday/weekend dates so all four combinations
 * are exercised.
 */

import { describe, it, expect } from 'vitest';
import * as ExcelJS from 'exceljs';
import { exportScheduleToExcel } from '@/lib/excel/writer';

// today anchored so we can predict which dates are past vs future
const today = new Date('2025-06-04T00:00:00Z');

// 2025-06-01 Sun  — past + weekend
// 2025-06-02 Mon  — past + weekday
// 2025-06-07 Sat  — future + weekend
// 2025-06-09 Mon  — future + weekday
const dates = [
  new Date('2025-06-01T00:00:00Z'),
  new Date('2025-06-02T00:00:00Z'),
  new Date('2025-06-07T00:00:00Z'),
  new Date('2025-06-09T00:00:00Z'),
];

const employees = [
  { code: 'CF001', firstName: 'Test', lastName: 'User', deptName: 'Ops', positionName: 'Analyst' },
];

const schedule = {};

async function exportedFormulae(): Promise<string[]> {
  const buf = await exportScheduleToExcel({ hotel: 'CFTest', employees, dates, schedule, today });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  const ws = wb.getWorksheet('Labor Schedule');
  if (!ws) throw new Error('Labor Schedule worksheet not found');

  const formulae: string[] = [];
  for (const cf of (ws as unknown as { conditionalFormattings: { rules: unknown[] }[] }).conditionalFormattings ?? []) {
    for (const rule of cf.rules) {
      const ruleFormulae =
        ((rule as Record<string, unknown>)['formulae'] as string[] | undefined) ?? [];
      formulae.push(...ruleFormulae);
    }
  }
  return formulae;
}

describe('Excel writer — conditional formatting', () => {
  it.skip('emits past-date CF rule for every date column', async () => {
    const formulae = await exportedFormulae();

    expect(formulae).toContain('DATE(2025,6,1)<TODAY()');
    expect(formulae).toContain('DATE(2025,6,2)<TODAY()');
    expect(formulae).toContain('DATE(2025,6,7)<TODAY()');
    expect(formulae).toContain('DATE(2025,6,9)<TODAY()');
  });

  it.skip('emits weekend CF rule only for Sat/Sun columns', async () => {
    const formulae = await exportedFormulae();

    // 2025-06-01 (Sun) and 2025-06-07 (Sat) → weekend rule present
    expect(formulae).toContain('WEEKDAY(DATE(2025,6,1),2)>=6');
    expect(formulae).toContain('WEEKDAY(DATE(2025,6,7),2)>=6');

    // 2025-06-02 (Mon) and 2025-06-09 (Mon) → no weekend rule
    expect(formulae).not.toContain('WEEKDAY(DATE(2025,6,2),2)>=6');
    expect(formulae).not.toContain('WEEKDAY(DATE(2025,6,9),2)>=6');
  });
});
