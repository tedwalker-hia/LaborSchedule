import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/config', () => ({
  config: {
    JWT_SECRET: 'a'.repeat(32),
    DATABASE_URL: 'sqlserver://test',
    NODE_ENV: 'test' as const,
  },
}));

import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { sign, verify } from '@/lib/session';
import { issueToken } from '@/lib/csrf';

const BASE_URL = 'http://localhost:3000';

async function makeRequest(
  path: string,
  method: string,
  token?: string,
  csrfHeader?: string,
): Promise<NextRequest> {
  const url = `${BASE_URL}${path}`;
  const headers = new Headers();
  if (csrfHeader !== undefined) {
    headers.set('x-csrf-token', csrfHeader);
  }
  const req = new NextRequest(url, { method, headers });
  if (token) {
    req.cookies.set('auth-token', token);
  }
  return req;
}

describe('middleware CSRF enforcement', () => {
  let token: string;
  let jti: string;
  let csrfToken: string;

  beforeEach(async () => {
    token = await sign({
      userId: 1,
      email: 'user@example.com',
      firstName: 'Test',
      lastName: 'User',
      role: 'manager',
      mustChangePassword: false,
    });

    const result = await verify(token);
    if (!result.ok) throw new Error('sign/verify failed in test setup');
    jti = result.payload.jti;

    csrfToken = await issueToken(jti);
  });

  it('POST /api/schedules without CSRF token → 403', async () => {
    const req = await makeRequest('/api/schedules', 'POST', token);
    const res = await middleware(req);
    expect(res.status).toBe(403);
  });

  it('POST /api/schedules with invalid CSRF token → 403', async () => {
    const req = await makeRequest('/api/schedules', 'POST', token, 'a'.repeat(64));
    const res = await middleware(req);
    expect(res.status).toBe(403);
  });

  it('POST /api/schedules with valid CSRF token → passes (2xx or 3xx, not 403)', async () => {
    const req = await makeRequest('/api/schedules', 'POST', token, csrfToken);
    const res = await middleware(req);
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });

  it('PUT /api/shifts/1 with valid CSRF token → passes', async () => {
    const req = await makeRequest('/api/shifts/1', 'PUT', token, csrfToken);
    const res = await middleware(req);
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });

  it('DELETE /api/shifts/1 without CSRF token → 403', async () => {
    const req = await makeRequest('/api/shifts/1', 'DELETE', token);
    const res = await middleware(req);
    expect(res.status).toBe(403);
  });

  it('PATCH /api/users/1 without CSRF token → 403', async () => {
    const req = await makeRequest('/api/users/1', 'PATCH', token);
    const res = await middleware(req);
    expect(res.status).toBe(403);
  });

  it('GET /api/schedules without CSRF token → passes (read-only)', async () => {
    const req = await makeRequest('/api/schedules', 'GET', token);
    const res = await middleware(req);
    expect(res.status).not.toBe(403);
  });

  it('POST /api/auth/login without CSRF token → passes (allowlisted)', async () => {
    const req = await makeRequest('/api/auth/login', 'POST');
    const res = await middleware(req);
    expect(res.status).not.toBe(403);
  });

  it('POST /api/health without CSRF token → passes (allowlisted)', async () => {
    const req = await makeRequest('/api/health', 'POST');
    const res = await middleware(req);
    expect(res.status).not.toBe(403);
  });

  it('POST /api/auth/logout without auth token → 401', async () => {
    const req = await makeRequest('/api/auth/logout', 'POST');
    const res = await middleware(req);
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/logout with auth but no CSRF → 403', async () => {
    const req = await makeRequest('/api/auth/logout', 'POST', token);
    const res = await middleware(req);
    expect(res.status).toBe(403);
  });

  it('POST /api/auth/logout with valid CSRF → passes', async () => {
    const req = await makeRequest('/api/auth/logout', 'POST', token, csrfToken);
    const res = await middleware(req);
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });

  it('no auth token on mutating /api/** → 401 (not 403)', async () => {
    const req = await makeRequest('/api/schedules', 'POST');
    const res = await middleware(req);
    expect(res.status).toBe(401);
  });
});

describe('middleware path allowlist — exact match', () => {
  it('GET /change-password without auth → redirects to /login', async () => {
    // /change-password is NOT a public path; unauth requests should be
    // funnelled to /login like any other authenticated page.
    const req = await makeRequest('/change-password', 'GET');
    const res = await middleware(req);
    const isAuthRequired =
      res.status === 401 ||
      (res.status >= 300 &&
        res.status < 400 &&
        (res.headers.get('location') ?? '').includes('/login'));
    expect(isAuthRequired).toBe(true);
  });

  it('GET /change-password-bypass → requires auth (startsWith bypass blocked)', async () => {
    const req = await makeRequest('/change-password-bypass', 'GET');
    const res = await middleware(req);
    // Not public: unauthenticated request must redirect to login (3xx) or 401
    const isAuthRequired =
      res.status === 401 ||
      (res.status >= 300 &&
        res.status < 400 &&
        (res.headers.get('location') ?? '').includes('/login'));
    expect(isAuthRequired).toBe(true);
  });

  it('GET /change-passwordXYZ → requires auth (no prefix match)', async () => {
    const req = await makeRequest('/change-passwordXYZ', 'GET');
    const res = await middleware(req);
    const isAuthRequired =
      res.status === 401 ||
      (res.status >= 300 &&
        res.status < 400 &&
        (res.headers.get('location') ?? '').includes('/login'));
    expect(isAuthRequired).toBe(true);
  });

  it('GET /login → passes (exact public path)', async () => {
    const req = await makeRequest('/login', 'GET');
    const res = await middleware(req);
    expect(res.status).not.toBe(401);
    const location = res.headers.get('location');
    expect(location ?? '').not.toContain('/login?from=');
  });

  it('GET /login-bypass → requires auth', async () => {
    const req = await makeRequest('/login-bypass', 'GET');
    const res = await middleware(req);
    const isAuthRequired =
      res.status === 401 ||
      (res.status >= 300 &&
        res.status < 400 &&
        (res.headers.get('location') ?? '').includes('/login'));
    expect(isAuthRequired).toBe(true);
  });
});
