import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { makeScheduleService } from '@/lib/services/schedule-service';

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { usrSystemCompanyId, hotel, branchId, tenant, changes } = await request.json();

    if (!usrSystemCompanyId || !Array.isArray(changes)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const svc = makeScheduleService();
    const result = await svc.save({ usrSystemCompanyId, hotel, branchId, tenant, changes });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Schedule save error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
