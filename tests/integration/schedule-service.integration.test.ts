/**
 * Integration tests for ScheduleService.
 * Verifies happy paths and failure modes against a real MSSQL instance
 * (spun up by the Testcontainers harness in setup.ts).
 *
 * Isolation: all rows use usrSystemCompanyId = 'INTTEST_SCH' so they
 * cannot collide with fixture data (TESTCO) or other integration test suites.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ScheduleService, DuplicateScheduleError } from '@/lib/services/schedule-service';
import { makeSchedulesRepo } from '@/lib/repositories/schedules-repo';
import { makePayrollRepo } from '@/lib/repositories/payroll-repo';
import { makeAuditService } from '@/lib/services/audit-service';
import { makeAuditRepo } from '@/lib/repositories/audit-repo';
import type { AuditCtx } from '@/lib/services/audit-service';

const COMPANY = 'INTTEST_SCH';

let CTX: AuditCtx;
let fixtureUserId: number;
let prisma: PrismaClient;
let svc: ScheduleService;

beforeAll(async () => {
  prisma = new PrismaClient();
  const fixtureUser = await prisma.user.create({
    data: {
      firstName: 'Fixture',
      lastName: 'Sched',
      email: 'fixture-sched@inttest-sch.local',
      role: 'HotelAdmin',
      passwordHash: null,
      mustChangePassword: false,
      isActive: true,
    },
  });
  fixtureUserId = fixtureUser.userId;
  CTX = { userId: fixtureUserId, source: 'api' };

  const repo = makeSchedulesRepo(prisma as any);
  const payrollRepo = makePayrollRepo(prisma as any);
  const auditService = makeAuditService(makeAuditRepo(prisma as any));
  svc = new ScheduleService(repo, prisma, payrollRepo, auditService);
});

afterAll(async () => {
  await prisma.laborScheduleAudit.deleteMany({ where: { changedByUserId: fixtureUserId } });
  await prisma.laborScheduleAudit.deleteMany({
    where: { schedule: { usrSystemCompanyId: COMPANY } },
  });
  await prisma.laborSchedule.deleteMany({ where: { usrSystemCompanyId: COMPANY } });
  await prisma.user.deleteMany({ where: { email: 'fixture-sched@inttest-sch.local' } });
  await prisma.$disconnect();
});

// ─── save ────────────────────────────────────────────────────────────────────

describe('ScheduleService.save', () => {
  it('inserts a new record and persists to DB', async () => {
    const result = await svc.save(
      {
        usrSystemCompanyId: COMPANY,
        hotel: 'Test Hotel',
        changes: [
          { employeeCode: 'ESCH01', date: '2025-03-01', clockIn: '8:00 AM', clockOut: '4:00 PM' },
        ],
      },
      CTX,
    );

    expect(result).toEqual({ inserted: 1, updated: 0, skipped: 0 });

    const row = await prisma.laborSchedule.findFirst({
      where: { usrSystemCompanyId: COMPANY, employeeCode: 'ESCH01' },
    });
    expect(row).not.toBeNull();
    expect(row!.clockIn).toBe('8:00 AM');
    expect(row!.clockOut).toBe('4:00 PM');
  });

  it('updates an existing record with different clock times', async () => {
    // Arrange: insert base record
    await prisma.laborSchedule.create({
      data: {
        usrSystemCompanyId: COMPANY,
        employeeCode: 'ESCH02',
        scheduleDate: new Date('2025-03-02T00:00:00Z'),
        clockIn: '7:00 AM',
        clockOut: '3:00 PM',
      },
    });

    const result = await svc.save(
      {
        usrSystemCompanyId: COMPANY,
        changes: [
          { employeeCode: 'ESCH02', date: '2025-03-02', clockIn: '8:00 AM', clockOut: '4:00 PM' },
        ],
      },
      CTX,
    );

    expect(result).toEqual({ inserted: 0, updated: 1, skipped: 0 });

    const row = await prisma.laborSchedule.findFirst({
      where: { usrSystemCompanyId: COMPANY, employeeCode: 'ESCH02' },
    });
    expect(row!.clockIn).toBe('8:00 AM');
    expect(row!.clockOut).toBe('4:00 PM');
  });

  it('skips a record when clock times are identical', async () => {
    // Pre-existing record with same times
    await prisma.laborSchedule.create({
      data: {
        usrSystemCompanyId: COMPANY,
        employeeCode: 'ESCH03',
        scheduleDate: new Date('2025-03-03T00:00:00Z'),
        clockIn: '9:00 AM',
        clockOut: '5:00 PM',
      },
    });

    const result = await svc.save(
      {
        usrSystemCompanyId: COMPANY,
        changes: [
          { employeeCode: 'ESCH03', date: '2025-03-03', clockIn: '9:00 AM', clockOut: '5:00 PM' },
        ],
      },
      CTX,
    );

    expect(result).toEqual({ inserted: 0, updated: 0, skipped: 1 });
  });

  it('rolls back all ops when transaction fails mid-way', async () => {
    // Arrange: one existing record for ESCH04 on 2025-03-04.
    // save() will be called with two changes targeting the SAME existing record.
    // Both findFirst calls return the same row (pre-transaction).
    // The ops array becomes: [delete(X), create(new1), delete(X), create(new2)].
    // Second delete(X) fails → entire transaction rolls back → original row survives.
    const existing = await prisma.laborSchedule.create({
      data: {
        usrSystemCompanyId: COMPANY,
        employeeCode: 'ESCH04',
        scheduleDate: new Date('2025-03-04T00:00:00Z'),
        clockIn: '6:00 AM',
        clockOut: '2:00 PM',
      },
    });

    await expect(
      svc.save(
        {
          usrSystemCompanyId: COMPANY,
          changes: [
            { employeeCode: 'ESCH04', date: '2025-03-04', clockIn: '8:00 AM', clockOut: '4:00 PM' },
            { employeeCode: 'ESCH04', date: '2025-03-04', clockIn: '9:00 AM', clockOut: '5:00 PM' },
          ],
        },
        CTX,
      ),
    ).rejects.toThrow();

    // Original record should be restored by the rollback
    const restored = await prisma.laborSchedule.findFirst({
      where: { usrSystemCompanyId: COMPANY, employeeCode: 'ESCH04' },
    });
    expect(restored).not.toBeNull();
    expect(restored!.id).toBe(existing.id);
    expect(restored!.clockIn).toBe('6:00 AM');
  });
});

// ─── add ─────────────────────────────────────────────────────────────────────

describe('ScheduleService.add', () => {
  it('inserts a locked record and returns its id', async () => {
    const result = await svc.add(
      {
        usrSystemCompanyId: COMPANY,
        employeeCode: 'ESCH10',
        date: '2025-03-10',
        clockIn: '8:00 AM',
        clockOut: '4:00 PM',
        deptName: 'Front Office',
        positionName: 'Receptionist',
      },
      CTX,
    );

    expect(result.id).toBeGreaterThan(0);

    const row = await prisma.laborSchedule.findUnique({ where: { id: result.id } });
    expect(row).not.toBeNull();
    expect(row!.locked).toBe(true);
    expect(row!.deptName).toBe('Front Office');
  });

  it('throws DuplicateScheduleError when same employee+date+position already exists', async () => {
    // Add once
    await svc.add(
      {
        usrSystemCompanyId: COMPANY,
        employeeCode: 'ESCH11',
        date: '2025-03-11',
        positionName: 'Manager',
      },
      CTX,
    );

    // Add again with same key
    await expect(
      svc.add(
        {
          usrSystemCompanyId: COMPANY,
          employeeCode: 'ESCH11',
          date: '2025-03-11',
          positionName: 'Manager',
        },
        CTX,
      ),
    ).rejects.toThrow(DuplicateScheduleError);
  });
});

// ─── lock ─────────────────────────────────────────────────────────────────────

describe('ScheduleService.lock', () => {
  it('sets locked=true on matching records in DB', async () => {
    await prisma.laborSchedule.create({
      data: {
        usrSystemCompanyId: COMPANY,
        employeeCode: 'ESCH20',
        scheduleDate: new Date('2025-03-20T00:00:00Z'),
        locked: false,
      },
    });

    const result = await svc.lock(
      {
        usrSystemCompanyId: COMPANY,
        records: [{ employeeCode: 'ESCH20', date: '2025-03-20' }],
        locked: true,
      },
      CTX,
    );

    expect(result.updated).toBe(1);

    const row = await prisma.laborSchedule.findFirst({
      where: { usrSystemCompanyId: COMPANY, employeeCode: 'ESCH20' },
    });
    expect(row!.locked).toBe(true);
  });
});

// ─── clear ───────────────────────────────────────────────────────────────────

describe('ScheduleService.clear', () => {
  it('deletes unlocked records and skips locked ones', async () => {
    await Promise.all([
      prisma.laborSchedule.create({
        data: {
          usrSystemCompanyId: COMPANY,
          employeeCode: 'ESCH30',
          scheduleDate: new Date('2025-03-30T00:00:00Z'),
          locked: false,
        },
      }),
      prisma.laborSchedule.create({
        data: {
          usrSystemCompanyId: COMPANY,
          employeeCode: 'ESCH30',
          scheduleDate: new Date('2025-03-31T00:00:00Z'),
          locked: true,
        },
      }),
    ]);

    const result = await svc.clear(
      {
        usrSystemCompanyId: COMPANY,
        employeeCodes: ['ESCH30'],
        startDate: '2025-03-30',
        endDate: '2025-03-31',
        clearLocked: false,
      },
      CTX,
    );

    expect(result.deleted).toBe(1);
    expect(result.lockedSkipped).toBe(1);

    const remaining = await prisma.laborSchedule.count({
      where: { usrSystemCompanyId: COMPANY, employeeCode: 'ESCH30' },
    });
    expect(remaining).toBe(1); // only locked record survives
  });
});

// ─── delete ──────────────────────────────────────────────────────────────────

describe('ScheduleService.delete', () => {
  it('removes all matching records regardless of lock state', async () => {
    await Promise.all([
      prisma.laborSchedule.create({
        data: {
          usrSystemCompanyId: COMPANY,
          employeeCode: 'ESCH40',
          scheduleDate: new Date('2025-04-01T00:00:00Z'),
          locked: false,
        },
      }),
      prisma.laborSchedule.create({
        data: {
          usrSystemCompanyId: COMPANY,
          employeeCode: 'ESCH40',
          scheduleDate: new Date('2025-04-02T00:00:00Z'),
          locked: true,
        },
      }),
    ]);

    const result = await svc.delete(
      {
        usrSystemCompanyId: COMPANY,
        employeeCodes: ['ESCH40'],
        startDate: '2025-04-01',
        endDate: '2025-04-02',
      },
      CTX,
    );

    expect(result.deleted).toBe(2);

    const remaining = await prisma.laborSchedule.count({
      where: { usrSystemCompanyId: COMPANY, employeeCode: 'ESCH40' },
    });
    expect(remaining).toBe(0);
  });
});

// ─── checkLocked ─────────────────────────────────────────────────────────────

describe('ScheduleService.checkLocked', () => {
  it('returns locked records grouped by employee', async () => {
    await Promise.all([
      prisma.laborSchedule.create({
        data: {
          usrSystemCompanyId: COMPANY,
          employeeCode: 'ESCH50',
          firstName: 'Eve',
          lastName: 'Test',
          scheduleDate: new Date('2025-05-01T00:00:00Z'),
          locked: true,
        },
      }),
      prisma.laborSchedule.create({
        data: {
          usrSystemCompanyId: COMPANY,
          employeeCode: 'ESCH50',
          firstName: 'Eve',
          lastName: 'Test',
          scheduleDate: new Date('2025-05-02T00:00:00Z'),
          locked: true,
        },
      }),
      prisma.laborSchedule.create({
        data: {
          usrSystemCompanyId: COMPANY,
          employeeCode: 'ESCH50',
          firstName: 'Eve',
          lastName: 'Test',
          scheduleDate: new Date('2025-05-03T00:00:00Z'),
          locked: false,
        },
      }),
    ]);

    const locked = await svc.checkLocked({
      usrSystemCompanyId: COMPANY,
      employeeCodes: ['ESCH50'],
      startDate: '2025-05-01',
      endDate: '2025-05-03',
    });

    expect(locked).toHaveLength(1);
    expect(locked[0]!.employeeCode).toBe('ESCH50');
    expect(locked[0]!.lockedCount).toBe(2);
  });
});
