import { describe, it, expect } from 'vitest';
import { startTimeForShift } from '@/lib/domain/rules';

const cases = [
  [8, 7],
  [8.5, 7],
  [10, 7],
  [6, 8],
  [7, 8],
  [7.99, 8],
  [5.99, 9],
  [4, 9],
  [1, 9],
  [0.5, 9],
] as [number, number][];

describe('startTimeForShift', () => {
  it.each(cases)('startTimeForShift(%s) = %s', (hours, expected) => {
    expect(startTimeForShift(hours)).toBe(expected);
  });
});
