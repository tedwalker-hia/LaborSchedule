import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScheduleService, DuplicateScheduleError } from '@/lib/services/schedule-service';

const makeRepo = () => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  deleteById: vi.fn(),
  updateLocked: vi.fn(),
  clearRange: vi.fn(),
  deleteRange: vi.fn(),
  findLocked: vi.fn(),
});

const makeDb = () => ({
  laborSchedule: {
    delete: vi.fn(),
    create: vi.fn(),
  },
  $transaction: vi.fn().mockResolvedValue([]),
});

type Repo = ReturnType<typeof makeRepo>;
type Db = ReturnType<typeof makeDb>;

// ------- save -------

describe('ScheduleService.save', () => {
  let repo: Repo;
  let db: Db;
  let svc: ScheduleService;

  beforeEach(() => {
    repo = makeRepo();
    db = makeDb();
    svc = new ScheduleService(repo as any, db as any);
  });

  it('inserts new record and wraps in transaction', async () => {
    repo.findFirst.mockResolvedValue(null);
    const insertOp = Symbol('insert');
    db.laborSchedule.create.mockReturnValue(insertOp);

    const result = await svc.save({
      usrSystemCompanyId: 'CO1',
      hotel: 'Hotel A',
      changes: [
        { employeeCode: 'E001', date: '2024-01-01', clockIn: '8:00 AM', clockOut: '5:00 PM' },
      ],
    });

    expect(result).toEqual({ inserted: 1, updated: 0, skipped: 0 });
    expect(db.$transaction).toHaveBeenCalledWith([insertOp]);
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
    const deleteOp = Symbol('delete');
    const insertOp = Symbol('insert');
    db.laborSchedule.delete.mockReturnValue(deleteOp);
    db.laborSchedule.create.mockReturnValue(insertOp);

    const result = await svc.save({
      usrSystemCompanyId: 'CO1',
      changes: [
        { employeeCode: 'E001', date: '2024-01-01', clockIn: '8:00 AM', clockOut: '5:00 PM' },
      ],
    });

    expect(result).toEqual({ inserted: 0, updated: 1, skipped: 0 });
    expect(db.laborSchedule.delete).toHaveBeenCalledWith({ where: { id: 42 } });
    expect(db.$transaction).toHaveBeenCalledWith([deleteOp, insertOp]);
  });

  it('skips record when clock times are identical', async () => {
    repo.findFirst.mockResolvedValue({ id: 1, clockIn: '8:00 AM', clockOut: '5:00 PM' });

    const result = await svc.save({
      usrSystemCompanyId: 'CO1',
      changes: [
        { employeeCode: 'E001', date: '2024-01-01', clockIn: '8:00 AM', clockOut: '5:00 PM' },
      ],
    });

    expect(result).toEqual({ inserted: 0, updated: 0, skipped: 1 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('does not call transaction when all changes are skipped', async () => {
    repo.findFirst.mockResolvedValue({ id: 1, clockIn: '8:00 AM', clockOut: '5:00 PM' });

    await svc.save({
      usrSystemCompanyId: 'CO1',
      changes: [
        { employeeCode: 'E001', date: '2024-01-01', clockIn: '8:00 AM', clockOut: '5:00 PM' },
        { employeeCode: 'E002', date: '2024-01-02', clockIn: '8:00 AM', clockOut: '5:00 PM' },
      ],
    });

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('batches multiple changes into one transaction call', async () => {
    repo.findFirst.mockResolvedValue(null);
    const op1 = Symbol('op1');
    const op2 = Symbol('op2');
    db.laborSchedule.create.mockReturnValueOnce(op1).mockReturnValueOnce(op2);

    const result = await svc.save({
      usrSystemCompanyId: 'CO1',
      changes: [
        { employeeCode: 'E001', date: '2024-01-01' },
        { employeeCode: 'E002', date: '2024-01-02' },
      ],
    });

    expect(result).toEqual({ inserted: 2, updated: 0, skipped: 0 });
    expect(db.$transaction).toHaveBeenCalledWith([op1, op2]);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it('treats null clockIn same as empty string (skip)', async () => {
    repo.findFirst.mockResolvedValue({ id: 1, clockIn: null, clockOut: null });

    const result = await svc.save({
      usrSystemCompanyId: 'CO1',
      changes: [{ employeeCode: 'E001', date: '2024-01-01', clockIn: null, clockOut: null }],
    });

    expect(result.skipped).toBe(1);
  });

  it('preserves existing deptName and locked on update', async () => {
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
    db.laborSchedule.delete.mockReturnValue(Symbol());
    db.laborSchedule.create.mockReturnValue(Symbol());

    await svc.save({
      usrSystemCompanyId: 'CO1',
      changes: [
        { employeeCode: 'E001', date: '2024-01-01', clockIn: '8:00 AM', clockOut: '4:00 PM' },
      ],
    });

    const createCall = db.laborSchedule.create.mock.calls[0]![0];
    expect(createCall.data.deptName).toBe('Housekeeping');
    expect(createCall.data.positionName).toBe('Housekeeper');
    expect(createCall.data.locked).toBe(true);
  });
});

// ------- add -------

describe('ScheduleService.add', () => {
  let repo: Repo;
  let db: Db;
  let svc: ScheduleService;

  beforeEach(() => {
    repo = makeRepo();
    db = makeDb();
    svc = new ScheduleService(repo as any, db as any);
  });

  it('creates record and returns id', async () => {
    repo.findFirst.mockResolvedValue(null);
    repo.create.mockResolvedValue({ id: 99 });

    const result = await svc.add({
      usrSystemCompanyId: 'CO1',
      employeeCode: 'E001',
      date: '2024-01-01',
    });

    expect(result).toEqual({ id: 99 });
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ locked: true }));
  });

  it('auto-locks manually added records', async () => {
    repo.findFirst.mockResolvedValue(null);
    repo.create.mockResolvedValue({ id: 1 });

    await svc.add({ usrSystemCompanyId: 'CO1', employeeCode: 'E001', date: '2024-01-01' });

    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ locked: true }));
  });

  it('throws DuplicateScheduleError when record exists for same employee+date+position', async () => {
    repo.findFirst.mockResolvedValue({ id: 1 });

    await expect(
      svc.add({ usrSystemCompanyId: 'CO1', employeeCode: 'E001', date: '2024-01-01' }),
    ).rejects.toThrow(DuplicateScheduleError);
  });

  it('checks position-specific uniqueness', async () => {
    repo.findFirst.mockResolvedValue(null);
    repo.create.mockResolvedValue({ id: 5 });

    await svc.add({
      usrSystemCompanyId: 'CO1',
      employeeCode: 'E001',
      date: '2024-01-01',
      positionName: 'Manager',
    });

    expect(repo.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ positionName: 'Manager' }),
    );
  });

  it('normalises empty positionName to null', async () => {
    repo.findFirst.mockResolvedValue(null);
    repo.create.mockResolvedValue({ id: 5 });

    await svc.add({
      usrSystemCompanyId: 'CO1',
      employeeCode: 'E001',
      date: '2024-01-01',
      positionName: '',
    });

    expect(repo.findFirst).toHaveBeenCalledWith(expect.objectContaining({ positionName: null }));
  });
});

// ------- lock -------

describe('ScheduleService.lock', () => {
  it('calls updateLocked for each record and sums counts', async () => {
    const repo = makeRepo();
    repo.updateLocked.mockResolvedValueOnce(2).mockResolvedValueOnce(3);
    const svc = new ScheduleService(repo as any, makeDb() as any);

    const result = await svc.lock({
      usrSystemCompanyId: 'CO1',
      records: [
        { employeeCode: 'E001', date: '2024-01-01' },
        { employeeCode: 'E002', date: '2024-01-02' },
      ],
      locked: true,
    });

    expect(result).toEqual({ updated: 5 });
    expect(repo.updateLocked).toHaveBeenCalledTimes(2);
  });

  it('returns 0 for empty records array', async () => {
    const repo = makeRepo();
    const svc = new ScheduleService(repo as any, makeDb() as any);

    const result = await svc.lock({ usrSystemCompanyId: 'CO1', records: [], locked: false });

    expect(result).toEqual({ updated: 0 });
    expect(repo.updateLocked).not.toHaveBeenCalled();
  });
});

// ------- clear -------

describe('ScheduleService.clear', () => {
  it('delegates to repo.clearRange and returns counts', async () => {
    const repo = makeRepo();
    repo.clearRange.mockResolvedValue({ deleted: 5, lockedSkipped: 2 });
    const svc = new ScheduleService(repo as any, makeDb() as any);

    const result = await svc.clear({
      usrSystemCompanyId: 'CO1',
      employeeCodes: ['E001'],
      startDate: '2024-01-01',
      endDate: '2024-01-07',
      clearLocked: false,
    });

    expect(result).toEqual({ deleted: 5, lockedSkipped: 2 });
    expect(repo.clearRange).toHaveBeenCalledWith(expect.objectContaining({ clearLocked: false }));
  });

  it('defaults clearLocked to false when omitted', async () => {
    const repo = makeRepo();
    repo.clearRange.mockResolvedValue({ deleted: 0, lockedSkipped: 0 });
    const svc = new ScheduleService(repo as any, makeDb() as any);

    await svc.clear({
      usrSystemCompanyId: 'CO1',
      employeeCodes: [],
      startDate: '2024-01-01',
      endDate: '2024-01-07',
    });

    expect(repo.clearRange).toHaveBeenCalledWith(expect.objectContaining({ clearLocked: false }));
  });
});

// ------- delete -------

describe('ScheduleService.delete', () => {
  it('delegates to repo.deleteRange and returns count', async () => {
    const repo = makeRepo();
    repo.deleteRange.mockResolvedValue(4);
    const svc = new ScheduleService(repo as any, makeDb() as any);

    const result = await svc.delete({
      usrSystemCompanyId: 'CO1',
      employeeCodes: ['E001', 'E002'],
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    });

    expect(result).toEqual({ deleted: 4 });
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
    const svc = new ScheduleService(repo as any, makeDb() as any);

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
