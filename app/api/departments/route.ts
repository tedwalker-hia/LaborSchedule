import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserPermissions } from '@/lib/permissions';

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    const role = request.headers.get('x-user-role');
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const hotel = searchParams.get('hotel');
    const usrSystemCompanyId = searchParams.get('usrSystemCompanyId');

    if (!hotel || !usrSystemCompanyId) {
      return NextResponse.json(
        { error: 'hotel and usrSystemCompanyId are required' },
        { status: 400 },
      );
    }

    const checker = await getUserPermissions(parseInt(userId));
    if (!checker) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // DeptAdmin: only their assigned departments
    if (role === 'DeptAdmin') {
      const accessibleDepts = checker.getAccessibleDepts();
      const deptNames = accessibleDepts
        .filter((d) => d.hotelName === hotel)
        .map((d) => d.deptName)
        .sort();
      return NextResponse.json(deptNames);
    }

    // All other roles: all departments at the hotel
    const rows = await prisma.laborSchedule.findMany({
      distinct: ['deptName'],
      where: {
        hotelName: hotel,
        usrSystemCompanyId,
        deptName: { not: '' },
      },
      select: { deptName: true },
    });

    const departments = rows
      .map((r) => r.deptName)
      .filter((d): d is string => d !== null && d !== '')
      .sort();

    return NextResponse.json(departments);
  } catch (error) {
    console.error('Departments API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
