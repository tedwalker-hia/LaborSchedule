import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calcHours } from '@/lib/domain/rules';

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const {
      usrSystemCompanyId,
      branchId,
      hotel,
      tenant,
      employeeCode,
      firstName,
      lastName,
      deptName,
      positionName,
      date,
      clockIn,
      clockOut,
    } = await request.json();

    if (!usrSystemCompanyId || !employeeCode || !date) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const scheduleDate = new Date(date + 'T00:00:00');

    // Check for existing record with same employee+date+position
    const existing = await prisma.laborSchedule.findFirst({
      where: {
        usrSystemCompanyId,
        employeeCode,
        scheduleDate,
        positionName: positionName || null,
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'A schedule record already exists for this employee, date, and position.' },
        { status: 409 },
      );
    }

    const hours = clockIn && clockOut ? calcHours(clockIn, clockOut) : null;

    const record = await prisma.laborSchedule.create({
      data: {
        usrSystemCompanyId,
        branchId,
        hotelName: hotel,
        employeeCode,
        firstName,
        lastName,
        scheduleDate,
        clockIn: clockIn || null,
        clockOut: clockOut || null,
        hours,
        tenant,
        deptName: deptName || null,
        positionName: positionName || null,
        locked: true, // manual records auto-lock
      },
    });

    return NextResponse.json({ success: true, id: record.id });
  } catch (error) {
    console.error('Schedule add error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
