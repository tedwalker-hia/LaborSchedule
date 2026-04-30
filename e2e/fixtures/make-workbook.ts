import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const TEST_EMPLOYEE_CODE = 'E2E-IMPORT-01';

export interface WorkbookFixture {
  filePath: string;
  dirPath: string;
  dateStr: string;
}

/**
 * Creates a minimal valid schedule workbook in a temp directory.
 * Uses today's date as the schedule date so the parser always resolves it
 * correctly regardless of when the test runs.
 */
export async function makeScheduleWorkbook(): Promise<WorkbookFixture> {
  const dirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-e2e-'));
  const filePath = path.join(dirPath, 'schedule-sample.xlsx');

  // Use today so parseDateHeader always puts it within the 6-month window.
  const now = new Date();
  const month = now.toLocaleString('en-US', { month: 'short' }); // e.g. "Apr"
  const day = String(now.getDate()).padStart(2, '0'); // e.g. "22"
  const dateHeader = `${month} ${day}`; // "Apr 22"
  const dateStr = now.toISOString().split('T')[0]!; // "2026-04-22"

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Schedule');

  // Row 1: fixed column labels + date header at col 6.
  // parser.ts: FIXED_COLS=5, DATE_HEADER_ROW=1, EMP_START_ROW=3
  ws.getCell(1, 1).value = 'Name';
  ws.getCell(1, 2).value = 'Code';
  ws.getCell(1, 3).value = 'Dept';
  ws.getCell(1, 4).value = 'Position';
  ws.getCell(1, 5).value = 'Total';
  ws.getCell(1, 6).value = dateHeader;

  // Row 2: sub-headers (parser skips — employees start at row 3).
  ws.getCell(2, 6).value = 'In';
  ws.getCell(2, 7).value = 'Out';
  ws.getCell(2, 8).value = 'Hrs';

  // Row 3: single test employee.
  // Name format "LastName, FirstName" is split by the parser at the comma.
  ws.getCell(3, 1).value = 'E2E, Tester';
  ws.getCell(3, 2).value = TEST_EMPLOYEE_CODE;
  ws.getCell(3, 3).value = 'E2E Dept';
  ws.getCell(3, 4).value = 'E2E Position';
  ws.getCell(3, 5).value = 8;
  ws.getCell(3, 6).value = '09:00';
  ws.getCell(3, 7).value = '17:00';
  ws.getCell(3, 8).value = 8;

  await wb.xlsx.writeFile(filePath);
  return { filePath, dirPath, dateStr };
}
