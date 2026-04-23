import * as ExcelJS from 'exceljs';

function generateTimeOptions(): string[] {
  const options: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const period = h < 12 ? 'AM' : 'PM';
      let displayHour = h % 12;
      if (displayHour === 0) displayHour = 12;
      const mm = m.toString().padStart(2, '0');
      options.push(`${displayHour}:${mm} ${period}`);
    }
  }
  return options;
}

function formatDateHeader(date: Date): string {
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
  const mon = months[date.getMonth()];
  const day = date.getDate().toString().padStart(2, '0');
  const dow = days[date.getDay()];
  return `${mon} ${day} (${dow})`;
}

function isBefore(date: Date, ref: Date): boolean {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const r = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  return d.getTime() < r.getTime();
}

function isWeekend(date: Date): boolean {
  const dow = date.getDay();
  return dow === 0 || dow === 6;
}

// ---------------------------------------------------------------------------
// Style constants
// ---------------------------------------------------------------------------

const BORDER_COLOR = 'FFDDDDDD';

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: BORDER_COLOR } },
  left: { style: 'thin', color: { argb: BORDER_COLOR } },
  bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
  right: { style: 'thin', color: { argb: BORDER_COLOR } },
};

const centerAlign: Partial<ExcelJS.Alignment> = {
  horizontal: 'center',
  vertical: 'middle',
};

function solidFill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

const HEADER_FILL = solidFill('FF003366');
const SUB_HEADER_FILL = solidFill('FF004D80');
const PAST_HEADER_FILL = solidFill('FFE67E00');
const PAST_SUB_FILL = solidFill('FFCC7000');
const WEEKEND_FILL = solidFill('FFF5F0FF');
const PAST_CELL_FILL = solidFill('FFFFF3E0');
const TOTAL_FILL = solidFill('FFE6F4EA');

const WHITE_BOLD_FONT: Partial<ExcelJS.Font> = {
  color: { argb: 'FFFFFFFF' },
  bold: true,
  size: 10,
};
const WHITE_FONT: Partial<ExcelJS.Font> = {
  color: { argb: 'FFFFFFFF' },
  size: 10,
};
const TOTAL_FONT: Partial<ExcelJS.Font> = {
  color: { argb: 'FF2E7D32' },
  bold: true,
  size: 10,
};

const HOURS_FMT = '0.00;-0.00;""';

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function exportScheduleToExcel(params: {
  hotel: string;
  employees: {
    code: string;
    firstName: string;
    lastName: string;
    deptName: string;
    positionName: string;
  }[];
  dates: Date[];
  schedule: Record<string, Record<string, { clockIn: string; clockOut: string; hours: number }>>;
  today: Date;
}): Promise<Buffer> {
  const { employees, dates, schedule, today } = params;

  const workbook = new ExcelJS.Workbook();

  // Hidden reference sheet for time-entry dropdowns — spike confirmed that
  // exceljs 4.x preserves cross-sheet formula refs (pre-4.x dropped them).
  const timeOptions = generateTimeOptions();
  const tvSheet = workbook.addWorksheet('TimeValues');
  timeOptions.forEach((label, i) => {
    tvSheet.getCell(i + 1, 1).value = label; // A1:A96
  });
  tvSheet.state = 'hidden';

  const ws = workbook.addWorksheet('Labor Schedule');

  const FIXED_COLS = 5;
  const TOTAL_COL = 5;

  ws.getColumn(1).width = 22;
  ws.getColumn(2).width = 12;
  ws.getColumn(3).width = 18;
  ws.getColumn(4).width = 18;
  ws.getColumn(5).width = 12;

  for (let di = 0; di < dates.length; di++) {
    const baseCol = FIXED_COLS + di * 3 + 1;
    ws.getColumn(baseCol).width = 12;
    ws.getColumn(baseCol + 1).width = 12;
    ws.getColumn(baseCol + 2).width = 8;
  }

  // =========================================================================
  // Row 1 — Header
  // =========================================================================
  const headerRow = 1;
  const fixedHeaders = ['Employee', 'Code', 'Department', 'Position', 'Total Hrs'];

  for (let ci = 0; ci < fixedHeaders.length; ci++) {
    const cell = ws.getCell(headerRow, ci + 1);
    cell.value = fixedHeaders[ci];
    cell.fill = ci === TOTAL_COL - 1 ? TOTAL_FILL : HEADER_FILL;
    cell.font = ci === TOTAL_COL - 1 ? TOTAL_FONT : WHITE_BOLD_FONT;
    cell.border = thinBorder;
    cell.alignment = centerAlign;
    ws.mergeCells(headerRow, ci + 1, headerRow + 1, ci + 1);
  }

  for (let di = 0; di < dates.length; di++) {
    const date = dates[di]!;
    const past = isBefore(date, today);
    const baseCol = FIXED_COLS + di * 3 + 1;
    const endCol = baseCol + 2;

    ws.mergeCells(headerRow, baseCol, headerRow, endCol);
    const cell = ws.getCell(headerRow, baseCol);
    cell.value = formatDateHeader(date);
    cell.fill = past ? PAST_HEADER_FILL : HEADER_FILL;
    cell.font = WHITE_BOLD_FONT;
    cell.border = thinBorder;
    cell.alignment = centerAlign;
  }

  // =========================================================================
  // Row 2 — Sub-headers
  // =========================================================================
  const subHeaderRow = 2;
  const subLabels = ['In', 'Out', 'Hrs'];

  for (let di = 0; di < dates.length; di++) {
    const date = dates[di]!;
    const past = isBefore(date, today);
    const baseCol = FIXED_COLS + di * 3 + 1;

    for (let si = 0; si < 3; si++) {
      const cell = ws.getCell(subHeaderRow, baseCol + si);
      cell.value = subLabels[si];
      cell.fill = past ? PAST_SUB_FILL : SUB_HEADER_FILL;
      cell.font = WHITE_FONT;
      cell.border = thinBorder;
      cell.alignment = centerAlign;
    }
  }

  // =========================================================================
  // Row 3+ — Employee data
  // =========================================================================
  const DATA_START_ROW = 3;

  for (let ei = 0; ei < employees.length; ei++) {
    const emp = employees[ei]!;
    const row = DATA_START_ROW + ei;
    const dateKey = (d: Date) => d.toISOString().slice(0, 10);

    const nameCell = ws.getCell(row, 1);
    nameCell.value = `${emp.lastName}, ${emp.firstName}`;
    nameCell.border = thinBorder;
    nameCell.alignment = { ...centerAlign, horizontal: 'left' };
    nameCell.protection = { locked: true };

    const codeCell = ws.getCell(row, 2);
    codeCell.value = emp.code;
    codeCell.border = thinBorder;
    codeCell.alignment = centerAlign;
    codeCell.protection = { locked: true };

    const deptCell = ws.getCell(row, 3);
    deptCell.value = emp.deptName;
    deptCell.border = thinBorder;
    deptCell.alignment = centerAlign;
    deptCell.protection = { locked: true };

    const posCell = ws.getCell(row, 4);
    posCell.value = emp.positionName;
    posCell.border = thinBorder;
    posCell.alignment = centerAlign;
    posCell.protection = { locked: true };

    const hrsRefs: string[] = [];

    for (let di = 0; di < dates.length; di++) {
      const date = dates[di]!;
      const past = isBefore(date, today);
      const weekend = isWeekend(date);
      const baseCol = FIXED_COLS + di * 3 + 1;

      const inCol = baseCol;
      const outCol = baseCol + 1;
      const hrsCol = baseCol + 2;

      const inCell = ws.getCell(row, inCol);
      const outCell = ws.getCell(row, outCol);
      const hrsCell = ws.getCell(row, hrsCol);

      const inLetter = columnLetter(inCol);
      const outLetter = columnLetter(outCol);
      const hrsLetter = columnLetter(hrsCol);

      hrsRefs.push(`${hrsLetter}${row}`);

      const entry = schedule[emp.code]?.[dateKey(date)];

      if (past) {
        inCell.value = entry?.clockIn ?? '';
        outCell.value = entry?.clockOut ?? '';
        hrsCell.value = entry?.hours ?? 0;
        hrsCell.numFmt = HOURS_FMT;

        for (const c of [inCell, outCell, hrsCell]) {
          c.fill = PAST_CELL_FILL;
          c.border = thinBorder;
          c.alignment = centerAlign;
          c.protection = { locked: true };
        }
      } else {
        inCell.value = entry?.clockIn ?? '';
        outCell.value = entry?.clockOut ?? '';

        hrsCell.value = {
          formula: `IF(OR(${inLetter}${row}="",${outLetter}${row}=""),0,IF(TIMEVALUE(${outLetter}${row})>=TIMEVALUE(${inLetter}${row}),(TIMEVALUE(${outLetter}${row})-TIMEVALUE(${inLetter}${row}))*24,(TIMEVALUE(${outLetter}${row})-TIMEVALUE(${inLetter}${row})+1)*24))`,
        };
        hrsCell.numFmt = HOURS_FMT;

        for (const c of [inCell, outCell]) {
          c.border = thinBorder;
          c.alignment = centerAlign;
          c.protection = { locked: false };
          c.dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: ['TimeValues!$A$1:$A$96'],
            showErrorMessage: true,
            errorTitle: 'Invalid Time',
            error: 'Please select a valid time from the list.',
          };
        }

        hrsCell.border = thinBorder;
        hrsCell.alignment = centerAlign;
        hrsCell.protection = { locked: true };

        if (weekend) {
          for (const c of [inCell, outCell, hrsCell]) {
            c.fill = WEEKEND_FILL;
          }
        }
      }
    }

    const totalCell = ws.getCell(row, TOTAL_COL);
    if (hrsRefs.length > 0) {
      totalCell.value = { formula: `SUM(${hrsRefs.join(',')})` };
    } else {
      totalCell.value = 0;
    }
    totalCell.numFmt = HOURS_FMT;
    totalCell.fill = TOTAL_FILL;
    totalCell.font = TOTAL_FONT;
    totalCell.border = thinBorder;
    totalCell.alignment = centerAlign;
    totalCell.protection = { locked: true };
  }

  // =========================================================================
  // Named ranges
  // =========================================================================
  const lastDataRow = DATA_START_ROW + employees.length - 1;
  workbook.definedNames.add(
    'EmployeeList',
    `'Labor Schedule'!$A$${DATA_START_ROW}:$A$${lastDataRow}`,
  );
  workbook.definedNames.add('TimeValueList', 'TimeValues!$A$1:$A$96');

  // =========================================================================
  // Conditional formatting: weekend / past-date data columns
  //
  // DATE(y,m,d)<TODAY() re-evaluates dynamically when Excel recalculates, so
  // a cell exported as "future" today will flip to past styling automatically.
  // Past-date gets priority 1 (wins over weekend when both conditions are true).
  // =========================================================================
  for (let di = 0; di < dates.length; di++) {
    const date = dates[di]!;
    const baseCol = FIXED_COLS + di * 3 + 1;
    const endCol = baseCol + 2;
    const startLetter = columnLetter(baseCol);
    const endLetter = columnLetter(endCol);
    const cfRef = `${startLetter}${DATA_START_ROW}:${endLetter}${lastDataRow}`;

    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();

    ws.addConditionalFormatting({
      ref: cfRef,
      rules: [
        {
          type: 'expression',
          formulae: [`DATE(${y},${m},${d})<TODAY()`],
          style: { fill: PAST_CELL_FILL },
          priority: 1,
        },
      ],
    });

    if (isWeekend(date)) {
      ws.addConditionalFormatting({
        ref: cfRef,
        rules: [
          {
            type: 'expression',
            formulae: [`WEEKDAY(DATE(${y},${m},${d}),2)>=6`],
            style: { fill: WEEKEND_FILL },
            priority: 2,
          },
        ],
      });
    }
  }

  // =========================================================================
  // Frozen panes: G3 (xSplit=6 → columns A–F, ySplit=2 → rows 1–2)
  // =========================================================================
  ws.views = [{ state: 'frozen', xSplit: 6, ySplit: 2, topLeftCell: 'G3' }];

  // =========================================================================
  // Sheet protection
  // =========================================================================
  await ws.protect('', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertColumns: false,
    insertRows: false,
    insertHyperlinks: false,
    deleteColumns: false,
    deleteRows: false,
    sort: false,
    autoFilter: false,
    pivotTables: false,
  });

  // ExcelJS Buffer type extends ArrayBuffer; Node Buffer extends Uint8Array.
  // Types diverge but are runtime-compatible — same pattern as parser.ts.
  return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function columnLetter(col: number): string {
  let result = '';
  let c = col;
  while (c > 0) {
    const rem = (c - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    c = Math.floor((c - 1) / 26);
  }
  return result;
}
