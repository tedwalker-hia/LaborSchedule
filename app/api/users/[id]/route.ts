import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { Role } from '@/lib/auth/rbac';
import { getUserPermissions } from '@/lib/auth/rbac';
import { makeUserService } from '@/lib/services/user-service';
import { mapErrorResponse } from '@/lib/http/map-error';
import type { UserDetailRow } from '@/lib/repositories/users-repo';
import { UpdateUserBodySchema } from '@/lib/schemas/user';
import type { AuditCtx } from '@/lib/services/audit-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

// ─── GET /api/users/[id] ───────────────────────────────────────────────────
export async function GET(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const targetId = Number(id);
  const currentUserId = Number(req.headers.get('x-user-id'));
  const currentUserRole = req.headers.get('x-user-role') as Role | null;

  if (!currentUserId || !currentUserRole) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const perms = await getUserPermissions(currentUserId);
    if (!perms) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await makeUserService().get(targetId);

    if (!perms.isSuperAdmin()) {
      if (!canCurrentUserSeeTarget(perms, currentUserRole, user)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    return NextResponse.json(user);
  } catch (err) {
    return mapErrorResponse(err, 'GET /api/users/[id] error');
  }
}

// ─── PUT /api/users/[id] ───────────────────────────────────────────────────
export async function PUT(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const targetId = Number(id);
  const currentUserId = Number(req.headers.get('x-user-id'));

  if (!currentUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const perms = await getUserPermissions(currentUserId);
    if (!perms) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = UpdateUserBodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
    }
    const { firstName, lastName, email, password, role, tenants, hotels, departments } =
      parsed.data;

    if (!perms.canManageUser(role as Role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions to manage this role' },
        { status: 403 },
      );
    }

    const svc = makeUserService();
    const existing = await svc.get(targetId);

    if (!perms.canManageUser(existing.role as Role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions to manage this user' },
        { status: 403 },
      );
    }

    const ctx: AuditCtx = { userId: currentUserId, source: 'api' };
    const updated = await svc.update(
      targetId,
      { firstName, lastName, email, password, role, tenants, hotels, departments },
      ctx,
    );
    return NextResponse.json(updated);
  } catch (err) {
    return mapErrorResponse(err, 'PUT /api/users/[id] error');
  }
}

// ─── DELETE /api/users/[id] (soft delete) ───────────────────────────────────
export async function DELETE(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const targetId = Number(id);
  const currentUserId = Number(req.headers.get('x-user-id'));

  if (!currentUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (currentUserId === targetId) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
  }

  try {
    const perms = await getUserPermissions(currentUserId);
    if (!perms) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const svc = makeUserService();
    const target = await svc.get(targetId);

    if (!perms.canManageUser(target.role as Role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions to delete this user' },
        { status: 403 },
      );
    }

    const ctx: AuditCtx = { userId: currentUserId, source: 'api' };
    await svc.delete(targetId, ctx);
    return NextResponse.json({ success: true });
  } catch (err) {
    return mapErrorResponse(err, 'DELETE /api/users/[id] error');
  }
}

// ─── Helper: can the current user see the target user? ──────────────────────
function canCurrentUserSeeTarget(
  perms: Awaited<ReturnType<typeof getUserPermissions>> & object,
  currentUserRole: Role,
  target: UserDetailRow,
): boolean {
  if (currentUserRole === 'CompanyAdmin') {
    const ts = perms.getAccessibleTenants();
    if (ts.unlimited) return true;
    const targetTenants = [
      ...target.tenants.map((t) => t.tenant),
      ...target.hotels.map((h) => h.tenant),
      ...target.departments.map((d) => d.tenant),
    ];
    return targetTenants.some((t) => ts.allowed.includes(t));
  }

  if (currentUserRole === 'HotelAdmin') {
    const hs = perms.getAccessibleHotels();
    if (hs.unlimited) return true;
    const accessibleHotels = hs.allowed.map((h) => h.hotelName);
    const targetHotels = [
      ...target.hotels.map((h) => h.hotelName),
      ...target.departments.map((d) => d.hotelName),
    ];
    return targetHotels.some((h) => accessibleHotels.includes(h));
  }

  if (currentUserRole === 'DeptAdmin') {
    const ds = perms.getAccessibleDepts();
    if (ds.unlimited) return true;
    return target.departments.some((d) =>
      ds.allowed.some((ad) => ad.hotelName === d.hotelName && ad.deptName === d.deptName),
    );
  }

  return false;
}
