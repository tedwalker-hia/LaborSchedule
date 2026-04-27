import { describe, it, expect } from 'vitest';
import { PermissionChecker, type Role } from '@/lib/auth/rbac';

// ─── Fixture builder ──────────────────────────────────────────────────────────
// PermissionChecker constructor is public but takes an unexported interface.
// Cast through unknown to call with fixture data.

const PC = PermissionChecker as unknown as new (user: {
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
}) => PermissionChecker;

function make(
  role: Role,
  opts: {
    tenants?: string[];
    hotels?: { tenant: string; hotelName: string }[];
    departments?: { tenant: string; hotelName: string; deptName: string }[];
  } = {},
): PermissionChecker {
  return new PC({
    userId: 1,
    role,
    isActive: true,
    tenants: (opts.tenants ?? []).map((t) => ({ tenant: t })),
    hotels: (opts.hotels ?? []).map((h) => ({
      tenant: h.tenant,
      hotelName: h.hotelName,
      usrSystemCompanyId: null,
      branchId: null,
    })),
    departments: opts.departments ?? [],
  });
}

const HOTEL_A = 'Hotel Alpha';
const HOTEL_B = 'Hotel Beta';
const DEPT_X = 'Front Desk';
const DEPT_Y = 'Housekeeping';
const TENANT_1 = 'tenant-1';

// ─── hasScheduleAccess matrix ─────────────────────────────────────────────────

describe('PermissionChecker.hasScheduleAccess', () => {
  describe('SuperAdmin', () => {
    const sa = make('SuperAdmin');

    it.each([
      ['null hotel', null, undefined, true],
      ['specific hotel', HOTEL_A, undefined, true],
      ['hotel + dept', HOTEL_A, DEPT_X, true],
      ['unassigned hotel', HOTEL_B, undefined, true],
    ] as [string, string | null, string | undefined, boolean][])(
      '%s',
      (_label, hotel, dept, expected) => {
        expect(sa.hasScheduleAccess({ hotel, dept })).toBe(expected);
      },
    );
  });

  describe('CompanyAdmin with tenant + hotel assignment', () => {
    const ca = make('CompanyAdmin', {
      tenants: [TENANT_1],
      hotels: [{ tenant: TENANT_1, hotelName: HOTEL_A }],
    });

    it('null hotel → allow (any active scope)', () => {
      expect(ca.hasScheduleAccess({ hotel: null })).toBe(true);
    });

    it('directly assigned hotel → allow even without tenant', () => {
      expect(ca.hasScheduleAccess({ hotel: HOTEL_A })).toBe(true);
    });

    it('non-assigned hotel under in-scope tenant → allow', () => {
      expect(ca.hasScheduleAccess({ hotel: HOTEL_B, tenant: TENANT_1 })).toBe(true);
    });

    it('non-assigned hotel under out-of-scope tenant → deny', () => {
      expect(ca.hasScheduleAccess({ hotel: HOTEL_B, tenant: 'tenant-other' })).toBe(false);
    });

    it('non-assigned hotel without tenant arg → deny (no tenant gate)', () => {
      expect(ca.hasScheduleAccess({ hotel: HOTEL_B })).toBe(false);
    });
  });

  it('CompanyAdmin with no assignments + null hotel → deny', () => {
    expect(make('CompanyAdmin').hasScheduleAccess({ hotel: null })).toBe(false);
  });

  describe('HotelAdmin with Hotel Alpha assignment', () => {
    const ha = make('HotelAdmin', {
      hotels: [{ tenant: TENANT_1, hotelName: HOTEL_A }],
    });

    it.each([
      ['null hotel', null, undefined, true],
      ['assigned hotel', HOTEL_A, undefined, true],
      ['unassigned hotel', HOTEL_B, undefined, false],
    ] as [string, string | null, string | undefined, boolean][])(
      '%s',
      (_label, hotel, dept, expected) => {
        expect(ha.hasScheduleAccess({ hotel, dept })).toBe(expected);
      },
    );
  });

  it('HotelAdmin with no assignments + null hotel → deny', () => {
    expect(make('HotelAdmin').hasScheduleAccess({ hotel: null })).toBe(false);
  });

  describe('DeptAdmin with Hotel Alpha / Front Desk assignment', () => {
    const da = make('DeptAdmin', {
      departments: [{ tenant: TENANT_1, hotelName: HOTEL_A, deptName: DEPT_X }],
    });

    it.each([
      ['null hotel', null, undefined, true],
      ['correct hotel + correct dept', HOTEL_A, DEPT_X, true],
      ['correct hotel + wrong dept', HOTEL_A, DEPT_Y, false],
      ['wrong hotel + correct dept', HOTEL_B, DEPT_X, false],
      ['correct hotel, no dept arg', HOTEL_A, undefined, false],
    ] as [string, string | null, string | undefined, boolean][])(
      '%s',
      (_label, hotel, dept, expected) => {
        expect(da.hasScheduleAccess({ hotel, dept })).toBe(expected);
      },
    );
  });

  it('DeptAdmin with no assignments + null hotel → deny', () => {
    expect(make('DeptAdmin').hasScheduleAccess({ hotel: null })).toBe(false);
  });
});

// ─── Scope shape: explicit unlimited flag ─────────────────────────────────────

describe('Scope shape — unlimited flag', () => {
  it('SuperAdmin scopes return unlimited:true', () => {
    const sa = make('SuperAdmin');
    expect(sa.getAccessibleTenants()).toEqual({ unlimited: true });
    expect(sa.getAccessibleHotels()).toEqual({ unlimited: true });
    expect(sa.getAccessibleDepts()).toEqual({ unlimited: true });
  });

  it('non-SuperAdmin scopes always return unlimited:false', () => {
    for (const role of ['CompanyAdmin', 'HotelAdmin', 'DeptAdmin'] as const) {
      const checker = make(role);
      expect(checker.getAccessibleTenants().unlimited).toBe(false);
      expect(checker.getAccessibleHotels().unlimited).toBe(false);
      expect(checker.getAccessibleDepts().unlimited).toBe(false);
    }
  });

  it('CompanyAdmin getAccessibleTenants deduplicates tenant sources', () => {
    const ca = make('CompanyAdmin', {
      tenants: [TENANT_1],
      hotels: [{ tenant: 'tenant-2', hotelName: HOTEL_A }],
      departments: [{ tenant: 'tenant-3', hotelName: HOTEL_A, deptName: DEPT_X }],
    });
    const result = ca.getAccessibleTenants();
    expect(result.unlimited).toBe(false);
    if (!result.unlimited) {
      expect(result.allowed).toContain(TENANT_1);
      expect(result.allowed).toContain('tenant-2');
      expect(result.allowed).toContain('tenant-3');
    }
  });

  it('HotelAdmin getAccessibleHotels contains assigned hotel', () => {
    const ha = make('HotelAdmin', {
      hotels: [{ tenant: TENANT_1, hotelName: HOTEL_A }],
    });
    const result = ha.getAccessibleHotels();
    expect(result.unlimited).toBe(false);
    if (!result.unlimited) {
      expect(result.allowed.map((h) => h.hotelName)).toContain(HOTEL_A);
    }
  });

  it('DeptAdmin getAccessibleDepts contains assigned dept', () => {
    const da = make('DeptAdmin', {
      departments: [{ tenant: TENANT_1, hotelName: HOTEL_A, deptName: DEPT_X }],
    });
    const result = da.getAccessibleDepts();
    expect(result.unlimited).toBe(false);
    if (!result.unlimited) {
      expect(result.allowed).toContainEqual({ hotelName: HOTEL_A, deptName: DEPT_X });
    }
  });
});

// ─── canManageUser matrix ─────────────────────────────────────────────────────

describe('PermissionChecker.canManageUser — role gate', () => {
  // SuperAdmin short-circuits the scope check, so empty scope is fine.
  it.each([
    ['SuperAdmin can manage any role', 'SuperAdmin', 'DeptAdmin', true],
    ['SuperAdmin can manage SuperAdmin', 'SuperAdmin', 'SuperAdmin', true],
    ['CompanyAdmin cannot manage CompanyAdmin', 'CompanyAdmin', 'CompanyAdmin', false],
    ['HotelAdmin cannot manage CompanyAdmin', 'HotelAdmin', 'CompanyAdmin', false],
    ['DeptAdmin cannot manage HotelAdmin', 'DeptAdmin', 'HotelAdmin', false],
  ] as [string, Role, Role, boolean][])('%s', (_label, actorRole, targetRole, expected) => {
    const actor = make(actorRole, {
      tenants: [TENANT_1],
      hotels: [{ tenant: TENANT_1, hotelName: HOTEL_A }],
      departments: [{ tenant: TENANT_1, hotelName: HOTEL_A, deptName: DEPT_X }],
    });
    expect(actor.canManageUser(targetRole, {})).toBe(expected);
  });
});

describe('PermissionChecker.canManageUser — scope gate', () => {
  it('CompanyAdmin allows target hotel within managed tenant', () => {
    const ca = make('CompanyAdmin', { tenants: [TENANT_1] });
    expect(
      ca.canManageUser('HotelAdmin', {
        hotels: [{ tenant: TENANT_1, hotelName: HOTEL_A }],
      }),
    ).toBe(true);
  });

  it('CompanyAdmin rejects target hotel in out-of-scope tenant', () => {
    const ca = make('CompanyAdmin', { tenants: [TENANT_1] });
    expect(
      ca.canManageUser('HotelAdmin', {
        hotels: [{ tenant: 'tenant-other', hotelName: HOTEL_A }],
      }),
    ).toBe(false);
  });

  it('CompanyAdmin rejects target tenant assignment outside own tenants', () => {
    const ca = make('CompanyAdmin', { tenants: [TENANT_1] });
    expect(ca.canManageUser('HotelAdmin', { tenants: ['tenant-other'] })).toBe(false);
  });

  it('HotelAdmin allows target hotel within own hotels', () => {
    const ha = make('HotelAdmin', { hotels: [{ tenant: TENANT_1, hotelName: HOTEL_A }] });
    expect(
      ha.canManageUser('HotelAdmin', {
        hotels: [{ tenant: TENANT_1, hotelName: HOTEL_A }],
      }),
    ).toBe(true);
  });

  it('HotelAdmin rejects target hotel outside own hotels', () => {
    const ha = make('HotelAdmin', { hotels: [{ tenant: TENANT_1, hotelName: HOTEL_A }] });
    expect(
      ha.canManageUser('HotelAdmin', {
        hotels: [{ tenant: TENANT_1, hotelName: HOTEL_B }],
      }),
    ).toBe(false);
  });

  it('HotelAdmin cannot grant tenant-level scope', () => {
    const ha = make('HotelAdmin', { hotels: [{ tenant: TENANT_1, hotelName: HOTEL_A }] });
    expect(ha.canManageUser('HotelAdmin', { tenants: [TENANT_1] })).toBe(false);
  });

  it('HotelAdmin allows DeptAdmin target whose dept hotel is in own scope', () => {
    const ha = make('HotelAdmin', { hotels: [{ tenant: TENANT_1, hotelName: HOTEL_A }] });
    expect(
      ha.canManageUser('DeptAdmin', {
        departments: [{ tenant: TENANT_1, hotelName: HOTEL_A, deptName: DEPT_X }],
      }),
    ).toBe(true);
  });

  it('HotelAdmin rejects DeptAdmin target whose dept hotel is out of scope', () => {
    const ha = make('HotelAdmin', { hotels: [{ tenant: TENANT_1, hotelName: HOTEL_A }] });
    expect(
      ha.canManageUser('DeptAdmin', {
        departments: [{ tenant: TENANT_1, hotelName: HOTEL_B, deptName: DEPT_X }],
      }),
    ).toBe(false);
  });

  it('DeptAdmin allows DeptAdmin target with subset of own depts', () => {
    const da = make('DeptAdmin', {
      departments: [{ tenant: TENANT_1, hotelName: HOTEL_A, deptName: DEPT_X }],
    });
    expect(
      da.canManageUser('DeptAdmin', {
        departments: [{ tenant: TENANT_1, hotelName: HOTEL_A, deptName: DEPT_X }],
      }),
    ).toBe(true);
  });

  it('DeptAdmin rejects DeptAdmin target outside own depts', () => {
    const da = make('DeptAdmin', {
      departments: [{ tenant: TENANT_1, hotelName: HOTEL_A, deptName: DEPT_X }],
    });
    expect(
      da.canManageUser('DeptAdmin', {
        departments: [{ tenant: TENANT_1, hotelName: HOTEL_A, deptName: DEPT_Y }],
      }),
    ).toBe(false);
  });
});

describe('PermissionChecker.getManagedTenants', () => {
  it('SuperAdmin → unlimited', () => {
    expect(make('SuperAdmin').getManagedTenants()).toEqual({ unlimited: true });
  });

  it('CompanyAdmin returns only direct tenant assignments (no union)', () => {
    const ca = make('CompanyAdmin', {
      tenants: [TENANT_1],
      hotels: [{ tenant: 'tenant-2', hotelName: HOTEL_A }],
      departments: [{ tenant: 'tenant-3', hotelName: HOTEL_A, deptName: DEPT_X }],
    });
    const result = ca.getManagedTenants();
    expect(result.unlimited).toBe(false);
    if (!result.unlimited) {
      expect(result.allowed).toEqual([TENANT_1]);
    }
  });
});
