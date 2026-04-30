import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'healthy', database: 'connected' });
  } catch (error) {
    logger.error({ err: error }, 'Health check failed');
    const detail =
      process.env.HEALTH_DEBUG === 'true'
        ? {
            name: error instanceof Error ? error.name : undefined,
            message: error instanceof Error ? error.message : String(error),
            code: (error as { code?: unknown })?.code,
          }
        : undefined;
    return NextResponse.json(
      { status: 'unhealthy', database: 'disconnected', detail },
      { status: 503 },
    );
  }
}
