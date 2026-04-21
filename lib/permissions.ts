import { prisma } from '@/lib/prisma'

export type Role = 'SuperAdmin' | 'CompanyAdmin' | 'HotelAdmin' | 'DeptAdmin'

const ROLE_HIERARCHY: Record<Role, number> = {
  SuperAdmin: 4,
  CompanyAdmin: 3,
  HotelAdmin: 2,
  DeptAdmin: 1,
}

interface UserWithAssignments {
  userId: number
  role: Role
  isActive: boolean
  tenants: { tenant: string }[]
  hotels: { tenant: string; hotelName: string; usrSystemCompanyId: string | null; branchId: number | null }[]
  departments: { tenant: string; hotelName: string; deptName: string }[]
}

export class PermissionChecker {
  constructor(private user: UserWithAssignments) {}

  isSuperAdmin(): boolean {
    return this.user.role === 'SuperAdmin'
  }

  canManageRole(targetRole: Role): boolean {
    return ROLE_HIERARCHY[this.user.role] > ROLE_HIERARCHY[targetRole]
  }

  canManageUser(targetRole: Role): boolean {
    // SuperAdmin can manage anyone
    if (this.isSuperAdmin()) return true
    // CompanyAdmin can create HotelAdmin, DeptAdmin
    if (this.user.role === 'CompanyAdmin') return targetRole === 'HotelAdmin' || targetRole === 'DeptAdmin'
    // HotelAdmin can create HotelAdmin, DeptAdmin
    if (this.user.role === 'HotelAdmin') return targetRole === 'HotelAdmin' || targetRole === 'DeptAdmin'
    // DeptAdmin can create DeptAdmin
    if (this.user.role === 'DeptAdmin') return targetRole === 'DeptAdmin'
    return false
  }

  getAccessibleTenants(): string[] {
    if (this.isSuperAdmin()) return [] // empty means "all" for SuperAdmin
    const fromTenants = this.user.tenants.map(t => t.tenant)
    const fromHotels = this.user.hotels.map(h => h.tenant)
    const fromDepts = this.user.departments.map(d => d.tenant)
    return [...new Set([...fromTenants, ...fromHotels, ...fromDepts])]
  }

  getAccessibleHotels(): { hotelName: string; tenant: string; usrSystemCompanyId: string | null; branchId: number | null }[] {
    if (this.isSuperAdmin()) return []
    return this.user.hotels
  }

  getAccessibleDepts(): { hotelName: string; deptName: string }[] {
    if (this.isSuperAdmin()) return []
    return this.user.departments.map(d => ({ hotelName: d.hotelName, deptName: d.deptName }))
  }

  hasScheduleAccess(hotel: string, dept?: string): boolean {
    if (this.isSuperAdmin()) return true

    if (this.user.role === 'CompanyAdmin') {
      const tenants = this.user.tenants.map(t => t.tenant)
      const hotels = this.user.hotels.map(h => h.hotelName)
      return hotels.includes(hotel) || tenants.length > 0
    }

    if (this.user.role === 'HotelAdmin') {
      return this.user.hotels.some(h => h.hotelName === hotel)
    }

    if (this.user.role === 'DeptAdmin' && dept) {
      return this.user.departments.some(d => d.hotelName === hotel && d.deptName === dept)
    }

    return false
  }
}

export async function getUserPermissions(userId: number): Promise<PermissionChecker | null> {
  const user = await prisma.user.findUnique({
    where: { userId, isActive: true },
    include: {
      tenants: { select: { tenant: true } },
      hotels: { select: { tenant: true, hotelName: true, usrSystemCompanyId: true, branchId: true } },
      departments: { select: { tenant: true, hotelName: true, deptName: true } },
    },
  })

  if (!user) return null

  return new PermissionChecker({
    userId: user.userId,
    role: user.role as Role,
    isActive: user.isActive,
    tenants: user.tenants,
    hotels: user.hotels,
    departments: user.departments,
  })
}
