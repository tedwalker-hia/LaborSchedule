import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';

export interface LockedRecord {
  employeeCode: string;
  firstName: string | null;
  lastName: string | null;
  lockedCount: number;
}

export class SchedulesRepo {
  constructor(private readonly db: Prisma.TransactionClient = prisma) {}

  async findByHotelDate(params: {
    usrSystemCompanyId: string;
    hotelName: string;
    startDate: Date;
    endDate: Date;
    deptName?: string;
    /** Restricts to a set of departments (e.g. DeptAdmin access list). Takes precedence over deptName. */
    deptNames?: string[];
    positionName?: string;
  }) {
    const { usrSystemCompanyId, hotelName, startDate, endDate, deptName, deptNames, positionName } =
      params;

    const where: Prisma.LaborScheduleWhereInput = {
      usrSystemCompanyId,
      hotelName,
      scheduleDate: { gte: startDate, lte: endDate },
    };

    if (deptNames !== undefined) {
      where.deptName = { in: deptNames };
    } else if (deptName !== undefined) {
      where.deptName = deptName;
    }

    if (positionName !== undefined) {
      where.positionName = positionName;
    }

    return this.db.laborSchedule.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { scheduleDate: 'asc' }],
    });
  }

  async findDistinctDepts(params: { usrSystemCompanyId: string; hotelName: string }) {
    return this.db.laborSchedule.findMany({
      distinct: ['deptName'],
      where: {
        usrSystemCompanyId: params.usrSystemCompanyId,
        hotelName: params.hotelName,
        deptName: { not: '' },
      },
      select: { deptName: true },
    });
  }

  async findDistinctPositions(params: { usrSystemCompanyId: string; hotelName: string }) {
    return this.db.laborSchedule.findMany({
      distinct: ['positionName'],
      where: {
        usrSystemCompanyId: params.usrSystemCompanyId,
        hotelName: params.hotelName,
        positionName: { not: '' },
      },
      select: { positionName: true },
    });
  }

  async findPositionsByDept(params: { usrSystemCompanyId: string; hotelName: string }) {
    return this.db.laborSchedule.groupBy({
      by: ['deptName', 'positionName'],
      where: {
        usrSystemCompanyId: params.usrSystemCompanyId,
        hotelName: params.hotelName,
        deptName: { not: '' },
        positionName: { not: '' },
      },
    });
  }

  async findFirst(where: {
    usrSystemCompanyId: string;
    employeeCode: string;
    scheduleDate: Date;
    positionName?: string | null;
  }) {
    return this.db.laborSchedule.findFirst({ where });
  }

  async create(data: Prisma.LaborScheduleCreateInput) {
    return this.db.laborSchedule.create({ data });
  }

  async deleteById(id: number) {
    return this.db.laborSchedule.delete({ where: { id } });
  }

  /** Sets locked flag for all records matching a single employee+date pair. */
  async updateLocked(params: {
    usrSystemCompanyId: string;
    employeeCode: string;
    scheduleDate: Date;
    locked: boolean;
  }): Promise<number> {
    const result = await this.db.laborSchedule.updateMany({
      where: {
        usrSystemCompanyId: params.usrSystemCompanyId,
        employeeCode: params.employeeCode,
        scheduleDate: params.scheduleDate,
      },
      data: { locked: params.locked },
    });
    return result.count;
  }

  async clearRange(params: {
    usrSystemCompanyId: string;
    employeeCodes: string[];
    startDate: Date;
    endDate: Date;
    clearLocked: boolean;
  }): Promise<{ deleted: number; lockedSkipped: number }> {
    const { usrSystemCompanyId, employeeCodes, startDate, endDate, clearLocked } = params;

    const baseWhere: Prisma.LaborScheduleWhereInput = {
      usrSystemCompanyId,
      employeeCode: { in: employeeCodes },
      scheduleDate: { gte: startDate, lte: endDate },
    };

    if (clearLocked) {
      const result = await this.db.laborSchedule.deleteMany({ where: baseWhere });
      return { deleted: result.count, lockedSkipped: 0 };
    }

    const lockedSkipped = await this.db.laborSchedule.count({
      where: { ...baseWhere, locked: true },
    });

    const result = await this.db.laborSchedule.deleteMany({
      where: { ...baseWhere, OR: [{ locked: false }, { locked: null }] },
    });

    return { deleted: result.count, lockedSkipped };
  }

  async deleteRange(params: {
    usrSystemCompanyId: string;
    employeeCodes: string[];
    startDate: Date;
    endDate: Date;
  }): Promise<number> {
    const result = await this.db.laborSchedule.deleteMany({
      where: {
        usrSystemCompanyId: params.usrSystemCompanyId,
        employeeCode: { in: params.employeeCodes },
        scheduleDate: { gte: params.startDate, lte: params.endDate },
      },
    });
    return result.count;
  }

  async findLocked(params: {
    usrSystemCompanyId: string;
    employeeCodes: string[];
    startDate: Date;
    endDate: Date;
  }): Promise<LockedRecord[]> {
    const records = await this.db.laborSchedule.groupBy({
      by: ['employeeCode', 'firstName', 'lastName'],
      where: {
        usrSystemCompanyId: params.usrSystemCompanyId,
        employeeCode: { in: params.employeeCodes },
        scheduleDate: { gte: params.startDate, lte: params.endDate },
        locked: true,
      },
      _count: { id: true },
    });

    return records.map((r) => ({
      employeeCode: r.employeeCode,
      firstName: r.firstName,
      lastName: r.lastName,
      lockedCount: r._count.id,
    }));
  }

  async findRosterEmployees(params: {
    usrSystemCompanyId: string;
    hotelName: string;
  }): Promise<{ employeeCode: string; firstName: string | null; lastName: string | null }[]> {
    const rows = await this.db.laborSchedule.groupBy({
      by: ['employeeCode', 'firstName', 'lastName'],
      where: { hotelName: params.hotelName, usrSystemCompanyId: params.usrSystemCompanyId },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return rows.map((r) => ({
      employeeCode: r.employeeCode,
      firstName: r.firstName,
      lastName: r.lastName,
    }));
  }

  async findCurrentEmployees(params: { usrSystemCompanyId: string }): Promise<
    {
      employeeCode: string;
      firstName: string | null;
      lastName: string | null;
      deptName: string | null;
      positionName: string | null;
    }[]
  > {
    const rows = await this.db.laborSchedule.groupBy({
      by: ['employeeCode', 'firstName', 'lastName', 'deptName', 'positionName'],
      where: { usrSystemCompanyId: params.usrSystemCompanyId },
    });
    return rows.map((r) => ({
      employeeCode: r.employeeCode,
      firstName: r.firstName,
      lastName: r.lastName,
      deptName: r.deptName,
      positionName: r.positionName,
    }));
  }

  async updateEmployeePlacement(params: {
    usrSystemCompanyId: string;
    employeeCode: string;
    oldDeptName: string | null;
    oldPositionName: string | null;
    newDeptName: string | null;
    newPositionName: string | null;
  }): Promise<number> {
    const result = await this.db.laborSchedule.updateMany({
      where: {
        usrSystemCompanyId: params.usrSystemCompanyId,
        employeeCode: params.employeeCode,
        deptName: params.oldDeptName,
        positionName: params.oldPositionName,
      },
      data: {
        deptName: params.newDeptName,
        positionName: params.newPositionName,
      },
    });
    return result.count;
  }

  async deleteByEmployeeCodes(params: {
    usrSystemCompanyId: string;
    employeeCodes: string[];
  }): Promise<number> {
    const result = await this.db.laborSchedule.deleteMany({
      where: {
        usrSystemCompanyId: params.usrSystemCompanyId,
        employeeCode: { in: params.employeeCodes },
      },
    });
    return result.count;
  }
}

export function makeSchedulesRepo(db: Prisma.TransactionClient = prisma): SchedulesRepo {
  return new SchedulesRepo(db);
}
