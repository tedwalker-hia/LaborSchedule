/**
 * Integration tests for ExportService.
 *
 * export() is a Phase 10 stub that always throws "not yet implemented".
 * These tests document the expected stub behavior and will fail intentionally
 * when Phase 10 fills in the implementation — serving as a reminder to update
 * these tests at that time.
 *
 * No DB isolation prefix needed: the stub writes nothing to the database.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ExportService, makeExportService, ExportParams } from '@/lib/services/export-service';

let svc: ExportService;

beforeAll(() => {
  const prisma = new PrismaClient();
  svc = makeExportService(prisma as any);
});

const baseParams: ExportParams = {
  usrSystemCompanyId: 'INTTEST_EXP',
  startDate: '2025-06-01',
  endDate: '2025-06-07',
};

// ─── export (stub) ────────────────────────────────────────────────────────────

describe('ExportService.export', () => {
  it('throws "not yet implemented" with standard params (Phase 10 stub)', async () => {
    await expect(svc.export(baseParams)).rejects.toThrow(
      'export-service.export: not yet implemented — Phase 10',
    );
  });

  it('throws even with optional filters provided', async () => {
    await expect(
      svc.export({
        ...baseParams,
        employeeCodes: ['EEXP01', 'EEXP02'],
        hotel: 'Test Hotel',
        tenant: 'TestTenant',
      }),
    ).rejects.toThrow('export-service.export: not yet implemented — Phase 10');
  });
});
