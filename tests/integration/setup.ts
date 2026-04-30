/**
 * Vitest globalSetup — Testcontainers MSSQL harness.
 *
 * Lifecycle (runs once per `vitest --config vitest.config.integration.ts` run):
 *   setup()    → start MSSQL container, run migrations, seed fixtures, provide DATABASE_URL
 *   teardown() → stop container
 *
 * env-setup.ts (setupFiles) reads DATABASE_URL via inject() and writes it to
 * process.env so the Prisma singleton picks it up in each test worker.
 */
import { execSync } from 'child_process';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { GenericContainer, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';
import { PrismaClient } from '@prisma/client';

const SA_PASSWORD = process.env.TEST_DB_SA_PASSWORD ?? 'IntTest_Pa55w!';
const TEST_DB = 'LaborScheduleIntTest';

type FixtureRecord = {
  usrSystemCompanyId: string;
  employeeCode: string;
  scheduleDate: string;
  firstName?: string;
  lastName?: string;
  hotelName?: string;
  tenant?: string;
  deptName?: string;
  positionName?: string;
  clockIn?: string;
  clockOut?: string;
  hours?: number;
};

let startedContainer: StartedTestContainer | undefined;

// project is the TestProject instance passed by Vitest 4's globalSetup runner.
// In Vitest 4, `provide` is a method on this object rather than a free function
// imported from 'vitest/node'.
export async function setup(project: {
  provide: (key: string, value: string) => void;
}): Promise<void> {
  startedContainer = await new GenericContainer('mcr.microsoft.com/mssql/server:2022-latest')
    .withEnvironment({
      ACCEPT_EULA: 'Y',
      MSSQL_SA_PASSWORD: SA_PASSWORD,
      MSSQL_PID: 'Developer',
    })
    .withExposedPorts(1433)
    .withWaitStrategy(Wait.forLogMessage('SQL Server is now ready for client connections'))
    .withStartupTimeout(90_000)
    .start();

  const port = startedContainer.getMappedPort(1433);

  // Create the integration test database inside the container via sqlcmd.
  // Retry up to 10 times with 2-second delay: the "ready for client connections"
  // log message can appear before SA login is actually usable.
  let createExitCode: number | undefined;
  let createOutput: string | undefined;
  for (let attempt = 0; attempt < 10; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    const result = await startedContainer.exec([
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
    createExitCode = result.exitCode;
    createOutput = result.output;
    if (createExitCode === 0) break;
  }
  if (createExitCode !== 0) {
    throw new Error(`Failed to create test database after retries: ${createOutput}`);
  }

  const databaseUrl =
    `sqlserver://localhost:${port};database=${TEST_DB};` +
    `user=sa;password=${SA_PASSWORD};encrypt=false;trustServerCertificate=true`;

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
    cwd: process.cwd(),
  });

  await seedFixtures(databaseUrl);

  project.provide('DATABASE_URL', databaseUrl);
}

export async function teardown(): Promise<void> {
  await startedContainer?.stop();
}

async function seedFixtures(databaseUrl: string): Promise<void> {
  const fixturesDir = join(process.cwd(), 'tests', 'fixtures', 'payroll');
  const files = await readdir(fixturesDir).catch(() => [] as string[]);
  const jsonFiles = files.filter((f) => f.endsWith('.json'));
  if (jsonFiles.length === 0) return;

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    for (const file of jsonFiles) {
      const raw = await readFile(join(fixturesDir, file), 'utf-8');
      const records = JSON.parse(raw) as FixtureRecord[];
      for (const r of records) {
        await prisma.laborSchedule.create({
          data: {
            usrSystemCompanyId: r.usrSystemCompanyId,
            employeeCode: r.employeeCode,
            scheduleDate: new Date(r.scheduleDate),
            firstName: r.firstName ?? null,
            lastName: r.lastName ?? null,
            hotelName: r.hotelName ?? null,
            tenant: r.tenant ?? null,
            deptName: r.deptName ?? null,
            positionName: r.positionName ?? null,
            clockIn: r.clockIn ?? null,
            clockOut: r.clockOut ?? null,
            hours: r.hours ?? null,
          },
        });
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}
