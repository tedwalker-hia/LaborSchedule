/**
 * Integration tests for PayrollService.
 *
 * seed() tests: use HIALaborSchedules (always present after migrations).
 *
 * listTenants() / listEmployees() / getHistory() tests: require BI_Payroll
 * and HIA_BIOrganizationName tables. These are created as lightweight fixture
 * tables in beforeAll and dropped in afterAll, so they exist only for the
 * duration of this suite.
 *
 * Isolation: schedule rows use usrSystemCompanyId = 'INTTEST_PAY'.
 * BI_Payroll rows use UsrSystemCompanyID = 'INTTEST_BI'.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PayrollService } from '@/lib/services/payroll-service';
import { makePayrollRepo } from '@/lib/repositories/payroll-repo';

const COMPANY_SEED = 'INTTEST_PAY';
const COMPANY_BI = 'INTTEST_BI';

let prisma: PrismaClient;
let svc: PayrollService;

beforeAll(async () => {
  prisma = new PrismaClient();
  const repo = makePayrollRepo(prisma as any);
  svc = new PayrollService(repo, prisma);

  // Create lightweight BI tables for listTenants / listEmployees / getHistory tests.
  // Uses $executeRawUnsafe so we can embed IF NOT EXISTS guards.
  await prisma.$executeRawUnsafe(`
    IF OBJECT_ID('BI_Payroll', 'U') IS NULL
    CREATE TABLE BI_Payroll (
      UsrSystemCompanyID NVARCHAR(100),
      EmployeeCode       NVARCHAR(50),
      FirstName          NVARCHAR(100),
      LastName           NVARCHAR(100),
      DeptName           NVARCHAR(200),
      PositionName       NVARCHAR(200),
      EarningCode        NVARCHAR(50),
      Hours              DECIMAL(10,2),
      [Date]             DATE,
      BranchID           INT
    )
  `);

  await prisma.$executeRawUnsafe(`
    IF OBJECT_ID('HIA_BIOrganizationName', 'U') IS NULL
    CREATE TABLE HIA_BIOrganizationName (
      UsrSystemCompanyID NVARCHAR(100),
      OrganizationName   NVARCHAR(200),
      HotelName          NVARCHAR(200)
    )
  `);

  // Seed BI_Payroll fixture rows (recent dates so the WHERE Date >= DATEADD(-14) filter passes)
  await prisma.$executeRawUnsafe(`
    INSERT INTO BI_Payroll
      (UsrSystemCompanyID, EmployeeCode, FirstName, LastName, DeptName, PositionName, EarningCode, Hours, [Date], BranchID)
    VALUES
      ('${COMPANY_BI}', 'EBI01', 'Alice', 'Smith', 'Front Office', 'Receptionist', 'REGULAR', 8.0, CAST(GETDATE() AS DATE), 1),
      ('${COMPANY_BI}', 'EBI01', 'Alice', 'Smith', 'Front Office', 'Receptionist', 'REGULAR', 8.0, CAST(DATEADD(day, -1, GETDATE()) AS DATE), 1),
      ('${COMPANY_BI}', 'EBI02', 'Bob',   'Jones', 'Housekeeping', 'Housekeeper',  'REGULAR', 6.0, CAST(GETDATE() AS DATE), 1)
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO HIA_BIOrganizationName (UsrSystemCompanyID, OrganizationName, HotelName)
    VALUES ('${COMPANY_BI}', 'Test Org', 'Test Hotel BI')
  `);
});

afterAll(async () => {
  // Drop BI fixture tables
  await prisma.$executeRawUnsafe(
    `IF OBJECT_ID('BI_Payroll', 'U') IS NOT NULL DROP TABLE BI_Payroll`,
  );
  await prisma.$executeRawUnsafe(
    `IF OBJECT_ID('HIA_BIOrganizationName', 'U') IS NOT NULL DROP TABLE HIA_BIOrganizationName`,
  );

  // Clean schedule rows
  await prisma.laborSchedule.deleteMany({ where: { usrSystemCompanyId: COMPANY_SEED } });

  await prisma.$disconnect();
});

// ─── seed ────────────────────────────────────────────────────────────────────

describe('PayrollService.seed', () => {
  it('inserts employees into HIALaborSchedules', async () => {
    const result = await svc.seed({
      usrSystemCompanyId: COMPANY_SEED,
      hotelName: 'Seed Hotel',
      tenant: 'TestTenant',
      employees: [
        { code: 'ESEED01', firstName: 'Carol', lastName: 'Seed', deptName: 'F&B' },
        { code: 'ESEED02', firstName: 'Dave', lastName: 'Seed', deptName: 'Housekeeping' },
      ],
    });

    expect(result.seeded).toBe(2);
    expect(result.skipped).toBe(0);

    const rows = await prisma.laborSchedule.findMany({
      where: { usrSystemCompanyId: COMPANY_SEED },
      select: { employeeCode: true },
    });
    const codes = rows.map((r) => r.employeeCode).sort();
    expect(codes).toContain('ESEED01');
    expect(codes).toContain('ESEED02');
  });

  it('is idempotent — running twice produces no duplicate rows', async () => {
    const params = {
      usrSystemCompanyId: COMPANY_SEED,
      employees: [{ code: 'ESEED03', firstName: 'Eve', lastName: 'Idem' }],
    };

    const first = await svc.seed(params);
    expect(first.seeded).toBe(1);
    expect(first.skipped).toBe(0);

    const second = await svc.seed(params);
    expect(second.seeded).toBe(0);
    expect(second.skipped).toBe(1);

    const count = await prisma.laborSchedule.count({
      where: { usrSystemCompanyId: COMPANY_SEED, employeeCode: 'ESEED03' },
    });
    expect(count).toBe(1);
  });

  it('treats employees with different positionNames as distinct rows', async () => {
    const base = { usrSystemCompanyId: COMPANY_SEED };
    const emp = { code: 'ESEED04', firstName: 'Frank', lastName: 'Multi' };

    const r1 = await svc.seed({ ...base, employees: [{ ...emp, positionName: 'Manager' }] });
    const r2 = await svc.seed({ ...base, employees: [{ ...emp, positionName: 'Supervisor' }] });

    expect(r1.seeded).toBe(1);
    expect(r2.seeded).toBe(1);

    const count = await prisma.laborSchedule.count({
      where: { usrSystemCompanyId: COMPANY_SEED, employeeCode: 'ESEED04' },
    });
    expect(count).toBe(2);
  });
});

// ─── listTenants ─────────────────────────────────────────────────────────────

describe('PayrollService.listTenants', () => {
  it('returns tenants joined from BI_Payroll + HIA_BIOrganizationName', async () => {
    const tenants = await svc.listTenants();

    const match = tenants.find((t) => t.usrSystemCompanyId === COMPANY_BI);
    expect(match).toBeDefined();
    expect(match!.hotelName).toBe('Test Hotel BI');
    expect(match!.tenant).toBe('Test Org');
  });
});

// ─── listEmployees ────────────────────────────────────────────────────────────

describe('PayrollService.listEmployees', () => {
  it('returns employees from BI_Payroll within the last 14 days', async () => {
    const employees = await svc.listEmployees({ usrSystemCompanyId: COMPANY_BI });

    const codes = employees.map((e) => e.employeeCode);
    expect(codes).toContain('EBI01');
    expect(codes).toContain('EBI02');
  });
});

// ─── getHistory ───────────────────────────────────────────────────────────────

describe('PayrollService.getHistory', () => {
  it('returns null for unknown employee', async () => {
    const history = await svc.getHistory({
      usrSystemCompanyId: COMPANY_BI,
      employeeCode: 'UNKNOWN',
    });
    expect(history).toBeNull();
  });

  it('returns history object for known employee with recent hours', async () => {
    // EBI01 has 2 rows in BI_Payroll (both within last 30 days)
    const history = await svc.getHistory({ usrSystemCompanyId: COMPANY_BI, employeeCode: 'EBI01' });
    expect(history).not.toBeNull();
    expect(history!.avgWeeklyHours).toBeGreaterThan(0);
  });
});
