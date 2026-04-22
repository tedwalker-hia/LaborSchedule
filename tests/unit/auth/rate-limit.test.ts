import { describe, it, expect, vi, beforeEach } from 'vitest';

const consumeMock = vi.hoisted(() => vi.fn());

vi.mock('rate-limiter-flexible', () => {
  class RateLimiterMemory {
    consume = consumeMock;
  }
  class RateLimiterRedis {
    consume = consumeMock;
  }
  class RateLimiterRes extends Error {
    msBeforeNext: number;
    constructor(msBeforeNext: number) {
      super('Rate limit exceeded');
      this.msBeforeNext = msBeforeNext;
    }
  }
  return { RateLimiterMemory, RateLimiterRedis, RateLimiterRes };
});

vi.mock('@/lib/config', () => ({
  config: {
    JWT_SECRET: 'a'.repeat(32),
    DATABASE_URL: 'sqlserver://test',
    NODE_ENV: 'test' as const,
  },
}));

import { checkLogin } from '@/lib/rate-limit';
import { RateLimiterRes } from 'rate-limiter-flexible';

describe('checkLogin', () => {
  beforeEach(() => {
    consumeMock.mockReset();
  });

  it('returns allowed:true when both limiters pass', async () => {
    consumeMock.mockResolvedValue(undefined);
    const result = await checkLogin('1.2.3.4', 'user@example.com');
    expect(result).toEqual({ allowed: true });
    expect(consumeMock).toHaveBeenCalledTimes(2);
  });

  it('returns allowed:false with retryAfterMs when IP limiter rejects', async () => {
    const rlRes = new RateLimiterRes(45_000);
    consumeMock.mockRejectedValue(rlRes);
    const result = await checkLogin('1.2.3.4', 'user@example.com');
    expect(result).toEqual({ allowed: false, retryAfterMs: 45_000 });
  });

  it('returns allowed:false with retryAfterMs when email limiter rejects', async () => {
    const rlRes = new RateLimiterRes(30_000);
    consumeMock
      .mockResolvedValueOnce(undefined) // IP passes
      .mockRejectedValueOnce(rlRes); // email fails
    const result = await checkLogin('5.6.7.8', 'other@example.com');
    expect(result).toEqual({ allowed: false, retryAfterMs: 30_000 });
  });

  it('rethrows unexpected errors', async () => {
    consumeMock.mockRejectedValue(new Error('redis down'));
    await expect(checkLogin('1.2.3.4', 'user@example.com')).rejects.toThrow('redis down');
  });
});
