import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { makeScheduleService } from '@/lib/services/schedule-service';
import { mapErrorResponse } from '@/lib/http/map-error';

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { usrSystemCompanyId, hotelName } = await request.json();

    if (!usrSystemCompanyId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const svc = makeScheduleService();
    const result = await svc.previewRefresh({ usrSystemCompanyId, hotelName });
    return NextResponse.json(result);
  } catch (error) {
    return mapErrorResponse(error, 'Refresh preview error');
  }
}
