import type { EmployeeHistory } from './types';

export type { EmployeeHistory };

/** Convert JS getDay() (0=Sun) to 0=Mon..6=Sun. */
export function toMondayBased(jsDay: number): number {
  return (jsDay + 6) % 7;
}

/** ISO 8601 week number for a date. */
export function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Build an EmployeeHistory summary from raw payroll rows.
 * Returns null when rows is empty.
 */
export function buildHistory(rows: { date: Date; hours: number }[]): EmployeeHistory | null {
  if (rows.length === 0) return null;

  const hoursByDow: Record<number, number[]> = {};
  const dowCounts: Record<number, number> = {};
  const weekSet = new Set<string>();

  for (const row of rows) {
    const dow = toMondayBased(row.date.getDay());

    if (!hoursByDow[dow]) hoursByDow[dow] = [];
    hoursByDow[dow].push(row.hours);
    dowCounts[dow] = (dowCounts[dow] || 0) + 1;

    const yr = row.date.getFullYear();
    const wk = isoWeek(row.date);
    weekSet.add(`${yr}-W${wk}`);
  }

  const avgByDow: Record<number, number> = {};
  for (const [dow, hrs] of Object.entries(hoursByDow)) {
    const sum = hrs.reduce((a, b) => a + b, 0);
    avgByDow[Number(dow)] = sum / hrs.length;
  }

  const workDays = Object.keys(dowCounts)
    .map(Number)
    .sort((a, b) => {
      const freqDiff = dowCounts[b]! - dowCounts[a]!;
      if (freqDiff !== 0) return freqDiff;
      return a - b;
    });

  const totalHours = rows.reduce((sum, r) => sum + r.hours, 0);
  const distinctWeeks = weekSet.size;
  const avgWeeklyHours = distinctWeeks > 0 ? totalHours / distinctWeeks : 0;

  return {
    avgByDow,
    workDays,
    avgWeeklyHours,
    totalDaysWorked: rows.length,
    avgDailyHours: totalHours / rows.length,
  };
}
