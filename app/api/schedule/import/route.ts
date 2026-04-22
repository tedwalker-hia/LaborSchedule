import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { parseWorkbook } from '@/lib/excel/parser';
import { makeImportService } from '@/lib/services/import-service';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getUserPermissions } from '@/lib/auth/rbac';
import { mapErrorResponse } from '@/lib/http/map-error';
import logger from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const user = getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form' }, { status: 400 });
  }

  const hotel = formData.get('hotel')?.toString() ?? '';
  const usrSystemCompanyId = formData.get('usrSystemCompanyId')?.toString() ?? '';
  const overwriteLocked = formData.get('overwriteLocked')?.toString() === 'true';
  const fileEntry = formData.get('file');

  if (!hotel || !usrSystemCompanyId || !(fileEntry instanceof File)) {
    return NextResponse.json(
      { error: 'Missing required fields: file, hotel, usrSystemCompanyId' },
      { status: 400 },
    );
  }

  if (fileEntry.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File exceeds 25 MB limit' }, { status: 413 });
  }

  const perms = await getUserPermissions(user.userId);
  if (!perms || !perms.hasScheduleAccess(hotel)) {
    return NextResponse.json({ error: 'forbidden', missingScope: { hotel } }, { status: 403 });
  }

  let records: Awaited<ReturnType<typeof parseWorkbook>>['records'];
  try {
    const arrayBuffer = await fileEntry.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const preview = await parseWorkbook(buffer);
    records = preview.records;
  } catch (err) {
    logger.error({ err }, 'Import parse error');
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to parse workbook' },
      { status: 400 },
    );
  }

  if (records.length === 0) {
    return NextResponse.json({ inserted: 0, updated: 0, skipped: 0 });
  }

  try {
    const svc = makeImportService();
    const parsedRows = records.map((r) => ({
      employeeCode: r.employeeCode,
      firstName: r.firstName || null,
      lastName: r.lastName || null,
      date: r.date,
      clockIn: r.clockIn || null,
      clockOut: r.clockOut || null,
      deptName: r.deptName || null,
      positionName: r.positionName || null,
    }));

    const result = await svc.commit(parsedRows, {
      usrSystemCompanyId,
      hotel,
      overwriteLocked,
      userId: user.userId,
    });

    return NextResponse.json({
      ...result,
      message: `Import completed: ${result.inserted} inserted, ${result.updated} updated, ${result.skipped} skipped.`,
    });
  } catch (err) {
    return mapErrorResponse(err, 'Import commit error');
  }
}
