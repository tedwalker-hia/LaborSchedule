import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { exportScheduleToExcel } from '@/lib/excel-export'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const hotel = searchParams.get('hotel') || ''
    const usrSystemCompanyId = searchParams.get('usrSystemCompanyId') || ''
    const dept = searchParams.get('dept') || ''
    const position = searchParams.get('position') || ''
    const startDateStr = searchParams.get('startDate') || ''
    const endDateStr = searchParams.get('endDate') || ''

    if (!hotel || !usrSystemCompanyId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    const today = new Date()
    const startDate = startDateStr ? new Date(startDateStr + 'T00:00:00') : new Date(today.getTime() - 7 * 86400000)
    const endDate = endDateStr ? new Date(endDateStr + 'T00:00:00') : new Date(today.getTime() + 7 * 86400000)

    // Build date list
    const dates: Date[] = []
    const d = new Date(startDate)
    while (d <= endDate) {
      dates.push(new Date(d))
      d.setDate(d.getDate() + 1)
    }

    // Get employees
    const where: Record<string, unknown> = {
      hotelName: hotel,
      usrSystemCompanyId,
    }
    if (dept) where.deptName = dept
    if (position) where.positionName = position

    const empRows = await prisma.laborSchedule.findMany({
      where,
      distinct: ['employeeCode', 'firstName', 'lastName', 'deptName', 'positionName'],
      select: {
        employeeCode: true,
        firstName: true,
        lastName: true,
        deptName: true,
        positionName: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })

    const employees = empRows.map(e => ({
      code: e.employeeCode,
      firstName: e.firstName || '',
      lastName: e.lastName || '',
      deptName: e.deptName || '',
      positionName: e.positionName || '',
    }))

    // Get schedule data
    const empCodes = employees.map(e => e.code)
    const scheduleRows = empCodes.length > 0 ? await prisma.laborSchedule.findMany({
      where: {
        hotelName: hotel,
        usrSystemCompanyId,
        scheduleDate: { gte: startDate, lte: endDate },
        employeeCode: { in: empCodes },
      },
      select: {
        employeeCode: true,
        scheduleDate: true,
        clockIn: true,
        clockOut: true,
        hours: true,
      },
      orderBy: [{ employeeCode: 'asc' }, { scheduleDate: 'asc' }],
    }) : []

    const schedule: Record<string, Record<string, { clockIn: string; clockOut: string; hours: number }>> = {}
    for (const row of scheduleRows) {
      const code = row.employeeCode
      const dateKey = row.scheduleDate.toISOString().split('T')[0]
      if (!schedule[code]) schedule[code] = {}
      schedule[code][dateKey] = {
        clockIn: row.clockIn || '',
        clockOut: row.clockOut || '',
        hours: row.hours ? Number(row.hours) : 0,
      }
    }

    const buffer = await exportScheduleToExcel({
      hotel,
      employees,
      dates,
      schedule,
      today,
    })

    const safeHotel = hotel.replace(/ /g, '_').replace(/\//g, '_')
    const filename = `Schedule_${safeHotel}_${startDateStr || startDate.toISOString().split('T')[0]}_${endDateStr || endDate.toISOString().split('T')[0]}.xlsx`

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('Export error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
