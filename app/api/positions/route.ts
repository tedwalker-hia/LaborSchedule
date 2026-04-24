import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { makeOrgRepo } from '@/lib/repositories/org-repo';
import logger from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const hotel = searchParams.get('hotel');
    const usrSystemCompanyId = searchParams.get('usrSystemCompanyId');
    const dept = searchParams.get('dept');

    if (!hotel || !usrSystemCompanyId) {
      return NextResponse.json(
        { error: 'hotel and usrSystemCompanyId are required' },
        { status: 400 },
      );
    }

    const orgRepo = makeOrgRepo();
    const rows = await orgRepo.findPositions({
      hotelName: hotel,
      usrSystemCompanyId,
      deptName: dept ?? undefined,
    });

    const positions = rows
      .map((r) => r.positionName)
      .filter((p): p is string => p !== null && p !== '')
      .sort();

    return NextResponse.json(positions);
  } catch (error) {
    logger.error({ err: error }, 'Positions API error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
