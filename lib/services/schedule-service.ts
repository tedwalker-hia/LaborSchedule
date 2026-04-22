import { PrismaClient, Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import {
  SchedulesRepo,
  makeSchedulesRepo,
  type LockedRecord,
} from '../repositories/schedules-repo';
import { PayrollRepo, makePayrollRepo } from '../repositories/payroll-repo';
import { AuditService, AuditCtx, makeAuditService } from './audit-service';
import { calcHours } from '../domain/rules';

export class DuplicateScheduleError extends Error {
  readonly statusHint = 409;
  constructor() {
    super('A schedule record already exists for this employee, date, and position.');
    this.name = 'DuplicateScheduleError';
  }
}

export interface SaveChange {
  employeeCode: string;
  firstName?: string | null;
  lastName?: string | null;
  date: string;
  clockIn?: string | null;
  clockOut?: string | null;
}

export interface SaveParams {
  usrSystemCompanyId: string;
  hotel?: string | null;
  branchId?: number | null;
  tenant?: string | null;
  changes: SaveChange[];
}

export interface SaveResult {
  inserted: number;
  updated: number;
  skipped: number;
}

export interface AddParams {
  usrSystemCompanyId: string;
  branchId?: number | null;
  hotel?: string | null;
  tenant?: string | null;
  employeeCode: string;
  firstName?: string | null;
  lastName?: string | null;
  deptName?: string | null;
  positionName?: string | null;
  date: string;
  clockIn?: string | null;
  clockOut?: string | null;
}

export interface LockRecord {
  employeeCode: string;
  date: string;
}

export interface LockParams {
  usrSystemCompanyId: string;
  records: LockRecord[];
  locked: boolean;
}

export interface ClearParams {
  usrSystemCompanyId: string;
  employeeCodes: string[];
  startDate: string;
  endDate: string;
  clearLocked?: boolean;
}

export interface DeleteParams {
  usrSystemCompanyId: string;
  employeeCodes: string[];
  startDate: string;
  endDate: string;
}

export interface CheckLockedParams {
  usrSystemCompanyId: string;
  employeeCodes: string[];
  startDate: string;
  endDate: string;
}

export interface RosterEmployee {
  employeeCode: string;
  firstName: string | null;
  lastName: string | null;
}

export interface ListRosterParams {
  usrSystemCompanyId: string;
  hotelName: string;
}

export interface UpdatePlacementParams {
  usrSystemCompanyId: string;
  employeeCode: string;
  oldDeptName?: string | null;
  oldPositionName?: string | null;
  newDeptName?: string | null;
  newPositionName?: string | null;
}

export interface RefreshEmployee {
  code: string;
  firstName: string;
  lastName: string;
  deptName?: string | null;
  positionName?: string | null;
}

export interface RefreshRosterParams {
  usrSystemCompanyId: string;
  hotelName?: string | null;
  branchId?: number | null;
  tenant?: string | null;
  newEmployees: RefreshEmployee[];
  removedCodes: string[];
}

export interface PreviewRefreshParams {
  usrSystemCompanyId: string;
  hotelName?: string | null;
}

export interface PreviewRefreshResult {
  newEmployees: RefreshEmployee[];
  removedEmployees: RefreshEmployee[];
}

export class ScheduleService {
  constructor(
    private readonly repo: SchedulesRepo,
    private readonly db: PrismaClient = prisma,
    private readonly payrollRepo: PayrollRepo = makePayrollRepo(),
    private readonly auditService: AuditService = makeAuditService(),
  ) {}

  /**
   * Saves a batch of schedule changes. Each change is a delete-then-insert if
   * the record exists with different values. All mutations run in a single
   * prisma.$transaction so partial failures roll back, including audit rows.
   */
  async save(params: SaveParams, ctx: AuditCtx): Promise<SaveResult> {
    const { usrSystemCompanyId, hotel, branchId, tenant, changes } = params;
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    // Pre-load existing records outside the transaction (consistent with prior behaviour).
    const resolved = await Promise.all(
      changes.map(async (change) => {
        const scheduleDate = new Date(change.date + 'T00:00:00Z');
        const existing = await this.repo.findFirst({
          usrSystemCompanyId,
          employeeCode: change.employeeCode,
          scheduleDate,
        });
        return { change, scheduleDate, existing };
      }),
    );

    // Filter out no-op changes and count skipped.
    const toProcess = resolved.filter(({ change, existing }) => {
      if (existing) {
        const clockIn = change.clockIn || null;
        const clockOut = change.clockOut || null;
        if ((existing.clockIn ?? null) === clockIn && (existing.clockOut ?? null) === clockOut) {
          skipped++;
          return false;
        }
      }
      return true;
    });

    if (toProcess.length > 0) {
      await this.db.$transaction(async (tx) => {
        for (const { change, scheduleDate, existing } of toProcess) {
          const clockIn = change.clockIn || null;
          const clockOut = change.clockOut || null;
          const isClearing = !clockIn && !clockOut;
          const hours = clockIn && clockOut ? calcHours(clockIn, clockOut) : null;

          if (existing) {
            await tx.laborSchedule.delete({ where: { id: existing.id } });
            const created = await tx.laborSchedule.create({
              data: {
                usrSystemCompanyId,
                branchId: branchId ?? existing.branchId,
                hotelName: hotel ?? existing.hotelName,
                employeeCode: change.employeeCode,
                firstName: change.firstName ?? existing.firstName,
                lastName: change.lastName ?? existing.lastName,
                scheduleDate,
                clockIn: isClearing ? null : clockIn,
                clockOut: isClearing ? null : clockOut,
                hours: isClearing ? null : hours,
                tenant: tenant ?? existing.tenant,
                deptName: existing.deptName,
                multiDept: existing.multiDept,
                positionName: existing.positionName,
                locked: existing.locked,
              },
            });
            await this.auditService.record(
              {
                scheduleId: created.id,
                changedByUserId: ctx.userId,
                action: 'schedule.save',
                oldJson: JSON.stringify(existing),
                newJson: JSON.stringify(created),
              },
              tx,
            );
            updated++;
          } else {
            const created = await tx.laborSchedule.create({
              data: {
                usrSystemCompanyId,
                branchId,
                hotelName: hotel,
                employeeCode: change.employeeCode,
                firstName: change.firstName,
                lastName: change.lastName,
                scheduleDate,
                clockIn: isClearing ? null : clockIn,
                clockOut: isClearing ? null : clockOut,
                hours: isClearing ? null : hours,
                tenant,
              },
            });
            await this.auditService.record(
              {
                scheduleId: created.id,
                changedByUserId: ctx.userId,
                action: 'schedule.save',
                oldJson: null,
                newJson: JSON.stringify(created),
              },
              tx,
            );
            inserted++;
          }
        }
      });
    }

    return { inserted, updated, skipped };
  }

  /** Manually adds a single schedule record. Auto-locks the record. Throws DuplicateScheduleError if one already exists for this employee+date+position. */
  async add(params: AddParams, ctx: AuditCtx): Promise<{ id: number }> {
    const scheduleDate = new Date(params.date + 'T00:00:00Z');
    const positionName = params.positionName || null;

    const existing = await this.repo.findFirst({
      usrSystemCompanyId: params.usrSystemCompanyId,
      employeeCode: params.employeeCode,
      scheduleDate,
      positionName,
    });

    if (existing) {
      throw new DuplicateScheduleError();
    }

    const hours =
      params.clockIn && params.clockOut ? calcHours(params.clockIn, params.clockOut) : null;

    const record = await this.db.$transaction(async (tx) => {
      const created = await tx.laborSchedule.create({
        data: {
          usrSystemCompanyId: params.usrSystemCompanyId,
          branchId: params.branchId,
          hotelName: params.hotel,
          employeeCode: params.employeeCode,
          firstName: params.firstName,
          lastName: params.lastName,
          scheduleDate,
          clockIn: params.clockIn || null,
          clockOut: params.clockOut || null,
          hours,
          tenant: params.tenant,
          deptName: params.deptName || null,
          positionName,
          locked: true,
        },
      });
      await this.auditService.record(
        {
          scheduleId: created.id,
          changedByUserId: ctx.userId,
          action: 'schedule.add',
          oldJson: null,
          newJson: JSON.stringify(created),
        },
        tx,
      );
      return created;
    });

    return { id: record.id };
  }

  async lock(params: LockParams, ctx: AuditCtx): Promise<{ updated: number }> {
    let updatedCount = 0;

    await this.db.$transaction(async (tx) => {
      for (const rec of params.records) {
        const scheduleDate = new Date(rec.date + 'T00:00:00Z');
        const records = await tx.laborSchedule.findMany({
          where: {
            usrSystemCompanyId: params.usrSystemCompanyId,
            employeeCode: rec.employeeCode,
            scheduleDate,
          },
        });
        if (records.length > 0) {
          await tx.laborSchedule.updateMany({
            where: {
              usrSystemCompanyId: params.usrSystemCompanyId,
              employeeCode: rec.employeeCode,
              scheduleDate,
            },
            data: { locked: params.locked },
          });
          for (const r of records) {
            await this.auditService.record(
              {
                scheduleId: r.id,
                changedByUserId: ctx.userId,
                action: 'schedule.lock',
                oldJson: JSON.stringify({ locked: r.locked }),
                newJson: JSON.stringify({ locked: params.locked }),
              },
              tx,
            );
          }
          updatedCount += records.length;
        }
      }
    });

    return { updated: updatedCount };
  }

  async clear(
    params: ClearParams,
    ctx: AuditCtx,
  ): Promise<{ deleted: number; lockedSkipped: number }> {
    const startDate = new Date(params.startDate + 'T00:00:00Z');
    const endDate = new Date(params.endDate + 'T00:00:00Z');
    const clearLocked = params.clearLocked ?? false;

    const baseWhere: Prisma.LaborScheduleWhereInput = {
      usrSystemCompanyId: params.usrSystemCompanyId,
      employeeCode: { in: params.employeeCodes },
      scheduleDate: { gte: startDate, lte: endDate },
    };

    let deleted = 0;
    let lockedSkipped = 0;

    await this.db.$transaction(async (tx) => {
      if (clearLocked) {
        const records = await tx.laborSchedule.findMany({ where: baseWhere });
        for (const r of records) {
          await this.auditService.record(
            {
              scheduleId: r.id,
              changedByUserId: ctx.userId,
              action: 'schedule.clear',
              oldJson: JSON.stringify(r),
              newJson: null,
            },
            tx,
          );
        }
        const result = await tx.laborSchedule.deleteMany({ where: baseWhere });
        deleted = result.count;
      } else {
        lockedSkipped = await tx.laborSchedule.count({ where: { ...baseWhere, locked: true } });
        const deleteWhere: Prisma.LaborScheduleWhereInput = {
          ...baseWhere,
          OR: [{ locked: false }, { locked: null }],
        };
        const records = await tx.laborSchedule.findMany({ where: deleteWhere });
        for (const r of records) {
          await this.auditService.record(
            {
              scheduleId: r.id,
              changedByUserId: ctx.userId,
              action: 'schedule.clear',
              oldJson: JSON.stringify(r),
              newJson: null,
            },
            tx,
          );
        }
        const result = await tx.laborSchedule.deleteMany({ where: deleteWhere });
        deleted = result.count;
      }
    });

    return { deleted, lockedSkipped };
  }

  async delete(params: DeleteParams, ctx: AuditCtx): Promise<{ deleted: number }> {
    const startDate = new Date(params.startDate + 'T00:00:00Z');
    const endDate = new Date(params.endDate + 'T00:00:00Z');
    const where: Prisma.LaborScheduleWhereInput = {
      usrSystemCompanyId: params.usrSystemCompanyId,
      employeeCode: { in: params.employeeCodes },
      scheduleDate: { gte: startDate, lte: endDate },
    };

    let deleted = 0;

    await this.db.$transaction(async (tx) => {
      const records = await tx.laborSchedule.findMany({ where });
      for (const r of records) {
        await this.auditService.record(
          {
            scheduleId: r.id,
            changedByUserId: ctx.userId,
            action: 'schedule.delete',
            oldJson: JSON.stringify(r),
            newJson: null,
          },
          tx,
        );
      }
      const result = await tx.laborSchedule.deleteMany({ where });
      deleted = result.count;
    });

    return { deleted };
  }

  async checkLocked(params: CheckLockedParams): Promise<LockedRecord[]> {
    return this.repo.findLocked({
      usrSystemCompanyId: params.usrSystemCompanyId,
      employeeCodes: params.employeeCodes,
      startDate: new Date(params.startDate + 'T00:00:00Z'),
      endDate: new Date(params.endDate + 'T00:00:00Z'),
    });
  }

  async listRosterEmployees(params: ListRosterParams): Promise<RosterEmployee[]> {
    return this.repo.findRosterEmployees(params);
  }

  async updateEmployeePlacement(params: UpdatePlacementParams): Promise<{ updated: number }> {
    const updated = await this.repo.updateEmployeePlacement({
      usrSystemCompanyId: params.usrSystemCompanyId,
      employeeCode: params.employeeCode,
      oldDeptName: params.oldDeptName ?? null,
      oldPositionName: params.oldPositionName ?? null,
      newDeptName: params.newDeptName ?? null,
      newPositionName: params.newPositionName ?? null,
    });
    return { updated };
  }

  async refreshRoster(params: RefreshRosterParams): Promise<{ added: number; removed: number }> {
    let added = 0;
    let removed = 0;

    if (params.newEmployees.length > 0) {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      for (const emp of params.newEmployees) {
        await this.repo.create({
          usrSystemCompanyId: params.usrSystemCompanyId,
          branchId: params.branchId,
          hotelName: params.hotelName,
          employeeCode: emp.code,
          firstName: emp.firstName,
          lastName: emp.lastName,
          scheduleDate: today,
          deptName: emp.deptName ?? null,
          positionName: emp.positionName ?? null,
          tenant: params.tenant,
        });
        added++;
      }
    }

    if (params.removedCodes.length > 0) {
      removed = await this.repo.deleteByEmployeeCodes({
        usrSystemCompanyId: params.usrSystemCompanyId,
        employeeCodes: params.removedCodes,
      });
    }

    return { added, removed };
  }

  async previewRefresh(params: PreviewRefreshParams): Promise<PreviewRefreshResult> {
    const [payrollEmployees, currentEmployees] = await Promise.all([
      this.payrollRepo.findEmployees(params.usrSystemCompanyId),
      this.repo.findCurrentEmployees({ usrSystemCompanyId: params.usrSystemCompanyId }),
    ]);

    const currentCodes = new Set(currentEmployees.map((e) => e.employeeCode));
    const payrollCodes = new Set(payrollEmployees.map((e) => e.employeeCode));

    const newEmployees: RefreshEmployee[] = payrollEmployees
      .filter((e) => !currentCodes.has(e.employeeCode))
      .map((e) => ({
        code: e.employeeCode,
        firstName: e.firstName,
        lastName: e.lastName,
        deptName: e.deptName,
        positionName: e.positionName,
      }));

    const seenCodes = new Set<string>();
    const removedEmployees: RefreshEmployee[] = currentEmployees
      .filter((e) => !payrollCodes.has(e.employeeCode))
      .filter((e) => {
        if (seenCodes.has(e.employeeCode)) return false;
        seenCodes.add(e.employeeCode);
        return true;
      })
      .map((e) => ({
        code: e.employeeCode,
        firstName: e.firstName ?? '',
        lastName: e.lastName ?? '',
        deptName: e.deptName,
        positionName: e.positionName,
      }));

    return { newEmployees, removedEmployees };
  }
}

export function makeScheduleService(
  repo: SchedulesRepo = makeSchedulesRepo(),
  db: PrismaClient = prisma,
  payrollRepo: PayrollRepo = makePayrollRepo(),
  auditService: AuditService = makeAuditService(),
): ScheduleService {
  return new ScheduleService(repo, db, payrollRepo, auditService);
}
