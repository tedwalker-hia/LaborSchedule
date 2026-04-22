import { describe, it, expect } from 'vitest';
import { parseJWT, msUntilExpiry, IDLE_TIMEOUT_S } from '@/lib/auth-utils';

function makeToken(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `header.${encoded}.signature`;
}

const NOW_S = 1_700_000_000;
const NOW_MS = NOW_S * 1000;

describe('parseJWT', () => {
  it('decodes payload from valid-shaped token', () => {
    const payload = { userId: 42, email: 'a@b.com', exp: NOW_S + 3600 };
    const result = parseJWT(makeToken(payload));
    expect(result).toMatchObject(payload);
  });

  it('returns null for malformed token', () => {
    expect(parseJWT('not.a.jwt')).toBeNull();
    expect(parseJWT('')).toBeNull();
  });
});

describe('msUntilExpiry', () => {
  it('returns positive ms when token is valid', () => {
    const exp = NOW_S + 3600;
    const lastActivityAt = NOW_S;
    const token = makeToken({ exp, lastActivityAt });
    const ms = msUntilExpiry(token, NOW_MS);
    // idleExpiry = (NOW_S + IDLE_TIMEOUT_S) * 1000, absoluteExpiry = (NOW_S + 3600) * 1000
    const expectedIdleExpMs = (NOW_S + IDLE_TIMEOUT_S) * 1000;
    const expectedAbsExpMs = exp * 1000;
    expect(ms).toBe(Math.min(expectedAbsExpMs, expectedIdleExpMs) - NOW_MS);
  });

  it('returns 0 for expired token', () => {
    const token = makeToken({ exp: NOW_S - 1, lastActivityAt: NOW_S - 3600 });
    expect(msUntilExpiry(token, NOW_MS)).toBeLessThanOrEqual(0);
  });

  it('uses idle expiry when sooner than absolute exp', () => {
    // Token expires in 2h absolute but last activity was 31 min ago → idle wins
    const lastActivityAt = NOW_S - 31 * 60;
    const exp = NOW_S + 2 * 3600;
    const token = makeToken({ exp, lastActivityAt });
    const ms = msUntilExpiry(token, NOW_MS);
    const idleExpMs = (lastActivityAt + IDLE_TIMEOUT_S) * 1000;
    expect(ms).toBe(idleExpMs - NOW_MS); // negative (already idle)
    expect(ms).toBeLessThan(0);
  });

  it('uses absolute exp when sooner than idle expiry', () => {
    // Active 1 min ago but absolute exp in 5 min
    const lastActivityAt = NOW_S - 60;
    const exp = NOW_S + 5 * 60;
    const token = makeToken({ exp, lastActivityAt });
    const ms = msUntilExpiry(token, NOW_MS);
    expect(ms).toBe(exp * 1000 - NOW_MS);
  });

  it('falls back to absolute exp when lastActivityAt absent', () => {
    const exp = NOW_S + 3600;
    const token = makeToken({ exp });
    const ms = msUntilExpiry(token, NOW_MS);
    expect(ms).toBe(exp * 1000 - NOW_MS);
  });

  it('returns 0 for invalid token', () => {
    expect(msUntilExpiry('bad.token', NOW_MS)).toBe(0);
  });
});
