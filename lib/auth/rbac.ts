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

/**
 * Result of resolving a user's schedule-mutation scope under one
 * `usrSystemCompanyId`:
 *
 * - `null`: unrestricted (SuperAdmin, or CompanyAdmin whose tenant covers the
 *   company). The route imposes no extra filter.
 * - `[]`: no access. The route should reject with 403.
 * - non-empty array: rows must match one of these `(hotelName, deptName?)`
 *   pairs. `deptName` absent means any dept under that hotel.
 */
export type ScheduleScope = Array<{ hotelName: string; deptName?: string }> | null;

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

  /**
   * Whether the user may act on records carrying this `usrSystemCompanyId`.
   * Used by mutating routes (delete/clear/lock/check-locked, employee update)
   * whose payloads identify rows by company id rather than hotel name. Coarser
   * than `hasHotelAccess` — within-company cross-hotel access is not blocked
   * here; routes that need that should also check `hasHotelAccess`.
   */
  async hasCompanyAccess(usrSystemCompanyId: string): Promise<boolean> {
    if (this.isSuperAdmin()) return true;

    if (this.user.hotels.some((h) => h.usrSystemCompanyId === usrSystemCompanyId)) {
      return true;
    }

    if (this.user.role === 'CompanyAdmin' && this.user.tenants.length > 0) {
      const tenants = this.user.tenants.map((t) => t.tenant);
      const match = await prisma.userHotel.findFirst({
        where: { usrSystemCompanyId, tenant: { in: tenants } },
        select: { id: true },
      });
      return match !== null;
    }

    return false;
  }

  /**
   * Whether the user may read/act under this hotel. CompanyAdmin tenant scope
   * is resolved via UserHotel, so a CompanyAdmin without a direct hotel grant
   * is admitted iff some user's hotel record under one of their tenants
   * matches.
   */
  async hasHotelAccess(target: {
    hotel: string;
    usrSystemCompanyId?: string | null;
  }): Promise<boolean> {
    if (this.isSuperAdmin()) return true;

    if (this.user.role === 'HotelAdmin') {
      return this.user.hotels.some((h) => h.hotelName === target.hotel);
    }

    if (this.user.role === 'DeptAdmin') {
      return this.user.departments.some((d) => d.hotelName === target.hotel);
    }

    if (this.user.role === 'CompanyAdmin') {
      if (this.user.hotels.some((h) => h.hotelName === target.hotel)) return true;
      if (this.user.tenants.length === 0) return false;
      const tenants = this.user.tenants.map((t) => t.tenant);
      const match = await prisma.userHotel.findFirst({
        where: {
          hotelName: target.hotel,
          tenant: { in: tenants },
          ...(target.usrSystemCompanyId
            ? { usrSystemCompanyId: target.usrSystemCompanyId }
            : {}),
        },
        select: { id: true },
      });
      return match !== null;
    }

    return false;
  }

  /**
   * Resolves the (hotel, dept) pairs the user may mutate under this company.
   * Returns null for unrestricted, [] for forbidden, or a list of allowed
   * pairs that the service should AND-into its where clause as an OR over the
   * pairs.
   */
  async deriveScheduleScope(usrSystemCompanyId: string): Promise<ScheduleScope> {
    if (this.isSuperAdmin()) return null;

    if (this.user.role === 'CompanyAdmin') {
      // Tenant-level grant covering this company: unrestricted within company.
      if (this.user.tenants.length > 0) {
        const tenants = this.user.tenants.map((t) => t.tenant);
        const tenantMatch = await prisma.userHotel.findFirst({
          where: { usrSystemCompanyId, tenant: { in: tenants } },
          select: { id: true },
        });
        if (tenantMatch) return null;
      }
      return this.user.hotels
        .filter((h) => h.usrSystemCompanyId === usrSystemCompanyId)
        .map((h) => ({ hotelName: h.hotelName }));
    }

    if (this.user.role === 'HotelAdmin') {
      return this.user.hotels
        .filter((h) => h.usrSystemCompanyId === usrSystemCompanyId)
        .map((h) => ({ hotelName: h.hotelName }));
    }

    if (this.user.role === 'DeptAdmin') {
      // Department assignments don't carry usrSystemCompanyId. Resolve which
      // of the user's dept-hotels actually belong to this company by
      // intersecting with their hotel-level grants and (if needed) a
      // UserHotel lookup.
      const directCompanyHotels = new Set(
        this.user.hotels
          .filter((h) => h.usrSystemCompanyId === usrSystemCompanyId)
          .map((h) => h.hotelName),
      );
      const allDeptHotels = new Set(this.user.departments.map((d) => d.hotelName));
      const allowed = new Set<string>();
      for (const h of allDeptHotels) {
        if (directCompanyHotels.has(h)) allowed.add(h);
      }
      const unresolved = [...allDeptHotels].filter((h) => !directCompanyHotels.has(h));
      if (unresolved.length > 0) {
        const found = await prisma.userHotel.findMany({
          where: { usrSystemCompanyId, hotelName: { in: unresolved } },
          select: { hotelName: true },
          distinct: ['hotelName'],
        });
        for (const f of found) allowed.add(f.hotelName);
      }
      return this.user.departments
        .filter((d) => allowed.has(d.hotelName))
        .map((d) => ({ hotelName: d.hotelName, deptName: d.deptName }));
    }

    return [];
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
