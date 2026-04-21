import * as ExcelJS from 'exceljs'

export interface ImportRecord {
  employeeCode: string
  firstName: string
  lastName: string
  deptName: string
  positionName: string
  date: string
  clockIn: string
  clockOut: string
  hours: number | null
}

export interface ImportPreview {
  dates: string[]
  dateRange: string
  employeeCount: number
  employees: string[]
  recordCount: number
  records: ImportRecord[]
}

/**
 * Month name abbreviations used in the date headers.
 */
const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

/**
 * Extract a plain string value from an ExcelJS cell.
 * Handles formula results, rich text, and plain values.
 */
function cellString(cell: ExcelJS.Cell): string {
  const v = cell.value
  if (v == null) return ''

  // Formula cell — use the cached result
  if (typeof v === 'object' && 'result' in v) {
    return v.result != null ? String(v.result) : ''
  }

  // Rich text
  if (typeof v === 'object' && 'richText' in v) {
    return (v as ExcelJS.CellRichTextValue).richText.map(r => r.text).join('')
  }

  return String(v)
}

/**
 * Extract a numeric value from an ExcelJS cell, returning null if not a number.
 */
function cellNumber(cell: ExcelJS.Cell): number | null {
  const v = cell.value
  if (v == null) return null

  if (typeof v === 'number') return v

  if (typeof v === 'object' && 'result' in v) {
    const r = (v as ExcelJS.CellFormulaValue).result
    if (typeof r === 'number') return r
    if (typeof r === 'string') {
      const n = parseFloat(r)
      return isNaN(n) ? null : n
    }
    return null
  }

  if (typeof v === 'string') {
    const n = parseFloat(v)
    return isNaN(n) ? null : n
  }

  return null
}

/**
 * Parse a date header like "Apr 16 (Wed)" into a Date, inferring the year.
 */
function parseDateHeader(header: string, referenceDate: Date): Date | null {
  const match = header.match(/([A-Za-z]+)\s+(\d+)/)
  if (!match) return null

  const monthStr = match[1].toLowerCase()
  const day = parseInt(match[2], 10)
  const month = MONTH_MAP[monthStr]
  if (month === undefined || isNaN(day)) return null

  const refYear = referenceDate.getFullYear()
  let date = new Date(refYear, month, day)

  // If the date is more than 6 months from reference, adjust year
  const diffMs = date.getTime() - referenceDate.getTime()
  const sixMonthsMs = 6 * 30 * 24 * 60 * 60 * 1000
  if (diffMs > sixMonthsMs) {
    date = new Date(refYear - 1, month, day)
  } else if (diffMs < -sixMonthsMs) {
    date = new Date(refYear + 1, month, day)
  }

  return date
}

/**
 * Format a Date as "YYYY-MM-DD".
 */
function formatISODate(date: Date): string {
  const y = date.getFullYear()
  const m = (date.getMonth() + 1).toString().padStart(2, '0')
  const d = date.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Parse a schedule Excel file (exported by exportScheduleToExcel) and return
 * a structured preview of all records.
 */
export async function parseScheduleExcel(buffer: Buffer): Promise<ImportPreview> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)

  const ws = workbook.getWorksheet(1)
  if (!ws) {
    throw new Error('Workbook contains no worksheets')
  }

  const now = new Date()

  // ---------------------------------------------------------------------------
  // 1. Parse date columns starting from column 6, row 1
  //    Each date header spans 3 columns (In, Out, Hrs).
  // ---------------------------------------------------------------------------
  const FIXED_COLS = 5
  const DATE_HEADER_ROW = 1
  const parsedDates: Date[] = []
  const dateStrings: string[] = []

  let col = FIXED_COLS + 1 // column 6 (F)
  while (true) {
    const headerValue = cellString(ws.getCell(DATE_HEADER_ROW, col))
    if (!headerValue.trim()) break

    const date = parseDateHeader(headerValue, now)
    if (!date) break

    parsedDates.push(date)
    dateStrings.push(formatISODate(date))

    col += 3 // skip to next date group
  }

  // ---------------------------------------------------------------------------
  // 2. Parse employee rows starting from row 3
  // ---------------------------------------------------------------------------
  const EMP_START_ROW = 3
  const records: ImportRecord[] = []
  const employeeNames: Set<string> = new Set()

  let row = EMP_START_ROW
  while (true) {
    const nameValue = cellString(ws.getCell(row, 1)).trim()
    const codeValue = cellString(ws.getCell(row, 2)).trim()

    // Stop when we hit an empty row (no name and no code)
    if (!nameValue && !codeValue) break

    // Parse "LastName, FirstName"
    let firstName = ''
    let lastName = ''
    if (nameValue.includes(',')) {
      const parts = nameValue.split(',', 2)
      lastName = parts[0].trim()
      firstName = parts[1].trim()
    } else {
      lastName = nameValue
    }

    const deptName = cellString(ws.getCell(row, 3)).trim()
    const positionName = cellString(ws.getCell(row, 4)).trim()

    const displayName = nameValue || codeValue
    employeeNames.add(displayName)

    // Read each date group
    for (let di = 0; di < parsedDates.length; di++) {
      const baseCol = FIXED_COLS + di * 3 + 1
      const clockIn = cellString(ws.getCell(row, baseCol)).trim()
      const clockOut = cellString(ws.getCell(row, baseCol + 1)).trim()
      const hours = cellNumber(ws.getCell(row, baseCol + 2))

      // Only include records that have at least some data
      if (clockIn || clockOut || (hours != null && hours !== 0)) {
        records.push({
          employeeCode: codeValue,
          firstName,
          lastName,
          deptName,
          positionName,
          date: dateStrings[di],
          clockIn,
          clockOut,
          hours,
        })
      }
    }

    row++
  }

  // ---------------------------------------------------------------------------
  // 3. Build the preview
  // ---------------------------------------------------------------------------
  const sortedEmployees = Array.from(employeeNames).sort()

  let dateRange = ''
  if (dateStrings.length > 0) {
    dateRange = dateStrings.length === 1
      ? dateStrings[0]
      : `${dateStrings[0]} to ${dateStrings[dateStrings.length - 1]}`
  }

  return {
    dates: dateStrings,
    dateRange,
    employeeCount: sortedEmployees.length,
    employees: sortedEmployees,
    recordCount: records.length,
    records,
  }
}
