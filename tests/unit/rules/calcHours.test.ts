import { describe, it, expect } from 'vitest';
import { calcHours } from '@/lib/domain/rules';

const cases = [
  ['9:00 AM', '5:00 PM', 8],
  ['7:00 AM', '3:30 PM', 8.5],
  ['12:00 PM', '12:00 PM', 0],
  ['10:00 PM', '6:00 AM', 8],
  ['11:00 PM', '7:00 AM', 8],
  ['12:00 AM', '8:00 AM', 8],
  ['9:00 AM', '9:15 AM', 0.25],
  ['1:00 PM', '1:30 PM', 0.5],
  ['6:00 AM', '2:00 PM', 8],
  ['8:00 AM', '4:45 PM', 8.75],
] as [string, string, number][];

describe('calcHours', () => {
  it.each(cases)('calcHours(%s, %s) = %s', (clockIn, clockOut, expected) => {
    expect(calcHours(clockIn, clockOut)).toBe(expected);
  });

  it('same start and end returns 0 not 24', () => {
    expect(calcHours('12:00 PM', '12:00 PM')).toBe(0);
  });

  it('overnight shift wraps past midnight', () => {
    expect(calcHours('10:00 PM', '6:00 AM')).toBe(8);
  });

  it.each([
    ['', '5:00 PM'],
    ['9:00 AM', ''],
    ['not-a-time', '5:00 PM'],
    ['9:00 AM', 'not-a-time'],
    ['13:00 AM', '5:00 PM'],
    ['9:00 AM', '0:00 PM'],
  ] as [string, string][])('returns null for invalid input (%s, %s)', (clockIn, clockOut) => {
    expect(calcHours(clockIn, clockOut)).toBeNull();
  });
});
