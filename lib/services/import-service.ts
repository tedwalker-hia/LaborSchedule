import { PrismaClient } from '@prisma/client';
import { SchedulesRepo, makeSchedulesRepo } from '../repositories/schedules-repo';
import { AuditService, makeAuditService } from './audit-service';
import { prisma } from '../prisma';
import { calcHours } from '../domain/rules';

export interface ParsedRow {
  employeeCode: string;
  firstName?: string | null;
  lastName?: string | null;
  date: string;
  clockIn?: string | null;
  clockOut?: string | null;
  deptName?: string | null;
  positionName?: string | null;
}

export interface CommitOptions {
  usrSystemCompanyId: string;
  hotel?: string | null;
  branchId?: number | null;
  tenant?: string | null;
  overwriteLocked?: boolean;
  userId?: number | null;
}

export interface SkippedRow {
  employeeCode: string;
  date: string;
}

export interface CommitResult {
  inserted: number;
  updated: number;
  skipped: number;
  skippedRows: SkippedRow[];
}

export class ImportService {
  constructor(
    private readonly repo: SchedulesRepo,
    private readonly db: PrismaClient = prisma,
    private readonly auditService: AuditService = makeAuditService(),
  ) {}

  async commit(parsed: ParsedRow[], opts: CommitOptions): Promise<CommitResult> {
    const {
      usrSystemCompanyId,
      hotel,
      branchId,
      tenant,
      overwriteLocked = false,
      userId = null,
    } = opts;

    if (parsed.length === 0) {
      return { inserted: 0, updated: 0, skipped: 0, skippedRows: [] };
    }

    const empCodes = [...new Set(parsed.map((r) => r.employeeCode))];
    const dates = [...new Set(parsed.map((r) => r.date))].map((d) => new Date(d + 'T00:00:00Z'));

    const existing = await this.db.laborSchedule.findMany({
      where: {
        usrSystemCompanyId,
        employeeCode: { in: empCodes },
        scheduleDate: { in: dates },
      },
      select: {
        id: true,
        employeeCode: true,
        scheduleDate: true,
        positionName: true,
        locked: true,
        clockIn: true,
        clockOut: true,
        hotelName: true,
        branchId: true,
        tenant: true,
        firstName: true,
        lastName: true,
        deptName: true,
        multiDept: true,
      },
    });

    type ExistingRow = (typeof existing)[0];
    const existingMap = new Map<string, ExistingRow>();
    for (const row of existing) {
      const dateStr = row.scheduleDate.toISOString().split('T')[0]!;
      const key = `${row.employeeCode}|${dateStr}|${row.positionName ?? ''}`;
      existingMap.set(key, row);
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const skippedRows: SkippedRow[] = [];

    await this.db.$transaction(async (tx) => {
      for (const r of parsed) {
        const posKey = r.positionName ?? '';
        const key = `${r.employeeCode}|${r.date}|${posKey}`;
        const existingRow = existingMap.get(key);
        const scheduleDate = new Date(r.date + 'T00:00:00Z');
        const hours = r.clockIn && r.clockOut ? calcHours(r.clockIn, r.clockOut) : null;

        if (existingRow) {
          if (existingRow.locked && !overwriteLocked) {
            skippedRows.push({ employeeCode: r.employeeCode, date: r.date });
            skipped++;
            continue;
          }

          const oldJson = JSON.stringify({
            id: existingRow.id,
            employeeCode: existingRow.employeeCode,
            scheduleDate: existingRow.scheduleDate,
            clockIn: existingRow.clockIn,
            clockOut: existingRow.clockOut,
          });

          await tx.laborSchedule.delete({ where: { id: existingRow.id } });

          const created = await tx.laborSchedule.create({
            data: {
              usrSystemCompanyId,
              branchId: branchId ?? existingRow.branchId,
              hotelName: hotel ?? existingRow.hotelName,
              employeeCode: r.employeeCode,
              firstName: r.firstName ?? existingRow.firstName,
              lastName: r.lastName ?? existingRow.lastName,
              scheduleDate,
              clockIn: r.clockIn ?? null,
              clockOut: r.clockOut ?? null,
              hours: hours ?? null,
              tenant: tenant ?? existingRow.tenant,
              deptName: r.deptName ?? existingRow.deptName,
              multiDept: existingRow.multiDept,
              positionName: r.positionName ?? existingRow.positionName,
              locked: false,
            },
          });

          await this.auditService.record(
            {
              scheduleId: created.id,
              changedByUserId: userId,
              action: 'import_update',
              oldJson,
              newJson: JSON.stringify({
                id: created.id,
                clockIn: created.clockIn,
                clockOut: created.clockOut,
              }),
            },
            tx,
          );

          updated++;
        } else {
          const created = await tx.laborSchedule.create({
            data: {
              usrSystemCompanyId,
              branchId: branchId ?? null,
              hotelName: hotel ?? null,
              employeeCode: r.employeeCode,
              firstName: r.firstName ?? null,
              lastName: r.lastName ?? null,
              scheduleDate,
              clockIn: r.clockIn ?? null,
              clockOut: r.clockOut ?? null,
              hours: hours ?? null,
              tenant: tenant ?? null,
              deptName: r.deptName ?? null,
              positionName: r.positionName ?? null,
              locked: false,
            },
          });

          await this.auditService.record(
            {
              scheduleId: created.id,
              changedByUserId: userId,
              action: 'import_insert',
              oldJson: null,
              newJson: JSON.stringify({
                id: created.id,
                employeeCode: r.employeeCode,
                date: r.date,
              }),
            },
            tx,
          );

          inserted++;
        }
      }
    });

    return { inserted, updated, skipped, skippedRows };
  }
}

export function makeImportService(
  repo: SchedulesRepo = makeSchedulesRepo(),
  db: PrismaClient = prisma,
): ImportService {
  return new ImportService(repo, db);
}
