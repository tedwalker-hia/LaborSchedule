import { describe, it, expect } from 'vitest';
import { validatePassword } from '@/lib/domain/rules';

describe('validatePassword', () => {
  it.each(['Secure1!', 'MyP@ssword9', 'Abcdefg1#', 'Aa1!bbbb'])('valid: "%s"', (password) => {
    expect(validatePassword(password)).toHaveLength(0);
  });

  it.each([
    ['Ab1!', 'too short (4 chars)'],
    ['A1!', 'too short (3 chars)'],
  ] as [string, string][])('fails min length: "%s" (%s)', (password) => {
    const issues = validatePassword(password);
    expect(issues.some((i) => i.message === 'At least 8 characters')).toBe(true);
  });

  it('fails when missing uppercase', () => {
    const issues = validatePassword('secure1!abc');
    expect(issues.some((i) => i.message === 'At least one uppercase letter')).toBe(true);
  });

  it('fails when missing number', () => {
    const issues = validatePassword('SecureABC!');
    expect(issues.some((i) => i.message === 'At least one number')).toBe(true);
  });

  it('fails when missing special character', () => {
    const issues = validatePassword('Secure123abc');
    expect(issues.some((i) => i.message === 'At least one special character')).toBe(true);
  });

  it('reports multiple issues for all-lowercase short password', () => {
    const issues = validatePassword('abc');
    expect(issues.length).toBeGreaterThanOrEqual(3);
  });
});
