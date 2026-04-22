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

export class ExportService {
  constructor(private readonly repo: SchedulesRepo) {}

  // Phase 10 wires this to HTTP and fills the implementation.
  async export(_params: ExportParams): Promise<ExportResult> {
    throw new Error('export-service.export: not yet implemented — Phase 10');
  }
}

export function makeExportService(repo: SchedulesRepo = makeSchedulesRepo()): ExportService {
  return new ExportService(repo);
}
