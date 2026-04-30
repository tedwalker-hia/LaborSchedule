import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { makeExportService } from '@/lib/services/export-service';
import { exportScheduleToExcel } from '@/lib/excel/writer';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getUserPermissions } from '@/lib/auth/rbac';
import logger from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const hotel = searchParams.get('hotel') || '';
    const usrSystemCompanyId = searchParams.get('usrSystemCompanyId') || '';
    const tenant = searchParams.get('tenant') || null;
    const dept = searchParams.get('dept') || undefined;
    const position = searchParams.get('position') || undefined;
    const startDateStr = searchParams.get('startDate') || '';
    const endDateStr = searchParams.get('endDate') || '';

    if (!hotel || !usrSystemCompanyId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const perms = await getUserPermissions(user.userId);
    if (!perms || !perms.hasScheduleAccess({ hotel, tenant })) {
      return NextResponse.json({ error: 'forbidden', missingScope: { hotel } }, { status: 403 });
    }

    const today = new Date();
    const startDate = startDateStr
      ? new Date(startDateStr + 'T00:00:00Z')
      : new Date(today.getTime() - 7 * 86400000);
    const endDate = endDateStr
      ? new Date(endDateStr + 'T00:00:00Z')
      : new Date(today.getTime() + 7 * 86400000);

    // Build date list
    const dates: Date[] = [];
    const d = new Date(startDate);
    while (d <= endDate) {
      dates.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }

    // Get employees
    const where: Record<string, unknown> = {
      hotelName: hotel,
      usrSystemCompanyId,
    };
    if (dept) where.deptName = dept;
    if (position) where.positionName = position;

    // Get export data via service
    const exportService = makeExportService();
    const { employees: empList, schedule: scheduleRows } = await exportService.getExportData({
      usrSystemCompanyId,
      hotelName: hotel,
      startDate,
      endDate,
      dept,
      position,
    });

    const employees = empList.map((e) => ({
      code: e.code,
      firstName: e.firstName || '',
      lastName: e.lastName || '',
      deptName: e.deptName || '',
      positionName: e.positionName || '',
    }));

    const schedule: Record<
      string,
      Record<string, { clockIn: string; clockOut: string; hours: number }>
    > = {};
    for (const row of scheduleRows) {
      const rowKey = `${row.employeeCode}|${row.positionName ?? ''}`;
      const dateKey = row.scheduleDate.toISOString().split('T')[0]!;
      if (!schedule[rowKey]) schedule[rowKey] = {};
      schedule[rowKey][dateKey] = {
        clockIn: row.clockIn || '',
        clockOut: row.clockOut || '',
        hours: row.hours ? Number(row.hours) : 0,
      };
    }

    const buffer = await exportScheduleToExcel({
      hotel,
      employees,
      dates,
      schedule,
      today,
    });

    const safeHotel = hotel.replace(/ /g, '_').replace(/\//g, '_');
    const filename = `Schedule_${safeHotel}_${startDateStr || startDate.toISOString().split('T')[0]}_${endDateStr || endDate.toISOString().split('T')[0]}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Export error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
