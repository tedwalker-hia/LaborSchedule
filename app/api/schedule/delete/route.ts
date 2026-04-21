import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { usrSystemCompanyId, employeeCodes, startDate, endDate } = await request.json()

    if (!usrSystemCompanyId || !Array.isArray(employeeCodes) || !startDate || !endDate) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const start = new Date(startDate + 'T00:00:00')
    const end = new Date(endDate + 'T00:00:00')

    const result = await prisma.laborSchedule.deleteMany({
      where: {
        usrSystemCompanyId,
        employeeCode: { in: employeeCodes },
        scheduleDate: { gte: start, lte: end },
      },
    })

    return NextResponse.json({ deleted: result.count })
  } catch (error) {
    console.error('Schedule delete error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
