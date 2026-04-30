import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function inspectDbUrl(url: string | undefined) {
  if (!url) return { present: false };
  const sha256 = createHash('sha256').update(url).digest('hex').slice(0, 16);
  // Heuristic parse — works for sqlserver://host:port;k=v;... shape.
  const after = url.replace(/^sqlserver:\/\//, '');
  const [hostPort, ...kvs] = after.split(';');
  const params: Record<string, string> = {};
  for (const kv of kvs) {
    const eq = kv.indexOf('=');
    if (eq > 0) params[kv.slice(0, eq)] = kv.slice(eq + 1);
  }
  const pwd = params.password ?? '';
  return {
    present: true,
    length: url.length,
    sha256_first16: sha256,
    hostPort,
    user: params.user ?? null,
    database: params.database ?? null,
    encrypt: params.encrypt ?? null,
    trustServerCertificate: params.trustServerCertificate ?? null,
    password_length: pwd.length,
    password_last4: pwd.length >= 4 ? pwd.slice(-4) : null,
    contains_literal_hash: url.includes('#'),
    contains_literal_question: url.includes('?'),
  };
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    node: process.version,
    env: {
      hasJwtSecret: typeof process.env.JWT_SECRET === 'string' && process.env.JWT_SECRET.length > 0,
      jwtSecretLen: (process.env.JWT_SECRET ?? '').length,
      hasDatabaseUrl:
        typeof process.env.DATABASE_URL === 'string' && process.env.DATABASE_URL.length > 0,
      nodeEnv: process.env.NODE_ENV ?? null,
      auditEnabled: process.env.AUDIT_ENABLED ?? null,
      databaseUrl:
        process.env.HEALTH_DEBUG === 'true'
          ? inspectDbUrl(process.env.DATABASE_URL)
          : { present: !!process.env.DATABASE_URL },
    },
  });
}
