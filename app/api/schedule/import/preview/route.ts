import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseWorkbook } from '@/lib/excel/parser';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getUserPermissions } from '@/lib/auth/rbac';
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
  const tenant = formData.get('tenant')?.toString() || null;
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
  if (!perms || !perms.hasScheduleAccess({ hotel, tenant })) {
    return NextResponse.json({ error: 'forbidden', missingScope: { hotel } }, { status: 403 });
  }

  let records: Awaited<ReturnType<typeof parseWorkbook>>['records'];
  try {
    const arrayBuffer = await fileEntry.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const preview = await parseWorkbook(buffer);
    records = preview.records;
  } catch (err) {
    logger.error({ err }, 'Preview parse error');
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to parse workbook' },
      { status: 400 },
    );
  }

  const totalRows = records.length;
  if (totalRows === 0) {
    return NextResponse.json({
      totalRows: 0,
      newRecords: 0,
      updatedRecords: 0,
      skippedRecords: 0,
      errors: [],
    });
  }

  try {
    const empCodes = [...new Set(records.map((r) => r.employeeCode))];
    const dates = [...new Set(records.map((r) => r.date))].map((d) => new Date(d + 'T00:00:00Z'));

    // Query without positionName filter so NULL positionName rows are included.
    // positionName comparison is done in-memory with null → '' coercion.
    const existing = await prisma.laborSchedule.findMany({
      where: {
        usrSystemCompanyId,
        employeeCode: { in: empCodes },
        scheduleDate: { in: dates },
      },
      select: {
        employeeCode: true,
        scheduleDate: true,
        positionName: true,
        locked: true,
      },
    });

    const existingMap = new Map<string, boolean>();
    for (const row of existing) {
      const dateStr = row.scheduleDate.toISOString().split('T')[0]!;
      const key = `${row.employeeCode}|${dateStr}|${row.positionName ?? ''}`;
      existingMap.set(key, row.locked ?? false);
    }

    let newRecords = 0;
    let updatedRecords = 0;
    let skippedRecords = 0;

    for (const r of records) {
      const key = `${r.employeeCode}|${r.date}|${r.positionName}`;
      if (!existingMap.has(key)) {
        newRecords++;
      } else if (existingMap.get(key)) {
        skippedRecords++;
      } else {
        updatedRecords++;
      }
    }

    return NextResponse.json({ totalRows, newRecords, updatedRecords, skippedRecords, errors: [] });
  } catch (err) {
    logger.error({ err }, 'Preview DB comparison error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
