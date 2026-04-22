import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateClockTimes } from '@/lib/schedule-utils';
import type { EmployeeHistory } from '@/lib/domain/types';
import { getEmployeeHistoryByPosition, getEmployeeHistory } from '@/lib/payroll-history';
import { toMondayBased } from '@/lib/domain/payroll';
import { calcHours, shouldScheduleDow } from '@/lib/domain/rules';

/**
 * Generate an array of Date objects for each day in [startDate, endDate].
 */
function dateRange(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const {
      usrSystemCompanyId,
      hotel,
      branchId,
      tenant,
      employeeCodes,
      startDate,
      endDate,
      overwriteLocked,
    } = await request.json();

    if (!usrSystemCompanyId || !Array.isArray(employeeCodes) || !startDate || !endDate) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    const dates = dateRange(start, end);

    let totalInserted = 0;
    let totalSkipped = 0;
    const skippedEmployees: string[] = [];

    for (const empCode of employeeCodes) {
      // Get employee name from LaborSchedule table
      const empRecord = await prisma.laborSchedule.findFirst({
        where: { usrSystemCompanyId, employeeCode: empCode },
        select: { firstName: true, lastName: true },
      });

      const firstName = empRecord?.firstName ?? '';
      const lastName = empRecord?.lastName ?? '';

      // Try position-based history first
      const positionHistories = await getEmployeeHistoryByPosition(usrSystemCompanyId, empCode);

      let simpleHistory: EmployeeHistory | null = null;
      const isMultiPosition = positionHistories.length > 1;

      if (positionHistories.length === 0) {
        // Fall back to simple history
        simpleHistory = await getEmployeeHistory(usrSystemCompanyId, empCode);
        if (!simpleHistory) {
          skippedEmployees.push(empCode);
          continue;
        }
      }

      for (const date of dates) {
        const scheduleDate = new Date(date);
        const dow = toMondayBased(date.getDay());

        // Check for locked records
        const lockedRecord = await prisma.laborSchedule.findFirst({
          where: {
            usrSystemCompanyId,
            employeeCode: empCode,
            scheduleDate,
            locked: true,
          },
        });

        if (lockedRecord && !overwriteLocked) {
          totalSkipped++;
          continue;
        }

        if (isMultiPosition) {
          // Multi-position: delete existing records for this date
          await prisma.laborSchedule.deleteMany({
            where: {
              usrSystemCompanyId,
              employeeCode: empCode,
              scheduleDate,
              ...(overwriteLocked ? {} : { OR: [{ locked: false }, { locked: null }] }),
            },
          });

          // Calculate total weekly hours across all positions
          const totalWeeklyHours = positionHistories.reduce((sum, h) => sum + h.avgWeeklyHours, 0);

          for (const posHistory of positionHistories) {
            // Check if this DOW is a work day for this position
            if (!posHistory.workDays.includes(dow)) continue;

            // Proportional hours for this position
            const proportion =
              totalWeeklyHours > 0 ? posHistory.avgWeeklyHours / totalWeeklyHours : 0;
            const avgHours = posHistory.avgByDow[dow] ?? 0;
            if (!shouldScheduleDow(avgHours)) continue;

            const times = generateClockTimes(avgHours);
            if (!times) continue;

            const hours = calcHours(times.clockIn, times.clockOut);

            await prisma.laborSchedule.create({
              data: {
                usrSystemCompanyId,
                branchId,
                hotelName: hotel,
                employeeCode: empCode,
                firstName,
                lastName,
                scheduleDate,
                clockIn: times.clockIn,
                clockOut: times.clockOut,
                hours,
                tenant,
                deptName: posHistory.deptName || null,
                multiDept: true,
                positionName: posHistory.positionName || null,
              },
            });
            totalInserted++;
          }
        } else {
          // Single position (or simple history fallback)
          const history = positionHistories[0] ?? simpleHistory!;

          // Check if DOW is a work day
          if (!history.workDays.includes(dow)) continue;

          const avgHours = history.avgByDow[dow] ?? 0;
          if (!shouldScheduleDow(avgHours)) continue;

          const times = generateClockTimes(avgHours);
          if (!times) continue;

          const hours = calcHours(times.clockIn, times.clockOut);

          // Delete existing record for this date
          await prisma.laborSchedule.deleteMany({
            where: {
              usrSystemCompanyId,
              employeeCode: empCode,
              scheduleDate,
              ...(overwriteLocked ? {} : { OR: [{ locked: false }, { locked: null }] }),
            },
          });

          await prisma.laborSchedule.create({
            data: {
              usrSystemCompanyId,
              branchId,
              hotelName: hotel,
              employeeCode: empCode,
              firstName,
              lastName,
              scheduleDate,
              clockIn: times.clockIn,
              clockOut: times.clockOut,
              hours,
              tenant,
              deptName: history.deptName || null,
              multiDept: false,
              positionName: history.positionName || null,
            },
          });
          totalInserted++;
        }
      }
    }

    return NextResponse.json({
      inserted: totalInserted,
      skipped: totalSkipped,
      skippedEmployees,
    });
  } catch (error) {
    console.error('Schedule generate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
