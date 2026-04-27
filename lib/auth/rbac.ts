import { prisma } from '@/lib/prisma';

export type Role = 'SuperAdmin' | 'CompanyAdmin' | 'HotelAdmin' | 'DeptAdmin';

const ROLE_HIERARCHY: Record<Role, number> = {
  SuperAdmin: 4,
  CompanyAdmin: 3,
  HotelAdmin: 2,
  DeptAdmin: 1,
};

interface UserWithAssignments {
  userId: number;
  role: Role;
  isActive: boolean;
  tenants: { tenant: string }[];
  hotels: {
    tenant: string;
    hotelName: string;
    usrSystemCompanyId: string | null;
    branchId: number | null;
  }[];
  departments: { tenant: string; hotelName: string; deptName: string }[];
}

export type TenantScope = { unlimited: true } | { unlimited: false; allowed: string[] };

export type HotelScope =
  | { unlimited: true }
  | {
      unlimited: false;
      allowed: {
        tenant: string;
        hotelName: string;
        usrSystemCompanyId: string | null;
        branchId: number | null;
      }[];
    };

export type DeptScope =
  | { unlimited: true }
  | { unlimited: false; allowed: { hotelName: string; deptName: string }[] };

/** Scope of a user being created/edited/deleted. Used by `canManageUser`. */
export interface TargetUserScope {
  tenants?: string[];
  hotels?: { tenant: string; hotelName: string }[];
  departments?: { tenant: string; hotelName: string; deptName: string }[];
}

export class PermissionChecker {
  constructor(private user: UserWithAssignments) {}

  isSuperAdmin(): boolean {
    return this.user.role === 'SuperAdmin';
  }

  canManageRole(targetRole: Role): boolean {
    return ROLE_HIERARCHY[this.user.role] > ROLE_HIERARCHY[targetRole];
  }

  canManageUser(targetRole: Role, targetScope: TargetUserScope): boolean {
    if (this.isSuperAdmin()) return true;

    let roleOk = false;
    if (this.user.role === 'CompanyAdmin')
      roleOk = targetRole === 'HotelAdmin' || targetRole === 'DeptAdmin';
    else if (this.user.role === 'HotelAdmin')
      roleOk = targetRole === 'HotelAdmin' || targetRole === 'DeptAdmin';
    else if (this.user.role === 'DeptAdmin') roleOk = targetRole === 'DeptAdmin';
    if (!roleOk) return false;

    return this.containsTargetScope(targetScope);
  }

  private containsTargetScope(target: TargetUserScope): boolean {
    const tenants = target.tenants ?? [];
    const hotels = target.hotels ?? [];
    const departments = target.departments ?? [];

    if (this.user.role === 'CompanyAdmin') {
      const myTenants = new Set(this.user.tenants.map((t) => t.tenant));
      if (tenants.some((t) => !myTenants.has(t))) return false;
      if (hotels.some((h) => !myTenants.has(h.tenant))) return false;
      if (departments.some((d) => !myTenants.has(d.tenant))) return false;
      return true;
    }

    if (this.user.role === 'HotelAdmin') {
      // HotelAdmin cannot grant tenant-level scope.
      if (tenants.length > 0) return false;
      const myHotels = new Set(this.user.hotels.map((h) => h.hotelName));
      if (hotels.some((h) => !myHotels.has(h.hotelName))) return false;
      if (departments.some((d) => !myHotels.has(d.hotelName))) return false;
      return true;
    }

    if (this.user.role === 'DeptAdmin') {
      if (tenants.length > 0 || hotels.length > 0) return false;
      return departments.every((td) =>
        this.user.departments.some(
          (md) => md.hotelName === td.hotelName && md.deptName === td.deptName,
        ),
      );
    }

    return false;
  }

  /**
   * Tenants the user has any presence in (direct + hotel + dept assignments).
   * Use for display surfaces (dropdowns, filters), not for write-scope decisions.
   */
  getAccessibleTenants(): TenantScope {
    if (this.isSuperAdmin()) return { unlimited: true };
    const fromTenants = this.user.tenants.map((t) => t.tenant);
    const fromHotels = this.user.hotels.map((h) => h.tenant);
    const fromDepts = this.user.departments.map((d) => d.tenant);
    return {
      unlimited: false,
      allowed: [...new Set([...fromTenants, ...fromHotels, ...fromDepts])],
    };
  }

  /**
   * Tenants the user directly manages (only direct `tenants` assignments).
   * Use when deciding who they can administer at tenant level — does NOT include
   * tenants reached only via individual hotel/dept assignments.
   */
  getManagedTenants(): TenantScope {
    if (this.isSuperAdmin()) return { unlimited: true };
    return {
      unlimited: false,
      allowed: [...new Set(this.user.tenants.map((t) => t.tenant))],
    };
  }

  getAccessibleHotels(): HotelScope {
    if (this.isSuperAdmin()) return { unlimited: true };
    return { unlimited: false, allowed: this.user.hotels };
  }

  getAccessibleDepts(): DeptScope {
    if (this.isSuperAdmin()) return { unlimited: true };
    return {
      unlimited: false,
      allowed: this.user.departments.map((d) => ({ hotelName: d.hotelName, deptName: d.deptName })),
    };
  }

  hasScheduleAccess(target: {
    hotel?: string | null;
    tenant?: string | null;
    dept?: string;
  }): boolean {
    if (this.isSuperAdmin()) return true;

    const { hotel, tenant, dept } = target;

    if (!hotel) {
      // No hotel context: allow if user has any active scope assignment
      return (
        this.user.tenants.length > 0 ||
        this.user.hotels.length > 0 ||
        this.user.departments.length > 0
      );
    }

    if (this.user.role === 'CompanyAdmin') {
      // Direct hotel assignment always grants access.
      if (this.user.hotels.some((h) => h.hotelName === hotel)) return true;
      // Tenant-level assignment requires the hotel's tenant to be in scope.
      if (tenant) {
        return this.user.tenants.some((t) => t.tenant === tenant);
      }
      return false;
    }

    if (this.user.role === 'HotelAdmin') {
      return this.user.hotels.some((h) => h.hotelName === hotel);
    }

    if (this.user.role === 'DeptAdmin' && dept) {
      return this.user.departments.some((d) => d.hotelName === hotel && d.deptName === dept);
    }

    return false;
  }
}

export async function getUserPermissions(userId: number): Promise<PermissionChecker | null> {
  const user = await prisma.user.findUnique({
    where: { userId, isActive: true },
    include: {
      tenants: { select: { tenant: true } },
      hotels: {
        select: { tenant: true, hotelName: true, usrSystemCompanyId: true, branchId: true },
      },
      departments: { select: { tenant: true, hotelName: true, deptName: true } },
    },
  });

  if (!user) return null;

  return new PermissionChecker({
    userId: user.userId,
    role: user.role as Role,
    isActive: user.isActive,
    tenants: user.tenants,
    hotels: user.hotels,
    departments: user.departments,
  });
}
