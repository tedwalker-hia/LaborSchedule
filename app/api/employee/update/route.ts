import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { makeScheduleService } from '@/lib/services/schedule-service';
import { mapErrorResponse } from '@/lib/http/map-error';
import { UpdateEmployeeBodySchema } from '@/lib/schemas/employee';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getUserPermissions } from '@/lib/auth/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const perms = await getUserPermissions(user.userId);
  if (!perms || !perms.hasScheduleAccess(null)) {
    return NextResponse.json({ error: 'forbidden', missingScope: {} }, { status: 403 });
  }

  const parsed = UpdateEmployeeBodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const svc = makeScheduleService();
    const result = await svc.updateEmployeePlacement(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return mapErrorResponse(error, 'Employee update error');
  }
}
