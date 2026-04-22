import { describe, it, expect } from 'vitest';
import { cleanDeptName } from '@/lib/domain/rules';

const cases = [
  ['Hotel/Food & Beverage/Outlet', 'Food & Beverage'],
  ['Hotel/Housekeeping/Floor', 'Housekeeping'],
  ['Hotel/Administrati/Office', 'Administration'],
  ['Administrati', 'Administration'],
  ['Comp Food', 'Comp Food & Beverage'],
  ['Comp Food Service', 'Comp Food & Beverage'],
  ['Hotel/Comp Food/Bar', 'Comp Food & Beverage'],
  ['Front Desk', 'Front Desk'],
  ['  Spa  ', 'Spa'],
  ['A/B', 'A/B'],
  ['Single', 'Single'],
] as [string, string][];

describe('cleanDeptName', () => {
  it.each(cases)('cleanDeptName(%s) = %s', (input, expected) => {
    expect(cleanDeptName(input)).toBe(expected);
  });
});
