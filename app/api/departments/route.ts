import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { makeOrgRepo } from '@/lib/repositories/org-repo';
import { getUserPermissions } from '@/lib/auth/rbac';
import logger from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
      const ds = checker.getAccessibleDepts();
      if (ds.unlimited) return NextResponse.json([]); // DeptAdmin never unlimited; unreachable
      const deptNames = ds.allowed
        .filter((d) => d.hotelName === hotel)
        .map((d) => d.deptName)
        .sort();
      return NextResponse.json(deptNames);
    }

    // All other roles: all departments at the hotel
    const orgRepo = makeOrgRepo();
    const rows = await orgRepo.findDepts({ hotelName: hotel, usrSystemCompanyId });

    const departments = rows
      .map((r) => r.deptName)
      .filter((d): d is string => d !== null && d !== '')
      .sort();

    return NextResponse.json(departments);
  } catch (error) {
    logger.error({ err: error }, 'Departments API error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
