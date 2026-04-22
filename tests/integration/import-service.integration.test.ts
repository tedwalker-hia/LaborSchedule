/**
 * Integration tests for ImportService.
 *
 * commit() is a Phase 9 stub that always throws "not yet implemented".
 * These tests document the expected stub behavior and will fail intentionally
 * when Phase 9 fills in the implementation — serving as a reminder to update
 * these tests at that time.
 *
 * No DB isolation prefix needed: the stub writes nothing to the database.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  ImportService,
  makeImportService,
  ParsedRow,
  CommitOptions,
} from '@/lib/services/import-service';

let svc: ImportService;

beforeAll(() => {
  const prisma = new PrismaClient();
  svc = makeImportService(prisma as any);
});

const baseOpts: CommitOptions = {
  usrSystemCompanyId: 'INTTEST_IMP',
};

const sampleRow: ParsedRow = {
  employeeCode: 'EIMP01',
  date: '2025-06-01',
  clockIn: '8:00 AM',
  clockOut: '4:00 PM',
};

// ─── commit (stub) ────────────────────────────────────────────────────────────

describe('ImportService.commit', () => {
  it('throws "not yet implemented" for a non-empty payload (Phase 9 stub)', async () => {
    await expect(svc.commit([sampleRow], baseOpts)).rejects.toThrow(
      'import-service.commit: not yet implemented — Phase 9',
    );
  });

  it('throws even for an empty parsed array', async () => {
    await expect(svc.commit([], baseOpts)).rejects.toThrow(
      'import-service.commit: not yet implemented — Phase 9',
    );
  });
});
