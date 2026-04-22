import bcrypt from 'bcryptjs';
import { PrismaClient, Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import {
  UsersRepo,
  makeUsersRepo,
  type UserListRow,
  type UserDetailRow,
  type UpdateUserFields,
} from '../repositories/users-repo';
import { AuditService, AuditCtx, makeAuditService } from './audit-service';
import type { Role } from '../auth/rbac';

function redactUser(user: object): Record<string, unknown> {
  const copy = { ...(user as Record<string, unknown>) };
  delete copy['passwordHash'];
  delete copy['password'];
  return copy;
}

export class UserNotFoundError extends Error {
  readonly statusHint = 404;
  constructor(userId: number) {
    super(`User ${userId} not found.`);
    this.name = 'UserNotFoundError';
  }
}

export class EmailConflictError extends Error {
  readonly statusHint = 409;
  constructor() {
    super('A user with this email already exists.');
    this.name = 'EmailConflictError';
  }
}

/**
 * Scope descriptor passed by route layer after permission resolution.
 * Keeps the service HTTP-ignorant while encoding role-based visibility.
 */
export type UserScope =
  | { type: 'all' }
  | { type: 'byTenants'; tenants: string[] }
  | { type: 'byHotels'; hotels: string[] }
  | { type: 'byDepts'; departments: { hotelName: string; deptName: string }[] };

export interface CreateUserInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: Role;
  tenants?: string[];
  hotels?: {
    tenant: string;
    hotelName: string;
    usrSystemCompanyId?: string | null;
    branchId?: number | null;
  }[];
  departments?: { tenant: string; hotelName: string; deptName: string }[];
}

export interface UpdateUserInput {
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  password?: string;
  tenants?: string[];
  hotels?: {
    tenant: string;
    hotelName: string;
    usrSystemCompanyId?: string | null;
    branchId?: number | null;
  }[];
  departments?: { tenant: string; hotelName: string; deptName: string }[];
}

export class UserService {
  constructor(
    private readonly repo: UsersRepo,
    private readonly db: PrismaClient = prisma,
    private readonly auditService: AuditService = makeAuditService(),
  ) {}

  async list(scope: UserScope): Promise<UserListRow[]> {
    let where: Prisma.UserWhereInput = { isActive: true };

    if (scope.type === 'byTenants') {
      where = {
        isActive: true,
        OR: [
          { tenants: { some: { tenant: { in: scope.tenants } } } },
          { hotels: { some: { tenant: { in: scope.tenants } } } },
          { departments: { some: { tenant: { in: scope.tenants } } } },
        ],
      };
    } else if (scope.type === 'byHotels') {
      where = {
        isActive: true,
        OR: [
          { hotels: { some: { hotelName: { in: scope.hotels } } } },
          { departments: { some: { hotelName: { in: scope.hotels } } } },
        ],
      };
    } else if (scope.type === 'byDepts') {
      where = {
        isActive: true,
        departments: {
          some: {
            OR: scope.departments.map((d) => ({
              hotelName: d.hotelName,
              deptName: d.deptName,
            })),
          },
        },
      };
    }

    return this.repo.findMany(where);
  }

  async get(userId: number): Promise<UserDetailRow> {
    const user = await this.repo.findById(userId);
    if (!user) throw new UserNotFoundError(userId);
    return user;
  }

  async create(input: CreateUserInput, ctx: AuditCtx): Promise<UserListRow> {
    const existing = await this.repo.findFirst({ email: input.email.toLowerCase() });
    if (existing) throw new EmailConflictError();

    const passwordHash = await bcrypt.hash(input.password, 10);

    return this.db.$transaction(async (tx) => {
      const txRepo = makeUsersRepo(tx);
      const user = await txRepo.create({
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email.toLowerCase(),
        role: input.role,
        passwordHash,
        mustChangePassword: true,
        isActive: true,
        tenants: input.tenants ?? [],
        hotels: input.hotels ?? [],
        departments: input.departments ?? [],
      });
      await this.auditService.record(
        {
          changedByUserId: ctx.userId,
          action: 'user.create',
          oldJson: null,
          newJson: JSON.stringify(redactUser(user)),
        },
        tx,
      );
      return user;
    });
  }

  async update(userId: number, input: UpdateUserInput, ctx: AuditCtx): Promise<UserListRow> {
    const existing = await this.repo.findById(userId);
    if (!existing) throw new UserNotFoundError(userId);

    const emailConflict = await this.repo.findFirst({
      email: input.email.toLowerCase(),
      NOT: { userId },
    });
    if (emailConflict) throw new EmailConflictError();

    const fields: UpdateUserFields = {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email.toLowerCase(),
      role: input.role,
      updatedAt: new Date(),
    };

    if (input.password) {
      fields.passwordHash = await bcrypt.hash(input.password, 10);
      fields.mustChangePassword = true;
    }

    const assignments = {
      tenants: input.tenants ?? [],
      hotels: input.hotels ?? [],
      departments: input.departments ?? [],
    };

    return this.db.$transaction(async (tx) => {
      const txRepo = makeUsersRepo(tx);
      const updated = await txRepo.updateWithAssignments(userId, fields, assignments);
      await this.auditService.record(
        {
          changedByUserId: ctx.userId,
          action: 'user.update',
          oldJson: JSON.stringify(redactUser(existing)),
          newJson: JSON.stringify(redactUser(updated)),
        },
        tx,
      );
      return updated;
    });
  }

  async delete(userId: number, ctx: AuditCtx): Promise<void> {
    const existing = await this.repo.findById(userId);
    if (!existing) throw new UserNotFoundError(userId);
    await this.db.$transaction(async (tx) => {
      await tx.user.update({ where: { userId }, data: { isActive: false, updatedAt: new Date() } });
      await this.auditService.record(
        {
          changedByUserId: ctx.userId,
          action: 'user.delete',
          oldJson: JSON.stringify(redactUser(existing)),
          newJson: null,
        },
        tx,
      );
    });
  }

  async resetPassword(userId: number, newPassword: string, ctx: AuditCtx): Promise<void> {
    const existing = await this.repo.findById(userId);
    if (!existing) throw new UserNotFoundError(userId);

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const resetAt = new Date().toISOString();
    await this.db.$transaction(async (tx) => {
      await tx.user.update({
        where: { userId },
        data: { passwordHash, mustChangePassword: true, updatedAt: new Date() },
      });
      await this.auditService.record(
        {
          changedByUserId: ctx.userId,
          action: 'user.password-reset',
          oldJson: null,
          newJson: JSON.stringify({ userId, resetAt }),
        },
        tx,
      );
    });
  }
}

export function makeUserService(
  repo: UsersRepo = makeUsersRepo(),
  db: PrismaClient = prisma,
  auditService: AuditService = makeAuditService(),
): UserService {
  return new UserService(repo, db, auditService);
}
