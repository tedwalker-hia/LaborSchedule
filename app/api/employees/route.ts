import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const hotel = searchParams.get('hotel')
    const usrSystemCompanyId = searchParams.get('usrSystemCompanyId')

    if (!hotel || !usrSystemCompanyId) {
      return NextResponse.json(
        { error: 'hotel and usrSystemCompanyId are required' },
        { status: 400 }
      )
    }

    const rows = await prisma.laborSchedule.groupBy({
      by: ['employeeCode', 'firstName', 'lastName'],
      where: {
        hotelName: hotel,
        usrSystemCompanyId,
      },
      orderBy: [
        { lastName: 'asc' },
        { firstName: 'asc' },
      ],
    })

    const employees = rows.map(r => ({
      employeeCode: r.employeeCode,
      firstName: r.firstName,
      lastName: r.lastName,
    }))

    return NextResponse.json(employees)
  } catch (error) {
    console.error('Employees API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
