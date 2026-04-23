import * as ExcelJS from 'exceljs';

export interface ImportRecord {
  employeeCode: string;
  firstName: string;
  lastName: string;
  deptName: string;
  positionName: string;
  date: string;
  clockIn: string;
  clockOut: string;
  hours: number | null;
}

export interface ImportPreview {
  dates: string[];
  dateRange: string;
  employeeCount: number;
  employees: string[];
  recordCount: number;
  records: ImportRecord[];
}

const MONTH_MAP: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function cellString(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'object' && 'result' in v) {
    return v.result != null ? String(v.result) : '';
  }
  if (typeof v === 'object' && 'richText' in v) {
    return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join('');
  }
  return String(v);
}

function cellNumber(cell: ExcelJS.Cell): number | null {
  const v = cell.value;
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && 'result' in v) {
    const r = (v as ExcelJS.CellFormulaValue).result;
    if (typeof r === 'number') return r;
    if (typeof r === 'string') {
      const n = parseFloat(r);
      return isNaN(n) ? null : n;
    }
    return null;
  }
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  }
  return null;
}

function parseDateHeader(header: string, referenceDate: Date): Date | null {
  const match = header.match(/([A-Za-z]+)\s+(\d+)/);
  if (!match) return null;

  const monthStr = match[1]!.toLowerCase();
  const day = parseInt(match[2]!, 10);
  const month = MONTH_MAP[monthStr];
  if (month === undefined || isNaN(day)) return null;

  const refYear = referenceDate.getFullYear();
  let date = new Date(refYear, month, day);

  const diffMs = date.getTime() - referenceDate.getTime();
  const sixMonthsMs = 6 * 30 * 24 * 60 * 60 * 1000;
  if (diffMs > sixMonthsMs) {
    date = new Date(refYear - 1, month, day);
  } else if (diffMs < -sixMonthsMs) {
    date = new Date(refYear + 1, month, day);
  }

  return date;
}

function formatISODate(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parse a schedule Excel workbook from a Node.js Buffer and return a structured
 * preview. ExcelJS's type declares its own Buffer interface extending ArrayBuffer;
 * the double cast bridges the TS types while exceljs handles Node Buffer correctly
 * at runtime.
 */
export async function parseWorkbook(buffer: Buffer): Promise<ImportPreview> {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS declares Buffer as `interface Buffer extends ArrayBuffer` — Node's
  // Buffer is runtime-compatible but TypeScript types diverge, hence the cast.
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  // Prefer named sheet so the TimeValues hidden sheet (added first in writer.ts)
  // doesn't shadow it when looking up by index.
  const ws = workbook.getWorksheet('Labor Schedule') ?? workbook.getWorksheet(1);
  if (!ws) {
    throw new Error('Workbook contains no worksheets');
  }

  const now = new Date();

  // Parse date columns starting at column 6, row 1.
  // Each date header spans 3 columns (In, Out, Hrs).
  const FIXED_COLS = 5;
  const DATE_HEADER_ROW = 1;
  const parsedDates: Date[] = [];
  const dateStrings: string[] = [];

  let col = FIXED_COLS + 1;
  while (true) {
    const headerValue = cellString(ws.getCell(DATE_HEADER_ROW, col));
    if (!headerValue.trim()) break;

    const date = parseDateHeader(headerValue, now);
    if (!date) break;

    parsedDates.push(date);
    dateStrings.push(formatISODate(date));

    col += 3;
  }

  // Parse employee rows starting from row 3.
  const EMP_START_ROW = 3;
  const records: ImportRecord[] = [];
  const employeeNames: Set<string> = new Set();

  let row = EMP_START_ROW;
  while (true) {
    const nameValue = cellString(ws.getCell(row, 1)).trim();
    const codeValue = cellString(ws.getCell(row, 2)).trim();

    if (!nameValue && !codeValue) break;

    let firstName = '';
    let lastName = '';
    if (nameValue.includes(',')) {
      const parts = nameValue.split(',', 2);
      lastName = parts[0]!.trim();
      firstName = parts[1]!.trim();
    } else {
      lastName = nameValue;
    }

    const deptName = cellString(ws.getCell(row, 3)).trim();
    const positionName = cellString(ws.getCell(row, 4)).trim();

    const displayName = nameValue || codeValue;
    employeeNames.add(displayName);

    for (let di = 0; di < parsedDates.length; di++) {
      const baseCol = FIXED_COLS + di * 3 + 1;
      const clockIn = cellString(ws.getCell(row, baseCol)).trim();
      const clockOut = cellString(ws.getCell(row, baseCol + 1)).trim();
      const hours = cellNumber(ws.getCell(row, baseCol + 2));

      if (clockIn || clockOut || (hours != null && hours !== 0)) {
        records.push({
          employeeCode: codeValue,
          firstName,
          lastName,
          deptName,
          positionName,
          date: dateStrings[di]!,
          clockIn,
          clockOut,
          hours,
        });
      }
    }

    row++;
  }

  const sortedEmployees = Array.from(employeeNames).sort();

  let dateRange = '';
  if (dateStrings.length > 0) {
    dateRange =
      dateStrings.length === 1
        ? dateStrings[0]!
        : `${dateStrings[0]!} to ${dateStrings[dateStrings.length - 1]!}`;
  }

  return {
    dates: dateStrings,
    dateRange,
    employeeCount: sortedEmployees.length,
    employees: sortedEmployees,
    recordCount: records.length,
    records,
  };
}
