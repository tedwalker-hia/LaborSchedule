/**
 * Import parity harness. Spins a Testcontainers MSSQL instance, imports each
 * workbook from tests/fixtures/excel/, and checks resulting HIALaborSchedules
 * rows against committed baselines.
 *
 * Usage:
 *   node --experimental-strip-types scripts/import-parity.ts            # diff check
 *   node --experimental-strip-types scripts/import-parity.ts --capture  # write baselines
 *
 * Keep out of the default test run — invoke explicitly via:
 *   npm run parity:import
 *   npm run parity:import -- --capture
 */

import { execSync } from 'node:child_process';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GenericContainer, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';
import { PrismaClient } from '@prisma/client';
import { parseWorkbook } from '../lib/excel/parser.ts';
import { makeImportService } from '../lib/services/import-service.ts';
import type { ParsedRow } from '../lib/services/import-service.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const EXCEL_DIR = join(ROOT, 'tests', 'fixtures', 'excel');
const BASELINES_DIR = join(EXCEL_DIR, 'baselines');

const SA_PASSWORD = process.env.TEST_DB_SA_PASSWORD ?? 'IntTest_Pa55w!';
const TEST_DB = 'ParityTest';
const CAPTURE = process.argv.includes('--capture');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CanonicalRow {
  employeeCode: string;
  scheduleDate: string;
  positionName: string | null;
  clockIn: string | null;
  clockOut: string | null;
  hours: string | null;
  deptName: string | null;
  firstName: string | null;
  lastName: string | null;
  hotelName: string | null;
  tenant: string | null;
  branchId: number | null;
  locked: boolean | null;
}

interface Baseline {
  workbook: string;
  usrSystemCompanyId: string;
  rows: CanonicalRow[];
}

// Subset of Prisma LaborSchedule we read back for canonicalization
interface DbRow {
  employeeCode: string;
  scheduleDate: Date;
  positionName: string | null;
  clockIn: string | null;
  clockOut: string | null;
  hours: { toString(): string } | null;
  deptName: string | null;
  firstName: string | null;
  lastName: string | null;
  hotelName: string | null;
  tenant: string | null;
  branchId: number | null;
  locked: boolean | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function workbookCompanyId(filename: string): string {
  const stem = filename.replace(/\.xlsx$/i, '');
  return `PARITY_${stem}`.slice(0, 100);
}

function canonicalizeRows(rows: DbRow[]): CanonicalRow[] {
  return rows
    .map((r) => ({
      employeeCode: r.employeeCode,
      scheduleDate: r.scheduleDate.toISOString().split('T')[0]!,
      positionName: r.positionName ?? null,
      clockIn: r.clockIn ?? null,
      clockOut: r.clockOut ?? null,
      hours: r.hours != null ? Number(r.hours).toFixed(2) : null,
      deptName: r.deptName ?? null,
      firstName: r.firstName ?? null,
      lastName: r.lastName ?? null,
      hotelName: r.hotelName ?? null,
      tenant: r.tenant ?? null,
      branchId: r.branchId ?? null,
      locked: r.locked ?? null,
    }))
    .sort((a, b) => {
      const byEmp = a.employeeCode.localeCompare(b.employeeCode);
      if (byEmp !== 0) return byEmp;
      const byDate = a.scheduleDate.localeCompare(b.scheduleDate);
      if (byDate !== 0) return byDate;
      return (a.positionName ?? '').localeCompare(b.positionName ?? '');
    });
}

function lineDiff(expected: string, actual: string): string {
  const expLines = expected.split('\n');
  const actLines = actual.split('\n');
  const len = Math.max(expLines.length, actLines.length);
  const out: string[] = [];
  for (let i = 0; i < len; i++) {
    const e = expLines[i] ?? '';
    const a = actLines[i] ?? '';
    if (e !== a) {
      out.push(`- ${e}`);
      out.push(`+ ${a}`);
    }
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Container lifecycle
// ---------------------------------------------------------------------------

async function startContainer(): Promise<{
  container: StartedTestContainer;
  databaseUrl: string;
}> {
  console.log('Starting MSSQL container...');

  const container = await new GenericContainer('mcr.microsoft.com/mssql/server:2022-latest')
    .withEnvironment({
      ACCEPT_EULA: 'Y',
      MSSQL_SA_PASSWORD: SA_PASSWORD,
      MSSQL_PID: 'Developer',
    })
    .withExposedPorts(1433)
    .withWaitStrategy(Wait.forLogMessage('SQL Server is now ready for client connections'))
    .withStartupTimeout(90_000)
    .start();

  const port = container.getMappedPort(1433);

  let dbCreated = false;
  for (let attempt = 0; attempt < 10 && !dbCreated; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000));
    const result = await container.exec([
      '/opt/mssql-tools18/bin/sqlcmd',
      '-S',
      'localhost,1433',
      '-U',
      'sa',
      '-P',
      SA_PASSWORD,
      '-Q',
      `CREATE DATABASE [${TEST_DB}]`,
      '-C',
    ]);
    dbCreated = result.exitCode === 0;
  }
  if (!dbCreated) throw new Error('Failed to create parity test database after retries');

  const databaseUrl =
    `sqlserver://localhost:${port};database=${TEST_DB};` +
    `user=sa;password=${SA_PASSWORD};encrypt=false;trustServerCertificate=true`;

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
    cwd: ROOT,
  });

  return { container, databaseUrl };
}

// ---------------------------------------------------------------------------
// Per-workbook processing
// ---------------------------------------------------------------------------

async function processWorkbook(
  xlsxPath: string,
  db: PrismaClient,
): Promise<{ usrSystemCompanyId: string; rows: CanonicalRow[] }> {
  const filename = basename(xlsxPath);
  const usrSystemCompanyId = workbookCompanyId(filename);

  const buffer = await readFile(xlsxPath);
  const preview = await parseWorkbook(buffer);

  const parsedRows: ParsedRow[] = preview.records.map((r) => ({
    employeeCode: r.employeeCode,
    firstName: r.firstName || null,
    lastName: r.lastName || null,
    date: r.date,
    clockIn: r.clockIn || null,
    clockOut: r.clockOut || null,
    deptName: r.deptName || null,
    positionName: r.positionName || null,
  }));

  const svc = makeImportService(undefined, db);
  await svc.commit(parsedRows, { usrSystemCompanyId, overwriteLocked: false });

  const dbRows = await db.laborSchedule.findMany({
    where: { usrSystemCompanyId },
    select: {
      employeeCode: true,
      scheduleDate: true,
      positionName: true,
      clockIn: true,
      clockOut: true,
      hours: true,
      deptName: true,
      firstName: true,
      lastName: true,
      hotelName: true,
      tenant: true,
      branchId: true,
      locked: true,
    },
  });

  return { usrSystemCompanyId, rows: canonicalizeRows(dbRows as DbRow[]) };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const xlsxFiles = (await readdir(EXCEL_DIR)).filter((f) => f.endsWith('.xlsx')).sort();

  if (xlsxFiles.length === 0) {
    console.error('No .xlsx fixtures found in', EXCEL_DIR);
    console.error('Run first: npm run fixtures:generate');
    process.exitCode = 1;
    return;
  }

  console.log(`Found ${xlsxFiles.length} workbooks. Mode: ${CAPTURE ? 'capture' : 'check'}`);
  console.log();

  const { container, databaseUrl } = await startContainer();
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  await mkdir(BASELINES_DIR, { recursive: true });

  const failures: string[] = [];

  try {
    for (const filename of xlsxFiles) {
      process.stdout.write(`  ${filename} ... `);

      let result: Awaited<ReturnType<typeof processWorkbook>>;
      try {
        result = await processWorkbook(join(EXCEL_DIR, filename), db);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`ERROR: ${msg}`);
        failures.push(`${filename}: ${msg}`);
        continue;
      }

      const { usrSystemCompanyId, rows } = result;
      const baselinePath = join(BASELINES_DIR, filename.replace('.xlsx', '.json'));

      if (CAPTURE) {
        const baseline: Baseline = { workbook: filename, usrSystemCompanyId, rows };
        await writeFile(baselinePath, JSON.stringify(baseline, null, 2) + '\n');
        console.log(`captured (${rows.length} rows)`);
      } else {
        if (!existsSync(baselinePath)) {
          console.log('FAIL — no baseline (run: npm run parity:import -- --capture)');
          failures.push(`${filename}: missing baseline`);
          continue;
        }

        const baseline: Baseline = JSON.parse(await readFile(baselinePath, 'utf-8'));
        const actual = JSON.stringify(rows, null, 2);
        const expected = JSON.stringify(baseline.rows, null, 2);

        if (actual === expected) {
          console.log(`ok (${rows.length} rows)`);
        } else {
          console.log(`FAIL (${rows.length} rows vs baseline ${baseline.rows.length})`);
          const diff = lineDiff(expected, actual);
          const diffLines = diff
            .split('\n')
            .slice(0, 40)
            .map((l) => '    ' + l)
            .join('\n');
          console.error(`  diff (- expected  + actual):\n${diffLines}`);
          if (diff.split('\n').length > 40) console.error('  ... (truncated)');
          failures.push(filename);
        }
      }
    }
  } finally {
    await db.$disconnect();
    await container.stop();
  }

  console.log();
  if (CAPTURE) {
    console.log(`Baselines written for ${xlsxFiles.length} workbooks → ${BASELINES_DIR}`);
  } else if (failures.length > 0) {
    console.error(`${failures.length}/${xlsxFiles.length} workbooks failed parity check:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log(`All ${xlsxFiles.length} workbooks passed parity check.`);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
