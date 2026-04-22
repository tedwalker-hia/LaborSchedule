import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { makeScheduleService } from '@/lib/services/schedule-service';
import { mapErrorResponse } from '@/lib/http/map-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const hotel = searchParams.get('hotel');
    const usrSystemCompanyId = searchParams.get('usrSystemCompanyId');

    if (!hotel || !usrSystemCompanyId) {
      return NextResponse.json(
        { error: 'hotel and usrSystemCompanyId are required' },
        { status: 400 },
      );
    }

    const svc = makeScheduleService();
    const employees = await svc.listRosterEmployees({ usrSystemCompanyId, hotelName: hotel });
    return NextResponse.json(employees);
  } catch (error) {
    return mapErrorResponse(error, 'Employees API error');
  }
}
