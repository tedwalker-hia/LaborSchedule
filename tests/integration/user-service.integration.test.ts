/**
 * Integration tests for UserService.
 * Verifies user CRUD against the real HIALaborSchedulesUsers table.
 *
 * Isolation: all users created here share an email pattern ending in
 * '@inttest-usr.local' so they can be cleaned up reliably.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { UserService, UserNotFoundError, EmailConflictError } from '@/lib/services/user-service';
import { makeUsersRepo } from '@/lib/repositories/users-repo';
import { makeAuditService } from '@/lib/services/audit-service';
import { makeAuditRepo } from '@/lib/repositories/audit-repo';
import type { AuditCtx } from '@/lib/services/audit-service';

const EMAIL_DOMAIN = '@inttest-usr.local';
const TEST_PW = process.env.TEST_USER_PASSWORD ?? 'Test@1234';
const TEST_PW_ALT = process.env.TEST_USER_PASSWORD_ALT ?? 'Test@5678';

let CTX: AuditCtx;
let fixtureUserId: number;
let prisma: PrismaClient;
let svc: UserService;

beforeAll(async () => {
  prisma = new PrismaClient();
  const fixtureUser = await prisma.user.create({
    data: {
      firstName: 'Fixture',
      lastName: 'Admin',
      email: 'fixture-admin@inttest-admin.local',
      role: 'HotelAdmin',
      passwordHash: null,
      mustChangePassword: false,
      isActive: true,
    },
  });
  fixtureUserId = fixtureUser.userId;
  CTX = { userId: fixtureUserId, source: 'api' };

  const repo = makeUsersRepo(prisma as any);
  const auditService = makeAuditService(makeAuditRepo(prisma as any));
  svc = new UserService(repo, prisma, auditService);
});

afterAll(async () => {
  // Delete audit rows before deleting fixture user (prevents changedByUserId nulling via SetNull).
  await prisma.laborScheduleAudit.deleteMany({ where: { changedByUserId: fixtureUserId } });
  await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
  await prisma.user.deleteMany({ where: { email: 'fixture-admin@inttest-admin.local' } });
  await prisma.$disconnect();
});

// ─── create ──────────────────────────────────────────────────────────────────

describe('UserService.create', () => {
  it('inserts a new user and returns the created row', async () => {
    const user = await svc.create(
      {
        firstName: 'Alice',
        lastName: 'Int',
        email: `alice${EMAIL_DOMAIN}`,
        password: TEST_PW,
        role: 'HotelAdmin',
      },
      CTX,
    );

    expect(user.userId).toBeGreaterThan(0);
    expect(user.email).toBe(`alice${EMAIL_DOMAIN}`);
    expect(user.role).toBe('HotelAdmin');
    expect(user.isActive).toBe(true);
  });

  it('stores email in lowercase', async () => {
    const user = await svc.create(
      {
        firstName: 'Bob',
        lastName: 'Int',
        email: `Bob.Case${EMAIL_DOMAIN}`,
        password: TEST_PW,
        role: 'DeptAdmin',
      },
      CTX,
    );

    expect(user.email).toBe(`bob.case${EMAIL_DOMAIN}`);
  });

  it('throws EmailConflictError when email already exists', async () => {
    const email = `carol${EMAIL_DOMAIN}`;
    await svc.create(
      { firstName: 'Carol', lastName: 'Int', email, password: TEST_PW, role: 'HotelAdmin' },
      CTX,
    );

    await expect(
      svc.create(
        { firstName: 'Carol2', lastName: 'Int', email, password: TEST_PW_ALT, role: 'DeptAdmin' },
        CTX,
      ),
    ).rejects.toThrow(EmailConflictError);
  });
});

// ─── get ─────────────────────────────────────────────────────────────────────

describe('UserService.get', () => {
  it('returns user detail for a valid userId', async () => {
    const created = await svc.create(
      {
        firstName: 'Dave',
        lastName: 'Int',
        email: `dave${EMAIL_DOMAIN}`,
        password: TEST_PW,
        role: 'CompanyAdmin',
      },
      CTX,
    );

    const detail = await svc.get(created.userId);
    expect(detail.userId).toBe(created.userId);
    expect(detail.firstName).toBe('Dave');
    expect(detail.mustChangePassword).toBe(true);
  });

  it('throws UserNotFoundError for unknown userId', async () => {
    await expect(svc.get(999_999_999)).rejects.toThrow(UserNotFoundError);
  });
});

// ─── update ──────────────────────────────────────────────────────────────────

describe('UserService.update', () => {
  it('updates user fields and assignment arrays', async () => {
    const created = await svc.create(
      {
        firstName: 'Eve',
        lastName: 'Int',
        email: `eve${EMAIL_DOMAIN}`,
        password: TEST_PW,
        role: 'DeptAdmin',
      },
      CTX,
    );

    const updated = await svc.update(
      created.userId,
      {
        firstName: 'Eve2',
        lastName: 'Int2',
        email: `eve${EMAIL_DOMAIN}`,
        role: 'HotelAdmin',
        tenants: ['TenantA'],
      },
      CTX,
    );

    expect(updated.firstName).toBe('Eve2');
    expect(updated.role).toBe('HotelAdmin');
    expect(updated.tenants.map((t) => t.tenant)).toContain('TenantA');
  });

  it('throws UserNotFoundError when updating non-existent user', async () => {
    await expect(
      svc.update(
        999_999_999,
        { firstName: 'X', lastName: 'X', email: `x${EMAIL_DOMAIN}`, role: 'DeptAdmin' },
        CTX,
      ),
    ).rejects.toThrow(UserNotFoundError);
  });
});

// ─── delete (soft) ───────────────────────────────────────────────────────────

describe('UserService.delete', () => {
  it('marks user as inactive (soft delete)', async () => {
    const created = await svc.create(
      {
        firstName: 'Frank',
        lastName: 'Int',
        email: `frank${EMAIL_DOMAIN}`,
        password: TEST_PW,
        role: 'DeptAdmin',
      },
      CTX,
    );

    await svc.delete(created.userId, CTX);

    const raw = await prisma.user.findUnique({ where: { userId: created.userId } });
    expect(raw!.isActive).toBe(false);
  });

  it('throws UserNotFoundError for unknown userId', async () => {
    await expect(svc.delete(999_999_999, CTX)).rejects.toThrow(UserNotFoundError);
  });
});

// ─── list ─────────────────────────────────────────────────────────────────────

describe('UserService.list', () => {
  it('returns active users only for scope=all', async () => {
    // At least one active user should have been created above
    const users = await svc.list({ type: 'all' });
    const emails = users.map((u) => u.email);

    // Deleted user should NOT appear
    expect(emails).not.toContain(`frank${EMAIL_DOMAIN}`);
    // Active user should appear
    expect(emails).toContain(`alice${EMAIL_DOMAIN}`);
  });
});

// ─── FK Cascade Delete ───────────────────────────────────────────────────────

describe('FK Cascade Delete: HIALaborSchedulesUsers → assignments', () => {
  it('deletes cascade: UserTenant, UserHotel, UserDept when user deleted', async () => {
    // Create user with assignments
    const user = await prisma.user.create({
      data: {
        firstName: 'Grace',
        lastName: 'Cascade',
        email: `grace-cascade${EMAIL_DOMAIN}`,
        role: 'HotelAdmin',
        passwordHash: null,
        mustChangePassword: false,
        isActive: true,
      },
    });

    const userId = user.userId;

    // Create assignment records
    await prisma.userTenant.create({
      data: { userId, tenant: 'TestTenant' },
    });
    await prisma.userHotel.create({
      data: { userId, tenant: 'TestTenant', hotelName: 'TestHotel' },
    });
    await prisma.userDept.create({
      data: { userId, tenant: 'TestTenant', hotelName: 'TestHotel', deptName: 'TestDept' },
    });

    // Verify assignments exist
    const tenantsBeforeDelete = await prisma.userTenant.count({ where: { userId } });
    const hotelsBeforeDelete = await prisma.userHotel.count({ where: { userId } });
    const deptsBeforeDelete = await prisma.userDept.count({ where: { userId } });

    expect(tenantsBeforeDelete).toBe(1);
    expect(hotelsBeforeDelete).toBe(1);
    expect(deptsBeforeDelete).toBe(1);

    // Hard delete user
    await prisma.user.delete({ where: { userId } });

    // Verify cascade deleted all assignments
    const tenantsAfterDelete = await prisma.userTenant.count({ where: { userId } });
    const hotelsAfterDelete = await prisma.userHotel.count({ where: { userId } });
    const deptsAfterDelete = await prisma.userDept.count({ where: { userId } });

    expect(tenantsAfterDelete).toBe(0);
    expect(hotelsAfterDelete).toBe(0);
    expect(deptsAfterDelete).toBe(0);
  });
});
