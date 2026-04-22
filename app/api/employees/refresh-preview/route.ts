import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { usrSystemCompanyId, hotelName } = await request.json();

    if (!usrSystemCompanyId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get employees active in payroll in last 14 days
    const payrollEmployees = await prisma.$queryRaw<
      {
        EmployeeCode: string;
        FirstName: string;
        LastName: string;
        DeptName: string;
        PositionName: string;
      }[]
    >(Prisma.sql`
      SELECT DISTINCT
        EmployeeCode,
        FirstName,
        LastName,
        DeptName,
        PositionName
      FROM BI_Payroll
      WHERE UsrSystemCompanyID = ${usrSystemCompanyId}
        AND Hours > 0
        AND [Date] >= DATEADD(day, -14, GETDATE())
    `);

    // Get current employees in schedule table
    const currentEmployees = await prisma.laborSchedule.findMany({
      where: { usrSystemCompanyId },
      distinct: ['employeeCode'],
      select: {
        employeeCode: true,
        firstName: true,
        lastName: true,
        deptName: true,
        positionName: true,
      },
    });

    const currentCodes = new Set(currentEmployees.map((e) => e.employeeCode));
    const payrollCodes = new Set(payrollEmployees.map((e) => e.EmployeeCode));

    // New employees: in payroll but not in schedule
    const newEmployees = payrollEmployees
      .filter((e) => !currentCodes.has(e.EmployeeCode))
      .map((e) => ({
        code: e.EmployeeCode,
        firstName: e.FirstName,
        lastName: e.LastName,
        deptName: e.DeptName,
        positionName: e.PositionName,
      }));

    // Removed employees: in schedule but not in payroll
    const removedEmployees = currentEmployees
      .filter((e) => !payrollCodes.has(e.employeeCode))
      .map((e) => ({
        code: e.employeeCode,
        firstName: e.firstName,
        lastName: e.lastName,
        deptName: e.deptName,
        positionName: e.positionName,
      }));

    return NextResponse.json({ newEmployees, removedEmployees });
  } catch (error) {
    console.error('Refresh preview error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
