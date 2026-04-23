/**
 * Integration test: Excel round-trip — export → parse → import → assert identical rows.
 *
 * Uses a fixed `today` after all test dates so every test date is treated as
 * "past" by writer.ts. Past cells store clockIn/clockOut as plain strings and
 * hours as a plain number, making the parse-back deterministic without formula
 * evaluation.
 *
 * DB isolation: INTTEST_RT_001 prefix; cleaned in afterEach.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { exportScheduleToExcel } from '@/lib/excel/writer';
import { parseWorkbook } from '@/lib/excel/parser';
import { makeImportService, type ParsedRow } from '@/lib/services/import-service';

const prisma = new PrismaClient();
const COMPANY_ID = 'INTTEST_RT_001';
const HOTEL = 'INTTEST_RT_Hotel';

afterEach(async () => {
  await prisma.laborSchedule.deleteMany({ where: { usrSystemCompanyId: COMPANY_ID } });
});

// Fixed today well after all test dates → all cells are "past" → no formulas.
const today = new Date('2025-07-01T00:00:00Z');

const dates = [
  new Date('2025-06-01T00:00:00Z'),
  new Date('2025-06-02T00:00:00Z'),
  new Date('2025-06-03T00:00:00Z'),
];

const employees = [
  {
    code: 'ERT001',
    firstName: 'Alice',
    lastName: 'Smith',
    deptName: 'Front Desk',
    positionName: 'Receptionist',
  },
  {
    code: 'ERT002',
    firstName: 'Bob',
    lastName: 'Jones',
    deptName: 'Housekeeping',
    positionName: 'Housekeeper',
  },
];

const schedule: Record<
  string,
  Record<string, { clockIn: string; clockOut: string; hours: number }>
> = {
  ERT001: {
    '2025-06-01': { clockIn: '8:00 AM', clockOut: '4:00 PM', hours: 8 },
    '2025-06-02': { clockIn: '9:00 AM', clockOut: '5:00 PM', hours: 8 },
  },
  ERT002: {
    '2025-06-02': { clockIn: '7:00 AM', clockOut: '3:00 PM', hours: 8 },
    '2025-06-03': { clockIn: '10:00 AM', clockOut: '6:00 PM', hours: 8 },
  },
};

describe('Excel round-trip', () => {
  it('preserves all schedule rows through export → parse → import', async () => {
    // 1. Export to buffer
    const buffer = await exportScheduleToExcel({ hotel: HOTEL, employees, dates, schedule, today });
    expect(buffer.length).toBeGreaterThan(0);

    // 2. Parse buffer back to ImportRecords
    const preview = await parseWorkbook(buffer);
    expect(preview.records).toHaveLength(4);

    // 3. Map ImportRecord → ParsedRow
    const rows: ParsedRow[] = preview.records.map((r) => ({
      employeeCode: r.employeeCode,
      firstName: r.firstName,
      lastName: r.lastName,
      date: r.date,
      clockIn: r.clockIn || null,
      clockOut: r.clockOut || null,
      deptName: r.deptName,
      positionName: r.positionName,
    }));

    // 4. Import into test DB
    const svc = makeImportService(undefined, prisma);
    const result = await svc.commit(rows, { usrSystemCompanyId: COMPANY_ID, hotel: HOTEL });

    expect(result.inserted).toBe(4);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);

    // 5. Query and assert fidelity
    const dbRows = await prisma.laborSchedule.findMany({
      where: { usrSystemCompanyId: COMPANY_ID },
      orderBy: [{ employeeCode: 'asc' }, { scheduleDate: 'asc' }],
    });

    expect(dbRows).toHaveLength(4);

    const ert001 = dbRows.filter((r) => r.employeeCode === 'ERT001');
    expect(ert001).toHaveLength(2);
    expect(ert001[0]!.clockIn).toBe('8:00 AM');
    expect(ert001[0]!.clockOut).toBe('4:00 PM');
    expect(ert001[0]!.firstName).toBe('Alice');
    expect(ert001[0]!.lastName).toBe('Smith');
    expect(ert001[0]!.deptName).toBe('Front Desk');
    expect(ert001[0]!.positionName).toBe('Receptionist');
    expect(ert001[1]!.clockIn).toBe('9:00 AM');
    expect(ert001[1]!.clockOut).toBe('5:00 PM');

    const ert002 = dbRows.filter((r) => r.employeeCode === 'ERT002');
    expect(ert002).toHaveLength(2);
    expect(ert002[0]!.clockIn).toBe('7:00 AM');
    expect(ert002[0]!.clockOut).toBe('3:00 PM');
    expect(ert002[0]!.firstName).toBe('Bob');
    expect(ert002[0]!.lastName).toBe('Jones');
    expect(ert002[1]!.clockIn).toBe('10:00 AM');
    expect(ert002[1]!.clockOut).toBe('6:00 PM');
  });
});
