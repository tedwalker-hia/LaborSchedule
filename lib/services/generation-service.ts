import { PrismaClient } from '@prisma/client';
import { prisma } from '../prisma';
import { generateClockTimes } from '@/lib/schedule-utils';
import type { EmployeeHistory } from '@/lib/domain/types';
import { PayrollRepo, makePayrollRepo } from '../repositories/payroll-repo';
import { toMondayBased } from '@/lib/domain/payroll';
import { calcHours, shouldScheduleDow } from '@/lib/domain/rules';
import { AuditService, AuditCtx, makeAuditService } from './audit-service';

export interface GenerateParams {
  usrSystemCompanyId: string;
  hotel?: string | null;
  branchId?: number | null;
  tenant?: string | null;
  employeeCodes: string[];
  startDate: string;
  endDate: string;
  overwriteLocked?: boolean;
}

export interface GenerateResult {
  inserted: number;
  skipped: number;
  skippedEmployees: string[];
}

export interface SplitByPositionParams {
  usrSystemCompanyId: string;
  branchId?: number | null;
  hotel?: string | null;
  tenant?: string | null;
  employeeCode: string;
  firstName: string;
  lastName: string;
  scheduleDate: Date;
  positionHistories: EmployeeHistory[];
}

export interface ScheduleCreateData {
  usrSystemCompanyId: string;
  branchId?: number | null;
  hotelName?: string | null;
  employeeCode: string;
  firstName?: string | null;
  lastName?: string | null;
  scheduleDate: Date;
  clockIn: string | null;
  clockOut: string | null;
  hours: number | null;
  tenant?: string | null;
  deptName: string | null;
  multiDept: boolean;
  positionName: string | null;
}

function dateRange(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export class GenerationService {
  constructor(
    private readonly payrollRepo: PayrollRepo,
    private readonly db: PrismaClient = prisma,
    private readonly auditService: AuditService = makeAuditService(),
  ) {}

  /** Builds one create-data record per qualifying position for a single employee+date. */
  splitByPosition(params: SplitByPositionParams): ScheduleCreateData[] {
    const { scheduleDate, positionHistories } = params;
    const dow = toMondayBased(scheduleDate.getUTCDay());
    const records: ScheduleCreateData[] = [];

    for (const posHistory of positionHistories) {
      if (!posHistory.workDays.includes(dow)) continue;

      const avgHours = posHistory.avgByDow[dow] ?? 0;
      if (!shouldScheduleDow(avgHours)) continue;

      const times = generateClockTimes(avgHours);
      if (!times) continue;

      records.push({
        usrSystemCompanyId: params.usrSystemCompanyId,
        branchId: params.branchId,
        hotelName: params.hotel,
        employeeCode: params.employeeCode,
        firstName: params.firstName,
        lastName: params.lastName,
        scheduleDate,
        clockIn: times.clockIn,
        clockOut: times.clockOut,
        hours: calcHours(times.clockIn, times.clockOut),
        tenant: params.tenant,
        deptName: posHistory.deptName || null,
        multiDept: true,
        positionName: posHistory.positionName || null,
      });
    }

    return records;
  }

  async generate(params: GenerateParams, ctx: AuditCtx): Promise<GenerateResult> {
    const {
      usrSystemCompanyId,
      hotel,
      branchId,
      tenant,
      employeeCodes,
      overwriteLocked = false,
    } = params;

    if (employeeCodes.length === 0) {
      return { inserted: 0, skipped: 0, skippedEmployees: [] };
    }

    const start = new Date(params.startDate + 'T00:00:00Z');
    const end = new Date(params.endDate + 'T00:00:00Z');
    const dates = dateRange(start, end);

    // Batch: employee names
    const nameRows = await this.db.laborSchedule.findMany({
      where: { usrSystemCompanyId, employeeCode: { in: employeeCodes } },
      distinct: ['employeeCode'],
      select: { employeeCode: true, firstName: true, lastName: true },
    });
    const nameMap = new Map(
      nameRows.map((r) => [
        r.employeeCode,
        { firstName: r.firstName ?? '', lastName: r.lastName ?? '' },
      ]),
    );

    // Batch: position-split histories for all employees (single query, N+1 fix)
    const positionWindowsMap = await this.payrollRepo.findPositionWindows(
      usrSystemCompanyId,
      employeeCodes,
    );

    // Batch: simple history as fallback for employees with no position rows
    const simpleWindowsMap = await this.payrollRepo.findPayrollWindows(
      usrSystemCompanyId,
      employeeCodes,
    );

    // Batch: locked records across the full date range (replaces N×D findFirst queries)
    const lockedRows = await this.db.laborSchedule.findMany({
      where: {
        usrSystemCompanyId,
        employeeCode: { in: employeeCodes },
        scheduleDate: { gte: start, lte: end },
        locked: true,
      },
      select: { employeeCode: true, scheduleDate: true },
    });
    const lockedSet = new Set<string>(
      lockedRows.map((r) => `${r.employeeCode}::${r.scheduleDate.toISOString()}`),
    );

    let inserted = 0;
    let skipped = 0;
    const skippedEmployees: string[] = [];

    for (const empCode of employeeCodes) {
      const positionHistories = positionWindowsMap.get(empCode) ?? [];
      const isMultiPosition = positionHistories.length > 1;

      if (positionHistories.length === 0 && !simpleWindowsMap.get(empCode)) {
        skippedEmployees.push(empCode);
        continue;
      }

      const { firstName = '', lastName = '' } = nameMap.get(empCode) ?? {};

      for (const date of dates) {
        const scheduleDate = new Date(date);
        const isLocked = lockedSet.has(`${empCode}::${scheduleDate.toISOString()}`);

        if (isLocked && !overwriteLocked) {
          skipped++;
          continue;
        }

        const lockedGuard = overwriteLocked ? {} : { OR: [{ locked: false }, { locked: null }] };

        if (isMultiPosition) {
          await this.db.laborSchedule.deleteMany({
            where: { usrSystemCompanyId, employeeCode: empCode, scheduleDate, ...lockedGuard },
          });

          const records = this.splitByPosition({
            usrSystemCompanyId,
            branchId,
            hotel,
            tenant,
            employeeCode: empCode,
            firstName,
            lastName,
            scheduleDate,
            positionHistories,
          });

          for (const data of records) {
            await this.db.laborSchedule.create({ data });
            inserted++;
          }
        } else {
          const history = positionHistories[0] ?? simpleWindowsMap.get(empCode)!;
          const dow = toMondayBased(date.getUTCDay());

          if (!history.workDays.includes(dow)) continue;

          const avgHours = history.avgByDow[dow] ?? 0;
          if (!shouldScheduleDow(avgHours)) continue;

          const times = generateClockTimes(avgHours);
          if (!times) continue;

          await this.db.laborSchedule.deleteMany({
            where: { usrSystemCompanyId, employeeCode: empCode, scheduleDate, ...lockedGuard },
          });

          await this.db.laborSchedule.create({
            data: {
              usrSystemCompanyId,
              branchId,
              hotelName: hotel,
              employeeCode: empCode,
              firstName,
              lastName,
              scheduleDate,
              clockIn: times.clockIn,
              clockOut: times.clockOut,
              hours: calcHours(times.clockIn, times.clockOut),
              tenant,
              deptName: history.deptName || null,
              multiDept: false,
              positionName: history.positionName || null,
            },
          });
          inserted++;
        }
      }
    }

    await this.auditService.record({
      scheduleId: null,
      changedByUserId: ctx.userId,
      action: 'schedule.generate',
      oldJson: null,
      newJson: JSON.stringify({
        employeeCount: employeeCodes.length,
        startDate: params.startDate,
        endDate: params.endDate,
        inserted,
        skipped,
      }),
    });

    return { inserted, skipped, skippedEmployees };
  }
}

export function makeGenerationService(
  payrollRepo: PayrollRepo = makePayrollRepo(),
  db: PrismaClient = prisma,
  auditService: AuditService = makeAuditService(),
): GenerationService {
  return new GenerationService(payrollRepo, db, auditService);
}
