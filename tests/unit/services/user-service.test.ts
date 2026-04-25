import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  UserService,
  UserNotFoundError,
  EmailConflictError,
  type UserScope,
} from '@/lib/services/user-service';
import type { AuditCtx } from '@/lib/services/audit-service';

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed-pw'),
  },
}));

const CTX: AuditCtx = { userId: 1, source: 'api' };
const TEST_PW = process.env.TEST_USER_PASSWORD ?? 'Test@1234';

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

const makeAuditSvc = () => ({
  record: vi.fn().mockResolvedValue(undefined),
});

const makeTx = () => ({
  user: {
    create: vi.fn().mockResolvedValue({
      userId: 1,
      email: 'test@test.com',
      role: 'DeptAdmin',
      isActive: true,
      firstName: 'A',
      lastName: 'B',
      tenants: [],
      hotels: [],
      departments: [],
    }),
    update: vi.fn().mockResolvedValue({}),
  },
  userTenant: { deleteMany: vi.fn().mockResolvedValue({}) },
  userHotel: { deleteMany: vi.fn().mockResolvedValue({}) },
  userDept: { deleteMany: vi.fn().mockResolvedValue({}) },
  laborScheduleAudit: { create: vi.fn().mockResolvedValue({}) },
});

const makeDb = () => {
  const tx = makeTx();
  return {
    $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn(tx)),
    _tx: tx,
  };
};

type Repo = ReturnType<typeof makeRepo>;
type Db = ReturnType<typeof makeDb>;

describe('UserService.list', () => {
  let repo: Repo;
  let svc: UserService;

  beforeEach(() => {
    repo = makeRepo();
    repo.findMany.mockResolvedValue([]);
    svc = new UserService(repo as any, makeDb() as any, makeAuditSvc() as any);
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
    svc = new UserService(repo as any, makeDb() as any, makeAuditSvc() as any);
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
  let db: Db;
  let auditSvc: ReturnType<typeof makeAuditSvc>;
  let svc: UserService;

  beforeEach(() => {
    repo = makeRepo();
    db = makeDb();
    auditSvc = makeAuditSvc();
    repo.findFirst.mockResolvedValue(null);
    svc = new UserService(repo as any, db as any, auditSvc as any);
  });

  it('wraps create in transaction and records audit', async () => {
    await svc.create(
      {
        firstName: 'Alice',
        lastName: 'Smith',
        email: 'Alice@Example.com',
        password: TEST_PW,
        role: 'DeptAdmin',
      },
      CTX,
    );

    expect(db.$transaction).toHaveBeenCalled();
    expect(auditSvc.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.create',
        oldJson: null,
        changedByUserId: CTX.userId,
      }),
      expect.anything(),
    );
  });

  it('throws EmailConflictError on duplicate email', async () => {
    repo.findFirst.mockResolvedValue({ userId: 99 });
    await expect(
      svc.create(
        {
          firstName: 'Bob',
          lastName: 'Jones',
          email: 'dup@example.com',
          password: TEST_PW,
          role: 'DeptAdmin',
        },
        CTX,
      ),
    ).rejects.toThrow(EmailConflictError);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

// ------- update -------

describe('UserService.update', () => {
  let repo: Repo;
  let db: Db;
  let auditSvc: ReturnType<typeof makeAuditSvc>;
  let svc: UserService;

  beforeEach(() => {
    repo = makeRepo();
    db = makeDb();
    auditSvc = makeAuditSvc();
    repo.findById.mockResolvedValue({ userId: 1 });
    repo.findFirst.mockResolvedValue(null);
    db._tx.user.update.mockResolvedValue({
      userId: 1,
      firstName: 'Updated',
      tenants: [],
      hotels: [],
      departments: [],
    });
    svc = new UserService(repo as any, db as any, auditSvc as any);
  });

  it('wraps update in transaction', async () => {
    await svc.update(
      1,
      { firstName: 'Alice', lastName: 'Smith', email: 'alice@example.com', role: 'DeptAdmin' },
      CTX,
    );
    expect(db.$transaction).toHaveBeenCalled();
  });

  it('records audit with user.update action', async () => {
    await svc.update(
      1,
      { firstName: 'Alice', lastName: 'Smith', email: 'alice@example.com', role: 'DeptAdmin' },
      CTX,
    );
    expect(auditSvc.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.update', changedByUserId: CTX.userId }),
      expect.anything(),
    );
  });

  it('throws UserNotFoundError for unknown id', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(
      svc.update(99, { firstName: 'X', lastName: 'Y', email: 'x@y.com', role: 'DeptAdmin' }, CTX),
    ).rejects.toThrow(UserNotFoundError);
  });

  it('throws EmailConflictError on duplicate email', async () => {
    repo.findFirst.mockResolvedValue({ userId: 99 });
    await expect(
      svc.update(
        1,
        { firstName: 'X', lastName: 'Y', email: 'dup@example.com', role: 'DeptAdmin' },
        CTX,
      ),
    ).rejects.toThrow(EmailConflictError);
  });
});

// ------- delete -------

describe('UserService.delete', () => {
  let repo: Repo;
  let db: Db;
  let auditSvc: ReturnType<typeof makeAuditSvc>;
  let svc: UserService;

  beforeEach(() => {
    repo = makeRepo();
    db = makeDb();
    auditSvc = makeAuditSvc();
    svc = new UserService(repo as any, db as any, auditSvc as any);
  });

  it('wraps delete in transaction and records audit', async () => {
    repo.findById.mockResolvedValue({
      userId: 5,
      email: 'a@b.com',
      role: 'DeptAdmin',
      isActive: true,
    });
    await svc.delete(5, CTX);
    expect(db.$transaction).toHaveBeenCalled();
    expect(auditSvc.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.delete',
        newJson: null,
        changedByUserId: CTX.userId,
      }),
      expect.anything(),
    );
  });

  it('throws UserNotFoundError when user missing', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(svc.delete(99, CTX)).rejects.toThrow(UserNotFoundError);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

// ------- resetPassword -------

describe('UserService.resetPassword', () => {
  let repo: Repo;
  let db: Db;
  let auditSvc: ReturnType<typeof makeAuditSvc>;
  let svc: UserService;

  beforeEach(() => {
    repo = makeRepo();
    db = makeDb();
    auditSvc = makeAuditSvc();
    svc = new UserService(repo as any, db as any, auditSvc as any);
  });

  it('wraps password reset in transaction and records audit', async () => {
    repo.findById.mockResolvedValue({ userId: 3 });
    await svc.resetPassword(3, 'newpassword', CTX);
    expect(db.$transaction).toHaveBeenCalled();
    expect(auditSvc.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.password-reset',
        oldJson: null,
        changedByUserId: CTX.userId,
      }),
      expect.anything(),
    );
    const recorded = auditSvc.record.mock.calls[0]![0];
    const newJsonParsed = JSON.parse(recorded.newJson);
    expect(newJsonParsed.userId).toBe(3);
    expect(newJsonParsed.resetAt).toBeDefined();
  });

  it('throws UserNotFoundError for unknown id', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(svc.resetPassword(99, 'pw', CTX)).rejects.toThrow(UserNotFoundError);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
