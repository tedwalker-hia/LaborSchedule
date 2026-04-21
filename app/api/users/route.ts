import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserPermissions, Role } from '@/lib/permissions'
import bcrypt from 'bcryptjs'

// ─── GET /api/users ─────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const currentUserId = Number(req.headers.get('x-user-id'))
    const currentUserRole = req.headers.get('x-user-role') as Role | null

    if (!currentUserId || !currentUserRole) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const perms = await getUserPermissions(currentUserId)
    if (!perms) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Build where clause based on role scope
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let where: any = { isActive: true }

    if (perms.isSuperAdmin()) {
      // SuperAdmin sees all active users — no extra filter
    } else if (currentUserRole === 'CompanyAdmin') {
      const tenants = perms.getAccessibleTenants()
      where = {
        isActive: true,
        OR: [
          { tenants: { some: { tenant: { in: tenants } } } },
          { hotels: { some: { tenant: { in: tenants } } } },
          { departments: { some: { tenant: { in: tenants } } } },
        ],
      }
    } else if (currentUserRole === 'HotelAdmin') {
      const hotels = perms.getAccessibleHotels()
      const hotelNames = hotels.map(h => h.hotelName)
      where = {
        isActive: true,
        OR: [
          { hotels: { some: { hotelName: { in: hotelNames } } } },
          { departments: { some: { hotelName: { in: hotelNames } } } },
        ],
      }
    } else if (currentUserRole === 'DeptAdmin') {
      const depts = perms.getAccessibleDepts()
      where = {
        isActive: true,
        departments: {
          some: {
            OR: depts.map(d => ({ hotelName: d.hotelName, deptName: d.deptName })),
          },
        },
      }
    }

    const users = await prisma.user.findMany({
      where,
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
      orderBy: { lastName: 'asc' },
    })

    return NextResponse.json(users)
  } catch (err) {
    console.error('GET /api/users error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── POST /api/users ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
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
      password: string
      role: Role
      tenants: string[]
      hotels: { tenant: string; hotelName: string; usrSystemCompanyId?: string; branchId?: number }[]
      departments: { tenant: string; hotelName: string; deptName: string }[]
    }

    // Validate required fields
    if (!firstName || !lastName || !email || !password || !role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Permission check
    if (!perms.canManageUser(role)) {
      return NextResponse.json({ error: 'Insufficient permissions to create this role' }, { status: 403 })
    }

    // Check email uniqueness (case-insensitive)
    const existing = await prisma.user.findFirst({
      where: { email: email.toLowerCase() },
    })
    if (existing) {
      return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 })
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10)

    // Create user and assignments
    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        role,
        passwordHash,
        mustChangePassword: true,
        isActive: true,
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

    return NextResponse.json(user, { status: 201 })
  } catch (err) {
    console.error('POST /api/users error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
