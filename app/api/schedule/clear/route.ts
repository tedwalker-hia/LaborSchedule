import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { makeScheduleService } from '@/lib/services/schedule-service';
import { mapErrorResponse } from '@/lib/http/map-error';

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { usrSystemCompanyId, employeeCodes, startDate, endDate, clearLocked } =
    await request.json();

  if (!usrSystemCompanyId || !Array.isArray(employeeCodes) || !startDate || !endDate) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const svc = makeScheduleService();
    const result = await svc.clear({
      usrSystemCompanyId,
      employeeCodes,
      startDate,
      endDate,
      clearLocked,
    });
    return NextResponse.json(result);
  } catch (error) {
    return mapErrorResponse(error, 'Schedule clear error');
  }
}
