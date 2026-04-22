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
import type { Role } from '../permissions';

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

  async create(input: CreateUserInput): Promise<UserListRow> {
    const existing = await this.repo.findFirst({ email: input.email.toLowerCase() });
    if (existing) throw new EmailConflictError();

    const passwordHash = await bcrypt.hash(input.password, 10);

    return this.repo.create({
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
  }

  async update(userId: number, input: UpdateUserInput): Promise<UserListRow> {
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
      return txRepo.updateWithAssignments(userId, fields, assignments);
    });
  }

  async delete(userId: number): Promise<void> {
    const existing = await this.repo.findById(userId);
    if (!existing) throw new UserNotFoundError(userId);
    await this.repo.softDelete(userId);
  }

  async resetPassword(userId: number, newPassword: string): Promise<void> {
    const existing = await this.repo.findById(userId);
    if (!existing) throw new UserNotFoundError(userId);

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.repo.update(userId, {
      passwordHash,
      mustChangePassword: true,
      updatedAt: new Date(),
    });
  }
}

export function makeUserService(
  repo: UsersRepo = makeUsersRepo(),
  db: PrismaClient = prisma,
): UserService {
  return new UserService(repo, db);
}
