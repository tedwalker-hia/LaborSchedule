import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { Role } from '@/lib/permissions';
import { getUserPermissions } from '@/lib/permissions';
import { makeUserService, type UserScope } from '@/lib/services/user-service';
import { mapErrorResponse } from '@/lib/http/map-error';
import { CreateUserBodySchema } from '@/lib/schemas/user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── GET /api/users ─────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
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

    let scope: UserScope;
    if (perms.isSuperAdmin()) {
      scope = { type: 'all' };
    } else if (currentUserRole === 'CompanyAdmin') {
      scope = { type: 'byTenants', tenants: perms.getAccessibleTenants() };
    } else if (currentUserRole === 'HotelAdmin') {
      scope = { type: 'byHotels', hotels: perms.getAccessibleHotels().map((h) => h.hotelName) };
    } else if (currentUserRole === 'DeptAdmin') {
      scope = { type: 'byDepts', departments: perms.getAccessibleDepts() };
    } else {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const users = await makeUserService().list(scope);
    return NextResponse.json(users);
  } catch (err) {
    return mapErrorResponse(err, 'GET /api/users error');
  }
}

// ─── POST /api/users ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const currentUserId = Number(req.headers.get('x-user-id'));

  if (!currentUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const perms = await getUserPermissions(currentUserId);
    if (!perms) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = CreateUserBodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
    }
    const { firstName, lastName, email, password, role, tenants, hotels, departments } =
      parsed.data;

    if (!perms.canManageUser(role as Role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions to create this role' },
        { status: 403 },
      );
    }

    const user = await makeUserService().create({
      firstName,
      lastName,
      email,
      password,
      role,
      tenants,
      hotels,
      departments,
    });
    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    return mapErrorResponse(err, 'POST /api/users error');
  }
}
