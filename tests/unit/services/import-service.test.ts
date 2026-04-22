import { describe, it, expect, vi } from 'vitest';
import { ImportService } from '@/lib/services/import-service';
import type { ParsedRow, CommitOptions } from '@/lib/services/import-service';

const makeRepo = () => ({
  findFirst: () => Promise.resolve(null),
  create: () => Promise.resolve({ id: 1 }),
  deleteById: () => Promise.resolve(),
  updateLocked: () => Promise.resolve(0),
  clearRange: () => Promise.resolve({ deleted: 0, lockedSkipped: 0 }),
  deleteRange: () => Promise.resolve(0),
  findLocked: () => Promise.resolve([]),
});

function makeDb(existingRows: object[] = []) {
  const created = { id: 99, clockIn: '8:00 AM', clockOut: '4:00 PM' };
  return {
    laborSchedule: {
      findMany: vi.fn().mockResolvedValue(existingRows),
    },
    $transaction: vi.fn(async (fn: (tx: object) => Promise<void>) => {
      const tx = {
        laborSchedule: {
          delete: vi.fn().mockResolvedValue({}),
          create: vi.fn().mockResolvedValue(created),
        },
      };
      await fn(tx);
    }),
  };
}

function makeAuditService() {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

const baseOpts: CommitOptions = { usrSystemCompanyId: 'UNIT_IMP' };

const sampleRow: ParsedRow = {
  employeeCode: 'E001',
  date: '2025-06-01',
  clockIn: '8:00 AM',
  clockOut: '4:00 PM',
};

describe('ImportService.commit', () => {
  it('returns zeros for empty input without touching DB', async () => {
    const db = makeDb();
    const svc = new ImportService(makeRepo() as any, db as any, makeAuditService() as any);
    const result = await svc.commit([], baseOpts);
    expect(result).toEqual({ inserted: 0, updated: 0, skipped: 0, skippedRows: [] });
    expect(db.laborSchedule.findMany).not.toHaveBeenCalled();
  });

  it('counts new row as inserted', async () => {
    const db = makeDb([]);
    const svc = new ImportService(makeRepo() as any, db as any, makeAuditService() as any);
    const result = await svc.commit([sampleRow], baseOpts);
    expect(result).toEqual({ inserted: 1, updated: 0, skipped: 0, skippedRows: [] });
  });

  it('counts existing unlocked row as updated', async () => {
    const existingRow = {
      id: 5,
      employeeCode: 'E001',
      scheduleDate: new Date('2025-06-01T00:00:00Z'),
      positionName: null,
      locked: false,
      clockIn: '9:00 AM',
      clockOut: '5:00 PM',
      hotelName: 'TestHotel',
      branchId: null,
      tenant: null,
      firstName: 'Jane',
      lastName: 'Doe',
      deptName: 'Front Desk',
      multiDept: false,
    };
    const db = makeDb([existingRow]);
    const svc = new ImportService(makeRepo() as any, db as any, makeAuditService() as any);
    const result = await svc.commit([sampleRow], baseOpts);
    expect(result).toEqual({ inserted: 0, updated: 1, skipped: 0, skippedRows: [] });
  });

  it('skips locked row when overwriteLocked=false', async () => {
    const lockedRow = {
      id: 7,
      employeeCode: 'E001',
      scheduleDate: new Date('2025-06-01T00:00:00Z'),
      positionName: null,
      locked: true,
      clockIn: '9:00 AM',
      clockOut: '5:00 PM',
      hotelName: 'TestHotel',
      branchId: null,
      tenant: null,
      firstName: 'Jane',
      lastName: 'Doe',
      deptName: 'Front Desk',
      multiDept: false,
    };
    const db = makeDb([lockedRow]);
    const svc = new ImportService(makeRepo() as any, db as any, makeAuditService() as any);
    const result = await svc.commit([sampleRow], { ...baseOpts, overwriteLocked: false });
    expect(result).toEqual({
      inserted: 0,
      updated: 0,
      skipped: 1,
      skippedRows: [{ employeeCode: 'E001', date: '2025-06-01' }],
    });
  });

  it('overwrites locked row when overwriteLocked=true', async () => {
    const lockedRow = {
      id: 7,
      employeeCode: 'E001',
      scheduleDate: new Date('2025-06-01T00:00:00Z'),
      positionName: null,
      locked: true,
      clockIn: '9:00 AM',
      clockOut: '5:00 PM',
      hotelName: 'TestHotel',
      branchId: null,
      tenant: null,
      firstName: 'Jane',
      lastName: 'Doe',
      deptName: 'Front Desk',
      multiDept: false,
    };
    const db = makeDb([lockedRow]);
    const svc = new ImportService(makeRepo() as any, db as any, makeAuditService() as any);
    const result = await svc.commit([sampleRow], { ...baseOpts, overwriteLocked: true });
    expect(result).toEqual({ inserted: 0, updated: 1, skipped: 0, skippedRows: [] });
  });
});
