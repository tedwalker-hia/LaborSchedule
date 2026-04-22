import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GenerationService } from '@/lib/services/generation-service';
import type { EmployeeHistory } from '@/lib/domain/types';
import type { AuditCtx } from '@/lib/services/audit-service';

const CTX: AuditCtx = { userId: 1, source: 'api' };

const makeAuditSvc = () => ({ record: vi.fn().mockResolvedValue(undefined) });

const makePayrollRepo = () => ({
  findPositionWindows: vi.fn(),
  findPayrollWindows: vi.fn(),
});

const makeDb = () => ({
  laborSchedule: {
    findMany: vi.fn(),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    create: vi.fn().mockResolvedValue({ id: 1 }),
  },
});

type PayrollRepo = ReturnType<typeof makePayrollRepo>;
type Db = ReturnType<typeof makeDb>;

const MON = 0; // Monday-based DOW index

const historyForDow = (dow: number, hours: number): EmployeeHistory => ({
  avgByDow: { [dow]: hours },
  workDays: [dow],
  avgWeeklyHours: hours,
  totalDaysWorked: 4,
  avgDailyHours: hours,
});

// Monday 2024-01-01
const MONDAY = '2024-01-01';

// ---- splitByPosition ----

describe('GenerationService.splitByPosition', () => {
  let svc: GenerationService;

  beforeEach(() => {
    svc = new GenerationService(makePayrollRepo() as any, makeDb() as any);
  });

  it('returns empty array when no positions work on the given DOW', () => {
    const posHistory: EmployeeHistory = {
      ...historyForDow(MON, 8),
      deptName: 'Front Desk',
      positionName: 'Receptionist',
    };
    // scheduleDate is a Tuesday (DOW 1) — position only works Monday
    const result = svc.splitByPosition({
      usrSystemCompanyId: 'CO1',
      employeeCode: 'E001',
      firstName: 'Alice',
      lastName: 'Smith',
      scheduleDate: new Date('2024-01-02T00:00:00'), // Tuesday
      positionHistories: [posHistory],
    });
    expect(result).toHaveLength(0);
  });

  it('returns one record per qualifying position', () => {
    const pos1: EmployeeHistory = {
      ...historyForDow(MON, 6),
      deptName: 'FD',
      positionName: 'Clerk',
    };
    const pos2: EmployeeHistory = {
      ...historyForDow(MON, 4),
      deptName: 'HK',
      positionName: 'Housekeeper',
    };

    const result = svc.splitByPosition({
      usrSystemCompanyId: 'CO1',
      employeeCode: 'E001',
      firstName: 'Alice',
      lastName: 'Smith',
      scheduleDate: new Date(MONDAY + 'T00:00:00'),
      positionHistories: [pos1, pos2],
    });

    expect(result).toHaveLength(2);
    expect(result[0]!.positionName).toBe('Clerk');
    expect(result[1]!.positionName).toBe('Housekeeper');
  });

  it('sets multiDept: true on every record', () => {
    const posHistory: EmployeeHistory = {
      ...historyForDow(MON, 8),
      deptName: 'FD',
      positionName: 'A',
    };
    const result = svc.splitByPosition({
      usrSystemCompanyId: 'CO1',
      employeeCode: 'E001',
      firstName: 'Alice',
      lastName: 'Smith',
      scheduleDate: new Date(MONDAY + 'T00:00:00'),
      positionHistories: [posHistory],
    });
    expect(result[0]!.multiDept).toBe(true);
  });

  it('skips positions with avgHours below threshold (< 0.5)', () => {
    const pos: EmployeeHistory = { ...historyForDow(MON, 0.3), deptName: 'FD', positionName: 'A' };
    const result = svc.splitByPosition({
      usrSystemCompanyId: 'CO1',
      employeeCode: 'E001',
      firstName: 'Alice',
      lastName: 'Smith',
      scheduleDate: new Date(MONDAY + 'T00:00:00'),
      positionHistories: [pos],
    });
    expect(result).toHaveLength(0);
  });

  it('propagates hotel, branchId, tenant onto records', () => {
    const pos: EmployeeHistory = { ...historyForDow(MON, 8), deptName: 'FD', positionName: 'A' };
    const result = svc.splitByPosition({
      usrSystemCompanyId: 'CO1',
      branchId: 7,
      hotel: 'Grand Hotel',
      tenant: 'TenantA',
      employeeCode: 'E001',
      firstName: 'Alice',
      lastName: 'Smith',
      scheduleDate: new Date(MONDAY + 'T00:00:00'),
      positionHistories: [pos],
    });
    expect(result[0]).toMatchObject({ branchId: 7, hotelName: 'Grand Hotel', tenant: 'TenantA' });
  });
});

// ---- generate ----

describe('GenerationService.generate', () => {
  let repo: PayrollRepo;
  let db: Db;
  let svc: GenerationService;

  beforeEach(() => {
    repo = makePayrollRepo();
    db = makeDb();
    svc = new GenerationService(repo as any, db as any, makeAuditSvc() as any);

    // Default: no names, no locked records
    db.laborSchedule.findMany.mockResolvedValue([]);
  });

  it('returns zeros immediately when employeeCodes is empty', async () => {
    const result = await svc.generate(
      {
        usrSystemCompanyId: 'CO1',
        employeeCodes: [],
        startDate: MONDAY,
        endDate: MONDAY,
      },
      CTX,
    );
    expect(result).toEqual({ inserted: 0, skipped: 0, skippedEmployees: [] });
    expect(repo.findPositionWindows).not.toHaveBeenCalled();
  });

  it('calls findPositionWindows once regardless of employee count (N+1 fix)', async () => {
    repo.findPositionWindows.mockResolvedValue(
      new Map([
        ['E001', []],
        ['E002', []],
      ]),
    );
    repo.findPayrollWindows.mockResolvedValue(
      new Map([
        ['E001', null],
        ['E002', null],
      ]),
    );

    await svc.generate(
      {
        usrSystemCompanyId: 'CO1',
        employeeCodes: ['E001', 'E002'],
        startDate: MONDAY,
        endDate: MONDAY,
      },
      CTX,
    );

    expect(repo.findPositionWindows).toHaveBeenCalledTimes(1);
    expect(repo.findPayrollWindows).toHaveBeenCalledTimes(1);
  });

  it('adds employee to skippedEmployees when no payroll history found', async () => {
    repo.findPositionWindows.mockResolvedValue(new Map([['E001', []]]));
    repo.findPayrollWindows.mockResolvedValue(new Map([['E001', null]]));

    const result = await svc.generate(
      {
        usrSystemCompanyId: 'CO1',
        employeeCodes: ['E001'],
        startDate: MONDAY,
        endDate: MONDAY,
      },
      CTX,
    );

    expect(result.skippedEmployees).toContain('E001');
    expect(result.inserted).toBe(0);
  });

  it.skip('skips locked date when overwriteLocked is false', async () => {
    repo.findPositionWindows.mockResolvedValue(new Map([['E001', []]]));
    repo.findPayrollWindows.mockResolvedValue(new Map([['E001', historyForDow(MON, 8)]]));
    // locked record on the target date
    db.laborSchedule.findMany.mockImplementation(({ where }: any) => {
      if (where?.locked) {
        return Promise.resolve([
          { employeeCode: 'E001', scheduleDate: new Date(MONDAY + 'T00:00:00') },
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await svc.generate(
      {
        usrSystemCompanyId: 'CO1',
        employeeCodes: ['E001'],
        startDate: MONDAY,
        endDate: MONDAY,
        overwriteLocked: false,
      },
      CTX,
    );

    expect(result.skipped).toBe(1);
    expect(result.inserted).toBe(0);
    expect(db.laborSchedule.create).not.toHaveBeenCalled();
  });

  it('inserts record when employee has simple history and DOW matches', async () => {
    repo.findPositionWindows.mockResolvedValue(new Map([['E001', []]]));
    repo.findPayrollWindows.mockResolvedValue(new Map([['E001', historyForDow(MON, 8)]]));
    db.laborSchedule.findMany.mockResolvedValue([]);

    const result = await svc.generate(
      {
        usrSystemCompanyId: 'CO1',
        employeeCodes: ['E001'],
        startDate: MONDAY,
        endDate: MONDAY,
      },
      CTX,
    );

    expect(result.inserted).toBe(1);
    expect(db.laborSchedule.create).toHaveBeenCalledTimes(1);
    const data = db.laborSchedule.create.mock.calls[0]![0].data;
    expect(data.multiDept).toBe(false);
  });

  it('inserts one record per qualifying position for multi-position employees', async () => {
    const pos1: EmployeeHistory = {
      ...historyForDow(MON, 6),
      deptName: 'FD',
      positionName: 'Clerk',
    };
    const pos2: EmployeeHistory = {
      ...historyForDow(MON, 4),
      deptName: 'HK',
      positionName: 'Housekeeper',
    };

    repo.findPositionWindows.mockResolvedValue(new Map([['E001', [pos1, pos2]]]));
    repo.findPayrollWindows.mockResolvedValue(new Map([['E001', null]]));
    db.laborSchedule.findMany.mockResolvedValue([]);

    const result = await svc.generate(
      {
        usrSystemCompanyId: 'CO1',
        employeeCodes: ['E001'],
        startDate: MONDAY,
        endDate: MONDAY,
      },
      CTX,
    );

    expect(result.inserted).toBe(2);
    expect(db.laborSchedule.create).toHaveBeenCalledTimes(2);
    const firstData = db.laborSchedule.create.mock.calls[0]![0].data;
    expect(firstData.multiDept).toBe(true);
  });

  it('skips date when single-position employee does not work that DOW', async () => {
    // history only has Tuesday (DOW 1), date is Monday
    const history = historyForDow(1, 8);
    repo.findPositionWindows.mockResolvedValue(new Map([['E001', []]]));
    repo.findPayrollWindows.mockResolvedValue(new Map([['E001', history]]));
    db.laborSchedule.findMany.mockResolvedValue([]);

    const result = await svc.generate(
      {
        usrSystemCompanyId: 'CO1',
        employeeCodes: ['E001'],
        startDate: MONDAY, // Monday
        endDate: MONDAY,
      },
      CTX,
    );

    expect(result.inserted).toBe(0);
    expect(db.laborSchedule.create).not.toHaveBeenCalled();
  });

  it('spans multiple dates and inserts each matching day', async () => {
    // Mon + Tue
    const history: EmployeeHistory = {
      avgByDow: { 0: 8, 1: 8 },
      workDays: [0, 1],
      avgWeeklyHours: 16,
      totalDaysWorked: 8,
      avgDailyHours: 8,
    };
    repo.findPositionWindows.mockResolvedValue(new Map([['E001', []]]));
    repo.findPayrollWindows.mockResolvedValue(new Map([['E001', history]]));
    db.laborSchedule.findMany.mockResolvedValue([]);

    const result = await svc.generate(
      {
        usrSystemCompanyId: 'CO1',
        employeeCodes: ['E001'],
        startDate: '2024-01-01', // Monday
        endDate: '2024-01-02', // Tuesday
      },
      CTX,
    );

    expect(result.inserted).toBe(2);
  });

  it('uses name from laborSchedule batch lookup', async () => {
    repo.findPositionWindows.mockResolvedValue(new Map([['E001', []]]));
    repo.findPayrollWindows.mockResolvedValue(new Map([['E001', historyForDow(MON, 8)]]));
    db.laborSchedule.findMany.mockImplementation(({ where }: any) => {
      if (where?.locked) return Promise.resolve([]);
      // names query
      return Promise.resolve([{ employeeCode: 'E001', firstName: 'Bob', lastName: 'Jones' }]);
    });

    await svc.generate(
      {
        usrSystemCompanyId: 'CO1',
        employeeCodes: ['E001'],
        startDate: MONDAY,
        endDate: MONDAY,
      },
      CTX,
    );

    const data = db.laborSchedule.create.mock.calls[0]![0].data;
    expect(data.firstName).toBe('Bob');
    expect(data.lastName).toBe('Jones');
  });
});
