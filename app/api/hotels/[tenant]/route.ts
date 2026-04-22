import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserPermissions } from '@/lib/permissions';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> },
) {
  try {
    const userId = request.headers.get('x-user-id');
    const role = request.headers.get('x-user-role');
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { tenant } = await params;

    const checker = await getUserPermissions(parseInt(userId));
    if (!checker) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (checker.isSuperAdmin()) {
      // All hotels for this tenant
      const rows = await prisma.laborSchedule.groupBy({
        by: ['hotelName', 'branchId', 'usrSystemCompanyId'],
        where: { tenant },
      });
      const hotels = rows
        .filter((r) => r.hotelName)
        .map((r) => ({
          hotelName: r.hotelName!,
          branchId: r.branchId,
          usrSystemCompanyId: r.usrSystemCompanyId,
        }))
        .sort((a, b) => a.hotelName.localeCompare(b.hotelName));
      return NextResponse.json(hotels);
    }

    // Non-SuperAdmin: filter to assigned hotels
    const accessibleHotels = checker.getAccessibleHotels();
    const filteredHotels = accessibleHotels
      .filter((h) => h.tenant === tenant)
      .map((h) => ({
        hotelName: h.hotelName,
        branchId: h.branchId,
        usrSystemCompanyId: h.usrSystemCompanyId,
      }))
      .sort((a, b) => a.hotelName.localeCompare(b.hotelName));

    // For DeptAdmin, derive hotels from department assignments
    if (role === 'DeptAdmin') {
      const accessibleDepts = checker.getAccessibleDepts();
      const deptHotelNames = [...new Set(accessibleDepts.map((d) => d.hotelName))];

      if (deptHotelNames.length > 0) {
        const rows = await prisma.laborSchedule.groupBy({
          by: ['hotelName', 'branchId', 'usrSystemCompanyId'],
          where: {
            tenant,
            hotelName: { in: deptHotelNames },
          },
        });
        const hotels = rows
          .filter((r) => r.hotelName)
          .map((r) => ({
            hotelName: r.hotelName!,
            branchId: r.branchId,
            usrSystemCompanyId: r.usrSystemCompanyId,
          }))
          .sort((a, b) => a.hotelName.localeCompare(b.hotelName));
        return NextResponse.json(hotels);
      }
      return NextResponse.json([]);
    }

    return NextResponse.json(filteredHotels);
  } catch (error) {
    console.error('Hotels API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
