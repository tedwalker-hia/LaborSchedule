import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { makePayrollService } from '@/lib/services/payroll-service';
import { mapErrorResponse } from '@/lib/http/map-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const usrSystemCompanyId = searchParams.get('usrSystemCompanyId');

  if (!usrSystemCompanyId) {
    return NextResponse.json({ error: 'Missing usrSystemCompanyId' }, { status: 400 });
  }

  try {
    const employees = await makePayrollService().listEmployees({ usrSystemCompanyId });
    return NextResponse.json(employees);
  } catch (err) {
    return mapErrorResponse(err, 'GET /api/payroll/employees error');
  }
}
