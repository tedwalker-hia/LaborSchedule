import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { makePayrollService } from '@/lib/services/payroll-service';
import { mapErrorResponse } from '@/lib/http/map-error';
import { SeedBodySchema } from '@/lib/schemas/payroll';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const parsed = SeedBodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const result = await makePayrollService().seed(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    return mapErrorResponse(err, 'POST /api/payroll/seed error');
  }
}
