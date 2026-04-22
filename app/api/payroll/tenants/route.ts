import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { makePayrollService } from '@/lib/services/payroll-service';
import { mapErrorResponse } from '@/lib/http/map-error';

export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const tenants = await makePayrollService().listTenants();
    return NextResponse.json(tenants);
  } catch (err) {
    return mapErrorResponse(err, 'GET /api/payroll/tenants error');
  }
}
