import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calcHours } from '@/lib/schedule-utils'

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { usrSystemCompanyId, hotel, branchId, tenant, changes } = await request.json()

    if (!usrSystemCompanyId || !Array.isArray(changes)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    let inserted = 0
    let updated = 0
    let skipped = 0

    for (const change of changes) {
      const { employeeCode, firstName, lastName, date, clockIn, clockOut } = change

      const scheduleDate = new Date(date + 'T00:00:00')
      const hours = clockIn && clockOut ? calcHours(clockIn, clockOut) : null
      const isClearing = !clockIn && !clockOut

      // Find existing record
      const existing = await prisma.laborSchedule.findFirst({
        where: {
          usrSystemCompanyId,
          employeeCode,
          scheduleDate,
        },
      })

      if (existing) {
        // Check if values are the same
        const sameClockIn = (existing.clockIn ?? null) === (clockIn || null)
        const sameClockOut = (existing.clockOut ?? null) === (clockOut || null)

        if (sameClockIn && sameClockOut) {
          skipped++
          continue
        }

        // Delete old and insert new
        await prisma.laborSchedule.delete({ where: { id: existing.id } })

        await prisma.laborSchedule.create({
          data: {
            usrSystemCompanyId,
            branchId: branchId ?? existing.branchId,
            hotelName: hotel ?? existing.hotelName,
            employeeCode,
            firstName: firstName ?? existing.firstName,
            lastName: lastName ?? existing.lastName,
            scheduleDate,
            clockIn: isClearing ? null : clockIn,
            clockOut: isClearing ? null : clockOut,
            hours: isClearing ? null : hours,
            tenant: tenant ?? existing.tenant,
            deptName: existing.deptName,
            multiDept: existing.multiDept,
            positionName: existing.positionName,
            locked: existing.locked,
          },
        })
        updated++
      } else {
        // Insert new record
        await prisma.laborSchedule.create({
          data: {
            usrSystemCompanyId,
            branchId,
            hotelName: hotel,
            employeeCode,
            firstName,
            lastName,
            scheduleDate,
            clockIn: isClearing ? null : clockIn,
            clockOut: isClearing ? null : clockOut,
            hours: isClearing ? null : hours,
            tenant,
          },
        })
        inserted++
      }
    }

    return NextResponse.json({ inserted, updated, skipped })
  } catch (error) {
    console.error('Schedule save error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
