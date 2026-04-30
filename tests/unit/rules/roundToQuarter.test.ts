import { describe, it, expect } from 'vitest';
import { roundToQuarter } from '@/lib/domain/rules';

const cases = [
  [8, 8],
  [8.25, 8.25],
  [8.5, 8.5],
  [8.75, 8.75],
  [8.1, 8],
  [8.13, 8.25],
  [8.4, 8.5],
  [8.6, 8.5],
  [8.9, 9],
  [0.12, 0],
  [0.13, 0.25],
  [7.37, 7.25],
  [7.38, 7.5],
] as [number, number][];

describe('roundToQuarter', () => {
  it.each(cases)('roundToQuarter(%s) = %s', (input, expected) => {
    expect(roundToQuarter(input)).toBe(expected);
  });
});
