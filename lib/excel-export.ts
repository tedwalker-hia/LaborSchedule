import * as ExcelJS from 'exceljs'

/**
 * Generate the 96 time-slot options in 15-minute increments: "12:00 AM" through "11:45 PM".
 */
function generateTimeOptions(): string[] {
  const options: string[] = []
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const period = h < 12 ? 'AM' : 'PM'
      let displayHour = h % 12
      if (displayHour === 0) displayHour = 12
      const mm = m.toString().padStart(2, '0')
      options.push(`${displayHour}:${mm} ${period}`)
    }
  }
  return options
}

/**
 * Format a Date as "MMM DD (Day)" e.g. "Apr 21 (Mon)".
 */
function formatDateHeader(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const mon = months[date.getMonth()]
  const day = date.getDate().toString().padStart(2, '0')
  const dow = days[date.getDay()]
  return `${mon} ${day} (${dow})`
}

/**
 * Check whether two dates fall on the same calendar day.
 */
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate()
}

/**
 * Check whether a date is strictly before another date (by calendar day).
 */
function isBefore(date: Date, ref: Date): boolean {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const r = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())
  return d.getTime() < r.getTime()
}

/**
 * Check whether a date falls on Saturday or Sunday.
 */
function isWeekend(date: Date): boolean {
  const dow = date.getDay()
  return dow === 0 || dow === 6
}

// ---------------------------------------------------------------------------
// Style constants
// ---------------------------------------------------------------------------

const BORDER_COLOR = 'FFDDDDDD'

const thinBorder: Partial<ExcelJS.Borders> = {
  top:    { style: 'thin', color: { argb: BORDER_COLOR } },
  left:   { style: 'thin', color: { argb: BORDER_COLOR } },
  bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
  right:  { style: 'thin', color: { argb: BORDER_COLOR } },
}

const centerAlign: Partial<ExcelJS.Alignment> = {
  horizontal: 'center',
  vertical: 'middle',
}

function solidFill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

// Colors
const HEADER_FILL      = solidFill('FF003366')
const SUB_HEADER_FILL  = solidFill('FF004D80')
const PAST_HEADER_FILL = solidFill('FFE67E00')
const PAST_SUB_FILL    = solidFill('FFCC7000')
const WEEKEND_FILL     = solidFill('FFF5F0FF')
const PAST_CELL_FILL   = solidFill('FFFFF3E0')
const TOTAL_FILL       = solidFill('FFE6F4EA')

const WHITE_BOLD_FONT: Partial<ExcelJS.Font> = {
  color: { argb: 'FFFFFFFF' }, bold: true, size: 10,
}
const WHITE_FONT: Partial<ExcelJS.Font> = {
  color: { argb: 'FFFFFFFF' }, size: 10,
}
const TOTAL_FONT: Partial<ExcelJS.Font> = {
  color: { argb: 'FF2E7D32' }, bold: true, size: 10,
}

const HOURS_FMT = '0.00;-0.00;""'

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function exportScheduleToExcel(params: {
  hotel: string
  employees: {
    code: string
    firstName: string
    lastName: string
    deptName: string
    positionName: string
  }[]
  dates: Date[]
  schedule: Record<string, Record<string, { clockIn: string; clockOut: string; hours: number }>>
  today: Date
}): Promise<Buffer> {
  const { employees, dates, schedule, today } = params

  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('Labor Schedule')

  const timeOptions = generateTimeOptions()
  const timeValidationFormula = `"${timeOptions.join(',')}"`

  // Fixed columns: A=Employee, B=Code, C=Department, D=Position, E=Total Hrs
  const FIXED_COLS = 5
  const TOTAL_COL = 5

  // ---- Column widths ----
  ws.getColumn(1).width = 22  // Employee
  ws.getColumn(2).width = 12  // Code
  ws.getColumn(3).width = 18  // Department
  ws.getColumn(4).width = 18  // Position
  ws.getColumn(5).width = 12  // Total Hrs

  for (let di = 0; di < dates.length; di++) {
    const baseCol = FIXED_COLS + di * 3 + 1
    ws.getColumn(baseCol).width = 12      // In
    ws.getColumn(baseCol + 1).width = 12  // Out
    ws.getColumn(baseCol + 2).width = 8   // Hrs
  }

  // =========================================================================
  // Row 1 — Header
  // =========================================================================
  const headerRow = 1
  const fixedHeaders = ['Employee', 'Code', 'Department', 'Position', 'Total Hrs']

  for (let ci = 0; ci < fixedHeaders.length; ci++) {
    const cell = ws.getCell(headerRow, ci + 1)
    cell.value = fixedHeaders[ci]
    cell.fill = ci === TOTAL_COL - 1 ? TOTAL_FILL : HEADER_FILL
    cell.font = ci === TOTAL_COL - 1 ? TOTAL_FONT : WHITE_BOLD_FONT
    cell.border = thinBorder
    cell.alignment = centerAlign
    // Merge rows 1-2 for fixed headers
    ws.mergeCells(headerRow, ci + 1, headerRow + 1, ci + 1)
  }

  // Date headers — each spans 3 columns, merged across row 1
  for (let di = 0; di < dates.length; di++) {
    const date = dates[di]
    const past = isBefore(date, today)
    const baseCol = FIXED_COLS + di * 3 + 1
    const endCol = baseCol + 2

    ws.mergeCells(headerRow, baseCol, headerRow, endCol)
    const cell = ws.getCell(headerRow, baseCol)
    cell.value = formatDateHeader(date)
    cell.fill = past ? PAST_HEADER_FILL : HEADER_FILL
    cell.font = WHITE_BOLD_FONT
    cell.border = thinBorder
    cell.alignment = centerAlign
  }

  // =========================================================================
  // Row 2 — Sub-headers (In / Out / Hrs per date)
  // =========================================================================
  const subHeaderRow = 2
  const subLabels = ['In', 'Out', 'Hrs']

  for (let di = 0; di < dates.length; di++) {
    const date = dates[di]
    const past = isBefore(date, today)
    const baseCol = FIXED_COLS + di * 3 + 1

    for (let si = 0; si < 3; si++) {
      const cell = ws.getCell(subHeaderRow, baseCol + si)
      cell.value = subLabels[si]
      cell.fill = past ? PAST_SUB_FILL : SUB_HEADER_FILL
      cell.font = WHITE_FONT
      cell.border = thinBorder
      cell.alignment = centerAlign
    }
  }

  // =========================================================================
  // Row 3+ — Employee data
  // =========================================================================
  const DATA_START_ROW = 3

  for (let ei = 0; ei < employees.length; ei++) {
    const emp = employees[ei]
    const row = DATA_START_ROW + ei
    const dateKey = (d: Date) => d.toISOString().slice(0, 10) // YYYY-MM-DD

    // Fixed cells
    const nameCell = ws.getCell(row, 1)
    nameCell.value = `${emp.lastName}, ${emp.firstName}`
    nameCell.border = thinBorder
    nameCell.alignment = { ...centerAlign, horizontal: 'left' }
    nameCell.protection = { locked: true }

    const codeCell = ws.getCell(row, 2)
    codeCell.value = emp.code
    codeCell.border = thinBorder
    codeCell.alignment = centerAlign
    codeCell.protection = { locked: true }

    const deptCell = ws.getCell(row, 3)
    deptCell.value = emp.deptName
    deptCell.border = thinBorder
    deptCell.alignment = centerAlign
    deptCell.protection = { locked: true }

    const posCell = ws.getCell(row, 4)
    posCell.value = emp.positionName
    posCell.border = thinBorder
    posCell.alignment = centerAlign
    posCell.protection = { locked: true }

    // Collect Hrs column references for SUM formula
    const hrsRefs: string[] = []

    for (let di = 0; di < dates.length; di++) {
      const date = dates[di]
      const past = isBefore(date, today)
      const weekend = isWeekend(date)
      const baseCol = FIXED_COLS + di * 3 + 1

      const inCol = baseCol
      const outCol = baseCol + 1
      const hrsCol = baseCol + 2

      const inCell = ws.getCell(row, inCol)
      const outCell = ws.getCell(row, outCol)
      const hrsCell = ws.getCell(row, hrsCol)

      // Get the column letters for formula references
      const inLetter = columnLetter(inCol)
      const outLetter = columnLetter(outCol)
      const hrsLetter = columnLetter(hrsCol)

      hrsRefs.push(`${hrsLetter}${row}`)

      const entry = schedule[emp.code]?.[dateKey(date)]

      if (past) {
        // Static values for past dates
        inCell.value = entry?.clockIn ?? ''
        outCell.value = entry?.clockOut ?? ''
        hrsCell.value = entry?.hours ?? 0
        hrsCell.numFmt = HOURS_FMT

        // Style — locked, amber fill
        for (const c of [inCell, outCell, hrsCell]) {
          c.fill = PAST_CELL_FILL
          c.border = thinBorder
          c.alignment = centerAlign
          c.protection = { locked: true }
        }
      } else {
        // Future / today — editable In/Out, formula for Hrs
        inCell.value = entry?.clockIn ?? ''
        outCell.value = entry?.clockOut ?? ''

        // Hours formula
        hrsCell.value = {
          formula: `IF(OR(${inLetter}${row}="",${outLetter}${row}=""),0,IF(TIMEVALUE(${outLetter}${row})>=TIMEVALUE(${inLetter}${row}),(TIMEVALUE(${outLetter}${row})-TIMEVALUE(${inLetter}${row}))*24,(TIMEVALUE(${outLetter}${row})-TIMEVALUE(${inLetter}${row})+1)*24))`,
        }
        hrsCell.numFmt = HOURS_FMT

        // In/Out cells: unlocked, with validation
        for (const c of [inCell, outCell]) {
          c.border = thinBorder
          c.alignment = centerAlign
          c.protection = { locked: false }
          c.dataValidation = {
            type: 'list',
            formulae: [timeValidationFormula],
            showErrorMessage: true,
            errorTitle: 'Invalid Time',
            error: 'Please select a valid time from the list.',
          }
        }

        // Hrs cell: locked (formula)
        hrsCell.border = thinBorder
        hrsCell.alignment = centerAlign
        hrsCell.protection = { locked: true }

        // Weekend fill for future cells
        if (weekend) {
          for (const c of [inCell, outCell, hrsCell]) {
            c.fill = WEEKEND_FILL
          }
        }
      }
    }

    // Total Hrs cell — SUM formula
    const totalCell = ws.getCell(row, TOTAL_COL)
    if (hrsRefs.length > 0) {
      totalCell.value = { formula: `SUM(${hrsRefs.join(',')})` }
    } else {
      totalCell.value = 0
    }
    totalCell.numFmt = HOURS_FMT
    totalCell.fill = TOTAL_FILL
    totalCell.font = TOTAL_FONT
    totalCell.border = thinBorder
    totalCell.alignment = centerAlign
    totalCell.protection = { locked: true }
  }

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
  })

  // =========================================================================
  // Write to buffer
  // =========================================================================
  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a 1-based column number to an Excel column letter (1 -> A, 27 -> AA, etc.).
 */
function columnLetter(col: number): string {
  let result = ''
  let c = col
  while (c > 0) {
    const rem = (c - 1) % 26
    result = String.fromCharCode(65 + rem) + result
    c = Math.floor((c - 1) / 26)
  }
  return result
}
