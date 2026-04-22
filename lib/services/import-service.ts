import { SchedulesRepo, makeSchedulesRepo } from '../repositories/schedules-repo';

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
}

export interface CommitResult {
  inserted: number;
  updated: number;
  skipped: number;
}

export class ImportService {
  constructor(private readonly repo: SchedulesRepo) {}

  // Phase 9 wires this to HTTP and fills the implementation.
  async commit(_parsed: ParsedRow[], _opts: CommitOptions): Promise<CommitResult> {
    throw new Error('import-service.commit: not yet implemented — Phase 9');
  }
}

export function makeImportService(repo: SchedulesRepo = makeSchedulesRepo()): ImportService {
  return new ImportService(repo);
}
