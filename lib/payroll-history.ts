import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { cleanDeptName } from '@/lib/schedule-utils'

export interface EmployeeHistory {
  avgByDow: Record<number, number>  // 0=Mon..6=Sun → avg hours
  workDays: number[]                // days sorted by frequency desc
  avgWeeklyHours: number
  totalDaysWorked: number
  avgDailyHours: number
  deptName?: string
  positionName?: string
}

/**
 * Convert JS getDay() (0=Sun) to 0=Mon..6=Sun.
 */
function toMondayBased(jsDay: number): number {
  return (jsDay + 6) % 7
}

/**
 * Get the ISO week number for a date.
 */
function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

/**
 * Build an EmployeeHistory summary from raw payroll rows.
 * Returns null if no rows are provided.
 */
export function buildHistory(
  rows: { date: Date; hours: number }[],
): EmployeeHistory | null {
  if (rows.length === 0) return null

  // Group hours by day-of-week (Monday-based)
  const hoursByDow: Record<number, number[]> = {}
  const dowCounts: Record<number, number> = {}
  const weekSet = new Set<string>()

  for (const row of rows) {
    const dow = toMondayBased(row.date.getDay())

    if (!hoursByDow[dow]) hoursByDow[dow] = []
    hoursByDow[dow].push(row.hours)

    dowCounts[dow] = (dowCounts[dow] || 0) + 1

    const yr = row.date.getFullYear()
    const wk = isoWeek(row.date)
    weekSet.add(`${yr}-W${wk}`)
  }

  // Average hours per DOW
  const avgByDow: Record<number, number> = {}
  for (const [dow, hrs] of Object.entries(hoursByDow)) {
    const sum = hrs.reduce((a, b) => a + b, 0)
    avgByDow[Number(dow)] = sum / hrs.length
  }

  // Sort work days by frequency descending, then by day number ascending
  const workDays = Object.keys(dowCounts)
    .map(Number)
    .sort((a, b) => {
      const freqDiff = dowCounts[b] - dowCounts[a]
      if (freqDiff !== 0) return freqDiff
      return a - b
    })

  const totalHours = rows.reduce((sum, r) => sum + r.hours, 0)
  const distinctWeeks = weekSet.size
  const avgWeeklyHours = distinctWeeks > 0 ? totalHours / distinctWeeks : 0

  return {
    avgByDow,
    workDays,
    avgWeeklyHours,
    totalDaysWorked: rows.length,
    avgDailyHours: totalHours / rows.length,
  }
}

/**
 * Fetch the last 30 days of REGULAR payroll for a single employee
 * and return their work-pattern history.
 */
export async function getEmployeeHistory(
  usrSystemCompanyId: string,
  employeeCode: string,
): Promise<EmployeeHistory | null> {
  const rows = await prisma.$queryRaw<{ Date: Date; Hours: number }[]>(Prisma.sql`
    SELECT [Date], Hours
    FROM BI_Payroll
    WHERE UsrSystemCompanyID = ${usrSystemCompanyId}
      AND EmployeeCode = ${employeeCode}
      AND EarningCode = 'REGULAR'
      AND Hours > 0
      AND [Date] >= DATEADD(day, -30, GETDATE())
  `)

  return buildHistory(
    rows.map((r) => ({ date: r.Date, hours: Number(r.Hours) })),
  )
}

/**
 * Fetch the last 30 days of REGULAR payroll for a single employee,
 * grouped by department/position. Returns an array of histories
 * sorted by avgWeeklyHours descending.
 */
export async function getEmployeeHistoryByPosition(
  usrSystemCompanyId: string,
  employeeCode: string,
): Promise<EmployeeHistory[]> {
  const rows = await prisma.$queryRaw<
    { Date: Date; Hours: number; DeptName: string; PositionName: string }[]
  >(Prisma.sql`
    SELECT [Date], Hours, DeptName, PositionName
    FROM BI_Payroll
    WHERE UsrSystemCompanyID = ${usrSystemCompanyId}
      AND EmployeeCode = ${employeeCode}
      AND EarningCode = 'REGULAR'
      AND Hours > 0
      AND [Date] >= DATEADD(day, -30, GETDATE())
  `)

  // Group by cleaned dept + position
  const groups = new Map<string, { date: Date; hours: number }[]>()
  const groupMeta = new Map<string, { deptName: string; positionName: string }>()

  for (const row of rows) {
    const dept = cleanDeptName(row.DeptName ?? '')
    const pos = row.PositionName ?? ''
    const key = `${dept}|||${pos}`

    if (!groups.has(key)) {
      groups.set(key, [])
      groupMeta.set(key, { deptName: dept, positionName: pos })
    }
    groups.get(key)!.push({ date: row.Date, hours: Number(row.Hours) })
  }

  const results: EmployeeHistory[] = []

  for (const [key, groupRows] of groups) {
    const history = buildHistory(groupRows)
    if (!history) continue

    const meta = groupMeta.get(key)!
    history.deptName = meta.deptName
    history.positionName = meta.positionName
    results.push(history)
  }

  results.sort((a, b) => b.avgWeeklyHours - a.avgWeeklyHours)

  return results
}
