/**
 * Integration tests for GenerationService.
 *
 * BI_Payroll does not exist in the integration test DB (it is an external BI
 * table, not part of the Prisma schema migrations). A stub PayrollRepo is
 * injected so generate() can exercise the real HIALaborSchedules mutations
 * without needing the BI table.
 *
 * Isolation: all rows use usrSystemCompanyId = 'INTTEST_GEN'.
 *
 * Date notes:
 *   - 2025-01-06 is a Monday (toMondayBased(1) = 0 in Monday-based indexing).
 *   - The stub returns workDays: [0] (Monday only) with avgByDow: { 0: 8 }.
 *   - shouldScheduleDow(8) = true; generateClockTimes(8) = { clockIn: '7:00 AM', clockOut: '3:00 PM' }.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GenerationService } from '@/lib/services/generation-service';
import type { EmployeeHistory } from '@/lib/domain/types';
import type { AuditCtx } from '@/lib/services/audit-service';

const COMPANY = 'INTTEST_GEN';
// Monday 6 Jan 2025
const MONDAY = '2025-01-06';
const CTX: AuditCtx = { userId: 1, source: 'api' };
const stubAuditService = { record: async () => {} } as any;

/** Minimal work-pattern history that schedules every Monday for 8 h. */
function mondayHistory(): EmployeeHistory {
  return {
    avgByDow: { 0: 8 },
    workDays: [0],
    avgWeeklyHours: 8,
    totalDaysWorked: 4,
    avgDailyHours: 8,
  };
}

let prisma: PrismaClient;

/** Returns a GenerationService wired to the real DB but with a stub PayrollRepo. */
function makeSvc(payrollMap: Map<string, EmployeeHistory | null>): GenerationService {
  const stubPayrollRepo = {
    findPositionWindows: async (_companyId: string, codes: string[]) => {
      const result = new Map<string, EmployeeHistory[]>();
      for (const code of codes) result.set(code, []);
      return result;
    },
    findPayrollWindows: async (_companyId: string, codes: string[]) => {
      const result = new Map<string, EmployeeHistory | null>();
      for (const code of codes) result.set(code, payrollMap.get(code) ?? null);
      return result;
    },
  } as any;

  return new GenerationService(stubPayrollRepo, prisma, stubAuditService);
}

beforeAll(() => {
  prisma = new PrismaClient();
});

afterAll(async () => {
  await prisma.laborSchedule.deleteMany({ where: { usrSystemCompanyId: COMPANY } });
  await prisma.$disconnect();
});

// ─── generate: happy path ────────────────────────────────────────────────────

describe('GenerationService.generate — happy path', () => {
  it('inserts schedule rows for each qualifying day in the range', async () => {
    const svc = makeSvc(new Map([['EGN01', mondayHistory()]]));

    const result = await svc.generate(
      {
        usrSystemCompanyId: COMPANY,
        employeeCodes: ['EGN01'],
        startDate: MONDAY,
        endDate: MONDAY,
      },
      CTX,
    );

    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.skippedEmployees).toHaveLength(0);

    const rows = await prisma.laborSchedule.findMany({
      where: { usrSystemCompanyId: COMPANY, employeeCode: 'EGN01' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.clockIn).toBe('7:00 AM');
    expect(rows[0]!.clockOut).toBe('3:00 PM');
  });

  it('skips employees with no payroll history', async () => {
    const svc = makeSvc(new Map([['EGN02', null]]));

    const result = await svc.generate(
      {
        usrSystemCompanyId: COMPANY,
        employeeCodes: ['EGN02'],
        startDate: MONDAY,
        endDate: MONDAY,
      },
      CTX,
    );

    expect(result.inserted).toBe(0);
    expect(result.skippedEmployees).toContain('EGN02');

    const count = await prisma.laborSchedule.count({
      where: { usrSystemCompanyId: COMPANY, employeeCode: 'EGN02' },
    });
    expect(count).toBe(0);
  });

  it('generates nothing for a date that does not match the work-day pattern', async () => {
    // Tuesday 7 Jan 2025; stub only has workDays: [0] (Monday)
    const svc = makeSvc(new Map([['EGN03', mondayHistory()]]));

    const result = await svc.generate(
      {
        usrSystemCompanyId: COMPANY,
        employeeCodes: ['EGN03'],
        startDate: '2025-01-07',
        endDate: '2025-01-07',
      },
      CTX,
    );

    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(0);
  });
});

// ─── generate: locked record handling ────────────────────────────────────────

describe('GenerationService.generate — locked records', () => {
  it('skips locked records when overwriteLocked=false', async () => {
    // Seed a locked record for EGN10 on the Monday
    await prisma.laborSchedule.create({
      data: {
        usrSystemCompanyId: COMPANY,
        employeeCode: 'EGN10',
        firstName: 'Locked',
        lastName: 'Employee',
        scheduleDate: new Date(`${MONDAY}T00:00:00`),
        clockIn: '6:00 AM',
        clockOut: '2:00 PM',
        locked: true,
      },
    });

    const svc = makeSvc(new Map([['EGN10', mondayHistory()]]));

    const result = await svc.generate(
      {
        usrSystemCompanyId: COMPANY,
        employeeCodes: ['EGN10'],
        startDate: MONDAY,
        endDate: MONDAY,
        overwriteLocked: false,
      },
      CTX,
    );

    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(1);

    // Locked record should remain unchanged
    const row = await prisma.laborSchedule.findFirst({
      where: { usrSystemCompanyId: COMPANY, employeeCode: 'EGN10' },
    });
    expect(row!.clockIn).toBe('6:00 AM');
    expect(row!.locked).toBe(true);
  });

  it('overwrites locked records when overwriteLocked=true', async () => {
    // Seed a locked record for EGN11
    await prisma.laborSchedule.create({
      data: {
        usrSystemCompanyId: COMPANY,
        employeeCode: 'EGN11',
        firstName: 'Overwrite',
        lastName: 'Employee',
        scheduleDate: new Date(`${MONDAY}T00:00:00`),
        clockIn: '6:00 AM',
        clockOut: '2:00 PM',
        locked: true,
      },
    });

    const svc = makeSvc(new Map([['EGN11', mondayHistory()]]));

    const result = await svc.generate(
      {
        usrSystemCompanyId: COMPANY,
        employeeCodes: ['EGN11'],
        startDate: MONDAY,
        endDate: MONDAY,
        overwriteLocked: true,
      },
      CTX,
    );

    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(0);

    // Row should now have the generated clock times
    const row = await prisma.laborSchedule.findFirst({
      where: { usrSystemCompanyId: COMPANY, employeeCode: 'EGN11' },
    });
    expect(row!.clockIn).toBe('7:00 AM');
  });
});
