import { describe, it, expect } from 'vitest';
import { shouldScheduleDow } from '@/lib/domain/rules';

const cases = [
  [0.5, true],
  [1, true],
  [8, true],
  [0.49, false],
  [0, false],
  [0.1, false],
  [-1, false],
] as [number, boolean][];

describe('shouldScheduleDow', () => {
  it.each(cases)('shouldScheduleDow(%s) = %s', (avgHours, expected) => {
    expect(shouldScheduleDow(avgHours)).toBe(expected);
  });
});
