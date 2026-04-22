// Pure JWT helpers — no browser globals, safe to import in tests and server code.

export const IDLE_TIMEOUT_S = 30 * 60; // must match lib/session.ts

export function parseJWT(token: string): Record<string, unknown> | null {
  try {
    const base64Url = token.split('.')[1]!;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    return JSON.parse(jsonPayload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Returns ms until the token should be treated as expired on the client side.
 * Uses the lesser of absolute exp and idle expiry (lastActivityAt + 30 min).
 * Pass nowMs for deterministic tests; defaults to Date.now().
 */
export function msUntilExpiry(token: string, nowMs = Date.now()): number {
  const payload = parseJWT(token);
  if (!payload) return 0;

  const exp = payload.exp as number | undefined;
  if (!exp) return 0;

  const absoluteExpMs = exp * 1000;
  const lastActivityAt = payload.lastActivityAt as number | undefined;
  const idleExpMs =
    lastActivityAt != null ? (lastActivityAt + IDLE_TIMEOUT_S) * 1000 : absoluteExpMs;

  return Math.min(absoluteExpMs, idleExpMs) - nowMs;
}
