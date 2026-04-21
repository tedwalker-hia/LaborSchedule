import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { usrSystemCompanyId, records, locked } = await request.json()

    if (!usrSystemCompanyId || !Array.isArray(records) || typeof locked !== 'boolean') {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    let updatedCount = 0

    for (const rec of records) {
      const { employeeCode, date } = rec
      const scheduleDate = new Date(date + 'T00:00:00')

      const result = await prisma.laborSchedule.updateMany({
        where: {
          usrSystemCompanyId,
          employeeCode,
          scheduleDate,
        },
        data: { locked },
      })

      updatedCount += result.count
    }

    return NextResponse.json({ updated: updatedCount })
  } catch (error) {
    console.error('Schedule lock error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
