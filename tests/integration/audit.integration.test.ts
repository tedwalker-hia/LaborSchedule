/**
 * Integration tests: each schedule/user mutation → HIALaborScheduleAudit row.
 *
 * Covers all 10 action types:
 *   schedule.save (insert), schedule.save (update), schedule.add,
 *   schedule.lock, schedule.clear, schedule.delete, schedule.generate,
 *   user.create, user.update, user.delete, user.password-reset
 *
 * Also verifies: failed mutation rolls back audit row.
 *
 * Isolation: usrSystemCompanyId = 'INTTEST_AUDSCHED', email = '@inttest-aud.local'
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ScheduleService } from '@/lib/services/schedule-service';
import { GenerationService } from '@/lib/services/generation-service';
import { UserService } from '@/lib/services/user-service';
import { makeSchedulesRepo } from '@/lib/repositories/schedules-repo';
import { makePayrollRepo } from '@/lib/repositories/payroll-repo';
import { makeUsersRepo } from '@/lib/repositories/users-repo';
import { makeAuditService } from '@/lib/services/audit-service';
import { makeAuditRepo } from '@/lib/repositories/audit-repo';
import type { AuditCtx } from '@/lib/services/audit-service';
import type { EmployeeHistory } from '@/lib/domain/types';

const COMPANY = 'INTTEST_AUDSCHED';
const USER_EMAIL_DOMAIN = '@inttest-aud.local';

let CTX: AuditCtx;
let fixtureUserId: number;
let prisma: PrismaClient;
let svc: ScheduleService;
let userSvc: UserService;

beforeAll(async () => {
  prisma = new PrismaClient();
  // Create a fixture user so changedByUserId FK is satisfied.
  const fixtureUser = await prisma.user.create({
    data: {
      firstName: 'Fixture',
      lastName: 'Auditor',
      email: `fixture-auditor${USER_EMAIL_DOMAIN}`,
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
  const usersRepo = makeUsersRepo(prisma as any);
  userSvc = new UserService(usersRepo, prisma, auditService);
});

afterAll(async () => {
  // Delete audit rows by changedByUserId before deleting the fixture user
  // (SetNull cascade would null changedByUserId, making targeted cleanup impossible).
  await prisma.laborScheduleAudit.deleteMany({ where: { changedByUserId: fixtureUserId } });
  await prisma.laborScheduleAudit.deleteMany({
    where: { schedule: { usrSystemCompanyId: COMPANY } },
  });
  await prisma.laborSchedule.deleteMany({ where: { usrSystemCompanyId: COMPANY } });
  await prisma.user.deleteMany({ where: { email: { endsWith: USER_EMAIL_DOMAIN } } });
  await prisma.$disconnect();
});

// ─── schedule.save (insert) ───────────────────────────────────────────────────

describe('audit: schedule.save (insert)', () => {
  it('writes audit row with correct fields', async () => {
    const result = await svc.save(
      {
        usrSystemCompanyId: COMPANY,
        changes: [
          { employeeCode: 'EAUD_S1', date: '2025-07-01', clockIn: '8:00 AM', clockOut: '4:00 PM' },
        ],
      },
      CTX,
    );
    expect(result.inserted).toBe(1);

    const schedule = await prisma.laborSchedule.findFirst({
      where: { usrSystemCompanyId: COMPANY, employeeCode: 'EAUD_S1' },
    });
    expect(schedule).not.toBeNull();

    const audit = await prisma.laborScheduleAudit.findFirst({
      where: { scheduleId: schedule!.id },
    });
    expect(audit).not.toBeNull();
    expect(audit!.action).toBe('schedule.save');
    expect(audit!.changedByUserId).toBe(CTX.userId);
    expect(audit!.oldJson).toBeNull();
    expect(JSON.parse(audit!.newJson!)).toMatchObject({ clockIn: '8:00 AM' });
  });
});

// ─── schedule.save (update) ───────────────────────────────────────────────────

describe('audit: schedule.save (update)', () => {
  it('writes audit row with OldJson and NewJson', async () => {
    await prisma.laborSchedule.create({
      data: {
        usrSystemCompanyId: COMPANY,
        employeeCode: 'EAUD_S2',
        scheduleDate: new Date('2025-07-02T00:00:00Z'),
        clockIn: '7:00 AM',
        clockOut: '3:00 PM',
      },
    });

    await svc.save(
      {
        usrSystemCompanyId: COMPANY,
        changes: [
          { employeeCode: 'EAUD_S2', date: '2025-07-02', clockIn: '9:00 AM', clockOut: '5:00 PM' },
        ],
      },
      CTX,
    );

    // Original record was deleted; new record exists
    const newSchedule = await prisma.laborSchedule.findFirst({
      where: { usrSystemCompanyId: COMPANY, employeeCode: 'EAUD_S2' },
    });
    expect(newSchedule).not.toBeNull();

    const audit = await prisma.laborScheduleAudit.findFirst({
      where: { scheduleId: newSchedule!.id },
    });
    expect(audit).not.toBeNull();
    expect(audit!.action).toBe('schedule.save');
    expect(audit!.changedByUserId).toBe(CTX.userId);
    expect(JSON.parse(audit!.oldJson!)).toMatchObject({ clockIn: '7:00 AM' });
    expect(JSON.parse(audit!.newJson!)).toMatchObject({ clockIn: '9:00 AM' });
  });
});

// ─── schedule.add ─────────────────────────────────────────────────────────────

describe('audit: schedule.add', () => {
  it('writes audit row with correct action and NewJson', async () => {
    const result = await svc.add(
      {
        usrSystemCompanyId: COMPANY,
        employeeCode: 'EAUD_A1',
        date: '2025-07-10',
        clockIn: '8:00 AM',
        clockOut: '4:00 PM',
        deptName: 'Housekeeping',
      },
      CTX,
    );

    const audit = await prisma.laborScheduleAudit.findFirst({
      where: { scheduleId: result.id },
    });
    expect(audit).not.toBeNull();
    expect(audit!.action).toBe('schedule.add');
    expect(audit!.changedByUserId).toBe(CTX.userId);
    expect(audit!.oldJson).toBeNull();
    expect(JSON.parse(audit!.newJson!)).toMatchObject({ locked: true });
  });
});

// ─── schedule.lock ────────────────────────────────────────────────────────────

describe('audit: schedule.lock', () => {
  it('writes audit row with old and new locked state', async () => {
    const schedule = await prisma.laborSchedule.create({
      data: {
        usrSystemCompanyId: COMPANY,
        employeeCode: 'EAUD_L1',
        scheduleDate: new Date('2025-07-20T00:00:00Z'),
        locked: false,
      },
    });

    await svc.lock(
      {
        usrSystemCompanyId: COMPANY,
        records: [{ employeeCode: 'EAUD_L1', date: '2025-07-20' }],
        locked: true,
      },
      CTX,
    );

    const audit = await prisma.laborScheduleAudit.findFirst({
      where: { scheduleId: schedule.id },
      orderBy: { auditId: 'desc' },
    });
    expect(audit).not.toBeNull();
    expect(audit!.action).toBe('schedule.lock');
    expect(audit!.changedByUserId).toBe(CTX.userId);
    expect(JSON.parse(audit!.oldJson!)).toEqual({ locked: false });
    expect(JSON.parse(audit!.newJson!)).toEqual({ locked: true });
  });
});

// ─── schedule.clear ───────────────────────────────────────────────────────────

describe('audit: schedule.clear', () => {
  it('writes audit row with OldJson; scheduleId nulled after cascade delete', async () => {
    const schedule = await prisma.laborSchedule.create({
      data: {
        usrSystemCompanyId: COMPANY,
        employeeCode: 'EAUD_C1',
        scheduleDate: new Date('2025-07-30T00:00:00Z'),
        clockIn: '8:00 AM',
        locked: false,
      },
    });
    const scheduleId = schedule.id;

    await svc.clear(
      {
        usrSystemCompanyId: COMPANY,
        employeeCodes: ['EAUD_C1'],
        startDate: '2025-07-30',
        endDate: '2025-07-30',
      },
      CTX,
    );

    // Schedule row is gone
    const gone = await prisma.laborSchedule.findUnique({ where: { id: scheduleId } });
    expect(gone).toBeNull();

    // Audit row preserved; scheduleId nulled by ON DELETE SET NULL
    const audit = await prisma.laborScheduleAudit.findFirst({
      where: { scheduleId: null, action: 'schedule.clear' },
      orderBy: { auditId: 'desc' },
    });
    expect(audit).not.toBeNull();
    expect(audit!.action).toBe('schedule.clear');
    expect(audit!.changedByUserId).toBe(CTX.userId);
    expect(JSON.parse(audit!.oldJson!)).toMatchObject({ clockIn: '8:00 AM' });
    expect(audit!.newJson).toBeNull();
  });
});

// ─── schedule.delete ──────────────────────────────────────────────────────────

describe('audit: schedule.delete', () => {
  it('writes audit row for each deleted record; scheduleId nulled after cascade', async () => {
    const s1 = await prisma.laborSchedule.create({
      data: {
        usrSystemCompanyId: COMPANY,
        employeeCode: 'EAUD_D1',
        scheduleDate: new Date('2025-08-01T00:00:00Z'),
        locked: false,
      },
    });
    const s2 = await prisma.laborSchedule.create({
      data: {
        usrSystemCompanyId: COMPANY,
        employeeCode: 'EAUD_D1',
        scheduleDate: new Date('2025-08-02T00:00:00Z'),
        locked: true,
      },
    });

    const beforeCount = await prisma.laborScheduleAudit.count({ where: { scheduleId: null } });

    await svc.delete(
      {
        usrSystemCompanyId: COMPANY,
        employeeCodes: ['EAUD_D1'],
        startDate: '2025-08-01',
        endDate: '2025-08-02',
      },
      CTX,
    );

    // Both schedule rows gone
    expect(await prisma.laborSchedule.findUnique({ where: { id: s1.id } })).toBeNull();
    expect(await prisma.laborSchedule.findUnique({ where: { id: s2.id } })).toBeNull();

    // Two new orphan audit rows (scheduleId = null after cascade)
    const afterCount = await prisma.laborScheduleAudit.count({ where: { scheduleId: null } });
    expect(afterCount).toBe(beforeCount + 2);
  });
});

// ─── schedule.generate ────────────────────────────────────────────────────────

describe('audit: schedule.generate', () => {
  it('writes a summary audit row with correct fields', async () => {
    // Monday 2025-07-07
    const MONDAY = '2025-07-07';
    const EMP = 'EAUD_GEN1';

    const mondayHistory: EmployeeHistory = {
      avgByDow: { 0: 8 },
      workDays: [0],
      avgWeeklyHours: 8,
      totalDaysWorked: 4,
      avgDailyHours: 8,
    };

    const stubPayrollRepo = {
      findPositionWindows: async (_companyId: string, codes: string[]) => {
        const m = new Map<string, EmployeeHistory[]>();
        for (const c of codes) m.set(c, []);
        return m;
      },
      findPayrollWindows: async (_companyId: string, codes: string[]) => {
        const m = new Map<string, EmployeeHistory | null>();
        for (const c of codes) m.set(c, mondayHistory);
        return m;
      },
    } as any;

    const genSvc = new GenerationService(
      stubPayrollRepo,
      prisma,
      makeAuditService(makeAuditRepo(prisma as any)),
    );

    const auditBefore = await prisma.laborScheduleAudit.count({
      where: { action: 'schedule.generate' },
    });

    const result = await genSvc.generate(
      { usrSystemCompanyId: COMPANY, employeeCodes: [EMP], startDate: MONDAY, endDate: MONDAY },
      CTX,
    );

    expect(result.inserted).toBe(1);

    const auditAfter = await prisma.laborScheduleAudit.count({
      where: { action: 'schedule.generate' },
    });
    expect(auditAfter).toBe(auditBefore + 1);

    const audit = await prisma.laborScheduleAudit.findFirst({
      where: { action: 'schedule.generate' },
      orderBy: { auditId: 'desc' },
    });
    expect(audit).not.toBeNull();
    expect(audit!.changedByUserId).toBe(CTX.userId);
    expect(audit!.scheduleId).toBeNull();
    expect(audit!.oldJson).toBeNull();
    const summary = JSON.parse(audit!.newJson!);
    expect(summary.employeeCount).toBe(1);
    expect(summary.startDate).toBe(MONDAY);
    expect(summary.endDate).toBe(MONDAY);
    expect(summary.inserted).toBe(1);
  });
});

// ─── rollback ─────────────────────────────────────────────────────────────────

describe('audit: failed mutation rolls back audit row', () => {
  it('save() transaction failure leaves no audit rows', async () => {
    const existing = await prisma.laborSchedule.create({
      data: {
        usrSystemCompanyId: COMPANY,
        employeeCode: 'EAUD_RB1',
        scheduleDate: new Date('2025-09-01T00:00:00Z'),
        clockIn: '6:00 AM',
        clockOut: '2:00 PM',
      },
    });

    const auditBefore = await prisma.laborScheduleAudit.count();

    await expect(
      svc.save(
        {
          usrSystemCompanyId: COMPANY,
          changes: [
            // Two changes for same record → second delete fails → rolls back
            {
              employeeCode: 'EAUD_RB1',
              date: '2025-09-01',
              clockIn: '8:00 AM',
              clockOut: '4:00 PM',
            },
            {
              employeeCode: 'EAUD_RB1',
              date: '2025-09-01',
              clockIn: '9:00 AM',
              clockOut: '5:00 PM',
            },
          ],
        },
        CTX,
      ),
    ).rejects.toThrow();

    // No new audit rows written
    const auditAfter = await prisma.laborScheduleAudit.count();
    expect(auditAfter).toBe(auditBefore);

    // Original schedule row intact
    const restored = await prisma.laborSchedule.findFirst({
      where: { usrSystemCompanyId: COMPANY, employeeCode: 'EAUD_RB1' },
    });
    expect(restored!.id).toBe(existing.id);
  });
});

// ─── user.create ─────────────────────────────────────────────────────────────

describe('audit: user.create', () => {
  it('writes audit row with OldJson=null and redacted NewJson', async () => {
    const user = await userSvc.create(
      {
        firstName: 'AudCreate',
        lastName: 'Test',
        email: `aud-create${USER_EMAIL_DOMAIN}`,
        password: 'Test@1234',
        role: 'DeptAdmin',
      },
      CTX,
    );

    const audit = await prisma.laborScheduleAudit.findFirst({
      where: { action: 'user.create', changedByUserId: CTX.userId },
      orderBy: { auditId: 'desc' },
    });
    expect(audit).not.toBeNull();
    expect(audit!.oldJson).toBeNull();
    const newData = JSON.parse(audit!.newJson!);
    expect(newData.userId).toBe(user.userId);
    expect(newData.email).toBe(`aud-create${USER_EMAIL_DOMAIN}`);
    expect(newData.passwordHash).toBeUndefined();
    expect(newData.password).toBeUndefined();
  });
});

// ─── user.update ─────────────────────────────────────────────────────────────

describe('audit: user.update', () => {
  it('writes audit row with OldJson and NewJson; no password material', async () => {
    const user = await userSvc.create(
      {
        firstName: 'AudUpdate',
        lastName: 'Test',
        email: `aud-update${USER_EMAIL_DOMAIN}`,
        password: 'Test@1234',
        role: 'DeptAdmin',
      },
      CTX,
    );

    await userSvc.update(
      user.userId,
      {
        firstName: 'AudUpdated',
        lastName: 'Test',
        email: `aud-update${USER_EMAIL_DOMAIN}`,
        role: 'HotelAdmin',
      },
      CTX,
    );

    const audit = await prisma.laborScheduleAudit.findFirst({
      where: { action: 'user.update', changedByUserId: CTX.userId },
      orderBy: { auditId: 'desc' },
    });
    expect(audit).not.toBeNull();
    const oldData = JSON.parse(audit!.oldJson!);
    const newData = JSON.parse(audit!.newJson!);
    expect(oldData.firstName).toBe('AudUpdate');
    expect(newData.firstName).toBe('AudUpdated');
    expect(newData.role).toBe('HotelAdmin');
    expect(oldData.passwordHash).toBeUndefined();
    expect(newData.passwordHash).toBeUndefined();
  });
});

// ─── user.delete ─────────────────────────────────────────────────────────────

describe('audit: user.delete', () => {
  it('writes audit row with OldJson and NewJson=null', async () => {
    const user = await userSvc.create(
      {
        firstName: 'AudDelete',
        lastName: 'Test',
        email: `aud-delete${USER_EMAIL_DOMAIN}`,
        password: 'Test@1234',
        role: 'DeptAdmin',
      },
      CTX,
    );

    await userSvc.delete(user.userId, CTX);

    const audit = await prisma.laborScheduleAudit.findFirst({
      where: { action: 'user.delete', changedByUserId: CTX.userId },
      orderBy: { auditId: 'desc' },
    });
    expect(audit).not.toBeNull();
    expect(audit!.newJson).toBeNull();
    const oldData = JSON.parse(audit!.oldJson!);
    expect(oldData.userId).toBe(user.userId);
    expect(oldData.passwordHash).toBeUndefined();
  });
});

// ─── user.password-reset ──────────────────────────────────────────────────────

describe('audit: user.password-reset', () => {
  it('writes audit row with OldJson=null and NewJson containing userId+resetAt only', async () => {
    const user = await userSvc.create(
      {
        firstName: 'AudReset',
        lastName: 'Test',
        email: `aud-reset${USER_EMAIL_DOMAIN}`,
        password: 'Test@1234',
        role: 'DeptAdmin',
      },
      CTX,
    );

    await userSvc.resetPassword(user.userId, 'NewPass@5678', CTX);

    const audit = await prisma.laborScheduleAudit.findFirst({
      where: { action: 'user.password-reset', changedByUserId: CTX.userId },
      orderBy: { auditId: 'desc' },
    });
    expect(audit).not.toBeNull();
    expect(audit!.oldJson).toBeNull();
    const newData = JSON.parse(audit!.newJson!);
    expect(newData.userId).toBe(user.userId);
    expect(newData.resetAt).toBeDefined();
    expect(newData.passwordHash).toBeUndefined();
    expect(newData.password).toBeUndefined();
  });
});
