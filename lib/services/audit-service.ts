import { AuditRepo, InsertAuditRow, makeAuditRepo } from '../repositories/audit-repo';

export type RecordArgs = InsertAuditRow;

export class AuditService {
  constructor(private readonly repo: AuditRepo) {}

  // Phase 8 threads this through all mutating services.
  async record(_args: RecordArgs): Promise<void> {
    // no-op stub
  }
}

export function makeAuditService(repo: AuditRepo = makeAuditRepo()): AuditService {
  return new AuditService(repo);
}
