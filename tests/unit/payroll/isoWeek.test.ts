import { describe, it, expect } from 'vitest';
import { isoWeek } from '@/lib/domain/payroll';

const cases = [
  // [year, month (0-based), day, expectedWeek]
  [2024, 0, 1, 1], // 2024-01-01 is Mon, week 1
  [2024, 0, 7, 1], // 2024-01-07 is Sun, week 1
  [2024, 0, 8, 2], // 2024-01-08 is Mon, week 2
  [2023, 11, 31, 52], // 2023-12-31 is Sun, week 52
  [2020, 11, 28, 53], // 2020-12-28 is Mon, ISO week 53
  [2021, 0, 3, 53], // 2021-01-03 belongs to ISO week 53 of 2020
  [2021, 0, 4, 1], // 2021-01-04 is Mon, first ISO week of 2021
] as [number, number, number, number][];

describe('isoWeek', () => {
  it.each(cases)('%i-%i-%i → week %i', (year, month, day, expected) => {
    expect(isoWeek(new Date(year, month, day))).toBe(expected);
  });
});
