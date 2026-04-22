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

const EMAIL_DOMAIN = '@inttest-usr.local';

let prisma: PrismaClient;
let svc: UserService;

beforeAll(() => {
  prisma = new PrismaClient();
  const repo = makeUsersRepo(prisma as any);
  svc = new UserService(repo, prisma);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
  await prisma.$disconnect();
});

// ─── create ──────────────────────────────────────────────────────────────────

describe('UserService.create', () => {
  it('inserts a new user and returns the created row', async () => {
    const user = await svc.create({
      firstName: 'Alice',
      lastName: 'Int',
      email: `alice${EMAIL_DOMAIN}`,
      password: 'Test@1234',
      role: 'HotelAdmin',
    });

    expect(user.userId).toBeGreaterThan(0);
    expect(user.email).toBe(`alice${EMAIL_DOMAIN}`);
    expect(user.role).toBe('HotelAdmin');
    expect(user.isActive).toBe(true);
  });

  it('stores email in lowercase', async () => {
    const user = await svc.create({
      firstName: 'Bob',
      lastName: 'Int',
      email: `Bob.Case${EMAIL_DOMAIN}`,
      password: 'Test@1234',
      role: 'DeptAdmin',
    });

    expect(user.email).toBe(`bob.case${EMAIL_DOMAIN}`);
  });

  it('throws EmailConflictError when email already exists', async () => {
    const email = `carol${EMAIL_DOMAIN}`;
    await svc.create({
      firstName: 'Carol',
      lastName: 'Int',
      email,
      password: 'Test@1234',
      role: 'HotelAdmin',
    });

    await expect(
      svc.create({
        firstName: 'Carol2',
        lastName: 'Int',
        email,
        password: 'Test@5678',
        role: 'DeptAdmin',
      }),
    ).rejects.toThrow(EmailConflictError);
  });
});

// ─── get ─────────────────────────────────────────────────────────────────────

describe('UserService.get', () => {
  it('returns user detail for a valid userId', async () => {
    const created = await svc.create({
      firstName: 'Dave',
      lastName: 'Int',
      email: `dave${EMAIL_DOMAIN}`,
      password: 'Test@1234',
      role: 'CompanyAdmin',
    });

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
    const created = await svc.create({
      firstName: 'Eve',
      lastName: 'Int',
      email: `eve${EMAIL_DOMAIN}`,
      password: 'Test@1234',
      role: 'DeptAdmin',
    });

    const updated = await svc.update(created.userId, {
      firstName: 'Eve2',
      lastName: 'Int2',
      email: `eve${EMAIL_DOMAIN}`,
      role: 'HotelAdmin',
      tenants: ['TenantA'],
    });

    expect(updated.firstName).toBe('Eve2');
    expect(updated.role).toBe('HotelAdmin');
    expect(updated.tenants.map((t) => t.tenant)).toContain('TenantA');
  });

  it('throws UserNotFoundError when updating non-existent user', async () => {
    await expect(
      svc.update(999_999_999, {
        firstName: 'X',
        lastName: 'X',
        email: `x${EMAIL_DOMAIN}`,
        role: 'DeptAdmin',
      }),
    ).rejects.toThrow(UserNotFoundError);
  });
});

// ─── delete (soft) ───────────────────────────────────────────────────────────

describe('UserService.delete', () => {
  it('marks user as inactive (soft delete)', async () => {
    const created = await svc.create({
      firstName: 'Frank',
      lastName: 'Int',
      email: `frank${EMAIL_DOMAIN}`,
      password: 'Test@1234',
      role: 'DeptAdmin',
    });

    await svc.delete(created.userId);

    const raw = await prisma.user.findUnique({ where: { userId: created.userId } });
    expect(raw!.isActive).toBe(false);
  });

  it('throws UserNotFoundError for unknown userId', async () => {
    await expect(svc.delete(999_999_999)).rejects.toThrow(UserNotFoundError);
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
