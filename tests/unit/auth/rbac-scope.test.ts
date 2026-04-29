import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the prisma module the rbac module imports. UserHotel.findFirst /
// findMany are the two surfaces we exercise — everything else stays unset.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    userHotel: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { PermissionChecker, type Role } from '@/lib/auth/rbac';
import { prisma } from '@/lib/prisma';

type UserAssignments = ConstructorParameters<typeof PermissionChecker>[0];

const userHotelFindFirst = vi.mocked(prisma.userHotel.findFirst);
const userHotelFindMany = vi.mocked(prisma.userHotel.findMany);

function makeUser(overrides: Partial<UserAssignments> = {}): UserAssignments {
  return {
    userId: 1,
    role: 'HotelAdmin' as Role,
    isActive: true,
    tenants: [],
    hotels: [],
    departments: [],
    ...overrides,
  };
}

beforeEach(() => {
  userHotelFindFirst.mockReset();
  userHotelFindMany.mockReset();
});

describe('PermissionChecker.deriveScheduleScope', () => {
  it('SuperAdmin → null (unrestricted)', async () => {
    const checker = new PermissionChecker(makeUser({ role: 'SuperAdmin' }));
    const scope = await checker.deriveScheduleScope('CO1');
    expect(scope).toBeNull();
  });

  it('CompanyAdmin with tenant covering company → null', async () => {
    userHotelFindFirst.mockResolvedValueOnce({ id: 1 } as any);
    const checker = new PermissionChecker(
      makeUser({
        role: 'CompanyAdmin',
        tenants: [{ tenant: 'TenA' }],
      }),
    );
    const scope = await checker.deriveScheduleScope('CO1');
    expect(scope).toBeNull();
    expect(userHotelFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          usrSystemCompanyId: 'CO1',
          tenant: { in: ['TenA'] },
        }),
      }),
    );
  });

  it('CompanyAdmin with tenant not covering company → falls back to direct hotels', async () => {
    userHotelFindFirst.mockResolvedValueOnce(null);
    const checker = new PermissionChecker(
      makeUser({
        role: 'CompanyAdmin',
        tenants: [{ tenant: 'TenA' }],
        hotels: [
          { tenant: 'TenA', hotelName: 'Hotel A', usrSystemCompanyId: 'CO1', branchId: 1 },
          { tenant: 'TenA', hotelName: 'Hotel B', usrSystemCompanyId: 'CO2', branchId: 2 },
        ],
      }),
    );
    const scope = await checker.deriveScheduleScope('CO1');
    expect(scope).toEqual([{ hotelName: 'Hotel A' }]);
  });

  it('HotelAdmin → list of hotelName pairs for this company', async () => {
    const checker = new PermissionChecker(
      makeUser({
        role: 'HotelAdmin',
        hotels: [
          { tenant: 'TenA', hotelName: 'Hotel A', usrSystemCompanyId: 'CO1', branchId: 1 },
          { tenant: 'TenA', hotelName: 'Hotel C', usrSystemCompanyId: 'CO1', branchId: 3 },
          { tenant: 'TenA', hotelName: 'Hotel B', usrSystemCompanyId: 'CO2', branchId: 2 },
        ],
      }),
    );
    const scope = await checker.deriveScheduleScope('CO1');
    expect(scope).toEqual([{ hotelName: 'Hotel A' }, { hotelName: 'Hotel C' }]);
  });

  it('HotelAdmin with no hotels under company → []', async () => {
    const checker = new PermissionChecker(
      makeUser({
        role: 'HotelAdmin',
        hotels: [
          { tenant: 'TenA', hotelName: 'Hotel B', usrSystemCompanyId: 'CO2', branchId: 2 },
        ],
      }),
    );
    const scope = await checker.deriveScheduleScope('CO1');
    expect(scope).toEqual([]);
  });

  it('DeptAdmin direct: hotel grant under same company resolves dept pairs', async () => {
    const checker = new PermissionChecker(
      makeUser({
        role: 'DeptAdmin',
        hotels: [
          { tenant: 'TenA', hotelName: 'Hotel A', usrSystemCompanyId: 'CO1', branchId: 1 },
        ],
        departments: [{ tenant: 'TenA', hotelName: 'Hotel A', deptName: 'HK' }],
      }),
    );
    const scope = await checker.deriveScheduleScope('CO1');
    expect(scope).toEqual([{ hotelName: 'Hotel A', deptName: 'HK' }]);
  });

  it('DeptAdmin reverse-lookup: dept-only assignment resolved via UserHotel', async () => {
    userHotelFindMany.mockResolvedValueOnce([{ hotelName: 'Hotel A' }] as any);
    const checker = new PermissionChecker(
      makeUser({
        role: 'DeptAdmin',
        hotels: [], // no direct hotel grant
        departments: [{ tenant: 'TenA', hotelName: 'Hotel A', deptName: 'HK' }],
      }),
    );
    const scope = await checker.deriveScheduleScope('CO1');
    expect(scope).toEqual([{ hotelName: 'Hotel A', deptName: 'HK' }]);
    expect(userHotelFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          usrSystemCompanyId: 'CO1',
          hotelName: { in: ['Hotel A'] },
        }),
      }),
    );
  });

  it('DeptAdmin: dept-hotel not under this company → []', async () => {
    userHotelFindMany.mockResolvedValueOnce([] as any);
    const checker = new PermissionChecker(
      makeUser({
        role: 'DeptAdmin',
        hotels: [],
        departments: [{ tenant: 'TenA', hotelName: 'Hotel B', deptName: 'HK' }],
      }),
    );
    const scope = await checker.deriveScheduleScope('CO1');
    expect(scope).toEqual([]);
  });

  it('CompanyAdmin with no tenants and no direct hotels → []', async () => {
    const checker = new PermissionChecker(
      makeUser({ role: 'CompanyAdmin', tenants: [], hotels: [] }),
    );
    const scope = await checker.deriveScheduleScope('CO1');
    expect(scope).toEqual([]);
  });
});

describe('PermissionChecker.hasCompanyAccess', () => {
  it('SuperAdmin → true', async () => {
    const checker = new PermissionChecker(makeUser({ role: 'SuperAdmin' }));
    expect(await checker.hasCompanyAccess('CO1')).toBe(true);
  });

  it('Direct hotel grant under company → true', async () => {
    const checker = new PermissionChecker(
      makeUser({
        role: 'HotelAdmin',
        hotels: [
          { tenant: 'TenA', hotelName: 'Hotel A', usrSystemCompanyId: 'CO1', branchId: 1 },
        ],
      }),
    );
    expect(await checker.hasCompanyAccess('CO1')).toBe(true);
  });

  it('CompanyAdmin tenant covers company → true via UserHotel', async () => {
    userHotelFindFirst.mockResolvedValueOnce({ id: 1 } as any);
    const checker = new PermissionChecker(
      makeUser({ role: 'CompanyAdmin', tenants: [{ tenant: 'TenA' }] }),
    );
    expect(await checker.hasCompanyAccess('CO1')).toBe(true);
  });

  it('CompanyAdmin tenant does not cover company → false', async () => {
    userHotelFindFirst.mockResolvedValueOnce(null);
    const checker = new PermissionChecker(
      makeUser({ role: 'CompanyAdmin', tenants: [{ tenant: 'TenA' }] }),
    );
    expect(await checker.hasCompanyAccess('CO1')).toBe(false);
  });

  it('No grants → false', async () => {
    const checker = new PermissionChecker(makeUser({ role: 'HotelAdmin' }));
    expect(await checker.hasCompanyAccess('CO1')).toBe(false);
  });
});

describe('PermissionChecker.hasHotelAccess', () => {
  it('SuperAdmin → true', async () => {
    const checker = new PermissionChecker(makeUser({ role: 'SuperAdmin' }));
    expect(await checker.hasHotelAccess({ hotel: 'Hotel A' })).toBe(true);
  });

  it('HotelAdmin matching → true', async () => {
    const checker = new PermissionChecker(
      makeUser({
        role: 'HotelAdmin',
        hotels: [
          { tenant: 'TenA', hotelName: 'Hotel A', usrSystemCompanyId: 'CO1', branchId: 1 },
        ],
      }),
    );
    expect(await checker.hasHotelAccess({ hotel: 'Hotel A' })).toBe(true);
  });

  it('HotelAdmin not matching → false', async () => {
    const checker = new PermissionChecker(
      makeUser({
        role: 'HotelAdmin',
        hotels: [
          { tenant: 'TenA', hotelName: 'Hotel A', usrSystemCompanyId: 'CO1', branchId: 1 },
        ],
      }),
    );
    expect(await checker.hasHotelAccess({ hotel: 'Hotel B' })).toBe(false);
  });

  it('CompanyAdmin tenant grant: only passes when hotel actually under tenant', async () => {
    // Verifies the I-6 fix path — hotel must be in UserHotel under user's
    // tenant to admit; an arbitrary hotel name claim must not pass on tenant
    // grant alone.
    userHotelFindFirst.mockResolvedValueOnce({ id: 1 } as any);
    const checker = new PermissionChecker(
      makeUser({ role: 'CompanyAdmin', tenants: [{ tenant: 'TenA' }] }),
    );
    expect(
      await checker.hasHotelAccess({ hotel: 'Hotel A', usrSystemCompanyId: 'CO1' }),
    ).toBe(true);
    expect(userHotelFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          hotelName: 'Hotel A',
          tenant: { in: ['TenA'] },
          usrSystemCompanyId: 'CO1',
        }),
      }),
    );
  });

  it('CompanyAdmin tenant grant: hotel not under tenant → false', async () => {
    userHotelFindFirst.mockResolvedValueOnce(null);
    const checker = new PermissionChecker(
      makeUser({ role: 'CompanyAdmin', tenants: [{ tenant: 'TenA' }] }),
    );
    expect(
      await checker.hasHotelAccess({ hotel: 'EvilHotel', usrSystemCompanyId: 'CO1' }),
    ).toBe(false);
  });

  it('DeptAdmin matching dept hotel → true', async () => {
    const checker = new PermissionChecker(
      makeUser({
        role: 'DeptAdmin',
        departments: [{ tenant: 'TenA', hotelName: 'Hotel A', deptName: 'HK' }],
      }),
    );
    expect(await checker.hasHotelAccess({ hotel: 'Hotel A' })).toBe(true);
  });
});
