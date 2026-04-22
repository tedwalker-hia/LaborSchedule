/**
 * Integration tests for ImportService.commit against a real DB.
 *
 * Uses a unique usrSystemCompanyId prefix (INTTEST_IMP_) so rows are
 * isolated. Cleanup runs in afterEach to keep the test DB tidy.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  ImportService,
  makeImportService,
  type ParsedRow,
  type CommitOptions,
} from '@/lib/services/import-service';

const prisma = new PrismaClient();
let svc: ImportService;

const COMPANY_ID = 'INTTEST_IMP_001';

beforeAll(() => {
  svc = makeImportService(undefined, prisma);
});

afterEach(async () => {
  await prisma.laborSchedule.deleteMany({ where: { usrSystemCompanyId: COMPANY_ID } });
});

const baseOpts: CommitOptions = { usrSystemCompanyId: COMPANY_ID };

const sampleRow: ParsedRow = {
  employeeCode: 'EIMP01',
  firstName: 'Test',
  lastName: 'Employee',
  date: '2025-06-01',
  clockIn: '8:00 AM',
  clockOut: '4:00 PM',
  deptName: 'Front Desk',
  positionName: 'Receptionist',
};

describe('ImportService.commit', () => {
  it('returns zeros for empty payload', async () => {
    const result = await svc.commit([], baseOpts);
    expect(result).toEqual({ inserted: 0, updated: 0, skipped: 0, skippedRows: [] });
  });

  it('inserts a new row and returns inserted=1', async () => {
    const result = await svc.commit([sampleRow], baseOpts);
    expect(result).toEqual({ inserted: 1, updated: 0, skipped: 0, skippedRows: [] });

    const rows = await prisma.laborSchedule.findMany({
      where: { usrSystemCompanyId: COMPANY_ID, employeeCode: 'EIMP01' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.clockIn).toBe('8:00 AM');
  });

  it('updates an existing unlocked row', async () => {
    await svc.commit([sampleRow], baseOpts);

    const updatedRow: ParsedRow = { ...sampleRow, clockIn: '9:00 AM', clockOut: '5:00 PM' };
    const result = await svc.commit([updatedRow], baseOpts);
    expect(result).toEqual({ inserted: 0, updated: 1, skipped: 0, skippedRows: [] });

    const rows = await prisma.laborSchedule.findMany({
      where: { usrSystemCompanyId: COMPANY_ID, employeeCode: 'EIMP01' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.clockIn).toBe('9:00 AM');
  });

  it('skips locked row when overwriteLocked=false', async () => {
    await svc.commit([sampleRow], baseOpts);
    await prisma.laborSchedule.updateMany({
      where: { usrSystemCompanyId: COMPANY_ID, employeeCode: 'EIMP01' },
      data: { locked: true },
    });

    const result = await svc.commit([{ ...sampleRow, clockIn: '10:00 AM' }], {
      ...baseOpts,
      overwriteLocked: false,
    });
    expect(result).toEqual({
      inserted: 0,
      updated: 0,
      skipped: 1,
      skippedRows: [{ employeeCode: 'EIMP01', date: '2025-06-01' }],
    });

    const rows = await prisma.laborSchedule.findMany({
      where: { usrSystemCompanyId: COMPANY_ID, employeeCode: 'EIMP01' },
    });
    expect(rows[0]!.clockIn).toBe('8:00 AM');
  });

  it('overwrites locked row when overwriteLocked=true', async () => {
    await svc.commit([sampleRow], baseOpts);
    await prisma.laborSchedule.updateMany({
      where: { usrSystemCompanyId: COMPANY_ID, employeeCode: 'EIMP01' },
      data: { locked: true },
    });

    const result = await svc.commit([{ ...sampleRow, clockIn: '10:00 AM' }], {
      ...baseOpts,
      overwriteLocked: true,
    });
    expect(result).toEqual({ inserted: 0, updated: 1, skipped: 0, skippedRows: [] });

    const rows = await prisma.laborSchedule.findMany({
      where: { usrSystemCompanyId: COMPANY_ID, employeeCode: 'EIMP01' },
    });
    expect(rows[0]!.clockIn).toBe('10:00 AM');
    expect(rows[0]!.locked).toBe(false);
  });
});
