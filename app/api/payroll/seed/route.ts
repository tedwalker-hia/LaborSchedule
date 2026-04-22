import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { usrSystemCompanyId, branchId, hotelName, tenant, employees } = await request.json();

    if (!usrSystemCompanyId || !Array.isArray(employees)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let seeded = 0;
    let skipped = 0;

    for (const emp of employees) {
      // Check if employee already exists in schedule table
      const existing = await prisma.laborSchedule.findFirst({
        where: {
          usrSystemCompanyId,
          employeeCode: emp.code,
        },
      });

      if (existing) {
        skipped++;
        continue;
      }

      await prisma.laborSchedule.create({
        data: {
          usrSystemCompanyId,
          branchId,
          hotelName,
          employeeCode: emp.code,
          firstName: emp.firstName,
          lastName: emp.lastName,
          scheduleDate: today,
          tenant,
          deptName: emp.deptName || null,
          positionName: emp.positionName || null,
        },
      });
      seeded++;
    }

    return NextResponse.json({ seeded, skipped });
  } catch (error) {
    console.error('Payroll seed error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
