import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { makePayrollService } from '@/lib/services/payroll-service';
import { mapErrorResponse } from '@/lib/http/map-error';

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json();
  const { usrSystemCompanyId, branchId, hotelName, tenant, employees } = body;

  if (!usrSystemCompanyId || !Array.isArray(employees)) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const result = await makePayrollService().seed({
      usrSystemCompanyId,
      branchId,
      hotelName,
      tenant,
      employees,
    });
    return NextResponse.json(result);
  } catch (err) {
    return mapErrorResponse(err, 'POST /api/payroll/seed error');
  }
}
