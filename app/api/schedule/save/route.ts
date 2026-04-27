import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { makeScheduleService } from '@/lib/services/schedule-service';
import { SaveBodySchema } from '@/lib/schemas/schedule';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getUserPermissions } from '@/lib/auth/rbac';
import logger from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const parsed = SaveBodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const perms = await getUserPermissions(user.userId);
    if (
      !perms ||
      !perms.hasScheduleAccess({
        hotel: parsed.data.hotel,
        tenant: parsed.data.tenant,
      })
    ) {
      return NextResponse.json(
        { error: 'forbidden', missingScope: { hotel: parsed.data.hotel } },
        { status: 403 },
      );
    }

    const svc = makeScheduleService();
    const result = await svc.save(parsed.data, { userId: user.userId, source: 'api' });
    return NextResponse.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Schedule save error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
