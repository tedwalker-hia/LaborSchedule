import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserPermissions } from '@/lib/permissions';

interface ScheduleEntry {
  id: number;
  clockIn: string | null;
  clockOut: string | null;
  hours: number | null;
  deptName: string | null;
  positionName: string | null;
  locked: boolean | null;
}

interface EmployeeInfo {
  code: string;
  firstName: string | null;
  lastName: string | null;
  deptName: string;
  positionName: string;
  multiDept: boolean;
  depts: Set<string>;
}

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
      const accessibleDepts = checker.getAccessibleDepts();
      const allowedDepts = accessibleDepts
        .filter((d) => d.hotelName === hotel)
        .map((d) => d.deptName);

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

    if (dept) {
      where.deptName = dept;
    }

    if (position) {
      where.positionName = position;
    }

    // Fetch schedule entries
    const rows = await prisma.laborSchedule.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { scheduleDate: 'asc' }],
    });

    // Build employee list and schedule map
    const employeeMap = new Map<string, EmployeeInfo>();
    const schedule: Record<string, Record<string, ScheduleEntry>> = {};

    for (const row of rows) {
      const code = row.employeeCode;
      const rowDept = row.deptName ?? '';
      const rowPos = row.positionName ?? '';

      const existing = employeeMap.get(code);
      if (!existing) {
        employeeMap.set(code, {
          code,
          firstName: row.firstName,
          lastName: row.lastName,
          deptName: rowDept,
          positionName: rowPos,
          multiDept: false,
          depts: new Set(rowDept ? [rowDept] : []),
        });
      } else if (rowDept) {
        existing.depts.add(rowDept);
        if (existing.depts.size > 1) existing.multiDept = true;
      }

      if (!schedule[code]) {
        schedule[code] = {};
      }

      const dateKey = row.scheduleDate.toISOString().split('T')[0]!;
      schedule[code][dateKey] = {
        id: row.id,
        clockIn: row.clockIn,
        clockOut: row.clockOut,
        hours: row.hours ? Number(row.hours) : null,
        deptName: row.deptName,
        positionName: row.positionName,
        locked: row.locked,
      };
    }

    const employees = Array.from(employeeMap.values())
      .sort((a, b) => {
        const lastCmp = (a.lastName ?? '').localeCompare(b.lastName ?? '');
        if (lastCmp !== 0) return lastCmp;
        return (a.firstName ?? '').localeCompare(b.firstName ?? '');
      })
      .map(({ depts: _depts, ...rest }) => rest);

    // Fetch all departments and positions for inline editing dropdowns
    const deptWhere: Record<string, unknown> = {
      hotelName: hotel,
      usrSystemCompanyId,
      deptName: { not: '' },
    };

    const deptRows = await prisma.laborSchedule.findMany({
      distinct: ['deptName'],
      where: deptWhere,
      select: { deptName: true },
    });

    const allDepts = deptRows
      .map((r) => r.deptName)
      .filter((d): d is string => d !== null && d !== '')
      .sort();

    const positionRows = await prisma.laborSchedule.findMany({
      distinct: ['positionName'],
      where: {
        hotelName: hotel,
        usrSystemCompanyId,
        positionName: { not: '' },
      },
      select: { positionName: true },
    });

    const allPositions = positionRows
      .map((r) => r.positionName)
      .filter((p): p is string => p !== null && p !== '')
      .sort();

    // Build positions by department
    const positionsByDeptRows = await prisma.laborSchedule.groupBy({
      by: ['deptName', 'positionName'],
      where: {
        hotelName: hotel,
        usrSystemCompanyId,
        deptName: { not: '' },
        positionName: { not: '' },
      },
    });

    const positionsByDept: Record<string, string[]> = {};
    for (const row of positionsByDeptRows) {
      if (row.deptName && row.positionName) {
        if (!positionsByDept[row.deptName]) {
          positionsByDept[row.deptName] = [];
        }
        positionsByDept[row.deptName]!.push(row.positionName);
      }
    }

    // Sort positions within each department
    for (const dept of Object.keys(positionsByDept)) {
      positionsByDept[dept]!.sort();
    }

    return NextResponse.json({
      dates,
      employees,
      schedule,
      allDepts,
      allPositions,
      positionsByDept,
    });
  } catch (error) {
    console.error('Schedule API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
