import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { makeScheduleService } from '@/lib/services/schedule-service';
import { mapErrorResponse } from '@/lib/http/map-error';
import { AddBodySchema } from '@/lib/schemas/schedule';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getUserPermissions } from '@/lib/auth/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const parsed = AddBodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
  }

  const perms = await getUserPermissions(user.userId);
  if (
    !perms ||
    !perms.hasScheduleAccess(parsed.data.hotel ?? null, parsed.data.deptName ?? undefined)
  ) {
    return NextResponse.json(
      {
        error: 'forbidden',
        missingScope: { hotel: parsed.data.hotel, dept: parsed.data.deptName },
      },
      { status: 403 },
    );
  }

  try {
    const svc = makeScheduleService();
    const result = await svc.add(parsed.data, { userId: user.userId, source: 'api' });
    return NextResponse.json({ success: true, id: result.id });
  } catch (error) {
    return mapErrorResponse(error, 'Schedule add error');
  }
}
