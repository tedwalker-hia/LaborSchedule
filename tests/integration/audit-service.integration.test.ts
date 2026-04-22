/**
 * Integration tests for AuditService + AuditRepo.
 *
 * AuditService.record() now writes real rows — these tests verify the full
 * repo insert path and correct error propagation. The mutation-level audit
 * tests (schedule.save, schedule.add, etc.) live in audit.integration.test.ts.
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

// ─── AuditService.record ─────────────────────────────────────────────────────

describe('AuditService.record', () => {
  it('writes an audit row to the DB', async () => {
    const schedule = await prisma.laborSchedule.create({
      data: {
        usrSystemCompanyId: COMPANY,
        employeeCode: 'EAUD00',
        scheduleDate: new Date('2025-06-01T00:00:00Z'),
      },
    });

    const before = await prisma.laborScheduleAudit.count();
    await svc.record({
      scheduleId: schedule.id,
      changedByUserId: null,
      action: 'schedule.save',
      oldJson: null,
      newJson: JSON.stringify({ clockIn: '8:00 AM' }),
    });
    const after = await prisma.laborScheduleAudit.count();

    expect(after).toBe(before + 1);
  });

  it('writes with a transaction client when tx is provided', async () => {
    const schedule = await prisma.laborSchedule.create({
      data: {
        usrSystemCompanyId: COMPANY,
        employeeCode: 'EAUD00B',
        scheduleDate: new Date('2025-06-02T00:00:00Z'),
      },
    });

    let writtenId: number | undefined;
    await (prisma as any).$transaction(async (tx: any) => {
      await svc.record(
        {
          scheduleId: schedule.id,
          changedByUserId: null,
          action: 'schedule.add',
          oldJson: null,
          newJson: '{}',
        },
        tx,
      );
      // Verify row is visible inside the transaction
      const row = await tx.laborScheduleAudit.findFirst({
        where: { scheduleId: schedule.id },
        orderBy: { auditId: 'desc' },
      });
      writtenId = row?.auditId;
    });

    expect(writtenId).toBeGreaterThan(0);
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
      action: 'schedule.save',
      oldJson: null,
      newJson: JSON.stringify({ clockIn: '8:00 AM' }),
    });

    expect(audit.auditId).toBeGreaterThan(0);
    expect(audit.scheduleId).toBe(schedule.id);
    expect(audit.action).toBe('schedule.save');

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
        action: 'schedule.delete',
        oldJson: null,
        newJson: null,
      }),
    ).rejects.toThrow();
  });

  it('allows null scheduleId (for delete-audited rows after cascade)', async () => {
    const audit = await repo.insert({
      scheduleId: null,
      changedByUserId: null,
      action: 'schedule.delete',
      oldJson: JSON.stringify({ employeeCode: 'GONE' }),
      newJson: null,
    });

    expect(audit.auditId).toBeGreaterThan(0);
    expect(audit.scheduleId).toBeNull();

    // Clean up this orphan row directly
    await prisma.laborScheduleAudit.delete({ where: { auditId: audit.auditId } });
  });
});
