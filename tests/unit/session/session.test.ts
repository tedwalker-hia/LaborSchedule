import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sign, verify, rotate, type SessionClaims } from '@/lib/session';

const baseClaims: SessionClaims = {
  userId: 1,
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  role: 'manager',
  mustChangePassword: false,
};

describe('session', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('sign + verify', () => {
    it('issues verifiable token with expected claims', async () => {
      const token = await sign(baseClaims);
      const result = await verify(token);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.payload.userId).toBe(1);
      expect(result.payload.email).toBe('test@example.com');
      expect(result.payload.firstName).toBe('Test');
      expect(result.payload.role).toBe('manager');
      expect(result.payload.jti).toBeTruthy();
      const now = Math.floor(Date.now() / 1000);
      expect(result.payload.issuedAt).toBe(now);
      expect(result.payload.lastActivityAt).toBe(now);
    });

    it('returns invalid for tampered token', async () => {
      const result = await verify('not.a.valid.token');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('invalid');
    });

    it('each token gets a unique jti', async () => {
      const t1 = await sign(baseClaims);
      const t2 = await sign(baseClaims);
      const r1 = await verify(t1);
      const r2 = await verify(t2);
      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
      if (!r1.ok || !r2.ok) return;
      expect(r1.payload.jti).not.toBe(r2.payload.jti);
    });
  });

  describe('idle timeout', () => {
    it('valid at 29 minutes', async () => {
      const token = await sign(baseClaims);
      vi.advanceTimersByTime(29 * 60 * 1000);
      const result = await verify(token);
      expect(result.ok).toBe(true);
    });

    it('idle after 30+ minutes without rotation', async () => {
      const token = await sign(baseClaims);
      vi.advanceTimersByTime(31 * 60 * 1000);
      const result = await verify(token);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('idle');
    });
  });

  describe('absolute TTL', () => {
    it('expired after 12h regardless of activity', async () => {
      const token = await sign(baseClaims);
      vi.advanceTimersByTime((12 * 60 + 1) * 60 * 1000);
      const result = await verify(token);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('expired');
    });

    it('still valid just before 12h', async () => {
      let currentToken = await sign(baseClaims);
      // Rotate every 25 min to keep idle timer fresh; 28 steps = 700 min (11h40m) — within absolute TTL
      for (let i = 0; i < 28; i++) {
        vi.advanceTimersByTime(25 * 60 * 1000);
        const next = await rotate(currentToken);
        expect(next).not.toBeNull();
        currentToken = next!;
      }
      const result = await verify(currentToken);
      expect(result.ok).toBe(true);
    });
  });

  describe('rotate', () => {
    it('returns new token with fresh lastActivityAt', async () => {
      const token = await sign(baseClaims);
      vi.advanceTimersByTime(5 * 60 * 1000); // 5 minutes
      const rotated = await rotate(token);

      expect(rotated).not.toBeNull();
      const result = await verify(rotated!);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const now = Math.floor(Date.now() / 1000);
      expect(result.payload.lastActivityAt).toBe(now);
    });

    it('preserves issuedAt across rotations', async () => {
      const token = await sign(baseClaims);
      const orig = await verify(token);
      expect(orig.ok).toBe(true);
      if (!orig.ok) return;
      const originalIssuedAt = orig.payload.issuedAt;

      vi.advanceTimersByTime(5 * 60 * 1000);
      const rotated = await rotate(token);
      const rotResult = await verify(rotated!);
      expect(rotResult.ok).toBe(true);
      if (!rotResult.ok) return;
      expect(rotResult.payload.issuedAt).toBe(originalIssuedAt);
    });

    it('preserves jti across rotations', async () => {
      const token = await sign(baseClaims);
      const orig = await verify(token);
      expect(orig.ok).toBe(true);
      if (!orig.ok) return;

      vi.advanceTimersByTime(5 * 60 * 1000);
      const rotated = await rotate(token);
      const rotResult = await verify(rotated!);
      expect(rotResult.ok).toBe(true);
      if (!rotResult.ok) return;
      expect(rotResult.payload.jti).toBe(orig.payload.jti);
    });

    it('respects absolute TTL anchored to original issuedAt', async () => {
      const token = await sign(baseClaims);

      // Rotate at 5m so idle doesn't expire it
      vi.advanceTimersByTime(5 * 60 * 1000);
      const rotated = await rotate(token);
      expect(rotated).not.toBeNull();

      // Advance past 12h from original issuedAt (12h+1m total − 5m already elapsed = 11h56m remaining)
      // JWT exp = issuedAt + 12h fires before idle check, so reason is 'expired' not 'idle'
      vi.advanceTimersByTime((12 * 60 + 1 - 5) * 60 * 1000);
      const result = await verify(rotated!);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('expired');
    });

    it('returns null if token is already idle', async () => {
      const token = await sign(baseClaims);
      vi.advanceTimersByTime(31 * 60 * 1000);
      const rotated = await rotate(token);
      expect(rotated).toBeNull();
    });

    it('returns null if token is expired', async () => {
      const token = await sign(baseClaims);
      vi.advanceTimersByTime((12 * 60 + 1) * 60 * 1000);
      const rotated = await rotate(token);
      expect(rotated).toBeNull();
    });
  });
});
