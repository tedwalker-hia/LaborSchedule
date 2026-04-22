import { RateLimiterMemory, RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';

// 10 requests / minute per IP
const IP_POINTS = 10;
// 5 requests / minute per email
const EMAIL_POINTS = 5;
const DURATION_S = 60;

function buildLimiters() {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl && process.env.NODE_ENV === 'production') {
    // Dynamic require keeps ioredis out of edge bundles; only imported at runtime in prod
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Redis = require('ioredis');
    const client = new Redis(redisUrl, { enableOfflineQueue: false });

    return {
      byIp: new RateLimiterRedis({
        storeClient: client,
        keyPrefix: 'rl_login_ip',
        points: IP_POINTS,
        duration: DURATION_S,
      }),
      byEmail: new RateLimiterRedis({
        storeClient: client,
        keyPrefix: 'rl_login_email',
        points: EMAIL_POINTS,
        duration: DURATION_S,
      }),
    };
  }

  return {
    byIp: new RateLimiterMemory({ points: IP_POINTS, duration: DURATION_S }),
    byEmail: new RateLimiterMemory({ points: EMAIL_POINTS, duration: DURATION_S }),
  };
}

// Module-level singletons so limiters survive across hot-reloads in dev
const limiters = buildLimiters();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

export async function checkLogin(ip: string, email: string): Promise<RateLimitResult> {
  try {
    await Promise.all([limiters.byIp.consume(ip), limiters.byEmail.consume(email)]);
    return { allowed: true };
  } catch (err) {
    if (err instanceof RateLimiterRes) {
      return { allowed: false, retryAfterMs: err.msBeforeNext };
    }
    throw err;
  }
}
