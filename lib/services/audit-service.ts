import { Prisma } from '@prisma/client';
import { AuditRepo, InsertAuditRow, makeAuditRepo } from '../repositories/audit-repo';
import { config } from '../config';

export interface AuditCtx {
  userId: number;
  source: 'api' | 'worker';
}

export type RecordArgs = InsertAuditRow;

export class AuditService {
  constructor(private readonly repo: AuditRepo) {}

  async record(args: RecordArgs, tx?: Prisma.TransactionClient): Promise<void> {
    if (!config.AUDIT_ENABLED) return;
    const repo = tx ? makeAuditRepo(tx) : this.repo;
    await repo.insert(args);
  }
}

export function makeAuditService(repo: AuditRepo = makeAuditRepo()): AuditService {
  return new AuditService(repo);
}
