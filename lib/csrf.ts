import { config } from '@/lib/config';

export const CSRF_COOKIE = 'csrf_token';
export const CSRF_HEADER = 'x-csrf-token';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// /api/auth/login and /api/health are exempt — credentials are the bootstrap auth
const CSRF_SKIP = new Set(['/api/auth/login', '/api/health']);

// Cached in module scope so middleware doesn't re-import the key on every request
let cachedKey: CryptoKey | null = null;

async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  cachedKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(config.JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  return cachedKey;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Returns HMAC-SHA256(jti, JWT_SECRET) as a lowercase hex string. */
export async function issueToken(jti: string): Promise<string> {
  const key = await getKey();
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(jti));
  return toHex(sig);
}

/**
 * Verifies a double-submit CSRF token.
 * Uses crypto.subtle.verify for timing-safe comparison.
 */
export async function verifyToken(token: string, jti: string): Promise<boolean> {
  // HMAC-SHA256 = 32 bytes = 64 hex chars
  if (!token || token.length !== 64) return false;
  try {
    const key = await getKey();
    const sigBytes = Uint8Array.from({ length: 32 }, (_, i) =>
      parseInt(token.slice(i * 2, i * 2 + 2), 16),
    );
    return await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(jti));
  } catch {
    return false;
  }
}

/** Returns true when the request requires CSRF verification. */
export function needsCsrf(method: string, pathname: string): boolean {
  return MUTATING_METHODS.has(method.toUpperCase()) && !CSRF_SKIP.has(pathname);
}
