import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { cleanDeptName } from '@/lib/domain/rules';
import { buildHistory } from '@/lib/domain/payroll';
import type { EmployeeHistory } from '@/lib/domain/types';

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
  `);

  return buildHistory(rows.map((r) => ({ date: r.Date, hours: Number(r.Hours) })));
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
  `);

  const groups = new Map<string, { date: Date; hours: number }[]>();
  const groupMeta = new Map<string, { deptName: string; positionName: string }>();

  for (const row of rows) {
    const dept = cleanDeptName(row.DeptName ?? '');
    const pos = row.PositionName ?? '';
    const key = `${dept}|||${pos}`;

    if (!groups.has(key)) {
      groups.set(key, []);
      groupMeta.set(key, { deptName: dept, positionName: pos });
    }
    groups.get(key)!.push({ date: row.Date, hours: Number(row.Hours) });
  }

  const results: EmployeeHistory[] = [];

  for (const [key, groupRows] of groups) {
    const history = buildHistory(groupRows);
    if (!history) continue;

    const meta = groupMeta.get(key)!;
    history.deptName = meta.deptName;
    history.positionName = meta.positionName;
    results.push(history);
  }

  results.sort((a, b) => b.avgWeeklyHours - a.avgWeeklyHours);

  return results;
}
