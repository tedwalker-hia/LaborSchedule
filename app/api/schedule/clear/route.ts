import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { usrSystemCompanyId, employeeCodes, startDate, endDate, clearLocked } =
      await request.json();

    if (!usrSystemCompanyId || !Array.isArray(employeeCodes) || !startDate || !endDate) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');

    let deleted = 0;
    let lockedSkipped = 0;

    if (clearLocked) {
      // Delete all records in range
      const result = await prisma.laborSchedule.deleteMany({
        where: {
          usrSystemCompanyId,
          employeeCode: { in: employeeCodes },
          scheduleDate: { gte: start, lte: end },
        },
      });
      deleted = result.count;
    } else {
      // Count locked records that will be skipped
      lockedSkipped = await prisma.laborSchedule.count({
        where: {
          usrSystemCompanyId,
          employeeCode: { in: employeeCodes },
          scheduleDate: { gte: start, lte: end },
          locked: true,
        },
      });

      // Delete only unlocked records
      const result = await prisma.laborSchedule.deleteMany({
        where: {
          usrSystemCompanyId,
          employeeCode: { in: employeeCodes },
          scheduleDate: { gte: start, lte: end },
          OR: [{ locked: false }, { locked: null }],
        },
      });
      deleted = result.count;
    }

    return NextResponse.json({ deleted, lockedSkipped });
  } catch (error) {
    console.error('Schedule clear error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
