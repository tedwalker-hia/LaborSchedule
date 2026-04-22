/**
 * Integration tests for AuditService + AuditRepo.
 *
 * AuditService.record() is a Phase 8 no-op stub — tested here to confirm it
 * resolves safely. AuditRepo.insert() is tested directly because it owns the
 * real DB write that Phase 8 will route through the service.
 *
 * Isolation: all LaborSchedule rows use usrSystemCompanyId = 'INTTEST_AUD'
 * so they cannot collide with fixture data or other suites.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { AuditService, makeAuditService } from '@/lib/services/audit-service';
import { AuditRepo, makeAuditRepo } from '@/lib/repositories/audit-repo';

const COMPANY = 'INTTEST_AUD';

let prisma: PrismaClient;
let repo: AuditRepo;
let svc: AuditService;

beforeAll(async () => {
  prisma = new PrismaClient();
  repo = makeAuditRepo(prisma as any);
  svc = makeAuditService(repo);
});

afterAll(async () => {
  await prisma.laborScheduleAudit.deleteMany({
    where: { schedule: { usrSystemCompanyId: COMPANY } },
  });
  await prisma.laborSchedule.deleteMany({ where: { usrSystemCompanyId: COMPANY } });
  await prisma.$disconnect();
});

// ─── AuditService.record (no-op stub) ────────────────────────────────────────

describe('AuditService.record', () => {
  it('resolves without error (no-op stub)', async () => {
    await expect(
      svc.record({
        scheduleId: 1,
        changedByUserId: null,
        action: 'UPDATE',
        oldJson: null,
        newJson: null,
      }),
    ).resolves.toBeUndefined();
  });

  it('does not write any row to the DB', async () => {
    const before = await prisma.laborScheduleAudit.count();

    await svc.record({
      scheduleId: 1,
      changedByUserId: null,
      action: 'UPDATE',
      oldJson: null,
      newJson: null,
    });

    const after = await prisma.laborScheduleAudit.count();
    expect(after).toBe(before);
  });
});

// ─── AuditRepo.insert ─────────────────────────────────────────────────────────

describe('AuditRepo.insert', () => {
  it('persists an audit row for an existing schedule record', async () => {
    const schedule = await prisma.laborSchedule.create({
      data: {
        usrSystemCompanyId: COMPANY,
        employeeCode: 'EAUD01',
        scheduleDate: new Date('2025-06-01T00:00:00Z'),
      },
    });

    const audit = await repo.insert({
      scheduleId: schedule.id,
      changedByUserId: null,
      action: 'CREATE',
      oldJson: null,
      newJson: JSON.stringify({ clockIn: '8:00 AM' }),
    });

    expect(audit.auditId).toBeGreaterThan(0);
    expect(audit.scheduleId).toBe(schedule.id);
    expect(audit.action).toBe('CREATE');

    const found = await prisma.laborScheduleAudit.findUnique({
      where: { auditId: audit.auditId },
    });
    expect(found).not.toBeNull();
    expect(found!.newJson).toContain('8:00 AM');
  });

  it('throws a foreign-key error for a non-existent scheduleId', async () => {
    await expect(
      repo.insert({
        scheduleId: 999_999_999,
        changedByUserId: null,
        action: 'DELETE',
        oldJson: null,
        newJson: null,
      }),
    ).rejects.toThrow();
  });
});
