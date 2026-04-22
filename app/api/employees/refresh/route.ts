import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { makeScheduleService } from '@/lib/services/schedule-service';
import { mapErrorResponse } from '@/lib/http/map-error';
import { RefreshBodySchema } from '@/lib/schemas/employee';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const parsed = RefreshBodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const svc = makeScheduleService();
    const result = await svc.refreshRoster(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return mapErrorResponse(error, 'Refresh error');
  }
}
