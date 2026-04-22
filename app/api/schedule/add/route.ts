import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { makeScheduleService } from '@/lib/services/schedule-service';
import { mapErrorResponse } from '@/lib/http/map-error';

export async function POST(request: NextRequest) {
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

  try {
    const svc = makeScheduleService();
    const result = await svc.add({
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
    });
    return NextResponse.json({ success: true, id: result.id });
  } catch (error) {
    return mapErrorResponse(error, 'Schedule add error');
  }
}
