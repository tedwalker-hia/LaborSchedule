import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserPermissions } from '@/lib/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    const role = request.headers.get('x-user-role');
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const checker = await getUserPermissions(parseInt(userId));
    if (!checker) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (checker.isSuperAdmin()) {
      const rows = await prisma.laborSchedule.findMany({
        distinct: ['tenant'],
        where: { tenant: { not: '' } },
        select: { tenant: true },
      });
      const tenants = rows
        .map((r) => r.tenant)
        .filter((t): t is string => t !== null && t !== '')
        .sort();
      return NextResponse.json(tenants);
    }

    // Non-SuperAdmin: return only accessible tenants
    const accessibleTenants = checker.getAccessibleTenants();
    return NextResponse.json(accessibleTenants.sort());
  } catch (error) {
    console.error('Tenants API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
