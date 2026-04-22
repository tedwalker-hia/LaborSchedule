import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';

export interface InsertAuditRow {
  scheduleId: number;
  changedByUserId?: number | null;
  action: string;
  oldJson?: string | null;
  newJson?: string | null;
}

export class AuditRepo {
  constructor(private readonly db: Prisma.TransactionClient = prisma) {}

  async insert(row: InsertAuditRow) {
    return this.db.laborScheduleAudit.create({ data: row });
  }
}

export function makeAuditRepo(db: Prisma.TransactionClient = prisma): AuditRepo {
  return new AuditRepo(db);
}
