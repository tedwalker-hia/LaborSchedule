import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { makeGenerationService } from '@/lib/services/generation-service';
import { mapErrorResponse } from '@/lib/http/map-error';
import { GenerateBodySchema } from '@/lib/schemas/schedule';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getUserPermissions } from '@/lib/auth/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const parsed = GenerateBodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
  }

  const perms = await getUserPermissions(user.userId);
  if (!perms) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (parsed.data.hotel) {
    const ok = await perms.hasHotelAccess({
      hotel: parsed.data.hotel,
      usrSystemCompanyId: parsed.data.usrSystemCompanyId,
    });
    if (!ok) {
      return NextResponse.json(
        { error: 'forbidden', missingScope: { hotel: parsed.data.hotel } },
        { status: 403 },
      );
    }
  }
  const scope = await perms.deriveScheduleScope(parsed.data.usrSystemCompanyId);
  if (scope !== null && scope.length === 0) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  try {
    const svc = makeGenerationService();
    const result = await svc.generate(
      { ...parsed.data, scope },
      { userId: user.userId, source: 'api' },
    );
    return NextResponse.json(result);
  } catch (error) {
    return mapErrorResponse(error, 'Schedule generate error');
  }
}
