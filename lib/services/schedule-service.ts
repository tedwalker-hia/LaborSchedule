import { PrismaClient, Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import {
  SchedulesRepo,
  makeSchedulesRepo,
  type LockedRecord,
} from '../repositories/schedules-repo';
import { PayrollRepo, makePayrollRepo } from '../repositories/payroll-repo';
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
  ) {}

  /**
   * Saves a batch of schedule changes. Each change is a delete-then-insert if
   * the record exists with different values. All mutations run in a single
   * prisma.$transaction batched-array call so partial failures roll back.
   */
  async save(params: SaveParams): Promise<SaveResult> {
    const { usrSystemCompanyId, hotel, branchId, tenant, changes } = params;
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const change of changes) {
      const scheduleDate = new Date(change.date + 'T00:00:00Z');
      const existing = await this.repo.findFirst({
        usrSystemCompanyId,
        employeeCode: change.employeeCode,
        scheduleDate,
      });

      const clockIn = change.clockIn || null;
      const clockOut = change.clockOut || null;
      const isClearing = !clockIn && !clockOut;
      const hours = clockIn && clockOut ? calcHours(clockIn, clockOut) : null;

      if (existing) {
        const sameClockIn = (existing.clockIn ?? null) === clockIn;
        const sameClockOut = (existing.clockOut ?? null) === clockOut;
        if (sameClockIn && sameClockOut) {
          skipped++;
          continue;
        }

        ops.push(this.db.laborSchedule.delete({ where: { id: existing.id } }));
        ops.push(
          this.db.laborSchedule.create({
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
          }),
        );
        updated++;
      } else {
        ops.push(
          this.db.laborSchedule.create({
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
          }),
        );
        inserted++;
      }
    }

    if (ops.length > 0) {
      await this.db.$transaction(ops);
    }

    return { inserted, updated, skipped };
  }

  /** Manually adds a single schedule record. Auto-locks the record. Throws DuplicateScheduleError if one already exists for this employee+date+position. */
  async add(params: AddParams): Promise<{ id: number }> {
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

    const record = await this.repo.create({
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
    });

    return { id: record.id };
  }

  async lock(params: LockParams): Promise<{ updated: number }> {
    let updatedCount = 0;
    for (const rec of params.records) {
      const scheduleDate = new Date(rec.date + 'T00:00:00Z');
      const count = await this.repo.updateLocked({
        usrSystemCompanyId: params.usrSystemCompanyId,
        employeeCode: rec.employeeCode,
        scheduleDate,
        locked: params.locked,
      });
      updatedCount += count;
    }
    return { updated: updatedCount };
  }

  async clear(params: ClearParams): Promise<{ deleted: number; lockedSkipped: number }> {
    return this.repo.clearRange({
      usrSystemCompanyId: params.usrSystemCompanyId,
      employeeCodes: params.employeeCodes,
      startDate: new Date(params.startDate + 'T00:00:00Z'),
      endDate: new Date(params.endDate + 'T00:00:00Z'),
      clearLocked: params.clearLocked ?? false,
    });
  }

  async delete(params: DeleteParams): Promise<{ deleted: number }> {
    const deleted = await this.repo.deleteRange({
      usrSystemCompanyId: params.usrSystemCompanyId,
      employeeCodes: params.employeeCodes,
      startDate: new Date(params.startDate + 'T00:00:00Z'),
      endDate: new Date(params.endDate + 'T00:00:00Z'),
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
): ScheduleService {
  return new ScheduleService(repo, db, payrollRepo);
}
