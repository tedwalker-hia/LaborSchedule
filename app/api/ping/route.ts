import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    node: process.version,
    env: {
      hasJwtSecret: typeof process.env.JWT_SECRET === 'string' && process.env.JWT_SECRET.length > 0,
      jwtSecretLen: (process.env.JWT_SECRET ?? '').length,
      hasDatabaseUrl:
        typeof process.env.DATABASE_URL === 'string' && process.env.DATABASE_URL.length > 0,
      databaseUrlLen: (process.env.DATABASE_URL ?? '').length,
      nodeEnv: process.env.NODE_ENV ?? null,
      auditEnabled: process.env.AUDIT_ENABLED ?? null,
    },
  });
}
