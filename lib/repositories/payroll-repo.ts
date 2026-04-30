import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { buildHistory } from '@/lib/domain/payroll';
import { cleanDeptName } from '@/lib/domain/rules';
import type { EmployeeHistory } from '@/lib/domain/types';

export type PayrollWindow = EmployeeHistory | null;

export interface PayrollTenant {
  tenant: string;
  hotelName: string;
  usrSystemCompanyId: string;
  branchId: number;
}

export interface PayrollEmployee {
  employeeCode: string;
  firstName: string;
  lastName: string;
  deptName: string;
  positionName: string;
}

export class PayrollRepo {
  constructor(private readonly db: Prisma.TransactionClient = prisma) {}

  async findTenants(): Promise<PayrollTenant[]> {
    return this.db.$queryRaw<PayrollTenant[]>(Prisma.sql`
      SELECT DISTINCT
        o.OrganizationName AS tenant,
        o.HotelName        AS hotelName,
        p.UsrSystemCompanyID AS usrSystemCompanyId,
        p.BranchID         AS branchId
      FROM BI_Payroll p
      INNER JOIN HIA_BIOrganizationName o
        ON p.UsrSystemCompanyID = o.UsrSystemCompanyID
      WHERE p.Hours > 0
    `);
  }

  async findEmployees(usrSystemCompanyId: string): Promise<PayrollEmployee[]> {
    return this.db.$queryRaw<PayrollEmployee[]>(Prisma.sql`
      SELECT DISTINCT
        EmployeeCode  AS employeeCode,
        FirstName     AS firstName,
        LastName      AS lastName,
        DeptName      AS deptName,
        PositionName  AS positionName
      FROM BI_Payroll
      WHERE UsrSystemCompanyID = ${usrSystemCompanyId}
        AND Hours > 0
        AND [Date] >= DATEADD(day, -14, GETDATE())
    `);
  }

  async findEmployeeHistory(
    usrSystemCompanyId: string,
    employeeCode: string,
  ): Promise<EmployeeHistory | null> {
    const rows = await this.db.$queryRaw<{ Date: Date; Hours: number }[]>(Prisma.sql`
      SELECT [Date], Hours
      FROM BI_Payroll
      WHERE UsrSystemCompanyID = ${usrSystemCompanyId}
        AND EmployeeCode        = ${employeeCode}
        AND EarningCode         = 'REGULAR'
        AND Hours > 0
        AND [Date] >= DATEADD(day, -30, GETDATE())
    `);

    return buildHistory(rows.map((r) => ({ date: r.Date, hours: Number(r.Hours) })));
  }

  async findEmployeeHistoryByPosition(
    usrSystemCompanyId: string,
    employeeCode: string,
  ): Promise<EmployeeHistory[]> {
    const rows = await this.db.$queryRaw<
      { Date: Date; Hours: number; DeptName: string; PositionName: string }[]
    >(Prisma.sql`
      SELECT [Date], Hours, DeptName, PositionName
      FROM BI_Payroll
      WHERE UsrSystemCompanyID = ${usrSystemCompanyId}
        AND EmployeeCode        = ${employeeCode}
        AND EarningCode         = 'REGULAR'
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

  /**
   * Batch fetch of position-split histories for N employees.
   * Returns Map<employeeCode, EmployeeHistory[]> where empty array means no positions found.
   */
  async findPositionWindows(
    usrSystemCompanyId: string,
    employeeCodes: string[],
  ): Promise<Map<string, EmployeeHistory[]>> {
    if (employeeCodes.length === 0) return new Map();

    const rows = await this.db.$queryRaw<
      { EmployeeCode: string; Date: Date; Hours: number; DeptName: string; PositionName: string }[]
    >(Prisma.sql`
      SELECT EmployeeCode, [Date], Hours, DeptName, PositionName
      FROM BI_Payroll
      WHERE UsrSystemCompanyID = ${usrSystemCompanyId}
        AND EmployeeCode IN (${Prisma.join(employeeCodes)})
        AND EarningCode  = 'REGULAR'
        AND Hours > 0
        AND [Date] >= DATEADD(day, -30, GETDATE())
    `);

    const grouped = new Map<string, Map<string, { date: Date; hours: number }[]>>();
    const meta = new Map<string, Map<string, { deptName: string; positionName: string }>>();

    for (const row of rows) {
      const code = row.EmployeeCode;
      const dept = cleanDeptName(row.DeptName ?? '');
      const pos = row.PositionName ?? '';
      const posKey = `${dept}|||${pos}`;

      if (!grouped.has(code)) {
        grouped.set(code, new Map());
        meta.set(code, new Map());
      }
      if (!grouped.get(code)!.has(posKey)) {
        grouped.get(code)!.set(posKey, []);
        meta.get(code)!.set(posKey, { deptName: dept, positionName: pos });
      }
      grouped
        .get(code)!
        .get(posKey)!
        .push({ date: row.Date, hours: Number(row.Hours) });
    }

    const result = new Map<string, EmployeeHistory[]>();
    for (const code of employeeCodes) {
      const posGroups = grouped.get(code);
      if (!posGroups) {
        result.set(code, []);
        continue;
      }

      const histories: EmployeeHistory[] = [];
      for (const [posKey, groupRows] of posGroups) {
        const history = buildHistory(groupRows);
        if (!history) continue;
        const m = meta.get(code)!.get(posKey)!;
        history.deptName = m.deptName;
        history.positionName = m.positionName;
        histories.push(history);
      }
      histories.sort((a, b) => b.avgWeeklyHours - a.avgWeeklyHours);
      result.set(code, histories);
    }

    return result;
  }

  /**
   * Batch fetch for schedule generation: one query for N employees.
   * Fixes the per-employee N+1 in /generate.
   */
  async findPayrollWindows(
    usrSystemCompanyId: string,
    employeeCodes: string[],
  ): Promise<Map<string, PayrollWindow>> {
    if (employeeCodes.length === 0) return new Map();

    const rows = await this.db.$queryRaw<
      { EmployeeCode: string; Date: Date; Hours: number }[]
    >(Prisma.sql`
      SELECT EmployeeCode, [Date], Hours
      FROM BI_Payroll
      WHERE UsrSystemCompanyID = ${usrSystemCompanyId}
        AND EmployeeCode IN (${Prisma.join(employeeCodes)})
        AND EarningCode  = 'REGULAR'
        AND Hours > 0
        AND [Date] >= DATEADD(day, -30, GETDATE())
    `);

    const grouped = new Map<string, { date: Date; hours: number }[]>();
    for (const row of rows) {
      const code = row.EmployeeCode;
      if (!grouped.has(code)) grouped.set(code, []);
      grouped.get(code)!.push({ date: row.Date, hours: Number(row.Hours) });
    }

    const result = new Map<string, PayrollWindow>();
    for (const code of employeeCodes) {
      result.set(code, buildHistory(grouped.get(code) ?? []));
    }

    return result;
  }
}

export function makePayrollRepo(db: Prisma.TransactionClient = prisma): PayrollRepo {
  return new PayrollRepo(db);
}
