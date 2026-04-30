import { SchedulesRepo, makeSchedulesRepo } from '../repositories/schedules-repo';

export interface ExportParams {
  usrSystemCompanyId: string;
  hotel?: string | null;
  branchId?: number | null;
  tenant?: string | null;
  startDate: string;
  endDate: string;
  employeeCodes?: string[];
}

export interface ExportResult {
  rows: ExportRow[];
}

export interface ExportRow {
  employeeCode: string;
  firstName?: string | null;
  lastName?: string | null;
  date: string;
  clockIn?: string | null;
  clockOut?: string | null;
  hours?: number | null;
  deptName?: string | null;
  positionName?: string | null;
  locked: boolean;
}

export interface ExportData {
  employees: Array<{
    code: string;
    firstName: string | null;
    lastName: string | null;
    deptName: string | null;
    positionName: string | null;
  }>;
  schedule: Array<{
    employeeCode: string;
    positionName: string | null;
    scheduleDate: Date;
    clockIn: string | null;
    clockOut: string | null;
    hours: number | null;
  }>;
}

export class ExportService {
  constructor(private readonly repo: SchedulesRepo = makeSchedulesRepo()) {}

  async getExportData(params: {
    usrSystemCompanyId: string;
    hotelName: string;
    startDate: Date;
    endDate: Date;
    dept?: string;
    position?: string;
  }): Promise<ExportData> {
    const rows = await this.repo.findByHotelDate({
      usrSystemCompanyId: params.usrSystemCompanyId,
      hotelName: params.hotelName,
      startDate: params.startDate,
      endDate: params.endDate,
      deptName: params.dept,
      positionName: params.position,
    });

    // Build unique (employee, position) list — one row per (code, position)
    // to mirror the grid's multi-position handling.
    const employeeMap = new Map<
      string,
      {
        code: string;
        firstName: string | null;
        lastName: string | null;
        deptName: string | null;
        positionName: string | null;
      }
    >();

    for (const row of rows) {
      const key = `${row.employeeCode}|${row.positionName ?? ''}`;
      if (!employeeMap.has(key)) {
        employeeMap.set(key, {
          code: row.employeeCode,
          firstName: row.firstName,
          lastName: row.lastName,
          deptName: row.deptName,
          positionName: row.positionName,
        });
      }
    }

    const employees = Array.from(employeeMap.values()).sort((a, b) => {
      const lastCmp = (a.lastName ?? '').localeCompare(b.lastName ?? '');
      if (lastCmp !== 0) return lastCmp;
      const firstCmp = (a.firstName ?? '').localeCompare(b.firstName ?? '');
      if (firstCmp !== 0) return firstCmp;
      return (a.positionName ?? '').localeCompare(b.positionName ?? '');
    });

    const schedule = rows.map((row) => ({
      employeeCode: row.employeeCode,
      positionName: row.positionName,
      scheduleDate: row.scheduleDate,
      clockIn: row.clockIn,
      clockOut: row.clockOut,
      hours: row.hours ? Number(row.hours) : null,
    }));

    return { employees, schedule };
  }

  // Phase 10 wires this to HTTP and fills the implementation.
  async export(_params: ExportParams): Promise<ExportResult> {
    throw new Error('export-service.export: not yet implemented — Phase 10');
  }
}

export function makeExportService(repo: SchedulesRepo = makeSchedulesRepo()): ExportService {
  return new ExportService(repo);
}
