import { SignJWT, jwtVerify } from 'jose';
import { config } from '@/lib/config';

const JWT_SECRET = new TextEncoder().encode(config.JWT_SECRET);

export const COOKIE_NAME = 'auth-token';
export const ABSOLUTE_TTL_S = 12 * 60 * 60; // 12 hours
const IDLE_TIMEOUT_S = 30 * 60; // 30 minutes

export interface SessionClaims {
  userId: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  mustChangePassword: boolean;
}

export interface TokenPayload extends SessionClaims {
  jti: string;
  issuedAt: number; // unix seconds — login time, absolute TTL anchor
  lastActivityAt: number; // unix seconds — updated on every rotation
  iat: number;
  exp: number;
}

export type VerifyResult =
  | { ok: true; payload: TokenPayload }
  | { ok: false; reason: 'expired' | 'idle' | 'invalid' };

export async function sign(claims: SessionClaims): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const jti = crypto.randomUUID();

  return new SignJWT({
    userId: claims.userId,
    email: claims.email,
    firstName: claims.firstName,
    lastName: claims.lastName,
    role: claims.role,
    mustChangePassword: claims.mustChangePassword,
    issuedAt: now,
    lastActivityAt: now,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(jti)
    .setIssuedAt(now)
    .setExpirationTime(now + ABSOLUTE_TTL_S)
    .sign(JWT_SECRET);
}

export async function verify(token: string): Promise<VerifyResult> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const p = payload as unknown as TokenPayload;

    if (typeof p.issuedAt !== 'number' || typeof p.lastActivityAt !== 'number') {
      return { ok: false, reason: 'invalid' };
    }

    const now = Math.floor(Date.now() / 1000);
    if (now - p.lastActivityAt > IDLE_TIMEOUT_S) {
      return { ok: false, reason: 'idle' };
    }

    return { ok: true, payload: p };
  } catch (err) {
    if (err instanceof Error && err.name === 'JWTExpired') {
      return { ok: false, reason: 'expired' };
    }
    return { ok: false, reason: 'invalid' };
  }
}

export async function rotate(token: string): Promise<string | null> {
  const result = await verify(token);
  if (!result.ok) return null;

  const p = result.payload;
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({
    userId: p.userId,
    email: p.email,
    firstName: p.firstName,
    lastName: p.lastName,
    role: p.role,
    mustChangePassword: p.mustChangePassword,
    issuedAt: p.issuedAt,
    lastActivityAt: now,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(p.jti)
    .setIssuedAt(now)
    .setExpirationTime(p.issuedAt + ABSOLUTE_TTL_S)
    .sign(JWT_SECRET);
}
