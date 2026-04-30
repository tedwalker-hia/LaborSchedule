/**
 * Smoke test — verifies the Testcontainers harness itself:
 * - DATABASE_URL was injected into the worker
 * - Prisma can connect and query
 * - Migrations ran (tables exist)
 * - Fixtures were seeded
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient;

beforeAll(() => {
  prisma = new PrismaClient();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Testcontainers MSSQL harness', () => {
  it('DATABASE_URL is set in the worker environment', () => {
    expect(process.env.DATABASE_URL).toBeTruthy();
    expect(process.env.DATABASE_URL).toContain('LaborScheduleIntTest');
  });

  it('Prisma connects and the migrations table exists', async () => {
    // $queryRaw succeeds only when DB + migrations are up
    const rows = await prisma.$queryRaw<{ name: string }[]>`
      SELECT name FROM sys.tables WHERE name = '_prisma_migrations'
    `;
    expect(rows.length).toBe(1);
  });

  it('HIALaborSchedules table exists after migrations', async () => {
    const rows = await prisma.$queryRaw<{ name: string }[]>`
      SELECT name FROM sys.tables WHERE name = 'HIALaborSchedules'
    `;
    expect(rows.length).toBe(1);
  });

  it('fixture records were seeded', async () => {
    const count = await prisma.laborSchedule.count({
      where: { usrSystemCompanyId: 'TESTCO' },
    });
    expect(count).toBeGreaterThan(0);
  });

  it('seeded employees E001 and E002 are present', async () => {
    const codes = await prisma.laborSchedule
      .findMany({
        where: { usrSystemCompanyId: 'TESTCO' },
        select: { employeeCode: true },
        distinct: ['employeeCode'],
      })
      .then((rows) => rows.map((r) => r.employeeCode).sort());
    expect(codes).toEqual(['E001', 'E002']);
  });
});
