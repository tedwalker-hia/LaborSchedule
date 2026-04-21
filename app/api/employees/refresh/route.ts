import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const {
      usrSystemCompanyId,
      hotelName,
      branchId,
      tenant,
      newEmployees,
      removedCodes,
    } = await request.json()

    if (!usrSystemCompanyId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    let added = 0
    let removed = 0

    // Add new employees with placeholder records (today's date, no clock times)
    if (Array.isArray(newEmployees)) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      for (const emp of newEmployees) {
        await prisma.laborSchedule.create({
          data: {
            usrSystemCompanyId,
            branchId,
            hotelName,
            employeeCode: emp.code,
            firstName: emp.firstName,
            lastName: emp.lastName,
            scheduleDate: today,
            deptName: emp.deptName || null,
            positionName: emp.positionName || null,
            tenant,
          },
        })
        added++
      }
    }

    // Remove employees (delete all their records)
    if (Array.isArray(removedCodes) && removedCodes.length > 0) {
      const result = await prisma.laborSchedule.deleteMany({
        where: {
          usrSystemCompanyId,
          employeeCode: { in: removedCodes },
        },
      })
      removed = result.count
    }

    return NextResponse.json({ added, removed })
  } catch (error) {
    console.error('Refresh error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
