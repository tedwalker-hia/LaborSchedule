import { describe, it, expect } from 'vitest';
import { buildHistory } from '@/lib/domain/payroll';

describe('buildHistory', () => {
  it('returns null for empty rows', () => {
    expect(buildHistory([])).toBeNull();
  });

  it('single row produces correct summary', () => {
    // 2024-01-01 is a Monday (jsDay=1 → dow=0)
    const result = buildHistory([{ date: new Date(2024, 0, 1), hours: 8 }]);
    expect(result).not.toBeNull();
    expect(result!.avgByDow).toEqual({ 0: 8 });
    expect(result!.workDays).toEqual([0]);
    expect(result!.totalDaysWorked).toBe(1);
    expect(result!.avgDailyHours).toBe(8);
    expect(result!.avgWeeklyHours).toBe(8);
  });

  it('averages hours per DOW across multiple weeks', () => {
    // Two Mondays in different weeks: 8h + 6h → avg 7
    const rows = [
      { date: new Date(2024, 0, 1), hours: 8 }, // Mon week 1
      { date: new Date(2024, 0, 8), hours: 6 }, // Mon week 2
    ];
    const result = buildHistory(rows)!;
    expect(result.avgByDow[0]).toBe(7);
    expect(result.avgWeeklyHours).toBe(7); // 14h / 2 distinct weeks
  });

  it('counts distinct ISO weeks for avgWeeklyHours', () => {
    // Mon + Tue same week: 8+8=16h / 1 week = 16
    const rows = [
      { date: new Date(2024, 0, 1), hours: 8 }, // Mon
      { date: new Date(2024, 0, 2), hours: 8 }, // Tue
    ];
    const result = buildHistory(rows)!;
    expect(result.avgWeeklyHours).toBe(16);
    expect(result.totalDaysWorked).toBe(2);
  });

  it('sorts workDays by frequency descending then index ascending', () => {
    // Mon appears twice, Tue once, Wed once — tie broken by index
    const rows = [
      { date: new Date(2024, 0, 1), hours: 8 }, // Mon week 1
      { date: new Date(2024, 0, 2), hours: 8 }, // Tue week 1
      { date: new Date(2024, 0, 3), hours: 8 }, // Wed week 1
      { date: new Date(2024, 0, 8), hours: 8 }, // Mon week 2
    ];
    const result = buildHistory(rows)!;
    expect(result.workDays[0]).toBe(0); // Mon (freq=2)
    expect(result.workDays[1]).toBe(1); // Tue (freq=1, index < Wed)
    expect(result.workDays[2]).toBe(2); // Wed (freq=1)
  });

  it('handles Sunday correctly (jsDay=0 → dow=6)', () => {
    // 2024-01-07 is a Sunday
    const result = buildHistory([{ date: new Date(2024, 0, 7), hours: 4 }])!;
    expect(result.avgByDow).toEqual({ 6: 4 });
    expect(result.workDays).toEqual([6]);
  });

  it('avgDailyHours = total / count', () => {
    const rows = [
      { date: new Date(2024, 0, 1), hours: 6 },
      { date: new Date(2024, 0, 2), hours: 10 },
    ];
    const result = buildHistory(rows)!;
    expect(result.avgDailyHours).toBe(8);
  });
});
