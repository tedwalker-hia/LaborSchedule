import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';

const USER_LIST_SELECT = {
  userId: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
  isActive: true,
  tenants: { select: { tenant: true } },
  hotels: { select: { tenant: true, hotelName: true } },
  departments: { select: { tenant: true, hotelName: true, deptName: true } },
} satisfies Prisma.UserSelect;

const USER_DETAIL_SELECT = {
  userId: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  tenants: { select: { tenant: true } },
  hotels: {
    select: { tenant: true, hotelName: true, usrSystemCompanyId: true, branchId: true },
  },
  departments: { select: { tenant: true, hotelName: true, deptName: true } },
} satisfies Prisma.UserSelect;

export type UserListRow = Prisma.UserGetPayload<{ select: typeof USER_LIST_SELECT }>;
export type UserDetailRow = Prisma.UserGetPayload<{ select: typeof USER_DETAIL_SELECT }>;

export interface CreateUserParams {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  passwordHash: string;
  mustChangePassword?: boolean;
  isActive?: boolean;
  tenants: string[];
  hotels: {
    tenant: string;
    hotelName: string;
    usrSystemCompanyId?: string | null;
    branchId?: number | null;
  }[];
  departments: { tenant: string; hotelName: string; deptName: string }[];
}

export interface UpdateUserFields {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  updatedAt: Date;
  passwordHash?: string;
  mustChangePassword?: boolean;
}

export interface UserAssignments {
  tenants: string[];
  hotels: {
    tenant: string;
    hotelName: string;
    usrSystemCompanyId?: string | null;
    branchId?: number | null;
  }[];
  departments: { tenant: string; hotelName: string; deptName: string }[];
}

export class UsersRepo {
  constructor(private readonly db: Prisma.TransactionClient = prisma) {}

  /** Login lookup — returns full row including passwordHash. */
  async findByEmail(email: string) {
    return this.db.user.findFirst({
      where: { email: email.trim().toLowerCase(), isActive: true },
    });
  }

  /** Single user with detail select (includes mustChangePassword + hotel IDs). */
  async findById(userId: number) {
    return this.db.user.findUnique({
      where: { userId },
      select: USER_DETAIL_SELECT,
    });
  }

  /**
   * Loads an active user with full scope assignments needed for permission checks.
   * Returns hotels with usrSystemCompanyId + branchId for payroll routing.
   */
  async findWithScopes(userId: number) {
    return this.db.user.findUnique({
      where: { userId, isActive: true },
      include: {
        tenants: { select: { tenant: true } },
        hotels: {
          select: { tenant: true, hotelName: true, usrSystemCompanyId: true, branchId: true },
        },
        departments: { select: { tenant: true, hotelName: true, deptName: true } },
      },
    });
  }

  /** List query with role-scoped where clause. */
  async findMany(where: Prisma.UserWhereInput) {
    return this.db.user.findMany({
      where,
      select: USER_LIST_SELECT,
      orderBy: { lastName: 'asc' },
    });
  }

  /** Generic single-record lookup (email uniqueness checks, etc.). */
  async findFirst(where: Prisma.UserWhereInput) {
    return this.db.user.findFirst({ where });
  }

  async create(params: CreateUserParams) {
    const {
      tenants,
      hotels,
      departments,
      mustChangePassword = true,
      isActive = true,
      ...core
    } = params;
    return this.db.user.create({
      data: {
        ...core,
        mustChangePassword,
        isActive,
        tenants: { create: tenants.map((t) => ({ tenant: t })) },
        hotels: {
          create: hotels.map((h) => ({
            tenant: h.tenant,
            hotelName: h.hotelName,
            usrSystemCompanyId: h.usrSystemCompanyId ?? null,
            branchId: h.branchId ?? null,
          })),
        },
        departments: { create: departments },
      },
      select: USER_LIST_SELECT,
    });
  }

  /** Plain field update — use inside a transaction client for assignment-replace flows. */
  async update(userId: number, data: Prisma.UserUpdateInput) {
    return this.db.user.update({ where: { userId }, data });
  }

  /**
   * Replaces all scope assignments and updates user fields in one shot.
   * Callers must ensure this runs inside `prisma.$transaction` by passing
   * the transaction client to `makeUsersRepo(tx)`.
   */
  async updateWithAssignments(
    userId: number,
    fields: UpdateUserFields,
    assignments: UserAssignments,
  ) {
    await this.db.userTenant.deleteMany({ where: { userId } });
    await this.db.userHotel.deleteMany({ where: { userId } });
    await this.db.userDept.deleteMany({ where: { userId } });

    return this.db.user.update({
      where: { userId },
      data: {
        ...fields,
        tenants: { create: assignments.tenants.map((t) => ({ tenant: t })) },
        hotels: {
          create: assignments.hotels.map((h) => ({
            tenant: h.tenant,
            hotelName: h.hotelName,
            usrSystemCompanyId: h.usrSystemCompanyId ?? null,
            branchId: h.branchId ?? null,
          })),
        },
        departments: { create: assignments.departments },
      },
      select: USER_LIST_SELECT,
    });
  }

  async softDelete(userId: number) {
    return this.db.user.update({
      where: { userId },
      data: { isActive: false, updatedAt: new Date() },
    });
  }
}

export function makeUsersRepo(db: Prisma.TransactionClient = prisma): UsersRepo {
  return new UsersRepo(db);
}
