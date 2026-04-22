import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { makeGenerationService } from '@/lib/services/generation-service';

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

    const svc = makeGenerationService();
    const result = await svc.generate({
      usrSystemCompanyId,
      hotel,
      branchId,
      tenant,
      employeeCodes,
      startDate,
      endDate,
      overwriteLocked,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Schedule generate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
