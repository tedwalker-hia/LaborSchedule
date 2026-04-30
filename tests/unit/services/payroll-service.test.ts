import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PayrollService } from '@/lib/services/payroll-service';

const makeRepo = () => ({
  findTenants: vi.fn(),
  findEmployees: vi.fn(),
  findEmployeeHistory: vi.fn(),
});

const makeDb = () => ({
  laborSchedule: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
});

type Repo = ReturnType<typeof makeRepo>;
type Db = ReturnType<typeof makeDb>;

const SEED_PARAMS = {
  usrSystemCompanyId: 'CO1',
  branchId: 1,
  hotelName: 'Hotel A',
  tenant: 'T1',
  employees: [
    {
      code: 'E001',
      firstName: 'Alice',
      lastName: 'Smith',
      deptName: 'Front Desk',
      positionName: 'Agent',
    },
    { code: 'E002', firstName: 'Bob', lastName: 'Jones', deptName: null, positionName: null },
  ],
};

// ------- seed -------

describe('PayrollService.seed', () => {
  let repo: Repo;
  let db: Db;
  let svc: PayrollService;

  beforeEach(() => {
    repo = makeRepo();
    db = makeDb();
    svc = new PayrollService(repo as any, db as any);
  });

  it('inserts employees not yet in schedule', async () => {
    db.laborSchedule.findFirst.mockResolvedValue(null);
    db.laborSchedule.create.mockResolvedValue({ id: 1 });

    const result = await svc.seed(SEED_PARAMS);

    expect(result).toEqual({ seeded: 2, skipped: 0 });
    expect(db.laborSchedule.create).toHaveBeenCalledTimes(2);
  });

  it('skips employees already present — idempotent on second call', async () => {
    db.laborSchedule.findFirst.mockResolvedValue({ id: 1 });

    const result = await svc.seed(SEED_PARAMS);

    expect(result).toEqual({ seeded: 0, skipped: 2 });
    expect(db.laborSchedule.create).not.toHaveBeenCalled();
  });

  it('seeds new employees and skips existing ones in the same call', async () => {
    db.laborSchedule.findFirst
      .mockResolvedValueOnce({ id: 1 }) // E001 exists
      .mockResolvedValueOnce(null); // E002 new
    db.laborSchedule.create.mockResolvedValue({ id: 2 });

    const result = await svc.seed(SEED_PARAMS);

    expect(result).toEqual({ seeded: 1, skipped: 1 });
    expect(db.laborSchedule.create).toHaveBeenCalledTimes(1);
  });

  it('normalises positionName null correctly in findFirst query', async () => {
    db.laborSchedule.findFirst.mockResolvedValue(null);
    db.laborSchedule.create.mockResolvedValue({ id: 1 });

    await svc.seed({
      usrSystemCompanyId: 'CO1',
      employees: [{ code: 'E002', firstName: 'Bob', lastName: 'Jones', positionName: null }],
    });

    expect(db.laborSchedule.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ positionName: null }) }),
    );
  });

  it('passes all seed fields to create', async () => {
    db.laborSchedule.findFirst.mockResolvedValue(null);
    db.laborSchedule.create.mockResolvedValue({ id: 1 });

    await svc.seed({
      usrSystemCompanyId: 'CO1',
      branchId: 5,
      hotelName: 'H1',
      tenant: 'T1',
      employees: [
        {
          code: 'E001',
          firstName: 'Alice',
          lastName: 'Smith',
          deptName: 'FD',
          positionName: 'Agent',
        },
      ],
    });

    expect(db.laborSchedule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          usrSystemCompanyId: 'CO1',
          branchId: 5,
          hotelName: 'H1',
          tenant: 'T1',
          employeeCode: 'E001',
          firstName: 'Alice',
          lastName: 'Smith',
          deptName: 'FD',
          positionName: 'Agent',
        }),
      }),
    );
  });
});
