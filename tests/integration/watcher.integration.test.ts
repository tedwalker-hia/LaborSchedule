/**
 * Integration tests for workers/watcher.ts processXlsx against a real DB.
 *
 * Uses the shared testcontainers MSSQL setup from setup.ts (DATABASE_URL injected
 * via globalSetup → env-setup.ts). Run with: npm run test:integration
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { processXlsx, type ProcessFileOpts } from '@/workers/watcher';
import { makeImportService } from '@/lib/services/import-service';

const COMPANY_ID = 'INTTEST_WATCHER_001';

let prisma: PrismaClient;
let watchDir: string;

beforeAll(async () => {
  prisma = new PrismaClient();
  watchDir = await fs.mkdtemp(path.join(os.tmpdir(), 'watcher-test-'));
});

afterEach(async () => {
  await prisma.laborScheduleAudit.deleteMany({
    where: { schedule: { usrSystemCompanyId: COMPANY_ID } },
  });
  await prisma.laborSchedule.deleteMany({ where: { usrSystemCompanyId: COMPANY_ID } });
  const entries = await fs.readdir(watchDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      await fs.rm(path.join(watchDir, entry.name), { recursive: true });
    } else {
      await fs.unlink(path.join(watchDir, entry.name));
    }
  }
});

afterAll(async () => {
  await prisma.$disconnect();
  await fs.rm(watchDir, { recursive: true, force: true });
});

async function makeScheduleWorkbook(filePath: string): Promise<string> {
  const now = new Date();
  const month = now.toLocaleString('en-US', { month: 'short' });
  const day = String(now.getDate()).padStart(2, '0');

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Labor Schedule');

  ws.getCell(1, 1).value = 'Name';
  ws.getCell(1, 2).value = 'Code';
  ws.getCell(1, 3).value = 'Dept';
  ws.getCell(1, 4).value = 'Position';
  ws.getCell(1, 5).value = 'Total';
  ws.getCell(1, 6).value = `${month} ${day}`;

  ws.getCell(2, 6).value = 'In';
  ws.getCell(2, 7).value = 'Out';
  ws.getCell(2, 8).value = 'Hrs';

  ws.getCell(3, 1).value = 'Watcher, Test';
  ws.getCell(3, 2).value = 'WATCHER01';
  ws.getCell(3, 3).value = 'Test Dept';
  ws.getCell(3, 4).value = 'Test Position';
  ws.getCell(3, 5).value = 8;
  ws.getCell(3, 6).value = '09:00';
  ws.getCell(3, 7).value = '17:00';
  ws.getCell(3, 8).value = 8;

  await wb.xlsx.writeFile(filePath);
  return now.toISOString().split('T')[0]!;
}

describe('processXlsx', () => {
  it('inserts DB rows and moves file to processed/<date>/', async () => {
    const filePath = path.join(watchDir, 'schedule.xlsx');
    const dateStr = await makeScheduleWorkbook(filePath);

    const svc = makeImportService();
    const opts: ProcessFileOpts = { companyId: COMPANY_ID, watchDir };

    await processXlsx(filePath, opts, svc);

    // Source file must be gone
    await expect(fs.access(filePath)).rejects.toThrow();

    // File moved to processed/<date>/
    const dest = path.join(watchDir, 'processed', dateStr, 'schedule.xlsx');
    await expect(fs.access(dest)).resolves.toBeUndefined();

    // Row inserted with SYSTEM_WORKER userId (null)
    const rows = await prisma.laborSchedule.findMany({
      where: { usrSystemCompanyId: COMPANY_ID, employeeCode: 'WATCHER01' },
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]!.clockIn).toBe('09:00');
    expect(rows[0]!.clockOut).toBe('17:00');
  });

  it('moves corrupt file to imported/errors/ with .error.json sidecar', async () => {
    const filePath = path.join(watchDir, 'bad.xlsx');
    await fs.writeFile(filePath, Buffer.from('not an xlsx'));

    const svc = makeImportService();
    const opts: ProcessFileOpts = { companyId: COMPANY_ID, watchDir };

    await processXlsx(filePath, opts, svc);

    // Source file must be gone
    await expect(fs.access(filePath)).rejects.toThrow();

    // File moved to errors/
    const errFile = path.join(watchDir, 'imported', 'errors', 'bad.xlsx');
    await expect(fs.access(errFile)).resolves.toBeUndefined();

    // .error.json sidecar exists and is parseable
    const sidecarPath = path.join(watchDir, 'imported', 'errors', 'bad.xlsx.error.json');
    const raw = await fs.readFile(sidecarPath, 'utf-8');
    const sidecar = JSON.parse(raw) as { file: string; timestamp: string; error: string };
    expect(sidecar.file).toBe('bad.xlsx');
    expect(sidecar.error).toBeTruthy();
    expect(sidecar.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // No DB rows inserted
    const rows = await prisma.laborSchedule.findMany({
      where: { usrSystemCompanyId: COMPANY_ID },
    });
    expect(rows).toHaveLength(0);
  });

  it('audit trail has null changedByUserId for worker imports', async () => {
    const filePath = path.join(watchDir, 'audit-check.xlsx');
    await makeScheduleWorkbook(filePath);

    const svc = makeImportService();
    const opts: ProcessFileOpts = { companyId: COMPANY_ID, watchDir };

    await processXlsx(filePath, opts, svc);

    const auditRows = await prisma.laborScheduleAudit.findMany({
      where: {
        schedule: { usrSystemCompanyId: COMPANY_ID },
        action: 'import_insert',
      },
    });
    expect(auditRows.length).toBeGreaterThanOrEqual(1);
    expect(auditRows[0]!.changedByUserId).toBeNull();
  });
});
