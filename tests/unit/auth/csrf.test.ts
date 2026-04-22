import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/config', () => ({
  config: {
    JWT_SECRET: 'a'.repeat(32),
    DATABASE_URL: 'sqlserver://test',
    NODE_ENV: 'test' as const,
  },
}));

import { issueToken, verifyToken, needsCsrf, CSRF_COOKIE, CSRF_HEADER } from '@/lib/csrf';

describe('csrf', () => {
  describe('issueToken', () => {
    it('returns a 64-char lowercase hex string', async () => {
      const token = await issueToken('test-jti');
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('deterministic for same jti', async () => {
      const t1 = await issueToken('stable-jti');
      const t2 = await issueToken('stable-jti');
      expect(t1).toBe(t2);
    });

    it('different output for different jti', async () => {
      const t1 = await issueToken('jti-alpha');
      const t2 = await issueToken('jti-beta');
      expect(t1).not.toBe(t2);
    });
  });

  describe('verifyToken', () => {
    it('returns true for valid token', async () => {
      const jti = 'verify-me-jti';
      const token = await issueToken(jti);
      expect(await verifyToken(token, jti)).toBe(true);
    });

    it('returns false for wrong jti', async () => {
      const token = await issueToken('jti-a');
      expect(await verifyToken(token, 'jti-b')).toBe(false);
    });

    it('returns false for tampered token', async () => {
      const jti = 'tamper-jti';
      const token = await issueToken(jti);
      const tampered = token.slice(0, -2) + (token.slice(-2) === '00' ? 'ff' : '00');
      expect(await verifyToken(tampered, jti)).toBe(false);
    });

    it('returns false for empty string', async () => {
      expect(await verifyToken('', 'any-jti')).toBe(false);
    });

    it('returns false for wrong-length token', async () => {
      expect(await verifyToken('abc', 'any-jti')).toBe(false);
      expect(await verifyToken('a'.repeat(63), 'any-jti')).toBe(false);
      expect(await verifyToken('a'.repeat(65), 'any-jti')).toBe(false);
    });
  });

  describe('needsCsrf', () => {
    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s /api/users → true', (method) => {
      expect(needsCsrf(method, '/api/users')).toBe(true);
    });

    it.each(['GET', 'HEAD', 'OPTIONS'])('%s /api/users → false', (method) => {
      expect(needsCsrf(method, '/api/users')).toBe(false);
    });

    it('POST /api/auth/login → false (allowlisted)', () => {
      expect(needsCsrf('POST', '/api/auth/login')).toBe(false);
    });

    it('POST /api/health → false (allowlisted)', () => {
      expect(needsCsrf('POST', '/api/health')).toBe(false);
    });

    it('case-insensitive method', () => {
      expect(needsCsrf('post', '/api/data')).toBe(true);
      expect(needsCsrf('Post', '/api/data')).toBe(true);
    });
  });

  describe('constants', () => {
    it('CSRF_COOKIE is csrf_token', () => {
      expect(CSRF_COOKIE).toBe('csrf_token');
    });

    it('CSRF_HEADER is x-csrf-token', () => {
      expect(CSRF_HEADER).toBe('x-csrf-token');
    });
  });
});
