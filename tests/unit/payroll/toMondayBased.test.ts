import { describe, it, expect } from 'vitest';
import { toMondayBased } from '@/lib/domain/payroll';

const cases = [
  [0, 6], // JS Sun → Mon-based 6
  [1, 0], // JS Mon → 0
  [2, 1], // JS Tue → 1
  [3, 2], // JS Wed → 2
  [4, 3], // JS Thu → 3
  [5, 4], // JS Fri → 4
  [6, 5], // JS Sat → 5
] as [number, number][];

describe('toMondayBased', () => {
  it.each(cases)('jsDay %i → %i', (jsDay, expected) => {
    expect(toMondayBased(jsDay)).toBe(expected);
  });
});
