import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScheduleService, DuplicateScheduleError } from '@/lib/services/schedule-service';
import type { AuditCtx } from '@/lib/services/audit-service';

const CTX: AuditCtx = { userId: 1, source: 'api' };

const makeRepo = () => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  deleteById: vi.fn(),
  updateLocked: vi.fn(),
  clearRange: vi.fn(),
  deleteRange: vi.fn(),
  findLocked: vi.fn(),
});

// Interactive-transaction-aware db mock. $transaction receives a callback and
// executes it immediately with the db object itself as the transaction client.
const makeDb = () => {
  const db: any = {
    laborSchedule: {
      delete: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
    },
    $transaction: vi.fn().mockImplementation((fn: any) => {
      if (typeof fn === 'function') return fn(db);
      return Promise.resolve([]);
    }),
  };
  return db;
};

const makeAuditSvc = () => ({ record: vi.fn().mockResolvedValue(undefined) });

type Repo = ReturnType<typeof makeRepo>;
type Db = ReturnType<typeof makeDb>;

// ------- save -------

describe('ScheduleService.save', () => {
  let repo: Repo;
  let db: Db;
  let auditSvc: ReturnType<typeof makeAuditSvc>;
  let svc: ScheduleService;

  beforeEach(() => {
    repo = makeRepo();
    db = makeDb();
    auditSvc = makeAuditSvc();
    svc = new ScheduleService(repo as any, db as any, undefined as any, auditSvc as any);
  });

  it('inserts new record inside interactive transaction', async () => {
    repo.findFirst.mockResolvedValue(null);
    db.laborSchedule.create.mockResolvedValue({ id: 10, clockIn: '8:00 AM', clockOut: '5:00 PM' });

    const result = await svc.save(
      {
        usrSystemCompanyId: 'CO1',
        hotel: 'Hotel A',
        changes: [
          { employeeCode: 'E001', date: '2024-01-01', clockIn: '8:00 AM', clockOut: '5:00 PM' },
        ],
      },
      CTX,
    );

    expect(result).toEqual({ inserted: 1, updated: 0, skipped: 0 });
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(db.laborSchedule.create).toHaveBeenCalledOnce();
    expect(auditSvc.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'schedule.save', oldJson: null }),
      db,
    );
  });

  it('updates existing record with different clock times', async () => {
    repo.findFirst.mockResolvedValue({
      id: 42,
      clockIn: '8:00 AM',
      clockOut: '4:00 PM',
      branchId: null,
      hotelName: 'Hotel A',
      firstName: 'John',
      lastName: 'Doe',
      tenant: 'T1',
      deptName: 'Front Desk',
      multiDept: null,
      positionName: null,
      locked: false,
    });
    db.laborSchedule.update.mockResolvedValue({
      id: 42,
      clockIn: '8:00 AM',
      clockOut: '5:00 PM',
    });

    const result = await svc.save(
      {
        usrSystemCompanyId: 'CO1',
        changes: [
          { employeeCode: 'E001', date: '2024-01-01', clockIn: '8:00 AM', clockOut: '5:00 PM' },
        ],
      },
      CTX,
    );

    expect(result).toEqual({ inserted: 0, updated: 1, skipped: 0 });
    expect(db.laborSchedule.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 42 } }),
    );
    expect(db.laborSchedule.delete).not.toHaveBeenCalled();
    expect(auditSvc.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'schedule.save', scheduleId: 42 }),
      db,
    );
  });

  it('skips record when clock times are identical', async () => {
    repo.findFirst.mockResolvedValue({ id: 1, clockIn: '8:00 AM', clockOut: '5:00 PM' });

    const result = await svc.save(
      {
        usrSystemCompanyId: 'CO1',
        changes: [
          { employeeCode: 'E001', date: '2024-01-01', clockIn: '8:00 AM', clockOut: '5:00 PM' },
        ],
      },
      CTX,
    );

    expect(result).toEqual({ inserted: 0, updated: 0, skipped: 1 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('does not call transaction when all changes are skipped', async () => {
    repo.findFirst.mockResolvedValue({ id: 1, clockIn: '8:00 AM', clockOut: '5:00 PM' });

    await svc.save(
      {
        usrSystemCompanyId: 'CO1',
        changes: [
          { employeeCode: 'E001', date: '2024-01-01', clockIn: '8:00 AM', clockOut: '5:00 PM' },
          { employeeCode: 'E002', date: '2024-01-02', clockIn: '8:00 AM', clockOut: '5:00 PM' },
        ],
      },
      CTX,
    );

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('handles multiple changes in one transaction', async () => {
    repo.findFirst.mockResolvedValue(null);
    db.laborSchedule.create.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce({ id: 2 });

    const result = await svc.save(
      {
        usrSystemCompanyId: 'CO1',
        changes: [
          { employeeCode: 'E001', date: '2024-01-01' },
          { employeeCode: 'E002', date: '2024-01-02' },
        ],
      },
      CTX,
    );

    expect(result).toEqual({ inserted: 2, updated: 0, skipped: 0 });
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(db.laborSchedule.create).toHaveBeenCalledTimes(2);
    expect(auditSvc.record).toHaveBeenCalledTimes(2);
  });

  it('treats null clockIn same as empty string (skip)', async () => {
    repo.findFirst.mockResolvedValue({ id: 1, clockIn: null, clockOut: null });

    const result = await svc.save(
      {
        usrSystemCompanyId: 'CO1',
        changes: [{ employeeCode: 'E001', date: '2024-01-01', clockIn: null, clockOut: null }],
      },
      CTX,
    );

    expect(result.skipped).toBe(1);
  });

  it('preserves existing deptName and locked on update (update-in-place)', async () => {
    repo.findFirst.mockResolvedValue({
      id: 5,
      clockIn: '7:00 AM',
      clockOut: '3:00 PM',
      branchId: 1,
      hotelName: 'Hotel B',
      firstName: 'Alice',
      lastName: 'Smith',
      tenant: 'T2',
      deptName: 'Housekeeping',
      multiDept: true,
      positionName: 'Housekeeper',
      locked: true,
    });
    db.laborSchedule.update.mockResolvedValue({ id: 5 });

    await svc.save(
      {
        usrSystemCompanyId: 'CO1',
        changes: [
          { employeeCode: 'E001', date: '2024-01-01', clockIn: '8:00 AM', clockOut: '4:00 PM' },
        ],
      },
      CTX,
    );

    // Update keeps deptName / positionName / locked unchanged because those
    // fields are simply not in the update payload.
    expect(db.laborSchedule.update).toHaveBeenCalledOnce();
    const updateCall = db.laborSchedule.update.mock.calls[0]![0];
    expect(updateCall.where).toEqual({ id: 5 });
    expect(updateCall.data.deptName).toBeUndefined();
    expect(updateCall.data.positionName).toBeUndefined();
    expect(updateCall.data.locked).toBeUndefined();
    expect(updateCall.data.clockIn).toBe('8:00 AM');
    expect(updateCall.data.clockOut).toBe('4:00 PM');
  });
});

// ------- add -------

describe('ScheduleService.add', () => {
  let repo: Repo;
  let db: Db;
  let auditSvc: ReturnType<typeof makeAuditSvc>;
  let svc: ScheduleService;

  beforeEach(() => {
    repo = makeRepo();
    db = makeDb();
    auditSvc = makeAuditSvc();
    svc = new ScheduleService(repo as any, db as any, undefined as any, auditSvc as any);
  });

  it('creates record inside transaction and returns id', async () => {
    repo.findFirst.mockResolvedValue(null);
    db.laborSchedule.create.mockResolvedValue({ id: 99, locked: false });

    const result = await svc.add(
      { usrSystemCompanyId: 'CO1', employeeCode: 'E001', date: '2024-01-01' },
      CTX,
    );

    expect(result).toEqual({ id: 99 });
    expect(db.laborSchedule.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ locked: false }) }),
    );
    expect(auditSvc.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'schedule.add', oldJson: null }),
      db,
    );
  });

  it('manually added records are not locked', async () => {
    repo.findFirst.mockResolvedValue(null);
    db.laborSchedule.create.mockResolvedValue({ id: 1 });

    await svc.add({ usrSystemCompanyId: 'CO1', employeeCode: 'E001', date: '2024-01-01' }, CTX);

    expect(db.laborSchedule.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ locked: false }) }),
    );
  });

  it('throws DuplicateScheduleError when record exists for same employee+date+position', async () => {
    repo.findFirst.mockResolvedValue({ id: 1 });

    await expect(
      svc.add({ usrSystemCompanyId: 'CO1', employeeCode: 'E001', date: '2024-01-01' }, CTX),
    ).rejects.toThrow(DuplicateScheduleError);
  });

  it('checks position-specific uniqueness', async () => {
    repo.findFirst.mockResolvedValue(null);
    db.laborSchedule.create.mockResolvedValue({ id: 5 });

    await svc.add(
      {
        usrSystemCompanyId: 'CO1',
        employeeCode: 'E001',
        date: '2024-01-01',
        positionName: 'Manager',
      },
      CTX,
    );

    expect(repo.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ positionName: 'Manager' }),
    );
  });

  it('normalises empty positionName to null', async () => {
    repo.findFirst.mockResolvedValue(null);
    db.laborSchedule.create.mockResolvedValue({ id: 5 });

    await svc.add(
      { usrSystemCompanyId: 'CO1', employeeCode: 'E001', date: '2024-01-01', positionName: '' },
      CTX,
    );

    expect(repo.findFirst).toHaveBeenCalledWith(expect.objectContaining({ positionName: null }));
  });
});

// ------- lock -------

describe('ScheduleService.lock', () => {
  let db: Db;
  let auditSvc: ReturnType<typeof makeAuditSvc>;
  let svc: ScheduleService;

  beforeEach(() => {
    db = makeDb();
    auditSvc = makeAuditSvc();
    svc = new ScheduleService(makeRepo() as any, db as any, undefined as any, auditSvc as any);
  });

  it('finds records, updates locked flag, writes audit rows', async () => {
    db.laborSchedule.findMany
      .mockResolvedValueOnce([{ id: 10, locked: false }])
      .mockResolvedValueOnce([
        { id: 11, locked: false },
        { id: 12, locked: false },
      ]);
    db.laborSchedule.updateMany.mockResolvedValue({ count: 1 });

    const result = await svc.lock(
      {
        usrSystemCompanyId: 'CO1',
        records: [
          { employeeCode: 'E001', date: '2024-01-01' },
          { employeeCode: 'E002', date: '2024-01-02' },
        ],
        locked: true,
      },
      CTX,
    );

    expect(result).toEqual({ updated: 3 });
    expect(db.laborSchedule.updateMany).toHaveBeenCalledTimes(2);
    expect(auditSvc.record).toHaveBeenCalledTimes(3);
    expect(auditSvc.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'schedule.lock', scheduleId: 10 }),
      db,
    );
  });

  it('returns 0 for empty records array', async () => {
    const result = await svc.lock({ usrSystemCompanyId: 'CO1', records: [], locked: false }, CTX);

    expect(result).toEqual({ updated: 0 });
    expect(db.laborSchedule.findMany).not.toHaveBeenCalled();
  });
});

// ------- clear -------

describe('ScheduleService.clear', () => {
  let db: Db;
  let auditSvc: ReturnType<typeof makeAuditSvc>;
  let svc: ScheduleService;

  beforeEach(() => {
    db = makeDb();
    auditSvc = makeAuditSvc();
    svc = new ScheduleService(makeRepo() as any, db as any, undefined as any, auditSvc as any);
  });

  it('writes audit rows and deletes unlocked records, skips locked', async () => {
    db.laborSchedule.count.mockResolvedValue(2); // lockedSkipped
    db.laborSchedule.findMany.mockResolvedValue([{ id: 5, clockIn: '8:00 AM' }]);
    db.laborSchedule.deleteMany.mockResolvedValue({ count: 1 });

    const result = await svc.clear(
      {
        usrSystemCompanyId: 'CO1',
        employeeCodes: ['E001'],
        startDate: '2024-01-01',
        endDate: '2024-01-07',
        clearLocked: false,
      },
      CTX,
    );

    expect(result).toEqual({ deleted: 1, lockedSkipped: 2 });
    expect(auditSvc.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'schedule.clear', scheduleId: 5, newJson: null }),
      db,
    );
  });

  it('defaults clearLocked to false when omitted', async () => {
    db.laborSchedule.count.mockResolvedValue(0);
    db.laborSchedule.findMany.mockResolvedValue([]);
    db.laborSchedule.deleteMany.mockResolvedValue({ count: 0 });

    const result = await svc.clear(
      {
        usrSystemCompanyId: 'CO1',
        employeeCodes: [],
        startDate: '2024-01-01',
        endDate: '2024-01-07',
      },
      CTX,
    );

    expect(result).toEqual({ deleted: 0, lockedSkipped: 0 });
  });
});

// ------- delete -------

describe('ScheduleService.delete', () => {
  let db: Db;
  let auditSvc: ReturnType<typeof makeAuditSvc>;
  let svc: ScheduleService;

  beforeEach(() => {
    db = makeDb();
    auditSvc = makeAuditSvc();
    svc = new ScheduleService(makeRepo() as any, db as any, undefined as any, auditSvc as any);
  });

  it('writes audit rows for each record then deletes all', async () => {
    db.laborSchedule.findMany.mockResolvedValue([{ id: 20 }, { id: 21 }]);
    db.laborSchedule.deleteMany.mockResolvedValue({ count: 2 });

    const result = await svc.delete(
      {
        usrSystemCompanyId: 'CO1',
        employeeCodes: ['E001', 'E002'],
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      },
      CTX,
    );

    expect(result).toEqual({ deleted: 2 });
    expect(auditSvc.record).toHaveBeenCalledTimes(2);
    expect(auditSvc.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'schedule.delete', newJson: null }),
      db,
    );
  });
});

// ------- checkLocked -------

describe('ScheduleService.checkLocked', () => {
  it('delegates to repo.findLocked and returns records', async () => {
    const lockedRecords = [
      { employeeCode: 'E001', firstName: 'John', lastName: 'Doe', lockedCount: 3 },
    ];
    const repo = makeRepo();
    repo.findLocked.mockResolvedValue(lockedRecords);
    const svc = new ScheduleService(
      repo as any,
      makeDb() as any,
      undefined as any,
      makeAuditSvc() as any,
    );

    const result = await svc.checkLocked({
      usrSystemCompanyId: 'CO1',
      employeeCodes: ['E001'],
      startDate: '2024-01-01',
      endDate: '2024-01-07',
    });

    expect(result).toEqual(lockedRecords);
    expect(repo.findLocked).toHaveBeenCalledWith(
      expect.objectContaining({ usrSystemCompanyId: 'CO1' }),
    );
  });
});

// ------- findScheduleGrid — multiDept aggregation -------

const makeGridRepo = () => ({
  findByHotelDate: vi.fn(),
  findDistinctDepts: vi.fn().mockResolvedValue([]),
  findDistinctPositions: vi.fn().mockResolvedValue([]),
  findPositionsByDept: vi.fn().mockResolvedValue([]),
  // remaining repo methods not exercised by this path
  findFirst: vi.fn(),
  create: vi.fn(),
  deleteById: vi.fn(),
  updateLocked: vi.fn(),
  clearRange: vi.fn(),
  deleteRange: vi.fn(),
  findLocked: vi.fn(),
});

const makeRow = (overrides: Partial<{
  employeeCode: string;
  firstName: string;
  lastName: string;
  deptName: string;
  positionName: string;
}>) => ({
  employeeCode: 'E001',
  firstName: 'Jane',
  lastName: 'Doe',
  deptName: 'Front Desk',
  positionName: 'Agent',
  scheduleDate: new Date('2024-01-01'),
  clockIn: '8:00 AM',
  clockOut: '5:00 PM',
  hours: 9,
  locked: false,
  ...overrides,
});

const GRID_PARAMS = {
  usrSystemCompanyId: 'CO1',
  hotelName: 'Hotel A',
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-01-07'),
};

describe('ScheduleService.findScheduleGrid — multiDept flag', () => {
  let svc: ScheduleService;
  let gridRepo: ReturnType<typeof makeGridRepo>;

  beforeEach(() => {
    gridRepo = makeGridRepo();
    svc = new ScheduleService(
      gridRepo as any,
      makeDb() as any,
      undefined as any,
      makeAuditSvc() as any,
    );
  });

  it('single position: one row, multiDept is false', async () => {
    gridRepo.findByHotelDate.mockResolvedValue([
      makeRow({ positionName: 'Agent', deptName: 'Front Desk' }),
    ]);

    const result = await svc.findScheduleGrid(GRID_PARAMS);

    expect(result.employees).toHaveLength(1);
    expect(result.employees[0]!.multiDept).toBe(false);
    expect(result.employees[0]!.rowKey).toBe('E001|Agent');
  });

  it('two positions same dept: emits two rows, both multiDept=true', async () => {
    gridRepo.findByHotelDate.mockResolvedValue([
      makeRow({ positionName: 'Agent', deptName: 'Front Desk' }),
      makeRow({ positionName: 'Supervisor', deptName: 'Front Desk' }),
    ]);

    const result = await svc.findScheduleGrid(GRID_PARAMS);

    expect(result.employees).toHaveLength(2);
    expect(result.employees.every((e) => e.code === 'E001')).toBe(true);
    expect(result.employees.every((e) => e.multiDept === true)).toBe(true);
    expect(result.employees.map((e) => e.positionName).sort()).toEqual(['Agent', 'Supervisor']);
  });

  it('two positions different dept: emits two rows, multiDept=true', async () => {
    gridRepo.findByHotelDate.mockResolvedValue([
      makeRow({ positionName: 'Agent', deptName: 'Front Desk' }),
      makeRow({ positionName: 'Housekeeper', deptName: 'Housekeeping' }),
    ]);

    const result = await svc.findScheduleGrid(GRID_PARAMS);

    expect(result.employees).toHaveLength(2);
    expect(result.employees.every((e) => e.multiDept === true)).toBe(true);
    expect(result.employees.map((e) => e.deptName).sort()).toEqual([
      'Front Desk',
      'Housekeeping',
    ]);
  });

  it('two positions same date: schedule entries kept separate per rowKey', async () => {
    const date = new Date('2024-01-01');
    gridRepo.findByHotelDate.mockResolvedValue([
      {
        ...makeRow({ positionName: 'Agent', deptName: 'Front Desk' }),
        scheduleDate: date,
        clockIn: '8:00 AM',
        clockOut: '12:00 PM',
        hours: 4,
      },
      {
        ...makeRow({ positionName: 'Supervisor', deptName: 'Front Desk' }),
        scheduleDate: date,
        clockIn: '1:00 PM',
        clockOut: '5:00 PM',
        hours: 4,
      },
    ]);

    const result = await svc.findScheduleGrid(GRID_PARAMS);

    expect(result.schedule['E001|Agent']!['2024-01-01']).toMatchObject({
      clockIn: '8:00 AM',
      clockOut: '12:00 PM',
    });
    expect(result.schedule['E001|Supervisor']!['2024-01-01']).toMatchObject({
      clockIn: '1:00 PM',
      clockOut: '5:00 PM',
    });
  });
});
