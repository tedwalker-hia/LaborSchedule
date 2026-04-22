import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { makeScheduleService } from '@/lib/services/schedule-service';
import { SaveBodySchema } from '@/lib/schemas/schedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const parsed = SaveBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
    }

    const svc = makeScheduleService();
    const result = await svc.save(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Schedule save error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
