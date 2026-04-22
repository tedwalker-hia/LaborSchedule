import { describe, it, expect, vi } from 'vitest';
import { PayrollRepo } from '@/lib/repositories/payroll-repo';

describe('PayrollRepo.findPayrollWindows', () => {
  it('returns empty map without querying for empty codes', async () => {
    const db = { $queryRaw: vi.fn() } as any;
    const repo = new PayrollRepo(db);

    const result = await repo.findPayrollWindows('CO1', []);

    expect(result).toEqual(new Map());
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('returns null window for employee with no payroll rows', async () => {
    const db = { $queryRaw: vi.fn().mockResolvedValue([]) } as any;
    const repo = new PayrollRepo(db);

    const result = await repo.findPayrollWindows('CO1', ['E001']);

    expect(result.get('E001')).toBeNull();
    expect(db.$queryRaw).toHaveBeenCalledOnce();
  });

  it('issues exactly one query for N employees', async () => {
    const db = { $queryRaw: vi.fn().mockResolvedValue([]) } as any;
    const repo = new PayrollRepo(db);

    await repo.findPayrollWindows('CO1', ['E001', 'E002', 'E003']);

    expect(db.$queryRaw).toHaveBeenCalledOnce();
  });

  it('groups rows by employee and builds history', async () => {
    // 2024-01-01 = Monday (jsDay 1 → Monday-based dow 0)
    const rows = [
      { EmployeeCode: 'E001', Date: new Date(2024, 0, 1), Hours: 8 },
      { EmployeeCode: 'E001', Date: new Date(2024, 0, 8), Hours: 8 }, // Mon week 2
      { EmployeeCode: 'E002', Date: new Date(2024, 0, 2), Hours: 6 }, // Tue
    ];
    const db = { $queryRaw: vi.fn().mockResolvedValue(rows) } as any;
    const repo = new PayrollRepo(db);

    const result = await repo.findPayrollWindows('CO1', ['E001', 'E002', 'E003']);

    expect(result.size).toBe(3);

    const e001 = result.get('E001')!;
    expect(e001).not.toBeNull();
    expect(e001.workDays).toContain(0); // Monday
    expect(e001.avgByDow[0]).toBe(8);

    const e002 = result.get('E002')!;
    expect(e002).not.toBeNull();
    expect(e002.workDays).toContain(1); // Tuesday

    expect(result.get('E003')).toBeNull(); // no rows → null
  });

  it('result map contains every requested code regardless of DB rows', async () => {
    const db = {
      $queryRaw: vi
        .fn()
        .mockResolvedValue([{ EmployeeCode: 'E001', Date: new Date(2024, 0, 1), Hours: 8 }]),
    } as any;
    const repo = new PayrollRepo(db);
    const codes = ['E001', 'E002', 'E003'];

    const result = await repo.findPayrollWindows('CO1', codes);

    for (const code of codes) {
      expect(result.has(code)).toBe(true);
    }
  });
});
