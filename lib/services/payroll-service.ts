import { PrismaClient } from '@prisma/client';
import { prisma } from '../prisma';
import type { EmployeeHistory } from '@/lib/domain/types';
import {
  PayrollRepo,
  makePayrollRepo,
  type PayrollTenant,
  type PayrollEmployee,
} from '../repositories/payroll-repo';

export interface ListEmployeesParams {
  usrSystemCompanyId: string;
}

export interface SeedEmployee {
  code: string;
  firstName: string;
  lastName: string;
  deptName?: string | null;
  positionName?: string | null;
}

export interface SeedParams {
  usrSystemCompanyId: string;
  branchId?: number | null;
  hotelName?: string | null;
  tenant?: string | null;
  employees: SeedEmployee[];
}

export interface SeedResult {
  seeded: number;
  skipped: number;
}

export interface GetHistoryParams {
  usrSystemCompanyId: string;
  employeeCode: string;
}

export class PayrollService {
  constructor(
    private readonly repo: PayrollRepo,
    private readonly db: PrismaClient = prisma,
  ) {}

  async listTenants(): Promise<PayrollTenant[]> {
    return this.repo.findTenants();
  }

  async listEmployees(params: ListEmployeesParams): Promise<PayrollEmployee[]> {
    return this.repo.findEmployees(params.usrSystemCompanyId);
  }

  /**
   * Seeds employees into the schedule table for today.
   * Idempotent: checks natural key (usrSystemCompanyId, employeeCode, scheduleDate, positionName)
   * before inserting, so calling twice produces no duplicates.
   *
   * Uses findFirst + create rather than Prisma upsert because positionName can be null and
   * the DB-level uniqueness is a filtered index (WHERE PositionName IS NOT NULL), making
   * Prisma's MERGE-based upsert unreliable for the null case.
   */
  async seed(params: SeedParams): Promise<SeedResult> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    let seeded = 0;
    let skipped = 0;

    for (const emp of params.employees) {
      const positionName = emp.positionName || null;

      const existing = await this.db.laborSchedule.findFirst({
        where: {
          usrSystemCompanyId: params.usrSystemCompanyId,
          employeeCode: emp.code,
          scheduleDate: today,
          positionName,
        },
        select: { id: true },
      });

      if (existing) {
        skipped++;
        continue;
      }

      await this.db.laborSchedule.create({
        data: {
          usrSystemCompanyId: params.usrSystemCompanyId,
          branchId: params.branchId,
          hotelName: params.hotelName,
          employeeCode: emp.code,
          firstName: emp.firstName,
          lastName: emp.lastName,
          scheduleDate: today,
          tenant: params.tenant,
          deptName: emp.deptName || null,
          positionName,
        },
      });
      seeded++;
    }

    return { seeded, skipped };
  }

  async getHistory(params: GetHistoryParams): Promise<EmployeeHistory | null> {
    return this.repo.findEmployeeHistory(params.usrSystemCompanyId, params.employeeCode);
  }
}

export function makePayrollService(
  repo: PayrollRepo = makePayrollRepo(),
  db: PrismaClient = prisma,
): PayrollService {
  return new PayrollService(repo, db);
}
