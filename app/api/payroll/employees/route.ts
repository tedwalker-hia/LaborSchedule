import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const usrSystemCompanyId = searchParams.get('usrSystemCompanyId')

    if (!usrSystemCompanyId) {
      return NextResponse.json({ error: 'Missing usrSystemCompanyId' }, { status: 400 })
    }

    const employees = await prisma.$queryRaw<
      { employeeCode: string; firstName: string; lastName: string; deptName: string; positionName: string }[]
    >(Prisma.sql`
      SELECT DISTINCT
        EmployeeCode AS employeeCode,
        FirstName AS firstName,
        LastName AS lastName,
        DeptName AS deptName,
        PositionName AS positionName
      FROM BI_Payroll
      WHERE UsrSystemCompanyID = ${usrSystemCompanyId}
        AND Hours > 0
        AND [Date] >= DATEADD(day, -14, GETDATE())
    `)

    return NextResponse.json(employees)
  } catch (error) {
    console.error('Payroll employees error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
