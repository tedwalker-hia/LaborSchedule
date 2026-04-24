import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { makeScheduleService } from '@/lib/services/schedule-service';
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
    const dept = searchParams.get('department') ?? searchParams.get('dept');
    const position = searchParams.get('position');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!hotel || !usrSystemCompanyId) {
      return NextResponse.json(
        { error: 'hotel and usrSystemCompanyId are required' },
        { status: 400 },
      );
    }

    // Build date range (default +/- 7 days from today)
    const today = new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Generate dates array
    const dates: string[] = [];
    const current = new Date(start);
    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]!);
      current.setDate(current.getDate() + 1);
    }

    // Build where clause for schedule data
    const where: Record<string, unknown> = {
      hotelName: hotel,
      usrSystemCompanyId,
      scheduleDate: {
        gte: start,
        lte: end,
      },
    };

    // DeptAdmin restriction
    if (role === 'DeptAdmin') {
      const checker = await getUserPermissions(parseInt(userId));
      if (!checker) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      const ds = checker.getAccessibleDepts();
      if (ds.unlimited)
        return NextResponse.json({
          dates,
          employees: [],
          schedule: {},
          allDepts: [],
          allPositions: [],
          positionsByDept: {},
        }); // DeptAdmin never unlimited; unreachable
      const allowedDepts = ds.allowed.filter((d) => d.hotelName === hotel).map((d) => d.deptName);

      if (allowedDepts.length === 0) {
        return NextResponse.json({
          dates,
          employees: [],
          schedule: {},
          allDepts: [],
          allPositions: [],
          positionsByDept: {},
        });
      }

      where.deptName = { in: allowedDepts };
    }

    // Determine deptNames for service call (handles DeptAdmin restriction)
    let deptNames: string[] | undefined;
    if (role === 'DeptAdmin' && 'deptName' in where) {
      const deptFilter = where.deptName as Record<string, unknown>;
      if ('in' in deptFilter) {
        deptNames = deptFilter.in as string[];
      }
    }

    // Fetch schedule grid data via service
    const service = makeScheduleService();
    const grid = await service.findScheduleGrid({
      usrSystemCompanyId,
      hotelName: hotel,
      startDate: start,
      endDate: end,
      dept: dept ?? undefined,
      position: position ?? undefined,
      deptNames,
    });

    const { employees, schedule, allDepts, allPositions, positionsByDept } = grid;

    return NextResponse.json({
      dates,
      employees,
      schedule,
      allDepts,
      allPositions,
      positionsByDept,
    });
  } catch (error) {
    logger.error({ err: error }, 'Schedule API error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
