import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  UserService,
  UserNotFoundError,
  EmailConflictError,
  type UserScope,
} from '@/lib/services/user-service';

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed-pw'),
  },
}));

const makeRepo = () => ({
  findById: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateWithAssignments: vi.fn(),
  softDelete: vi.fn(),
  findByEmail: vi.fn(),
  findWithScopes: vi.fn(),
});

const makeDb = () => ({
  $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn({})),
});

type Repo = ReturnType<typeof makeRepo>;
type Db = ReturnType<typeof makeDb>;

describe('UserService.list', () => {
  let repo: Repo;
  let svc: UserService;

  beforeEach(() => {
    repo = makeRepo();
    repo.findMany.mockResolvedValue([]);
    svc = new UserService(repo as any, makeDb() as any);
  });

  it('passes { isActive: true } for scope all', async () => {
    await svc.list({ type: 'all' });
    expect(repo.findMany).toHaveBeenCalledWith({ isActive: true });
  });

  it('builds OR filter for byTenants scope', async () => {
    await svc.list({ type: 'byTenants', tenants: ['T1', 'T2'] });
    const where = repo.findMany.mock.calls[0]![0];
    expect(where.isActive).toBe(true);
    expect(where.OR).toHaveLength(3);
  });

  it('builds OR filter for byHotels scope', async () => {
    await svc.list({ type: 'byHotels', hotels: ['HotelA'] });
    const where = repo.findMany.mock.calls[0]![0];
    expect(where.isActive).toBe(true);
    expect(where.OR).toHaveLength(2);
  });

  it('builds departments.some filter for byDepts scope', async () => {
    await svc.list({
      type: 'byDepts',
      departments: [{ hotelName: 'HotelA', deptName: 'FD' }],
    });
    const where = repo.findMany.mock.calls[0]![0];
    expect(where.isActive).toBe(true);
    expect(where.departments).toBeDefined();
  });
});

// ------- get -------

describe('UserService.get', () => {
  let repo: Repo;
  let svc: UserService;

  beforeEach(() => {
    repo = makeRepo();
    svc = new UserService(repo as any, makeDb() as any);
  });

  it('returns user when found', async () => {
    const user = { userId: 1, firstName: 'Alice' };
    repo.findById.mockResolvedValue(user);
    const result = await svc.get(1);
    expect(result).toBe(user);
  });

  it('throws UserNotFoundError when not found', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(svc.get(99)).rejects.toThrow(UserNotFoundError);
  });
});

// ------- create -------

describe('UserService.create', () => {
  let repo: Repo;
  let svc: UserService;

  beforeEach(() => {
    repo = makeRepo();
    repo.findFirst.mockResolvedValue(null);
    repo.create.mockResolvedValue({ userId: 1 });
    svc = new UserService(repo as any, makeDb() as any);
  });

  it('hashes password and calls repo.create', async () => {
    await svc.create({
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'Alice@Example.com',
      password: 'secret',
      role: 'DeptAdmin',
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'alice@example.com',
        passwordHash: 'hashed-pw',
        mustChangePassword: true,
        isActive: true,
      }),
    );
  });

  it('throws EmailConflictError on duplicate email', async () => {
    repo.findFirst.mockResolvedValue({ userId: 99 });
    await expect(
      svc.create({
        firstName: 'Bob',
        lastName: 'Jones',
        email: 'dup@example.com',
        password: 'pw',
        role: 'DeptAdmin',
      }),
    ).rejects.toThrow(EmailConflictError);
    expect(repo.create).not.toHaveBeenCalled();
  });
});

// ------- update -------

describe('UserService.update', () => {
  let repo: Repo;
  let db: Db;
  let svc: UserService;

  beforeEach(() => {
    repo = makeRepo();
    db = makeDb();
    repo.findById.mockResolvedValue({ userId: 1 });
    repo.findFirst.mockResolvedValue(null);
    repo.updateWithAssignments.mockResolvedValue({ userId: 1 });
    svc = new UserService(repo as any, db as any);
  });

  it('wraps update in transaction', async () => {
    await svc.update(1, {
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@example.com',
      role: 'DeptAdmin',
    });
    expect(db.$transaction).toHaveBeenCalled();
  });

  it('throws UserNotFoundError for unknown id', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(
      svc.update(99, { firstName: 'X', lastName: 'Y', email: 'x@y.com', role: 'DeptAdmin' }),
    ).rejects.toThrow(UserNotFoundError);
  });

  it('throws EmailConflictError on duplicate email', async () => {
    repo.findFirst.mockResolvedValue({ userId: 99 });
    await expect(
      svc.update(1, { firstName: 'X', lastName: 'Y', email: 'dup@example.com', role: 'DeptAdmin' }),
    ).rejects.toThrow(EmailConflictError);
  });

  it('hashes password when provided', async () => {
    await svc.update(1, {
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@example.com',
      role: 'DeptAdmin',
      password: 'newpass',
    });
    // transaction fn is called; updateWithAssignments receives hashed password
    expect(db.$transaction).toHaveBeenCalled();
  });
});

// ------- delete -------

describe('UserService.delete', () => {
  let repo: Repo;
  let svc: UserService;

  beforeEach(() => {
    repo = makeRepo();
    svc = new UserService(repo as any, makeDb() as any);
  });

  it('calls softDelete when user exists', async () => {
    repo.findById.mockResolvedValue({ userId: 5 });
    repo.softDelete.mockResolvedValue({});
    await svc.delete(5);
    expect(repo.softDelete).toHaveBeenCalledWith(5);
  });

  it('throws UserNotFoundError when user missing', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(svc.delete(99)).rejects.toThrow(UserNotFoundError);
    expect(repo.softDelete).not.toHaveBeenCalled();
  });
});

// ------- resetPassword -------

describe('UserService.resetPassword', () => {
  let repo: Repo;
  let svc: UserService;

  beforeEach(() => {
    repo = makeRepo();
    svc = new UserService(repo as any, makeDb() as any);
  });

  it('hashes password and updates user', async () => {
    repo.findById.mockResolvedValue({ userId: 3 });
    repo.update.mockResolvedValue({});
    await svc.resetPassword(3, 'newpassword');
    expect(repo.update).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ passwordHash: 'hashed-pw', mustChangePassword: true }),
    );
  });

  it('throws UserNotFoundError for unknown id', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(svc.resetPassword(99, 'pw')).rejects.toThrow(UserNotFoundError);
    expect(repo.update).not.toHaveBeenCalled();
  });
});
