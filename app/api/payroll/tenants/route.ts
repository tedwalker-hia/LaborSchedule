import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const tenants = await prisma.$queryRaw<
      { tenant: string; hotelName: string; usrSystemCompanyId: string; branchId: number }[]
    >(Prisma.sql`
      SELECT DISTINCT
        o.OrganizationName AS tenant,
        o.HotelName AS hotelName,
        p.UsrSystemCompanyID AS usrSystemCompanyId,
        p.BranchID AS branchId
      FROM BI_Payroll p
      INNER JOIN HIA_BIOrganizationName o
        ON p.UsrSystemCompanyID = o.UsrSystemCompanyID
      WHERE p.Hours > 0
    `)

    return NextResponse.json(tenants)
  } catch (error) {
    console.error('Payroll tenants error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
