import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserPermissions, Role } from '@/lib/permissions'
import bcrypt from 'bcryptjs'

type RouteContext = { params: Promise<{ id: string }> }

// ─── GET /api/users/[id] ───────────────────────────────────────────────────
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const targetId = Number(id)
    const currentUserId = Number(req.headers.get('x-user-id'))
    const currentUserRole = req.headers.get('x-user-role') as Role | null

    if (!currentUserId || !currentUserRole) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const perms = await getUserPermissions(currentUserId)
    if (!perms) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { userId: targetId },
      select: {
        userId: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        tenants: { select: { tenant: true } },
        hotels: { select: { tenant: true, hotelName: true, usrSystemCompanyId: true, branchId: true } },
        departments: { select: { tenant: true, hotelName: true, deptName: true } },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Visibility check based on role scope
    if (!perms.isSuperAdmin()) {
      const canSee = await canCurrentUserSeeTarget(perms, currentUserRole!, user)
      if (!canSee) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    return NextResponse.json(user)
  } catch (err) {
    console.error('GET /api/users/[id] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── PUT /api/users/[id] ───────────────────────────────────────────────────
export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const targetId = Number(id)
    const currentUserId = Number(req.headers.get('x-user-id'))

    if (!currentUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const perms = await getUserPermissions(currentUserId)
    if (!perms) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const {
      firstName,
      lastName,
      email,
      password,
      role,
      tenants = [],
      hotels = [],
      departments = [],
    } = body as {
      firstName: string
      lastName: string
      email: string
      password?: string
      role: Role
      tenants: string[]
      hotels: { tenant: string; hotelName: string; usrSystemCompanyId?: string; branchId?: number }[]
      departments: { tenant: string; hotelName: string; deptName: string }[]
    }

    if (!firstName || !lastName || !email || !role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Permission check
    if (!perms.canManageUser(role)) {
      return NextResponse.json({ error: 'Insufficient permissions to manage this role' }, { status: 403 })
    }

    // Check the target user exists
    const existing = await prisma.user.findUnique({ where: { userId: targetId } })
    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Also check permission against the user's current role
    if (!perms.canManageUser(existing.role as Role)) {
      return NextResponse.json({ error: 'Insufficient permissions to manage this user' }, { status: 403 })
    }

    // Check email uniqueness (case-insensitive), excluding the current user
    const emailConflict = await prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        NOT: { userId: targetId },
      },
    })
    if (emailConflict) {
      return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 })
    }

    // Build update data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {
      firstName,
      lastName,
      email,
      role,
      updatedAt: new Date(),
    }

    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 10)
      updateData.mustChangePassword = true
    }

    // Use transaction to update user and reassign all assignments
    const updated = await prisma.$transaction(async (tx) => {
      // Delete existing assignments
      await tx.userTenant.deleteMany({ where: { userId: targetId } })
      await tx.userHotel.deleteMany({ where: { userId: targetId } })
      await tx.userDept.deleteMany({ where: { userId: targetId } })

      // Update user and create new assignments
      return tx.user.update({
        where: { userId: targetId },
        data: {
          ...updateData,
          tenants: {
            create: tenants.map((t: string) => ({ tenant: t })),
          },
          hotels: {
            create: hotels.map((h) => ({
              tenant: h.tenant,
              hotelName: h.hotelName,
              usrSystemCompanyId: h.usrSystemCompanyId ?? null,
              branchId: h.branchId ?? null,
            })),
          },
          departments: {
            create: departments.map((d) => ({
              tenant: d.tenant,
              hotelName: d.hotelName,
              deptName: d.deptName,
            })),
          },
        },
        select: {
          userId: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          isActive: true,
          tenants: { select: { tenant: true } },
          hotels: { select: { tenant: true, hotelName: true } },
          departments: { select: { tenant: true, hotelName: true, deptName: true } },
        },
      })
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('PUT /api/users/[id] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── DELETE /api/users/[id] (soft delete) ───────────────────────────────────
export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const targetId = Number(id)
    const currentUserId = Number(req.headers.get('x-user-id'))

    if (!currentUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Cannot delete yourself
    if (currentUserId === targetId) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
    }

    const perms = await getUserPermissions(currentUserId)
    if (!perms) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const target = await prisma.user.findUnique({ where: { userId: targetId } })
    if (!target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Permission check
    if (!perms.canManageUser(target.role as Role)) {
      return NextResponse.json({ error: 'Insufficient permissions to delete this user' }, { status: 403 })
    }

    await prisma.user.update({
      where: { userId: targetId },
      data: { isActive: false, updatedAt: new Date() },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('DELETE /api/users/[id] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── Helper: can the current user see the target user? ──────────────────────
function canCurrentUserSeeTarget(
  perms: Awaited<ReturnType<typeof getUserPermissions>> & object,
  currentUserRole: Role,
  target: {
    tenants: { tenant: string }[]
    hotels: { tenant: string; hotelName: string }[]
    departments: { tenant: string; hotelName: string; deptName: string }[]
  },
): boolean {
  if (currentUserRole === 'CompanyAdmin') {
    const accessibleTenants = perms.getAccessibleTenants()
    const targetTenants = [
      ...target.tenants.map(t => t.tenant),
      ...target.hotels.map(h => h.tenant),
      ...target.departments.map(d => d.tenant),
    ]
    return targetTenants.some(t => accessibleTenants.includes(t))
  }

  if (currentUserRole === 'HotelAdmin') {
    const accessibleHotels = perms.getAccessibleHotels().map(h => h.hotelName)
    const targetHotels = [
      ...target.hotels.map(h => h.hotelName),
      ...target.departments.map(d => d.hotelName),
    ]
    return targetHotels.some(h => accessibleHotels.includes(h))
  }

  if (currentUserRole === 'DeptAdmin') {
    const accessibleDepts = perms.getAccessibleDepts()
    return target.departments.some(d =>
      accessibleDepts.some(ad => ad.hotelName === d.hotelName && ad.deptName === d.deptName)
    )
  }

  return false
}
